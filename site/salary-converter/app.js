import { initPage, initTabs, createPager, esc } from '../assets/site.js';

initPage();
const tabs = initTabs();

let data;
try {
  data = await fetch('data.json').then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
} catch {
  const el = document.getElementById('load-error');
  el.hidden = false;
  el.textContent = "Couldn't load data.json. If you opened this file from disk, serve the folder instead: python3 -m http.server -d site";
  throw new Error('data.json failed to load');
}

const C = data.countries;
const byIso = Object.fromEntries(C.map((c) => [c.iso3, c]));
const latestYear = Math.max(...C.map((c) => c.year));

/* ---------- Money formatting ---------- */
const localeFor = (cur) => (cur === 'INR' ? 'en-IN' : 'en-US');
function money(n, c, compact = false) {
  if (!Number.isFinite(n)) return '–';
  const digits = Math.abs(n) >= 100 ? 0 : 2;
  try {
    return new Intl.NumberFormat(localeFor(c.currency), {
      style: 'currency', currency: c.currency, maximumFractionDigits: digits, minimumFractionDigits: 0,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    }).format(n);
  } catch {
    return `${n.toLocaleString('en-US', { maximumFractionDigits: digits })} ${c.currency}`;
  }
}
// Words for big numbers so "2500000" reads as "25 lakh" or "2.5 million".
function inWords(n, c) {
  if (!Number.isFinite(n) || n < 1000) return '';
  if (c.currency === 'INR') {
    if (n >= 1e7) return `${+(n / 1e7).toFixed(2)} crore`;
    if (n >= 1e5) return `${+(n / 1e5).toFixed(2)} lakh`;
    return `${+(n / 1e3).toFixed(1)} thousand`;
  }
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)} million`;
  return `${+(n / 1e3).toFixed(1)} thousand`;
}
const parseAmt = (s) => {
  const v = Number(String(s).replace(/[^\d.]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/* ---------- Core arithmetic ---------- */
const priceLevel = (c) => (c.fx ? c.ppp / c.fx : null); // local prices relative to the US at market rates
const equivalent = (amt, a, b) => (amt / a.ppp) * b.ppp;
const atFx = (amt, a, b) => (a.fx && b.fx ? (amt / a.fx) * b.fx : null);
const relLevel = (a, b) => (priceLevel(a) && priceLevel(b) ? priceLevel(b) / priceLevel(a) : null); // b's prices vs a's

/* ---------- State in the URL ---------- */
const params = new URLSearchParams(location.search);
const state = {
  amt: parseAmt(params.get('amt')) ?? 2500000,
  from: byIso[params.get('from')?.toUpperCase()] ? params.get('from').toUpperCase() : 'IND',
  to: byIso[params.get('to')?.toUpperCase()] ? params.get('to').toUpperCase() : 'USA',
};
function syncUrl() {
  const p = new URLSearchParams({ amt: String(state.amt), from: state.from, to: state.to });
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
}

/* ---------- Inputs ---------- */
const amtEl = document.getElementById('amt');
const fromEl = document.getElementById('from');
const toEl = document.getElementById('to');
const opts = C.map((c) => `<option value="${c.iso3}">${esc(c.name)} · ${esc(c.currency)}</option>`).join('');
fromEl.innerHTML = opts;
toEl.innerHTML = opts;

// Name for running text ("the US"), and a bare one for the quick-pick chips ("US").
const THE = { USA: 'the US', GBR: 'the UK', ARE: 'the UAE', NLD: 'the Netherlands', PHL: 'the Philippines', CZE: 'Czechia', BHS: 'the Bahamas', GMB: 'the Gambia' };
function short(c) {
  return THE[c.iso3] || c.name.replace(/,.*$/, '');
}
const chipName = (c) => short(c).replace(/^the /, '');
const QUICK = [['IND', 'USA'], ['IND', 'GBR'], ['IND', 'DEU'], ['IND', 'SGP'], ['IND', 'ARE'], ['IND', 'CAN'], ['IND', 'AUS'], ['USA', 'IND']];
document.getElementById('quick').innerHTML =
  '<span class="muted">Try:</span>' +
  QUICK.filter(([a, b]) => byIso[a] && byIso[b])
    .map(([a, b]) => `<button type="button" class="chip outline" data-a="${a}" data-b="${b}">${esc(chipName(byIso[a]))} → ${esc(chipName(byIso[b]))}</button>`)
    .join('');

function fmtInput(n, c) {
  return n.toLocaleString(localeFor(c.currency), { maximumFractionDigits: 2 });
}

/* ---------- Convert tab ---------- */
const tile = (lab, value, sub) =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

function renderConvert() {
  const a = byIso[state.from];
  const b = byIso[state.to];
  document.getElementById('amt-label').textContent = `Amount in ${a.currency_name} (${a.currency})`;
  document.getElementById('amt-words').textContent = inWords(state.amt, a);
  const eq = equivalent(state.amt, a, b);
  const fx = atFx(state.amt, a, b);
  const rel = relLevel(a, b);
  const usd = byIso.USA;
  const eqUsd = equivalent(state.amt, a, usd);

  const same = a.iso3 === b.iso3;
  document.getElementById('answer').innerHTML = same
    ? 'Pick two different countries to compare.'
    : `To live as well in <b>${esc(short(b))}</b> as <b>${esc(money(state.amt, a))}</b> lets you live in <b>${esc(short(a))}</b>, you'd need about <mark>${esc(money(eq, b))}</mark>.`;

  const relTxt = rel == null ? 'No exchange rate for one of the two countries' : rel >= 1
    ? `Everyday prices in ${short(b)} are ${rel.toFixed(1)}× those in ${short(a)}`
    : `Everyday prices in ${short(b)} are ${Math.round(rel * 100)}% of those in ${short(a)}`;
  document.getElementById('conv-tiles').innerHTML = [
    tile(`Same standard of living in ${short(b)}`, esc(money(eq, b)), `PPP, ${b.year} household prices`),
    tile('At the exchange rate', esc(money(fx, b)), fx == null ? 'No exchange rate in the data' : `${a.year === b.year ? a.year : `${a.year}/${b.year}`} average rate · what a bank would give you`),
    tile(`Prices in ${short(b)} vs ${short(a)}`, rel == null ? '–' : rel >= 1 ? `${rel.toFixed(2)}×` : `${Math.round(rel * 100)}%`, relTxt),
    a.iso3 !== 'USA' && b.iso3 !== 'USA' ? tile('In US dollar terms', esc(money(eqUsd, usd)), 'What your amount buys, priced as in the US') : '',
  ].join('');
  renderExample();
}

