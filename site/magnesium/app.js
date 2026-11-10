import { initPage, initTabs, createTooltip, store, esc, inr, fixed, num, pct } from '../assets/site.js';

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

const PRICE_KEY = 'et:magnesium:prices:v1';
const CEILING = data.ceiling_mg;
const METALS = ['lead', 'arsenic', 'cadmium', 'mercury'];
const today = new Date();
const DAY = 86400000;

const state = {
  filter: 'all',
  open: new Set(),
  target: 200,
  prices: store.get(PRICE_KEY, {}) || {},
};

/* ---------- Derived values ---------- */
const label = (p) => `${p.brand} ${p.name}`;
const packLabel = (p) => (p.pack ? ` (${p.pack} ${p.unit === 'tablet' ? 'tabs' : 'caps'})` : '');
const unitShort = (p) => ({ capsule: 'cap', tablet: 'tab', serving: 'serving', '100 g': '100 g' })[p.unit];

function rating(p) {
  if (!p.valid_till_iso) return { active: p.status === 'Active', known: false, daysLeft: null };
  const end = new Date(`${p.valid_till_iso}T23:59:59`);
  return { active: end >= today, known: true, daysLeft: Math.ceil((end - today) / DAY) };
}
const effPrice = (p) => state.prices[p.id]?.price ?? p.price;
const effPack = (p) => state.prices[p.id]?.pack ?? p.pack;
function perUnit(p) {
  const price = effPrice(p);
  const pack = effPack(p);
  return price > 0 && pack > 0 ? price / pack : null;
}
const per100 = (p) => (perUnit(p) != null && p.lab_mg ? (perUnit(p) / p.lab_mg) * 100 : null);
const vsLabel = (p) => (p.lab_mg && p.claimed_mg ? p.lab_mg / p.claimed_mg - 1 : null);
const maxMetal = Object.fromEntries(
  METALS.map((m) => [m, Math.max(...data.products.map((p) => p[m]).filter((v) => v != null))]),
);

/* ---------- Tiles ---------- */
const tile = (lab, value, sub, unit = '') =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

function renderLabTiles() {
  const P = data.products;
  const active = P.filter((p) => rating(p).active);
  const withVs = P.filter((p) => vsLabel(p) != null && !p.same_as);
  const closest = [...withVs].sort((a, b) => Math.abs(vsLabel(a)) - Math.abs(vsLabel(b)))[0];
  const biggest = [...withVs].sort((a, b) => vsLabel(b) - vsLabel(a))[0];
  const cleanest = active.filter((p) => p.lead != null).sort((a, b) => a.lead - b.lead)[0];
  const cheap = P.filter((p) => per100(p) != null).sort((a, b) => per100(a) - per100(b))[0];
  document.getElementById('lab-tiles').innerHTML = [
    tile('Ratings active today', String(active.length), `of ${P.length} products. Each rating covers one batch for 12 months.`, `/ ${P.length}`),
    tile('Closest to its label', pct(vsLabel(closest), 1), `${label(closest)} · ${num(closest.lab_mg, 0)} mg vs ${closest.claimed_mg} mg`),
    tile('Most over its label', pct(vsLabel(biggest), 0), `${label(biggest)} · ${num(biggest.lab_mg, 0)} mg vs ${biggest.claimed_mg} mg`),
    cleanest ? tile('Lowest lead, active rating', num(cleanest.lead), label(cleanest), 'ppm') : '',
    cheap
      ? tile('Cheapest per 100 mg (lab)', inr(per100(cheap), 2), `${label(cheap)}${packLabel({ ...cheap, pack: effPack(cheap) })}`)
      : tile('Cheapest per 100 mg (lab)', '–', 'Add a price in the table to compare'),
  ].join('');
}

