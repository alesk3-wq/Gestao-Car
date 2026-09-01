// Tela de manutenção: semear e apagar turnos de teste. Travada por e-mail —
// as regras do Firestore/Storage só liberam create/update/delete de teste
// pra essa conta (ver firestore.rules / storage.rules).
import { requireAuth } from '/js/auth.js';
import {
  listAllTrips, createTestTrip, deleteTrip, updateTrip,
  listDrivers, listVehicles, listDamagesByTrip, deleteDamage
} from '/js/db.js';
import { deletePhoto } from '/js/storage.js';
import {
  FUEL_LEVELS, STOP_TYPES, EXPENSE_TYPES,
  uuid, escapeHtml, formatDate, formatCurrency, showToast, registerServiceWorker
} from '/js/utils.js';

const SUPERADMIN_EMAIL = 'alesk3@gmail.com';

registerServiceWorker();

const { user } = await requireAuth();
if (user.email !== SUPERADMIN_EMAIL) {
  window.location.replace('/pages/home.html');
  throw new Error('not-superadmin'); // aborta o resto do módulo
}

document.getElementById('loading').style.display = 'none';
document.getElementById('content').style.display = 'block';

document.getElementById('btnSeed').addEventListener('click', seed);
document.getElementById('btnDeleteAllTest').addEventListener('click', deleteAllTest);

let allTrips = [];
await refresh();

async function refresh() {
  allTrips = await listAllTrips();
  renderTrips();
}

