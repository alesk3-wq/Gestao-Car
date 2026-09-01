import { requireAuth } from '/js/auth.js';
import {
  getOpenTrip, updateTrip, createDamage, listDamagesByVehicle, listDamagesByTrip,
  getLastClosedTrip, listVehicles
} from '/js/db.js';
import { uploadPhotos } from '/js/storage.js';
import { renderBottomNav } from '/js/nav.js';
import {
  FUEL_LEVELS, FUEL_LABELS, DAMAGE_LOCATIONS,
  escapeHtml, formatDateTime, showToast, registerServiceWorker, initTabs, openLightbox
} from '/js/utils.js';

registerServiceWorker();
renderBottomNav();

/* ── Combustível ── */

const FUEL_FILL = { 'vazio': '5%', '1/4': '25%', '1/2': '50%', '3/4': '75%', 'cheio': '100%' };

// suggested=true: o nível já vem marcado, mas em amarelo (sugestão do condutor
// anterior, ainda não confirmada). Qualquer toque confirma e deixa verde.
function renderFuelOptions(container, selected, onSelect, suggested = false) {
  const markClass = suggested ? 'suggested' : 'selected';
  container.innerHTML = FUEL_LEVELS.map((level) => `
    <button type="button" class="fuel-option ${level === selected ? markClass : ''}" data-level="${level}">
      <span class="fuel-bar" style="--fill:${FUEL_FILL[level]}"></span>
      ${FUEL_LABELS[level]}
    </button>
  `).join('');

  container.querySelectorAll('.fuel-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.fuel-option').forEach((b) => b.classList.remove('selected', 'suggested'));
      btn.classList.add('selected');
      onSelect(btn.dataset.level);
    });
  });
}