/* ---------- Lab table ---------- */
function ratingCell(p) {
  const r = rating(p);
  const cls = p.rating !== 'A+' ? 'warn' : r.active ? 'good' : 'good-2';
  const status = r.active ? 'Active' : 'Expired';
  const when = p.valid_till
    ? `<div class="small muted">${r.active ? 'until' : 'lapsed'} ${esc(p.valid_till)}${r.active && r.daysLeft != null && r.daysLeft <= 90 ? ` · ${r.daysLeft} days left` : ''}</div>`
    : `<div class="small muted">${r.known ? '' : 'as of 23 Aug 2026'}</div>`;
  return `<span class="chip ${cls}">${esc(p.rating)} · ${status}</span>${when}`;
}
function metalCell(p, m, first) {
  const v = p[m];
  const bl = first ? ' bl' : '';
  if (v == null) return `<td class="n c-na${bl}" title="Not retrieved">–</td>`;
  if (v === 0) return `<td class="n c-good${bl}" title="Below detection limit">0</td>`;
  const cls = v === maxMetal[m] ? 'c-serious' : 'c-warn';
  return `<td class="n ${cls}${bl}" title="${v === maxMetal[m] ? 'Highest in this set, within FSSAI limits' : 'Trace, within FSSAI limits'}">${num(v)}</td>`;
}
const scoreCell = (v, first) =>
  v == null ? `<td class="n c-na${first ? ' bl' : ''}">–</td>` : `<td class="n ${v === 10 ? 'c-good' : ''}${first ? ' bl' : ''}">${num(v)}</td>`;

function priceInput(p, field) {
  const own = state.prices[p.id]?.[field] != null;
  const v = field === 'price' ? effPrice(p) : effPack(p);
  return `<input class="cell-input${own ? ' user' : ''}" type="number" min="0" step="1" inputmode="decimal"
    data-id="${p.id}" data-field="${field}" value="${v ?? ''}" placeholder="${field === 'price' ? 'add ₹' : 'units'}" aria-label="${field} for ${esc(label(p))}">`;
}

function rowHtml(p) {
  const open = state.open.has(p.id);
  const vs = vsLabel(p);
  return `<tr class="row${open ? ' open' : ''}" data-id="${p.id}" tabindex="0" aria-expanded="${open}">
    <td class="sticky col-name"><div class="pbrand">${esc(p.brand)}</div><div class="pname">${esc(p.name)}${p.same_as ? ` <span class="muted">(${p.pack} caps)</span>` : ''}</div>
      <div class="pflav">per ${esc(p.unit)}${p.same_as ? ' · same batch as the 120-cap pack' : ''}</div></td>
    <td class="col-rating">${ratingCell(p)}</td>
    <td class="n bl">${p.claimed_mg != null ? `${num(p.claimed_mg)} mg` : '<span class="muted">–</span>'}</td>
    <td class="n ${p.lab_mg == null ? 'c-na' : ''}">${p.lab_mg != null ? `<b>${num(p.lab_mg, 1)} mg</b>` : '–'}</td>
    <td class="n">${vs != null ? pct(vs, 1) : '<span class="muted">–</span>'}</td>
    ${METALS.map((m, i) => metalCell(p, m, i === 0)).join('')}
    ${scoreCell(p.nts, true)}${scoreCell(p.las, false)}
    <td class="n bl">${priceInput(p, 'pack')}</td>
    <td class="n">${priceInput(p, 'price')}</td>
    <td class="n" data-cell="unit">${inr(perUnit(p), 2)}</td>
    <td class="n" data-cell="per100"><b>${inr(per100(p), 2)}</b></td>
  </tr>${open ? detailHtml(p) : ''}`;
}

function detailHtml(p) {
  return `<tr class="detail-row"><td class="detail" colspan="15"><div class="drawer" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
    <div class="group"><div class="label">Notes</div><ul><li>${esc(p.notes)}</li></ul></div>
    <div class="group"><div class="label">Test details</div><dl class="kv">
      <dt>Batch tested</dt><dd>${esc(p.batch || '–')}</dd>
      <dt>Test initiated by</dt><dd>${esc(p.initiated_by || '–')}</dd>
      <dt>Rating valid till</dt><dd>${esc(p.valid_till || '–')}</dd>
    </dl></div>
  </div></td></tr>`;
}

const tbody = document.querySelector('#mg-table tbody');
function visible() {
  return data.products.filter((p) =>
    state.filter === 'active' ? rating(p).active : state.filter === 'lab' ? p.lab_mg != null : true,
  );
}
function renderTable() {
  tbody.innerHTML = visible().map(rowHtml).join('');
  const own = Object.keys(state.prices).length;
  document.getElementById('price-note').textContent = own ? `${own} price${own > 1 ? 's' : ''} saved in this browser` : '';
  document.getElementById('reset-prices').hidden = !own;
}

