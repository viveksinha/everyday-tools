import { initPage, initTabs, initShareChips, createTooltip, esc, inr, num, fixed } from '../assets/site.js';

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

const CARDS = data.cards;
const GST = data.gst;

/* ---------- Spend categories (URL key, label, default ₹/month) ---------- */
const CATS = [
  { k: 'general', q: 'g', label: 'General spend', hint: 'Online and offline shopping', def: 60000 },
  { k: 'portal', q: 'p', label: 'Bank travel portal', hint: 'SmartBuy, Travel EDGE, iShop, Travel with Points', def: 10000 },
  { k: 'travel', q: 't', label: 'Other travel', hint: 'Airlines, hotels, OTAs direct', def: 10000 },
  { k: 'dining', q: 'd', label: 'Dining', hint: 'Restaurants, food delivery', def: 10000 },
  { k: 'groceries', q: 'gr', label: 'Groceries', hint: 'Supermarkets, quick commerce', def: 15000 },
  { k: 'fuel', q: 'f', label: 'Fuel', hint: 'Petrol pumps', def: 5000 },
  { k: 'rent', q: 'r', label: 'Rent', hint: 'Via rent-pay apps', def: 0 },
  { k: 'utilities', q: 'u', label: 'Utilities and telecom', hint: 'Power, gas, water, mobile, broadband', def: 5000 },
  { k: 'insurance', q: 'i', label: 'Insurance premiums', hint: 'Life, health, motor', def: 5000 },
  { k: 'education', q: 'e', label: 'Education fees', hint: 'Paid to the school or college', def: 0 },
  { k: 'international', q: 'x', label: 'International', hint: 'Foreign-currency spend', def: 10000 },
  { k: 'wallet', q: 'w', label: 'Wallet loads', hint: 'Paytm, Amazon Pay and similar', def: 0 },
  { k: 'government', q: 'gv', label: 'Government and tax', hint: 'Tax, challans, govt services', def: 0 },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.k, c]));

const PRESETS = [
  { label: 'Typical mix', spend: Object.fromEntries(CATS.map((c) => [c.k, c.def])) },
  { label: '₹1 lakh, all general', spend: { general: 100000 } },
  { label: 'Rent ₹50k + portal', spend: { general: 60000, portal: 40000, rent: 50000, dining: 10000, groceries: 15000, utilities: 5000, insurance: 5000 } },
  { label: 'Big spender ₹4 lakh', spend: { general: 300000, portal: 50000, travel: 20000, dining: 15000, international: 15000 } },
  { label: 'Clear', spend: {} },
];

const MODES = [
  { k: 'c', label: 'Cash' },
  { k: 'p', label: 'Portal' },
  { k: 't', label: 'Transfer' },
];

