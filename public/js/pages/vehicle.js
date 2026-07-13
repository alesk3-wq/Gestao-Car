import { requireAuth } from '/js/auth.js';
import { getOpenTrip, updateTrip, createDamage, listDamagesByVehicle, getLastClosedTrip } from '/js/db.js';
import { uploadPhotos } from '/js/storage.js';
import { renderBottomNav } from '/js/nav.js';
import {
  FUEL_LEVELS, FUEL_LABELS, DAMAGE_LOCATIONS,
  escapeHtml, formatDateTime, showToast, registerServiceWorker
} from '/js/utils.js';

registerServiceWorker();
renderBottomNav();

/* ── Tabs ── */

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

/* ── Combustível ── */

const FUEL_FILL = { 'vazio': '5%', '1/4': '25%', '1/2': '50%', '3/4': '75%', 'cheio': '100%' };

function renderFuelOptions(container, selected, onSelect) {
  container.innerHTML = FUEL_LEVELS.map((level) => `
    <button type="button" class="fuel-option ${level === selected ? 'selected' : ''}" data-level="${level}">
      <span class="fuel-bar" style="--fill:${FUEL_FILL[level]}"></span>
      ${FUEL_LABELS[level]}
    </button>
  `).join('');

  container.querySelectorAll('.fuel-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.fuel-option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelect(btn.dataset.level);
    });
  });
}

function initFuel(trip) {
  renderFuelOptions(document.getElementById('fuelStartOptions'), trip.fuelStart, async (level) => {
    try {
      await updateTrip(trip.id, { fuelStart: level });
      trip.fuelStart = level;
      showToast('Combustível de saída registrado.', 'success');
    } catch {
      showToast('Erro ao salvar. Tente novamente.', 'error');
    }
  });

  renderFuelOptions(document.getElementById('fuelEndOptions'), trip.fuelEnd, async (level) => {
    try {
      await updateTrip(trip.id, { fuelEnd: level });
      trip.fuelEnd = level;
      showToast('Combustível de retorno registrado.', 'success');
    } catch {
      showToast('Erro ao salvar. Tente novamente.', 'error');
    }
  });
}

/* ── KM ── */
// KM final é registrado só no fechamento do turno (tela Resumo).
// Aqui cuidamos só do KM inicial, com handoff do turno anterior.

async function initKm(trip) {
  const kmStartEl = document.getElementById('kmStart');
  const kmHintEl = document.getElementById('kmHandoffHint');

  if (trip.kmStart != null) {
    kmStartEl.value = trip.kmStart;
  } else {
    try {
      const lastTrip = await getLastClosedTrip(trip.vehicleId);
      if (lastTrip?.kmEnd != null) {
        kmStartEl.value = lastTrip.kmEnd;
        kmHintEl.textContent = `Último KM registrado (turno anterior): ${lastTrip.kmEnd.toLocaleString('pt-BR')} — confira com o painel.`;
        kmHintEl.style.display = 'block';
      }
    } catch (e) {
      console.error('Erro ao buscar KM do turno anterior:', e);
    }
  }

  document.getElementById('btnSaveKm').addEventListener('click', async () => {
    const kmStart = kmStartEl.value ? Number(kmStartEl.value) : null;

    if (kmStart == null) {
      showToast('Informe o KM inicial.', 'error');
      return;
    }

    try {
      await updateTrip(trip.id, { kmStart });
      trip.kmStart = kmStart;
      showToast('KM inicial salvo.', 'success');
    } catch (e) {
      console.error('Erro ao salvar KM:', e);
      showToast('Erro ao salvar. Tente novamente.', 'error');
    }
  });
}

/* ── Avarias ── */

let selectedZone = null;
let selectedFiles = [];
let vehicleDamages = [];

async function initDamages(trip, driver) {
  // Injeta o SVG inline pra permitir clique nas zonas
  const svgText = await fetch('/assets/images/car-diagram.svg').then((r) => r.text());
  const diagramEl = document.getElementById('carDiagram');
  diagramEl.innerHTML = svgText;

  diagramEl.querySelectorAll('.zone').forEach((zone) => {
    zone.addEventListener('click', () => openDamageSheet(zone.dataset.zone));
  });

  await refreshDamages(trip);
  initDamageSheet(trip, driver);
}

async function refreshDamages(trip) {
  vehicleDamages = await listDamagesByVehicle(trip.vehicleId);
  renderDamagesList(trip);
  markDamagedZones();
}

function markDamagedZones() {
  const damagedZones = new Set(vehicleDamages.filter((d) => !d.resolved).map((d) => d.location));
  document.querySelectorAll('#carDiagram .zone').forEach((zone) => {
    zone.classList.toggle('has-damage', damagedZones.has(zone.dataset.zone));
  });
}

