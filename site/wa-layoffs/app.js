import { initPage, initTabs, createPager, createTooltip, esc, pct } from '../assets/site.js';

initPage();
const tabs = initTabs();
const tip = createTooltip();

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

/* ---------- Dates and numbers (US locale: this is US data) ---------- */
const n0 = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '–');
const DAY = 86400000;
const asDate = (iso) => (iso ? new Date(`${iso}T00:00:00`) : null);
const fmtDate = (iso) => (iso ? asDate(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const fmtMonth = (ym, short = false) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "Today" for the 12-month windows is the day the data was fetched, so the
// tiles don't drift when the page is read weeks after a refresh.
const asOf = asDate(data.fetched_at);
const todayIso = iso(new Date());
const minus = (d, months) => { const x = new Date(d); x.setMonth(x.getMonth() - months); return iso(x); };
const cut12 = minus(asOf, 12);
const cut24 = minus(asOf, 24);

const N = data.notices.map((r, i) => ({ ...r, id: i, workers: r.workers ?? 0 }));
const inLast12 = (r) => r.received > cut12;

// Group by company. Light normalisation so "Expedia, Inc." and "Expedia Inc" match.
const coKey = (s) => s.toLowerCase().replace(/[.,]/g, ' ').replace(/\b(inc|llc|l l c|corp|corporation|co|ltd|lp|pllc)\b/g, '').replace(/\s+/g, ' ').trim();

document.getElementById('fetched-chip').textContent = `Data as of ${fmtDate(data.fetched_at)}`;
document.getElementById('source-chip').href = data.source_url;

const tile = (lab, value, sub, unit = '') =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;
const sum = (rows) => rows.reduce((s, r) => s + r.workers, 0);

/* ---------- Overview tiles ---------- */
function renderTiles() {
  const last = N.filter(inLast12);
  const prev = N.filter((r) => r.received > cut24 && r.received <= cut12);
  const w1 = sum(last);
  const w0 = sum(prev);
  const big = [...last].sort((a, b) => b.workers - a.workers)[0];
  const closures = last.filter((r) => r.kind === 'Closure');
  const soon = N.filter((r) => r.start && r.start >= todayIso && (asDate(r.start) - new Date()) / DAY <= 90);
  document.getElementById('ov-tiles').innerHTML = [
    tile('Workers, last 12 months', n0(w1), `${w0 ? pct(w1 / w0 - 1, 0) : '–'} vs the 12 months before (${n0(w0)})`),
    tile('Notices, last 12 months', n0(last.length), `${prev.length ? pct(last.length / prev.length - 1, 0) : '–'} vs ${n0(prev.length)} the year before`),
    big ? tile('Largest notice', n0(big.workers), `${big.company} · filed ${fmtDate(big.received)}`, 'workers') : '',
    tile('Closures, last 12 months', n0(closures.length), `${n0(sum(closures))} workers at sites shutting down`),
    tile('Starting in the next 90 days', n0(sum(soon)), `${soon.length} notice${soon.length === 1 ? '' : 's'} with a start date ahead`, 'workers'),
  ].join('');
}

/* ---------- Monthly chart ---------- */
const chartState = { metric: 'workers' };
function months() {
  const by = new Map();
  N.forEach((r) => {
    if (!r.received) return;
    const ym = r.received.slice(0, 7);
    if (!by.has(ym)) by.set(ym, []);
    by.get(ym).push(r);
  });
  // Continuous range from the first month with at least 3 notices (the
  // earliest years only hold stragglers) up to the fetch month.
  const keys = [...by.keys()].sort();
  const start = keys.find((k) => by.get(k).length >= 3) || keys[0];
  const out = [];
  const d = new Date(`${start}-01T00:00:00`);
  const end = data.fetched_at.slice(0, 7);
  while (iso(d).slice(0, 7) <= end) {
    const ym = iso(d).slice(0, 7);
    const rows = by.get(ym) || [];
    const top = [...rows].sort((a, b) => b.workers - a.workers)[0];
    out.push({ ym, notices: rows.length, workers: sum(rows), top });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}
const MONTHS = months();

function niceStep(max, target = 4) {
  const raw = max / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

function drawMonthChart() {
  const host = document.getElementById('month-chart');
  const W = host.clientWidth;
  if (!W) return;
  const key = chartState.metric;
  const H = W < 640 ? 220 : 280;
  const left = 46;
  const right = 6;
  const top = 12;
  const bottom = 26;
  const max = Math.max(...MONTHS.map((m) => m[key]), 1);
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const plotW = W - left - right;
  const bw = plotW / MONTHS.length;
  const gap = bw > 8 ? 2 : 1;
  const y = (v) => top + (H - top - bottom) * (1 - v / yMax);
  const fmtK = (v) => (v >= 1000 ? `${v / 1000}k` : String(v));
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><g class="axis">`;
  for (let v = 0; v <= yMax; v += step) {
    svg += `<line class="gridline" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${fmtK(v)}</text>`;
  }
  MONTHS.forEach((m, i) => {
    if (m.ym.endsWith('-01')) svg += `<text x="${left + i * bw + 1}" y="${H - 6}">${m.ym.slice(0, 4)}</text><line x1="${left + i * bw}" x2="${left + i * bw}" y1="${H - bottom}" y2="${H - bottom + 5}" stroke="var(--rule-strong)"/>`;
  });
  svg += '</g>';
  MONTHS.forEach((m, i) => {
    const v = m[key];
    const x = left + i * bw + gap / 2;
    const w = Math.max(1, bw - gap);
    const h = (H - top - bottom) * (v / yMax);
    const t = `<b>${esc(fmtMonth(m.ym))}</b><br>${n0(m.workers)} workers · ${m.notices} notice${m.notices === 1 ? '' : 's'}${m.top ? `<br><span class="muted">Largest: ${esc(m.top.company)} (${n0(m.top.workers)})</span>` : ''}`;
    // Column with 4px rounded top, square at the baseline; full-height hit area for hover.
    const r = Math.min(4, w / 2, h);
    const yb = H - bottom;
    const path = h > 0
      ? `M${x},${yb}V${yb - h + r}Q${x},${yb - h} ${x + r},${yb - h}H${x + w - r}Q${x + w},${yb - h} ${x + w},${yb - h + r}V${yb}Z`
      : '';
    svg += `<g data-tip="${esc(t)}"><rect x="${left + i * bw}" y="${top}" width="${bw}" height="${H - top - bottom}" fill="transparent"/>${path ? `<path d="${path}" fill="var(--s1)"/>` : ''}</g>`;
  });
  host.innerHTML = `${svg}</svg>`;
}

function renderMonthTable() {
  document.querySelector('#month-table tbody').innerHTML = [...MONTHS]
    .reverse()
    .map((m) => `<tr><td class="sticky">${esc(fmtMonth(m.ym, true))}</td><td class="n">${m.notices}</td><td class="n"><b>${n0(m.workers)}</b></td><td>${m.top ? `${esc(m.top.company)} <span class="muted">· ${n0(m.top.workers)}</span>` : '<span class="muted">–</span>'}</td></tr>`)
    .join('');
}

/* ---------- Bar lists ---------- */
function companies(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const k = coKey(r.company);
    if (!by.has(k)) by.set(k, { key: k, rows: [] });
    by.get(k).rows.push(r);
  });
  return [...by.values()].map((c) => {
    const sorted = [...c.rows].sort((a, b) => (b.received || '').localeCompare(a.received || ''));
    return {
      key: c.key,
      name: sorted[0].company,
      rows: sorted,
      count: sorted.length,
      workers: sum(sorted),
      largest: Math.max(...sorted.map((r) => r.workers)),
      closures: sorted.filter((r) => r.kind === 'Closure').length,
      latest: sorted[0].received,
      first: sorted[sorted.length - 1].received,
    };
  });
}

const barRow = (label, sub, value, max, href) =>
  `<a class="bar-row" href="${href}"><span class="bl-label"><b>${esc(label)}</b><span class="muted small">${esc(sub)}</span></span>
   <span class="bl-track"><span class="bl-fill" style="width:${Math.max(1.5, (value / max) * 100)}%"></span></span><span class="bl-val">${n0(value)}</span></a>`;

const topState = { period: '12' };
function renderTop() {
  const rows = topState.period === '12' ? N.filter(inLast12) : N;
  const list = companies(rows).sort((a, b) => b.workers - a.workers).slice(0, 10);
  const max = list[0]?.workers || 1;
  document.getElementById('top-list').innerHTML = list
    .map((c) => barRow(c.name, `${c.count} notice${c.count === 1 ? '' : 's'}`, c.workers, max, `#companies`))
    .join('');
  document.getElementById('top-list').querySelectorAll('.bar-row').forEach((a, i) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openCompany(list[i].key, topState.period);
    }),
  );
}

function renderSoon() {
  const soon = N.filter((r) => r.start && r.start >= todayIso && (asDate(r.start) - new Date()) / DAY <= 90).sort((a, b) => a.start.localeCompare(b.start));
  const max = Math.max(...soon.map((r) => r.workers), 1);
  const el = document.getElementById('soon-list');
  el.innerHTML = soon.length
    ? soon.slice(0, 10).map((r) => barRow(r.company, `starts ${fmtDate(r.start)} · ${r.location}`, r.workers, max, r.pdf || '#notices')).join('') +
      (soon.length > 10 ? `<a class="small" href="#notices" id="soon-more">All ${soon.length} upcoming notices →</a>` : '')
    : '<div class="empty">No notices with a start date in the next 90 days.</div>';
  el.querySelectorAll('.bar-row').forEach((a) => { if (a.getAttribute('href').startsWith('http')) { a.target = '_blank'; a.rel = 'noopener'; } });
  document.getElementById('soon-more')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('n-future').checked = true;
    nState.future = true;
    nState.sort = { key: 'start', dir: 1 };
    renderNotices();
    tabs.activate('notices', true);
  });
}

