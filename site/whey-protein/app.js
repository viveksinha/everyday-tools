import { initPage, initTabs, createPager, createTooltip, esc, inr, fixed, num, pct } from '../assets/site.js';
import { score, typeSummary, rsPerGram, PARTS, PRESETS, TYPE_LABEL, LAB_LABEL } from './scoring.js';

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

/* ---------- State (weights and dose live in the URL so links reproduce a ranking) ---------- */
const params = new URLSearchParams(location.search);
const state = {
  weights: parseWeights(params.get('w')) ?? { ...PRESETS.default.weights },
  dose: clampDose(Number(params.get('dose')) || 25),
  type: 'all',
  q: '',
  live: false,
  cert: false,
  unflav: false,
  sort: { key: 'score', dir: -1 },
  limit: 15,
  open: new Set(),
};
let rows = [];

function parseWeights(s) {
  if (!s) return null;
  const v = s.split(',').map(Number);
  if (v.length !== PARTS.length || v.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) return null;
  return Object.fromEntries(PARTS.map((p, i) => [p.key, v[i] / 100]));
}
function clampDose(n) {
  return Math.min(200, Math.max(1, Math.round(n)));
}
function syncUrl() {
  const p = new URLSearchParams(location.search);
  const w = PARTS.map((x) => Math.round(state.weights[x.key] * 100)).join(',');
  const isDefault = w === PARTS.map((x) => Math.round(PRESETS.default.weights[x.key] * 100)).join(',');
  if (isDefault) p.delete('w');
  else p.set('w', w);
  if (state.dose === 25) p.delete('dose');
  else p.set('dose', state.dose);
  const qs = p.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

const byId = new Map();
function recompute() {
  ({ rows } = score(data.products, state.weights));
  byId.clear();
  for (const r of rows) {
    r.month = r.rsg != null ? r.rsg * state.dose * 30 : null;
    byId.set(r.id, r);
  }
}

/* ---------- Small render helpers ---------- */
const name = (r) => `${r.brand} ${r.product}`;
const tile = (label, value, sub, unit = '') =>
  `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${value}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;
const labChip = (tier) => {
  const cls = tier === 'certified' ? 'good' : tier === 'brand' ? 'accent' : 'na';
  return `<span class="chip ${cls}">${LAB_LABEL[tier]}</span>`;
};
function statusChip(r) {
  if (r.live) return '';
  const s = r.status.toUpperCase();
  const label = s.startsWith('SOLD OUT') ? 'Sold out' : s.startsWith('OUT OF STOCK') ? 'Out of stock' : 'Price unverified';
  return `<span class="chip warn" title="${esc(r.status)}">${label}</span>`;
}
const fmtG = (v) => (v == null ? '<span class="muted" title="Not on the label">–</span>' : num(v));

/* ---------- Tiles ---------- */
function renderTopTiles() {
  const best = (f) => rows.filter(f).sort((a, b) => b.score - a.score)[0];
  const top = best((r) => r.rank != null);
  // The top pick is always an isolate or a concentrate, so show the best of the other one next to it.
  const otherType = top.type === 'isolate' ? 'concentrate' : 'isolate';
  const other = best((r) => r.type === otherType && r.typeRank != null);
  const plant = best((r) => r.type === 'plant' && r.typeRank != null);
  const cheap = rows.filter((r) => r.live && r.group === 'whey' && r.rsg != null).sort((a, b) => a.rsg - b.rsg)[0];
  const ranked = rows.filter((r) => r.typeRank != null);
  const wheyRanked = ranked.filter((r) => r.group === 'whey').length;
  document.getElementById('top-tiles').innerHTML = [
    tile(`Top whey overall · ${TYPE_LABEL[top.type]}`, fixed(top.score), name(top), '/ 100'),
    tile(`Best ${TYPE_LABEL[otherType].toLowerCase()}`, fixed(other.score), name(other), '/ 100'),
    tile('Best plant / yeast', fixed(plant.score), name(plant), '/ 100'),
    tile('Cheapest whey protein', inr(cheap.rsg, 2), `${name(cheap)} · ${inr(cheap.month)}/month at ${state.dose} g/day`, '/ g'),
    tile('Ranked', String(wheyRanked), `plus ${ranked.length - wheyRanked} plant/yeast. ${rows.length - ranked.length} more have no confirmed price.`, 'whey'),
  ].join('');
}

/* ---------- Weights ---------- */
function renderSliders() {
  const host = document.getElementById('sliders');
  host.innerHTML = PARTS.map(
    (p) => `<div class="slider">
      <label for="w-${p.key}">${esc(p.label)} <b id="wv-${p.key}"></b></label>
      <input type="range" id="w-${p.key}" min="0" max="50" step="5" data-key="${p.key}">
      <div class="help">${esc(p.help)}</div>
    </div>`,
  ).join('');
  host.addEventListener('input', (e) => {
    const key = e.target.dataset.key;
    if (!key) return;
    state.weights[key] = Number(e.target.value) / 100;
    onWeightsChanged();
  });
  document.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      state.weights = { ...PRESETS[b.dataset.preset].weights };
      onWeightsChanged();
    }),
  );
  updateSliderLabels();
}
function updateSliderLabels() {
  const total = PARTS.reduce((s, p) => s + state.weights[p.key], 0);
  for (const p of PARTS) {
    const w = state.weights[p.key];
    document.getElementById(`w-${p.key}`).value = Math.round(w * 100);
    document.getElementById(`wv-${p.key}`).textContent = `${Math.round(w * 100)}%`;
  }
  const t = Math.round(total * 100);
  document.getElementById('weight-note').textContent =
    t === 0 ? 'Set at least one weight above 0.' : t === 100 ? 'Total 100%' : `Total ${t}%, rescaled to 100%`;
  for (const [k, p] of Object.entries(PRESETS)) {
    const same = PARTS.every((x) => Math.abs(p.weights[x.key] - state.weights[x.key]) < 1e-9);
    document.querySelector(`[data-preset="${k}"]`).classList.toggle('primary', same);
  }
}
function onWeightsChanged() {
  updateSliderLabels();
  recompute();
  state.limit = 15;
  renderAll();
  syncUrl();
}

/* ---------- Rankings table ---------- */
const SORTS = {
  score: { get: (r) => r.score, dir: -1 },
  name: { get: (r) => name(r).toLowerCase(), dir: 1 },
  price: { get: (r) => r.price, dir: 1 },
  rsg: { get: (r) => r.rsg, dir: 1 },
  month: { get: (r) => r.rsg, dir: 1 },
  protein: { get: (r) => r.protein, dir: -1 },
  sugar: { get: (r) => r.sugar, dir: 1 },
  fat: { get: (r) => r.fat, dir: 1 },
  sodium: { get: (r) => r.sodium, dir: 1 },
};

function filtered() {
  const q = state.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (state.type === 'all' || r.type === state.type) &&
      (!state.live || r.live) &&
      (!state.cert || r.labTier === 'certified') &&
      (!state.unflav || /unflavou?red|plain/i.test(r.flavour)) &&
      (!q || `${r.brand} ${r.product} ${r.flavour}`.toLowerCase().includes(q)),
  );
}

function sortRows(list) {
  const { key, dir } = state.sort;
  const get = SORTS[key].get;
  return [...list].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return dir * c || (b.score ?? -1) - (a.score ?? -1);
  });
}

function rowHtml(r) {
  const open = state.open.has(r.id);
  const rank = r.rank != null
    ? `<span class="rank ${r.rank <= 3 ? 'top' : ''}" title="Overall whey rank">#${r.rank}</span>`
    : `<span class="rank" title="${r.group === 'plant' ? 'Plant/yeast are ranked only within their type' : 'Price not confirmed, so not ranked'}">–</span>`;
  const typeRank = r.typeRank != null ? `<div class="small muted">#${r.typeRank} in type</div>` : '';
  return `<tr class="row${open ? ' open' : ''}" data-id="${r.id}" tabindex="0" aria-expanded="${open}">
    <td class="sticky"><div class="cell-product">${rank}<div>
      <div class="pbrand">${esc(r.brand)}</div><div class="pname">${esc(r.product)}</div>
      <div class="pflav" title="${esc(r.flavour)}">${esc(r.flavour)}</div>${statusChip(r)}
    </div></div></td>
    <td><span class="chip">${TYPE_LABEL[r.type]}</span>${typeRank}</td>
    <td class="n">${inr(r.price)}<div class="small muted">${num(r.pack_g)} g</div></td>
    <td class="n"><b>${inr(r.rsg, 2)}</b></td>
    <td class="n">${inr(r.month)}</td>
    <td class="n">${fmtG(r.protein)}<span class="small muted"> g</span></td>
    <td class="n">${fmtG(r.sugar)}</td>
    <td class="n">${fmtG(r.fat)}</td>
    <td class="n">${fmtG(r.sodium)}</td>
    <td>${labChip(r.labTier)}</td>
    <td class="n">${r.score != null
      ? `<div class="scorebar"><div class="track"><div class="fill" style="width:${r.score}%"></div></div><b>${fixed(r.score)}</b></div>`
      : '<span class="muted" title="No price, so no score">–</span>'}</td>
  </tr>`;
}

