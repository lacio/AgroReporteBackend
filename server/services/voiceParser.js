const { GoogleGenAI, Type } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

/**
 * Procesa un archivo de audio (en Base64) usando Gemini 3.8 Flash
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
  let detectedMime = mimeType;
  if (audioBase64.includes(';base64,')) {
    const parts = audioBase64.split(';base64,');
    detectedMime = parts[0].replace('data:', '') || detectedMime;
    cleanBase64 = parts[1];
  }

  const prompt = `Eres el asistente inteligente de AgroReporte para la empresa Agrocentro S.A.
Tu labor es escuchar el audio grabado por un colaborador en el campo o instalaciones y convertirlo en un ticket estructurado de incidente.

Reglas de extracción:
1. "title": Un título descriptivo, claro y conciso (máximo 60 caracteres). Ej: "Gotera en techo de Almacenera", "Falla en tomacorriente de comedor".
2. "predio": Debe ser EXACTAMENTE uno de estos 6 predios si se menciona explícitamente o por contexto:
   - "Oficina Central"
   - "Almacenera"
   - "San Juliano"
   - "Los Tamarindos"
   - "Media Luna"
   - "Los Troncos"
   Si no se menciona ningún predio, devuelve "".
3. "location": Lugar o área específica dentro del predio (ej: "Baño de mujeres", "Galpón 2", "Comedor", "Taller de maquinaria", "Oficina de compras"). Si no se especifica, usa lo más cercano mencionado o deja "".
4. "category": Debe ser EXACTAMENTE uno de los siguientes IDs:
   - "servicios-generales" (infraestructura, agua, plomería, goteras, techos, paredes, electricidad, luces, aires acondicionados, limpieza, áreas comunes)
   - "tecnologia" (computadoras, impresoras, sistemas, red, wifi, software, cables de red, equipos)
   - "ssma" (seguridad y salud en el trabajo, medio ambiente, riesgos de caídas, cables expuestos peligrosos, extintores, falta de EPP, accidentes, derrames)
   - "recursos-humanos" (clima laboral, bienestar laboral, conductas, personal)
   - "otros" (si no encaja en las anteriores)
5. "priority": Debe ser:
   - "alta" (si hay peligro inmediato para personas, riesgo de daño grave a mercadería/equipos o paralización de operaciones)
   - "normal" (requiere pronta atención pero no frena operaciones)
   - "baja" (mantenimiento menor o estético)
6. "description": Transcripción fiel, fluida y bien redactada en español de lo que relató el usuario en el audio. Corrige muletillas y dale buena puntuación.

Responde únicamente con el JSON estructurado.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
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
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          predio: {
            type: Type.STRING,
            enum: ['Oficina Central', 'Almacenera', 'San Juliano', 'Los Tamarindos', 'Media Luna', 'Los Troncos', '']
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
  });

  const parsed = JSON.parse(response.text);
  return parsed;
}

module.exports = {
  parseVoiceReport
};
