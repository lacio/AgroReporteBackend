const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");

const { initializeApp } = require("firebase-admin/app");
const functions = require("firebase-functions"); // Requerido para fallbacks de config
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

const app = express();
const MAX_IMAGES = 5;
const MAX_TOTAL_IMAGE_CHARS = 650000;

// Middleware
app.use(cors({ origin: true }));
app.use(express.json({ limit: '20mb' }));

const sanitizeReportImages = (images) => {
    if (!Array.isArray(images)) {
        return { accepted: [], receivedCount: 0, omittedCount: 0 };
    }

    const accepted = [];
    let totalChars = 0;
    let omittedCount = Math.max(0, images.length - MAX_IMAGES);

    for (const image of images.slice(0, MAX_IMAGES)) {
        const isSupportedDataUrl = typeof image === 'string'
            && /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(image);

        if (!isSupportedDataUrl || totalChars + image.length > MAX_TOTAL_IMAGE_CHARS) {
            omittedCount += 1;
            continue;
        }

        accepted.push(image);
        totalChars += image.length;
    }

    return { accepted, receivedCount: images.length, omittedCount };
};

// Logging middleware
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Obtener variables con fallback para legacy config
const getAdminPass = () => process.env.ADMIN_PASSWORD || functions.config()?.agro?.admin_password || 'AgroAdmin2026*';
const getEmailServicios = () => process.env.EMAIL_SERVICIOS_GENERALES || functions.config()?.agro?.email_servicios || 'asandoval@agrocentro.com.bo';

const recipientMap = {
    'servicios-generales': getEmailServicios(),
    'tecnologia': 'fabio.lacio@agrocentro.com.bo',
    'ssma': 'asandoval@agrocentro.com.bo',
    'recursos-humanos': 'jcalderon@agrocentro.com.bo',
    'otros': 'fabio.lacio@agrocentro.com.bo',
};

// Endpoint raíz / Health Check
app.get(['/api', '/'], (req, res) => {
    res.json({ status: 'ok', message: 'AgroReporte API is running on Firebase Functions! 🚀', timestamp: new Date().toISOString() });
});

// Endpoint para obtener todos los reportes
app.get(['/api/reports', '/reports'], async (req, res) => {
    try {
        const reportsSnapshot = await db.collection('reports').get();
        const reportsList = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(reportsList);
    } catch (error) {
        console.error("Error al obtener reportes:", error);
        res.status(500).send("Error al obtener reportes");
    }
});

const { parseVoiceReport } = require('./services/voiceParser');

// Endpoint para procesar notas de voz y estructurar el ticket con IA
app.post(['/api/parse-audio-report', '/parse-audio-report'], async (req, res) => {
    try {
        const { audio, mimeType } = req.body;
        if (!audio) {
            return res.status(400).json({ error: 'No se proporcionó audio para procesar.' });
        }

        console.log(`🎙️ [Functions] Procesando audio con Gemini Flash...`);
        const parsedData = await parseVoiceReport(audio, mimeType);
        console.log('✅ [Functions] Audio categorizado con éxito:', parsedData);

        return res.json({ success: true, data: parsedData });
    } catch (error) {
        console.error('❌ [Functions] Error al procesar audio:', error);
        return res.status(500).json({
            error: 'Error al procesar el audio con inteligencia artificial.',
            details: error.message
        });
    }
});

