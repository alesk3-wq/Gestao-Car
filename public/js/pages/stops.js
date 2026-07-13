import { requireAuth } from '/js/auth.js';
import { getOpenTrip, updateTrip } from '/js/db.js';
import { renderBottomNav } from '/js/nav.js';
import {
  STOP_TYPES, uuid, escapeHtml, formatTime, nowTimeValue, timeValueToDate,
  showToast, registerServiceWorker
} from '/js/utils.js';

registerServiceWorker();
renderBottomNav();

const { driver } = await requireAuth();
const trip = await getOpenTrip(driver.id);

document.getElementById('loading').style.display = 'none';

if (!trip) {
  document.getElementById('noTripMsg').style.display = 'block';
} else {
  document.getElementById('stopsList').style.display = 'block';
  document.getElementById('fabAddStop').style.display = 'flex';
  init();
}

let editingId = null; // null = criando nova

function init() {
  document.getElementById('stopType').innerHTML = STOP_TYPES
    .map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`)
    .join('');

  document.getElementById('fabAddStop').addEventListener('click', () => openSheet(null));
  document.getElementById('stopBackdrop').addEventListener('click', closeSheet);
  document.getElementById('btnCancelStop').addEventListener('click', closeSheet);
  document.getElementById('btnSaveStop').addEventListener('click', saveStop);
  document.getElementById('btnDeleteStop').addEventListener('click', deleteStop);

  renderList();
}

function renderList() {
  const list = document.getElementById('stopsList');
  const stops = trip.stops || [];
  document.getElementById('stopCount').textContent = `${stops.length} parada${stops.length === 1 ? '' : 's'}`;

  if (stops.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <p>Nenhuma parada registrada.<br>Toque no + para adicionar.</p>
      </div>`;
    return;
  }

  list.innerHTML = stops.map((s) => `
    <div class="card stop-card" data-id="${s.id}">
      <div class="stop-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="stop-info">
        <div class="card-row">
          <strong>${escapeHtml(s.name)}</strong>
          <span class="badge badge-muted">${escapeHtml(s.type)}</span>
        </div>
        <p class="stop-times">Chegada ${formatTime(s.arrivalTime)} · Saída ${formatTime(s.departureTime)}</p>
        ${s.notes ? `<p class="stop-notes">${escapeHtml(s.notes)}</p>` : ''}
      </div>
      <div class="stop-actions">
        <button class="icon-btn" aria-label="Editar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.stop-card').forEach((card) => {
    card.querySelector('.icon-btn').addEventListener('click', () => openSheet(card.dataset.id));
  });
}

function openSheet(stopId) {
  editingId = stopId;
  const stop = stopId ? (trip.stops || []).find((s) => s.id === stopId) : null;

  document.getElementById('stopSheetTitle').textContent = stop ? 'Editar parada' : 'Nova parada';
  document.getElementById('btnDeleteStop').style.display = stop ? 'flex' : 'none';
  document.getElementById('stopType').value = stop?.type || STOP_TYPES[0];
  document.getElementById('stopName').value = stop?.name || '';
  document.getElementById('stopArrival').value = stop ? toTimeValue(stop.arrivalTime) : nowTimeValue();
  document.getElementById('stopDeparture').value = stop ? toTimeValue(stop.departureTime) : nowTimeValue();
  document.getElementById('stopNotes').value = stop?.notes || '';

  document.getElementById('stopBackdrop').classList.add('open');
  document.getElementById('stopSheet').classList.add('open');
}

function toTimeValue(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toTimeString().slice(0, 5);
}

function closeSheet() {
  document.getElementById('stopBackdrop').classList.remove('open');
  document.getElementById('stopSheet').classList.remove('open');
}

async function saveStop() {
  const name = document.getElementById('stopName').value.trim();
  if (!name) {
    showToast('Informe o nome do local.', 'error');
    return;
  }

  const data = {
    type: document.getElementById('stopType').value,
    name,
    arrivalTime: timeValueToDate(document.getElementById('stopArrival').value),
    departureTime: timeValueToDate(document.getElementById('stopDeparture').value),
    notes: document.getElementById('stopNotes').value.trim()
  };

  const stops = [...(trip.stops || [])];
  if (editingId) {
    const idx = stops.findIndex((s) => s.id === editingId);
    stops[idx] = { ...stops[idx], ...data };
  } else {
    stops.push({ id: uuid(), ...data });
  }

  try {
    await updateTrip(trip.id, { stops });
    trip.stops = stops;
    showToast('Parada salva.', 'success');
    closeSheet();
    renderList();
  } catch {
    showToast('Erro ao salvar. Tente novamente.', 'error');
  }
}

async function deleteStop() {
  if (!editingId) return;
  const stops = (trip.stops || []).filter((s) => s.id !== editingId);
  try {
    await updateTrip(trip.id, { stops });
    trip.stops = stops;
    showToast('Parada removida.');
    closeSheet();
    renderList();
  } catch {
    showToast('Erro ao remover. Tente novamente.', 'error');
  }
}
