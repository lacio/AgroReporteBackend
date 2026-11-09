const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");
require('dotenv').config();

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

async function testConnection() {
    console.log("Intentando conectar a Firebase con Project ID:", firebaseConfig.projectId);
    try {
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const querySnapshot = await getDocs(collection(db, "reports"));
        console.log("✅ Conexión exitosa. Documentos encontrados en 'reports':", querySnapshot.size);
        process.exit(0);
    } catch (error) {
        console.error("❌ Error al conectar a Firebase:", error.message);
        process.exit(1);
    }
}

testConnection();