// Endpoint para crear un nuevo reporte
app.post(['/api/reports', '/reports'], async (req, res) => {

    try {
        const {
            clientReportId,
            title,
            description,
            location,
            predio,
            category,
            priority,
            images,
            reporterName,
            reporterEmail,
        } = req.body;

        // --- IDEMPOTENCIA ---
        if (clientReportId) {
            const existingQuery = await db.collection('reports')
                .where('clientReportId', '==', clientReportId)
                .limit(1)
                .get();

            if (!existingQuery.empty) {
                const existingDoc = existingQuery.docs[0];
                console.log(`♻️ Reporte duplicado detectado en Firebase (clientReportId: ${clientReportId})`);
                return res.status(200).json({ id: existingDoc.id, ...existingDoc.data(), duplicated: true });
            }
        }
        // ---------------------

        const imageResult = sanitizeReportImages(images);
        const firestoreImages = imageResult.accepted;

        if (imageResult.omittedCount > 0) {
            console.warn(
                `⚠️ Se omitieron ${imageResult.omittedCount} imagen(es) para mantener el reporte dentro del límite seguro.`
            );
        }

        const newReport = {
            clientReportId: clientReportId || null,
            title: title || '',
            description: description || '',
            location: location || '',
            predio: predio || '',
            category: category || 'otros',
            priority: priority || 'normal',
            images: firestoreImages,
            imagesCount: imageResult.receivedCount,
            imagesStoredCount: firestoreImages.length,
            reporterName: reporterName || '',
            reporterEmail: reporterEmail || '',
            isAnonymous: false,
            timestamp: new Date().toISOString(),
            status: 'Pendiente de revisión',
        };

        const docRef = await db.collection('reports').add(newReport);
        console.log("✅ Reporte guardado con ID:", docRef.id);

        // El correo usa únicamente las imágenes que ya pasaron la validación de tamaño.
        const imagesForEmail = firestoreImages;

        // Responder al cliente de inmediato para evitar que el timeout del cliente (30s) 
        // expire mientras se procesa el envío de correo (operación que puede ser lenta)
        res.status(201).json({ id: docRef.id, ...newReport });

        // Envío de correo de notificación (se ejecuta después de enviar la respuesta)
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: { rejectUnauthorized: false }
        });

        const recipient = recipientMap[newReport.category];
        if (recipient) {
            const mailOptions = {
                from: process.env.SMTP_FROM || '"AgroReporte" <no-reply@agrocentro.com.bo>',
                to: recipient,
                subject: `Nuevo Reporte de Incidente: ${newReport.title}`,
                html: `
                    <h1>Nuevo Reporte de Incidente</h1>
                    <p><strong>Categoría:</strong> ${newReport.category}</p>
                    <p><strong>Predio:</strong> ${newReport.predio}</p>
                    <p><strong>Título:</strong> ${newReport.title}</p>
                    <p><strong>Reportado por:</strong> ${newReport.reporterName}</p>
                    <p><strong>Ubicación:</strong> ${newReport.location}</p>
                    <p><strong>Descripción:</strong></p>
                    <p>${newReport.description}</p>
                    <p><strong>Estado:</strong> ${newReport.status}</p>
                    <p><strong>Fecha:</strong> ${new Date(newReport.timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p>
                `,
                attachments: [],
            };

            if (imagesForEmail.length > 0) {
                mailOptions.attachments = imagesForEmail.map((base64Image, index) => {
                    // Limpiar el prefijo data:image/...;base64, si existe
                    const base64Data = base64Image.includes('base64,') 
                        ? base64Image.split('base64,')[1] 
                        : base64Image;

                    return {
                        filename: `incidente-${index + 1}.jpg`,
                        content: Buffer.from(base64Data, 'base64')
                    };
                });

                mailOptions.html += '<h2>Imágenes Adjuntas:</h2>';
                imagesForEmail.forEach((base64Image, index) => {
                    mailOptions.html += `<p><strong>Imagen ${index + 1}:</strong></p><img src="${base64Image}" alt="incidente-${index + 1}.jpg" style="max-width: 400px; height: auto;"/>`;
                });
            }

            try {
                await transporter.sendMail(mailOptions);
                console.log("📨 Correo enviado a:", recipient);
            } catch (emailError) {
                console.error("❌ Error al enviar correo:", emailError);
            }
        }

        // [NUEVO] Envío de confirmación al solicitante si dejó su correo
        if (newReport.reporterEmail) {
            const reporterMailOptions = {
                from: process.env.SMTP_FROM || '"AgroReporte" <no-reply@agrocentro.com.bo>',
                to: newReport.reporterEmail,
                cc: 'fabio.lacio@agrocentro.com.bo',
                subject: `Confirmación de Reporte Registrado: ${newReport.title}`,
                html: `
                    <h1>Hemos recibido tu reporte exitosamente</h1>
                    <p>Hola <strong>${newReport.reporterName}</strong>,</p>
                    <p>Este mensaje confirma que tu reporte ha ingresado a nuestro sistema y ha sido derivado al departamento correspondiente.</p>
                    <hr>
                    <p><strong>Detalles del reporte:</strong></p>
                    <ul>
                        <li><strong>Título:</strong> ${newReport.title}</li>
                        <li><strong>Categoría:</strong> ${newReport.category}</li>
                        <li><strong>Predio:</strong> ${newReport.predio}</li>
                        <li><strong>Ubicación:</strong> ${newReport.location}</li>
                        <li><strong>Fecha de registro:</strong> ${new Date(newReport.timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</li>
                    </ul>
                    <p>Te enviaremos otra notificación cuando el incidente haya sido marcado como resuelto.</p>
                    <br>
                    <p><em>Equipos de Mantenimiento - Agrocentro</em></p>
                `
            };
            try {
                await transporter.sendMail(reporterMailOptions);
                console.log("📨 Correo de confirmación enviado a:", newReport.reporterEmail);
            } catch (confError) {
                console.error("❌ Error al enviar confirmación al reportador:", confError);
            }
        }
    } catch (error) {
        console.error("💥 Error al crear reporte:", error);
        res.status(500).json({ error: "Error interno al crear reporte" });
    }
});

// Endpoint para actualizar el estado (Cierre de ticket)
app.put(['/api/reports/:id', '/reports/:id'], async (req, res) => {
    try {
        const { id } = req.params;
        const { status, manualEmail, password } = req.body;

        if (password !== getAdminPass()) {
            return res.status(401).send("No autorizado");
        }

        const reportRef = db.collection('reports').doc(id);
        const reportDoc = await reportRef.get();

        if (!reportDoc.exists) {
            return res.status(404).send("Reporte no encontrado");
        }

        const reportData = reportDoc.data();
        const updateData = { status: status || 'Resuelto' };

        // Si se marca como resuelto, guardamos la fecha de resolución
        if (updateData.status === 'Resuelto' && !reportData.resolvedAt) {
            updateData.resolvedAt = new Date().toISOString();
        }

        await reportRef.update(updateData);

        const targetEmail = manualEmail || reportData.reporterEmail;
        if (targetEmail && updateData.status === 'Resuelto') {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
                tls: { rejectUnauthorized: false }
            });

            const mailOptions = {
                from: process.env.SMTP_FROM || '"AgroReporte" <no-reply@agrocentro.com.bo>',
                to: targetEmail,
                subject: `Reporte Resuelto: ${reportData.title}`,
                html: `
                    <h1>Tu reporte ha sido resuelto</h1>
                    <p>Hola <strong>${reportData.reporterName || 'Usuario'}</strong>,</p>
                    <p>Te informamos que el incidente reportado ha sido atendido y marcado como <strong>Resuelto</strong>.</p>
                    <hr>
                    <p><strong>Título:</strong> ${reportData.title}</p>
                    <p><strong>Ubicación:</strong> ${reportData.location}</p>
                    <p><strong>Fecha del reporte:</strong> ${new Date(reportData.timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p>
                    <br>
                    <p>Gracias por ayudarnos a mejorar nuestro entorno laboral.</p>
                    <br>
                    <p><em>Equipos de Mantenimiento - Agrocentro</em></p>
                `
            };
            try {
                await transporter.sendMail(mailOptions);
            } catch (error) {
                console.error("❌ Error enviando notificación de cierre:", error);
            }
        }

        res.json({ id, status: 'Resuelto', emailSent: !!targetEmail });
    } catch (error) {
        console.error("Error al actualizar reporte:", error);
        res.status(500).send("Error al actualizar reporte");
    }
});

// Helper para calcular la duración legible
function getDuration(start, end) {
    if (!start || !end) return 'N/A';
    const s = new Date(start);
    const e = new Date(end);
    const diffMs = e - s;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let result = '';
    if (diffDays > 0) result += `${diffDays}d `;
    if (diffHrs > 0) result += `${diffHrs}h `;
    if (result === '' || diffMins > 0) result += `${diffMins}m`;
    return result.trim();
}

