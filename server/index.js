
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Cargar variables de entorno

const app = express();
const port = process.env.PORT || 3000;

// Firebase Configuration
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, getDocs, query, where, limit } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Middleware
const corsOptions = {
  origin: (origin, callback) => {
    // Expresión regular que coincide con las URLs de Vercel para este proyecto y localhost.
    const allowedOriginsRegex = /^https:\/\/agroreporte-client.*\.vercel\.app$/;
    const isAllowed = !origin || origin.startsWith('http://localhost') || allowedOriginsRegex.test(origin);

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // Allow cookies to be sent
  optionsSuccessStatus: 204, // For preflight requests
};

app.use(cors()); // Permitir todo para el demo (soluciona problemas de bloqueo de IP/Celular)
app.use(express.json({ limit: '20mb' })); // Aumentar límite para las imágenes en base64

// Middleware de logging para depuración
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

const { parseVoiceReport } = require('./services/voiceParser');

// Endpoint raíz para Health Check (importante para Railway/deployments)
app.get('/', (req, res) => {
  res.send('AgroReporte Backend is running correctly! 🚀');
});

// Endpoint para procesar notas de voz y estructurar el ticket con IA
const handleVoiceReport = async (req, res) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'No se proporcionó audio para procesar.' });
    }

    console.log(`🎙️ Procesando audio con Gemini Flash (mime: ${mimeType || 'audio/mp4'})...`);
    const parsedData = await parseVoiceReport(audio, mimeType);
    console.log('✅ Audio categorizado exitosamente por IA:', parsedData);

    return res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('❌ Error al procesar audio con IA:', error);
    return res.status(500).json({
      error: 'Error al procesar el audio con inteligencia artificial.',
      details: error.message
    });
  }
};

app.post('/parse-audio-report', handleVoiceReport);
app.post('/api/parse-audio-report', handleVoiceReport);


// Endpoint para obtener todos los reportes
app.get('/reports', async (req, res) => {
  try {
    const reportsCol = collection(db, 'reports');
    const reportSnapshot = await getDocs(reportsCol);
    const reportsList = reportSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(reportsList);
  } catch (error) {
    console.error("Error al obtener reportes de Firestore:", error);
    res.status(500).send("Error al obtener reportes");
  }
});

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false // Helps with some self-signed certs or strict office365 checks
  }
});

transporter.verify(function (error, success) {
  if (error) {
    console.warn("⚠️ Error configurando SMTP:", error);
  } else {
    console.log("✅ Servidor SMTP listo para enviar correos");
  }
});

const recipientMap = {
  'servicios-generales': process.env.EMAIL_SERVICIOS_GENERALES || 'asandoval@agrocentro.com.bo',
  'tecnologia': 'fabio.lacio@agrocentro.com.bo',
  'ssma': 'asandoval@agrocentro.com.bo',
  'otros': 'fabio.lacio@agrocentro.com.bo', // Opcional: un destinatario por defecto para 'Otros'
};

