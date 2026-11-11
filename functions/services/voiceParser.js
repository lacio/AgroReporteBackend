const { GoogleGenAI, Type } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

// Modelos medidos el 2026-11-11 con un audio de ~24 s. Todos responden en 2-4 s
// cuando están disponibles, pero Google devuelve 503 ("high demand") con frecuencia,
// a veces en varios modelos a la vez; por eso se encadenan cuatro.
//   gemini-3.8-flash tarda más de 60 s: NO usar para esto.
// Cada modelo acepta niveles de "thinking" distintos; uno inválido devuelve 400.
const MODELS = [
  { name: 'gemini-3.5-flash-lite', config: {} },
  { name: 'gemini-3.1-flash-lite', config: { thinkingConfig: { thinkingLevel: 'minimal' } } },
  { name: 'gemini-3.5-flash', config: { thinkingConfig: { thinkingLevel: 'minimal' } } },
  { name: 'gemini-3.6-flash', config: { thinkingConfig: { thinkingLevel: 'low' } } }
];

// El siguiente modelo se lanza en paralelo cuando el anterior falla o lleva este
// tiempo sin responder. Gana la primera respuesta válida.
const HEDGE_DELAY_MS = 3000;
const REQUEST_TIMEOUT_MS = 12000;
// Si todos fallan (p. ej. 503 generalizado) se repite la ronda completa.
const MAX_ROUNDS = 2;
const ROUND_BACKOFF_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function raceOnce(run) {
  return new Promise((resolve, reject) => {
    const controllers = [];
    const errors = [];
    let next = 0;
    let pending = 0;
    let settled = false;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controllers.forEach((c) => c.abort());
      fn(value);
    };

    const launch = () => {
      clearTimeout(timer);
      if (settled || next >= MODELS.length) return;
      const model = MODELS[next++];
      const controller = new AbortController();
      controllers.push(controller);
      pending++;
      run(model, controller.signal).then(
        (result) => finish(resolve, result),
        (err) => {
          errors.push(err);
          pending--;
          if (next < MODELS.length) launch();
          else if (pending === 0) finish(reject, errors[0]);
        }
      );
      if (next < MODELS.length) timer = setTimeout(launch, HEDGE_DELAY_MS);
    };

    launch();
  });
}

async function raceModels(run) {
  let lastError;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    try {
      return await raceOnce(run);
    } catch (err) {
      lastError = err;
      if (round < MAX_ROUNDS) {
        console.warn(`⚠️ Ronda ${round} sin respuesta de ningún modelo; reintentando...`);
        await sleep(ROUND_BACKOFF_MS);
      }
    }
  }
  const overloaded = /503|UNAVAILABLE|high demand|overloaded/i.test(String(lastError && lastError.message));
  const friendly = new Error(
    overloaded
      ? 'El servicio de IA está saturado en este momento. Espera unos segundos y vuelve a intentar, o llena el formulario manualmente.'
      : 'No se pudo procesar el audio con la IA. Intenta de nuevo o llena el formulario manualmente.'
  );
  friendly.cause = lastError;
  throw friendly;
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
