// Login, cadastro, logout e guard de rota.

import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  deleteUser,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export function homeForRole(role) {
  return role === 'admin' ? '/pages/admin/history.html' : '/pages/home.html';
}

export async function getDriverProfile(uid) {
  const snap = await getDoc(doc(db, 'drivers', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const driver = await getDriverProfile(cred.user.uid);
  return { user: cred.user, driver };
}

export async function registerDriver({ name, matricula, email, password }) {
  // Cria o Auth primeiro: a checagem de matrícula única lê a coleção
  // "drivers" no Firestore, e as regras de segurança exigem estar
  // autenticado pra isso (isSignedIn()). Se a matrícula já existir,
  // desfaz o cadastro no Auth.
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  try {
    const dupes = await getDocs(
      query(collection(db, 'drivers'), where('matricula', '==', matricula))
    );
    if (!dupes.empty) {
      await deleteUser(cred.user);
      throw new Error('matricula-exists');
    }

    const driver = {
      name,
      matricula,
      email,
      role: 'driver',
      defaultVehicleId: null,
      active: true,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'drivers', cred.user.uid), driver);
    return { user: cred.user, driver };
  } catch (error) {
    // Qualquer falha depois de criar o Auth desfaz o usuário, pra não
    // sobrar conta órfã sem perfil no Firestore.
    if (error.message !== 'matricula-exists') {
      await deleteUser(cred.user).catch(() => {});
    }
    throw error;
  }
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  await signOut(auth);
  window.location.replace('/login.html');
}

// Guard de rota: resolve com { user, driver } ou redireciona pro login.
// adminOnly: exige role admin (senão manda pra home do condutor).
export function requireAuth({ adminOnly = false } = {}) {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) {
        window.location.replace('/login.html');
        return;
      }
      const driver = await getDriverProfile(user.uid);
      if (!driver) {
        // Auth existe mas sem perfil — volta pro login
        await signOut(auth);
        window.location.replace('/login.html');
        return;
      }
      if (adminOnly && driver.role !== 'admin') {
        window.location.replace('/pages/home.html');
        return;
      }
      resolve({ user, driver: { ...driver, id: user.uid } });
    });
  });
}

// Mensagens amigáveis pros códigos do Firebase Auth
export function authErrorMessage(error) {
  const code = error?.code || error?.message || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Email ou senha inválidos.';
  }
  if (code.includes('email-already-in-use')) return 'Este email já está cadastrado.';
  if (code.includes('invalid-email')) return 'Email inválido.';
  if (code.includes('weak-password')) return 'Senha muito fraca (mínimo 6 caracteres).';
  if (code.includes('matricula-exists')) return 'Esta matrícula já está cadastrada.';
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde um momento.';
  if (code.includes('network')) return 'Sem conexão. Verifique sua internet.';
  if (code.includes('permission-denied')) return 'Sem permissão para esta ação. Verifique as regras do Firestore.';
  if (code.includes('api-key-not-valid')) return 'Chave do Firebase inválida. Verifique firebase-config.js.';
  return 'Algo deu errado. Tente novamente.';
}