// Endpoint para crear un nuevo reporte
app.post('/reports', async (req, res) => {
  try {
    // Desestructura y sanitiza los datos del cuerpo de la petición
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
      isAnonymous
    } = req.body;

    // --- IDEMPOTENCIA ---
    // Si el cliente envió un ID único, verificar si ya existe un reporte con ese ID
    if (clientReportId) {
      const reportsRef = collection(db, 'reports');
      const q = query(reportsRef, where("clientReportId", "==", clientReportId), limit(1));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const existingDoc = querySnapshot.docs[0];
        console.log(`♻️ Reporte duplicado detectado (clientReportId: ${clientReportId}). Retornando existente.`);
        return res.status(200).json({ id: existingDoc.id, ...existingDoc.data(), duplicated: true });
      }
    }
    // ---------------------

    const rawImages = Array.isArray(images) ? images.filter(img => typeof img === 'string' && img.length > 0) : [];
    
    // Sanitizar imágenes para Firestore: Evitar exceder el límite de 1MB de documento
    let currentSize = 0;
    const firestoreImages = [];
    for (const img of rawImages) {
      if (currentSize + img.length < 700000) {
        firestoreImages.push(img);
        currentSize += img.length;
      } else {
        console.warn(`⚠️ Omitiendo imagen adicional en Firestore para no superar el límite de 1MB`);
      }
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
      imagesCount: rawImages.length,
      reporterName: reporterName || '',
      reporterEmail: reporterEmail || '',
      isAnonymous: false,
      timestamp: new Date().toISOString(),
      status: 'Pendiente de revisión',
    };

    const docRef = await addDoc(collection(db, 'reports'), newReport);

    console.log('Reporte recibido y guardado con ID:', docRef.id);

    const imagesForEmail = rawImages;

    // IMPORTANTE: Responder al cliente lo antes posible para evitar timeouts 
    // mientras se envía el correo electrónico (operación lenta)
    res.status(201).json({ id: docRef.id, ...newReport });

    const recipient = recipientMap[newReport.category];

    if (recipient && transporter) {
      const mailOptions = {
        from: process.env.SMTP_FROM || '"AgroReporte" <no-reply@agrocentro.com.bo>',
        to: recipient,
        subject: `Nuevo Reporte de Incidente: ${newReport.title}`,
        html: `
          <h1>Nuevo Reporte de Incidente</h1>
          <p><strong>Categoría:</strong> ${newReport.category}</p>
          <p><strong>Título:</strong> ${newReport.title}</p>
          <p><strong>Reportado por:</strong> ${newReport.reporterName}</p>
          <p><strong>Ubicación:</strong> ${newReport.location}</p>
          <p><strong>Descripción:</strong></p>
          <p>${newReport.description}</p>
          <p><strong>Estado:</strong> ${newReport.status}</p>
          <p><strong>Fecha:</strong> ${new Date(newReport.timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p>
          <br>
          <p><em>Este es un correo generado automáticamente. No es necesario responder a este mensaje.</em></p>
        `,
        attachments: [],
      };

      // Verificación de imágenes
      if (imagesForEmail.length > 0) {
        mailOptions.attachments = imagesForEmail.map((base64Image, index) => {
          // Asegurar que obtenemos la parte pura de base64
          const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          let content = base64Image;

          if (matches && matches.length === 3) {
            content = matches[2]; // El contenido real sin el prefijo
          } else if (base64Image.includes(',')) {
            content = base64Image.split(',')[1];
          }

          return {
            filename: `incidente-${index + 1}.jpg`,
            content: content,
            encoding: 'base64'
          };
        });

        mailOptions.html += '<h2>Imágenes Adjuntas:</h2>';
        imagesForEmail.forEach((base64Image, index) => {
          // Use standard embedded base64 for simplicity in the body preview
          mailOptions.html += `<p><strong>Imagen ${index + 1}:</strong></p><img src="${base64Image}" alt="incidente-${index + 1}.jpg" style="max-width: 400px; height: auto;"/>`;
        });
      }

      // Envía el correo
      try {
        const info = await transporter.sendMail(mailOptions);
        console.log("📨 Correo enviado: %s", info.messageId);
      } catch (error) {
        console.error("❌ Error enviando correo:", error);
      }
    } else if (!transporter) {
      console.log("ℹ️ Correo omitido: Servicio SMTP no configurado.");
    }

    // El correo se envía en segundo plano, la respuesta ya fue enviada arriba
  } catch (error) {
    console.error("Error al guardar reporte en Firestore:", error);
    res.status(500).send("Error al guardar reporte");
  }
});

// Endpoint para actualizar el estado de un reporte (Cierre de ticket)
app.put('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, manualEmail, password } = req.body;

    // Validación de seguridad sencilla
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).send("No autorizado");
    }

    const reportRef = doc(db, 'reports', id);
    const reportSnap = await getDoc(reportRef);

    if (!reportSnap.exists()) {
      return res.status(404).send("Reporte no encontrado");
    }

    const reportData = reportSnap.data();
    await updateDoc(reportRef, { status: status || 'Resuelto' });

    // Lógica de notificación por correo
    const targetEmail = manualEmail || reportData.reporterEmail;

    if (targetEmail && transporter && status === 'Resuelto') {
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
        console.log(`📨 Correo de cierre enviado a: ${targetEmail}`);
      } catch (error) {
        console.error("❌ Error enviando correo de cierre:", error);
      }
    }

    res.json({ id, status: 'Resuelto', emailSent: !!targetEmail });
  } catch (error) {
    console.error("Error al actualizar reporte:", error);
    res.status(500).send("Error al actualizar reporte");
  }
});

const { doc, getDoc, updateDoc } = require("firebase/firestore");