// Re-chamável (ex.: após trocar o veículo do turno).
function initFuel(trip, lastTrip) {
  // Handoff: sugere o nível declarado pelo condutor anterior (pré-seleciona em
  // amarelo, sem salvar) — condutor confirma tocando de novo (fica verde) ou
  // corrige tocando noutro.
  const hintEl = document.getElementById('fuelHandoffHint');
  hintEl.style.display = 'none';

  let fuelStartSuggested = trip.fuelStart;
  let fuelStartIsSuggestion = false;
  if (fuelStartSuggested == null && lastTrip?.fuelEnd != null) {
    fuelStartSuggested = lastTrip.fuelEnd;
    fuelStartIsSuggestion = true;
    hintEl.textContent = `Nível declarado pelo condutor anterior: ${FUEL_LABELS[lastTrip.fuelEnd]} — confira no veículo e confirme.`;
    hintEl.style.display = 'block';
  }

  renderFuelOptions(document.getElementById('fuelStartOptions'), fuelStartSuggested, async (level) => {
    try {
      await updateTrip(trip.id, { fuelStart: level });
      trip.fuelStart = level;
      const hint = document.getElementById('fuelHandoffHint');
      if (hint) hint.style.display = 'none';
      showToast('Combustível de saída registrado.', 'success');
    } catch {
      showToast('Erro ao salvar. Tente novamente.', 'error');
    }
  }, fuelStartIsSuggestion);

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
// KM inicial e final ficam juntos aqui. Se o condutor esquecer o KM final,
// a tela Resumo avisa antes de fechar o turno (ver summary.js).

// Re-chamável (ex.: após trocar o veículo do turno). Usa .onclick pra não
// empilhar handlers a cada chamada.
function initKm(trip, lastTrip) {
  const kmStartEl = document.getElementById('kmStart');
  const kmEndEl = document.getElementById('kmEnd');
  const kmHintEl = document.getElementById('kmHandoffHint');
  const btnSaveKm = document.getElementById('btnSaveKm');

  kmHintEl.style.display = 'none';
  kmStartEl.classList.remove('km-pending');
  kmStartEl.value = '';
  kmEndEl.value = '';

  const inheritedKm = lastTrip?.kmEnd ?? null;
  let kmStartPending = false; // KM inicial veio herdado e ainda não foi confirmado

  if (trip.kmStart != null) {
    kmStartEl.value = trip.kmStart;
  } else if (inheritedKm != null) {
    kmStartEl.value = inheritedKm;
    kmStartPending = true;
    kmStartEl.classList.add('km-pending');
    kmHintEl.textContent = `Último KM registrado (turno anterior): ${inheritedKm.toLocaleString('pt-BR')} — confira com o painel e confirme.`;
    kmHintEl.style.display = 'block';
  }

  if (trip.kmEnd != null) kmEndEl.value = trip.kmEnd;

  btnSaveKm.textContent = kmStartPending ? 'Confirmar KM inicial' : 'Salvar KM';

  btnSaveKm.onclick = async () => {
    const kmStart = kmStartEl.value ? Number(kmStartEl.value) : null;
    const kmEnd = kmEndEl.value ? Number(kmEndEl.value) : null;

    if (kmStart == null) {
      showToast('Informe o KM inicial.', 'error');
      return;
    }
    if (kmEnd != null && kmEnd < kmStart) {
      showToast('KM final não pode ser menor que o inicial.', 'error');
      return;
    }

    const belowInherited = kmStartPending && inheritedKm != null && kmStart < inheritedKm;

    try {
      await updateTrip(trip.id, { kmStart, kmEnd });
      trip.kmStart = kmStart;
      trip.kmEnd = kmEnd;
      kmStartPending = false;
      kmStartEl.classList.remove('km-pending');
      kmHintEl.style.display = 'none';
      btnSaveKm.textContent = 'Salvar KM';
      showToast(
        belowInherited ? 'KM salvo — atenção: menor que o do condutor anterior.' : 'KM salvo.',
        belowInherited ? '' : 'success'
      );
    } catch (e) {
      console.error('Erro ao salvar KM:', e);
      showToast('Erro ao salvar. Tente novamente.', 'error');
    }
  };
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

  const shown = open.slice(0, 10);

  list.innerHTML = shown.map((d) => `
    <div class="card damage-card">
      ${(d.photoUrls || []).length ? `
        <div class="damage-thumbs">
          ${d.photoUrls.map((url, i) => `<img class="damage-thumb" src="${escapeHtml(url)}" alt="Foto da avaria ${i + 1}">`).join('')}
        </div>` : ''}
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

  list.querySelectorAll('.damage-card').forEach((card, i) => {
    card.querySelectorAll('.damage-thumb').forEach((img, photoIdx) => {
      img.addEventListener('click', () => openLightbox(shown[i].photoUrls, photoIdx));
    });
  });
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

/* ── Trocar veículo do turno ── */
// Pro caso do condutor ter errado o veículo ao iniciar. Ao trocar, zera KM
// (início/fim) e combustível de saída e re-roda o handoff pro veículo novo.

async function initVehicleSwap(trip) {
  const backdrop = document.getElementById('vehicleBackdrop');
  const sheet = document.getElementById('vehicleSheet');
  const picker = document.getElementById('vehiclePicker');
  const btnOpen = document.getElementById('btnSwapVehicle');

  const vehicles = await listVehicles({ activeOnly: true });
  picker.innerHTML = vehicles
    .map((v) => `<option value="${v.id}">${escapeHtml(v.model)} — ${escapeHtml(v.plate)}</option>`)
    .join('');

  const close = () => {
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
  };

  btnOpen.style.display = 'flex';
  btnOpen.addEventListener('click', () => {
    picker.value = trip.vehicleId;
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });
  backdrop.addEventListener('click', close);
  document.getElementById('btnCancelSwap').addEventListener('click', close);

  document.getElementById('btnConfirmSwap').addEventListener('click', async () => {
    const newVehicle = vehicles.find((v) => v.id === picker.value);
    if (!newVehicle || newVehicle.id === trip.vehicleId) {
      close();
      return;
    }

    const btn = document.getElementById('btnConfirmSwap');
    btn.disabled = true;
    btn.textContent = 'Trocando...';

    try {
      await updateTrip(trip.id, {
        vehicleId: newVehicle.id,
        vehiclePlate: newVehicle.plate,
        vehicleModel: newVehicle.model,
        kmStart: null,
        kmEnd: null,
        fuelStart: null
      });
      Object.assign(trip, {
        vehicleId: newVehicle.id,
        vehiclePlate: newVehicle.plate,
        vehicleModel: newVehicle.model,
        kmStart: null,
        kmEnd: null,
        fuelStart: null
      });

      document.getElementById('vehicleTitle').textContent = trip.vehicleModel || 'Veículo';
      document.getElementById('vehiclePlateBadge').textContent = trip.vehiclePlate || '';

      let lastTrip = null;
      try {
        lastTrip = await getLastClosedTrip(trip.vehicleId);
      } catch (e) {
        console.error('Erro ao buscar turno anterior:', e);
      }

      try { initFuel(trip, lastTrip); } catch (e) { console.error('initFuel falhou:', e); }
      try { initKm(trip, lastTrip); } catch (e) { console.error('initKm falhou:', e); }
      try { await refreshDamages(trip); } catch (e) { console.error('refreshDamages falhou:', e); }

      close();

      let msg = 'Veículo trocado — confira o KM inicial no painel do carro.';
      try {
        const dmgs = await listDamagesByTrip(trip.id);
        if (dmgs.length) msg += ' Avarias já registradas ficam no veículo anterior.';
      } catch {}
      showToast(msg, 'success');

      const kmTab = document.querySelector('.tab[data-tab="km"]');
      if (kmTab) kmTab.click();
    } catch (e) {
      console.error('Erro ao trocar veículo:', e);
      showToast('Erro ao trocar veículo.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Trocar veículo';
    }
  });
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

  // Turno anterior do mesmo veículo — usado pro handoff de KM e combustível.
  // Só busca se algum dos dois ainda não foi preenchido neste turno.
  let lastTrip = null;
  if (trip.kmStart == null || !trip.fuelStart) {
    try {
      lastTrip = await getLastClosedTrip(trip.vehicleId);
    } catch (e) {
      console.error('Erro ao buscar turno anterior:', e);
    }
  }

  // Cada seção é isolada: um erro numa (ex.: avarias) nunca impede as outras
  // (combustível, KM) de inicializar.
  try { initTabs(); } catch (e) { console.error('initTabs falhou:', e); }
  try { initFuel(trip, lastTrip); } catch (e) { console.error('initFuel falhou:', e); }
  try { initKm(trip, lastTrip); } catch (e) { console.error('initKm falhou:', e); }
  try { await initVehicleSwap(trip); } catch (e) { console.error('initVehicleSwap falhou:', e); }
  try {
    await initDamages(trip, driver);
  } catch (e) {
    console.error('initDamages falhou:', e);
    showToast('Erro ao carregar avarias.', 'error');
  }
}
