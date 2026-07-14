import { requireAuth } from '/js/auth.js';
import { getOpenTrip, updateTrip } from '/js/db.js';
import { uploadPhoto } from '/js/storage.js';
import { renderBottomNav } from '/js/nav.js';
import {
  EXPENSE_TYPES, EXPENSE_TYPE_ICONS, uuid, escapeHtml, formatCurrency, parseCurrency,
  showToast, registerServiceWorker, openLightbox
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
  document.getElementById('fabAddExpense').style.display = 'flex';
  init();
}

let editingId = null;
let receiptFile = null;

function init() {
  document.getElementById('expenseType').innerHTML = EXPENSE_TYPES
    .map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`)
    .join('');

  document.getElementById('fabAddExpense').addEventListener('click', () => openSheet(null));
  document.getElementById('expenseBackdrop').addEventListener('click', closeSheet);
  document.getElementById('btnCancelExpense').addEventListener('click', closeSheet);
  document.getElementById('btnSaveExpense').addEventListener('click', saveExpense);
  document.getElementById('btnDeleteExpense').addEventListener('click', deleteExpense);

  const photoInput = document.getElementById('receiptPhoto');
  document.getElementById('btnAddReceiptPhoto').addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    receiptFile = photoInput.files[0] || null;
    document.getElementById('receiptPreview').innerHTML = receiptFile
      ? `<img src="${URL.createObjectURL(receiptFile)}" alt="Recibo">`
      : '';
  });

  renderList();
}

function total() {
  return (trip.expenses || []).reduce((sum, e) => sum + (e.value || 0), 0);
}

function renderList() {
  document.getElementById('totalValue').textContent = formatCurrency(total());

  const list = document.getElementById('expensesList');
  const expenses = trip.expenses || [];

  if (expenses.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma despesa registrada.<br>Toque no + para adicionar.</p>
      </div>`;
    return;
  }

  list.innerHTML = expenses.map((e) => `
    <div class="card expense-card" data-id="${e.id}">
      <div class="expense-icon">${EXPENSE_TYPE_ICONS[e.type] || '📌'}</div>
      <div class="expense-info">
        <div class="card-row">
          <strong>${e.type[0].toUpperCase() + e.type.slice(1)}</strong>
        </div>
        <p class="expense-desc">${escapeHtml(e.description || '')}${e.receiptNumber ? ` · Recibo ${escapeHtml(e.receiptNumber)}` : ''}</p>
      </div>
      ${e.receiptPhotoUrl ? `<img class="receipt-thumb" src="${escapeHtml(e.receiptPhotoUrl)}" alt="Recibo">` : ''}
      <span class="expense-value">${formatCurrency(e.value)}</span>
      <button class="icon-btn" aria-label="Editar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.expense-card').forEach((card) => {
    card.querySelector('.icon-btn').addEventListener('click', () => openSheet(card.dataset.id));
    const thumb = card.querySelector('.receipt-thumb');
    if (thumb) thumb.addEventListener('click', () => openLightbox(thumb.src));
  });
}

function openSheet(expenseId) {
  editingId = expenseId;
  receiptFile = null;
  const expense = expenseId ? (trip.expenses || []).find((e) => e.id === expenseId) : null;

  document.getElementById('expenseSheetTitle').textContent = expense ? 'Editar despesa' : 'Nova despesa';
  document.getElementById('btnDeleteExpense').style.display = expense ? 'flex' : 'none';
  document.getElementById('expenseType').value = expense?.type || EXPENSE_TYPES[0];
  document.getElementById('expenseValue').value = expense
    ? expense.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '';
  document.getElementById('expenseReceipt').value = expense?.receiptNumber || '';
  document.getElementById('expenseDesc').value = expense?.description || '';
  document.getElementById('receiptPreview').innerHTML = expense?.receiptPhotoUrl
    ? `<img src="${escapeHtml(expense.receiptPhotoUrl)}" alt="Recibo">`
    : '';

  document.getElementById('expenseBackdrop').classList.add('open');
  document.getElementById('expenseSheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('expenseBackdrop').classList.remove('open');
  document.getElementById('expenseSheet').classList.remove('open');
}

async function saveExpense() {
  const value = parseCurrency(document.getElementById('expenseValue').value);
  if (value <= 0) {
    showToast('Informe um valor válido.', 'error');
    return;
  }

  const btn = document.getElementById('btnSaveExpense');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let receiptPhotoUrl = editingId
      ? ((trip.expenses || []).find((e) => e.id === editingId)?.receiptPhotoUrl ?? null)
      : null;
    if (receiptFile) {
      receiptPhotoUrl = await uploadPhoto(receiptFile, trip.vehicleId, trip.id);
    }

    const data = {
      type: document.getElementById('expenseType').value,
      value,
      receiptNumber: document.getElementById('expenseReceipt').value.trim(),
      description: document.getElementById('expenseDesc').value.trim(),
      receiptPhotoUrl
    };

    const expenses = [...(trip.expenses || [])];
    if (editingId) {
      const idx = expenses.findIndex((e) => e.id === editingId);
      expenses[idx] = { ...expenses[idx], ...data };
    } else {
      expenses.push({ id: uuid(), ...data });
    }

    const totalExpenses = expenses.reduce((sum, e) => sum + (e.value || 0), 0);
    await updateTrip(trip.id, { expenses, totalExpenses });
    trip.expenses = expenses;
    trip.totalExpenses = totalExpenses;

    showToast('Despesa salva.', 'success');
    closeSheet();
    renderList();
  } catch (error) {
    console.error(error);
    showToast('Erro ao salvar. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar despesa';
  }
}

async function deleteExpense() {
  if (!editingId) return;
  const expenses = (trip.expenses || []).filter((e) => e.id !== editingId);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.value || 0), 0);
  try {
    await updateTrip(trip.id, { expenses, totalExpenses });
    trip.expenses = expenses;
    trip.totalExpenses = totalExpenses;
    showToast('Despesa removida.');
    closeSheet();
    renderList();
  } catch {
    showToast('Erro ao remover. Tente novamente.', 'error');
  }
}