// Endpoint para generar un reporte HTML
app.get('/reports/html', async (req, res) => {
  try {
    const reportsCol = collection(db, 'reports');
    const reportSnapshot = await getDocs(reportsCol);

    // Filtrar y Ordenar: Solo desde el 1 de Febrero 2026, lo más reciente primero
    const FECHA_MINIMA = '2026-02-01';
    const reportsList = reportSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(report => {
        if (!report.timestamp || report.timestamp < FECHA_MINIMA) return false;
        const title = (report.title || '').toLowerCase();
        return !title.includes('prueba') && !title.includes('test');
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const generateHTML = (reports) => {
      let tableRows = '';
      reports.forEach(report => {

        let imageTag = 'No hay imagen';
        // Comprobar si el campo 'images' existe, es un array y no está vacío
        if (report.images && Array.isArray(report.images) && report.images.length > 0) {
          const imgData = report.images[0];
          // Solo agregar el prefijo si no lo tiene ya
          const imgSrc = imgData.startsWith('data:') ? imgData : `data:image/jpeg;base64,${imgData}`;
          imageTag = `<img src="${imgSrc}" alt="Imagen del Reporte" width="200">`;
        }

        let actionHtml = '';
        if (report.status !== 'Resuelto') {
          actionHtml = `
            <div id="actions-${report.id}">
              ${!report.reporterEmail ? '<input type="email" id="email-' + report.id + '" placeholder="Email opcional" style="margin-bottom:5px; width:100%;">' : ''}
              <button onclick="closeTicket('${report.id}', '${report.reporterEmail || ''}')" style="background-color: #2e7d32; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; width: 100%;">Cerrar Ticket</button>
            </div>
          `;
        } else {
          actionHtml = '<span style="color: green; font-weight: bold;">✓ Finalizado</span>';
        }

        const fullLocation = report.predio ? `${report.predio} - ${report.location || ''}` : (report.location || 'N/A');

        tableRows += `
          <tr>
            <td>${report.id}</td>
            <td>${report.title || 'N/A'}</td>
            <td>${report.reporterName || 'N/A'}<br><small style="color: #666;">${report.reporterEmail || ''}</small></td>
            <td>${new Date(report.timestamp).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</td>
            <td>${fullLocation}</td>
            <td>${report.status || 'N/A'}</td>
            <td>${report.category || 'N/A'}</td>
            <td>${imageTag}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      });

      return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reporte de Incidentes</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 2em; color: #333; }
            h1 { color: #1a73e8; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
            th { background-color: #f2f2f2; font-weight: 600; position: sticky; top: 0; z-index: 10; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            tr:hover { background-color: #f1f1f1; }
            img { max-width: 100%; height: auto; border-radius: 4px; }
            .filter-row th { padding: 5px; background-color: #eee; }
            .filter-input { width: 100%; padding: 6px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; }
            .btn-clear { margin-bottom: 15px; padding: 8px 15px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .btn-clear:hover { background: #444; }
            
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
            
            .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .chart-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .chart-card h3 { margin-top: 0; margin-bottom: 15px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
            
            @media (max-width: 768px) {
              .charts-grid { grid-template-columns: 1fr; }
            }
          </style>
        </head>
        <body>
          <h1>Reporte de Incidentes - AgroReporte</h1>
          <p>Reporte generado el: ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</p>
          
          <div id="login-container" style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <label>Acceso Administrativo:</label>
            <input type="password" id="admin-password" placeholder="Ingresa la clave" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <button onclick="savePassword()" style="padding: 8px 15px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer;">Entrar</button>
          </div>

          <div id="admin-panel" style="display: none;">
            <div class="tabs">
              <div class="tab active" onclick="switchTab('dashboard')">Dashboard Ejecutivo</div>
              <div class="tab" onclick="switchTab('table')">Lista de Reportes</div>
            </div>

            <div id="view-dashboard" class="dashboard-container active">
              <div class="kpi-grid">
                <div class="kpi-card" style="border-left-color: #2e7d32;">
                  <h3>Reportes Registrados</h3>
                  <div class="value" id="kpi-total">0</div>
                  <div class="subtitle">ingresos en el periodo</div>
                </div>
                <div class="kpi-card" style="border-left-color: #1a73e8;">
                  <h3>Resueltos</h3>
                  <div class="value" id="kpi-resolved">0</div>
                  <div class="subtitle" id="kpi-resolved-rate">0% de cierre</div>
                </div>
                <div class="kpi-card" style="border-left-color: #ff9800;">
                  <h3>Pendientes</h3>
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
              </div>
            </div>

            <div id="view-table" class="table-container">
              <button onclick="clearFilters()" class="btn-clear">Limpiar Filtros</button>
              <table id="reports-table">
                <thead>
                  <tr>
                    <th style="width: 50px;">ID</th>
                    <th>Título</th>
                    <th>Solicitante</th>
                    <th>Fecha</th>
                    <th>Lugar</th>
                    <th>Estado</th>
                    <th>Categoría</th>
                    <th style="width: 220px;">Imagen</th>
                    <th style="width: 120px;">Acción</th>
                  </tr>
                  <tr class="filter-row">
                    <th><input type="text" class="filter-input" onkeyup="filterTable(0)" placeholder="ID..."></th>
                    <th><input type="text" class="filter-input" onkeyup="filterTable(1)" placeholder="Buscar..."></th>
                    <th><input type="text" class="filter-input" onkeyup="filterTable(2)" placeholder="Filtrar..."></th>
                    <th><input type="text" class="filter-input" onkeyup="filterTable(3)" placeholder="Fecha..."></th>
                    <th><input type="text" class="filter-input" onkeyup="filterTable(4)" placeholder="Lugar..."></th>
                    <th><input type="text" class="filter-input" onkeyup="filterTable(5)" placeholder="Estado..."></th>
                    <th><input type="text" class="filter-input" onkeyup="filterTable(6)" placeholder="Categoría..."></th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
          </div>

          <script>
            // Inject raw data for dashboard
            const rawReportsData = ${JSON.stringify(reportsList.map(r => ({status: r.status, category: r.category, timestamp: r.timestamp})))};
            let dashboardRendered = false;

            // Al cargar, verificar si ya hay una clave guardada
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
              document.getElementById('login-container').style.background = '#e8f0fe';
              document.querySelector('#login-container button').innerText = 'Clave Guardada';
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
              const total = rawReportsData.length;
              const resolved = rawReportsData.filter(r => r.status === 'Resuelto').length;
              const pending = total - resolved;
              const resolvedRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
              
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
              const criticalAlerts = rawReportsData.filter(r => r.status !== 'Resuelto' && new Date(r.timestamp) < thirtyDaysAgo).length;

              document.getElementById('kpi-total').innerText = total;
              document.getElementById('kpi-resolved').innerText = resolved;
              document.getElementById('kpi-resolved-rate').innerText = resolvedRate + '% de cierre';
              document.getElementById('kpi-pending').innerText = pending;
              document.getElementById('kpi-alerts').innerText = criticalAlerts;

              // Chart Status
              new Chart(document.getElementById('chart-status'), {
                type: 'doughnut',
                data: {
                  labels: ['Resuelto', 'Pendiente'],
                  datasets: [{
                    data: [resolved, pending],
                    backgroundColor: ['#2e7d32', '#ff9800'],
                    borderWidth: 0
                  }]
                },
                options: { cutout: '70%', responsive: true, maintainAspectRatio: false }
              });

              // Chart Category
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
                  plugins: { legend: { display: false } }
                }
              });
            }

            function filterTable() {
              const table = document.getElementById("reports-table");
              const tr = table.getElementsByTagName("tbody")[0].getElementsByTagName("tr");
              const filters = document.getElementsByClassName("filter-input");

              for (let i = 0; i < tr.length; i++) {
                let showRow = true;
                const td = tr[i].getElementsByTagName("td");

                for (let j = 0; j < filters.length; j++) {
                  const filterValue = filters[j].value.toLowerCase();
                  if (filterValue && td[j]) {
                    const cellContent = td[j].textContent || td[j].innerText;
                    if (cellContent.toLowerCase().indexOf(filterValue) === -1) {
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
              for (let i = 0; i < filters.length; i++) {
                filters[i].value = "";
              }
              filterTable();
            }

            async function closeTicket(id, existingEmail) {
              const password = localStorage.getItem('agro_admin_pass');
              if (!password) {
                alert('Por favor, ingresa la clave primero.');
                return;
              }

              let manualEmail = '';
              if (!existingEmail) {
                const emailInput = document.getElementById('email-' + id);
                manualEmail = emailInput ? emailInput.value : '';
              }

              if (confirm('¿Estás seguro de cerrar este ticket?')) {
                try {
                  const response = await fetch('/reports/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      status: 'Resuelto', 
                      manualEmail: manualEmail,
                      password: password 
                    })
                  });
                  
                  if (response.status === 401) {
                    alert('Clave incorrecta. Por favor vuelve a intentarlo.');
                    localStorage.removeItem('agro_admin_pass');
                    location.reload();
                    return;
                  }

                  if (response.ok) {
                    alert('Ticket cerrado con éxito');
                    location.reload();
                  } else {
                    alert('Error al cerrar el ticket');
                  }
                } catch (error) {
                  console.error('Error:', error);
                  alert('Error de conexión');
                }
              }
            }
          </script>
        </body>
        </html>
      `;
    };

    const htmlReport = generateHTML(reportsList);
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlReport);

  } catch (error) {
    console.error("Error al generar reporte HTML:", error);
    res.status(500).send("Error al generar el reporte");
  }
});

app.listen(port, () => {
  console.log(`Servidor de AgroReporte escuchando en http://localhost:${port}`);
});
