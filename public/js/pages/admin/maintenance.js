import { requireAuth, logout } from '/js/auth.js';
import {
  listVehicles, updateVehicle, getLastClosedTrip,
  createMaintenance, listMaintenanceByVehicle
} from '/js/db.js';
import {
  MAINTENANCE_TYPES, REVISION_STATUS_META, revisionStatus,
  escapeHtml, formatDate, formatCurrency, parseCurrency,
  todayISO, showToast, registerServiceWorker
} from '/js/utils.js';

registerServiceWorker();
document.getElementById('btnLogout').addEventListener('click', logout);

const { driver } = await requireAuth({ adminOnly: true });

let rows = [];              // [{ vehicle, currentKm }]
let editingVehicleId = null;

initSheets();
await refresh();
document.getElementById('loading').style.display = 'none';

async function refresh() {
  const vehicles = await listVehicles();
  const lastTrips = await Promise.all(
    vehicles.map((v) => getLastClosedTrip(v.id).catch(() => null))
  );
  rows = vehicles.map((v, i) => ({ vehicle: v, currentKm: lastTrips[i]?.kmEnd ?? null }));
  renderStats();
  renderList();
}

function renderStats() {
  const count = (st) => rows.filter((r) => revisionStatus(r.vehicle, r.currentKm) === st).length;
  document.getElementById('statOk').textContent = count('ok');
  document.getElementById('statSoon').textContent = count('soon');
  document.getElementById('statOverdue').textContent = count('overdue');
}