function toggleRow(id) {
  if (state.open.has(id)) state.open.delete(id);
  else state.open.add(id);
  renderTable();
}
tbody.addEventListener('click', (e) => {
  if (e.target.closest('input')) return;
  const tr = e.target.closest('tr.row');
  if (tr) toggleRow(tr.dataset.id);
});
tbody.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) {
    e.preventDefault();
    const id = e.target.dataset.id;
    toggleRow(id);
    tbody.querySelector(`tr.row[data-id="${id}"]`)?.focus();
  }
});

// Editing a price updates the computed cells in place so the input keeps focus.
tbody.addEventListener('input', (e) => {
  const inp = e.target.closest('input.cell-input');
  if (!inp) return;
  const { id, field } = inp.dataset;
  const p = data.products.find((x) => x.id === id);
  const v = inp.value === '' ? null : Number(inp.value);
  const entry = { ...(state.prices[id] || {}) };
  const source = field === 'price' ? p.price : p.pack;
  if (v == null || v === source) delete entry[field];
  else entry[field] = v;
  if (Object.keys(entry).length) state.prices[id] = entry;
  else delete state.prices[id];
  store.set(PRICE_KEY, state.prices);
  inp.classList.toggle('user', entry[field] != null);
  const tr = inp.closest('tr');
  tr.querySelector('[data-cell="unit"]').textContent = inr(perUnit(p), 2);
  tr.querySelector('[data-cell="per100"]').innerHTML = `<b>${inr(per100(p), 2)}</b>`;
  const own = Object.keys(state.prices).length;
  document.getElementById('price-note').textContent = own ? `${own} price${own > 1 ? 's' : ''} saved in this browser` : '';
  document.getElementById('reset-prices').hidden = !own;
  renderLabTiles();
  renderDose();
});

document.getElementById('reset-prices').addEventListener('click', () => {
  state.prices = {};
  store.del(PRICE_KEY);
  renderAll();
});
document.getElementById('mg-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-f]');
  if (!b) return;
  state.filter = b.dataset.f;
  e.currentTarget.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderTable();
});

/* ---------- Label vs lab chart ---------- */
const tip = createTooltip();
function drawChart() {
  const host = document.getElementById('mg-chart');
  const W = host.clientWidth;
  if (!W) return;
  const items = data.products.filter((p) => p.lab_mg && p.claimed_mg && !p.same_as).sort((a, b) => b.lab_mg - a.lab_mg);
  const narrow = W < 640;
  const labelW = narrow ? 120 : 280;
  const rightW = narrow ? 52 : 76;
  const rowH = 38;
  const top = 26;
  const H = top + items.length * rowH + 6;
  const max = Math.ceil(Math.max(...items.map((p) => Math.max(p.lab_mg, p.claimed_mg))) / 50) * 50;
  const x = (v) => labelW + (v / max) * (W - labelW - rightW);
  const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><g class="axis">`;
  for (let t = 0; t <= max; t += 50) {
    svg += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H}"/><text x="${x(t)}" y="${top - 13}" text-anchor="middle">${t}${t === max ? ' mg' : ''}</text>`;
  }
  svg += `<text x="${W}" y="${top - 13}" text-anchor="end">vs label</text></g>`;
  items.forEach((p, i) => {
    const y = top + i * rowH + rowH / 2;
    const name = label(p);
    svg += `<text x="${labelW - 12}" y="${y + 4}" text-anchor="end"><title>${esc(name)}</title>${esc(narrow ? trunc(name, 17) : name)}</text>`;
    svg += `<line x1="${x(p.claimed_mg)}" x2="${x(p.lab_mg)}" y1="${y}" y2="${y}" stroke="var(--neutral-mark)" stroke-width="2" stroke-linecap="round"/>`;
    const t1 = `<b>${esc(name)}</b><br>Label says ${num(p.claimed_mg)} mg per ${esc(p.unit)}`;
    const t2 = `<b>${esc(name)}</b><br>Lab found ${num(p.lab_mg, 1)} mg per ${esc(p.unit)} (${pct(vsLabel(p), 1)})`;
    svg += `<g data-tip="${esc(t1)}"><circle cx="${x(p.claimed_mg)}" cy="${y}" r="11" fill="transparent"/><circle cx="${x(p.claimed_mg)}" cy="${y}" r="5.5" fill="var(--neutral-mark)" stroke="var(--surface)" stroke-width="2"/></g>`;
    svg += `<g data-tip="${esc(t2)}"><circle cx="${x(p.lab_mg)}" cy="${y}" r="11" fill="transparent"/><circle cx="${x(p.lab_mg)}" cy="${y}" r="5.5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/></g>`;
    svg += `<text x="${W}" y="${y + 4}" text-anchor="end" style="font-weight:600;fill:var(--ink)">${pct(vsLabel(p), 0)}</text>`;
  });
  host.innerHTML = `${svg}</svg>`;
}
function bindChart() {
  const host = document.getElementById('mg-chart');
  host.addEventListener('pointermove', (e) => {
    const g = e.target.closest('[data-tip]');
    if (g) tip.show(g.dataset.tip, e.clientX, e.clientY);
    else tip.hide();
  });
  host.addEventListener('pointerleave', () => tip.hide());
  let lastW = 0;
  new ResizeObserver(() => {
    if (host.clientWidth && host.clientWidth !== lastW) {
      lastW = host.clientWidth;
      drawChart();
    }
  }).observe(host);
}

