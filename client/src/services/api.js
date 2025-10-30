
import axios from 'axios';
import Constants from 'expo-constants';

const getApiUrl = () => {
  // En producción, usa una URL fija
  if (!__DEV__) {
    // IMPORTANTE: Reemplaza esta URL con la URL de tu backend desplegado
    const productionApiUrl = 'https://agroreporte-backend.herokuapp.com'; // Ejemplo
    console.log("Usando API_URL de producción:", productionApiUrl);
    return productionApiUrl;
  }

  // Si se define una URL de API pública (ej. para ngrok), úsala
  if (process.env.EXPO_PUBLIC_API_URL) {
    console.log("Usando API_URL desde variable de entorno:", process.env.EXPO_PUBLIC_API_URL);
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // En desarrollo, usa la dirección del host que ejecuta Metro Bundler
  if (Constants.manifest && Constants.manifest.debuggerHost) {
    const localIp = Constants.manifest.debuggerHost.split(':')[0];
    const apiUrl = `http://${localIp}:3000`;
    console.log("Usando API_URL local:", apiUrl);
    return apiUrl;
  }
  
  // Fallback para desarrollo si todo lo demás falla
  const fallbackUrl = 'http://localhost:3000';
  console.log("Usando API_URL de fallback:", fallbackUrl);
  return fallbackUrl; 
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
