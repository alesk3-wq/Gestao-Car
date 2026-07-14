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

export const EXPENSE_TYPE_ICONS = {
  'refeição': '🍽️',
  'água/lanche': '🥤',
  'pedágio': '🛣️',
  'combustível': '⛽',
  'outro': '📌'
};

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
  'rear-right':   'Lateral tras. direita',
  'wheel-front-left':  'Roda diant. esquerda',
  'wheel-front-right': 'Roda diant. direita',
  'wheel-rear-left':   'Roda tras. esquerda',
  'wheel-rear-right':  'Roda tras. direita'
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

// Tabs genéricas (usadas na tela Veículo e no painel Admin).
// Espera botões com [data-tab="x"] e painéis correspondentes com id="panel-x".
export function initTabs(scope = document) {
  const tabs = scope.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      scope.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

/* ── Lightbox de fotos (avarias, recibos) ── */

let lightboxEl = null;
let lightboxPhotos = [];
let lightboxIndex = 0;

function ensureLightbox() {
  if (lightboxEl) return lightboxEl;
  lightboxEl = document.createElement('div');
  lightboxEl.className = 'lightbox-backdrop';
  lightboxEl.innerHTML = `
    <button class="lightbox-close" aria-label="Fechar">✕</button>
    <button class="lightbox-prev" aria-label="Foto anterior">‹</button>
    <img class="lightbox-img" alt="Foto ampliada">
    <button class="lightbox-next" aria-label="Próxima foto">›</button>
    <div class="lightbox-counter"></div>
  `;
  document.body.appendChild(lightboxEl);
  lightboxEl.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightboxEl.addEventListener('click', (e) => { if (e.target === lightboxEl) closeLightbox(); });
  lightboxEl.querySelector('.lightbox-prev').addEventListener('click', () => showLightboxPhoto(lightboxIndex - 1));
  lightboxEl.querySelector('.lightbox-next').addEventListener('click', () => showLightboxPhoto(lightboxIndex + 1));
  return lightboxEl;
}

function showLightboxPhoto(i) {
  lightboxIndex = (i + lightboxPhotos.length) % lightboxPhotos.length;
  lightboxEl.querySelector('.lightbox-img').src = lightboxPhotos[lightboxIndex];
  const multi = lightboxPhotos.length > 1;
  lightboxEl.querySelector('.lightbox-prev').style.display = multi ? 'flex' : 'none';
  lightboxEl.querySelector('.lightbox-next').style.display = multi ? 'flex' : 'none';
  lightboxEl.querySelector('.lightbox-counter').textContent = multi ? `${lightboxIndex + 1}/${lightboxPhotos.length}` : '';
}

function closeLightbox() {
  lightboxEl?.classList.remove('open');
}

// photos: uma URL ou array de URLs. Chame a partir de qualquer thumbnail clicável.
export function openLightbox(photos, startIndex = 0) {
  const urls = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
  if (!urls.length) return;
  lightboxPhotos = urls;
  ensureLightbox();
  showLightboxPhoto(startIndex);
  lightboxEl.classList.add('open');
}
