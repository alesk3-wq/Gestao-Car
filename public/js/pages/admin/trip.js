import { requireAuth } from '/js/auth.js';
import { getTrip, updateTrip, listDamagesByTrip } from '/js/db.js';
import {
  FUEL_LABELS, DAMAGE_LOCATIONS, EXPENSE_TYPE_ICONS,
  escapeHtml, formatCurrency, formatDate, formatDateTime, formatTime, formatDuration,
  toDateTimeLocalValue, parseDateTimeLocal, showToast,
  openLightbox, registerServiceWorker
} from '/js/utils.js';

registerServiceWorker();

document.getElementById('btnPrint').addEventListener('click', () => window.print());
document.getElementById('btnPrintBottom').addEventListener('click', () => window.print());

await requireAuth({ adminOnly: true });

const id = new URLSearchParams(location.search).get('id');
const trip = id ? await getTrip(id) : null;

document.getElementById('loading').style.display = 'none';

if (!trip) {
  document.getElementById('notFound').style.display = 'block';
} else {
  document.getElementById('content').style.display = 'block';
  await render();
}

// Cada seção isolada: uma falha (ex.: avarias) não pode zerar o resto (CLAUDE.md).
async function render() {
  try { renderHead(); } catch (e) { console.error(e); }
  try { renderTiles(); } catch (e) { console.error(e); }
  try { renderTimeAdjust(); } catch (e) { console.error(e); }
  try { renderStops(); } catch (e) { console.error(e); }
  try { renderExpenses(); } catch (e) { console.error(e); }
  try {
    await renderDamages();
  } catch (e) {
    console.error(e);
    document.getElementById('damagesList').innerHTML =
      '<div class="empty-state">Não foi possível carregar as avarias.</div>';
  }
}

function renderHead() {
  document.getElementById('printTitle').textContent =
    `Relatório de Turno — ${trip.vehiclePlate || 'veículo'} — ${formatDate(trip.date)}`;
  document.getElementById('repVehicle').textContent = trip.vehicleModel || 'Veículo';
  document.getElementById('repPlate').textContent = trip.vehiclePlate || '';

  const badge = document.getElementById('repStatus');
  badge.textContent = trip.status === 'open' ? 'Aberto' : 'Fechado';
  badge.className = `badge ${trip.status === 'open' ? 'badge-accent' : 'badge-muted'}`;

  document.getElementById('repDriver').textContent = trip.driverName || '—';
  if (trip.secondDriverName) {
    document.getElementById('repSecondDriver').textContent = trip.secondDriverName;
    document.getElementById('repSecondDriverRow').hidden = false;
  }
  document.getElementById('repDate').textContent = formatDate(trip.date);
  document.getElementById('repStart').textContent = formatDateTime(trip.startTime);
  document.getElementById('repEnd').textContent = trip.endTime ? formatDateTime(trip.endTime) : '—';
}

// Ajuste de início/fim pelo gestor — único campo editável em turno fechado
// (as regras do Firestore só liberam admin pra esses dois campos).
function renderTimeAdjust() {
  const startEl = document.getElementById('adjStart');
  const endEl = document.getElementById('adjEnd');

  startEl.value = toDateTimeLocalValue(trip.startTime);
  endEl.value = toDateTimeLocalValue(trip.endTime);

  const startMs = () => (trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime)).getTime();
  const endMs = () => (trip.endTime?.toDate ? trip.endTime.toDate() : trip.endTime ? new Date(trip.endTime) : null);

  startEl.addEventListener('change', async () => {
    const v = parseDateTimeLocal(startEl.value);
    if (!v) { showToast('Horário inválido.', 'error'); startEl.value = toDateTimeLocalValue(trip.startTime); return; }
    const e = endMs();
    if (e && v.getTime() >= e.getTime()) {
      showToast('O início tem que ser antes do fim.', 'error');
      startEl.value = toDateTimeLocalValue(trip.startTime);
      return;
    }
    try {
      await updateTrip(trip.id, { startTime: v });
      trip.startTime = v;
      renderHead();
      renderTiles();
      showToast('Início atualizado.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar.', 'error');
      startEl.value = toDateTimeLocalValue(trip.startTime);
    }
  });

  endEl.addEventListener('change', async () => {
    const v = parseDateTimeLocal(endEl.value);
    if (!v) { showToast('Horário inválido.', 'error'); endEl.value = toDateTimeLocalValue(trip.endTime); return; }
    if (v.getTime() <= startMs()) {
      showToast('O fim tem que ser depois do início.', 'error');
      endEl.value = toDateTimeLocalValue(trip.endTime);
      return;
    }
    try {
      await updateTrip(trip.id, { endTime: v });
      trip.endTime = v;
      renderHead();
      renderTiles();
      showToast('Fim atualizado.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar.', 'error');
      endEl.value = toDateTimeLocalValue(trip.endTime);
    }
  });
}

