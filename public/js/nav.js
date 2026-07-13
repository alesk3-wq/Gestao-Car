// Bottom-nav compartilhada — injeta no <nav id="bottomNav"> de cada página.
// Item ativo definido por data-active no elemento.

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  vehicle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
  stops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  expenses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  summary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
};

const ITEMS = [
  { key: 'home',     label: 'Início',   href: '/pages/home.html' },
  { key: 'vehicle',  label: 'Veículo',  href: '/pages/vehicle.html' },
  { key: 'stops',    label: 'Paradas',  href: '/pages/stops.html' },
  { key: 'expenses', label: 'Despesas', href: '/pages/expenses.html' },
  { key: 'summary',  label: 'Resumo',   href: '/pages/summary.html' }
];

export function renderBottomNav() {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const active = nav.dataset.active || 'home';
  nav.classList.add('bottom-nav');
  nav.innerHTML = ITEMS.map((item) => `
    <a href="${item.href}" class="${item.key === active ? 'active' : ''}">
      ${ICONS[item.key]}
      <span>${item.label}</span>
    </a>
  `).join('');
}