function detailHtml(r) {
  const wsum = PARTS.reduce((s, p) => s + (r.parts[p.key] == null ? 0 : state.weights[p.key]), 0);
  const parts = PARTS.map((p) => {
    const v = r.parts[p.key];
    const share = v == null || !wsum ? 'skipped' : `${Math.round((state.weights[p.key] / wsum) * 100)}%`;
    return `<div class="part"><span>${esc(p.label)} <span class="muted small">· ${share}</span></span>
      <div class="track"><div class="fill" style="width:${v ?? 0}%"></div></div>
      <span class="val">${v == null ? '–' : Math.round(v)}</span></div>`;
  }).join('');
  const hist = data.history.items.find((h) => h.id === r.id);
  let histRows = '';
  if (hist && r.rsg != null) {
    const [feb, apr] = hist.points.map((p) => rsPerGram(p.price, p.pack_g, p.protein));
    histRows = `<dt>Apr 2025</dt><dd>${inr(apr, 2)}/g → now ${pct(r.rsg / apr - 1)}</dd><dt>Feb 2024</dt><dd>${inr(feb, 2)}/g → now ${pct(r.rsg / feb - 1)}</dd>`;
  }
  return `<tr class="detail-row"><td class="detail" colspan="11"><div class="drawer">
    <div class="group"><div class="label">Score breakdown</div><div class="parts">${parts}</div></div>
    <div class="group"><div class="label">Label and price</div><dl class="kv">
      <dt>Energy</dt><dd>${num(r.kcal)} kcal / 100 g</dd>
      <dt>Protein share of calories</dt><dd>${r.kcalShare != null ? `${Math.round(r.kcalShare * 100)}%` : '–'}</dd>
      <dt>BCAA</dt><dd>${r.bcaa != null ? `${num(r.bcaa)} g per serving` : 'not stated'}</dd>
      <dt>Serving</dt><dd>${num(r.serving_g)} g</dd>
      <dt>₹ per 25 g protein</dt><dd>${inr(r.rsg != null ? r.rsg * 25 : null, 2)}</dd>
      <dt>Price status</dt><dd>${esc(r.status)}</dd>${histRows}
    </dl></div>
    <div class="group"><div class="label">Notes</div><ul>
      ${r.notes ? `<li>${esc(r.notes)}</li>` : ''}
      <li><b>Lab:</b> ${esc(r.lab)}</li>
      <li><b>Flavours:</b> ${esc(r.flavour)}</li>
      <li><a href="${esc(r.url)}" target="_blank" rel="noopener">Open the seller page ↗</a></li>
    </ul></div>
  </div></td></tr>`;
}