function renderTiles() {
  const km = trip.kmStart != null && trip.kmEnd != null ? trip.kmEnd - trip.kmStart : null;
  document.getElementById('repKm').textContent = km != null ? km.toLocaleString('pt-BR') : '—';
  document.getElementById('repKmDetail').textContent =
    trip.kmStart != null ? `${trip.kmStart} → ${trip.kmEnd ?? '?'}` : 'não registrado';

  document.getElementById('repDuration').textContent =
    trip.endTime ? formatDuration(trip.startTime, trip.endTime) : '—';

  const fuelStart = trip.fuelStart ? FUEL_LABELS[trip.fuelStart] : '?';
  const fuelEnd = trip.fuelEnd ? FUEL_LABELS[trip.fuelEnd] : '?';
  document.getElementById('repFuel').textContent = `${fuelStart} → ${fuelEnd}`;

  document.getElementById('repExpenses').textContent = formatCurrency(trip.totalExpenses || 0);
  const nExp = (trip.expenses || []).length;
  document.getElementById('repExpensesCount').textContent = `${nExp} lançamento${nExp === 1 ? '' : 's'}`;

  document.getElementById('repStops').textContent = (trip.stops || []).length;
}

function renderStops() {
  const list = document.getElementById('stopsList');
  const stops = trip.stops || [];

  if (stops.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma parada registrada.</div>';
    return;
  }

  list.innerHTML = stops.map((s) => `
    <div class="card stop-card">
      <div class="stop-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="stop-info">
        <div class="card-row">
          <strong>${escapeHtml(s.name || '—')}</strong>
          <span class="badge badge-muted">${escapeHtml(s.type || '')}</span>
        </div>
        <p class="stop-times">Chegada ${formatTime(s.arrivalTime)} · Saída ${formatTime(s.departureTime)}</p>
        ${s.notes ? `<p class="stop-notes">${escapeHtml(s.notes)}</p>` : ''}
      </div>
    </div>
  `).join('');
}

function renderExpenses() {
  document.getElementById('repExpensesTotal').textContent = formatCurrency(trip.totalExpenses || 0);

  const list = document.getElementById('expensesReportList');
  const expenses = trip.expenses || [];

  if (expenses.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma despesa registrada.</div>';
    return;
  }

  list.innerHTML = expenses.map((e) => `
    <div class="card expense-card">
      <div class="expense-icon">${EXPENSE_TYPE_ICONS[e.type] || '📌'}</div>
      <div class="expense-info">
        <div class="card-row">
          <strong>${e.type ? e.type[0].toUpperCase() + e.type.slice(1) : 'Despesa'}</strong>
        </div>
        <p class="expense-desc">
          ${escapeHtml(e.description || '')}${e.receiptNumber ? ` · Recibo ${escapeHtml(e.receiptNumber)}` : ''}
        </p>
        ${e.at ? `<p class="expense-desc">${formatDateTime(e.at)}</p>` : ''}
      </div>
      ${e.receiptPhotoUrl ? `<img class="receipt-thumb" src="${escapeHtml(e.receiptPhotoUrl)}" alt="Recibo">` : ''}
      <span class="expense-value">${formatCurrency(e.value)}</span>
    </div>
  `).join('');

  list.querySelectorAll('.receipt-thumb').forEach((img) => {
    img.addEventListener('click', () => openLightbox(img.src));
  });
}

async function renderDamages() {
  const list = document.getElementById('damagesList');
  const damages = await listDamagesByTrip(trip.id);

  document.getElementById('repDamages').textContent = damages.length;
  if (damages.length > 0) {
    document.getElementById('repDamagesTile').classList.add('warn');
  }

  if (damages.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma avaria registrada neste turno.</div>';
    return;
  }

  list.innerHTML = damages.map((d) => `
    <div class="card damage-card">
      ${(d.photoUrls || []).length ? `
        <div class="damage-thumbs">
          ${d.photoUrls.map((url, i) => `<img class="damage-thumb" src="${escapeHtml(url)}" alt="Foto da avaria ${i + 1}">`).join('')}
        </div>` : ''}
      <div class="damage-info">
        <div class="card-row">
          <strong>${escapeHtml(DAMAGE_LOCATIONS[d.location] || d.location || '—')}</strong>
          <span class="badge ${d.resolved ? 'badge-muted' : 'badge-danger'}">
            ${d.resolved ? 'Resolvida' : 'Em aberto'}
          </span>
        </div>
        <p class="damage-desc">${escapeHtml(d.description || '')}</p>
        <p class="damage-meta">${escapeHtml(d.driverName || '')} · ${formatDateTime(d.reportedAt)}</p>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.damage-card').forEach((card, i) => {
    card.querySelectorAll('.damage-thumb').forEach((img, photoIdx) => {
      img.addEventListener('click', () => openLightbox(damages[i].photoUrls, photoIdx));
    });
  });
}
