
import axios from 'axios';
import Constants from 'expo-constants';

const getApiUrl = () => {
  // En desarrollo, usa la dirección del host que ejecuta Metro Bundler o fallback local
  // En desarrollo, intentar obtener la IP de la máquina (LAN) para que funcione en el celular
  // En desarrollo, intentar obtener la IP de la máquina (LAN) para que funcione en el celular
  if (__DEV__) {
    const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;

    if (debuggerHost) {
      const localIp = debuggerHost.split(':')[0];
      const apiUrl = `http://${localIp}:3000`;
      console.log("Usando API_URL local (LAN):", apiUrl);
      return apiUrl;
    }

    const fallbackUrl = 'http://localhost:3000';
    console.log("Usando API_URL de fallback (localhost):", fallbackUrl);
    return fallbackUrl;
  }

  // En producción, usar SIEMPRE la ruta relativa /api para aprovechar los rewrites de Firebase
  return '/api';
};

const apiClient = axios.create({
  baseURL: getApiUrl(),
  timeout: 60000, // Aumentado a 60 segundos por fotos pesadas o mala señal
  headers: {
    'Content-Type': 'application/json',
  },
});

const MAX_TOTAL_IMAGE_CHARS = 650000;

const sanitizeImagesForUpload = (images) => {
  if (!Array.isArray(images)) return [];

  const sanitized = [];
  let totalChars = 0;

  for (const image of images.slice(0, 5)) {
    if (typeof image !== 'string' || !image.startsWith('data:image/') || !image.includes(';base64,')) {
      continue;
    }

    if (totalChars + image.length > MAX_TOTAL_IMAGE_CHARS) {
      console.warn('Se omitió una foto que excedía el tamaño seguro del reporte.');
      continue;
    }

    sanitized.push(image);
    totalChars += image.length;
  }

  return sanitized;
};

export const submitReport = (reportData) => {
  const url = apiClient.defaults.baseURL + '/reports';
  console.log("📡 Intentando enviar reporte a:", url);
  return apiClient.post('/reports', {
    ...reportData,
    images: sanitizeImagesForUpload(reportData.images),
  });
};

export const getReports = () => {
  return apiClient.get('/reports');
};

export const parseVoiceReport = (audioBase64, mimeType = 'audio/mp4') => {
  return apiClient.post('/parse-audio-report', {
    audio: audioBase64,
    mimeType,
  });
};

// Pequeña función para verificar si el servidor está activo
export const checkServerStatus = () => {
  return apiClient.get('/', { timeout: 2000 }); // Asumiendo que la raíz devuelve algo o al menos no falla
}