/* ---------- Dose and cost ---------- */
function doseRows() {
  return data.products
    .filter((p) => (p.lab_mg || p.claimed_mg) && p.unit !== '100 g')
    .map((p) => {
      const mg = p.lab_mg ?? p.claimed_mg;
      const units = Math.max(1, Math.round(state.target / mg));
      const unitCost = perUnit(p);
      return { p, mg, fromLab: p.lab_mg != null, units, total: units * mg, month: unitCost != null ? unitCost * units * 30 : null, unitCost };
    })
    .sort((a, b) => (a.month ?? Infinity) - (b.month ?? Infinity) || Math.abs(a.total - state.target) - Math.abs(b.total - state.target));
}

function renderDose() {
  const rows = doseRows();
  const over = rows.filter((r) => r.total > CEILING);
  const priced = rows.filter((r) => r.month != null);
  const closest = [...rows].filter((r) => r.fromLab && r.total <= CEILING).sort((a, b) => Math.abs(a.total - state.target) - Math.abs(b.total - state.target))[0];
  document.getElementById('dose-tiles').innerHTML = [
    priced[0] ? tile('Cheapest month at your target', inr(priced[0].month), `${label(priced[0].p)}${packLabel({ ...priced[0].p, pack: effPack(priced[0].p) })} · ${priced[0].units}/day`) : tile('Cheapest month', '–', 'Add prices on the Lab results tab'),
    closest ? tile('Closest to your target (lab)', `${num(closest.total, 0)}`, `${label(closest.p)} · ${closest.units} ${unitShort(closest.p)}${closest.units > 1 ? 's' : ''}/day`, 'mg') : '',
    tile('Over 350 mg at your target', String(over.length), over.length ? over.map((r) => r.p.brand).join(', ') : 'None. Every option stays under the ceiling.', `of ${rows.length}`),
  ].join('');

  document.querySelector('#dose-table tbody').innerHTML = rows
    .map((r) => {
      const ok = r.total <= CEILING;
      return `<tr><td class="sticky"><div class="pbrand">${esc(r.p.brand)}</div><div class="pname">${esc(r.p.name)}${packLabel({ ...r.p, pack: effPack(r.p) }) ? `<span class="muted">${esc(packLabel({ ...r.p, pack: effPack(r.p) }))}</span>` : ''}</div></td>
        <td class="n">${num(r.mg, 1)} mg<div class="small muted">${r.fromLab ? 'lab-tested' : 'label only'}</div></td>
        <td class="n"><b>${r.units}</b> ${esc(unitShort(r.p))}${r.units > 1 ? 's' : ''}</td>
        <td class="n"><b>${num(r.total, 0)} mg</b></td>
        <td>${ok ? '<span class="chip good">✓ Within 350 mg</span>' : '<span class="chip bad">! Over 350 mg</span>'}</td>
        <td class="n">${inr(r.unitCost, 2)}</td>
        <td class="n">${r.month != null ? `<b>${inr(r.month)}</b>` : '<a href="#lab-results" class="small">add a price</a>'}</td></tr>`;
    })
    .join('');
}

document.getElementById('target-mg').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  if (!Number.isFinite(v) || v <= 0) return;
  state.target = Math.min(1000, v);
  renderDose();
});

/* ---------- Boot ---------- */
function renderAll() {
  renderLabTiles();
  renderTable();
  renderDose();
  drawChart();
}
bindChart();
renderAll();
document.addEventListener('tabchange', (e) => {
  if (e.detail === 'lab-results') drawChart();
});
tabs.goToHash();
