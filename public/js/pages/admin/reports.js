import { requireAuth, logout } from '/js/auth.js';
import { listTrips, listAllDamages, listAllMaintenance, listVehicles } from '/js/db.js';
import {
  escapeHtml, formatCurrency, formatDate, showToast, registerServiceWorker, initTabs
} from '/js/utils.js';

registerServiceWorker();
document.getElementById('btnLogout').addEventListener('click', logout);

await requireAuth({ adminOnly: true });
initTabs();

// iOS PWA instalado (standalone): window.print() e window.open()/<a target="_blank">
// não escapam do modo standalone (ver trip.js). O que funciona é um link real
// com o esquema x-safari-, então os botões viram link nesse caso. Como o
// período pode mudar sem recarregar a página, o href é atualizado a cada
// refresh() — não dá pra fixar uma vez só como no relatório de turno.
const iosStandalone = window.navigator.standalone === true;
let printLinks = [];

function printUrl() {
  const { dateFrom, dateTo } = getFilterRange();
  const url = new URL(`${location.origin}${location.pathname}`);
  url.searchParams.set('from', dateFrom);
  url.searchParams.set('to', dateTo);
  url.searchParams.set('print', '1');
  return url.toString();
}

function turnIntoPrintLink(btn) {
  const a = document.createElement('a');
  for (const attr of btn.attributes) a.setAttribute(attr.name, attr.value);
  a.innerHTML = btn.innerHTML;
  a.rel = 'noopener';
  btn.replaceWith(a);
  return a;
}

function updatePrintLinks() {
  if (!iosStandalone) return;
  const href = `x-safari-${printUrl()}`;
  printLinks.forEach((a) => { a.href = href; });
}

if (iosStandalone) {
  printLinks = [
    turnIntoPrintLink(document.getElementById('btnPrint')),
    turnIntoPrintLink(document.getElementById('btnPrintBottom'))
  ];
} else {
  document.getElementById('btnPrint').addEventListener('click', () => window.print());
  document.getElementById('btnPrintBottom').addEventListener('click', () => window.print());
}

document.getElementById('btnFilter').addEventListener('click', () => refresh(getFilterRange()));
document.getElementById('btnThisMonth').addEventListener('click', () => applyRange(monthRange(0)));
document.getElementById('btnLastMonth').addEventListener('click', () => applyRange(monthRange(-1)));
document.getElementById('btnThisYear').addEventListener('click', () => applyRange(yearRange()));

// Período inicial: da URL (handoff do print no iOS) ou mês corrente.
const initialParams = new URLSearchParams(location.search);
const wantsPrint = initialParams.get('print') === '1';
const initialRange = (initialParams.get('from') && initialParams.get('to'))
  ? { dateFrom: initialParams.get('from'), dateTo: initialParams.get('to') }
  : monthRange(0);

await applyRange(initialRange);

if (wantsPrint) {
  if (iosStandalone) {
    showToast('Abra este relatório num navegador (fora do app) para exportar o PDF.', 'error');
  } else {
    history.replaceState(null, '', `${location.pathname}?from=${encodeURIComponent(initialRange.dateFrom)}&to=${encodeURIComponent(initialRange.dateTo)}`);
    setTimeout(() => window.print(), 150);
  }
}

/* ── Período ── */

function dateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthRange(offset) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { dateFrom: dateISO(from), dateTo: dateISO(to) };
}

function yearRange() {
  const y = new Date().getFullYear();
  return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
}

function applyRange({ dateFrom, dateTo }) {
  document.getElementById('repFrom').value = dateFrom;
  document.getElementById('repTo').value = dateTo;
  return refresh({ dateFrom, dateTo });
}

function getFilterRange() {
  return {
    dateFrom: document.getElementById('repFrom').value,
    dateTo: document.getElementById('repTo').value
  };
}

// Timestamp do Firestore dentro de [de 00:00, até 23:59:59] (strings "YYYY-MM-DD").
function inRange(ts, dateFrom, dateTo) {
  if (!ts?.toDate) return false;
  const d = ts.toDate();
  return d >= new Date(`${dateFrom}T00:00:00`) && d <= new Date(`${dateTo}T23:59:59`);
}

/* ── Carregar e agregar ── */

