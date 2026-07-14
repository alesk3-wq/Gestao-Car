import { requireAuth, logout } from '/js/auth.js';
import { getOpenTrip, listVehicles, listDrivers, createTrip } from '/js/db.js';
import { renderBottomNav } from '/js/nav.js';
import {
  escapeHtml, formatCurrency, formatDuration, todayISO, showToast, registerServiceWorker
} from '/js/utils.js';

registerServiceWorker();
renderBottomNav();

const els = {
  loading: document.getElementById('loading'),
  noTrip: document.getElementById('noTripSection'),
  openTrip: document.getElementById('openTripSection'),
  vehicleSelect: document.getElementById('vehicleSelect'),
  secondDriverSelect: document.getElementById('secondDriverSelect'),
  btnStart: document.getElementById('btnStartTrip'),
  btnContinue: document.getElementById('btnContinueTrip')
};

document.getElementById('btnLogout').addEventListener('click', logout);

const { driver } = await requireAuth();

if (driver.role === 'admin') {
  document.getElementById('linkAdminPanel').style.display = 'flex';
}

document.getElementById('greetingName').textContent = `Olá, ${driver.name.split(' ')[0]}!`;
document.getElementById('greetingDate').textContent = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', day: 'numeric', month: 'long'
});

const openTrip = await getOpenTrip(driver.id);
els.loading.style.display = 'none';

if (openTrip) {
  renderOpenTrip(openTrip);
} else {
  await renderStartFlow();
}

function renderOpenTrip(trip) {
  els.openTrip.style.display = 'block';
  document.getElementById('tripVehicle').textContent = trip.vehicleModel || 'Veículo';
  document.getElementById('tripPlate').textContent = trip.vehiclePlate || '';
  document.getElementById('tripDuration').textContent = formatDuration(trip.startTime, null);
  document.getElementById('tripStops').textContent = (trip.stops || []).length;
  document.getElementById('tripExpenses').textContent = formatCurrency(trip.totalExpenses || 0);

  els.btnContinue.addEventListener('click', () => {
    window.location.href = '/pages/vehicle.html';
  });
}

async function renderStartFlow() {
  els.noTrip.style.display = 'block';

  const vehicles = await listVehicles({ activeOnly: true });

  if (vehicles.length === 0) {
    els.vehicleSelect.innerHTML = '<option value="">Nenhum veículo cadastrado</option>';
    els.btnStart.disabled = true;
    return;
  }

  els.vehicleSelect.innerHTML = vehicles.map((v) => `
    <option value="${v.id}">${escapeHtml(v.model)} — ${escapeHtml(v.plate)}</option>
  `).join('');

  // Pré-seleciona o veículo atribuído ao condutor
  if (driver.defaultVehicleId && vehicles.some((v) => v.id === driver.defaultVehicleId)) {
    els.vehicleSelect.value = driver.defaultVehicleId;
  }

  // Segundo condutor / copiloto (opcional, só registro)
  try {
    const drivers = await listDrivers();
    const others = drivers.filter((d) => d.id !== driver.id && d.active);
    els.secondDriverSelect.innerHTML = '<option value="">Nenhum</option>' + others.map((d) => `
      <option value="${d.id}">${escapeHtml(d.name)}</option>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar condutores:', error);
  }

  els.btnStart.addEventListener('click', async () => {
    const vehicle = vehicles.find((v) => v.id === els.vehicleSelect.value);
    if (!vehicle) return;

    const secondDriverId = els.secondDriverSelect.value || null;
    const secondDriverOption = els.secondDriverSelect.selectedOptions[0];
    const secondDriverName = secondDriverId ? secondDriverOption.textContent : null;

    els.btnStart.disabled = true;
    els.btnStart.textContent = 'Iniciando...';

    try {
      await createTrip({
        driverId: driver.id,
        driverName: driver.name,
        secondDriverId,
        secondDriverName,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        vehicleModel: vehicle.model,
        date: todayISO(),
        startTime: new Date(),
        kmStart: null,
        fuelStart: null
      });
      // Direto pra tela do veículo: conferir avarias, combustível e KM inicial
      window.location.href = '/pages/vehicle.html';
    } catch (error) {
      console.error(error);
      showToast('Erro ao iniciar turno. Tente novamente.', 'error');
      els.btnStart.disabled = false;
      els.btnStart.textContent = 'Iniciar Turno';
    }
  });
}
