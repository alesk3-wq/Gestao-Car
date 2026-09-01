import { requireAuth } from '/js/auth.js';
import { getOpenTrip, closeTrip, updateTrip, listDamagesByTrip } from '/js/db.js';
import { renderBottomNav } from '/js/nav.js';
import {
  FUEL_LABELS, escapeHtml, formatCurrency, formatDuration, formatDateTime,
  showToast, registerServiceWorker, toDateTimeLocalValue, parseDateTimeLocal
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
  if (trip.status === 'open') setupTimeEdit();
  if (trip.secondDriverName) {
    document.getElementById('sumSecondDriver').textContent = trip.secondDriverName;
    document.getElementById('sumSecondDriverRow').hidden = false;
  }
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

// Ajuste de horários — só com turno aberto. Início salva na hora; fim é lido
// no fechamento (ver initClose).
function setupTimeEdit() {
  const card = document.getElementById('timeEditCard');
  const startInput = document.getElementById('sumStartInput');
  const endInput = document.getElementById('sumEndInput');

  card.hidden = false;
  document.getElementById('sumStartRow').hidden = true;

  startInput.value = toDateTimeLocalValue(trip.startTime);
  endInput.value = toDateTimeLocalValue(trip.endTime) || toDateTimeLocalValue(new Date());

  startInput.addEventListener('change', async () => {
    const newStart = parseDateTimeLocal(startInput.value);
    if (!newStart) {
      showToast('Horário inválido.', 'error');
      startInput.value = toDateTimeLocalValue(trip.startTime);
      return;
    }
    if (newStart.getTime() > Date.now() + 60000) {
      showToast('O início não pode ser no futuro.', 'error');
      startInput.value = toDateTimeLocalValue(trip.startTime);
      return;
    }
    try {
      await updateTrip(trip.id, { startTime: newStart });
      trip.startTime = newStart;
      document.getElementById('sumStart').textContent = formatDateTime(trip.startTime);
      document.getElementById('sumDuration').textContent = formatDuration(trip.startTime, trip.endTime);
      showToast('Início do turno atualizado.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao salvar. Tente novamente.', 'error');
      startInput.value = toDateTimeLocalValue(trip.startTime);
    }
  });
}

// Fim declarado do turno, lido do input no fechamento. Retorna Date válido
// ou null (com toast) se estiver vazio/antes do início.
function resolveEndTime() {
  const endInput = document.getElementById('sumEndInput');
  const endTime = parseDateTimeLocal(endInput?.value);
  if (!endTime) {
    showToast('Informe o horário de fim do turno.', 'error');
    return null;
  }
  const start = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
  if (endTime.getTime() <= start.getTime()) {
    showToast('O fim do turno tem que ser depois do início.', 'error');
    return null;
  }
  return endTime;
}

// Lista o que falta preencher antes de fechar
function renderPending() {
  const missing = [];
  if (trip.kmStart == null) missing.push('KM inicial');
  if (trip.kmEnd == null) missing.push('KM final');
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

  document.getElementById('confirmVehicle').textContent =
    [trip.vehicleModel, trip.vehiclePlate].filter(Boolean).join(' · ') || 'veículo não informado';

  btnClose.addEventListener('click', () => {
    if (trip.kmEnd == null || !trip.fuelEnd) {
      showToast('Registre KM final e combustível de retorno na tela Veículo primeiro.', 'error');
      return;
    }
    if (!resolveEndTime()) return;
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
    const endTime = resolveEndTime();
    if (!endTime) {
      closeSheet();
      return;
    }

    const btn = document.getElementById('btnConfirmClose');
    btn.disabled = true;
    btn.textContent = 'Fechando...';

    try {
      await closeTrip(trip.id, { kmEnd: trip.kmEnd, fuelEnd: trip.fuelEnd, endTime });
      trip.status = 'closed';
      trip.endTime = endTime;
      closeSheet();
      document.getElementById('sumStatus').textContent = 'Fechado';
      document.getElementById('sumStatus').className = 'badge badge-muted';
      document.getElementById('closedBanner').style.display = 'flex';
      btnClose.style.display = 'none';

      // Volta pra visão só-leitura dos horários, já com os valores finais
      document.getElementById('timeEditCard').hidden = true;
      document.getElementById('sumStartRow').hidden = false;
      document.getElementById('sumStart').textContent = formatDateTime(trip.startTime);
      document.getElementById('sumDuration').textContent = formatDuration(trip.startTime, trip.endTime);
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
