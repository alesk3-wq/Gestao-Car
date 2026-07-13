// Utilitários compartilhados: formatação, toast, ids.

export const FUEL_LEVELS = ['vazio', '1/4', '1/2', '3/4', 'cheio'];

export const FUEL_LABELS = {
  'vazio': 'Vazio',
  '1/4': '1/4',
  '1/2': '1/2',
  '3/4': '3/4',
  'cheio': 'Cheio'
};

export const STOP_TYPES = ['escritório', 'fábrica', 'loja', 'shopping', 'restaurante', 'outro'];

export const EXPENSE_TYPES = ['refeição', 'água/lanche', 'pedágio', 'combustível', 'outro'];

export const DAMAGE_LOCATIONS = {
  'front':        'Frente',
  'hood':         'Capô',
  'windshield':   'Para-brisa',
  'roof':         'Teto',
  'rear-window':  'Vidro traseiro',
  'trunk':        'Porta-malas',
  'rear':         'Traseira',
  'front-left':   'Lateral diant. esquerda',
  'rear-left':    'Lateral tras. esquerda',
  'front-right':  'Lateral diant. direita',
  'rear-right':   'Lateral tras. direita'
};

export function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function formatCurrency(value) {
  return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Converte "45,50" ou "45.50" em número
export function parseCurrency(str) {
  const n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate(); // Firestore Timestamp
  return new Date(ts);
}

export function formatDate(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

export function formatTime(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function formatDateTime(ts) {
  const d = toDate(ts);
  return d ? `${d.toLocaleDateString('pt-BR')} ${formatTime(d)}` : '—';
}

// Duração entre dois timestamps em "3h 25min"
export function formatDuration(start, end) {
  const s = toDate(start), e = toDate(end) ?? new Date();
  if (!s) return '—';
  const mins = Math.max(0, Math.round((e - s) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// "HH:MM" atual, pra pré-preencher inputs de hora
export function nowTimeValue() {
  return new Date().toTimeString().slice(0, 5);
}

// Converte "HH:MM" de hoje em Date
export function timeValueToDate(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

let toastTimer = null;

export function showToast(message, type = '') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast visible ${type ? 'toast-' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

// Registra o service worker (chamado em toda página)
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
  }
}
