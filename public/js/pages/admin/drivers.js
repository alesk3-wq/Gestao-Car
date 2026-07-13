import { requireAuth, logout } from '/js/auth.js';
import { listDrivers, updateDriver, listVehicles } from '/js/db.js';
import { escapeHtml, showToast, registerServiceWorker } from '/js/utils.js';

registerServiceWorker();
document.getElementById('btnLogout').addEventListener('click', logout);

await requireAuth({ adminOnly: true });

let drivers = [];
let vehicles = [];
let editingId = null;

[drivers, vehicles] = await Promise.all([listDrivers(), listVehicles({ activeOnly: true })]);
document.getElementById('loading').style.display = 'none';
renderList();

document.getElementById('driverBackdrop').addEventListener('click', closeSheet);
document.getElementById('btnCancelDriver').addEventListener('click', closeSheet);
document.getElementById('btnSaveDriver').addEventListener('click', save);

function vehicleLabel(vehicleId) {
  const v = vehicles.find((x) => x.id === vehicleId);
  return v ? `${v.model} (${v.plate})` : 'Sem veículo padrão';
}

function renderList() {
  const list = document.getElementById('driversList');

  if (drivers.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum condutor cadastrado ainda.</div>';
    return;
  }

  list.innerHTML = drivers.map((d) => `
    <div class="card list-card" data-id="${d.id}">
      <div class="list-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <div class="list-info">
        <div class="card-row">
          <strong>${escapeHtml(d.name)}</strong>
          <span>
            ${d.role === 'admin' ? '<span class="badge badge-accent">Admin</span>' : ''}
            ${d.active ? '' : '<span class="badge badge-muted">Inativo</span>'}
          </span>
        </div>
        <p class="list-sub">Mat. ${escapeHtml(d.matricula || '—')} · ${escapeHtml(vehicleLabel(d.defaultVehicleId))}</p>
      </div>
      <button class="icon-btn" aria-label="Editar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.list-card').forEach((card) => {
    card.querySelector('.icon-btn').addEventListener('click', () => openSheet(card.dataset.id));
  });
}

function openSheet(driverId) {
  editingId = driverId;
  const d = drivers.find((x) => x.id === driverId);

  document.getElementById('drvInfo').value = `${d.name} · Mat. ${d.matricula || '—'}`;
  document.getElementById('drvVehicle').innerHTML =
    '<option value="">Sem veículo padrão</option>' +
    vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.model)} — ${escapeHtml(v.plate)}</option>`).join('');
  document.getElementById('drvVehicle').value = d.defaultVehicleId || '';
  document.getElementById('drvRole').value = d.role || 'driver';
  document.getElementById('drvActive').value = String(d.active ?? true);

  document.getElementById('driverBackdrop').classList.add('open');
  document.getElementById('driverSheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('driverBackdrop').classList.remove('open');
  document.getElementById('driverSheet').classList.remove('open');
}

async function save() {
  const btn = document.getElementById('btnSaveDriver');
  btn.disabled = true;

  try {
    const data = {
      defaultVehicleId: document.getElementById('drvVehicle').value || null,
      role: document.getElementById('drvRole').value,
      active: document.getElementById('drvActive').value === 'true'
    };
    await updateDriver(editingId, data);
    const idx = drivers.findIndex((x) => x.id === editingId);
    drivers[idx] = { ...drivers[idx], ...data };
    showToast('Condutor atualizado.', 'success');
    closeSheet();
    renderList();
  } catch (error) {
    console.error(error);
    showToast('Erro ao salvar. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
  }
}