/* ---------- Notices table ---------- */
const nState = { q: '', kind: 'all', year: 'all', future: false, sort: { key: 'received', dir: -1 }, limit: 15 };
const N_SORTS = {
  received: { get: (r) => r.received || '', dir: -1 },
  company: { get: (r) => r.company.toLowerCase(), dir: 1 },
  workers: { get: (r) => r.workers, dir: -1 },
  start: { get: (r) => r.start || '', dir: -1 },
};
const years = [...new Set(N.map((r) => r.received?.slice(0, 4)).filter(Boolean))].sort().reverse();
document.getElementById('n-year').innerHTML = `<option value="all">All years</option>${years.map((y) => `<option value="${y}">Filed in ${y}</option>`).join('')}`;

const kindChip = (r) =>
  `<span class="chip ${r.kind === 'Closure' ? 'serious' : 'na'}">${esc(r.kind || '–')}</span>${r.duration && r.duration !== 'Permanent' ? `<div class="small muted">${esc(r.duration)}</div>` : ''}`;
const pdfLink = (r) => (r.pdf ? `<a href="${esc(r.pdf)}" target="_blank" rel="noopener">PDF ↗</a>` : '<span class="muted">–</span>');

function noticeRow(r) {
  const future = r.start && r.start >= todayIso;
  return `<tr><td class="n">${fmtDate(r.received)}</td>
    <td class="sticky col-name"><b>${esc(r.company)}</b></td>
    <td>${esc(r.location)}</td>
    <td class="n"><b>${n0(r.workers)}</b></td>
    <td>${kindChip(r)}</td>
    <td class="n">${fmtDate(r.start)}${future ? '<div class="small" style="color:var(--accent)">upcoming</div>' : ''}</td>
    <td>${pdfLink(r)}</td></tr>`;
}

