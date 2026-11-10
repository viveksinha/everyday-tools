import { initPage, initTabs, createPager, esc, inr, fixed } from '../assets/site.js';

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

const VERDICT_CHIP = { buy: 'good', budget: 'warn', skip: 'bad', mixed: 'na' };
const VERDICT_ICON = { buy: '✓', budget: '~', skip: '✕', mixed: '?' };
const verdictChip = (v) => `<span class="chip ${VERDICT_CHIP[v]}">${VERDICT_ICON[v]} ${esc(data.verdicts[v])}</span>`;
const catName = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));

const tile = (lab, value, sub, unit = '') =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

/* ---------- By supplement ---------- */
const catState = { verdict: 'all', open: new Set() };

function renderCatTiles() {
  const C = data.categories;
  const of = (v) => C.filter((c) => c.verdict === v);
  const b = data.brand_summary;
  document.getElementById('cat-tiles').innerHTML = [
    tile('Buy Carbamide Forte', String(of('buy').length), of('buy').map((c) => c.name).join(', '), `of ${C.length}`),
    tile('Only if price comes first', String(of('budget').length), of('budget').map((c) => c.name).join(', '), `of ${C.length}`),
    tile('Buy another brand', String(of('skip').length), of('skip').map((c) => c.name).join(', '), `of ${C.length}`),
    tile('Brand score', fixed(b.overall), `Transparency ${fixed(b.transparency)} · dosing ${fixed(b.dosing)} · value ${fixed(b.value)}`, '/ 10'),
  ].join('');
}

function renderVerdictSeg() {
  const counts = { all: data.categories.length };
  data.categories.forEach((c) => (counts[c.verdict] = (counts[c.verdict] || 0) + 1));
  const opts = [['all', 'All'], ['buy', 'Buy'], ['budget', 'Budget only'], ['skip', 'Buy another brand'], ['mixed', 'Reviews disagree']];
  document.getElementById('verdict-seg').innerHTML = opts
    .filter(([k]) => counts[k])
    .map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${catState.verdict === k}">${l} · ${counts[k]}</button>`)
    .join('');
}

function catRow(c) {
  const open = catState.open.has(c.id);
  return `<tr class="row${open ? ' open' : ''}" data-id="${c.id}" tabindex="0" aria-expanded="${open}">
    <td class="sticky"><div class="pname">${esc(c.name)}</div><div class="pflav">${esc(c.why[0])}</div></td>
    <td>${verdictChip(c.verdict)}</td>
    <td class="col-name">${esc(c.pick)}</td>
    <td class="n"><b>${fixed(c.pick_score)}</b></td>
    <td class="n">${inr(c.pick_cost, 2)}</td>
    <td>${esc(c.alternative)}${c.link ? `<div class="small"><a href="${esc(c.link.href)}">${esc(c.link.label)} →</a></div>` : ''}</td>
  </tr>${open ? catDetail(c) : ''}`;
}

function catDetail(c) {
  const comp = c.competitors.length
    ? `<table class="data" style="font-size:13px"><thead><tr><th>Brand</th><th>Product</th><th class="n">Price</th><th>Note</th></tr></thead><tbody>${c.competitors
      .map((x) => `<tr><td><b>${esc(x.brand)}</b></td><td>${esc(x.product)}</td><td class="n">${x.price ? `${esc(x.price)}<span class="muted small"> / ${esc(x.per)}</span>` : '<span class="muted">–</span>'}</td><td>${esc(x.note)}</td></tr>`)
      .join('')}</tbody></table>`
    : `<p class="small muted" style="margin:0">${c.link ? `See <a href="${esc(c.link.href)}">${esc(c.link.label)}</a>.` : 'The source notes compared no other brands here.'}</p>`;
  const skus = c.other_skus
    ? `<div class="group"><div class="label">Other Carbamide Forte versions</div><dl class="kv">${c.other_skus.map((s) => `<dt>${esc(s.product)}</dt><dd>${esc(s.cost)} · ${esc(s.dose)}</dd>`).join('')}</dl></div>`
    : '';
  return `<tr class="detail-row"><td class="detail" colspan="6"><div class="drawer" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
    <div style="display:grid;gap:14px;align-content:start">
      <div class="group" id="cat-${c.id}"><div class="label">Why</div><ul>${c.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
      ${skus}
    </div>
    <div class="group"><div class="label">Other brands compared</div><div class="table-wrap">${comp}</div></div>
  </div></td></tr>`;
}

