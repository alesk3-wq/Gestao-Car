import { requireAuth, logout } from '/js/auth.js';
import {
  listTrips, listVehicles, listDrivers, listDamagesByVehicle, updateDamage, countOpenDamages
} from '/js/db.js';
import {
  FUEL_LABELS, DAMAGE_LOCATIONS, EXPENSE_TYPES, EXPENSE_TYPE_ICONS,
  escapeHtml, formatCurrency, formatDate, formatDateTime, formatDuration,
  showToast, registerServiceWorker, initTabs, openLightbox
} from '/js/utils.js';

registerServiceWorker();
document.getElementById('btnLogout').addEventListener('click', logout);
initTabs();

await requireAuth({ adminOnly: true });

const [vehicles, drivers] = await Promise.all([listVehicles(), listDrivers()]);

document.getElementById('filterVehicle').innerHTML =
  '<option value="">Todos os veículos</option>' +
  vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.model)} — ${escapeHtml(v.plate)}</option>`).join('');

document.getElementById('filterDriver').innerHTML =
  '<option value="">Todos os condutores</option>' +
  drivers.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');

document.getElementById('filterExpenseType').innerHTML =
  '<option value="">Todos os tipos de despesa</option>' +
  EXPENSE_TYPES.map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('');
document.getElementById('filterExpenseType').addEventListener('change', renderExpenses);

document.getElementById('btnFilter').addEventListener('click', refresh);

let currentTrips = [];

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
    currentTrips = trips;
    renderTrips(trips);
    renderExpenses();

    // Timeline de avarias só quando um veículo específico está filtrado
    const damagesSection = document.getElementById('damagesSection');
    let openDamagesCount;
    if (vehicleId) {
      const damages = await listDamagesByVehicle(vehicleId);
      renderDamages(damages);
      damagesSection.style.display = 'block';
      openDamagesCount = damages.filter((d) => !d.resolved).length;
    } else {
      damagesSection.style.display = 'none';
      openDamagesCount = await countOpenDamages();
    }

    renderStats(trips, openDamagesCount);
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

// Achata as despesas embutidas de todos os turnos filtrados numa lista só.
// Não busca nada novo no Firestore — é tudo dado que listTrips já trouxe.
function flattenExpenses(trips) {
  return trips.flatMap((t) => (t.expenses || []).map((e) => ({
    ...e,
    tripDate: t.date,
    driverName: t.driverName,
    vehiclePlate: t.vehiclePlate
  })));
}

function renderExpenses() {
  const type = document.getElementById('filterExpenseType').value;
  let flat = flattenExpenses(currentTrips);
  if (type) flat = flat.filter((e) => e.type === type);
  flat.sort((a, b) => (b.tripDate || '').localeCompare(a.tripDate || ''));

  document.getElementById('expensesTotalValue').textContent =
    formatCurrency(flat.reduce((sum, e) => sum + (e.value || 0), 0));

  const list = document.getElementById('expensesList');
  if (flat.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma despesa encontrada com esses filtros.</div>';
    return;
  }

  list.innerHTML = flat.map((e) => `
    <div class="card expense-card">
      <div class="expense-icon">${EXPENSE_TYPE_ICONS[e.type] || '📌'}</div>
      <div class="expense-info">
        <div class="card-row"><strong>${e.type[0].toUpperCase() + e.type.slice(1)}</strong></div>
        <p class="expense-desc">
          ${escapeHtml(e.driverName || '')} · ${escapeHtml(e.vehiclePlate || '')} · ${formatDate(e.tripDate)}
          ${e.receiptNumber ? ` · Recibo ${escapeHtml(e.receiptNumber)}` : ''}
        </p>
      </div>
      ${e.receiptPhotoUrl ? `<img class="receipt-thumb" src="${escapeHtml(e.receiptPhotoUrl)}" alt="Recibo">` : ''}
      <span class="expense-value">${formatCurrency(e.value)}</span>
    </div>
  `).join('');

  list.querySelectorAll('.receipt-thumb').forEach((img, i) => {
    img.addEventListener('click', () => openLightbox(flat[i].receiptPhotoUrl));
  });
}

function renderDamages(damages) {
  const list = document.getElementById('damagesList');

  if (damages.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma avaria registrada neste veículo.</div>';
    return;
  }

  list.innerHTML = damages.map((d) => `
    <div class="card damage-card" data-id="${d.id}">
      ${(d.photoUrls || []).length ? `
        <div class="damage-thumbs">
          ${d.photoUrls.map((url, i) => `<img class="damage-thumb" src="${escapeHtml(url)}" alt="Foto da avaria ${i + 1}">`).join('')}
        </div>` : ''}
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

  list.querySelectorAll('.damage-card').forEach((card, i) => {
    card.querySelectorAll('.damage-thumb').forEach((img, photoIdx) => {
      img.addEventListener('click', () => openLightbox(damages[i].photoUrls, photoIdx));
    });
  });

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
