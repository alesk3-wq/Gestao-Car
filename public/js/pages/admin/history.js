import { requireAuth, logout } from '/js/auth.js';
import { listTrips, listVehicles, listDrivers, listDamagesByVehicle, updateDamage } from '/js/db.js';
import {
  FUEL_LABELS, DAMAGE_LOCATIONS, escapeHtml, formatCurrency, formatDate,
  formatDateTime, formatDuration, showToast, registerServiceWorker
} from '/js/utils.js';

registerServiceWorker();
document.getElementById('btnLogout').addEventListener('click', logout);

await requireAuth({ adminOnly: true });

const [vehicles, drivers] = await Promise.all([listVehicles(), listDrivers()]);

document.getElementById('filterVehicle').innerHTML =
  '<option value="">Todos os veículos</option>' +
  vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.model)} — ${escapeHtml(v.plate)}</option>`).join('');

document.getElementById('filterDriver').innerHTML =
  '<option value="">Todos os condutores</option>' +
  drivers.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');

document.getElementById('btnFilter').addEventListener('click', refresh);

await refresh();

async function refresh() {
  const loading = document.getElementById('loading');
  loading.style.display = 'block';

  const vehicleId = document.getElementById('filterVehicle').value;
  const filters = {
    vehicleId,
    driverId: document.getElementById('filterDriver').value,
    dateFrom: document.getElementById('filterFrom').value,
    dateTo: document.getElementById('filterTo').value
  };

  try {
    const trips = await listTrips(filters);
    renderTrips(trips);

    // Timeline de avarias só quando um veículo específico está filtrado
    const damagesSection = document.getElementById('damagesSection');
    if (vehicleId) {
      const damages = await listDamagesByVehicle(vehicleId);
      renderDamages(damages);
      damagesSection.style.display = 'block';
    } else {
      damagesSection.style.display = 'none';
    }
  } catch (error) {
    console.error(error);
    showToast('Erro ao carregar histórico.', 'error');
  } finally {
    loading.style.display = 'none';
  }
}

function renderTrips(trips) {
  const list = document.getElementById('tripsList');

  if (trips.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum turno encontrado com esses filtros.</div>';
    return;
  }

  list.innerHTML = trips.map((t) => {
    const km = t.kmStart != null && t.kmEnd != null ? (t.kmEnd - t.kmStart).toLocaleString('pt-BR') : '—';
    return `
      <div class="card trip-card">
        <div class="trip-head">
          <div>
            <strong>${escapeHtml(t.driverName || '—')}</strong>
            <p class="list-sub">${escapeHtml(t.vehicleModel || '')} · ${escapeHtml(t.vehiclePlate || '')}</p>
            ${t.secondDriverName ? `<p class="list-sub">Copiloto: ${escapeHtml(t.secondDriverName)}</p>` : ''}
          </div>
          <span class="badge ${t.status === 'open' ? 'badge-accent' : 'badge-muted'}">
            ${t.status === 'open' ? 'Aberto' : 'Fechado'}
          </span>
        </div>
        <div class="trip-detail">
          <div>Data<strong>${formatDate(t.date)}</strong></div>
          <div>KM rodados<strong>${km}</strong></div>
          <div>Duração<strong>${t.endTime ? formatDuration(t.startTime, t.endTime) : '—'}</strong></div>
          <div>Combustível<strong>${FUEL_LABELS[t.fuelStart] || '?'} → ${FUEL_LABELS[t.fuelEnd] || '?'}</strong></div>
          <div>Paradas<strong>${(t.stops || []).length}</strong></div>
          <div>Despesas<strong>${formatCurrency(t.totalExpenses || 0)}</strong></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDamages(damages) {
  const list = document.getElementById('damagesList');

  if (damages.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma avaria registrada neste veículo.</div>';
    return;
  }

  list.innerHTML = damages.map((d) => `
    <div class="card damage-card" data-id="${d.id}">
      ${d.photoUrls?.[0] ? `<img class="damage-thumb" src="${escapeHtml(d.photoUrls[0])}" alt="Foto da avaria">` : ''}
      <div class="damage-info">
        <div class="card-row">
          <strong>${escapeHtml(DAMAGE_LOCATIONS[d.location] || d.location)}</strong>
          <span class="badge ${d.resolved ? 'badge-muted' : 'badge-danger'}">
            ${d.resolved ? 'Resolvida' : 'Em aberto'}
          </span>
        </div>
        <p class="damage-desc">${escapeHtml(d.description)}</p>
        <p class="damage-meta">${escapeHtml(d.driverName || '')} · ${formatDateTime(d.reportedAt)}</p>
        ${d.resolved ? '' : `<button class="btn btn-secondary btn-sm btn-resolve" style="margin-top:10px">Marcar como resolvida</button>`}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-resolve').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.damage-card').dataset.id;
      btn.disabled = true;
      try {
        await updateDamage(id, { resolved: true });
        showToast('Avaria marcada como resolvida.', 'success');
        await refresh();
      } catch {
        showToast('Erro ao atualizar.', 'error');
        btn.disabled = false;
      }
    });
  });
}
