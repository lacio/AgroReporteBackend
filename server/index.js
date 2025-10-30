
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Cargar variables de entorno

const app = express();
const port = 3000;

// Firebase Configuration
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, getDocs } = require("firebase/firestore");

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

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Aumentar límite para las imágenes en base64

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

// Configuración de Nodemailer (asegúrate de tener estas variables en tu .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const recipientMap = {
  'servicios-generales': 'screspo@agrocentro.com.bo',
  'tecnologia': 'fabio.lacio@agrocentro.com.bo',
  'ssma': 'asandoval@agrocentro.com.bo',
  'otros': 'fabio.lacio@agrocentro.com.bo', // Opcional: un destinatario por defecto para 'Otros'
};

// Endpoint para crear un nuevo reporte
app.post('/reports', async (req, res) => {
  try {
    // Desestructura y sanitiza los datos del cuerpo de la petición
    const {
      title,
      description,
      location,
      category,
      priority,
      images,
      reporterName,
      isAnonymous
    } = req.body;

    const newReport = {
      title: title || '',
      description: description || '',
      location: location || '',
      category: category || 'otros',
      priority: priority || 'normal',
      images: images || [],
      reporterName: reporterName || (isAnonymous ? 'Anónimo' : ''),
      isAnonymous: !!isAnonymous, // Asegura que sea un booleano
      timestamp: new Date().toISOString(),
      status: 'Pendiente de revisión',
    };

    // DEBUG: Eliminar temporalmente el campo de imágenes para aislar el problema
    //delete newReport.images;

    // DEBUG: Imprimir el objeto exacto que se enviará a Firestore
    console.log("DEBUG: Objeto a guardar en Firestore:", JSON.stringify(newReport, null, 2));

    const docRef = await addDoc(collection(db, 'reports'), newReport);
    console.log('Reporte recibido y guardado con ID:', docRef.id);

    // Envío de correo electrónico
    const recipient = recipientMap[newReport.category];
    console.log('🔍 Categoría recibida:', newReport.category);
    console.log('📬 Destinatario resuelto:', recipientMap[newReport.category]);
    // === DIAGNÓSTICO TEMPORAL ===
    console.log("🔍 DEBUG: report.category =", JSON.stringify(newReport.category));
    console.log("🔍 DEBUG: recipientMap =", recipientMap);
    
    console.log("🔍 DEBUG: recipient encontrado =", recipient);
// === FIN DIAGNÓSTICO ===
    if (recipient) {
      const mailOptions = {
        from: process.env.SMTP_FROM || 'reportes@agrocentro.com.bo', // Remitente
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
          <p><strong>Fecha:</strong> ${new Date(newReport.timestamp).toLocaleString()}</p>
          <br>
          <p><em>Este es un correo generado automáticamente. No es necesario responder a este mensaje.</em></p>
        `,
        attachments: [],
      };

      // Adjuntar imágenes si existen
      if (report.images && Array.isArray(report.images) && report.images.length > 0) {
        mailOptions.attachments = report.images.map((base64Image, index) => ({
          filename: `incidente-${index + 1}.jpg`,
          content: base64Image,
          encoding: 'base64',
          cid: `incidente-imagen-${index}` // content-id
        }));
          // Opcional: Incrustar la primera imagen en el HTML
        mailOptions.html += '<h2>Imágenes Adjuntas:</h2>';
        mailOptions.attachments.forEach((att, index) => {
            mailOptions.html += `<p><strong>Imagen ${index + 1}:</strong></p><img src="cid:${att.cid}" alt="${att.filename}" style="max-width: 400px; height: auto;"/>`;
        });
      }


      // Envía el correo
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log('Error al enviar el correo:', error);
        }
        console.log('Correo enviado:', info.response);
      });
    }

    res.status(201).json({ id: docRef.id, ...newReport });
  } catch (error) {
    console.error("Error al guardar reporte en Firestore:", error);
    res.status(500).send("Error al guardar reporte");
  }
});

// Endpoint para generar un reporte HTML
app.get('/reports/html', async (req, res) => {
  try {
    const reportsCol = collection(db, 'reports');
    const reportSnapshot = await getDocs(reportsCol);
    const reportsList = reportSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const generateHTML = (reports) => {
      let tableRows = '';
      reports.forEach(report => {
        
        let imageTag = 'No hay imagen';
        // Comprobar si el campo 'images' existe, es un array y no está vacío
        if (report.images && Array.isArray(report.images) && report.images.length > 0) {
          // Añadir el prefijo del data URI para que el navegador renderice la imagen Base64
          imageTag = `<img src="data:image/jpeg;base64,${report.images[0]}" alt="Imagen del Reporte" width="200">`;
        }

        tableRows += `
          <tr>
            <td>${report.id}</td>
            <td>${report.title || 'N/A'}</td>
            <td>${report.reporterName || 'N/A'}</td>
            <td>${new Date(report.timestamp).toLocaleString()}</td>
            <td>${report.location || 'N/A'}</td>
            <td>${report.status || 'N/A'}</td>
            <td>${report.category || 'N/A'}</td>
            <td>${report.description || 'N/A'}</td>
            <td>${imageTag}</td>
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
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 2em; color: #333; }
            h1 { color: #1a73e8; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; vertical-align: middle; }
            th { background-color: #f2f2f2; font-weight: 600; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            tr:hover { background-color: #f1f1f1; }
            img { max-width: 200px; height: auto; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>Reporte de Incidentes - AgroReporte</h1>
          <p>Reporte generado el: ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>ID del Reporte</th>
                <th>Título</th>
                <th>Reportero</th>
                <th>Fecha</th>
                <th>Lugar Específico</th>
                <th>Estado</th>
                <th>Categoría</th>
                <th>Descripción</th>
                <th>Imagen</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
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