function renderDamagesList(trip) {
  const list = document.getElementById('damagesList');
  const open = vehicleDamages.filter((d) => !d.resolved);

  if (open.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma avaria registrada neste veículo. 🎉</div>';
    return;
  }

  list.innerHTML = open.slice(0, 10).map((d) => `
    <div class="card damage-card">
      ${d.photoUrls?.[0] ? `<img class="damage-thumb" src="${escapeHtml(d.photoUrls[0])}" alt="Foto da avaria">` : ''}
      <div class="damage-info">
        <div class="card-row">
          <strong>${escapeHtml(DAMAGE_LOCATIONS[d.location] || d.location)}</strong>
          <span class="badge ${d.tripId === trip.id ? 'badge-danger' : 'badge-muted'}">
            ${d.tripId === trip.id ? 'Nova (seu turno)' : 'Pré-existente'}
          </span>
        </div>
        <p class="damage-desc">${escapeHtml(d.description)}</p>
        <p class="damage-meta">${escapeHtml(d.driverName || '')} · ${formatDateTime(d.reportedAt)}</p>
      </div>
    </div>
  `).join('');
}

function initDamageSheet(trip, driver) {
  const backdrop = document.getElementById('damageBackdrop');
  const sheet = document.getElementById('damageSheet');
  const photosInput = document.getElementById('damagePhotos');
  const previews = document.getElementById('photoPreviews');

  document.getElementById('btnAddPhoto').addEventListener('click', () => photosInput.click());

  photosInput.addEventListener('change', () => {
    selectedFiles = [...selectedFiles, ...photosInput.files];
    photosInput.value = '';
    previews.innerHTML = selectedFiles
      .map((f) => `<img src="${URL.createObjectURL(f)}" alt="Prévia">`)
      .join('');
  });

  const close = () => {
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
  };
  backdrop.addEventListener('click', close);
  document.getElementById('btnCancelDamage').addEventListener('click', close);

  document.getElementById('btnSaveDamage').addEventListener('click', async () => {
    const description = document.getElementById('damageDesc').value.trim();
    if (!description) {
      showToast('Descreva a avaria.', 'error');
      return;
    }

    const btn = document.getElementById('btnSaveDamage');
    btn.disabled = true;
    btn.textContent = 'Registrando...';

    try {
      const photoUrls = selectedFiles.length
        ? await uploadPhotos(selectedFiles, trip.vehicleId, trip.id)
        : [];

      await createDamage({
        vehicleId: trip.vehicleId,
        tripId: trip.id,
        driverId: driver.id,
        driverName: driver.name,
        type: 'new',
        location: selectedZone,
        description,
        photoUrls
      });
      // TODO v2: notificar gestor (Cloud Functions + FCM)

      showToast('Avaria registrada.', 'success');
      close();
      await refreshDamages(trip);
    } catch (error) {
      console.error(error);
      showToast('Erro ao registrar avaria.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Registrar Avaria Nova';
    }
  });
}

function openDamageSheet(zone) {
  selectedZone = zone;
  selectedFiles = [];
  document.getElementById('damageLocationLabel').value = DAMAGE_LOCATIONS[zone] || zone;
  document.getElementById('damageDesc').value = '';
  document.getElementById('photoPreviews').innerHTML = '';
  document.getElementById('damageBackdrop').classList.add('open');
  document.getElementById('damageSheet').classList.add('open');
}

/* ── Orquestração ── */
// Roda por último, depois de todas as funções/consts acima já declaradas
// (evita ReferenceError de temporal dead zone ao chamar init* cedo demais).

const { driver } = await requireAuth();
const trip = await getOpenTrip(driver.id);

document.getElementById('loading').style.display = 'none';

if (!trip) {
  document.getElementById('noTripMsg').style.display = 'block';
  document.querySelector('.tabs').style.display = 'none';
} else {
  document.getElementById('content').style.display = 'block';
  document.getElementById('vehicleTitle').textContent = trip.vehicleModel || 'Veículo';
  document.getElementById('vehiclePlateBadge').textContent = trip.vehiclePlate || '';

  // Cada seção é isolada: um erro numa (ex.: avarias) nunca impede as outras
  // (combustível, KM) de inicializar.
  try { initTabs(); } catch (e) { console.error('initTabs falhou:', e); }
  try { initFuel(trip); } catch (e) { console.error('initFuel falhou:', e); }
  try { await initKm(trip); } catch (e) { console.error('initKm falhou:', e); }
  try {
    await initDamages(trip, driver);
  } catch (e) {
    console.error('initDamages falhou:', e);
    showToast('Erro ao carregar avarias.', 'error');
  }
}
