import { requireAuth, logout } from '/js/auth.js';
import {
  listTrips, listVehicles, listDrivers, listDamagesByVehicle, countOpenDamages
} from '/js/db.js';
import {
  FUEL_LABELS, escapeHtml, formatCurrency, formatDate, formatDuration,
  showToast, registerServiceWorker
} from '/js/utils.js';

registerServiceWorker();
document.getElementById('btnLogout').addEventListener('click', logout);

const { user } = await requireAuth({ adminOnly: true });

if (user.email === 'alesk3@gmail.com') {
  document.querySelector('.admin-nav').insertAdjacentHTML('beforeend', '<a href="/pages/admin/dev.html">Dev</a>');
}

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

    // Avarias em aberto: do veículo filtrado, ou da frota toda.
    const openDamagesCount = vehicleId
      ? (await listDamagesByVehicle(vehicleId)).filter((d) => !d.resolved).length
      : await countOpenDamages();

    renderStats(trips, openDamagesCount);
    renderTrips(trips);
  } catch (error) {
    console.error(error);
    showToast('Erro ao carregar histórico.', 'error');
  } finally {
    loading.style.display = 'none';
  }
}

function renderStats(trips, openDamagesCount) {
  const km = trips.reduce((sum, t) => (
    t.kmStart != null && t.kmEnd != null ? sum + (t.kmEnd - t.kmStart) : sum
  ), 0);
  const expenses = trips.reduce((sum, t) => sum + (t.totalExpenses || 0), 0);

  document.getElementById('statTrips').textContent = trips.length;
  document.getElementById('statKm').textContent = km.toLocaleString('pt-BR');
  document.getElementById('statExpenses').textContent = formatCurrency(expenses);
  document.getElementById('statDamages').textContent = openDamagesCount;
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
      <a class="card trip-card" href="/pages/admin/trip.html?id=${t.id}">
        <div class="trip-head">
          <div>
            <strong>${escapeHtml(t.driverName || '—')}</strong>
            <p class="list-sub">${escapeHtml(t.vehicleModel || '')} · ${escapeHtml(t.vehiclePlate || '')}</p>
            ${t.secondDriverName ? `<p class="list-sub">APE: ${escapeHtml(t.secondDriverName)}</p>` : ''}
          </div>
          <div class="trip-badges">
            ${t.isTest ? '<span class="badge badge-warning">TESTE</span>' : ''}
            <span class="badge ${t.status === 'open' ? 'badge-accent' : 'badge-muted'}">
              ${t.status === 'open' ? 'Aberto' : 'Fechado'}
            </span>
          </div>
        </div>
        <div class="trip-detail">
          <div>Data<strong>${formatDate(t.date)}</strong></div>
          <div>KM rodados<strong>${km}</strong></div>
          <div>Duração<strong>${t.endTime ? formatDuration(t.startTime, t.endTime) : '—'}</strong></div>
          <div>Combustível<strong>${FUEL_LABELS[t.fuelStart] || '?'} → ${FUEL_LABELS[t.fuelEnd] || '?'}</strong></div>
          <div>Paradas<strong>${(t.stops || []).length}</strong></div>
          <div>Despesas<strong>${formatCurrency(t.totalExpenses || 0)}</strong></div>
        </div>
        <span class="trip-open">Ver relatório completo ›</span>
      </a>
    `;
  }).join('');
}
