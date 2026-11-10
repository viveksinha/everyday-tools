import { initPage, initTabs, esc, inr } from '../assets/site.js';

initPage();
const tabs = initTabs();

/* ---------- Defaults (generic, round numbers) ---------- */
const DEFAULTS = { m: 'eq', sub: 2400, n: 4, gst: 5, sc: 0, tip: 0, r: 0 };
const DEFAULT_PEOPLE = ['Person 1', 'Person 2', 'Person 3'];
const DEFAULT_ITEMS = [
  { name: 'Starter to share', price: 360, who: [0, 1, 2] },
  { name: 'Main course', price: 420, who: [0] },
  { name: 'Main course', price: 380, who: [1] },
  { name: 'Main course', price: 450, who: [2] },
  { name: 'Drinks', price: 240, who: [0, 2] },
];

/* ---------- Pure arithmetic (exported for checks) ---------- */
export function splitBill({ foods, gst, sc, tip, round }) {
  return foods.map((food) => {
    const service = food * sc / 100;
    const tax = (food + service) * gst / 100;
    const t = food * tip / 100;
    const exact = food + service + tax + t;
    const pays = round > 0 ? Math.ceil(exact / round - 1e-9) * round : exact;
    return { food, service, tax, tip: t, exact, pays };
  });
}

// Shares of the food subtotal by item; an item with nobody ticked is split across everyone.
export function itemShares(items, nPeople) {
  const shares = Array(nPeople).fill(0);
  for (const it of items) {
    const who = it.who.filter((i) => i < nPeople);
    const list = who.length ? who : [...Array(nPeople).keys()];
    for (const i of list) shares[i] += it.price / list.length;
  }
  return shares;
}

/* ---------- URL state ---------- */
const clean = (s) => String(s).replace(/[|~]/g, ' ').slice(0, 40);
const numOr = (v, d, min = 0, max = Infinity) => {
  const x = Number(v);
  return v != null && v !== '' && Number.isFinite(x) && x >= min && x <= max ? x : d;
};
const params = new URLSearchParams(location.search);
const state = {
  m: params.get('m') === 'it' ? 'it' : 'eq',
  sub: numOr(params.get('sub'), DEFAULTS.sub, 0),
  n: Math.round(numOr(params.get('n'), DEFAULTS.n, 1, 50)),
  gst: numOr(params.get('gst'), DEFAULTS.gst, 0, 40),
  sc: numOr(params.get('sc'), DEFAULTS.sc, 0, 30),
  tip: numOr(params.get('tip'), DEFAULTS.tip, 0, 50),
  r: [0, 1, 10, 50, 100].includes(Number(params.get('r'))) ? Number(params.get('r')) : DEFAULTS.r,
  people: params.get('p') ? params.get('p').split('|').map(clean).slice(0, 30) : [...DEFAULT_PEOPLE],
  items: params.get('i')
    ? params.get('i').split('|').map((s) => {
      const [name, price, who] = s.split('~');
      return { name: clean(name || 'Item'), price: numOr(price, 0, 0), who: (who || '').split('.').filter((x) => x !== '').map(Number).filter(Number.isInteger) };
    }).slice(0, 60)
    : DEFAULT_ITEMS.map((x) => ({ ...x, who: [...x.who] })),
};
if (!state.people.length) state.people = ['Person 1'];

function syncUrl() {
  const p = new URLSearchParams({ m: state.m });
  if (state.m === 'eq') { p.set('sub', String(state.sub)); p.set('n', String(state.n)); }
  p.set('gst', String(state.gst)); p.set('sc', String(state.sc)); p.set('tip', String(state.tip)); p.set('r', String(state.r));
  if (state.m === 'it') {
    p.set('p', state.people.join('|'));
    p.set('i', state.items.map((it) => `${it.name}~${it.price}~${it.who.join('.')}`).join('|'));
  }
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
}

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const rs = (n) => inr(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);
const parseAmt = (s) => {
  const v = Number(String(s).replace(/[^\d.]/g, ''));
  return Number.isFinite(v) ? v : null;
};
function inWords(n) {
  if (!(n >= 1000)) return '';
  if (n >= 1e7) return `${+(n / 1e7).toFixed(2)} crore`;
  if (n >= 1e5) return `${+(n / 1e5).toFixed(2)} lakh`;
  return `${+(n / 1e3).toFixed(1)} thousand`;
}
const tile = (lab, value, sub) =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub">${esc(sub)}</div></div>`;