const tbody = document.querySelector('#rank-table tbody');
const pager = createPager(document.getElementById('rank-pager'), {
  onMore() {
    state.limit += 15;
    renderTable();
  },
});

function renderTable() {
  const list = sortRows(filtered());
  const shown = list.slice(0, state.limit);
  tbody.innerHTML = shown.length
    ? shown.map((r) => rowHtml(r) + (state.open.has(r.id) ? detailHtml(r) : '')).join('')
    : '<tr><td colspan="11"><div class="empty">Nothing matches these filters.</div></td></tr>';
  pager.update(shown.length, list.length);
  document.getElementById('rank-hint').textContent =
    `${list.length} of ${rows.length} products · 15 at a time · scroll for more`;
  document.querySelectorAll('#rank-table th[data-key]').forEach((th) => {
    const on = th.dataset.key === state.sort.key;
    if (on) th.setAttribute('aria-sort', state.sort.dir < 0 ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
    th.querySelector('.arrow').textContent = on ? (state.sort.dir < 0 ? '↓' : '↑') : '↕';
  });
  document.querySelector('#rank-table th[data-key="month"] .sort-btn').firstChild.textContent = `₹ / month @ ${state.dose} g `;
}

function toggleRow(tr) {
  const id = tr.dataset.id;
  if (state.open.has(id)) state.open.delete(id);
  else state.open.add(id);
  renderTable();
}
tbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr.row');
  if (tr) toggleRow(tr);
});
tbody.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) {
    e.preventDefault();
    toggleRow(e.target);
    tbody.querySelector(`tr.row[data-id="${e.target.dataset.id}"]`)?.focus();
  }
});
document.querySelectorAll('#rank-table th[data-key]').forEach((th) =>
  th.querySelector('.sort-btn').addEventListener('click', () => {
    const key = th.dataset.key;
    state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: SORTS[key].dir };
    state.limit = 15;
    renderTable();
  }),
);

