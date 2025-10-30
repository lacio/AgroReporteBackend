
import axios from 'axios';
import Constants from 'expo-constants';

const getApiUrl = () => {
  // En desarrollo, usa la dirección del host que ejecuta Metro Bundler o fallback local
  if (__DEV__) {
    if (Constants.manifest && Constants.manifest.debuggerHost) {
      const localIp = Constants.manifest.debuggerHost.split(':')[0];
      const apiUrl = `http://${localIp}:3000`;
      console.log("Usando API_URL local (DEV):", apiUrl);
      return apiUrl;
    }
    const fallbackUrl = 'http://localhost:3000';
    console.log("Usando API_URL de fallback (DEV):", fallbackUrl);
    return fallbackUrl;
  }

  // En producción
  // Prioriza la variable de entorno si está definida
  if (process.env.EXPO_PUBLIC_API_URL) {
    console.log("Usando API_URL desde variable de entorno (PROD):", process.env.EXPO_PUBLIC_API_URL);
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // Fallback a la configuración en app.json si la variable de entorno no está
  if (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL) {
    console.log("Usando API_URL desde app.json (PROD):", Constants.expoConfig.extra.EXPO_PUBLIC_API_URL);
    return Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;
  }

  // Si no hay variable de entorno, usa la URL fija de producción
  const productionApiUrl = 'https://agroreportebackend-production.up.railway.app';
  console.log("Usando API_URL fija de producción (PROD):", productionApiUrl);
  return productionApiUrl;
};

const API_URL = getApiUrl();

console.log("Conectando a la API en:", API_URL);

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const submitReport = (reportData) => {
  return apiClient.post('/reports', reportData);
};

export const getReports = () => {
  return apiClient.get('/reports');
};

// Pequeña función para verificar si el servidor está activo
export const checkServerStatus = () => {
    return apiClient.get('/', { timeout: 2000 }); // Asumiendo que la raíz devuelve algo o al menos no falla
}
