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
  doc, getDoc, setDoc, serverTimestamp
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

// Cadastro cria a conta **pendente** (active: false + pendingApproval: true) —
// o gestor aprova na tela Condutores. A matrícula não é pedida aqui: o condutor
// preenche depois, na Home, já aprovado (antes disso ele não lê nada da frota,
// então nem daria pra validar matrícula duplicada).
export async function registerDriver({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  try {
    const driver = {
      name,
      matricula: null,
      email,
      role: 'driver',
      defaultVehicleId: null,
      active: false,
      pendingApproval: true,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'drivers', cred.user.uid), driver);
    return { user: cred.user, driver };
  } catch (error) {
    // Falhou ao gravar o perfil: desfaz o usuário do Auth pra não sobrar
    // conta órfã sem doc no Firestore.
    await deleteUser(cred.user).catch(() => {});
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

// Sai da conta sem redirecionar — usado logo após o cadastro, que fica
// pendente de aprovação e não deve seguir logado.
export function signOutSilent() {
  return signOut(auth);
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
      // Conta aguardando aprovação do gestor ou desativada. As regras do
      // Firestore já bloqueiam a leitura da frota; aqui é só pra não deixar a
      // pessoa numa tela quebrada sem entender o motivo.
      if (driver.active === false) {
        await signOut(auth);
        const status = driver.pendingApproval ? 'pending' : 'blocked';
        window.location.replace(`/login.html?status=${status}`);
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