/* ---------- Itemised editors ---------- */
function renderPeople() {
  $('people-rows').innerHTML = state.people.map((name, i) => `
    <div class="sb-person">
      <input class="input-num" type="text" data-person="${i}" value="${esc(name)}" aria-label="Name of person ${i + 1}" maxlength="40" style="text-align:left">
      <button class="btn sb-x" type="button" data-del-person="${i}" aria-label="Remove ${esc(name)}" ${state.people.length <= 1 ? 'disabled' : ''}>×</button>
    </div>`).join('');
}
function renderItems() {
  $('item-rows').innerHTML = state.items.map((it, j) => `
    <div class="sb-item">
      <input class="input-num" type="text" data-item-name="${j}" value="${esc(it.name)}" aria-label="Item ${j + 1} name" maxlength="40" style="text-align:left">
      <input class="input-num" type="text" inputmode="decimal" data-item-price="${j}" value="${it.price}" aria-label="Item ${j + 1} price in rupees">
      <button class="btn sb-x" type="button" data-del-item="${j}" aria-label="Remove item ${j + 1}">×</button>
      <div class="who">${state.people.map((p, i) => `<label class="sb-who"><input type="checkbox" data-who="${j}:${i}" ${it.who.includes(i) ? 'checked' : ''}>${esc(p)}</label>`).join('')}</div>
    </div>`).join('') || '<div class="muted small">No items yet.</div>';
}

/* ---------- Render ---------- */
function compute() {
  let names, foods;
  if (state.m === 'eq') {
    names = Array.from({ length: state.n }, (_, i) => `Person ${i + 1}`);
    foods = names.map(() => state.sub / state.n);
  } else {
    names = state.people;
    foods = itemShares(state.items, names.length);
  }
  const rows = splitBill({ foods, gst: state.gst, sc: state.sc, tip: state.tip, round: state.r });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return { names, rows, tot: { food: sum('food'), service: sum('service'), tax: sum('tax'), tip: sum('tip'), exact: sum('exact'), pays: sum('pays') } };
}

function render() {
  const { names, rows, tot } = compute();
  $('itemised').hidden = state.m !== 'it';
  $('sub-field').hidden = state.m !== 'eq';
  $('people-field').hidden = state.m !== 'eq';
  document.querySelectorAll('#mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.m)));
  $('sub-words').textContent = inWords(state.sub);

  const bill = tot.food + tot.service + tot.tax;
  const surplus = tot.pays - tot.exact;
  if (state.m === 'eq') {
    $('answer').innerHTML = `${state.n === 1 ? 'One person pays' : `Each of <b>${state.n}</b> people pays`} <mark>${esc(rs(rows[0]?.pays ?? 0))}</mark>.`;
  } else {
    const hi = rows.reduce((b, r, i) => (r.pays > rows[b].pays ? i : b), 0);
    $('answer').innerHTML = `Shares run from <mark>${esc(rs(Math.min(...rows.map((r) => r.pays))))}</mark> to <mark>${esc(rs(rows[hi].pays))}</mark>; the full table is below.`;
  }
  $('tiles').innerHTML = [
    tile('Restaurant bill', esc(rs(bill)), `Food ${rs(tot.food)} + GST ${rs(tot.tax)}${tot.service ? ` + service ${rs(tot.service)}` : ''}`),
    tile('Tip', esc(rs(tot.tip)), state.tip ? `${state.tip}% of the food subtotal` : 'No tip added'),
    tile('Everyone pays in total', esc(rs(tot.pays)), state.r ? `Shares rounded up to the next ₹${state.r}` : 'Exact shares, no rounding'),
    tile('Rounding surplus', esc(rs(surplus)), surplus > 0.004 ? 'Extra collected by rounding up' : 'Nothing extra'),
  ].join('');

  $('pp-table').querySelector('tbody').innerHTML = rows.map((r, i) => `<tr>
    <th class="sticky">${esc(names[i])}</th>
    <td class="n">${rs(r.food)}</td><td class="n">${rs(r.service)}</td><td class="n">${rs(r.tax)}</td><td class="n">${rs(r.tip)}</td>
    <td class="n">${inr(r.exact, 2)}</td><td class="n"><b>${rs(r.pays)}</b></td></tr>`).join('');
  $('pp-table').querySelector('tfoot').innerHTML = `<tr><th class="sticky">Total</th>
    <td class="n">${rs(tot.food)}</td><td class="n">${rs(tot.service)}</td><td class="n">${rs(tot.tax)}</td><td class="n">${rs(tot.tip)}</td>
    <td class="n">${inr(tot.exact, 2)}</td><td class="n">${rs(tot.pays)}</td></tr>`;
  $('pp-hint').textContent = `${names.length} ${names.length === 1 ? 'person' : 'people'} · GST ${state.gst}% · service ${state.sc}% · tip ${state.tip}%`;

  const lines = [
    'Bill split',
    `Food ${rs(tot.food)} | GST ${state.gst}% ${rs(tot.tax)}${state.sc ? ` | Service ${state.sc}% ${rs(tot.service)}` : ''}${state.tip ? ` | Tip ${state.tip}% ${rs(tot.tip)}` : ''}`,
    `Total ${rs(tot.exact)}${state.r ? ` (collected ${rs(tot.pays)} after rounding up to ₹${state.r})` : ''}`,
    '',
    ...rows.map((r, i) => `${names[i]}: ${rs(r.pays)}`),
  ];
  $('summary-text').value = lines.join('\n');
  syncUrl();
}

/* ---------- Wiring ---------- */
$('sub').value = state.sub.toLocaleString('en-IN');
$('n').value = state.n;
$('gst').value = state.gst;
$('sc').value = state.sc;
$('tip').value = state.tip;
$('round').value = String(state.r);

$('sub').addEventListener('input', (e) => { const v = parseAmt(e.target.value); if (v == null) return; state.sub = v; render(); });
$('sub').addEventListener('blur', (e) => { e.target.value = state.sub.toLocaleString('en-IN'); });
$('n').addEventListener('input', (e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 50) { state.n = v; render(); } });
for (const k of ['gst', 'sc', 'tip']) {
  $(k).addEventListener('input', (e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v) && v >= 0) { state[k] = v; render(); } });
}
$('round').addEventListener('change', (e) => { state.r = Number(e.target.value); render(); });
$('mode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  state.m = b.dataset.mode;
  if (state.m === 'it') { renderPeople(); renderItems(); }
  render();
});

