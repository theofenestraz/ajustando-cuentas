'use strict';

/* ================= datos ================= */

const KEY = 'ajustando-cuentas-v1';

const PALETTE = ['#D93A2B', '#2F8F4E', '#8E4C9E', '#C8611F', '#0E8784', '#C93C74', '#8A5A3B', '#6E7D1F', '#56657E', '#5C4BB5'];

const STARTER_CATS = [
  ['Comida', 'CO', 0, 'gasto'], ['Transporte', 'TR', 1, 'gasto'], ['Ocio', 'OC', 2, 'gasto'],
  ['Ropa', 'RO', 5, 'gasto'], ['Suscripciones', 'SU', 8, 'gasto'], ['Estudios', 'ES', 3, 'gasto'],
  ['Salud', 'SA', 4, 'gasto'], ['Casa', 'CA', 6, 'gasto'], ['Regalos', 'RE', 7, 'gasto'], ['Otros', 'OT', 9, 'gasto'],
  ['Nómina', 'NO', 1, 'ingreso'], ['Paga', 'PA', 4, 'ingreso'], ['Me han dado', 'MD', 5, 'ingreso'], ['Otros ingresos', 'OI', 8, 'ingreso']
];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function freshState() {
  return {
    v: 1, setup: false, startBalance: 0, savingsStart: 0,
    cats: STARTER_CATS.map(([name, code, c, kind]) => ({ id: uid(), name, code, color: PALETTE[c], kind, budget: 0, archived: false })),
    moves: [], projects: [], recurring: []
  };
}

let state = load();
let undoSnapshot = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.v === 1) return s; }
  } catch (e) { /* almacenamiento no disponible */ }
  return freshState();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('No se ha podido guardar en este dispositivo. Exporta una copia desde Ajustes.'); }
}

/* Guarda una copia para "Deshacer" y aplica el cambio. */
function mutate(fn) {
  undoSnapshot = JSON.stringify(state);
  fn();
  save();
  render();
}

/* ================= formato ================= */

const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const fmt = c => nf.format(c / 100) + ' €';
const fmtRound = c => (c % 100 === 0 ? nf0.format(c / 100) : nf.format(c / 100)) + ' €';
const fmtSigned = c => (c > 0 ? '+' : c < 0 ? '−' : '') + fmt(Math.abs(c));
const bigHtml = c => {
  const [i, d] = nf.format(Math.abs(c) / 100).split(',');
  return `${c < 0 ? '−' : ''}${i}<small>,${d} €</small>`;
};