function renderList() {
  const list = document.getElementById('vehiclesList');

  if (rows.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum veículo cadastrado.</div>';
    return;
  }

  const order = { overdue: 0, soon: 1, ok: 2, none: 3 };
  const sorted = [...rows].sort(
    (a, b) => order[revisionStatus(a.vehicle, a.currentKm)] - order[revisionStatus(b.vehicle, b.currentKm)]
  );

  list.innerHTML = sorted.map(({ vehicle: v, currentKm }) => {
    const meta = REVISION_STATUS_META[revisionStatus(v, currentKm)];
    const next = [];
    if (v.nextRevisionKm != null) next.push(`KM ${Number(v.nextRevisionKm).toLocaleString('pt-BR')}`);
    if (v.nextRevisionDate) next.push(formatDate(v.nextRevisionDate));

    return `
      <div class="card rev-card" data-id="${v.id}">
        <div class="trip-head">
          <div>
            <strong>${escapeHtml(v.model)}</strong>
            <p class="list-sub">${escapeHtml(v.plate)}${v.fleetNumber ? ' · ' + escapeHtml(v.fleetNumber) : ''}</p>
          </div>
          <div class="trip-badges">
            ${v.isTest ? '<span class="badge badge-warning">TESTE</span>' : ''}
            <span class="badge ${meta.cls}">${meta.label}</span>
          </div>
        </div>
        <div class="trip-detail">
          <div>KM atual<strong>${currentKm != null ? currentKm.toLocaleString('pt-BR') : '—'}</strong></div>
          <div>Próxima revisão<strong>${escapeHtml(next.join(' · ') || 'sem alvo')}</strong></div>
          <div>Última<strong>${v.lastRevisionDate ? formatDate(v.lastRevisionDate) : '—'}</strong></div>
        </div>
        <div class="dev-row-actions">
          <button type="button" class="btn btn-primary btn-sm btn-rev">Registrar revisão</button>
          <button type="button" class="btn btn-secondary btn-sm btn-hist">Histórico</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.rev-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('.btn-rev').addEventListener('click', () => openRevSheet(id));
    card.querySelector('.btn-hist').addEventListener('click', () => openHistSheet(id));
  });
}

/* ── Sheets ── */

function initSheets() {
  document.getElementById('revType').innerHTML = MAINTENANCE_TYPES
    .map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`)
    .join('');

  document.getElementById('revBackdrop').addEventListener('click', closeRevSheet);
  document.getElementById('btnCancelRev').addEventListener('click', closeRevSheet);
  document.getElementById('btnSaveRev').addEventListener('click', saveRev);

  document.getElementById('histBackdrop').addEventListener('click', closeHistSheet);
  document.getElementById('btnCloseHist').addEventListener('click', closeHistSheet);
}

function openRevSheet(vehicleId) {
  editingVehicleId = vehicleId;
  const { vehicle: v, currentKm } = rows.find((r) => r.vehicle.id === vehicleId);

  document.getElementById('revSheetTitle').textContent = `Registrar revisão — ${v.model}`;
  document.getElementById('revDate').value = todayISO();
  document.getElementById('revKm').value = currentKm ?? '';
  document.getElementById('revType').value = MAINTENANCE_TYPES[0];
  document.getElementById('revDesc').value = '';
  document.getElementById('revCost').value = '';
  document.getElementById('revNextKm').value = v.nextRevisionKm ?? '';
  document.getElementById('revNextDate').value = v.nextRevisionDate || '';

  document.getElementById('revBackdrop').classList.add('open');
  document.getElementById('revSheet').classList.add('open');
}

function closeRevSheet() {
  document.getElementById('revBackdrop').classList.remove('open');
  document.getElementById('revSheet').classList.remove('open');
}

async function saveRev() {
  const { vehicle: v } = rows.find((r) => r.vehicle.id === editingVehicleId);

  const date = document.getElementById('revDate').value;
  const kmRaw = document.getElementById('revKm').value;
  const km = kmRaw ? Number(kmRaw) : null;
  if (!date || km == null) {
    showToast('Informe data e KM da revisão.', 'error');
    return;
  }

  const nextKmRaw = document.getElementById('revNextKm').value;
  const nextRevisionKm = nextKmRaw ? Number(nextKmRaw) : null;
  const nextRevisionDate = document.getElementById('revNextDate').value || null;
  const costRaw = document.getElementById('revCost').value.trim();
  const cost = costRaw ? parseCurrency(costRaw) : null;

  const btn = document.getElementById('btnSaveRev');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    await createMaintenance({
      vehicleId: v.id,
      vehiclePlate: v.plate,
      vehicleModel: v.model,
      date,
      km,
      type: document.getElementById('revType').value,
      description: document.getElementById('revDesc').value.trim(),
      cost,
      nextRevisionKm,
      nextRevisionDate,
      createdByName: driver.name
    });

    await updateVehicle(v.id, {
      nextRevisionKm,
      nextRevisionDate,
      lastRevisionKm: km,
      lastRevisionDate: date
    });

    showToast('Revisão registrada.', 'success');
    closeRevSheet();
    await refresh();
  } catch (error) {
    console.error(error);
    showToast('Erro ao salvar. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar revisão';
  }
}

async function openHistSheet(vehicleId) {
  const { vehicle: v } = rows.find((r) => r.vehicle.id === vehicleId);
  document.getElementById('histSheetTitle').textContent = `Revisões — ${v.model}`;

  const listEl = document.getElementById('histList');
  listEl.innerHTML = '<div class="spinner"></div>';
  document.getElementById('histBackdrop').classList.add('open');
  document.getElementById('histSheet').classList.add('open');

  try {
    const records = await listMaintenanceByVehicle(vehicleId);
    if (records.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Nenhuma revisão registrada.</div>';
      return;
    }
    listEl.innerHTML = records.map((r) => {
      const next = [];
      if (r.nextRevisionKm != null) next.push(`KM ${Number(r.nextRevisionKm).toLocaleString('pt-BR')}`);
      if (r.nextRevisionDate) next.push(formatDate(r.nextRevisionDate));
      return `
        <div class="card" style="margin-bottom:8px">
          <div class="card-row">
            <strong>${escapeHtml(r.type ? r.type[0].toUpperCase() + r.type.slice(1) : 'Revisão')}</strong>
            <span class="card-label">${formatDate(r.date)}</span>
          </div>
          <p class="card-label" style="margin-top:4px">
            KM ${r.km != null ? Number(r.km).toLocaleString('pt-BR') : '—'}${r.cost != null ? ' · ' + formatCurrency(r.cost) : ''}
          </p>
          ${r.description ? `<p class="card-label" style="margin-top:4px">${escapeHtml(r.description)}</p>` : ''}
          ${next.length ? `<p class="card-label" style="margin-top:4px">Próxima: ${escapeHtml(next.join(' · '))}</p>` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error(error);
    listEl.innerHTML = '<div class="empty-state">Erro ao carregar histórico.</div>';
  }
}

function closeHistSheet() {
  document.getElementById('histBackdrop').classList.remove('open');
  document.getElementById('histSheet').classList.remove('open');
}
