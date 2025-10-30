
import { useEffect, useState, useCallback, useRef } from 'react'; // Importar useRef
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getOfflineReports, setOfflineReports } from '../services/offlineManager';
import { submitReport } from '../services/api';

// Hook personalizado para manejar la lógica de sincronización
export const useSyncManager = (setNotification) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const isConnected = useNetworkStatus();
  const isFocused = useIsFocused(); // Para resincronizar cuando la pantalla vuelve a tener foco
  const previousConnectionStatus = useRef(isConnected); // Para rastrear el estado de conexión anterior

  const syncReports = useCallback(async () => {
    if (isSyncing || !isConnected) return;

    setIsSyncing(true);
    const offlineReports = await getOfflineReports();

    if (offlineReports.length === 0) {
      setIsSyncing(false);
      return;
    }

    setNotification(`Sincronizando ${offlineReports.length} reporte(s)...`);

    const successfullySynced = [];
    const failedToSync = [];

    for (const report of offlineReports) {
      try {
        // Quitar el offlineId antes de enviar al backend
        const { offlineId, ...reportToSend } = report;
        await submitReport(reportToSend);
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
