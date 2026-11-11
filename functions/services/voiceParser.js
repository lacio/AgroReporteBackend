const { GoogleGenAI, Type } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

// Modelos medidos el 2026-11-11 con un audio de ~24 s:
//   gemini-3.5-flash-lite / gemini-3.1-flash-lite -> 2-4 s (con picos ocasionales y algún 503)
//   gemini-3.8-flash                              -> más de 60 s (NO usar para esto)
// Cada modelo acepta parámetros de "thinking" distintos; uno inválido devuelve 400.
const MODELS = [
  { name: 'gemini-3.5-flash-lite', config: {} },
  { name: 'gemini-3.1-flash-lite', config: { thinkingConfig: { thinkingLevel: 'minimal' } } }
];

// Si el modelo principal no respondió en este tiempo (o falló), se lanza el
// segundo en paralelo y se usa la primera respuesta válida.
const HEDGE_DELAY_MS = 4000;
const REQUEST_TIMEOUT_MS = 25000;

function raceModels(run) {
  const controllers = MODELS.map(() => new AbortController());
  const primary = run(MODELS[0], controllers[0].signal);
  const secondary = new Promise((resolve, reject) => {
    let started = false;
    const start = () => {
      clearTimeout(timer);
      if (started) return;
      started = true;
      run(MODELS[1], controllers[1].signal).then(resolve, reject);
    };
    const timer = setTimeout(start, HEDGE_DELAY_MS);
    primary.then(() => clearTimeout(timer), start);
  });

  return Promise.any([primary, secondary])
    .catch((agg) => {
      throw (agg.errors && agg.errors[0]) || agg;
    })
    .finally(() => controllers.forEach((c) => c.abort()));
}

/**
 * Procesa un archivo de audio (en Base64) usando Gemini Flash
 * y extrae la información del ticket categorizada automáticamente.
 */
async function parseVoiceReport(audioBase64, mimeType = 'audio/mp4') {
  if (!ai) {
    if (process.env.GEMINI_API_KEY) {
      ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } else {
      throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
    }
  }

  // Limpiar prefijo data:audio/...;base64, si viene incluido
  let cleanBase64 = audioBase64;
  let detectedMime = mimeType || 'audio/mp4';
  if (audioBase64.includes(';base64,')) {
    const parts = audioBase64.split(';base64,');
    detectedMime = parts[0].replace('data:', '') || detectedMime;
    cleanBase64 = parts[1];
  }

  // Normalizar MIME type: quitar parámetros como ;codecs=opus que Gemini rechaza
  if (detectedMime) {
    detectedMime = detectedMime.split(';')[0].trim().toLowerCase();
    if (detectedMime.includes('webm')) detectedMime = 'audio/webm';
    else if (detectedMime.includes('mp4') || detectedMime.includes('m4a') || detectedMime.includes('aac')) detectedMime = 'audio/mp4';
    else if (detectedMime.includes('wav')) detectedMime = 'audio/wav';
    else if (detectedMime.includes('ogg')) detectedMime = 'audio/ogg';
    else if (detectedMime.includes('3gpp') || detectedMime.includes('3gp')) detectedMime = 'audio/3gpp';
  }

  const prompt = `Extrae un ticket de incidente del audio. Empresa: Agrocentro S.A.
Predios válidos (exacto): "Oficina Central", "Almacenera", "San Juliano", "Los Tamarindos", "Media Luna", "Los Troncos". Si no se menciona, devuelve "".
Categorías (ID exacto): "servicios-generales" (infra/electricidad/agua/limpieza), "tecnologia" (IT/equipos/red), "ssma" (seguridad/salud/medio ambiente), "recursos-humanos" (personal/clima laboral), "otros".
Prioridades: "alta" (peligro/paralización), "normal" (pronta atención), "baja" (mantenimiento menor).
title: máx 60 caracteres. description: transcripción corregida en español.
location: área específica dentro del predio mencionado o "".
Responde JSON puro, sin texto adicional.`;

  const generateOptions = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: detectedMime || 'audio/mp4'
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    config: {
      // Holgado: un audio de 60 s genera ~400 tokens; si se corta, el JSON queda inválido
      maxOutputTokens: 1024,
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          predio: {
            type: Type.STRING,
            description: 'Debe ser uno de los predios: Oficina Central, Almacenera, San Juliano, Los Tamarindos, Media Luna, Los Troncos. Si no se menciona ninguno, escribe "".'
          },
          location: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: ['servicios-generales', 'tecnologia', 'ssma', 'recursos-humanos', 'otros']
          },
          priority: {
            type: Type.STRING,
            enum: ['baja', 'normal', 'alta']
          },
          description: { type: Type.STRING }
        },
        required: ['title', 'predio', 'location', 'category', 'priority', 'description']
      }
    }
  };

  const startedAt = Date.now();
  const parsed = await raceModels(async (model, signal) => {
    try {
      const response = await ai.models.generateContent({
        model: model.name,
        contents: generateOptions.contents,
        config: {
          ...generateOptions.config,
          ...model.config,
          abortSignal: signal,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS }
        }
      });
      if (!response || !response.text) {
        throw new Error('Respuesta vacía del modelo.');
      }
      const result = JSON.parse(response.text);
      console.log(`⏱️ Audio procesado con ${model.name} en ${Date.now() - startedAt} ms`);
      return result;
    } catch (err) {
      if (!signal.aborted) {
        console.warn(`⚠️ ${model.name} falló a los ${Date.now() - startedAt} ms: ${err.message}`);
      }
      throw err;
    }
  });

  const validPredios = [
    'Oficina Central',
    'Almacenera',
    'San Juliano',
    'Los Tamarindos',
    'Media Luna',
    'Los Troncos'
  ];
  if (!validPredios.includes(parsed.predio)) {
    parsed.predio = '';
  }

  return parsed;
}

module.exports = {
  parseVoiceReport
};