function bindFilters() {
  const seg = document.getElementById('type-seg');
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    state.type = b.dataset.type;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    state.limit = 15;
    renderTable();
  });
  document.getElementById('q').addEventListener('input', (e) => {
    state.q = e.target.value;
    state.limit = 15;
    renderTable();
  });
  for (const [id, key] of [['f-live', 'live'], ['f-cert', 'cert'], ['f-unflav', 'unflav']]) {
    document.getElementById(id).addEventListener('change', (e) => {
      state[key] = e.target.checked;
      state.limit = 15;
      renderTable();
    });
  }
  const dose = document.getElementById('dose-g');
  dose.value = state.dose;
  dose.addEventListener('input', () => {
    const v = Number(dose.value);
    if (!Number.isFinite(v) || v <= 0) return;
    state.dose = clampDose(v);
    recompute();
    renderTopTiles();
    renderTable();
    syncUrl();
  });
}

/* ---------- Price trend ---------- */
const tip = createTooltip();
const DATE_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)'];

function trendItems() {
  return data.history.items
    .map((h) => {
      const r = byId.get(h.id);
      const pts = [
        ...h.points.map((p, i) => ({ ...p, date: data.history.dates[i], v: rsPerGram(p.price, p.pack_g, p.protein) })),
        { price: r.price, pack_g: r.pack_g, protein: r.protein, date: data.history.dates[2], v: r.rsg },
      ];
      return { r, label: name(r).replace(/\s*\(.*?\)/g, ''), pts };
    })
    .sort((a, b) => b.pts[2].v - a.pts[2].v);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function renderTrend() {
  const items = trendItems();
  const sinceApr = items.map((i) => i.pts[2].v / i.pts[1].v - 1);
  const sinceFeb = items.map((i) => i.pts[2].v / i.pts[0].v - 1);
  const maxIdx = sinceApr.indexOf(Math.max(...sinceApr));
  const minIdx = sinceApr.indexOf(Math.min(...sinceApr));
  document.getElementById('trend-tiles').innerHTML = [
    tile('Median change since Apr 2025', pct(median(sinceApr)), 'per gram of protein, across the 9 tracked tubs'),
    tile('Median change since Feb 2024', pct(median(sinceFeb)), 'same 9 tubs, about 2½ years'),
    tile('Biggest jump since Apr 2025', pct(sinceApr[maxIdx]), items[maxIdx].label),
    tile('Smallest change since Apr 2025', pct(sinceApr[minIdx]), items[minIdx].label),
  ].join('');

  document.getElementById('trend-legend').innerHTML = data.history.dates
    .map((d, i) => `<span class="key"><span class="dot" style="background:${DATE_COLORS[i]}"></span>${esc(d)}</span>`)
    .join('');

  document.querySelector('#trend-table tbody').innerHTML = items
    .map((i, k) => `<tr><td class="sticky"><b>${esc(i.label)}</b><div class="small muted hide-sm">then: ${esc(data.history.items.find((h) => h.id === i.r.id).then_name)}</div></td>
      ${i.pts.map((p) => `<td class="n">${inr(p.v, 2)}<div class="small muted">${inr(p.price)} · ${num(p.pack_g)} g · ${num(p.protein)}%</div></td>`).join('')}
      <td class="n"><b>${pct(sinceApr[k])}</b></td><td class="n"><b>${pct(sinceFeb[k])}</b></td></tr>`)
    .join('');
  drawTrendChart(items);
}

function drawTrendChart(items) {
  const host = document.getElementById('trend-chart');
  const W = host.clientWidth;
  if (!W) return;
  const narrow = W < 640;
  const labelW = narrow ? 128 : 250;
  const rightW = narrow ? 58 : 104;
  const rowH = 38;
  const top = 26;
  const H = top + items.length * rowH + 6;
  const all = items.flatMap((i) => i.pts.map((p) => p.v));
  const max = Math.ceil(Math.max(...all) / 2) * 2;
  const x = (v) => labelW + (v / max) * (W - labelW - rightW);
  const ticks = [];
  for (let t = 0; t <= max; t += 2) ticks.push(t);
  const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += '<g class="axis">';
  for (const t of ticks) {
    svg += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H}"/>`;
    svg += `<text x="${x(t)}" y="${top - 13}" text-anchor="middle">₹${t}</text>`;
  }
  svg += `<text x="${W}" y="${top - 13}" text-anchor="end">${narrow ? 'vs 2024' : 'vs Feb 2024'}</text></g>`;
  items.forEach((it, i) => {
    const y = top + i * rowH + rowH / 2;
    const vs = it.pts.map((p) => p.v);
    svg += `<text x="${labelW - 12}" y="${y + 4}" text-anchor="end"><title>${esc(it.label)}</title>${esc(narrow ? trunc(it.label, 18) : it.label)}</text>`;
    svg += `<line x1="${x(Math.min(...vs))}" x2="${x(Math.max(...vs))}" y1="${y}" y2="${y}" stroke="var(--neutral-mark)" stroke-width="2" stroke-linecap="round"/>`;
    it.pts.forEach((p, k) => {
      const tipHtml = `<b>${esc(it.label)}</b><br>${esc(p.date)}: ${inr(p.v, 2)} per g protein<br>${inr(p.price)} for ${num(p.pack_g)} g · ${num(p.protein)} g protein/100 g`;
      svg += `<g data-tip="${esc(tipHtml)}"><circle cx="${x(p.v)}" cy="${y}" r="11" fill="transparent"/><circle cx="${x(p.v)}" cy="${y}" r="5.5" fill="${DATE_COLORS[k]}" stroke="var(--surface)" stroke-width="2"/></g>`;
    });
    svg += `<text x="${W}" y="${y + 4}" text-anchor="end" style="font-weight:600;fill:var(--ink)">${pct(vs[2] / vs[0] - 1)}</text>`;
  });
  svg += '</svg>';
  host.innerHTML = svg;
}