/* ---------- Helpers ---------- */
const parseAmt = (s) => {
  const v = Number(String(s ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(v) && v >= 0 ? v : null;
};
const words = (n) => {
  if (!Number.isFinite(n) || n < 1000) return '';
  if (n >= 1e7) return `${+(n / 1e7).toFixed(2)} crore`;
  if (n >= 1e5) return `${+(n / 1e5).toFixed(2)} lakh`;
  return `${+(n / 1e3).toFixed(1)} thousand`;
};
const fmtIn = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const rs = (n) => (n < 0 ? `−${inr(Math.abs(Math.round(n)))}` : inr(Math.round(n)));
const pts = (n) => num(Math.round(n), 0);
const pctOf = (n, d = 1) => (Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : '–');
const perRs = (v) => `₹${v.toFixed(2)}`;

/* ---------- State in the URL ---------- */
const params = new URLSearchParams(location.search);
const anySpendParam = CATS.some((c) => params.has(c.q));
const state = {
  spend: Object.fromEntries(CATS.map((c) => [c.k, anySpendParam ? parseAmt(params.get(c.q)) ?? 0 : c.def])),
  mix: params.get('pm') === 'h' ? 'h' : 'f',
  climit: parseAmt(params.get('cl')) || CARDS.find((c) => c.axisTier)?.axisTier.defaultCreditLimit || 1000000,
  mile: parseAmt(params.get('mv')) ?? data.default_mile_value,
  welcome: params.get('wb') === '1',
  val: Object.fromEntries(CARDS.map((c) => {
    const raw = params.get(`v_${c.id}`);
    if (raw === 'c' || raw === 'p' || raw === 't') return [c.id, raw];
    const n = parseAmt(raw);
    return [c.id, n != null && raw !== null && raw !== '' ? n : 't'];
  })),
};
if (!(state.mile > 0)) state.mile = data.default_mile_value;

function syncUrl() {
  const p = new URLSearchParams();
  CATS.forEach((c) => p.set(c.q, String(Math.round(state.spend[c.k]))));
  p.set('pm', state.mix);
  p.set('cl', String(Math.round(state.climit)));
  p.set('mv', String(state.mile));
  if (state.welcome) p.set('wb', '1');
  CARDS.forEach((c) => p.set(`v_${c.id}`, String(state.val[c.id])));
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
}

/* ---------- Point value for a card ---------- */
function pointValue(card, mode = state.val[card.id]) {
  if (mode === 'c') return card.values.cash;
  if (mode === 'p') return card.values.portal;
  if (mode === 't') return card.values.transferRatio * state.mile;
  return Number(mode) || 0;
}
const modeName = (m) => ({ c: 'cash', p: 'portal', t: 'transfer' })[m] || 'custom';

/* ---------- Core arithmetic: one card, one spend profile ---------- */
function compute(card, spend, opts) {
  const rate = card.base.pts / card.base.per; // points per rupee
  const rows = {};
  const caps = [];
  let tierSpend = 0; // Axis: spend that counts toward the ₹1.5 lakh threshold

  for (const c of CATS) {
    if (c.k === 'portal') continue;
    const s = spend[c.k] || 0;
    const rule = card.categories[c.k] || {};
    const row = { spend: s, pts: 0, status: 'ok', note: '' };
    if (s > 0 && rule.earn === false) {
      row.status = 'none';
      row.note = rule.why;
    } else if (s > 0) {
      let earnS = s;
      if (rule.spendCapMonth != null && s > rule.spendCapMonth) {
        earnS = rule.spendCapMonth;
        row.status = 'capped';
        row.note = rule.why;
      }
      let p = earnS * rate;
      if (rule.capPtsMonth != null && p > rule.capPtsMonth) {
        p = rule.capPtsMonth;
        row.status = 'capped';
        row.note = rule.why;
      }
      row.pts = p;
      row.earnSpend = earnS;
      tierSpend += earnS;
    }
    rows[c.k] = row;
  }

  // HSBC: several categories share one monthly earning limit.
  if (card.sharedSpendCap) {
    const sc = card.sharedSpendCap;
    const total = sc.cats.reduce((a, k) => a + (rows[k].status !== 'none' ? rows[k].spend : 0), 0);
    if (total > sc.spendMonth) {
      const f = sc.spendMonth / total;
      sc.cats.forEach((k) => {
        if (rows[k].spend > 0 && rows[k].status !== 'none') {
          rows[k].pts *= f;
          rows[k].status = 'capped';
          rows[k].note = sc.why;
        }
      });
    }
  }

  // Bank travel portal.
  {
    const s = spend.portal || 0;
    const P = card.portal;
    const mult = opts.mix === 'h' ? P.hotels : P.flights;
    const inPortal = P.spendCapMonth != null ? Math.min(s, P.spendCapMonth) : s;
    const overflow = s - inPortal; // Axis: Travel EDGE beyond ₹2 lakh earns like normal spend
    let bonus = inPortal * rate * (mult - 1);
    const row = { spend: s, pts: 0, status: 'ok', note: '' };
    if (P.bonusCapMonth != null && bonus > P.bonusCapMonth) {
      bonus = P.bonusCapMonth;
      row.status = 'capped';
      row.note = `${P.name} extra points capped at ${pts(P.bonusCapMonth)} a month`;
    }
    if (overflow > 0) {
      row.status = 'capped';
      row.note = `${P.name} 5X only on the first ${inr(P.spendCapMonth)} a month`;
      tierSpend += overflow;
    }
    row.pts = inPortal * rate + bonus + overflow * rate;
    row.mult = mult;
    rows.portal = row;
  }

  let month = Object.values(rows).reduce((a, r) => a + r.pts, 0);

  // Axis Magnus: 35 instead of 12 points per ₹200 above ₹1.5 lakh, up to credit limit + ₹1.5 lakh.
  let tierPts = 0;
  let tierInfo = null;
  if (card.axisTier) {
    const T = card.axisTier;
    const above = Math.max(0, tierSpend - T.threshold);
    const accelSpend = Math.min(above, opts.climit);
    tierPts = accelSpend * (T.accelPts - card.base.pts) / T.per;
    tierInfo = { tierSpend, above, accelSpend, limited: above > opts.climit };
    if (tierInfo.limited) caps.push(`35-point rate stops at credit limit + ₹1.5 lakh; ${inr(above - opts.climit)} a month earns only 12`);
    month += tierPts;
  }

  // Per-statement ceiling.
  let stmtCut = 0;
  if (card.statementCapPts && month > card.statementCapPts) {
    stmtCut = month - card.statementCapPts;
    month = card.statementCapPts;
    caps.push(`Statement cap: at most ${pts(card.statementCapPts)} points a month`);
  }

  const totalMonth = CATS.reduce((a, c) => a + (spend[c.k] || 0), 0);
  const eligibleFor = (excl) => CATS.reduce((a, c) => a + (excl.includes(c.k) ? 0 : spend[c.k] || 0), 0);

  // Milestones.
  let milePts = 0;
  let mileRupees = 0;
  const mileNotes = [];
  for (const m of card.milestones) {
    const e = eligibleFor(m.excludes || []);
    if (m.type === 'quarterPts') {
      const hit = e * 3 >= m.spend;
      if (hit) milePts += m.pts * 4;
      mileNotes.push(`${hit ? 'Hit' : 'Missed'}: ${m.label}`);
    } else if (m.type === 'yearRupees') {
      const hit = e * 12 >= m.spend;
      if (hit) mileRupees += m.rupees;
      mileNotes.push(`${hit ? 'Hit' : 'Missed'}: ${m.label}`);
    }
  }

  // Welcome / renewal (only when asked).
  const welPts = opts.welcome ? card.welcome.pts : 0;
  const welRupees = opts.welcome ? card.welcome.rupees : 0;

  const yearPts = month * 12 + milePts + welPts;

  // Value the points, respecting yearly redemption caps on portal/transfer routes.
  const mode = opts.val;
  const vpp = pointValue(card, mode);
  let ptsValue = yearPts * vpp;
  const capY = card.redeemCapYear && (mode === 'p' || mode === 't') ? card.redeemCapYear[modeName(mode)] : null;
  if (capY && yearPts > capY) {
    ptsValue = capY * vpp + (yearPts - capY) * card.values.cash;
    caps.push(`${card.redeemCapYear.note}; the extra ${pts(yearPts - capY)} points are valued at cash rate`);
  }

  // Fee, waiver, forex.
  const waiverSpendYear = eligibleFor(card.fee.waiverExcludes) * 12;
  const waived = card.fee.waiverSpend != null && waiverSpendYear >= card.fee.waiverSpend;
  const fee = card.fee.amount && !waived ? card.fee.amount * (1 + GST) : 0;
  const forex = (spend.international || 0) * 12 * card.forex * (1 + GST);

  const net = ptsValue + mileRupees + welRupees - fee - forex;
  const yearSpend = totalMonth * 12;

  return {
    card, rows, tierPts, tierInfo, stmtCut, milePts, mileRupees, mileNotes, welPts, welRupees,
    yearPts, vpp, ptsValue, fee, waived, waiverSpendYear, forex, net, yearSpend,
    eff: yearSpend > 0 ? net / yearSpend : NaN, caps,
  };
}

/* ---------- Spend inputs ---------- */
const grid = document.getElementById('spend-grid');
grid.innerHTML = CATS.map((c) => `
  <label class="field spend-field" for="s-${c.k}">
    <span>${esc(c.label)} <i class="muted">${esc(c.hint)}</i></span>
    <input class="input-num" type="text" id="s-${c.k}" data-k="${c.k}" inputmode="numeric" autocomplete="off">
    <span class="small muted words" id="w-${c.k}"></span>
  </label>`).join('') + '<div class="spend-total" id="spend-total"></div>';

function fillInputs() {
  CATS.forEach((c) => {
    document.getElementById(`s-${c.k}`).value = fmtIn(state.spend[c.k]);
    document.getElementById(`w-${c.k}`).textContent = words(state.spend[c.k]);
  });
  document.getElementById('mile').value = state.mile;
  document.getElementById('climit').value = fmtIn(state.climit);
  document.getElementById('welcome').checked = state.welcome;
  document.querySelectorAll('#mix button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.mix)));
}
grid.addEventListener('input', (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  const v = parseAmt(e.target.value);
  if (v == null) return;
  state.spend[k] = v;
  document.getElementById(`w-${k}`).textContent = words(v);
  update();
});
grid.addEventListener('focusout', (e) => {
  const k = e.target.dataset.k;
  if (k) e.target.value = fmtIn(state.spend[k]);
});

document.getElementById('presets').innerHTML = '<span class="muted">Try:</span>' +
  PRESETS.map((p, i) => `<button type="button" class="chip outline" data-i="${i}">${esc(p.label)}</button>`).join('');
document.getElementById('presets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const p = PRESETS[+b.dataset.i];
  CATS.forEach((c) => { state.spend[c.k] = p.spend[c.k] || 0; });
  fillInputs();
  update();
});

document.getElementById('mile').addEventListener('input', (e) => {
  const v = parseAmt(e.target.value);
  if (v == null || v <= 0) return;
  state.mile = v;
  renderValRows();
  update();
});
document.getElementById('climit').addEventListener('input', (e) => {
  const v = parseAmt(e.target.value);
  if (v == null) return;
  state.climit = v;
  update();
});
document.getElementById('climit').addEventListener('focusout', (e) => { e.target.value = fmtIn(state.climit); });
document.getElementById('welcome').addEventListener('change', (e) => { state.welcome = e.target.checked; update(); });
document.getElementById('mix').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  state.mix = b.dataset.v;
  document.querySelectorAll('#mix button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  update();
});

/* ---------- Valuation rows ---------- */
const valRows = document.getElementById('val-rows');
function renderValRows() {
  valRows.innerHTML = '<div class="val-row val-all"><b>All cards</b><div class="seg" role="group" aria-label="Set every card">' +
    MODES.map((m) => `<button type="button" data-all="${m.k}" aria-pressed="${CARDS.every((c) => state.val[c.id] === m.k)}">${m.label}</button>`).join('') +
    '</div></div>' +
    CARDS.map((c) => {
      const cur = state.val[c.id];
      const custom = !['c', 'p', 't'].includes(cur);
      const note = cur === 'c' ? c.values.cashNote : cur === 'p' ? c.values.portalNote : cur === 't' ? `${c.values.transferNote}; × ₹${state.mile} a mile` : 'Your own value';
      return `<div class="val-row" data-id="${c.id}">
        <b>${esc(c.short)}</b>
        <div class="seg" role="group" aria-label="${esc(c.short)} point value">
          ${MODES.map((m) => `<button type="button" data-m="${m.k}" aria-pressed="${cur === m.k}">${m.label} ${perRs(pointValue(c, m.k))}</button>`).join('')}
        </div>
        <label class="custom${custom ? ' on' : ''}"><span class="small muted">Custom ₹/pt</span><input class="input-num" type="text" inputmode="decimal" data-custom="${c.id}" value="${custom ? cur : ''}" placeholder="0.50" aria-label="${esc(c.short)} custom rupees per point"></label>
        <span class="small muted val-note">${esc(note)}</span>
      </div>`;
    }).join('');
}
valRows.addEventListener('click', (e) => {
  const all = e.target.closest('button[data-all]');
  if (all) {
    CARDS.forEach((c) => { state.val[c.id] = all.dataset.all; });
    renderValRows();
    update();
    return;
  }
  const b = e.target.closest('button[data-m]');
  if (!b) return;
  state.val[b.closest('.val-row').dataset.id] = b.dataset.m;
  renderValRows();
  update();
});
valRows.addEventListener('input', (e) => {
  const id = e.target.dataset.custom;
  if (!id) return;
  const v = parseAmt(e.target.value);
  if (v == null || e.target.value.trim() === '') return;
  state.val[id] = v;
  const row = e.target.closest('.val-row');
  row.querySelectorAll('button[data-m]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  row.querySelector('.custom').classList.add('on');
  row.querySelector('.val-note').textContent = 'Your own value';
  valRows.querySelectorAll('button[data-all]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  update();
});

/* ---------- Results ---------- */
const tip = createTooltip();
let lastResults = [];

function renderResults() {
  const res = CARDS.map((c) => compute(c, state.spend, { mix: state.mix, climit: state.climit, welcome: state.welcome, val: state.val[c.id] }));
  lastResults = res;
  const ranked = [...res].sort((a, b) => b.net - a.net);
  const totalMonth = CATS.reduce((a, c) => a + state.spend[c.k], 0);
  document.getElementById('spend-total').innerHTML = `Total <b>${inr(totalMonth)}</b> a month · <b>${inr(totalMonth * 12)}</b> a year <span class="muted">(${words(totalMonth * 12)})</span>`;

  const best = ranked[0];
  document.getElementById('answer').innerHTML = totalMonth <= 0
    ? 'Enter some monthly spend to compare the cards.'
    : best.net <= 0
      ? `At these point values, none of the five returns more than it costs on <b>${inr(totalMonth)}</b> a month.`
      : `On <b>${inr(totalMonth)}</b> a month, <b>${esc(best.card.short)}</b> returns the most: <mark>${rs(best.net)} a year</mark> after fees, about ${pctOf(best.eff)} of spend.`;

  document.getElementById('rank-tiles').innerHTML = ranked.map((r, i) => {
    const feeTxt = r.card.fee.amount === 0 ? 'no renewal fee' : r.waived ? 'fee waived' : `fee ${inr(Math.round(r.fee))}`;
    return `<div class="tile${i === 0 && r.net > 0 ? ' best' : ''}">
      <div class="label"><span class="rank${i === 0 ? ' top' : ''}">#${i + 1}</span> ${esc(r.card.short)}</div>
      <div class="value${r.net < 0 ? ' neg' : ''}">${rs(r.net)}<span class="unit">/yr</span></div>
      <div class="sub">${Number.isFinite(r.eff) ? pctOf(r.eff) : '–'} back · ${feeTxt} · ${perRs(r.vpp)}/pt</div>
    </div>`;
  }).join('');

  const max = Math.max(1, ...res.map((r) => r.net));
  document.getElementById('barlist').innerHTML = ranked.map((r) => `
    <div class="bar-row" data-id="${r.card.id}" tabindex="0">
      <div class="bl-label"><b>${esc(r.card.short)}</b><span class="muted">${pts(r.yearPts)} pts × ${perRs(r.vpp)}</span></div>
      <div class="bl-track"><span class="bl-fill" style="width:${Math.max(0, (r.net / max) * 100)}%"></span></div>
      <div class="bl-val${r.net < 0 ? ' neg' : ''}">${rs(r.net)}</div>
    </div>`).join('');

  // Caps and exclusions that bite, per card.
  document.getElementById('caps-list').innerHTML = res.map((r) => {
    const items = [];
    CATS.forEach((c) => {
      const row = r.rows[c.k];
      if (row.status === 'none') items.push(`<li><span class="chip na">no points</span> ${esc(c.label)} ${inr(row.spend)}: ${esc(row.note)}</li>`);
      else if (row.status === 'capped') items.push(`<li><span class="chip warn">capped</span> ${esc(c.label)}: ${esc(row.note)}</li>`);
    });
    r.caps.forEach((t) => items.push(`<li><span class="chip warn">capped</span> ${esc(t)}</li>`));
    if (r.tierInfo) items.push(`<li><span class="chip good-2">bonus</span> ${r.tierInfo.accelSpend > 0 ? `${inr(r.tierInfo.accelSpend)} a month earns 35 per ₹200` : `Under ₹1.5 lakh of eligible spend (${inr(r.tierInfo.tierSpend)}), so no 35-point tier`}</li>`);
    r.mileNotes.forEach((t) => items.push(`<li><span class="chip ${t.startsWith('Hit') ? 'good-2' : 'na'}">milestone</span> ${esc(t.replace(/^(Hit|Missed): /, ''))}${t.startsWith('Hit') ? '' : ' (missed)'}</li>`));
    if (r.card.fee.amount) items.push(`<li><span class="chip ${r.waived ? 'good-2' : 'na'}">fee</span> ${r.waived ? 'Waiver met' : 'Waiver missed'}: ${inr(r.waiverSpendYear)} counted vs ${inr(r.card.fee.waiverSpend)} needed</li>`);
    return `<div class="cap-card"><b>${esc(r.card.short)}</b><ul>${items.join('') || '<li class="muted">Nothing capped or excluded at this spend.</li>'}</ul></div>`;
  }).join('');

  renderBreakdown(res);
}

function renderBreakdown(res) {
  const thead = `<tr><th class="sticky">Category</th><th class="n">Spend / month</th>${res.map((r) => `<th class="n bl">${esc(r.card.short)}</th>`).join('')}</tr>`;
  document.querySelector('#breakdown thead').innerHTML = thead;
  const cell = (row) => {
    if (!row || row.spend <= 0) return '<td class="n bl muted">–</td>';
    if (row.status === 'none') return `<td class="n bl c-na" title="${esc(row.note)}">0</td>`;
    if (row.status === 'capped') return `<td class="n bl c-warn" title="${esc(row.note)}">${pts(row.pts * 12)}</td>`;
    return `<td class="n bl">${pts(row.pts * 12)}</td>`;
  };
  const shown = CATS.filter((c) => state.spend[c.k] > 0);
  const body = [];
  shown.forEach((c) => {
    body.push(`<tr><th class="sticky">${esc(c.label)}${c.k === 'portal' ? ` <span class="pflav">${state.mix === 'h' ? 'hotels' : 'flights'}</span>` : ''}</th><td class="n">${inr(state.spend[c.k])}</td>${res.map((r) => cell(r.rows[c.k])).join('')}</tr>`);
  });
  if (!shown.length) body.push(`<tr><td colspan="${2 + res.length}"><div class="empty">No spend entered.</div></td></tr>`);
  const sumRow = (label, f, cls = '') => `<tr class="${cls}"><th class="sticky">${label}</th><td class="n"></td>${res.map((r) => `<td class="n bl">${f(r)}</td>`).join('')}</tr>`;
  body.push(sumRow('Tier bonus (35 per ₹200)', (r) => (r.tierInfo ? pts(r.tierPts * 12) : '<span class="muted">–</span>')));
  body.push(sumRow('Statement cap cut', (r) => (r.stmtCut ? `<span class="neg">−${pts(r.stmtCut * 12)}</span>` : '<span class="muted">–</span>')));
  body.push(sumRow('Milestone points', (r) => (r.milePts ? pts(r.milePts) : '<span class="muted">–</span>')));
  if (state.welcome) body.push(sumRow('Welcome / renewal points', (r) => (r.welPts ? pts(r.welPts) : '<span class="muted">–</span>')));
  body.push(sumRow('<b>Points a year</b>', (r) => `<b>${pts(r.yearPts)}</b>`, 'total'));
  body.push(sumRow('× value per point', (r) => `${perRs(r.vpp)} <span class="pflav">${modeName(state.val[r.card.id])}</span>`));
  body.push(sumRow('= Points value', (r) => rs(r.ptsValue)));
  body.push(sumRow('+ Milestone vouchers', (r) => (r.mileRupees ? rs(r.mileRupees) : '<span class="muted">–</span>')));
  if (state.welcome) body.push(sumRow('+ Welcome voucher', (r) => (r.welRupees ? rs(r.welRupees) : '<span class="muted">–</span>')));
  body.push(sumRow('− Renewal fee + GST', (r) => (r.fee ? `<span class="neg">−${inr(Math.round(r.fee))}</span>` : `<span class="muted">${r.card.fee.amount ? 'waived' : 'nil'}</span>`)));
  body.push(sumRow('− Forex markup + GST', (r) => (r.forex ? `<span class="neg">−${inr(Math.round(r.forex))}</span>` : '<span class="muted">–</span>')));
  body.push(sumRow('<b>Net value a year</b>', (r) => `<b class="${r.net < 0 ? 'neg' : ''}">${rs(r.net)}</b>`, 'total'));
  body.push(sumRow('Effective return', (r) => (Number.isFinite(r.eff) ? pctOf(r.eff, 2) : '–')));
  document.querySelector('#breakdown tbody').innerHTML = body.join('');
}

// Tooltip on the bar list.
const bars = document.getElementById('barlist');
const showTip = (row, x, y) => {
  const r = lastResults.find((q) => q.card.id === row.dataset.id);
  if (!r) return;
  tip.show(`<b>${esc(r.card.name)}</b><br>${pts(r.yearPts)} points × ${perRs(r.vpp)} = ${rs(r.ptsValue)}${r.mileRupees ? `<br>+ vouchers ${rs(r.mileRupees)}` : ''}${r.fee ? `<br>− fee ${inr(Math.round(r.fee))}` : ''}${r.forex ? `<br>− forex ${inr(Math.round(r.forex))}` : ''}<br><b>Net ${rs(r.net)}</b>`, x, y);
};
bars.addEventListener('mousemove', (e) => { const row = e.target.closest('.bar-row'); if (row) showTip(row, e.clientX, e.clientY); else tip.hide(); });
bars.addEventListener('mouseleave', () => tip.hide());
bars.addEventListener('focusin', (e) => { const row = e.target.closest('.bar-row'); if (row) { const b = row.getBoundingClientRect(); showTip(row, b.right - 40, b.top); } });
bars.addEventListener('focusout', () => tip.hide());

/* ---------- Compare tab ---------- */
const COMPARE_ROWS = [
  ['fee', 'Annual fee'], ['waiver', 'Fee waiver'], ['base', 'Base earn'], ['_base', 'Base return'], ['portal', 'Bank portal'],
  ['excluded', 'No points on'], ['caps', 'Caps'], ['milestones', 'Milestones'], ['partners', 'Transfer partners'], ['ratio', 'Transfer ratio'],
  ['redemption', 'Redemption values'], ['forex', 'Forex markup'], ['lounge', 'Lounges'], ['eligibility', 'Eligibility'], ['_src', 'Checked'],
];
function renderCompare() {
  document.querySelector('#compare-table thead').innerHTML = `<tr><th class="sticky"></th>${CARDS.map((c) => `<th>${esc(c.short)}<div class="pflav">${esc(c.bank)}</div></th>`).join('')}</tr>`;
  document.querySelector('#compare-table tbody').innerHTML = COMPARE_ROWS.map(([k, label]) => {
    const cells = CARDS.map((c) => {
      if (k === '_base') {
        const r = c.base.pts / c.base.per;
        return `<td>${pctOf(r * c.values.cash)} at cash · ${pctOf(r * c.values.transferRatio * data.default_mile_value)} at transfer (₹${data.default_mile_value}/mile)</td>`;
      }
      if (k === '_src') return `<td>${esc(c.checked)} · <a href="${esc(c.source)}" target="_blank" rel="noopener">bank page ↗</a></td>`;
      return `<td>${esc(c.compare[k])}</td>`;
    }).join('');
    return `<tr><th class="sticky">${label}</th>${cells}</tr>`;
  }).join('');
}

/* ---------- About tab: rules table and sources ---------- */
function ruleText(card, k) {
  const rate = (card.base.pts / card.base.per) * 100;
  if (k === 'portal') {
    const P = card.portal;
    const capTxt = P.bonusCapMonth ? `; extra capped ${pts(P.bonusCapMonth)}/mo` : P.spendCapMonth ? `; first ${inr(P.spendCapMonth)}/mo` : '';
    return `${P.name}: ${P.flights}X flights, ${P.hotels}X hotels${capTxt}`;
  }
  const rule = card.categories[k] || {};
  if (rule.earn === false) return '<span class="chip na">no points</span>';
  const parts = [`${fixed(rate, 2)} / ₹100`];
  if (rule.spendCapMonth) parts.push(`first ${inr(rule.spendCapMonth)}/mo`);
  if (rule.capPtsMonth) parts.push(`cap ${pts(rule.capPtsMonth)} pts/mo`);
  if (card.sharedSpendCap?.cats.includes(k)) parts.push(`shared ${inr(card.sharedSpendCap.spendMonth)}/mo limit`);
  if (card.axisTier && rule.earn !== false) parts.push('counts to 35X tier');
  return parts.join(' · ');
}
function renderAbout() {
  document.querySelector('#rules-table thead').innerHTML = `<tr><th class="sticky">Category</th>${CARDS.map((c) => `<th>${esc(c.short)}</th>`).join('')}</tr>`;
  document.querySelector('#rules-table tbody').innerHTML = CATS.map((cat) =>
    `<tr><th class="sticky">${esc(cat.label)}</th>${CARDS.map((c) => `<td>${ruleText(c, cat.k)}</td>`).join('')}</tr>`).join('');
  document.getElementById('sources-list').innerHTML = CARDS.map((c) => `
    <div class="group" id="src-${c.id}">
      <div class="label" data-share="src-${c.id}">${esc(c.name)} · checked ${esc(c.checked)}</div>
      <ul>${c.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ul>
    </div>`).join('');
  initShareChips(document.getElementById('sources-list'));
}

/* ---------- Wiring ---------- */
function update() {
  renderResults();
  syncUrl();
}

fillInputs();
renderValRows();
renderCompare();
renderAbout();
update();
tabs.goToHash();