// [NEW] Endpoint para ver la imagen de un reporte específico sin sobrecargar el panel
app.get(['/api/reports/:id/image', '/reports/:id/image'], async (req, res) => {
    try {
        const { id } = req.params;
        const reportDoc = await db.collection('reports').doc(id).get();
        
        if (!reportDoc.exists) {
            return res.status(404).send("Reporte no encontrado");
        }
        
        const report = reportDoc.data();
        if (!report.images || report.images.length === 0) {
            return res.status(404).send("Este reporte no tiene imágenes");
        }
        
        let html = `
            <html>
            <head>
                <title>Evidencia Reporte ${id}</title>
                <style>
                    body { margin: 0; background: #1a1a1a; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; color: white; }
                    .container { padding: 20px; text-align: center; }
                    img { max-width: 95%; max-height: 85vh; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #444; margin-bottom: 20px; }
                    .btn { padding: 10px 20px; background: #1a73e8; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Evidencia del Reporte: ${report.title || 'Sin Título'}</h2>
                    ${report.images.map((imgData, index) => {
                        const imgSrc = imgData.startsWith('data:') ? imgData : `data:image/jpeg;base64,${imgData}`;
                        return `<img src="${imgSrc}" alt="Imagen ${index + 1}">`;
                    }).join('')}
                    <br><br>
                    <a href="javascript:window.close()" class="btn">Cerrar Ventana</a>
                </div>
            </body>
            </html>
        `;
        res.send(html);
    } catch (error) {
        console.error("Error al obtener imagen:", error);
        res.status(500).send("Error al obtener imagen");
    }
});

// [NEW] Endpoint para enviar recordatorio manual
app.post(['/api/reports/:id/remind', '/reports/:id/remind'], async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (password !== getAdminPass()) {
            return res.status(401).json({ error: "No autorizado" });
        }

        const reportRef = db.collection('reports').doc(id);
        const reportDoc = await reportRef.get();

        if (!reportDoc.exists) {
            return res.status(404).json({ error: "Reporte no encontrado" });
        }

        const reportData = reportDoc.data();
        if (!reportData.reporterEmail) {
            return res.status(400).json({ error: "El solicitante no registró correo electrónico" });
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: { rejectUnauthorized: false }
        });

        const reminderCount = (reportData.reminderCount || 0) + 1;
        const createdAt = new Date(reportData.timestamp);
        const createdDate = createdAt.toLocaleString('es-BO', { timeZone: 'America/La_Paz' });

        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"AgroReporte" <no-reply@agrocentro.com.bo>',
            to: reportData.reporterEmail,
            cc: 'flacio@agrocentro.com.bo',
            subject: `⏳ Recordatorio Manual: Tu reporte "${reportData.title}" sigue pendiente`,
            html: `
                <h2 style="color:#e65100;">⏳ Recordatorio de tu solicitud</h2>
                <p>Hola <strong>${reportData.reporterName || 'Usuario'}</strong>,</p>
                <p>Te enviamos este recordatorio manual para informarte que tu reporte registrado en AgroReporte todavía no ha sido marcado como resuelto.</p>
                <p>Estamos trabajando para atenderlo lo antes posible.</p>
                <hr>
                <p><strong>Detalles del reporte:</strong></p>
                <ul>
                    <li><strong>Título:</strong> ${reportData.title}</li>
                    <li><strong>Predio / Ubicación:</strong> ${reportData.predio || 'N/A'} - ${reportData.location || 'N/A'}</li>
                    <li><strong>Categoría:</strong> ${reportData.category}</li>
                    <li><strong>Fecha de registro:</strong> ${createdDate}</li>
                    <li><strong>Estado actual:</strong> ${reportData.status}</li>
                </ul>
                <br>
                <p><em>Equipos de Mantenimiento - Agrocentro</em></p>
            `
        });

        await reportRef.update({
            reminderCount: reminderCount,
            lastReminderSentAt: new Date().toISOString()
        });

        res.json({ success: true, reminderCount });
    } catch (error) {
        console.error("Error en recordatorio manual:", error);
        res.status(500).json({ error: "Error interno" });
    }
});

// [NEW] Endpoint para cierre masivo de tickets con notificaciones
app.post(['/api/reports/bulk-close', '/reports/bulk-close'], async (req, res) => {
    try {
        const { ids, password } = req.body;

        if (password !== getAdminPass()) {
            return res.status(401).json({ error: "No autorizado" });
        }

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
        }

        console.log(`🔨 Iniciando cierre masivo de ${ids.length} reportes...`);
        const results = { total: ids.length, closed: 0, errors: [] };
        
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: { rejectUnauthorized: false }
        });

        // Procesamos uno a uno para manejar las notificaciones individuales de manera segura
        for (const id of ids) {
            try {
                const reportRef = db.collection('reports').doc(id);
                const reportDoc = await reportRef.get();

                if (!reportDoc.exists) {
                    results.errors.push({ id, error: "No encontrado" });
                    continue;
                }

                const reportData = reportDoc.data();
                if (reportData.status === 'Resuelto') {
                    results.closed++; // Ya estaba resuelto, lo contamos como éxito
                    continue;
                }

                const updateData = { 
                    status: 'Resuelto',
                    resolvedAt: reportData.resolvedAt || new Date().toISOString()
                };

                await reportRef.update(updateData);
                results.closed++;

                // Enviar correo de notificación
                const targetEmail = reportData.reporterEmail;
                if (targetEmail) {
                    const mailOptions = {
                        from: process.env.SMTP_FROM || '"AgroReporte" <no-reply@agrocentro.com.bo>',
                        to: targetEmail,
                        subject: `Reporte Resuelto: ${reportData.title}`,
                        html: `
                            <h1>Tu reporte ha sido resuelto</h1>
                            <p>Hola <strong>${reportData.reporterName || 'Usuario'}</strong>,</p>
                            <p>Te informamos que el reporte <strong>"${reportData.title}"</strong> ha sido atendido y marcado como <strong>Resuelto</strong> como parte de una actualización masiva de tickets.</p>
                            <hr>
                            <p><strong>Fecha del reporte:</strong> ${new Date(reportData.timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p>
                            <p>Gracias por ayudarnos a mejorar nuestro entorno laboral.</p>
                            <br>
                            <p><em>Equipos de Mantenimiento - Agrocentro</em></p>
                        `
                    };
                    await transporter.sendMail(mailOptions);
                }
            } catch (err) {
                console.error(`❌ Error cerrando ticket ${id}:`, err);
                results.errors.push({ id, error: err.message });
            }
        }

        res.json(results);
    } catch (error) {
        console.error("💥 Error en cierre masivo:", error);
        res.status(500).json({ error: "Error interno en el servidor" });
    }
});

