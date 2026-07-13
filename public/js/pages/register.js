import { registerDriver, authErrorMessage } from '/js/auth.js';
import { registerServiceWorker } from '/js/utils.js';

registerServiceWorker();

const form = document.getElementById('registerForm');
const btn = document.getElementById('btnRegister');
const errorEl = document.getElementById('errorMessage');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add('visible');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const matricula = document.getElementById('matricula').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!name || !matricula || !email || !password) {
    showError('Preencha todos os campos.');
    return;
  }
  if (password.length < 6) {
    showError('A senha precisa ter pelo menos 6 caracteres.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Criando conta...';
  errorEl.classList.remove('visible');

  try {
    await registerDriver({ name, matricula, email, password });
    window.location.replace('/pages/home.html');
  } catch (error) {
    console.error('Erro no cadastro:', error);
    showError(authErrorMessage(error));
    btn.disabled = false;
    btn.textContent = 'Criar conta';
  }
});
