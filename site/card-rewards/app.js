import { initPage, initTabs, inr, esc } from '../assets/site.js';

initPage();
initTabs();

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

const $ = (id) => document.getElementById(id);
const VOUCHER_RATE = 0.2;
const key = (s) => s.replace(/[^a-z0-9]/gi, '');

const cards = data.cards;
let card = cards[0];
const spend = {};
const alloc = {};

/* ---------- Rules engine ---------- */
// Points are awarded on whole ₹200 blocks within each slab, as the statement does.
function blocks(amount, rate) {
  return Math.floor(amount / rate.per) * rate.pts;
}

function compute(c, s, climit) {
  let eligible = 0;
  for (const cat of c.categories) {
    const amt = +(s[cat.id] || 0);
    if (cat.mode === 'eligible') eligible += amt;
    else if (cat.mode === 'capped') eligible += Math.min(amt, cat.cap);
  }
  const te = +(s.travelEdge || 0);
  const slabs = [];

  const baseAmt = Math.min(eligible, c.accelThreshold);
  const accelAmt = Math.min(Math.max(eligible - c.accelThreshold, 0), Math.max(climit, 0));
  const overAmt = Math.max(eligible - c.accelThreshold - Math.max(climit, 0), 0);
  const teHi = Math.min(te, c.travel.hiCap);
  const teLo = Math.max(te - c.travel.hiCap, 0);

  if (baseAmt) slabs.push(['Eligible spend to ₹1.5L', baseAmt, '12/₹200', blocks(baseAmt, c.baseRate)]);
  if (accelAmt) slabs.push(['Accelerated above ₹1.5L', accelAmt, '35/₹200', blocks(accelAmt, c.accelRate)]);
  if (overAmt) slabs.push(['Past limit + ₹1.5L', overAmt, '12/₹200', blocks(overAmt, c.baseRate)]);
  if (teHi) slabs.push(['Travel EDGE to ₹2L', teHi, '60/₹200', blocks(teHi, c.travel.hi)]);
  if (teLo) slabs.push(['Travel EDGE above ₹2L', teLo, '35/₹200', blocks(teLo, c.travel.lo)]);

  return {
    points: slabs.reduce((a, x) => a + x[3], 0),
    slabs,
    eligible: eligible + te,
    accelAmt,
    overAmt,
  };
}

/* ---------- Build ---------- */
function buildCard() {
  $('card').innerHTML = cards.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('card').value = card.id;
  $('card-chip').textContent = cards.length === 1 ? '1 card' : `${cards.length} cards`;
  $('updated-chip').textContent = 'Rules ' + new Date(data.updated).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  $('rules-note').textContent = card.rulesNote;
  $('val-note').textContent = data.valuationSource;
  $('voucher-rate').textContent = inr(VOUCHER_RATE, 2);

  $('cats').innerHTML = card.categories
    .map((c) => {
      spend[c.id] = c.amt || 0;
      return `<div class="ledger-row${c.mode === 'excluded' ? ' off' : ''}">
        <span class="nm"><b>${esc(c.label)}</b><span class="small muted">${esc(c.note)}</span></span>
        <input class="input-num" type="number" id="cat_${esc(c.id)}" min="0" step="1000" value="${c.amt || 0}">
      </div>`;
    })
    .join('');
  for (const c of card.categories) {
    $('cat_' + c.id).addEventListener('input', (e) => {
      spend[c.id] = +e.target.value || 0;
      render();
    });
  }

  buildPartners();
  buildSources();
  render();
}

function partnerRow(p) {
  const k = key(p.n);
  alloc[p.n] = 0;
  return `<div class="prow">
    <span class="pn">${esc(p.n)}${p.note ? ` <span class="chip warn" style="font-size:10.5px;line-height:16px">${esc(p.note)}</span>` : ''}</span>
    <input class="cell-input" type="number" id="pt_${k}" min="0" step="5000" value="0">
    <input class="cell-input" type="number" id="rt_${k}" min="0" step="0.05" value="${p.v.toFixed(2)}">
    <span class="pv" id="pv_${k}"></span>
  </div>`;
}

function buildPartners() {
  for (const g of ['A', 'B']) {
    $('list-' + g.toLowerCase()).innerHTML = card.partners.filter((p) => p.g === g).map(partnerRow).join('');
  }
  for (const p of card.partners) {
    const k = key(p.n);
    $('pt_' + k).addEventListener('input', (e) => {
      alloc[p.n] = +e.target.value || 0;
      render();
    });
    $('rt_' + k).addEventListener('input', render);
  }
}

const SRC_LABEL = { tpg: 'TPG Nov 2026', programme: 'Programme terms', est: 'Estimate' };

