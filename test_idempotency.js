const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_URL = 'http://localhost:3000';
const clientReportId = uuidv4();

const reportData = {
    clientReportId,
    title: "Test de Idempotencia",
    description: "Este es un reporte de prueba para verificar que no se duplique.",
    location: "Laboratorio de Pruebas",
    predio: "Oficina Central",
    category: "tecnologia",
    priority: "normal",
    images: [],
    reporterName: "Tester Antigravity",
    reporterEmail: "test@example.com"
};

async function runTest() {
    console.log(`🚀 Iniciando prueba de idempotencia con clientReportId: ${clientReportId}`);

    try {
        // Primer envío
        console.log("📤 Enviando primer reporte...");
        const res1 = await axios.post(`${API_URL}/reports`, reportData);
        console.log("✅ Primer envío exitoso. ID:", res1.data.id);

        // Segundo envío (inmediato)
        console.log("📤 Enviando segundo reporte (duplicado)...");
        const res2 = await axios.post(`${API_URL}/reports`, reportData);

        if (res2.data.duplicated) {
            console.log("✅ ÉXITO: El servidor detectó el duplicado correctamente.");
            console.log("ID devuelto:", res2.data.id);
        } else {
            console.log("❌ ERROR: El servidor no detectó el duplicado.");
        }

    } catch (error) {
        console.error("❌ Error durante la prueba:", error.message);
        if (error.response) {
            console.error("Respuesta del servidor:", error.response.data);
        }
    }
}

runTest();