const nPager = createPager(document.getElementById('n-pager'), { onMore: () => { nState.limit += 15; renderNotices(); } });
function renderNotices() {
  const q = nState.q.trim().toLowerCase();
  const { key, dir } = nState.sort;
  const list = N.filter((r) =>
    (nState.kind === 'all' || r.kind === nState.kind) &&
    (nState.year === 'all' || r.received?.startsWith(nState.year)) &&
    (!nState.future || (r.start && r.start >= todayIso)) &&
    (!q || `${r.company} ${r.location}`.toLowerCase().includes(q)),
  ).sort((a, b) => {
    const va = N_SORTS[key].get(a);
    const vb = N_SORTS[key].get(b);
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return dir * c || (b.received || '').localeCompare(a.received || '');
  });
  const shown = list.slice(0, nState.limit);
  document.querySelector('#n-table tbody').innerHTML = shown.length ? shown.map(noticeRow).join('') : '<tr><td colspan="7"><div class="empty">No notices match.</div></td></tr>';
  nPager.update(shown.length, list.length);
  document.getElementById('n-hint').textContent = `${n0(list.length)} notices · ${n0(sum(list))} workers · 15 at a time`;
  syncSortHeads('#n-table', nState.sort);
}

/* ---------- Companies table ---------- */
const cState = { q: '', period: 'all', sort: { key: 'workers', dir: -1 }, limit: 15, open: new Set() };
const C_SORTS = {
  name: { get: (c) => c.name.toLowerCase(), dir: 1 },
  workers: { get: (c) => c.workers, dir: -1 },
  count: { get: (c) => c.count, dir: -1 },
  largest: { get: (c) => c.largest, dir: -1 },
  latest: { get: (c) => c.latest || '', dir: -1 },
};
function companyRow(c) {
  const open = cState.open.has(c.key);
  return `<tr class="row${open ? ' open' : ''}" data-id="${esc(c.key)}" tabindex="0" aria-expanded="${open}">
    <td class="sticky col-name"><b>${esc(c.name)}</b><div class="pflav">${esc([...new Set(c.rows.map((r) => r.location))].slice(0, 3).join(' · '))}</div></td>
    <td class="n"><b>${n0(c.workers)}</b></td>
    <td class="n">${c.count}</td>
    <td class="n">${n0(c.largest)}</td>
    <td class="n">${c.closures || '<span class="muted">0</span>'}</td>
    <td class="n">${fmtDate(c.latest)}</td>
  </tr>${open ? `<tr class="detail-row"><td class="detail" colspan="6"><div class="table-wrap"><table class="data" style="font-size:13px"><thead><tr><th class="n">Filed</th><th>Location</th><th class="n">Workers</th><th>Type</th><th class="n">Starts</th><th>Notice</th></tr></thead><tbody>${c.rows
    .map((r) => `<tr><td class="n">${fmtDate(r.received)}</td><td>${esc(r.location)}</td><td class="n"><b>${n0(r.workers)}</b></td><td>${kindChip(r)}</td><td class="n">${fmtDate(r.start)}</td><td>${pdfLink(r)}</td></tr>`)
    .join('')}</tbody></table></div></td></tr>` : ''}`;
}
const cPager = createPager(document.getElementById('c-pager'), { onMore: () => { cState.limit += 15; renderCompanies(); } });
function renderCompanies() {
  const q = cState.q.trim().toLowerCase();
  const { key, dir } = cState.sort;
  const list = companies(cState.period === '12' ? N.filter(inLast12) : N)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.key.includes(q))
    .sort((a, b) => {
      const va = C_SORTS[key].get(a);
      const vb = C_SORTS[key].get(b);
      const x = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return dir * x || b.workers - a.workers;
    });
  const shown = list.slice(0, cState.limit);
  document.querySelector('#c-table tbody').innerHTML = shown.length ? shown.map(companyRow).join('') : '<tr><td colspan="6"><div class="empty">No companies match.</div></td></tr>';
  cPager.update(shown.length, list.length);
  document.getElementById('c-hint').textContent = `${n0(list.length)} employers · click one for its notices · 15 at a time`;
  syncSortHeads('#c-table', cState.sort);
}
function openCompany(key, period) {
  cState.period = period === '12' ? '12' : 'all';
  cState.q = '';
  document.getElementById('c-q').value = '';
  document.querySelectorAll('#c-period button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === cState.period)));
  cState.open.add(key);
  cState.sort = { key: 'workers', dir: -1 };
  cState.limit = 15;
  renderCompanies();
  tabs.activate('companies', true);
  const row = document.querySelector(`#c-table tr.row[data-id="${CSS.escape(key)}"]`);
  row?.scrollIntoView({ block: 'center' });
}

/* ---------- Shared bits ---------- */
function syncSortHeads(sel, { key, dir }) {
  document.querySelectorAll(`${sel} th[data-key]`).forEach((th) => {
    const on = th.dataset.key === key;
    if (on) th.setAttribute('aria-sort', dir < 0 ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
    th.querySelector('.arrow').textContent = on ? (dir < 0 ? '↓' : '↑') : '↕';
  });
}
function bindSort(sel, state, sorts, render) {
  document.querySelectorAll(`${sel} th[data-key]`).forEach((th) =>
    th.querySelector('.sort-btn').addEventListener('click', () => {
      const key = th.dataset.key;
      state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: sorts[key].dir };
      state.limit = 15;
      render();
    }),
  );
}
function bindSeg(id, fn) {
  document.getElementById(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fn(b);
  });
}

