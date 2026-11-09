
import { useEffect, useState, useCallback, useRef } from 'react'; // Importar useRef
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getOfflineReports, setOfflineReports } from '../services/offlineManager';
import { submitReport } from '../services/api';

const MAX_IMAGE_CHARS = 900000;
const MAX_TOTAL_IMAGE_CHARS = 950000;

// Hook personalizado para manejar la lógica de sincronización
const sanitizeImagesForSync = (images) => {
  if (!Array.isArray(images) || images.length == 0) {
    return { images, dropped: false };
  }

  const totalSize = images.reduce((sum, img) => sum + (img ? img.length : 0), 0);
  if (totalSize <= MAX_TOTAL_IMAGE_CHARS) {
    return { images, dropped: false };
  }

  const firstOk = images.find((img) => (img ? img.length : 0) <= MAX_IMAGE_CHARS);
  return { images: firstOk ? [firstOk] : [], dropped: true };
};

export const useSyncManager = (setNotification) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const isConnected = useNetworkStatus();
  const isFocused = useIsFocused(); // Para resincronizar cuando la pantalla vuelve a tener foco
  const previousConnectionStatus = useRef(isConnected); // Para rastrear el estado de conexión anterior

  const syncReports = useCallback(async () => {
    if (isSyncing || !isConnected) return;

    setIsSyncing(true);
    let offlineReports = await getOfflineReports();

    if (offlineReports.length === 0) {
      setIsSyncing(false);
      return;
    }

    // --- DE-DUPLICACIÓN POR CONTENIDO (Para limpiar reportes "atrapados" antiguos) ---
    // Si hay varios reportes idénticos (mismo título, descripción y lugar), nos quedamos solo con uno.
    const uniqueReports = [];
    const seen = new Set();

    for (const report of offlineReports) {
      // Creamos una clave basada en el contenido para identificar duplicados
      const contentKey = `${report.title}|${report.location}|${report.description}|${report.reporterName}`.toLowerCase();
      if (!seen.has(contentKey)) {
        seen.add(contentKey);
        uniqueReports.push(report);
      } else {
        console.log("🗑️ Eliminando duplicado local por contenido:", report.title);
      }
    }

    // Si se eliminaron duplicados, actualizamos el almacenamiento local inmediatamente
    if (uniqueReports.length < offlineReports.length) {
      offlineReports = uniqueReports;
      await setOfflineReports(offlineReports);
    }
    // --------------------------------------------------------------------------------

    setNotification(`Sincronizando ${offlineReports.length} reporte(s)...`);

    const successfullySynced = [];
    const failedToSync = [];
    let droppedImageReports = 0;

    for (const report of offlineReports) {
      try {
        // Enviar el reporte completo (que ya incluye clientReportId si se guardó recientemente)
        // o mapear offlineId a clientReportId si es un reporte antiguo
        const reportToSend = { ...report };

        // Asegurar que clientReportId esté presente (usando offlineId como fallback para retrocompatibilidad)
        if (!reportToSend.clientReportId) {
          reportToSend.clientReportId = report.offlineId;
        }

        // Quitar campos locales antes de enviar
        const { offlineId, savedAt, ...cleanReport } = reportToSend;

        const sanitized = sanitizeImagesForSync(cleanReport.images);
        if (sanitized.dropped) {
          cleanReport.images = sanitized.images;
          droppedImageReports += 1;
        }
        await submitReport(cleanReport);
        successfullySynced.push(report.offlineId);
      } catch (error) {
        console.error('Fallo al sincronizar reporte:', report.offlineId, error);
        failedToSync.push(report);
      }
    }

    if (successfullySynced.length > 0) {
      const remainingReports = offlineReports.filter(
        (report) => !successfullySynced.includes(report.offlineId)
      );
      await setOfflineReports(remainingReports);
      setNotification(
        `${successfullySynced.length} reporte(s) sincronizado(s) con éxito.`
      );
    } else if (failedToSync.length > 0 && offlineReports.length > 0) {
      setNotification('Fallo la sincronización. Se intentará más tarde.');
    }

    setIsSyncing(false);
  }, [isSyncing, isConnected, setNotification]);

  // Efecto para sincronización automática
  useEffect(() => {
    // Sincronizar cuando la conexión se recupera (de offline a online)
    if (isConnected && !previousConnectionStatus.current) {
      syncReports();
    }
    // Actualizar el estado de conexión anterior
    previousConnectionStatus.current = isConnected;

    // Listener para sincronizar cuando la app pasa de background a foreground (si hay conexión)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isConnected) {
        syncReports();
      }
    });

    return () => {
      subscription.remove();
    };

  }, [isConnected, syncReports]); // Eliminar isFocused de las dependencias para el sync automático

  return { isSyncing, syncReports };
};