async function refresh({ dateFrom, dateTo }) {
  if (!dateFrom || !dateTo) {
    showToast('Informe o período.', 'error');
    return;
  }

  document.getElementById('loading').style.display = 'block';
  document.getElementById('content').style.display = 'none';

  try {
    const [allTrips, allDamages, allMaintenance, allVehicles] = await Promise.all([
      listTrips({ dateFrom, dateTo, max: 10000 }),
      listAllDamages(),
      listAllMaintenance(),
      listVehicles()
    ]);

    // Turnos/veículos/revisões de teste (tela Dev) nunca entram no relatório real.
    const trips = allTrips.filter((t) => !t.isTest);
    const damagesAllTime = allDamages.filter((d) => !d.isTest);
    const maint = allMaintenance.filter((m) => !m.isTest && m.date >= dateFrom && m.date <= dateTo);
    const vehicleLabel = new Map(
      allVehicles.filter((v) => !v.isTest).map((v) => [v.id, `${v.model} · ${v.plate}`])
    );

    renderFinanceiro(trips, maint);
    renderOperacional(trips, damagesAllTime, vehicleLabel, dateFrom, dateTo);
    document.getElementById('printTitle').textContent =
      `Relatório Gerencial — ${formatDate(dateFrom)} a ${formatDate(dateTo)}`;
    updatePrintLinks();
  } catch (error) {
    console.error(error);
    showToast('Erro ao carregar relatório.', 'error');
  } finally {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  }
}

