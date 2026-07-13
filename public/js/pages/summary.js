import { requireAuth } from '/js/auth.js';
import { getOpenTrip, closeTrip, listDamagesByTrip } from '/js/db.js';
import { renderBottomNav } from '/js/nav.js';
import {
  FUEL_LABELS, escapeHtml, formatCurrency, formatDuration, formatDateTime,
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
  document.getElementById('content').style.display = 'block';
  await render();
  initClose();
}

async function render() {
  document.getElementById('sumVehicle').textContent = trip.vehicleModel || 'Veículo';
  document.getElementById('sumPlate').textContent = trip.vehiclePlate || '';
  document.getElementById('sumDriver').textContent = trip.driverName || driver.name;
  document.getElementById('sumStart').textContent = formatDateTime(trip.startTime);
  document.getElementById('sumDuration').textContent = formatDuration(trip.startTime, trip.endTime);

  const km = trip.kmStart != null && trip.kmEnd != null ? trip.kmEnd - trip.kmStart : null;
  document.getElementById('sumKm').textContent = km != null ? km.toLocaleString('pt-BR') : '—';
  document.getElementById('sumKmDetail').textContent =
    trip.kmStart != null ? `${trip.kmStart} → ${trip.kmEnd ?? '?'}` : 'KM não registrado';

  const fuelStart = trip.fuelStart ? FUEL_LABELS[trip.fuelStart] : '?';
  const fuelEnd = trip.fuelEnd ? FUEL_LABELS[trip.fuelEnd] : '?';
  document.getElementById('sumFuel').textContent = `${fuelStart} → ${fuelEnd}`;

  document.getElementById('sumExpenses').textContent = formatCurrency(trip.totalExpenses || 0);
  const nExp = (trip.expenses || []).length;
  document.getElementById('sumExpensesCount').textContent = `${nExp} lançamento${nExp === 1 ? '' : 's'}`;
  document.getElementById('sumStops').textContent = (trip.stops || []).length;

  const damages = await listDamagesByTrip(trip.id);
  document.getElementById('sumDamages').textContent = damages.length;
  if (damages.length > 0) {
    document.querySelectorAll('.summary-tile')[5].classList.add('warn');
  }

  // Alerta de combustível baixo no retorno
  if (trip.fuelEnd === 'vazio' || trip.fuelEnd === '1/4') {
    document.getElementById('fuelWarning').style.display = 'flex';
  }

  renderPending();
}

// Lista o que falta preencher antes de fechar
// (KM final tem campo próprio nesta página, não entra na lista)
function renderPending() {
  const missing = [];
  if (trip.kmStart == null) missing.push('KM inicial');
  if (!trip.fuelStart) missing.push('Combustível de saída');
  if (!trip.fuelEnd) missing.push('Combustível de retorno');

  const el = document.getElementById('pendingList');
  if (missing.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="card">
      <h3 style="color:var(--warning)">Antes de fechar, registre:</h3>
      <p style="color:var(--text-secondary);font-size:14px;margin-top:8px">
        ${missing.map(escapeHtml).join(' · ')}
      </p>
      <a href="/pages/vehicle.html" class="btn btn-secondary btn-sm" style="margin-top:12px">Ir para Veículo</a>
    </div>`;
}

function initClose() {
  const backdrop = document.getElementById('confirmBackdrop');
  const sheet = document.getElementById('confirmSheet');
  const btnClose = document.getElementById('btnCloseTrip');
  const kmEndEl = document.getElementById('kmEndInput');

  if (trip.kmEnd != null) kmEndEl.value = trip.kmEnd;

  btnClose.addEventListener('click', () => {
    const kmEnd = kmEndEl.value ? Number(kmEndEl.value) : null;

    if (trip.kmStart == null) {
      showToast('Registre o KM inicial na tela Veículo primeiro.', 'error');
      return;
    }
    if (kmEnd == null) {
      showToast('Informe o KM final.', 'error');
      return;
    }
    if (kmEnd < trip.kmStart) {
      showToast('KM final não pode ser menor que o inicial.', 'error');
      return;
    }
    if (!trip.fuelEnd) {
      showToast('Registre o combustível de retorno na tela Veículo primeiro.', 'error');
      return;
    }
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });

  const closeSheet = () => {
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
  };
  backdrop.addEventListener('click', closeSheet);
  document.getElementById('btnCancelClose').addEventListener('click', closeSheet);

  document.getElementById('btnConfirmClose').addEventListener('click', async () => {
    const btn = document.getElementById('btnConfirmClose');
    btn.disabled = true;
    btn.textContent = 'Fechando...';

    // Relê o campo (não confia num valor capturado antes de abrir o sheet).
    const kmEnd = Number(kmEndEl.value);

    try {
      await closeTrip(trip.id, { kmEnd, fuelEnd: trip.fuelEnd });
      trip.kmEnd = kmEnd;
      trip.status = 'closed';
      closeSheet();
      document.getElementById('sumKm').textContent = (kmEnd - trip.kmStart).toLocaleString('pt-BR');
      document.getElementById('sumKmDetail').textContent = `${trip.kmStart} → ${kmEnd}`;
      document.getElementById('sumStatus').textContent = 'Fechado';
      document.getElementById('sumStatus').className = 'badge badge-muted';
      document.getElementById('closedBanner').style.display = 'flex';
      btnClose.style.display = 'none';
      kmEndEl.disabled = true;
      // TODO v3: botão "Exportar PDF" (jsPDF via CDN) com layout do checklist original
      showToast('Turno fechado com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao fechar turno.', 'error');
      btn.disabled = false;
      btn.textContent = 'Sim, fechar turno';
    }
  });
}
