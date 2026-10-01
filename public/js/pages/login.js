import { login, resetPassword, authErrorMessage, homeForRole, signOutSilent } from '/js/auth.js';
import { showToast, registerServiceWorker } from '/js/utils.js';

registerServiceWorker();

const form = document.getElementById('loginForm');
const btn = document.getElementById('btnLogin');
const errorEl = document.getElementById('errorMessage');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add('visible');
}

const BLOCKED_MESSAGES = {
  pending: 'Sua conta ainda está aguardando aprovação do gestor da frota.',
  blocked: 'Sua conta está desativada. Procure o gestor da frota.'
};

// Motivo vindo do guard de rota (requireAuth derrubou a sessão).
const statusFromGuard = new URLSearchParams(location.search).get('status');
if (BLOCKED_MESSAGES[statusFromGuard]) {
  showError(BLOCKED_MESSAGES[statusFromGuard]);
  history.replaceState(null, '', location.pathname);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showError('Preencha email e senha.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';
  errorEl.classList.remove('visible');

  try {
    const { driver } = await login(email, password);
    // Conta pendente/desativada: nem entra, avisa aqui mesmo em vez de
    // deixar o guard da próxima tela derrubar a sessão.
    if (driver?.active === false) {
      await signOutSilent().catch(() => {});
      showError(BLOCKED_MESSAGES[driver.pendingApproval ? 'pending' : 'blocked']);
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }
    window.location.replace(homeForRole(driver?.role));
  } catch (error) {
    console.error('Erro no login:', error);
    showError(authErrorMessage(error));
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

document.getElementById('forgotLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  if (!email) {
    showError('Digite seu email acima e toque em "Esqueceu a senha?" de novo.');
    return;
  }
  try {
    await resetPassword(email);
    showToast('Email de recuperação enviado.', 'success');
  } catch (error) {
    showError(authErrorMessage(error));
  }
});