function buildSources() {
  $('src-rows').innerHTML = [...card.partners]
    .sort((a, b) => b.r * b.v - a.r * a.v)
    .map(
      (p) => `<tr${p.src === 'est' ? ' class="dim"' : ''}>
        <td>${esc(p.n)}</td><td>${p.g}</td><td class="n">${p.r === 0.8 ? '5:4' : '5:2'}</td>
        <td class="n">${inr(p.v, 2)}</td><td class="n"><b>${inr(p.r * p.v, 2)}</b></td>
        <td>${SRC_LABEL[p.src] || '—'}</td>
      </tr>`
    )
    .join('');
}

/* ---------- Allocation ---------- */
const rateFor = (p) => {
  const el = $('rt_' + key(p.n));
  return el ? +el.value || 0 : p.v;
};

function setAlloc(map) {
  for (const p of card.partners) {
    const v = map[p.n] || 0;
    alloc[p.n] = v;
    $('pt_' + key(p.n)).value = v;
  }
  render();
}

// Fill the highest ₹-per-EDGE-point partner in each group, respecting each
// group's cap and any ceiling the partner imposes on its own inbound transfers.
function autoAllocate(ptsYear) {
  const cap = card.transferCap;
  const map = {};
  let left = Math.min(ptsYear, cap.total);
  for (const [g, capKey] of [['A', 'groupA'], ['B', 'groupB']]) {
    let room = Math.min(cap[capKey], left);
    const ranked = card.partners.filter((p) => p.g === g).sort((a, b) => b.r * rateFor(b) - a.r * rateFor(a));
    for (const p of ranked) {
      if (room <= 0) break;
      const take = Math.min(room, p.capPts || Infinity);
      map[p.n] = take;
      room -= take;
      left -= take;
    }
  }
  setAlloc(map);
}