function parseMoney(str) {
  let s = String(str || '').replace(/[\s€]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}
const moneyValue = c => (c ? nf.format(c / 100).replace(/\./g, '') : '');

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayKey(new Date());
const monthOf = k => k.slice(0, 7);
const thisMonth = () => monthOf(today());
function shiftMonth(m, n) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function monthName(m, withYear = true) {
  const [y, mo] = m.split('-').map(Number);
  const name = new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
  return cap(name) + (withYear ? ' ' + y : '');
}
const monthShort = m => { const [y, mo] = m.split('-').map(Number); return cap(new Date(y, mo - 1, 1).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')); };
function dayLabel(k) {
  if (k === today()) return 'Hoy';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (k === dayKey(y)) return 'Ayer';
  const [yy, mm, dd] = k.split('-').map(Number);
  const d = new Date(yy, mm - 1, dd);
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (yy !== new Date().getFullYear()) opts.year = 'numeric';
  return cap(d.toLocaleDateString('es-ES', opts));
}
function shortDate(k) {
  if (k === today()) return 'Hoy';
  const [yy, mm, dd] = k.split('-').map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
}

/* ================= cálculos ================= */

const cat = id => state.cats.find(c => c.id === id);
const proj = id => state.projects.find(p => p.id === id);
const sum = (arr, f = x => x.amount) => arr.reduce((a, x) => a + f(x), 0);
const movesOf = (kind, pred = () => true) => state.moves.filter(m => m.kind === kind && pred(m));

function dayBalance() {
  return state.startBalance + sum(movesOf('ingreso')) - sum(movesOf('gasto')) - sum(movesOf('ahorrar')) + sum(movesOf('retirar'));
}
function potTotal() {
  return state.savingsStart + sum(movesOf('ahorrar')) - sum(movesOf('retirar')) - sum(movesOf('proyecto'));
}
function projAlloc(p) {
  const on = m => m.project === p.id;
  return sum(movesOf('asignar', on)) - sum(movesOf('desasignar', on)) - sum(movesOf('proyecto', on));
}
const openProjects = () => state.projects.filter(p => !p.closed);
const assigned = () => sum(openProjects(), projAlloc);
const unassigned = () => potTotal() - assigned();

function monthTotals(m) {
  const inM = x => monthOf(x.date) === m;
  return {
    inc: sum(movesOf('ingreso', inM)),
    out: sum(movesOf('gasto', inM)),
    toSave: sum(movesOf('ahorrar', inM)) - sum(movesOf('retirar', inM)),
    fromProjects: sum(movesOf('proyecto', inM))
  };
}
const spentIn = (catId, m) => sum(movesOf('gasto', x => x.cat === catId && monthOf(x.date) === m));

/* Apunta los fijos de cada mes que ya tocan. */
function applyRecurring() {
  const now = today(), cur = thisMonth(), day = Number(now.slice(8));
  let changed = false;
  for (const r of state.recurring) {
    if (!r.active) continue;
    r.applied = r.applied || [];
    for (let m = r.start; m <= cur; m = shiftMonth(m, 1)) {
      if (r.applied.includes(m)) continue;
      if (m === cur && r.day > day) continue;
      state.moves.push({ id: uid(), kind: r.kind, amount: r.amount, cat: r.cat, date: `${m}-${pad(r.day)}`, note: r.note, rec: r.id });
      r.applied.push(m);
      changed = true;
    }
  }
  if (changed) save();
}

/* ================= vistas ================= */

const view = document.getElementById('view');
const tabs = document.querySelector('.tabs');
let monthViewing = thisMonth();
let monthFilter = 'all';

function route() { return (location.hash || '#hoy').slice(1).split('/')[0] || 'hoy'; }

function render() {
  if (!state.setup) { tabs.hidden = true; view.innerHTML = welcomeView(); bindWelcome(); return; }
  tabs.hidden = false;
  const r = route();
  tabs.querySelectorAll('a').forEach(a => a.dataset.tab === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const html = r === 'mes' ? monthView() : r === 'ahorro' ? savingsView() : r === 'ajustes' ? settingsView() : todayView();
  view.innerHTML = html;
  document.title = { hoy: 'Ajustando Cuentas', mes: 'Mes · Ajustando Cuentas', ahorro: 'Ahorro · Ajustando Cuentas', ajustes: 'Ajustes · Ajustando Cuentas' }[r] || 'Ajustando Cuentas';
}

function roundel(c, cls = '') {
  if (!c) return `<span class="roundel ${cls}" style="background:var(--ink-3)" aria-hidden="true">?</span>`;
  return `<span class="roundel ${cls}" style="background:${c.color}" aria-hidden="true">${esc(c.code)}</span>`;
}

/* ---- Hoy ---- */
function todayView() {
  const m = thisMonth(), t = monthTotals(m), bal = dayBalance();
  const budgeted = state.cats.filter(c => c.kind === 'gasto' && !c.archived && c.budget > 0);
  return `
  <header class="top">
    <div class="top-bar"><span class="brand">Ajustando Cuentas</span><span>${monthName(m)}</span></div>
    <p class="label">Disponible para el día a día</p>
    <p class="big${bal < 0 ? ' neg' : ''}">${bigHtml(bal)}</p>
    <div class="stats">
      <div class="in">Ingresos del mes<b>${fmtSigned(t.inc)}</b></div>
      <div class="out">Gastos del mes<b>${t.out ? '−' + fmt(t.out) : fmt(0)}</b></div>
      <a href="#ahorro">Ahorro<b>${fmtRound(potTotal())}</b></a>
    </div>
  </header>

  <section class="sec" aria-labelledby="h-pres">
    <div class="sec-h"><h2 id="h-pres">Presupuestos de ${monthName(m, false).toLowerCase()}</h2>${budgeted.length ? '<a class="link" href="#ajustes">Cambiar</a>' : ''}</div>
    ${budgeted.length ? `<ul class="lines">${budgeted.map(c => budgetLine(c, m)).join('')}</ul>` : `
      <div class="empty"><p>Ponle un límite al mes a las categorías que quieras vigilar y aparecerán aquí como líneas.</p>
      <button class="btn" type="button" data-act="budgets">Poner presupuestos</button></div>`}
  </section>

  <section class="sec" aria-labelledby="h-line">
    <div class="sec-h"><h2 id="h-line">Línea de ahorro</h2></div>
    ${saveLineCard()}
  </section>

  <section class="sec" aria-labelledby="h-last">
    <div class="sec-h"><h2 id="h-last">Últimos movimientos</h2>${state.moves.length ? '<a class="link" href="#mes">Ver el mes</a>' : ''}</div>
    ${state.moves.length ? moveList(sortedMoves().slice(0, 8)) : `
      <div class="empty"><p>Aún no has apuntado nada.</p><p>Toca el botón amarillo, escribe el importe y elige la categoría. Así de rápido.</p></div>`}
  </section>`;
}

function budgetLine(c, m) {
  const spent = spentIn(c.id, m), pct = Math.min(spent / c.budget, 1) * 100, left = c.budget - spent;
  return `<li class="bline">
    ${roundel(c)}
    <div><div class="name"><span>${esc(c.name)}</span><span class="left${left < 0 ? ' over' : ''}">${left < 0 ? 'Te pasas ' + fmtRound(-left) : 'Quedan ' + fmtRound(left)}</span></div>
      <div class="track" role="img" aria-label="${esc(c.name)}: ${fmt(spent)} gastados de ${fmt(c.budget)}">
        <div class="fill" style="width:${pct}%;background:${c.color}"></div>
        <div class="here" style="left:${pct}%;border-color:${c.color}"></div>
        ${left < 0 ? '<div class="over"></div>' : ''}
      </div></div>
    <div class="amt"><b>${fmtRound(spent)}</b>de ${fmtRound(c.budget)}</div>
  </li>`;
}

function stationSize(p, maxT, min = 18, span = 14) { return Math.round(min + span * Math.sqrt((p.target || 1) / (maxT || 1))); }

function saveLineCard() {
  const open = openProjects();
  if (!open.length) {
    return `<div class="empty"><p>Tienes <b>${fmt(unassigned())}</b> ahorrados sin asignar.</p>
      <p>Crea un proyecto (un viaje, un regalo, algo que quieras comprar) y ve apartando dinero para él.</p>
      <button class="btn" type="button" data-act="new-project">Crear proyecto</button></div>`;
  }
  const shown = open.slice(0, 3), maxT = Math.max(...shown.map(p => p.target || 0));
  const n = shown.length;
  const pos = i => (i + 0.5) / n * 100;
  return `<a class="saveline" href="#ahorro" aria-label="Ver el ahorro">
    <div class="head"><span>Sin asignar <b>${fmtRound(unassigned())}</b></span><span>${open.length} ${open.length === 1 ? 'proyecto' : 'proyectos'}${open.length > 3 ? ', ves 3' : ''}</span></div>
    <div class="hmap" aria-hidden="true"><div class="rail"></div>
      <span class="stn start" style="left:0"></span>
      ${shown.map((p, i) => { const s = stationSize(p, maxT); return `<span class="stn${p.target && projAlloc(p) >= p.target ? ' done' : ''}" style="left:${pos(i)}%;width:${s}px;height:${s}px"></span>`; }).join('')}
    </div>
    <div class="hlabels">
      ${shown.map((p, i) => `<span style="left:${pos(i)}%;max-width:calc(${100 / n}% - 6px)"><b>${esc(p.name)}</b>${fmtRound(projAlloc(p))}${p.target ? ' de ' + fmtRound(p.target) : ''}</span>`).join('')}
    </div>
  </a>`;
}

function sortedMoves(list = state.moves) {
  return [...list].sort((a, b) => (b.date + (b.ts || '')).localeCompare(a.date + (a.ts || '')));
}

function moveRow(m) {
  let c = cat(m.cat), title, sub = '', amt, cls = '', badge;
  const p = m.project ? proj(m.project) : null;
  switch (m.kind) {
    case 'gasto': title = m.note || c?.name || 'Gasto'; sub = m.note ? c?.name : ''; amt = '−' + fmt(m.amount); badge = roundel(c); break;
    case 'ingreso': title = m.note || c?.name || 'Ingreso'; sub = m.note ? c?.name : ''; amt = '+' + fmt(m.amount); cls = 'in'; badge = roundel(c); break;
    case 'ahorrar': title = 'Al ahorro'; sub = m.note || 'Desde el día a día'; amt = '−' + fmt(m.amount); cls = 'save'; badge = saveBadge(); break;
    case 'retirar': title = 'Sacado del ahorro'; sub = m.note || 'Al día a día'; amt = '+' + fmt(m.amount); cls = 'save'; badge = saveBadge(); break;
    case 'proyecto': title = m.note || p?.name || 'Pago'; sub = `<span class="tag">Con ahorro</span>${p ? esc(p.name) : ''}`; amt = '−' + fmt(m.amount); cls = 'save'; badge = c ? roundel(c) : saveBadge(); break;
    case 'asignar': title = p?.name || 'Proyecto'; sub = 'Apartado para el proyecto'; amt = fmt(m.amount); cls = 'save'; badge = saveBadge(); break;
    case 'desasignar': title = p?.name || 'Proyecto'; sub = 'Devuelto a sin asignar'; amt = fmt(m.amount); cls = 'save'; badge = saveBadge(); break;
  }
  const subHtml = (m.kind === 'proyecto' ? sub : esc(sub)) + (m.rec ? ' <svg aria-label="fijo mensual"><use href="#i-repeat"/></svg>' : '');
  return `<li><button class="move" type="button" data-move="${m.id}">${badge}
    <span style="min-width:0"><span class="t">${esc(title)}</span>${subHtml ? `<span class="s">${subHtml}</span>` : ''}</span>
    <span class="a ${cls}">${amt}</span></button></li>`;
}
const saveBadge = () => '<span class="roundel" style="background:var(--save)" aria-hidden="true"><svg style="width:18px;height:18px;stroke:#fff"><use href="#i-line"/></svg></span>';

function moveList(list) {
  const groups = [];
  for (const m of list) {
    const g = groups[groups.length - 1];
    if (g && g.date === m.date) g.items.push(m); else groups.push({ date: m.date, items: [m] });
  }
  return groups.map(g => {
    const net = sum(g.items, m => m.kind === 'gasto' ? -m.amount : m.kind === 'ingreso' ? m.amount : 0);
    return `<div class="day"><span>${dayLabel(g.date)}</span><span>${net ? fmtSigned(net) : ''}</span></div>
    <ul class="moves">${g.items.map(moveRow).join('')}</ul>`;
  }).join('');
}

/* ---- Mes ---- */
function monthView() {
  const m = monthViewing, t = monthTotals(m), net = t.inc - t.out, prev = shiftMonth(m, -1);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(m, i - 5));
  const totals = months.map(monthTotals);
  const scale = Math.max(1, ...totals.map(x => Math.max(x.inc, x.out)));
  const gastoCats = state.cats.filter(c => c.kind === 'gasto').map(c => ({ c, v: spentIn(c.id, m), p: spentIn(c.id, prev), n: movesOf('gasto', x => x.cat === c.id && monthOf(x.date) === m).length })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const incCats = state.cats.filter(c => c.kind === 'ingreso').map(c => ({ c, v: sum(movesOf('ingreso', x => x.cat === c.id && monthOf(x.date) === m)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const maxCat = Math.max(1, ...gastoCats.map(x => x.v));
  const inMonth = state.moves.filter(x => monthOf(x.date) === m && ['gasto', 'ingreso', 'proyecto'].includes(x.kind));
  const usedCats = [...new Set(inMonth.map(x => x.cat).filter(Boolean))].map(cat).filter(Boolean);
  if (monthFilter !== 'all' && !usedCats.some(c => c.id === monthFilter)) monthFilter = 'all';
  const filtered = monthFilter === 'all' ? inMonth : inMonth.filter(x => x.cat === monthFilter);
  const isCurrent = m >= thisMonth();

  return `
  <header class="top">
    <div class="month-nav">
      <button class="icon-btn" type="button" data-month="-1" aria-label="Mes anterior"><svg><use href="#i-back"/></svg></button>
      <h1 class="page-title">${monthName(m)}</h1>
      <button class="icon-btn" type="button" data-month="1" aria-label="Mes siguiente" ${isCurrent ? 'disabled' : ''}><svg><use href="#i-next"/></svg></button>
    </div>
    <p class="label">Balance del mes</p>
    <p class="big${net < 0 ? ' neg' : ''}">${net > 0 ? '+' : ''}${bigHtml(net)}</p>
    <div class="stats">
      <div class="in">Ingresos<b>${fmtSigned(t.inc)}</b></div>
      <div class="out">Gastos<b>${t.out ? '−' + fmt(t.out) : fmt(0)}</b></div>
      <div>Al ahorro<b>${fmtSigned(t.toSave)}</b></div>
    </div>
  </header>

  <section class="sec" aria-labelledby="h-six">
    <div class="sec-h"><h2 id="h-six">Últimos seis meses</h2></div>
    <div class="bars">${months.map((mm, i) => `<button type="button" class="bar${mm === m ? ' on' : ''}" data-goto="${mm}" aria-label="${monthName(mm)}: ingresos ${fmt(totals[i].inc)}, gastos ${fmt(totals[i].out)}">
      <span class="cols"><span class="c i" style="height:${totals[i].inc / scale * 100}%"></span><span class="c o" style="height:${totals[i].out / scale * 100}%"></span></span>${monthShort(mm)}</button>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--in)"></i>Ingresos</span><span><i style="background:var(--out)"></i>Gastos</span><span class="muted">Misma escala en todos los meses</span></div>
  </section>

  <section class="sec" aria-labelledby="h-where">
    <div class="sec-h"><h2 id="h-where">En qué se fue</h2></div>
    ${gastoCats.length ? gastoCats.map(x => {
      const d = x.v - x.p;
      const delta = x.p ? `<span class="${d > 0 ? 'delta-up' : 'delta-down'}">${d === 0 ? 'Igual que' : fmtRound(Math.abs(d)) + (d > 0 ? ' más que' : ' menos que')} en ${monthShort(prev).toLowerCase()}.</span>` : '';
      const meta = x.c.budget ? `<span class="${x.v > x.c.budget ? 'delta-up' : ''}">${Math.round(x.v / x.c.budget * 100)} % de ${fmtRound(x.c.budget)}</span>` : `${x.n} ${x.n === 1 ? 'movimiento' : 'movimientos'}`;
      return `<div class="split">${roundel(x.c)}<div>
        <div class="r1"><span class="nm">${esc(x.c.name)}</span><b>${fmt(x.v)}</b></div>
        <div class="track"><div class="fill" style="width:${x.v / maxCat * 100}%;background:${x.c.color}"></div></div>
        <div class="r2">${x.c.budget ? meta : `<span>${meta}</span>`}${delta}</div></div></div>`;
    }).join('') : '<p class="hint">Este mes no hay gastos apuntados.</p>'}
    ${t.fromProjects ? `<p class="hint" style="margin-top:8px">Además, pagaste ${fmt(t.fromProjects)} con dinero de tus proyectos de ahorro. No cuenta en los presupuestos.</p>` : ''}
  </section>

  ${incCats.length ? `<section class="sec" aria-labelledby="h-inc">
    <div class="sec-h"><h2 id="h-inc">De dónde vino</h2></div>
    ${incCats.map(x => `<div class="split">${roundel(x.c)}<div class="r1"><span class="nm">${esc(x.c.name)}</span><b style="color:var(--in)">+${fmt(x.v)}</b></div></div>`).join('')}
  </section>` : ''}

  <section class="sec" aria-labelledby="h-moves">
    <div class="sec-h"><h2 id="h-moves">Movimientos</h2></div>
    ${usedCats.length > 1 ? `<div class="chips" role="group" aria-label="Filtrar por categoría">
      <button type="button" class="chip plain" data-filter="all" aria-pressed="${monthFilter === 'all'}">Todos</button>
      ${usedCats.map(c => `<button type="button" class="chip" data-filter="${c.id}" aria-pressed="${monthFilter === c.id}">${roundel(c)}${esc(c.name)}</button>`).join('')}
    </div>` : ''}
    ${filtered.length ? moveList(sortedMoves(filtered)) : '<p class="hint">Nada apuntado en este mes.</p>'}
  </section>`;
}

/* ---- Ahorro ---- */
function savingsView() {
  const open = openProjects(), closed = state.projects.filter(p => p.closed);
  const maxT = Math.max(0, ...open.map(p => p.target || 0));
  const saveMoves = sortedMoves(state.moves.filter(m => ['ahorrar', 'retirar', 'proyecto'].includes(m.kind))).slice(0, 10);
  return `
  <header class="top">
    <div class="top-bar"><span class="brand">Ajustando Cuentas</span><span>Ahorro</span></div>
    <p class="label">Ahorro total</p>
    <p class="big">${bigHtml(potTotal())}</p>
    <div class="stats"><div>Sin asignar<b>${fmt(unassigned())}</b></div><div>En proyectos<b>${fmt(assigned())}</b></div></div>
    <div class="actions" style="padding:0;margin-top:18px">
      <button class="btn primary grow" type="button" data-act="to-savings"><svg><use href="#i-down"/></svg>Meter dinero</button>
      <button class="btn grow" type="button" data-act="from-savings"><svg><use href="#i-up"/></svg>Sacar dinero</button>
    </div>
  </header>

  <section class="sec" aria-labelledby="h-metro">
    <div class="sec-h"><h2 id="h-metro">Tu línea</h2></div>
    <ol class="metro">
      <li><div class="station"><span class="dot free" style="width:24px;height:24px"></span>
        <span class="info"><span class="nm">Sin asignar</span><span class="sub">${fmt(unassigned())} libres para repartir</span></span></div></li>
      ${open.map(p => {
        const a = projAlloc(p), s = stationSize(p, maxT, 22, 16), done = p.target && a >= p.target;
        return `<li><button class="station" type="button" data-project="${p.id}"><span class="dot${done ? ' done' : ''}" style="width:${s}px;height:${s}px"></span>
          <span class="info"><span class="nm">${esc(p.name)}${p.kind === 'regalo' ? '<svg aria-label="regalo"><use href="#i-gift"/></svg>' : ''}</span>
          <span class="sub">${fmt(a)}${p.target ? ' de ' + fmt(p.target) + (done ? ', meta cumplida' : `, faltan ${fmtRound(p.target - a)}`) : ''}</span>
          ${p.target ? `<span class="track"><span class="fill" style="width:${Math.min(a / p.target, 1) * 100}%"></span></span>` : ''}</span></button></li>`;
      }).join('')}
      <li><button class="station" type="button" data-act="new-project"><span class="dot" style="width:24px;height:24px;display:grid;place-items:center;border-width:4px"><svg style="width:14px;height:14px;stroke:var(--save);stroke-width:3"><use href="#i-plus"/></svg></span>
        <span class="info"><span class="nm">Nuevo proyecto</span><span class="sub">Un viaje, un regalo, algo que quieras comprar</span></span></button></li>
    </ol>
  </section>

  ${closed.length ? `<section class="sec" aria-labelledby="h-closed">
    <div class="sec-h"><h2 id="h-closed">Proyectos cumplidos</h2></div>
    <ul class="group">${closed.map(p => `<li><button class="row" type="button" data-project="${p.id}"><span class="grow"><span class="t">${esc(p.name)}</span><span class="s" style="display:block">Cerrado el ${shortDate(p.closed)}</span></span><span class="v">${fmt(sum(movesOf('proyecto', m => m.project === p.id)))}</span></button></li>`).join('')}</ul>
  </section>` : ''}

  <section class="sec" aria-labelledby="h-smoves">
    <div class="sec-h"><h2 id="h-smoves">Movimientos del ahorro</h2></div>
    ${saveMoves.length ? moveList(saveMoves) : '<p class="hint">Cuando metas o saques dinero del ahorro lo verás aquí.</p>'}
  </section>`;
}

/* ---- Ajustes ---- */
function settingsView() {
  const catRows = kind => state.cats.filter(c => c.kind === kind && !c.archived).map(c => `<li><button class="row" type="button" data-cat="${c.id}">${roundel(c)}<span class="grow"><span class="t">${esc(c.name)}</span>${kind === 'gasto' ? `<span class="s" style="display:block">${c.budget ? 'Presupuesto ' + fmtRound(c.budget) + ' al mes' : 'Sin presupuesto'}</span>` : ''}</span><svg class="go"><use href="#i-next"/></svg></button></li>`).join('');
  return `
  <header class="top"><div class="top-bar"><span class="brand">Ajustando Cuentas</span></div><h1 class="page-title" style="margin-top:14px">Ajustes</h1></header>

  <section class="sec" aria-labelledby="h-start"><div class="sec-h"><h2 id="h-start">Dinero de partida</h2></div>
    <ul class="group">
      <li><button class="row" type="button" data-act="edit-start"><span class="grow"><span class="t">Saldo inicial del día a día</span><span class="s" style="display:block">Lo que tenías al empezar a usar la app</span></span><span class="v">${fmt(state.startBalance)}</span></button></li>
      <li><button class="row" type="button" data-act="edit-savings-start"><span class="grow"><span class="t">Ahorro inicial</span><span class="s" style="display:block">Lo que ya tenías ahorrado</span></span><span class="v">${fmt(state.savingsStart)}</span></button></li>
    </ul></section>

  <section class="sec" aria-labelledby="h-cg"><div class="sec-h"><h2 id="h-cg">Categorías de gasto y presupuestos</h2></div>
    <ul class="group">${catRows('gasto')}<li><button class="row" type="button" data-act="new-cat" data-kind="gasto"><span class="roundel" style="background:var(--rail);color:var(--ink)"><svg style="width:18px;height:18px"><use href="#i-plus"/></svg></span><span class="grow t">Nueva categoría de gasto</span></button></li></ul></section>

  <section class="sec" aria-labelledby="h-ci"><div class="sec-h"><h2 id="h-ci">Categorías de ingreso</h2></div>
    <ul class="group">${catRows('ingreso')}<li><button class="row" type="button" data-act="new-cat" data-kind="ingreso"><span class="roundel" style="background:var(--rail);color:var(--ink)"><svg style="width:18px;height:18px"><use href="#i-plus"/></svg></span><span class="grow t">Nueva categoría de ingreso</span></button></li></ul></section>

  <section class="sec" aria-labelledby="h-rec"><div class="sec-h"><h2 id="h-rec">Fijos de cada mes</h2></div>
    <p class="hint" style="margin-bottom:8px">Alquiler, suscripciones, nómina… Se apuntan solos el día que toca.</p>
    <ul class="group">${state.recurring.map(r => { const c = cat(r.cat); return `<li><button class="row" type="button" data-rec="${r.id}">${roundel(c)}<span class="grow"><span class="t">${esc(r.note || c?.name || 'Fijo')}</span><span class="s" style="display:block">Día ${r.day} de cada mes${r.active ? '' : ', en pausa'}</span></span><span class="v" style="color:${r.kind === 'ingreso' ? 'var(--in)' : 'inherit'}">${r.kind === 'ingreso' ? '+' : '−'}${fmt(r.amount)}</span></button></li>`; }).join('')}
      <li><button class="row" type="button" data-act="new-rec"><span class="roundel" style="background:var(--rail);color:var(--ink)"><svg style="width:18px;height:18px"><use href="#i-repeat"/></svg></span><span class="grow t">Nuevo fijo mensual</span></button></li></ul></section>

  <section class="sec" aria-labelledby="h-bk"><div class="sec-h"><h2 id="h-bk">Copia de seguridad</h2></div>
    <p class="hint" style="margin-bottom:8px">Tus datos se guardan solo en este dispositivo. Exporta una copia de vez en cuando por si cambias de móvil o borras el navegador.</p>
    <div class="actions"><button class="btn dark grow" type="button" data-act="export">Exportar copia</button>
      <label class="btn grow" style="cursor:pointer">Importar copia<input type="file" accept="application/json,.json" class="sr" data-act="import"></label></div>
    <div class="actions" style="margin-top:22px"><button class="btn danger" type="button" data-act="wipe">Borrar todos los datos</button></div>
  </section>`;
}

/* ---- Bienvenida ---- */
function welcomeView() {
  return `<div class="welcome">
    <h1>Ajustando Cuentas</h1>
    <p class="lead">Dos bolsas: el dinero del día a día, donde apuntas gastos e ingresos, y tu ahorro, repartido en proyectos.</p>
    <div class="welcome-map" aria-hidden="true"><div class="rail"></div><div class="rail y"></div>
      <span class="stn" style="left:8px;width:22px;height:22px;border-color:var(--action)"></span>
      <span class="stn" style="left:42%;width:22px;height:22px;border-color:var(--action)"></span>
      <span class="stn" style="left:68%;width:30px;height:30px"></span>
      <span class="stn" style="left:calc(100% - 8px);width:24px;height:24px"></span></div>
    <form id="welcomeForm" novalidate>
      <label class="field"><span>¿Cuánto tienes ahora para el día a día?</span>
        <input class="input money" name="start" inputmode="decimal" autocomplete="off" placeholder="0,00 €"></label>
      <p class="note">Lo que hay en tu cuenta o cartera para gastar.</p>
      <label class="field"><span>¿Cuánto tienes ahorrado?</span>
        <input class="input money" name="saved" inputmode="decimal" autocomplete="off" placeholder="0,00 €"></label>
      <p class="note">Luego lo podrás repartir en proyectos.</p>
      <p class="err" id="welcomeErr" role="alert"></p>
      <button class="btn primary block" type="submit">Empezar</button>
    </form>
    <label class="btn ghost block" style="cursor:pointer">Tengo una copia de seguridad<input type="file" accept="application/json,.json" class="sr" id="welcomeImport"></label>
  </div>`;
}

function bindWelcome() {
  const f = document.getElementById('welcomeForm');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const a = f.start.value.trim() ? parseMoney(f.start.value) : 0, b = f.saved.value.trim() ? parseMoney(f.saved.value) : 0;
    if (isNaN(a) || isNaN(b)) { document.getElementById('welcomeErr').textContent = 'Escribe los importes como números, por ejemplo 250 o 1.240,50.'; return; }
    state.startBalance = a; state.savingsStart = b; state.setup = true;
    save(); location.hash = '#hoy'; render();
  });
  document.getElementById('welcomeImport').addEventListener('change', e => importFile(e.target.files[0]));
}

/* ================= hojas ================= */

const sheetEl = document.getElementById('sheet');
let sheetKeyHandler = null;

function openSheet(title, body, cls = '') {
  sheetEl.className = 'sheet ' + cls;
  sheetEl.innerHTML = `<div class="sheet-h"><h2 id="sheetTitle">${title}</h2><button class="icon-btn" type="button" data-close aria-label="Cerrar"><svg><use href="#i-close"/></svg></button></div><div class="body">${body}</div>`;
  if (!sheetEl.open) sheetEl.showModal();
  sheetEl.scrollTop = 0;
}
function closeSheet() { if (sheetEl.open) sheetEl.close(); }
sheetEl.addEventListener('close', () => { sheetKeyHandler = null; });
sheetEl.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
sheetEl.addEventListener('mousedown', e => {
  if (e.target !== sheetEl) return;
  const r = sheetEl.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet();
});
document.addEventListener('keydown', e => { if (sheetKeyHandler && sheetEl.open) sheetKeyHandler(e); });

const $s = sel => sheetEl.querySelector(sel);

function moneyField(name, label, value = 0, extra = '') {
  return `<label class="field"><span>${label}</span><input class="input money" name="${name}" inputmode="decimal" autocomplete="off" placeholder="0,00 €" value="${moneyValue(value)}" ${extra}></label>`;
}
function readMoney(form, name, { allowZero = false } = {}) {
  const v = form[name].value.trim();
  if (!v) return allowZero ? 0 : NaN;
  const c = parseMoney(v);
  return !allowZero && c === 0 ? NaN : c;
}
function formErr(msg) { const e = $s('.err'); if (e) { e.textContent = msg; } }

/* ---- Apuntar (teclado) ---- */
function openEntry(kind = 'gasto') {
  const st = { kind, s: '', date: today(), note: '', meta: false };
  const draw = () => {
    const cats = state.cats.filter(c => c.kind === st.kind && !c.archived);
    openSheet('Apuntar', `
      <div class="entry-type"><div class="seg" role="group" aria-label="Tipo de movimiento">
        <button type="button" data-kind="gasto" aria-pressed="${st.kind === 'gasto'}">Gasto</button>
        <button type="button" data-kind="ingreso" aria-pressed="${st.kind === 'ingreso'}">Ingreso</button></div></div>
      <p class="amount" id="amt" aria-live="polite"></p>
      <div class="entry-meta">
        <button type="button" class="chip plain" data-meta aria-expanded="${st.meta}">${st.date === today() ? 'Hoy' : shortDate(st.date)}${st.note ? ', ' + esc(st.note) : ', sin nota'}</button>
      </div>
      <div id="metaFields" ${st.meta ? '' : 'hidden'}>
        <label class="field"><span>Fecha</span><input class="input" type="date" id="eDate" value="${st.date}" max="${today()}"></label>
        <label class="field"><span>Nota (opcional)</span><input class="input" id="eNote" maxlength="60" placeholder="${st.kind === 'gasto' ? 'Kebab, bono de metro…' : 'Nómina de octubre…'}" value="${esc(st.note)}"></label>
      </div>
      <p class="pick-h">${st.kind === 'gasto' ? 'Toca la categoría y se guarda' : 'Toca de dónde viene y se guarda'}</p>
      <div class="cats">${cats.map(c => `<button type="button" class="cat" data-pick="${c.id}">${roundel(c)}<span>${esc(c.name)}</span></button>`).join('')}</div>
      <div class="keys" aria-label="Teclado numérico">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'].map(k => `<button type="button" class="key" data-key="${k}">${k}</button>`).join('')}
        <button type="button" class="key" data-key="del" aria-label="Borrar"><svg><use href="#i-del"/></svg></button>
      </div>`, 'entry');
    drawAmount();
  };
  const cents = () => st.s ? parseMoney(st.s) : 0;
  const drawAmount = () => {
    const el = $s('#amt'); if (!el) return;
    if (!st.s) { el.className = 'amount zero'; el.innerHTML = '0<small>,00 €</small>'; return; }
    const [i, d] = st.s.split(',');
    el.className = 'amount';
    el.innerHTML = `${nf0.format(Number(i || 0))}<small>${d !== undefined ? ',' + d : ''} €</small>`;
  };
  const press = k => {
    if (k === 'del') st.s = st.s.slice(0, -1);
    else if (k === ',') { if (!st.s.includes(',')) st.s = (st.s || '0') + ','; }
    else {
      const [i, d] = st.s.split(',');
      if (d !== undefined) { if (d.length < 2) st.s += k; }
      else if (i.length < 7) st.s = (st.s === '0' ? '' : st.s) + k;
    }
    drawAmount();
  };
  const syncMeta = () => { const d = $s('#eDate'), n = $s('#eNote'); if (d) st.date = d.value || today(); if (n) st.note = n.value.trim(); };
  const pick = id => {
    syncMeta();
    const c = cents();
    if (!c) { const el = $s('#amt'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); toast('Escribe primero el importe.'); return; }
    const ct = cat(id);
    mutate(() => state.moves.push({ id: uid(), kind: st.kind, amount: c, cat: id, date: st.date, note: st.note, ts: new Date().toISOString() }));
    closeSheet();
    toast(`${st.kind === 'gasto' ? 'Gasto' : 'Ingreso'} apuntado: ${fmt(c)} en ${ct.name}`, true);
  };
  draw();
  sheetEl.onclick = e => {
    const b = e.target.closest('button'); if (!b || !sheetEl.contains(b)) return;
    if (b.dataset.key) press(b.dataset.key);
    else if (b.dataset.pick) pick(b.dataset.pick);
    else if (b.dataset.kind) { syncMeta(); st.kind = b.dataset.kind; draw(); }
    else if (b.hasAttribute('data-meta')) { syncMeta(); st.meta = !st.meta; draw(); if (st.meta) $s('#eNote').focus(); }
  };
  sheetKeyHandler = e => {
    if (e.target.matches('input')) return;
    if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === ',' || e.key === '.') { press(','); e.preventDefault(); }
    else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
  };
}

/* ---- Editar movimiento ---- */
function openMove(id) {
  const m = state.moves.find(x => x.id === id); if (!m) return;
  sheetEl.onclick = null;
  const hasCat = m.kind === 'gasto' || m.kind === 'ingreso';
  const cats = state.cats.filter(c => c.kind === m.kind && (!c.archived || c.id === m.cat));
  const names = { gasto: 'Gasto', ingreso: 'Ingreso', ahorrar: 'Metido en el ahorro', retirar: 'Sacado del ahorro', proyecto: 'Pagado con ahorro', asignar: 'Apartado para proyecto', desasignar: 'Devuelto a sin asignar' };
  openSheet(names[m.kind], `<form id="mf" novalidate>
    ${moneyField('amount', 'Importe', m.amount)}
    ${hasCat ? `<label class="field"><span>Categoría</span><select class="input" name="cat">${cats.map(c => `<option value="${c.id}" ${c.id === m.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${m.date}"></label>
    <label class="field"><span>Nota</span><input class="input" name="note" maxlength="60" value="${esc(m.note || '')}"></label>
    ${m.rec ? '<p class="hint" style="padding:0;margin-top:12px">Lo apuntó un fijo mensual. Cambiarlo aquí solo afecta a este mes.</p>' : ''}
    ${m.kind === 'proyecto' || m.kind === 'asignar' || m.kind === 'desasignar' ? '<p class="hint" style="padding:0;margin-top:12px">Si lo cambias, se recalcula lo que lleva el proyecto.</p>' : ''}
    <p class="err" role="alert"></p>
    <div class="actions"><button class="btn danger" type="button" id="mDel">Borrar</button><button class="btn dark grow" type="submit">Guardar cambios</button></div>
  </form>`);
  const f = $s('#mf');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const a = readMoney(f, 'amount');
    if (isNaN(a)) return formErr('Escribe un importe mayor que cero.');
    mutate(() => { m.amount = a; m.date = f.date.value || m.date; m.note = f.note.value.trim(); if (hasCat) m.cat = f.cat.value; });
    closeSheet(); toast('Cambios guardados', true);
  });
  $s('#mDel').addEventListener('click', () => {
    mutate(() => { state.moves = state.moves.filter(x => x.id !== m.id); });
    closeSheet(); toast('Movimiento borrado', true);
  });
}

/* ---- Meter / sacar del ahorro ---- */
function openTransfer(dir) {
  sheetEl.onclick = null;
  const toSave = dir === 'in';
  const max = toSave ? null : unassigned();
  openSheet(toSave ? 'Meter en el ahorro' : 'Sacar del ahorro', `<form id="tf" novalidate>
    <p class="hint" style="padding:0">${toSave ? `Pasa dinero del día a día (${fmt(dayBalance())}) a tu ahorro. Quedará sin asignar hasta que lo repartas.` : `Pasa dinero sin asignar (${fmt(max)}) al día a día. Para usar el de un proyecto, ábrelo en tu línea.`}</p>
    ${moneyField('amount', 'Importe', 0, 'autofocus')}
    <label class="field"><span>Nota (opcional)</span><input class="input" name="note" maxlength="60"></label>
    <p class="err" role="alert"></p>
    <div class="actions"><button class="btn primary block" type="submit">${toSave ? 'Meter en el ahorro' : 'Sacar al día a día'}</button></div></form>`);
  const f = $s('#tf');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const a = readMoney(f, 'amount');
    if (isNaN(a)) return formErr('Escribe un importe mayor que cero.');
    if (!toSave && a > max) return formErr(`Solo tienes ${fmt(max)} sin asignar. Quita dinero de algún proyecto primero.`);
    mutate(() => state.moves.push({ id: uid(), kind: toSave ? 'ahorrar' : 'retirar', amount: a, date: today(), note: f.note.value.trim(), ts: new Date().toISOString() }));
    closeSheet(); toast(toSave ? `${fmt(a)} al ahorro` : `${fmt(a)} sacados al día a día`, true);
  });
}

/* ---- Proyectos ---- */
function openProjectForm(id) {
  sheetEl.onclick = null;
  const p = id ? proj(id) : { name: '', kind: 'ahorro', target: 0 };
  let kind = p.kind;
  openSheet(id ? 'Editar proyecto' : 'Nuevo proyecto', `<form id="pf" novalidate>
    <div class="seg" role="group" aria-label="Tipo de proyecto" style="margin-top:4px">
      <button type="button" data-k="ahorro" aria-pressed="${kind === 'ahorro'}">Ahorro</button><button type="button" data-k="regalo" aria-pressed="${kind === 'regalo'}">Regalo</button></div>
    <label class="field"><span>Nombre</span><input class="input" name="name" maxlength="40" required value="${esc(p.name)}" placeholder="Viaje a Roma, regalo de mamá…"></label>
    ${moneyField('target', 'Meta (opcional)', p.target)}
    ${!id && unassigned() > 0 ? moneyField('initial', `Apartar ya (tienes ${fmt(unassigned())} sin asignar)`, 0) : ''}
    <p class="err" role="alert"></p>
    <div class="actions"><button class="btn dark block" type="submit">${id ? 'Guardar cambios' : 'Crear proyecto'}</button></div></form>`);
  const f = $s('#pf');
  f.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; f.querySelectorAll('[data-k]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  f.addEventListener('submit', e => {
    e.preventDefault();
    const name = f.name.value.trim(); if (!name) return formErr('Ponle un nombre al proyecto.');
    const target = readMoney(f, 'target', { allowZero: true }); if (isNaN(target)) return formErr('La meta tiene que ser un número.');
    const initial = f.initial ? readMoney(f, 'initial', { allowZero: true }) : 0;
    if (isNaN(initial)) return formErr('Lo que apartas tiene que ser un número.');
    if (initial > unassigned()) return formErr(`Solo tienes ${fmt(unassigned())} sin asignar.`);
    mutate(() => {
      if (id) Object.assign(p, { name, kind, target });
      else {
        const np = { id: uid(), name, kind, target, created: today(), closed: null };
        state.projects.push(np);
        if (initial) state.moves.push({ id: uid(), kind: 'asignar', amount: initial, project: np.id, date: today(), ts: new Date().toISOString() });
      }
    });
    closeSheet(); toast(id ? 'Proyecto guardado' : `Proyecto «${name}» creado`, true);
  });
}

function openProject(id) {
  const p = proj(id); if (!p) return;
  sheetEl.onclick = null;
  const a = projAlloc(p);
  if (p.closed) {
    const spent = movesOf('proyecto', m => m.project === p.id);
    openSheet(esc(p.name), `<p class="hint" style="padding:0">Cumplido el ${shortDate(p.closed)}. Pagaste ${fmt(sum(spent))} con este proyecto.</p>
      <div class="actions"><button class="btn danger" type="button" id="pDel">Quitar de la lista</button></div>`);
    $s('#pDel').addEventListener('click', () => { mutate(() => { state.projects = state.projects.filter(x => x.id !== p.id); }); closeSheet(); toast('Proyecto quitado. Sus pagos siguen en los movimientos.', true); });
    return;
  }
  const pct = p.target ? Math.min(a / p.target, 1) * 100 : 0;
  openSheet(esc(p.name), `
    <p style="font-weight:700;font-size:40px;letter-spacing:-.03em;line-height:1.1">${bigHtml(a)}</p>
    <p class="muted">${p.target ? `de ${fmt(p.target)}${a >= p.target ? ', meta cumplida' : `, faltan ${fmt(p.target - a)}`}` : 'Sin meta'}</p>
    ${p.target ? `<div class="track" style="margin-top:12px;height:10px"><div class="fill" style="width:${pct}%;background:var(--save)"></div><div class="here" style="left:${pct}%;border-color:var(--save)"></div></div>` : ''}
    <div class="actions" style="margin-top:24px">
      <button class="btn primary grow" type="button" data-pa="add"><svg><use href="#i-down"/></svg>Apartar dinero</button>
      <button class="btn grow" type="button" data-pa="remove" ${a ? '' : 'disabled'}><svg><use href="#i-up"/></svg>Quitar</button></div>
    <div class="actions" style="margin-top:10px">
      <button class="btn dark block" type="button" data-pa="spend"><svg><use href="#i-${p.kind === 'regalo' ? 'gift' : 'target'}"/></svg>${p.kind === 'regalo' ? 'Comprar el regalo' : 'Gastar desde el proyecto'}</button></div>
    <div class="actions" style="margin-top:22px">
      <button class="btn grow" type="button" data-pa="edit">Editar</button>
      <button class="btn danger grow" type="button" data-pa="delete">Borrar</button></div>`);
  sheetEl.onclick = e => {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    const act = b.dataset.pa;
    if (act === 'add' || act === 'remove') openAllocate(p, act);
    else if (act === 'spend') openSpend(p);
    else if (act === 'edit') openProjectForm(p.id);
    else if (act === 'delete') {
      mutate(() => {
        if (a > 0) state.moves.push({ id: uid(), kind: 'desasignar', amount: a, project: p.id, date: today(), ts: new Date().toISOString() });
        state.projects = state.projects.filter(x => x.id !== p.id);
      });
      closeSheet(); toast(a > 0 ? `Proyecto borrado. ${fmt(a)} vuelven a sin asignar.` : 'Proyecto borrado', true);
    }
  };
}

function openAllocate(p, act) {
  sheetEl.onclick = null;
  const a = projAlloc(p), free = unassigned(), add = act === 'add';
  const missing = p.target ? Math.max(0, p.target - a) : 0;
  const suggest = add ? Math.min(missing, Math.max(free, 0)) : a;
  openSheet(add ? `Apartar para ${esc(p.name)}` : `Quitar de ${esc(p.name)}`, `<form id="af" novalidate>
    <p class="hint" style="padding:0">${add ? `Tienes ${fmt(free)} sin asignar.` : `El proyecto lleva ${fmt(a)}. Lo que quites vuelve a sin asignar.`}</p>
    ${moneyField('amount', 'Importe', 0, 'autofocus')}
    ${suggest > 0 ? `<button type="button" class="chip plain" id="fill" style="margin-top:10px">${add ? (missing && missing <= free ? 'Lo que falta: ' : 'Todo lo libre: ') : 'Todo: '}${fmt(suggest)}</button>` : ''}
    <p class="err" role="alert"></p>
    <div class="actions"><button class="btn ${add ? 'primary' : 'dark'} block" type="submit">${add ? 'Apartar' : 'Quitar del proyecto'}</button></div></form>`);
  const f = $s('#af');
  $s('#fill')?.addEventListener('click', () => { f.amount.value = moneyValue(suggest); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const v = readMoney(f, 'amount');
    if (isNaN(v)) return formErr('Escribe un importe mayor que cero.');
    if (add && v > free) return formErr(free > 0 ? `Solo tienes ${fmt(free)} sin asignar. Mete más dinero en el ahorro primero.` : 'No tienes ahorro sin asignar. Mete dinero en el ahorro primero.');
    if (!add && v > a) return formErr(`El proyecto solo lleva ${fmt(a)}.`);
    mutate(() => state.moves.push({ id: uid(), kind: add ? 'asignar' : 'desasignar', amount: v, project: p.id, date: today(), ts: new Date().toISOString() }));
    closeSheet(); toast(add ? `${fmt(v)} apartados para ${p.name}` : `${fmt(v)} vuelven a sin asignar`, true);
  });
}

function openSpend(p) {
  sheetEl.onclick = null;
  const a = projAlloc(p);
  const gcats = state.cats.filter(c => c.kind === 'gasto' && !c.archived);
  const def = p.kind === 'regalo' ? gcats.find(c => c.name === 'Regalos') : null;
  openSheet(p.kind === 'regalo' ? 'Comprar el regalo' : 'Gastar desde el proyecto', `<form id="sf" novalidate>
    <p class="hint" style="padding:0">El proyecto tiene ${fmt(a)}. Si gastas más, el resto sale del día a día; si gastas menos, lo que sobre vuelve a sin asignar al cerrarlo.</p>
    ${moneyField('amount', '¿Cuánto has gastado?', a, 'autofocus')}
    <label class="field"><span>Categoría (opcional)</span><select class="input" name="cat"><option value="">Sin categoría</option>${gcats.map(c => `<option value="${c.id}" ${def && def.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Nota (opcional)</span><input class="input" name="note" maxlength="60" placeholder="${esc(p.name)}"></label>
    <label class="check"><input type="checkbox" name="close" checked> Cerrar el proyecto, ya está cumplido</label>
    <p class="err" role="alert"></p>
    <div class="actions"><button class="btn dark block" type="submit">Apuntar el pago</button></div></form>`);
  const f = $s('#sf');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const v = readMoney(f, 'amount');
    if (isNaN(v)) return formErr('Escribe un importe mayor que cero.');
    const fromProj = Math.min(v, a), extra = v - fromProj, note = f.note.value.trim() || p.name, catId = f.cat.value || null, close = f.close.checked;
    mutate(() => {
      const ts = new Date().toISOString();
      if (fromProj) state.moves.push({ id: uid(), kind: 'proyecto', amount: fromProj, project: p.id, cat: catId, date: today(), note, ts });
      if (extra) state.moves.push({ id: uid(), kind: 'gasto', amount: extra, cat: catId || (gcats.find(c => c.name === 'Otros') || gcats[0]).id, date: today(), note: `Resto de ${p.name}`, ts });
      if (close) {
        const left = a - fromProj;
        if (left > 0) state.moves.push({ id: uid(), kind: 'desasignar', amount: left, project: p.id, date: today(), ts });
        p.closed = today();
      }
    });
    closeSheet();
    toast(extra ? `Pagado: ${fmt(fromProj)} del proyecto y ${fmt(extra)} del día a día` : `Pagado ${fmt(v)} con ${p.name}`, true);
  });
}

/* ---- Categorías ---- */
function autoCode(name) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}
function openCat(id, kind) {
  sheetEl.onclick = null;
  const c = id ? cat(id) : { name: '', code: '', color: PALETTE[state.cats.filter(x => x.kind === kind).length % PALETTE.length], kind, budget: 0 };
  let color = c.color, codeTouched = !!id;
  const used = id ? state.moves.some(m => m.cat === id) : false;
  openSheet(id ? 'Editar categoría' : (kind === 'ingreso' ? 'Nueva categoría de ingreso' : 'Nueva categoría de gasto'), `<form id="cf" novalidate>
    <div style="display:flex;align-items:center;gap:14px;margin-top:4px"><span id="cPrev"></span><span class="muted" style="font-size:14px">Así se verá su línea</span></div>
    <label class="field"><span>Nombre</span><input class="input" name="name" maxlength="24" value="${esc(c.name)}" required></label>
    <label class="field"><span>Siglas (2 letras)</span><input class="input" name="code" maxlength="2" value="${esc(c.code)}" style="text-transform:uppercase;width:90px"></label>
    <div class="field"><span>Color de línea</span><div class="swatches" role="group" aria-label="Color">${PALETTE.map(p => `<button type="button" class="swatch" style="background:${p}" data-color="${p}" aria-pressed="${p === color}" aria-label="Color ${p}"></button>`).join('')}</div></div>
    ${c.kind === 'gasto' ? moneyField('budget', 'Presupuesto al mes (opcional)', c.budget) : ''}
    <p class="err" role="alert"></p>
    <div class="actions">${id ? '<button class="btn danger" type="button" id="cDel">Borrar</button>' : ''}<button class="btn dark grow" type="submit">${id ? 'Guardar' : 'Crear categoría'}</button></div>
    ${id && used ? '<p class="hint" style="padding:0;margin-top:10px">Si la borras, sus movimientos se conservan pero ya no podrás elegirla.</p>' : ''}
  </form>`);
  const f = $s('#cf');
  const prev = () => { $s('#cPrev').innerHTML = roundel({ color, code: f.code.value || autoCode(f.name.value) || '··' }, 'lg'); };
  f.name.addEventListener('input', () => { if (!codeTouched) f.code.value = autoCode(f.name.value); prev(); });
  f.code.addEventListener('input', () => { codeTouched = true; prev(); });
  f.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { color = b.dataset.color; f.querySelectorAll('[data-color]').forEach(x => x.setAttribute('aria-pressed', x === b)); prev(); }));
  prev();
  f.addEventListener('submit', e => {
    e.preventDefault();
    const name = f.name.value.trim(); if (!name) return formErr('Ponle un nombre.');
    const budget = f.budget ? readMoney(f, 'budget', { allowZero: true }) : 0;
    if (isNaN(budget)) return formErr('El presupuesto tiene que ser un número.');
    const code = (f.code.value.trim() || autoCode(name)).toUpperCase().slice(0, 2);
    mutate(() => { if (id) Object.assign(c, { name, code, color, budget }); else state.cats.push({ id: uid(), name, code, color, kind, budget, archived: false }); });
    closeSheet(); toast(id ? 'Categoría guardada' : `Categoría «${name}» creada`, true);
  });
  $s('#cDel')?.addEventListener('click', () => {
    mutate(() => { if (used) c.archived = true; else state.cats = state.cats.filter(x => x.id !== id); state.recurring.forEach(r => { if (r.cat === id) r.active = false; }); });
    closeSheet(); toast('Categoría borrada', true);
  });
}

/* ---- Fijos ---- */
function openRec(id) {
  sheetEl.onclick = null;
  const r = id ? state.recurring.find(x => x.id === id) : { kind: 'gasto', amount: 0, cat: null, note: '', day: Math.min(new Date().getDate(), 28), active: true };
  let kind = r.kind;
  const catOpts = k => state.cats.filter(c => c.kind === k && (!c.archived || c.id === r.cat)).map(c => `<option value="${c.id}" ${c.id === r.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  openSheet(id ? 'Editar fijo mensual' : 'Nuevo fijo mensual', `<form id="rf" novalidate>
    <div class="seg" role="group" aria-label="Tipo" style="margin-top:4px"><button type="button" data-k="gasto" aria-pressed="${kind === 'gasto'}">Gasto</button><button type="button" data-k="ingreso" aria-pressed="${kind === 'ingreso'}">Ingreso</button></div>
    <label class="field"><span>Nombre</span><input class="input" name="note" maxlength="40" value="${esc(r.note)}" placeholder="Spotify, alquiler, nómina…"></label>
    ${moneyField('amount', 'Importe', r.amount)}
    <label class="field"><span>Categoría</span><select class="input" name="cat">${catOpts(kind)}</select></label>
    <label class="field"><span>Día del mes (1 a 28)</span><input class="input" name="day" type="number" min="1" max="28" inputmode="numeric" value="${r.day}" style="width:110px"></label>
    ${id ? `<label class="check"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Activo</label>` : `<label class="check"><input type="checkbox" name="now" checked> Apuntar también el de este mes si ya ha pasado el día</label>`}
    <p class="err" role="alert"></p>
    <div class="actions">${id ? '<button class="btn danger" type="button" id="rDel">Borrar</button>' : ''}<button class="btn dark grow" type="submit">${id ? 'Guardar' : 'Crear fijo'}</button></div>
    ${id ? '<p class="hint" style="padding:0;margin-top:10px">Lo que ya se apuntó en meses anteriores se queda como está.</p>' : ''}
  </form>`);
  const f = $s('#rf');
  f.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; f.querySelectorAll('[data-k]').forEach(x => x.setAttribute('aria-pressed', x === b)); f.cat.innerHTML = catOpts(kind); }));
  f.addEventListener('submit', e => {
    e.preventDefault();
    const amount = readMoney(f, 'amount'); if (isNaN(amount)) return formErr('Escribe un importe mayor que cero.');
    const day = Math.round(Number(f.day.value)); if (!(day >= 1 && day <= 28)) return formErr('El día tiene que estar entre 1 y 28.');
    if (!f.cat.value) return formErr('Elige una categoría.');
    mutate(() => {
      if (id) Object.assign(r, { kind, amount, cat: f.cat.value, note: f.note.value.trim(), day, active: f.active.checked });
      else state.recurring.push({ id: uid(), kind, amount, cat: f.cat.value, note: f.note.value.trim(), day, active: true, start: f.now.checked ? thisMonth() : shiftMonth(thisMonth(), 1), applied: [] });
      applyRecurring();
    });
    closeSheet(); toast(id ? 'Fijo guardado' : 'Fijo mensual creado', true);
  });
  $s('#rDel')?.addEventListener('click', () => { mutate(() => { state.recurring = state.recurring.filter(x => x.id !== id); }); closeSheet(); toast('Fijo borrado', true); });
}

/* ---- Saldos de partida ---- */
function openStart(field) {
  sheetEl.onclick = null;
  const isDay = field === 'startBalance';
  openSheet(isDay ? 'Saldo inicial del día a día' : 'Ahorro inicial', `<form id="stf" novalidate>
    <p class="hint" style="padding:0">${isDay ? 'Cámbialo si al empezar te equivocaste. El saldo actual se recalcula con todos tus movimientos.' : 'Lo que tenías ahorrado al empezar. Los proyectos no cambian.'}</p>
    ${moneyField('amount', 'Importe', state[field])}
    <p class="err" role="alert"></p>
    <div class="actions"><button class="btn dark block" type="submit">Guardar</button></div></form>`);
  const f = $s('#stf');
  f.addEventListener('submit', e => {
    e.preventDefault();
    const v = readMoney(f, 'amount', { allowZero: true }); if (isNaN(v)) return formErr('Escribe un número, por ejemplo 250 o 1.240,50.');
    mutate(() => { state[field] = v; });
    closeSheet(); toast('Guardado', true);
  });
}

/* ---- Copias ---- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ajustando-cuentas-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Copia exportada');
}
function importFile(file) {
  if (!file) return;
  file.text().then(txt => {
    const s = JSON.parse(txt);
    if (!s || s.v !== 1 || !Array.isArray(s.moves) || !Array.isArray(s.cats)) throw new Error('formato');
    s.projects = s.projects || []; s.recurring = s.recurring || []; s.setup = true;
    mutate(() => { state = s; });
    location.hash = '#hoy';
    toast(`Copia importada: ${s.moves.length} movimientos`, true);
  }).catch(() => toast('Ese archivo no es una copia de Ajustando Cuentas.'));
}
function openWipe() {
  sheetEl.onclick = null;
  openSheet('Borrar todos los datos', `<p class="hint" style="padding:0">Se borran movimientos, proyectos, categorías y fijos de este dispositivo. Si no tienes una copia exportada, no se pueden recuperar.</p>
    <div class="actions"><button class="btn grow" type="button" data-close>Cancelar</button><button class="btn danger grow" type="button" id="wipeOk">Borrar todo</button></div>`);
  $s('#wipeOk').addEventListener('click', () => { state = freshState(); save(); closeSheet(); location.hash = ''; render(); });
}

/* ================= toast ================= */
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg, withUndo = false) {
  toastEl.innerHTML = `<span>${esc(msg)}</span>${withUndo && undoSnapshot ? '<button type="button">Deshacer</button>' : ''}`;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), withUndo ? 5000 : 3000);
  const b = toastEl.querySelector('button');
  if (b) b.onclick = () => { state = JSON.parse(undoSnapshot); undoSnapshot = null; save(); render(); toastEl.classList.remove('on'); };
}

/* ================= eventos ================= */
document.getElementById('addBtn').addEventListener('click', () => openEntry());

view.addEventListener('click', e => {
  const t = e.target.closest('[data-move],[data-project],[data-cat],[data-rec],[data-act],[data-month],[data-goto],[data-filter]');
  if (!t || t.matches('input')) return;
  const d = t.dataset;
  if (d.move) openMove(d.move);
  else if (d.project) openProject(d.project);
  else if (d.cat) openCat(d.cat);
  else if (d.rec) openRec(d.rec);
  else if (d.month) { monthViewing = shiftMonth(monthViewing, Number(d.month)); render(); }
  else if (d.goto) { monthViewing = d.goto; render(); }
  else if (d.filter) { monthFilter = d.filter; render(); }
  else switch (d.act) {
    case 'budgets': location.hash = '#ajustes'; break;
    case 'new-project': openProjectForm(); break;
    case 'to-savings': openTransfer('in'); break;
    case 'from-savings': openTransfer('out'); break;
    case 'edit-start': openStart('startBalance'); break;
    case 'edit-savings-start': openStart('savingsStart'); break;
    case 'new-cat': openCat(null, d.kind); break;
    case 'new-rec': openRec(); break;
    case 'export': exportData(); break;
    case 'wipe': openWipe(); break;
  }
});
view.addEventListener('change', e => { if (e.target.matches('[data-act="import"]')) importFile(e.target.files[0]); });

window.addEventListener('hashchange', () => { if (route() === 'mes' && !location.hash.includes('keep')) monthViewing = thisMonth(); render(); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.setup) { applyRecurring(); render(); } });

applyRecurring();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