// Endpoint para el panel administrativo HTML con filtros
app.get(['/api/reports/html', '/reports/html'], async (req, res) => {
    try {
        // Filtramos para limpiar el panel (solo desde el 06/02/2026 en adelante)
        const FECHA_DEPURACION = '2026-02-06T00:00:00.000Z';
        
        const reportsSnapshot = await db.collection('reports')
            .select('title', 'reporterName', 'reporterEmail', 'timestamp', 'status', 'location', 'predio', 'category', 'resolvedAt', 'reminderCount', 'lastReminderSentAt', 'priority', 'clientReportId')
            .where('timestamp', '>=', FECHA_DEPURACION)
            .orderBy('timestamp', 'desc')
            .limit(1000) 
            .get();

        const reportsList = reportsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            // Depuración de Palabras Clave (Prueba/Test)
            .filter(report => {
                const title = (report.title || '').toLowerCase();
                return !title.includes('prueba') && !title.includes('test');
            });

        let tableRows = '';
        reportsList.forEach(report => {
            try {
                let imageTag = `<button onclick="window.open(window.location.href.replace('/html', '/${report.id}/image'))" style="background:#1a73e8; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:11px;">Ver Foto 📷</button>`;

                const resolutionTime = report.status === 'Resuelto' ? getDuration(report.timestamp, report.resolvedAt) : 'Pendiente';

                const safeDate = (dateStr) => {
                    try {
                        if (!dateStr) return 'N/A';
                        const d = new Date(dateStr);
                        return isNaN(d.getTime()) ? 'Fecha inválida' : d.toLocaleString('es-BO', { timeZone: 'America/La_Paz' });
                    } catch (e) { return 'Error fecha'; }
                };

                let actionHtml = '';
                if (report.status !== 'Resuelto') {
                    const remindBtn = report.reporterEmail ? 
                        `<button onclick="sendManualReminder('${report.id}')" style="background-color: #f57c00; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 5px;">Recordar ✉️</button>` : '';

                    actionHtml = `
                        <div id="actions-${report.id}">
                            ${remindBtn}
                            ${!report.reporterEmail ? '<input type="email" id="email-' + report.id + '" placeholder="Email opcional" style="margin-bottom:5px; width:100%; font-size: 11px;">' : ''}
                            <button onclick="closeTicket('${report.id}', '${report.reporterEmail || ''}')" style="background-color: #2e7d32; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; width: 100%;">Cerrar</button>
                        </div>
                    `;
                } else {
                    actionHtml = '<span style="color: #2e7d32; font-weight: bold;">✓ Resuelto</span>';
                }

                const fullLocation = report.predio ? `${report.predio} - ${report.location || ''}` : (report.location || 'N/A');

                tableRows += `
                    <tr id="row-${report.id}">
                        <td><input type="checkbox" class="report-checkbox" value="${report.id}" onclick="updateSelectedCount()" ${report.status === 'Resuelto' ? 'disabled' : ''}></td>
                        <td style="font-size: 10px; color: #888;">${report.id}</td>
                        <td>${report.title || 'N/A'}</td>
                        <td>${report.reporterName || 'N/A'}<br><small style="color: #666;">${report.reporterEmail || ''}</small></td>
                        <td>${safeDate(report.timestamp)}</td>
                        <td><strong>${resolutionTime}</strong></td>
                        <td>${fullLocation}</td>
                        <td>${report.status || 'N/A'}</td>
                        <td style="text-align:center; font-size:12px;">${report.reminderCount ? '✉️ ' + report.reminderCount + '/4' : '-'}</td>
                        <td>${report.category || 'N/A'}</td>
                        <td>${imageTag}</td>
                        <td>${actionHtml}</td>
                    </tr>
                `;
            } catch (itemError) {
                console.error(`Error procesando reporte ${report.id}:`, itemError);
                tableRows += `<tr><td colspan="10">Error cargando reporte ${report.id}</td></tr>`;
            }
        });

        res.setHeader('Content-Type', 'text/html');
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Panel AgroReporte - Firebase</title>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0"></script>
                <!-- Librería para Exportar a Excel -->
                <script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
                <style>
                    body { font-family: -apple-system, system-ui, sans-serif; margin: 20px; color: #333; background: #f0f2f5; }
                    h1 { color: #1a73e8; margin-bottom: 20px; }
                    .header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
                    .container { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; table-layout: fixed; }
                    th, td { border: 1px solid #eee; padding: 12px; text-align: left; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
                    th { background-color: #f8f9fa; font-weight: 600; font-size: 13px; position: sticky; top: 0; }
                    tr:nth-child(even) { background-color: #fcfcfc; }
                    tr:hover { background-color: #f5f5f5; }
                    img { border-radius: 4px; }
                    .filter-row th { padding: 8px; background-color: #f1f3f4; }
                    .filter-input { width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; outline: none; }
                    .filter-input:focus { border-color: #1a73e8; }
                    .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.2s; }
                    .btn-clear { background: #5f6368; color: white; }
                    .btn-clear:hover { background: #3c4043; }
                    .btn-excel { background: #1d6f42; color: white; margin-left: 10px; }
                    .btn-excel:hover { background: #155231; }

                    /* Dashboard Styles */
                    .tabs { display: flex; border-bottom: 2px solid #ddd; margin-bottom: 20px; }
                    .tab { padding: 10px 20px; cursor: pointer; background: #f2f2f2; border: 1px solid #ddd; border-bottom: none; border-radius: 5px 5px 0 0; margin-right: 5px; font-weight: bold; }
                    .tab.active { background: #fff; border-top: 3px solid #1a73e8; color: #1a73e8; border-bottom: 2px solid #fff; margin-bottom: -2px; }
                    
                    .dashboard-container { display: none; }
                    .dashboard-container.active { display: block; }
                    .table-container { display: none; }
                    .table-container.active { display: block; }

                    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                    .kpi-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; border-left: 5px solid #1a73e8; }
                    .kpi-card h3 { margin: 0; color: #666; font-size: 14px; text-transform: uppercase; }
                    .kpi-card .value { font-size: 32px; font-weight: bold; color: #333; margin: 10px 0; }
                    .kpi-card .subtitle { font-size: 12px; color: #888; }
                    
                    .charts-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                    .chart-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .chart-card h3 { margin-top: 0; margin-bottom: 15px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }

                    .critical-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
                    .critical-table th, .critical-table td { border: none; border-bottom: 1px solid #eee; padding: 8px; }
                    .critical-table th { background: transparent; color: #666; font-weight: normal; }
                    .critical-table tr:last-child td { border-bottom: none; }
                    .danger-text { color: #d32f2f; font-weight: bold; }
                    
                    @media (max-width: 768px) {
                      .charts-grid { grid-template-columns: 1fr; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header-actions">
                        <h1>Panel de Gestión AgroReporte</h1>
                        <div id="action-buttons" style="display: none;">
                            <button onclick="clearFilters()" class="btn btn-clear">Limpiar Filtros</button>
                            <button onclick="exportToExcel()" class="btn btn-excel" style="margin-right: 10px;">📊 Exportar Excel</button>
                            <button id="bulk-close-btn" onclick="bulkClose()" class="btn" style="background-color: #d32f2f; color: white; display: none;">🔒 Cerrar Seleccionados (<span id="selected-count">0</span>)</button>
                        </div>
                    </div>
                    
                    <div id="login-container" style="background: #e8f0fe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <label style="font-weight: bold; margin-right: 10px;">Acceso Administrativo:</label>
                        <input type="password" id="admin-password" placeholder="Contraseña admin" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 200px;">
                        <button onclick="savePassword()" style="padding: 8px 20px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Entrar</button>
                    </div>

                    <div id="admin-panel" style="display: none;">
                        <div class="tabs">
                            <div class="tab active" onclick="switchTab('dashboard')">Dashboard Ejecutivo</div>
                            <div class="tab" onclick="switchTab('table')">Lista de Reportes</div>
                        </div>

                        <div id="view-dashboard" class="dashboard-container active">
                            <div class="kpi-grid">
                                <div class="kpi-card" style="border-left-color: #2e7d32;">
                                    <h3>Registrados (Mes Actual)</h3>
                                    <div class="value" id="kpi-total">0</div>
                                    <div class="subtitle" id="kpi-total-trend">ingresos en el periodo</div>
                                </div>
                                <div class="kpi-card" style="border-left-color: #1a73e8;">
                                    <h3>Resueltos (Mes Actual)</h3>
                                    <div class="value" id="kpi-resolved">0</div>
                                    <div class="subtitle" id="kpi-resolved-trend">0% de cierre</div>
                                </div>
                                <div class="kpi-card" style="border-left-color: #ff9800;">
                                    <h3>Pendientes Globales</h3>
                                    <div class="value" id="kpi-pending">0</div>
                                    <div class="subtitle">requieren seguimiento</div>
                                </div>
                                <div class="kpi-card" style="border-left-color: #d32f2f;">
                                    <h3>Alertas Críticas</h3>
                                    <div class="value" id="kpi-alerts">0</div>
                                    <div class="subtitle">+30 días pendientes</div>
                                </div>
                            </div>

                            <div class="charts-grid">
                                <div class="chart-card">
                                    <h3>Estado general</h3>
                                    <div><canvas id="chart-status" height="200"></canvas></div>
                                </div>
                                <div class="chart-card">
                                    <h3>Dónde se concentra el trabajo</h3>
                                    <div><canvas id="chart-category" height="200"></canvas></div>
                                </div>
                                <div class="chart-card">
                                    <h3>Tendencia Mensual</h3>
                                    <div><canvas id="chart-trend" height="200"></canvas></div>
                                </div>
                            </div>
                            
                            <div class="chart-card" style="margin-bottom: 20px;">
                                <h3>Pendientes que explican el riesgo <span style="font-size:12px; color:#888; font-weight:normal;">(Top críticos por antigüedad)</span></h3>
                                <div style="overflow-x:auto;">
                                    <table class="critical-table" id="critical-table">
                                        <thead>
                                            <tr>
                                                <th>Caso</th>
                                                <th>Días Pendiente</th>
                                                <th>Recordatorios</th>
                                                <th>Lugar</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <!-- Dynamic Content -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div id="view-table" class="table-container">
                            <table id="reports-table">
                                <thead>
                                    <tr>
                                        <th style="width: 30px;"><input type="checkbox" id="select-all" onclick="toggleSelectAll()"></th>
                                        <th style="width: 60px;">ID</th>
                                        <th>Título</th>
                                        <th>Solicitante</th>
                                        <th style="width: 140px;">Fecha</th>
                                        <th style="width: 100px;">SLA (Tiempo)</th>
                                        <th>Lugar</th>
                                        <th style="width: 100px;">Estado</th>
                                        <th style="width: 110px;">Recordatorios</th>
                                        <th style="width: 120px;">Categoría</th>
                                        <th style="width: 120px;">Imagen</th>
                                        <th style="width: 100px;">Acción</th>
                                    </tr>
                                    <tr class="filter-row">
                                        <th></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="ID..."></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="Buscar..."></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="Filtrar..."></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="Fecha..."></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="SLA..."></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="Lugar..."></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="Estado..."></th>
                                        <th></th>
                                        <th><input type="text" class="filter-input" onkeyup="filterTable()" placeholder="Cat..."></th>
                                        <th></th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <script>
                    const rawReportsData = ${JSON.stringify(reportsList.map(r => ({
                        status: r.status, 
                        category: r.category, 
                        timestamp: r.timestamp,
                        title: r.title,
                        location: r.location,
                        reminderCount: r.reminderCount || 0
                    })))};
                    let dashboardRendered = false;
                    
                    if (typeof ChartDataLabels !== 'undefined') {
                        Chart.register(ChartDataLabels);
                    }

                    window.onload = () => {
                        const savedPass = localStorage.getItem('agro_admin_pass');
                        if (savedPass) {
                            document.getElementById('admin-password').value = savedPass;
                            showPanel();
                        }
                    };

                    function savePassword() {
                        const pass = document.getElementById('admin-password').value;
                        localStorage.setItem('agro_admin_pass', pass);
                        showPanel();
                    }

                    function showPanel() {
                        document.getElementById('admin-panel').style.display = 'block';
                        document.getElementById('action-buttons').style.display = 'block';
                        document.querySelector('#login-container button').innerText = 'Acceso Guardado';
                        if (!dashboardRendered) {
                            renderDashboard();
                            dashboardRendered = true;
                        }
                    }

                    function switchTab(tab) {
                        document.getElementById('view-dashboard').classList.remove('active');
                        document.getElementById('view-table').classList.remove('active');
                        const tabs = document.querySelectorAll('.tab');
                        tabs[0].classList.remove('active');
                        tabs[1].classList.remove('active');

                        if(tab === 'dashboard') {
                            document.getElementById('view-dashboard').classList.add('active');
                            tabs[0].classList.add('active');
                        } else {
                            document.getElementById('view-table').classList.add('active');
                            tabs[1].classList.add('active');
                        }
                    }

                    function renderDashboard() {
                        const now = new Date();
                        const currentMonth = now.getMonth();
                        const currentYear = now.getFullYear();

                        let lastMonth = currentMonth - 1;
                        let lastMonthYear = currentYear;
                        if (lastMonth < 0) {
                            lastMonth = 11;
                            lastMonthYear--;
                        }

                        // Data global
                        const totalGlobal = rawReportsData.length;
                        const resolvedGlobal = rawReportsData.filter(r => r.status === 'Resuelto').length;
                        const pendingGlobal = totalGlobal - resolvedGlobal;

                        // Data del mes actual
                        const thisMonthData = rawReportsData.filter(r => {
                            const d = new Date(r.timestamp);
                            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                        });
                        const totalThisMonth = thisMonthData.length;
                        const resolvedThisMonth = thisMonthData.filter(r => r.status === 'Resuelto').length;

                        // Data del mes anterior
                        const lastMonthData = rawReportsData.filter(r => {
                            const d = new Date(r.timestamp);
                            return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
                        });
                        const totalLastMonth = lastMonthData.length;
                        const resolvedLastMonth = lastMonthData.filter(r => r.status === 'Resuelto').length;

                        // Helper para calcular la tendencia
                        function getTrendHtml(current, previous, inverse = false) {
                            if (previous === 0) return current > 0 ? '<span style="color:#2e7d32; font-weight:bold;">+100%</span> vs mes ant.' : '<span style="color:#888;">0%</span> vs mes ant.';
                            const percent = Math.round(((current - previous) / previous) * 100);
                            const sign = percent > 0 ? '+' : '';
                            const color = percent > 0 ? (inverse ? '#d32f2f' : '#2e7d32') : (percent < 0 ? (inverse ? '#2e7d32' : '#d32f2f') : '#888');
                            return '<span style="color:' + color + '; font-weight:bold;">' + sign + percent + '%</span> vs mes ant.';
                        }

                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        const criticalAlerts = rawReportsData.filter(r => r.status !== 'Resuelto' && new Date(r.timestamp) < thirtyDaysAgo).length;

                        document.getElementById('kpi-total').innerText = totalThisMonth;
                        document.getElementById('kpi-total-trend').innerHTML = getTrendHtml(totalThisMonth, totalLastMonth);

                        document.getElementById('kpi-resolved').innerText = resolvedThisMonth;
                        document.getElementById('kpi-resolved-trend').innerHTML = getTrendHtml(resolvedThisMonth, resolvedLastMonth);

                        document.getElementById('kpi-pending').innerText = pendingGlobal;
                        document.getElementById('kpi-alerts').innerText = criticalAlerts;

                        new Chart(document.getElementById('chart-status'), {
                            type: 'doughnut',
                            data: {
                                labels: ['Resuelto', 'Pendiente'],
                                datasets: [{
                                    data: [resolvedGlobal, pendingGlobal],
                                    backgroundColor: ['#2e7d32', '#ff9800'],
                                    borderWidth: 0
                                }]
                            },
                            options: { 
                                cutout: '70%', 
                                responsive: true, 
                                maintainAspectRatio: false,
                                plugins: {
                                    datalabels: {
                                        color: '#fff',
                                        font: { weight: 'bold', size: 14 },
                                        formatter: (value) => value > 0 ? value : ''
                                    }
                                }
                            }
                        });

                        const categoryCounts = {};
                        rawReportsData.forEach(r => {
                            const cat = (r.category || 'otros').trim().replace(/^./, str => str.toUpperCase());
                            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                        });
                        
                        const sortedCategories = Object.entries(categoryCounts).sort((a,b) => b[1] - a[1]);

                        new Chart(document.getElementById('chart-category'), {
                            type: 'bar',
                            data: {
                                labels: sortedCategories.map(c => c[0]),
                                datasets: [{
                                    label: 'Reportes',
                                    data: sortedCategories.map(c => c[1]),
                                    backgroundColor: '#e0a96d',
                                    borderRadius: 4
                                }]
                            },
                            options: {
                                indexAxis: 'y',
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: { x: { beginAtZero: true } },
                                plugins: { 
                                    legend: { display: false },
                                    datalabels: {
                                        color: '#fff',
                                        anchor: 'end',
                                        align: 'left',
                                        font: { weight: 'bold' },
                                        formatter: (value) => value > 0 ? value : ''
                                    }
                                }
                            }
                        });

                        // 3. Tendencia Mensual (Todos los meses con datos)
                        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                        const trendData = {};
                        const uniqueMonths = new Set();
                        
                        rawReportsData.forEach(r => {
                            const d = new Date(r.timestamp);
                            uniqueMonths.add(d.getFullYear() + '-' + d.getMonth());
                        });

                        const sortedMonths = Array.from(uniqueMonths).map(key => {
                            const parts = key.split('-');
                            return { year: parseInt(parts[0]), month: parseInt(parts[1]), key: key };
                        }).sort((a, b) => (a.year - b.year) || (a.month - b.month));

                        sortedMonths.forEach(sm => {
                            trendData[sm.key] = { label: monthNames[sm.month], resuelto: 0, pendiente: 0 };
                        });

                        rawReportsData.forEach(r => {
                            const d = new Date(r.timestamp);
                            const key = d.getFullYear() + '-' + d.getMonth();
                            if (r.status === 'Resuelto') trendData[key].resuelto++;
                            else trendData[key].pendiente++;
                        });

                        const trendKeys = Object.keys(trendData);
                        new Chart(document.getElementById('chart-trend'), {
                            type: 'bar',
                            data: {
                                labels: trendKeys.map(k => trendData[k].label),
                                datasets: [
                                    {
                                        label: 'Resuelto',
                                        data: trendKeys.map(k => trendData[k].resuelto),
                                        backgroundColor: '#2e7d32',
                                        stack: 'Stack 0',
                                    },
                                    {
                                        label: 'Pendiente',
                                        data: trendKeys.map(k => trendData[k].pendiente),
                                        backgroundColor: '#d32f2f',
                                        stack: 'Stack 0',
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
                                plugins: { 
                                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                                    datalabels: {
                                        color: '#fff',
                                        font: { weight: 'bold' },
                                        formatter: (value) => value > 0 ? value : ''
                                    }
                                }
                            }
                        });

                        // 4. Pendientes Críticos
                        const pendingReports = rawReportsData.filter(r => r.status !== 'Resuelto');
                        pendingReports.forEach(r => {
                            const diffTime = Math.abs(now - new Date(r.timestamp));
                            r.daysPending = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        });
                        
                        // Sort by daysPending desc
                        pendingReports.sort((a, b) => b.daysPending - a.daysPending);
                        const topCritical = pendingReports.slice(0, 5); // Tomamos los top 5
                        
                        const tbody = document.querySelector('#critical-table tbody');
                        tbody.innerHTML = '';
                        if (topCritical.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">No hay reportes pendientes críticos.</td></tr>';
                        } else {
                            topCritical.forEach(r => {
                                const tr = document.createElement('tr');
                                const isDanger = r.daysPending > 30 ? 'danger-text' : '';
                                tr.innerHTML = '<td><strong>' + (r.title || 'Sin título') + '</strong></td>' +
                                               '<td class="' + isDanger + '">' + r.daysPending + '</td>' +
                                               '<td>' + r.reminderCount + '/4</td>' +
                                               '<td>' + (r.location || 'N/A') + '</td>';
                                tbody.appendChild(tr);
                            });
                        }
                    }

                    function filterTable() {
                        const table = document.getElementById("reports-table");
                        const tr = table.getElementsByTagName("tbody")[0].getElementsByTagName("tr");
                        const filters = document.getElementsByClassName("filter-input");

                        for (let i = 0; i < tr.length; i++) {
                            let showRow = true;
                            const td = tr[i].getElementsByTagName("td");
                            for (let j = 0; j < filters.length; j++) {
                                const val = filters[j].value.toLowerCase();
                                if (val && td[j + 1]) {
                                    const txt = td[j + 1].textContent || td[j + 1].innerText;
                                    if (txt.toLowerCase().indexOf(val) === -1) {
                                        showRow = false;
                                        break;
                                    }
                                }
                            }
                            tr[i].style.display = showRow ? "" : "none";
                        }
                    }

                    function clearFilters() {
                        const filters = document.getElementsByClassName("filter-input");
                        for (let f of filters) f.value = "";
                        filterTable();
                    }

                    function exportToExcel() {
                        const table = document.getElementById("reports-table");
                        const wb = XLSX.utils.table_to_book(table, { sheet: "Reportes" });
                        
                        // Nombre del archivo con fecha
                        const date = new Date().toISOString().split('T')[0];
                        XLSX.writeFile(wb, "Reporte_AgroReporte_" + date + ".xlsx");
                    }

                    async function closeTicket(id, existingEmail) {
                        const password = localStorage.getItem('agro_admin_pass');
                        if (!password) { alert('Ingresa la clave'); return; }

                        let manualEmail = '';
                        if (!existingEmail) {
                            manualEmail = document.getElementById('email-' + id).value;
                        }

                        if (confirm('¿Cerrar este ticket?')) {
                            const url = window.location.pathname.replace('/html', '/' + id);
                            const res = await fetch(url, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                    status: 'Resuelto', 
                                    manualEmail: manualEmail,
                                    password: password 
                                })
                            });

                            if (res.status === 401) {
                                alert('Clave incorrecta');
                                localStorage.removeItem('agro_admin_pass');
                                location.reload();
                                return;
                            }

                            if (res.ok) { alert('Ticket marcado como Resuelto'); location.reload(); }
                            else { alert('Error al actualizar el ticket'); }
                        }
                    }

                    function toggleSelectAll() {
                        const mainCb = document.getElementById('select-all');
                        const cbs = document.getElementsByClassName('report-checkbox');
                        for (let cb of cbs) {
                            if (!cb.disabled) cb.checked = mainCb.checked;
                        }
                        updateSelectedCount();
                    }

                    function updateSelectedCount() {
                        const cbs = document.getElementsByClassName('report-checkbox');
                        let count = 0;
                        for (let cb of cbs) {
                            if (cb.checked) count++;
                        }
                        document.getElementById('selected-count').innerText = count;
                        document.getElementById('bulk-close-btn').style.display = count > 0 ? 'inline-block' : 'none';
                    }

                    async function bulkClose() {
                        const password = localStorage.getItem('agro_admin_pass');
                        if (!password) { alert('Ingresa la clave'); return; }

                        const cbs = document.getElementsByClassName('report-checkbox');
                        const ids = [];
                        for (let cb of cbs) {
                            if (cb.checked) ids.push(cb.value);
                        }

                        if (ids.length === 0) return;

                        if (confirm('¿Cerrar ' + ids.length + ' reportes de forma masiva? (Se enviarán correos individuales)')) {
                            const btn = document.getElementById('bulk-close-btn');
                            const originalText = btn.innerHTML;
                            btn.innerHTML = '⚙️ Procesando...';
                            btn.disabled = true;

                            try {
                                const url = window.location.pathname.replace('/html', '/bulk-close');
                                const res = await fetch(url, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ids, password })
                                });

                                const data = await res.json();
                                if (res.ok) {
                                    alert('Operación completada:\\n- Cerrados: ' + data.closed + '\\n- Errores: ' + data.errors.length);
                                    location.reload();
                                } else {
                                    alert('Error: ' + (data.error || 'Fallo desconocido'));
                                }
                            } catch (e) {
                                alert('Fallo de conexión: ' + e.message);
                            } finally {
                                btn.innerHTML = originalText;
                                btn.disabled = false;
                            }
                        }
                    }

                    async function sendManualReminder(id) {
                        const password = localStorage.getItem('agro_admin_pass');
                        if (!password) { alert('Ingresa la clave'); return; }

                        if (confirm('¿Enviar un recordatorio por correo al solicitante ahora?')) {
                            try {
                                const url = window.location.pathname.replace('/html', '/' + id + '/remind');
                                const res = await fetch(url, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ password })
                                });
                                
                                const data = await res.json();
                                if (res.ok) {
                                    alert('Recordatorio enviado con éxito. Conteo: ' + data.reminderCount);
                                    location.reload();
                                } else {
                                    alert('Error: ' + (data.error || 'No se pudo enviar'));
                                }
                            } catch (e) {
                                alert('Error de conexión');
                            }
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error("Error panel:", error);
        res.status(500).send(`
            <h1>Error al generar panel administrativo</h1>
            <p><strong>Detalle:</strong> ${error.message}</p>
            <p>Es posible que necesites crear un índice en Firebase Firestore para esta consulta.</p>
        `);
    }
});

exports.api = onRequest({
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 540 // Aumentado a 9 minutos para procesar cierres masivos con correos
}, app);

// ── Recordatorios Semanales ──────────────────────────────────────────────────
// Se ejecuta todos los lunes a las 8:00 AM (hora Bolivia, UTC-4)
// Envía recordatorio al solicitante cuyo ticket sigue pendiente (máx. 4 recordatorios)
exports.sendWeeklyReminders = onSchedule({
    schedule: "0 8 * * 1",
    timeZone: "America/La_Paz",
    region: "us-central1",
    memory: "256MiB",
}, async (event) => {
    console.log("🔔 Iniciando envío de recordatorios semanales...");

    const MAX_REMINDERS = 4;   // Máximo 4 recordatorios por ticket (≈ 1 mes)
    const MIN_AGE_DAYS = 7;    // Solo tickets con más de 7 días sin resolver
    const ADMIN_CC = "flacio@agrocentro.com.bo";

    try {
        const snapshot = await db.collection('reports')
            .where('status', '!=', 'Resuelto')
            .get();

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: { rejectUnauthorized: false }
        });

        const now = new Date();
        let sent = 0;
        let skipped = 0;

        for (const docSnap of snapshot.docs) {
            const report = docSnap.data();

            // Omitir si no tiene correo registrado
            if (!report.reporterEmail) { skipped++; continue; }

            // Omitir si el ticket tiene menos de 7 días (aún reciente)
            const createdAt = new Date(report.timestamp);
            const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
            if (diffDays < MIN_AGE_DAYS) { skipped++; continue; }

            // Omitir si ya se superó el límite de recordatorios
            const reminderCount = report.reminderCount || 0;
            if (reminderCount >= MAX_REMINDERS) { skipped++; continue; }

            const weekNumber = reminderCount + 1;
            const createdDate = createdAt.toLocaleString('es-BO', { timeZone: 'America/La_Paz' });

            try {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"AgroReporte" <no-reply@agrocentro.com.bo>',
                    to: report.reporterEmail,
                    cc: ADMIN_CC,
                    subject: `⏳ Recordatorio #${weekNumber}: Tu reporte "${report.title}" aún está pendiente`,
                    html: `
                        <h2 style="color:#e65100;">⏳ Tu solicitud aún no ha sido atendida</h2>
                        <p>Hola <strong>${report.reporterName || 'Usuario'}</strong>,</p>
                        <p>Te informamos que tu reporte registrado en AgroReporte todavía no ha sido marcado como resuelto.</p>
                        <p>Nuestro equipo de mantenimiento está trabajando para atender tu solicitud lo antes posible.</p>
                        <hr>
                        <p><strong>Detalles del reporte:</strong></p>
                        <ul>
                            <li><strong>Título:</strong> ${report.title}</li>
                            <li><strong>Predio / Ubicación:</strong> ${report.predio || 'N/A'} - ${report.location || 'N/A'}</li>
                            <li><strong>Categoría:</strong> ${report.category}</li>
                            <li><strong>Fecha de registro:</strong> ${createdDate}</li>
                            <li><strong>Estado actual:</strong> ${report.status}</li>
                        </ul>
                        <p style="color:#888;font-size:12px;">Recordatorio ${weekNumber} de ${MAX_REMINDERS}. Recibirás un correo semanal hasta que tu solicitud sea atendida o se alcance el máximo de recordatorios.</p>
                        <br>
                        <p><em>Equipos de Mantenimiento - Agrocentro</em></p>
                    `
                });

                // Actualizar conteo y fecha del último recordatorio
                await docSnap.ref.update({
                    reminderCount: reminderCount + 1,
                    lastReminderSentAt: now.toISOString()
                });

                sent++;
                console.log(`📨 Recordatorio #${weekNumber} enviado a: ${report.reporterEmail} (ticket: ${docSnap.id})`);
            } catch (emailErr) {
                console.error(`❌ Error enviando recordatorio a ${report.reporterEmail}:`, emailErr.message);
            }
        }

        console.log(`✅ Job finalizado: ${sent} recordatorios enviados, ${skipped} omitidos.`);
    } catch (error) {
        console.error("💥 Error en sendWeeklyReminders:", error);
    }
});