function bindTrendChart() {
  const host = document.getElementById('trend-chart');
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
      drawTrendChart(trendItems());
    }
  }).observe(host);
}

/* ---------- Whey types: live numbers ---------- */
function renderLiveNumbers() {
  const s = typeSummary(rows);
  document.querySelector('#live-table tbody').innerHTML = Object.entries(TYPE_LABEL)
    .map(([k, label]) => {
      const t = s[k];
      return `<tr><th class="sticky">${esc(label)}</th><td class="n">${t.count}</td><td class="n">${fixed(t.avgProtein)} g</td>
        <td class="n">${inr(t.avgRsg, 2)}</td><td class="n">${inr(t.minRsg, 2)}<div class="small muted">${esc(name(t.cheapest))}</div></td>
        <td class="n">${fixed(t.avgScore)}</td><td>${t.top ? `${esc(name(t.top))} <span class="muted">· ${fixed(t.top.score)}</span>` : '–'}</td></tr>`;
    })
    .join('');
  const prem = s.isolate.avgRsg / s.concentrate.avgRsg - 1;
  document.getElementById('type-premium').innerHTML = `<div class="label">What isolate costs you</div>
    <ul><li><b>Isolates cost ${pct(prem)} more per gram of protein</b> than concentrates on average (${inr(s.isolate.avgRsg, 2)} vs ${inr(s.concentrate.avgRsg, 2)}).</li>
    <li><b>You get ${fixed(s.isolate.avgProtein - s.concentrate.avgProtein)} g more protein per 100 g</b> of powder for it (${fixed(s.isolate.avgProtein)} vs ${fixed(s.concentrate.avgProtein)} g).</li></ul>`;
}

