import { requireAuth, logout } from '/js/auth.js';
import { listVehicles, createVehicle, updateVehicle } from '/js/db.js';
import { escapeHtml, showToast, registerServiceWorker } from '/js/utils.js';

registerServiceWorker();
document.getElementById('btnLogout').addEventListener('click', logout);

await requireAuth({ adminOnly: true });

let vehicles = [];
let editingId = null;

await refresh();
document.getElementById('loading').style.display = 'none';

document.getElementById('fabAddVehicle').addEventListener('click', () => openSheet(null));
document.getElementById('vehicleBackdrop').addEventListener('click', closeSheet);
document.getElementById('btnCancelVehicle').addEventListener('click', closeSheet);
document.getElementById('btnSaveVehicle').addEventListener('click', save);

async function refresh() {
  vehicles = await listVehicles();
  renderList();
}

function renderList() {
  const list = document.getElementById('vehiclesList');

  if (vehicles.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum veículo cadastrado.<br>Toque no + para adicionar.</div>';
    return;
  }

  list.innerHTML = vehicles.map((v) => `
    <div class="card list-card" data-id="${v.id}">
      <div class="list-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>
      </div>
      <div class="list-info">
        <div class="card-row">
          <strong>${escapeHtml(v.model)}</strong>
          ${v.active ? '' : '<span class="badge badge-muted">Inativo</span>'}
        </div>
        <p class="list-sub">${escapeHtml(v.plate)} · ${escapeHtml(v.fleetNumber || '')}</p>
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

function openSheet(vehicleId) {
  editingId = vehicleId;
  const v = vehicleId ? vehicles.find((x) => x.id === vehicleId) : null;

  document.getElementById('vehicleSheetTitle').textContent = v ? 'Editar veículo' : 'Novo veículo';
  document.getElementById('vehModel').value = v?.model || '';
  document.getElementById('vehPlate').value = v?.plate || '';
  document.getElementById('vehFleet').value = v?.fleetNumber || '';
  document.getElementById('activeGroup').style.display = v ? 'block' : 'none';
  document.getElementById('vehActive').value = String(v?.active ?? true);

  document.getElementById('vehicleBackdrop').classList.add('open');
  document.getElementById('vehicleSheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('vehicleBackdrop').classList.remove('open');
  document.getElementById('vehicleSheet').classList.remove('open');
}

async function save() {
  const model = document.getElementById('vehModel').value.trim();
  const plate = document.getElementById('vehPlate').value.trim().toUpperCase();
  const fleetNumber = document.getElementById('vehFleet').value.trim();

  if (!model || !plate) {
    showToast('Informe modelo e placa.', 'error');
    return;
  }

  const btn = document.getElementById('btnSaveVehicle');
  btn.disabled = true;

  try {
    if (editingId) {
      await updateVehicle(editingId, {
        model, plate, fleetNumber,
        active: document.getElementById('vehActive').value === 'true'
      });
    } else {
      await createVehicle({ model, plate, fleetNumber });
    }
    showToast('Veículo salvo.', 'success');
    closeSheet();
    await refresh();
  } catch (error) {
    console.error(error);
    showToast('Erro ao salvar. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
  }
}