function renderAlloc(ptsYear, annualSpend, annualEligible) {
  const cap = card.transferCap;
  let sumA = 0, sumB = 0, transferValue = 0;

  for (const p of card.partners) {
    const pts = alloc[p.n] || 0;
    if (p.g === 'A') sumA += pts; else sumB += pts;
    const v = pts * p.r * rateFor(p);
    transferValue += v;
    $('pv_' + key(p.n)).textContent = pts ? inr(v) : '';
  }

  for (const [g, used, max] of [['a', sumA, cap.groupA], ['b', sumB, cap.groupB]]) {
    $(`cap-${g}-txt`).textContent = `${used.toLocaleString('en-IN')} / ${max / 100000}L`;
    const bar = $(`cap-${g}-bar`);
    bar.style.width = Math.min((used / max) * 100, 100) + '%';
    bar.className = 'capfill' + (used > max ? ' over' : '');
  }

  const allocated = sumA + sumB;
  const leftover = Math.max(ptsYear - allocated, 0);
  const total = transferValue + leftover * VOUCHER_RATE;

  $('plan-tiles').innerHTML = [
    ['Allocated', allocated.toLocaleString('en-IN'), `of ${ptsYear.toLocaleString('en-IN')} earned`],
    ['Left to vouchers', leftover.toLocaleString('en-IN'), inr(leftover * VOUCHER_RATE)],
    ['Redemption value', inr(total), 'before the annual fee'],
    ['Return on total spend', annualSpend ? ((total / annualSpend) * 100).toFixed(2) + '%' : '–', 'everything you charged'],
    ['Return on rewarded spend', annualEligible ? ((total / annualEligible) * 100).toFixed(2) + '%' : '–', 'excluding dead categories'],
  ]
    .map(([l, v, s]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`)
    .join('');

  const notes = [];
  if (sumA > cap.groupA) notes.push(['bad', `Group A is over its ${cap.groupA / 100000} lakh cap by ${(sumA - cap.groupA).toLocaleString('en-IN')} points.`]);
  if (sumB > cap.groupB) notes.push(['bad', `Group B is over its ${cap.groupB / 100000} lakh cap by ${(sumB - cap.groupB).toLocaleString('en-IN')} points.`]);
  if (allocated > ptsYear) notes.push(['bad', `That's ${(allocated - ptsYear).toLocaleString('en-IN')} more points than you earn in a year.`]);
  else if (leftover > 0) notes.push(['', `${leftover.toLocaleString('en-IN')} points fall back to vouchers — ${inr(leftover * VOUCHER_RATE)}.`]);
  $('alloc-notes').innerHTML = notes.map(([c, t]) => `<p class="small ${c ? 'chip ' + c : 'muted'}" style="margin:0">${esc(t)}</p>`).join('');

  return total;
}

/* ---------- Render ---------- */
function render() {
  const climit = +$('climit').value || 0;
  const oneoff = +$('oneoff').value || 0;
  const oneoffN = Math.max(0, Math.min(12, +$('oneoff-n').value || 0));

  const base = compute(card, spend, climit);
  let eventOut = null;
  if (oneoff > 0 && oneoffN > 0) {
    const evSpend = { ...spend, retail: (+spend.retail || 0) + oneoff };
    eventOut = compute(card, evSpend, climit);
  }

  const monthSpend = card.categories.reduce((a, c) => a + (+spend[c.id] || 0), 0);
  $('tot-spend').textContent = inr(monthSpend);

  const ptsYear = eventOut ? base.points * (12 - oneoffN) + eventOut.points * oneoffN : base.points * 12;
  const annualSpend = monthSpend * 12 + (eventOut ? oneoff * oneoffN : 0);
  const annualEligible = eventOut ? base.eligible * (12 - oneoffN) + eventOut.eligible * oneoffN : base.eligible * 12;

  const planValue = renderAlloc(ptsYear, annualSpend, annualEligible);
  const anyAlloc = Object.values(alloc).some((v) => v > 0);
  // With no transfer plan set, value everything at the voucher floor rather than guessing.
  const grossYear = anyAlloc ? planValue : ptsYear * VOUCHER_RATE;

  const fullFee = Math.round(card.feeBase * (1 + card.gst));
  const mode = $('fee-mode').value;
  const waived = card.feeWaiver && annualEligible >= card.feeWaiver;
  const fee = mode === '0' ? 0 : mode === '1' ? fullFee : waived ? 0 : fullFee;

  $('earn-tiles').innerHTML = [
    ['Points a month', base.points.toLocaleString('en-IN'), card.pointName],
    ['Points a year', ptsYear.toLocaleString('en-IN'), oneoffN ? `includes ${oneoffN} one-off month${oneoffN > 1 ? 's' : ''}` : 'twelve ordinary months'],
    ['Rewarded spend', inr(annualEligible), `of ${inr(annualSpend)} charged`],
    ['Net value', inr(grossYear - fee), anyAlloc ? 'from your transfer plan' : 'at voucher rates — set a plan'],
  ]
    .map(([l, v, s]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`)
    .join('');

  $('slab-rows').innerHTML = base.slabs.length
    ? base.slabs.map(([l, a, r, p]) => `<tr><td>${l}</td><td class="n">${inr(a)}</td><td class="n">${r}</td><td class="n"><b>${p.toLocaleString('en-IN')}</b></td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">No rewarded spend yet.</td></tr>';

  $('year-kv').innerHTML = [
    ['Gross value', inr(grossYear)],
    ['Annual fee', fee ? '−' + inr(fee) : '₹0'],
    ['Net value', inr(grossYear - fee)],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');

  const yn = [];
  if (card.feeWaiver && mode === 'auto') {
    yn.push([
      waived ? 'good' : 'warn',
      waived
        ? `Fee waived — ${inr(annualEligible)} of eligible spend clears the ${inr(card.feeWaiver)} threshold.`
        : `${inr(card.feeWaiver - annualEligible)} short of the fee waiver. Excluded categories don't count toward it.`,
    ]);
  }
  if (base.overAmt > 0) yn.push(['warn', `${inr(base.overAmt)} a month falls past limit + ₹1.5L and earns the base rate.`]);
  else if (base.accelAmt > 0) yn.push(['good', `${inr(base.accelAmt)} a month earns at the accelerated rate.`]);
  $('year-notes').innerHTML = yn.map(([c, t]) => `<span class="chip ${c}">${esc(t)}</span>`).join('');

  const on = [];
  if (eventOut) {
    const extra = eventOut.points - base.points;
    on.push(['', `Each payment adds ${extra.toLocaleString('en-IN')} ${card.pointName}.`]);
    const past = Math.max(eventOut.overAmt - base.overAmt, 0);
    if (past > 0) on.push(['warn', `${inr(past)} of each payment earns only the base rate. Splitting it across two calendar months would move most of it into the accelerated slab.`]);
    if (oneoff > climit) on.push(['warn', 'The payment is larger than the credit limit, so it needs an enhancement or a split.']);
  }
  $('oneoff-notes').innerHTML = on.map(([c, t]) => `<span class="chip ${c || 'outline'}">${esc(t)}</span>`).join('');
}

/* ---------- Wiring ---------- */
$('card').addEventListener('change', (e) => {
  card = cards.find((c) => c.id === e.target.value) || cards[0];
  buildCard();
});
for (const id of ['climit', 'oneoff', 'oneoff-n']) $(id).addEventListener('input', render);
$('fee-mode').addEventListener('change', render);
$('fill-btn').addEventListener('click', () => {
  for (const c of card.categories) {
    spend[c.id] = c.amt || 0;
    $('cat_' + c.id).value = c.amt || 0;
  }
  render();
});
$('clear-btn').addEventListener('click', () => {
  for (const c of card.categories) {
    spend[c.id] = 0;
    $('cat_' + c.id).value = 0;
  }
  render();
});
$('alloc-auto').addEventListener('click', () => {
  const pts = +$('earn-tiles').querySelectorAll('.value')[1].textContent.replace(/[^0-9]/g, '') || 0;
  autoAllocate(pts);
});
$('alloc-clear').addEventListener('click', () => setAlloc({}));

buildCard();