// Agrupa items por chave, somando um valor. keyFn retorna { id, label } ou null (ignora).
function groupSum(items, keyFn, valueFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const entry = map.get(key.id) || { id: key.id, label: key.label, total: 0 };
    entry.total += valueFn(item);
    map.set(key.id, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function renderMoneyBreakdown(containerId, groups, total) {
  const el = document.getElementById(containerId);
  if (groups.length === 0) {
    el.innerHTML = '<div class="empty-state">Sem dados no período.</div>';
    return;
  }
  el.innerHTML = groups.map((g) => `
    <div class="card-row" style="margin-top:8px">
      <span class="card-label">${escapeHtml(g.label)}</span>
      <span class="card-value">${formatCurrency(g.total)}${total > 0 ? ` (${Math.round(g.total / total * 100)}%)` : ''}</span>
    </div>
  `).join('');
}

function renderKmBreakdown(containerId, groups) {
  const el = document.getElementById(containerId);
  if (groups.length === 0) {
    el.innerHTML = '<div class="empty-state">Sem dados no período.</div>';
    return;
  }
  el.innerHTML = groups.map((g) => `
    <div class="card-row" style="margin-top:8px">
      <span class="card-label">${escapeHtml(g.label)}</span>
      <span class="card-value">${g.total.toLocaleString('pt-BR')} km</span>
    </div>
  `).join('');
}

/* ── Financeiro ── */

function renderFinanceiro(trips, maint) {
  const expenses = trips.flatMap((t) => (t.expenses || []).map((e) => ({
    ...e,
    vehicleId: t.vehicleId,
    vehicleLabel: `${t.vehicleModel || 'Veículo'} · ${t.vehiclePlate || ''}`,
    driverId: t.driverId,
    driverName: t.driverName || '—'
  })));

  const totalExpenses = expenses.reduce((sum, e) => sum + (e.value || 0), 0);
  const maintCost = maint.reduce((sum, m) => sum + (m.cost || 0), 0);
  const totalKm = trips.reduce((sum, t) => (
    t.kmStart != null && t.kmEnd != null ? sum + (t.kmEnd - t.kmStart) : sum
  ), 0);
  const operatingCost = totalExpenses + maintCost;
  const costPerKm = totalKm > 0 ? operatingCost / totalKm : null;

  document.getElementById('finTotalExpenses').textContent = formatCurrency(totalExpenses);
  document.getElementById('finMaintCost').textContent = formatCurrency(maintCost);
  document.getElementById('finCostPerKm').textContent = costPerKm != null ? formatCurrency(costPerKm) : '—';
  document.getElementById('finTotalKm').textContent = totalKm.toLocaleString('pt-BR');

  renderMoneyBreakdown(
    'finByType',
    groupSum(expenses, (e) => ({ id: e.type, label: e.type ? e.type[0].toUpperCase() + e.type.slice(1) : 'Outro' }), (e) => e.value || 0),
    totalExpenses
  );
  renderMoneyBreakdown(
    'finByVehicle',
    groupSum(expenses, (e) => (e.vehicleId ? { id: e.vehicleId, label: e.vehicleLabel } : null), (e) => e.value || 0),
    totalExpenses
  );
  renderMoneyBreakdown(
    'finByDriver',
    groupSum(expenses, (e) => (e.driverId ? { id: e.driverId, label: e.driverName } : null), (e) => e.value || 0),
    totalExpenses
  );
  renderKmBreakdown(
    'finKmByVehicle',
    groupSum(
      trips.filter((t) => t.kmStart != null && t.kmEnd != null),
      (t) => ({ id: t.vehicleId, label: `${t.vehicleModel || 'Veículo'} · ${t.vehiclePlate || ''}` }),
      (t) => t.kmEnd - t.kmStart
    )
  );
  renderMoneyBreakdown(
    'finMaintByVehicle',
    groupSum(maint, (m) => ({ id: m.vehicleId, label: `${m.vehicleModel || 'Veículo'} · ${m.vehiclePlate || ''}` }), (m) => m.cost || 0),
    maintCost
  );
}

/* ── Operacional ── */

function formatHours(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function driverUsage(trips) {
  const map = new Map();
  for (const t of trips) {
    if (!t.driverId) continue;
    const entry = map.get(t.driverId) || { id: t.driverId, label: t.driverName || '—', trips: 0, km: 0, ms: 0 };
    entry.trips += 1;
    if (t.kmStart != null && t.kmEnd != null) entry.km += (t.kmEnd - t.kmStart);
    const start = t.startTime?.toDate ? t.startTime.toDate() : (t.startTime ? new Date(t.startTime) : null);
    const end = t.endTime?.toDate ? t.endTime.toDate() : (t.endTime ? new Date(t.endTime) : null);
    if (start && end) entry.ms += (end - start);
    map.set(t.driverId, entry);
  }
  return [...map.values()].sort((a, b) => b.trips - a.trips);
}

function renderOperacional(trips, damagesAllTime, vehicleLabel, dateFrom, dateTo) {
  document.getElementById('opTripsCount').textContent = trips.length;

  const newInPeriod = damagesAllTime.filter((d) => d.type === 'new' && inRange(d.reportedAt, dateFrom, dateTo));
  const resolvedInPeriod = damagesAllTime.filter((d) => d.resolved && d.resolvedAt && inRange(d.resolvedAt, dateFrom, dateTo));
  const openNow = damagesAllTime.filter((d) => !d.resolved);
  const lowFuel = trips.filter((t) => t.fuelEnd === 'vazio' || t.fuelEnd === '1/4');

  document.getElementById('opNewDamages').textContent = newInPeriod.length;
  document.getElementById('opResolvedDamages').textContent = resolvedInPeriod.length;
  document.getElementById('opOpenDamages').textContent = openNow.length;
  document.getElementById('opLowFuel').textContent = lowFuel.length;

  const byVehicle = groupSum(
    openNow,
    (d) => ({ id: d.vehicleId, label: vehicleLabel.get(d.vehicleId) || 'Veículo' }),
    () => 1
  );
  const elDmg = document.getElementById('opDamagesByVehicle');
  elDmg.innerHTML = byVehicle.length === 0
    ? '<div class="empty-state">Nenhuma avaria em aberto. 🎉</div>'
    : byVehicle.map((g) => `
        <div class="card-row" style="margin-top:8px">
          <span class="card-label">${escapeHtml(g.label)}</span>
          <span class="card-value">${g.total}</span>
        </div>
      `).join('');

  const usage = driverUsage(trips);
  const elUsage = document.getElementById('opDriverUsage');
  elUsage.innerHTML = usage.length === 0
    ? '<div class="empty-state">Sem dados no período.</div>'
    : usage.map((d) => `
        <div class="card report-row" style="margin-bottom:8px">
          <strong>${escapeHtml(d.label)}</strong>
          <div class="trip-detail">
            <div>Turnos<strong>${d.trips}</strong></div>
            <div>Horas<strong>${formatHours(d.ms)}</strong></div>
            <div>KM<strong>${d.km.toLocaleString('pt-BR')}</strong></div>
          </div>
        </div>
      `).join('');
}