/* ---------- Scoring tab ---------- */
function renderWeightsTable() {
  const total = PARTS.reduce((s, p) => s + state.weights[p.key], 0) || 1;
  document.querySelector('#weights-table tbody').innerHTML = PARTS.map(
    (p) => `<tr><th class="sticky">${esc(p.label)}</th><td class="n"><b>${Math.round((state.weights[p.key] / total) * 100)}%</b></td><td>${esc(p.help)}</td></tr>`,
  ).join('');
}

function renderExample() {
  const sel = document.getElementById('example-pick');
  if (!sel.options.length) {
    sel.innerHTML = [...rows]
      .sort((a, b) => name(a).localeCompare(name(b)))
      .map((r) => `<option value="${r.id}">${esc(name(r))}</option>`)
      .join('');
    sel.value = 'nakpro-platinum-raw-isolate';
    sel.addEventListener('change', renderExample);
  }
  const r = byId.get(sel.value);
  const groupLive = rows.filter((o) => o.live && o.group === r.group && o.rsg != null);
  const cheapest = groupLive.sort((a, b) => a.rsg - b.rsg)[0];
  const w = state.weights;
  const used = PARTS.filter((p) => r.parts[p.key] != null);
  const wsum = used.reduce((s, p) => s + w[p.key], 0);
  const P = r.parts;
  const steps = [
    ['Price', inr(r.price), 'from the table'],
    ['Pack', `${num(r.pack_g)} g`, 'from the table'],
    ['Protein per 100 g', fmtG(r.protein), 'label'],
    ['Sugar per 100 g', fmtG(r.sugar), 'label (dash = not listed)'],
    ['Fat per 100 g', fmtG(r.fat), 'label'],
    ['Sodium per 100 g', r.sodium == null ? '–' : `${num(r.sodium)} mg`, 'label (dash = not listed)'],
    ['₹ per g protein', inr(r.rsg, 2), r.rsg == null ? 'no price' : `${num(r.price)} ÷ (${num(r.pack_g)} × ${num(r.protein)} ÷ 100)`],
    ['Cheapest in group', inr(cheapest.rsg, 2), `${esc(name(cheapest))} (${r.group === 'plant' ? 'plant/yeast' : 'whey'}, confirmed prices)`],
    ['Value score', P.value == null ? '–' : fixed(P.value, 2), P.value == null ? 'no price' : `${fixed(cheapest.rsg, 2)} ÷ ${fixed(r.rsg, 2)} × 100`],
    ['Protein score', fixed(P.protein, 2), `(${num(r.protein)} − 60) ÷ 30 × 100, kept between 0 and 100`],
    ['Fat & sodium score', P.clean == null ? '–' : fixed(P.clean, 2), P.clean == null ? 'skipped: sodium not on label' : `100 − 3 × ${num(r.fat)} − ${num(r.sodium)} ÷ 20`],
    ['Sugar score', P.sugar == null ? '–' : String(P.sugar), P.sugar == null ? 'skipped: sugar not on label' : 'lower sugar than others in the group scores higher'],
    ['Lab score', String(P.lab), esc(r.lab)],
    ['Overall score', r.score == null ? '–' : `<b>${fixed(r.score)}</b>`,
      r.score == null ? 'no price, so no overall score'
        : `(${used.map((p) => `${fixed(w[p.key], 2)}×${Math.round(P[p.key])}`).join(' + ')}) ÷ ${fixed(wsum, 2)}`],
    ['Overall rank', r.rank != null ? `#${r.rank}` : '–', r.rank != null ? `among ${rows.filter((o) => o.rank != null).length} confirmed-price whey products` : r.group === 'plant' ? `plant/yeast: #${r.typeRank} in type` : 'price not confirmed, so not ranked'],
  ];
  document.querySelector('#example-table tbody').innerHTML = steps
    .map(([a, b, c]) => `<tr><th class="sticky">${a}</th><td class="n">${b}</td><td class="small">${c}</td></tr>`)
    .join('');
}

/* ---------- Boot ---------- */
function renderAll() {
  renderTopTiles();
  renderTable();
  renderTrend();
  renderLiveNumbers();
  renderWeightsTable();
  renderExample();
}

recompute();
renderSliders();
bindFilters();
bindTrendChart();
renderAll();
document.addEventListener('tabchange', (e) => {
  if (e.detail === 'price-trend') drawTrendChart(trendItems());
});
tabs.goToHash();