/* ── Semear turnos de teste ── */

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rnd(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function dateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seed() {
  const n = Math.max(1, Math.min(50, Number(document.getElementById('seedCount').value) || 0));
  const btn = document.getElementById('btnSeed');
  const status = document.getElementById('seedStatus');

  const [drivers, vehicles] = await Promise.all([listDrivers(), listVehicles({ activeOnly: true })]);
  if (drivers.length === 0 || vehicles.length === 0) {
    showToast('Cadastre pelo menos um condutor e um veículo antes.', 'error');
    return;
  }

  btn.disabled = true;

  // Odômetro corrente por veículo, pra o KM encadear entre os turnos gerados
  // (mesmo efeito do handoff real, útil pra testar a sugestão de KM/combustível).
  const odo = {};
  vehicles.forEach((v) => { odo[v.id] = rnd(30000, 120000); });

  try {
    for (let i = 0; i < n; i++) {
      const vehicle = pick(vehicles);
      const drv = pick(drivers);
      const others = drivers.filter((d) => d.id !== drv.id);
      const secondDrv = others.length && Math.random() < 0.2 ? pick(others) : null;

      const day = new Date();
      day.setDate(day.getDate() - rnd(0, 30));
      day.setHours(rnd(6, 10), rnd(0, 59), 0, 0);
      const start = new Date(day);
      const end = new Date(start.getTime() + rnd(4, 10) * 3600000);

      const kmStart = odo[vehicle.id];
      const kmEnd = kmStart + rnd(30, 400);
      odo[vehicle.id] = kmEnd;

      const stops = Array.from({ length: rnd(0, 3) }, () => {
        const arrival = new Date(start.getTime() + rnd(1, 6) * 3600000);
        return {
          id: uuid(),
          type: pick(STOP_TYPES),
          name: `Local de teste ${rnd(1, 99)}`,
          arrivalTime: arrival,
          departureTime: new Date(arrival.getTime() + rnd(10, 90) * 60000),
          notes: ''
        };
      });

      const expenses = Array.from({ length: rnd(0, 3) }, () => ({
        id: uuid(),
        type: pick(EXPENSE_TYPES),
        value: rnd(8, 120) + 0.5,
        receiptNumber: String(rnd(1000, 9999)),
        description: 'Despesa de teste',
        receiptPhotoUrl: null
      }));
      const totalExpenses = expenses.reduce((sum, e) => sum + e.value, 0);

      await createTestTrip({
        driverId: drv.id,
        driverName: drv.name,
        secondDriverId: secondDrv?.id ?? null,
        secondDriverName: secondDrv?.name ?? null,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        vehicleModel: vehicle.model,
        date: dateISO(day),
        startTime: start,
        endTime: end,
        kmStart,
        kmEnd,
        fuelStart: pick(FUEL_LEVELS),
        fuelEnd: pick(FUEL_LEVELS),
        status: 'closed',
        stops,
        expenses,
        totalExpenses,
        closedAt: end
      });

      status.textContent = `Criando... ${i + 1}/${n}`;
    }

    status.textContent = '';
    showToast(`${n} turnos de teste criados.`, 'success');
    await refresh();
  } catch (error) {
    console.error(error);
    showToast('Erro ao criar turnos de teste.', 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ── Listar / apagar ── */

function renderTrips() {
  const list = document.getElementById('tripsList');

  if (allTrips.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum turno no banco.</div>';
    return;
  }

  list.innerHTML = allTrips.map((t) => `
    <div class="card trip-card dev-trip-row" data-id="${t.id}">
      <div class="trip-head">
        <div>
          <strong>${escapeHtml(t.driverName || '—')}</strong>
          <p class="list-sub">${escapeHtml(t.vehicleModel || '')} · ${escapeHtml(t.vehiclePlate || '')} · ${formatDate(t.date)}</p>
        </div>
        <div class="trip-badges">
          ${t.isTest ? '<span class="badge badge-warning">TESTE</span>' : ''}
          <span class="badge ${t.status === 'open' ? 'badge-accent' : 'badge-muted'}">
            ${t.status === 'open' ? 'Aberto' : 'Fechado'}
          </span>
        </div>
      </div>
      <div class="trip-detail">
        <div>KM<strong>${t.kmStart != null && t.kmEnd != null ? (t.kmEnd - t.kmStart).toLocaleString('pt-BR') : '—'}</strong></div>
        <div>Despesas<strong>${formatCurrency(t.totalExpenses || 0)}</strong></div>
        <div>Paradas<strong>${(t.stops || []).length}</strong></div>
      </div>
      <div class="dev-row-actions">
        <button type="button" class="btn btn-secondary btn-sm btn-toggle-test">${t.isTest ? 'Desmarcar teste' : 'Marcar como teste'}</button>
        <button type="button" class="btn btn-danger btn-sm btn-delete-trip">Apagar</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.dev-trip-row').forEach((row) => {
    const id = row.dataset.id;
    const trip = allTrips.find((t) => t.id === id);

    row.querySelector('.btn-toggle-test').addEventListener('click', async () => {
      try {
        await updateTrip(id, { isTest: !trip.isTest });
        await refresh();
      } catch (error) {
        console.error(error);
        showToast('Erro ao atualizar.', 'error');
      }
    });

    row.querySelector('.btn-delete-trip').addEventListener('click', async () => {
      if (!confirm(`Apagar o turno de ${trip.driverName || 'condutor'} (${formatDate(trip.date)})? Isso também apaga as avarias e fotos ligadas a ele.`)) return;
      try {
        await removeTripCascade(trip.id);
        showToast('Turno apagado.', 'success');
        await refresh();
      } catch (error) {
        console.error(error);
        showToast('Erro ao apagar.', 'error');
      }
    });
  });
}

async function removeTripCascade(tripId) {
  const damages = await listDamagesByTrip(tripId);
  for (const d of damages) {
    for (const url of (d.photoUrls || [])) await deletePhoto(url);
    await deleteDamage(d.id);
  }
  await deleteTrip(tripId);
}

async function deleteAllTest() {
  const testTrips = allTrips.filter((t) => t.isTest);
  if (testTrips.length === 0) {
    showToast('Nenhum turno de teste pra apagar.', '');
    return;
  }
  if (!confirm(`Apagar ${testTrips.length} turnos de teste (e avarias/fotos deles)?`)) return;

  const btn = document.getElementById('btnDeleteAllTest');
  btn.disabled = true;
  btn.textContent = 'Apagando...';

  try {
    for (const t of testTrips) await removeTripCascade(t.id);
    showToast('Turnos de teste apagados.', 'success');
    await refresh();
  } catch (error) {
    console.error(error);
    showToast('Erro ao apagar alguns turnos.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Apagar todos os de teste';
  }
}