bindSort('#n-table', nState, N_SORTS, renderNotices);
bindSort('#c-table', cState, C_SORTS, renderCompanies);
bindSeg('metric-seg', (b) => { chartState.metric = b.dataset.m; document.querySelector('#by-month h3').firstChild.textContent = b.dataset.m === 'workers' ? 'Workers in notices filed each month' : 'Notices filed each month'; drawMonthChart(); });
bindSeg('top-seg', (b) => { topState.period = b.dataset.p; renderTop(); });
bindSeg('n-kind', (b) => { nState.kind = b.dataset.k; nState.limit = 15; renderNotices(); });
bindSeg('c-period', (b) => { cState.period = b.dataset.p; cState.limit = 15; renderCompanies(); });
document.getElementById('n-year').addEventListener('change', (e) => { nState.year = e.target.value; nState.limit = 15; renderNotices(); });
document.getElementById('n-future').addEventListener('change', (e) => { nState.future = e.target.checked; nState.limit = 15; renderNotices(); });
document.getElementById('n-q').addEventListener('input', (e) => { nState.q = e.target.value; nState.limit = 15; renderNotices(); });
document.getElementById('c-q').addEventListener('input', (e) => { cState.q = e.target.value; cState.limit = 15; renderCompanies(); });

const cBody = document.querySelector('#c-table tbody');
const toggleCo = (tr) => {
  const id = tr.dataset.id;
  if (cState.open.has(id)) cState.open.delete(id);
  else cState.open.add(id);
  renderCompanies();
  return id;
};
cBody.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const tr = e.target.closest('tr.row');
  if (tr) toggleCo(tr);
});
cBody.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) {
    e.preventDefault();
    const id = toggleCo(e.target);
    cBody.querySelector(`tr.row[data-id="${CSS.escape(id)}"]`)?.focus();
  }
});

const chartHost = document.getElementById('month-chart');
chartHost.addEventListener('pointermove', (e) => {
  const g = e.target.closest('[data-tip]');
  if (g) tip.show(g.dataset.tip, e.clientX, e.clientY);
  else tip.hide();
});
chartHost.addEventListener('pointerleave', () => tip.hide());
let lastW = 0;
new ResizeObserver(() => {
  if (chartHost.clientWidth && chartHost.clientWidth !== lastW) {
    lastW = chartHost.clientWidth;
    drawMonthChart();
  }
}).observe(chartHost);
document.addEventListener('tabchange', (e) => { if (e.detail === 'overview') drawMonthChart(); });

renderTiles();
renderMonthTable();
renderTop();
renderSoon();
renderNotices();
renderCompanies();
tabs.goToHash();
drawMonthChart();