/* ---------- Every country tab ---------- */
const REGIONS = [...new Set(C.map((c) => c.region))].sort();
document.getElementById('pl-region').innerHTML = `<option value="all">All regions</option>${REGIONS.map((r) => `<option>${esc(r)}</option>`).join('')}`;
const plState = { q: '', region: 'all', sort: { key: 'level', dir: 1 }, limit: 15 };
const PL_SORTS = {
  name: { get: (c) => c.name, dir: 1 },
  level: { get: (c) => relLevel(byIso[state.from], c), dir: 1 },
};
const plPager = createPager(document.getElementById('pl-pager'), { onMore: () => { plState.limit += 15; renderLevels(); } });

function renderLevels() {
  const a = byIso[state.from];
  const q = plState.q.trim().toLowerCase();
  const { key, dir } = plState.sort;
  const list = C.filter((c) => (plState.region === 'all' || c.region === plState.region) && (!q || `${c.name} ${c.currency} ${c.currency_name} ${c.iso3}`.toLowerCase().includes(q)))
    .sort((x, y) => {
      const vx = PL_SORTS[key].get(x);
      const vy = PL_SORTS[key].get(y);
      if (vx == null && vy == null) return 0;
      if (vx == null) return 1;
      if (vy == null) return -1;
      return dir * (typeof vx === 'string' ? vx.localeCompare(vy) : vx - vy);
    });
  const maxRel = Math.max(...C.map((c) => relLevel(a, c) ?? 0));
  const shown = list.slice(0, plState.limit);
  document.querySelector('#pl-table tbody').innerHTML = shown.length ? shown.map((c) => {
    const rel = relLevel(a, c);
    const home = c.iso3 === a.iso3;
    return `<tr class="row${c.iso3 === state.to ? ' open' : ''}" data-iso="${c.iso3}" tabindex="0" title="Compare ${esc(short(a))} with ${esc(c.name)}">
      <td class="sticky col-name"><b>${esc(c.name)}</b>${home ? ' <span class="chip accent">home</span>' : ''}<div class="pflav">${esc(c.currency_name)} · ${esc(c.currency)}</div></td>
      <td class="n">${rel == null ? '<span class="muted">no rate</span>' : `<div class="scorebar"><div class="track"><div class="fill" style="width:${Math.min(100, (rel / maxRel) * 100)}%;background:${rel > 1 ? 'var(--s2)' : 'var(--s1)'}"></div></div><b>${rel >= 10 ? Math.round(rel) : rel.toFixed(2)}×</b></div>`}</td>
      <td class="n"><b>${esc(money(equivalent(state.amt, a, c), c))}</b></td>
      <td class="n">${esc(money(atFx(state.amt, a, c), c))}</td>
      <td class="n${c.year < latestYear ? ' muted' : ''}">${c.year}</td></tr>`;
  }).join('') : '<tr><td colspan="5"><div class="empty">No countries match.</div></td></tr>';
  plPager.update(shown.length, list.length);
  document.getElementById('pl-hint').textContent = `${money(state.amt, a)} from ${short(a)} · ${list.length} countries · 15 at a time · click one to compare`;
  document.querySelector('#pl-level-h .sort-btn').firstChild.textContent = `Prices vs ${short(a)} `;
  document.querySelectorAll('#pl-table th[data-key]').forEach((th) => {
    const on = th.dataset.key === key;
    if (on) th.setAttribute('aria-sort', dir < 0 ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
    th.querySelector('.arrow').textContent = on ? (dir < 0 ? '↓' : '↑') : '↕';
  });
}

/* ---------- Worked example ---------- */
function renderExample() {
  const a = byIso[state.from];
  const b = byIso[state.to];
  const f = (n, d = 4) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '–');
  const rows = [
    ['Your amount', `${money(state.amt, a)}`],
    [`PPP factor, ${a.name} (${a.year})`, `${f(a.ppp)} ${a.currency} per international $`],
    [`PPP factor, ${b.name} (${b.year})`, `${f(b.ppp)} ${b.currency} per international $`],
    ['Same standard of living', `${f(state.amt, 2)} ÷ ${f(a.ppp)} × ${f(b.ppp)} = <b>${esc(money(equivalent(state.amt, a, b), b))}</b>`],
    [`Exchange rate, ${a.name}`, a.fx ? `${f(a.fx)} ${a.currency} per US$` : 'not available'],
    [`Exchange rate, ${b.name}`, b.fx ? `${f(b.fx)} ${b.currency} per US$` : 'not available'],
    ['At the exchange rate', a.fx && b.fx ? `${f(state.amt, 2)} ÷ ${f(a.fx)} × ${f(b.fx)} = <b>${esc(money(atFx(state.amt, a, b), b))}</b>` : '–'],
  ];
  document.querySelector('#example-table tbody').innerHTML = rows
    .map(([k, v]) => `<tr><th class="sticky" style="font-weight:550">${esc(k)}</th><td>${v.includes('<b>') ? v : esc(v)}</td></tr>`)
    .join('');
}