const catBody = document.querySelector('#cat-table tbody');
function renderCats() {
  const list = data.categories.filter((c) => catState.verdict === 'all' || c.verdict === catState.verdict);
  catBody.innerHTML = list.map(catRow).join('');
  document.querySelectorAll('#verdict-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === catState.verdict)));
}

/* ---------- All products ---------- */
const prodState = { q: '', cat: 'all', sort: { key: 'score', dir: -1 }, limit: 15, open: new Set() };
const CATS = [...new Set(data.products.map((p) => p.category))];
const SORTS = {
  score: { get: (p) => p.score, dir: -1 },
  name: { get: (p) => p.name.toLowerCase(), dir: 1 },
  cost: { get: (p) => p.cost, dir: 1 },
  mrp: { get: (p) => p.mrp, dir: 1 },
};
const RATING_CHIP = { 'Highly recommended': 'good', Recommended: 'good-2', Average: 'warn', Skip: 'bad' };

function prodRow(p) {
  const open = prodState.open.has(p.id);
  return `<tr class="row${open ? ' open' : ''}" data-id="${p.id}" tabindex="0" aria-expanded="${open}">
    <td class="sticky col-name"><div class="pname">${esc(p.name)}</div>${p.flag ? '<div class="pflav" style="color:var(--serious)">! see note</div>' : ''}</td>
    <td>${esc(p.category)}${p.cat ? `<div class="small muted">${esc(catName[p.cat])}</div>` : ''}</td>
    <td><span class="chip ${RATING_CHIP[p.rating]}">${esc(p.rating)}</span></td>
    <td class="n"><div class="scorebar"><div class="track"><div class="fill" style="width:${p.score * 10}%"></div></div><b>${fixed(p.score)}</b></div></td>
    <td class="n"><b>${inr(p.cost, 2)}</b></td>
    <td class="n">${inr(p.mrp)}</td>
  </tr>${open ? `<tr class="detail-row"><td class="detail" colspan="6"><div class="drawer" style="grid-template-columns:1fr">
    <div class="group"><div class="label">Review summary</div><ul><li>${esc(p.review)}</li>${p.flag ? `<li><b>Note:</b> ${esc(p.flag)}</li>` : ''}${p.cat ? `<li><a href="#by-supplement" data-goto-cat="${p.cat}">How it compares with other brands →</a></li>` : ''}</ul></div>
  </div></td></tr>` : ''}`;
}

const prodBody = document.querySelector('#prod-table tbody');
const pager = createPager(document.getElementById('prod-pager'), {
  onMore: () => {
    prodState.limit += 15;
    renderProducts();
  },
});

function renderProducts() {
  const q = prodState.q.trim().toLowerCase();
  const { key, dir } = prodState.sort;
  const list = data.products
    .filter((p) => (prodState.cat === 'all' || p.category === prodState.cat) && (!q || `${p.name} ${p.category} ${catName[p.cat] || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => {
      const va = SORTS[key].get(a);
      const vb = SORTS[key].get(b);
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return dir * c || b.score - a.score;
    });
  const shown = list.slice(0, prodState.limit);
  prodBody.innerHTML = shown.length ? shown.map(prodRow).join('') : '<tr><td colspan="6"><div class="empty">Nothing matches.</div></td></tr>';
  pager.update(shown.length, list.length);
  document.getElementById('prod-hint').textContent = `${list.length} of ${data.products.length} · 15 at a time · click a row for the review`;
  document.querySelectorAll('#prod-table th[data-key]').forEach((th) => {
    const on = th.dataset.key === key;
    if (on) th.setAttribute('aria-sort', dir < 0 ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
    th.querySelector('.arrow').textContent = on ? (dir < 0 ? '↓' : '↑') : '↕';
  });
}

document.getElementById('prod-seg').innerHTML = [['all', `All · ${data.products.length}`], ...CATS.map((c) => [c, `${c} · ${data.products.filter((p) => p.category === c).length}`])]
  .map(([k, l]) => `<button type="button" data-c="${esc(k)}" aria-pressed="${k === 'all'}">${esc(l)}</button>`)
  .join('');

/* ---------- Events ---------- */
function bindRows(body, set, render) {
  const toggle = (tr) => {
    const id = tr.dataset.id;
    if (set.has(id)) set.delete(id);
    else set.add(id);
    render();
    return id;
  };
  body.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr.row');
    if (tr) toggle(tr);
  });
  body.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) {
      e.preventDefault();
      const id = toggle(e.target);
      body.querySelector(`tr.row[data-id="${id}"]`)?.focus();
    }
  });
}
bindRows(catBody, catState.open, renderCats);
bindRows(prodBody, prodState.open, renderProducts);

document.getElementById('verdict-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  catState.verdict = b.dataset.v;
  renderCats();
});
document.getElementById('prod-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  prodState.cat = b.dataset.c;
  prodState.limit = 15;
  document.querySelectorAll('#prod-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderProducts();
});
document.getElementById('prod-q').addEventListener('input', (e) => {
  prodState.q = e.target.value;
  prodState.limit = 15;
  renderProducts();
});
document.querySelectorAll('#prod-table th[data-key]').forEach((th) =>
  th.querySelector('.sort-btn').addEventListener('click', () => {
    const key = th.dataset.key;
    prodState.sort = prodState.sort.key === key ? { key, dir: -prodState.sort.dir } : { key, dir: SORTS[key].dir };
    prodState.limit = 15;
    renderProducts();
  }),
);
// "How it compares" link in a product row: open that supplement's row on the first tab.
prodBody.addEventListener('click', (e) => {
  const a = e.target.closest('[data-goto-cat]');
  if (!a) return;
  e.preventDefault();
  const id = a.dataset.gotoCat;
  catState.verdict = 'all';
  catState.open.add(id);
  renderCats();
  tabs.activate('by-supplement', true);
  document.querySelector(`#cat-table tr.row[data-id="${id}"]`)?.scrollIntoView({ block: 'center' });
});

document.getElementById('sources').innerHTML = data.sources
  .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`)
  .join('');

// #cat-<id> deep links: open that row before the tab router scrolls to it.
function openFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h.startsWith('cat-') || catState.open.has(h.slice(4))) return;
  catState.open.add(h.slice(4));
  renderCats();
  tabs.goToHash();
}
const h = decodeURIComponent(location.hash.slice(1));
if (h.startsWith('cat-')) catState.open.add(h.slice(4));
window.addEventListener('hashchange', openFromHash);

renderCatTiles();
renderVerdictSeg();
renderCats();
renderProducts();
tabs.goToHash();