$('people-rows').addEventListener('input', (e) => {
  const i = e.target.dataset.person;
  if (i == null) return;
  state.people[i] = clean(e.target.value) || `Person ${Number(i) + 1}`;
  renderItems();
  render();
});
$('people-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del-person]');
  if (!b || state.people.length <= 1) return;
  const k = Number(b.dataset.delPerson);
  state.people.splice(k, 1);
  state.items.forEach((it) => { it.who = it.who.filter((i) => i !== k).map((i) => (i > k ? i - 1 : i)); });
  renderPeople(); renderItems(); render();
});
$('add-person').addEventListener('click', () => {
  if (state.people.length >= 30) return;
  state.people.push(`Person ${state.people.length + 1}`);
  renderPeople(); renderItems(); render();
});
$('item-rows').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.itemName != null) state.items[t.dataset.itemName].name = clean(t.value);
  else if (t.dataset.itemPrice != null) { const v = parseAmt(t.value); if (v == null) return; state.items[t.dataset.itemPrice].price = v; }
  else return;
  render();
});
$('item-rows').addEventListener('change', (e) => {
  const w = e.target.dataset.who;
  if (!w) return;
  const [j, i] = w.split(':').map(Number);
  const it = state.items[j];
  it.who = e.target.checked ? [...new Set([...it.who, i])].sort((a, b) => a - b) : it.who.filter((x) => x !== i);
  render();
});
$('item-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del-item]');
  if (!b) return;
  state.items.splice(Number(b.dataset.delItem), 1);
  renderItems(); render();
});
$('add-item').addEventListener('click', () => {
  if (state.items.length >= 60) return;
  state.items.push({ name: 'Item', price: 0, who: [...state.people.keys()] });
  renderItems(); render();
  $('item-rows').querySelector(`[data-item-price="${state.items.length - 1}"]`)?.focus();
});

$('copy').addEventListener('click', async () => {
  const text = $('summary-text').value;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    try { $('summary-text').select(); ok = document.execCommand('copy'); } catch { ok = false; }
  }
  const b = $('copy');
  b.textContent = ok ? 'Copied ✓' : 'Select and copy';
  setTimeout(() => { b.textContent = 'Copy text'; }, 1600);
});

renderPeople();
renderItems();
render();
tabs.goToHash();
