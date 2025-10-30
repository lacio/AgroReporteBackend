
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const OFFLINE_REPORTS_KEY = '@offline_reports';

export const saveReportOffline = async (reportData) => {
  try {
    const offlineReports = await getOfflineReports();
    const reportWithId = {
      ...reportData,
      offlineId: uuidv4(), // ID único para manejo local
      savedAt: new Date().toISOString(),
    };
    const updatedReports = [...offlineReports, reportWithId];
    const jsonValue = JSON.stringify(updatedReports);
    await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, jsonValue);
    console.log('Reporte guardado localmente', reportWithId);
  } catch (e) {
    console.error('Error guardando reporte offline:', e);
  }
};

export const getOfflineReports = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(OFFLINE_REPORTS_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Error obteniendo reportes offline:', e);
    return [];
  }
};

export const setOfflineReports = async (reports) => {
    try {
        const jsonValue = JSON.stringify(reports);
        await AsyncStorage.setItem(OFFLINE_REPORTS_KEY, jsonValue);
    } catch (e) {
        console.error('Error actualizando reportes offline:', e);
    }
};

export const clearOfflineReports = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_REPORTS_KEY);
    console.log('Todos los reportes offline han sido eliminados.');
  } catch (e) {
    console.error('Error eliminando reportes offline:', e);
  }
};
