// ============================================
// FIREBASE CONFIG — Frota App
// Config pública (safe pra front-end).
// TODO: substituir pelos valores do seu projeto
// (console.firebase.google.com → Configurações do projeto → Seus apps)
// ============================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyCQFfC65fDlwFdwsbKgFR0MTzdKHUTckQs",
  authDomain: "segaut-35.firebaseapp.com",
  projectId: "segaut-35",
  storageBucket: "segaut-35.firebasestorage.app",
  messagingSenderId: "645444927362",
  appId: "1:645444927362:web:d51a7efd6eb9c41b75199b"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('Erro ao configurar persistência:', err);
});

export const db = getFirestore(app);
export const storage = getStorage(app);

export { app };