/* ---------- Wiring ---------- */
function renderAll() {
  fromEl.value = state.from;
  toEl.value = state.to;
  renderConvert();
  renderLevels();
  syncUrl();
}

amtEl.value = fmtInput(state.amt, byIso[state.from]);
amtEl.addEventListener('input', () => {
  const v = parseAmt(amtEl.value);
  if (v == null) return;
  state.amt = v;
  renderConvert();
  renderLevels();
  syncUrl();
});
amtEl.addEventListener('blur', () => { amtEl.value = fmtInput(state.amt, byIso[state.from]); });
fromEl.addEventListener('change', () => { state.from = fromEl.value; plState.limit = 15; amtEl.value = fmtInput(state.amt, byIso[state.from]); renderAll(); });
toEl.addEventListener('change', () => { state.to = toEl.value; renderAll(); });
document.getElementById('swap').addEventListener('click', () => {
  const eq = equivalent(state.amt, byIso[state.from], byIso[state.to]);
  [state.from, state.to] = [state.to, state.from];
  state.amt = Math.round(eq);
  amtEl.value = fmtInput(state.amt, byIso[state.from]);
  renderAll();
});
document.getElementById('quick').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  if (b.dataset.a !== state.from) {
    // Carry the amount across by value so switching home country stays sensible.
    state.amt = Math.round(atFx(state.amt, byIso[state.from], byIso[b.dataset.a]) ?? state.amt);
  }
  state.from = b.dataset.a;
  state.to = b.dataset.b;
  amtEl.value = fmtInput(state.amt, byIso[state.from]);
  renderAll();
});
document.getElementById('pl-q').addEventListener('input', (e) => { plState.q = e.target.value; plState.limit = 15; renderLevels(); });
document.getElementById('pl-region').addEventListener('change', (e) => { plState.region = e.target.value; plState.limit = 15; renderLevels(); });
document.querySelectorAll('#pl-table th[data-key]').forEach((th) =>
  th.querySelector('.sort-btn').addEventListener('click', () => {
    const key = th.dataset.key;
    plState.sort = plState.sort.key === key ? { key, dir: -plState.sort.dir } : { key, dir: PL_SORTS[key].dir };
    plState.limit = 15;
    renderLevels();
  }),
);
const plBody = document.querySelector('#pl-table tbody');
const pickRow = (tr) => {
  if (tr.dataset.iso === state.from) return;
  state.to = tr.dataset.iso;
  renderAll();
  tabs.activate('convert', true);
  window.scrollTo({ top: 0 });
};
plBody.addEventListener('click', (e) => { const tr = e.target.closest('tr.row'); if (tr) pickRow(tr); });
plBody.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) { e.preventDefault(); pickRow(e.target); } });

document.getElementById('year-chip').textContent = `World Bank data, mostly ${latestYear}`;
document.getElementById('footer-data').textContent = `Data: World Bank WDI, updated ${data.wb_last_updated}.`;

renderAll();
tabs.goToHash();
