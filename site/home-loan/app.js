import { initPage, initTabs, createPager, createTooltip, esc, inr, fixed } from '../assets/site.js';
import { schedule, monthDate, prepayVsInvest, breakEven, rentVsBuy } from './calc.js';
import { columnChart, lineChart, wireChart } from './chart.js';
import { createForm } from './form.js';

/* ---------- Rules and defaults (checked Nov 2026; sources on the About tab) ---------- */
const RULES = {
  sec24bCap: 200000, // old regime, self-occupied home, per financial year (sec 24(b) → sec 22, IT Act 2025)
  cess: 0.04,
};
// Starting values for each loan type. Round examples, not lender quotes.
const LOAN_TYPES = {
  home: { amt: 5000000, rate: 8.5, ten: 20, name: 'home loan' },
  car: { amt: 800000, rate: 9.5, ten: 5, name: 'car loan' },
  personal: { amt: 500000, rate: 13, ten: 3, name: 'personal loan' },
  education: { amt: 1000000, rate: 10, ten: 7, name: 'education loan' },
};

initPage();
const tabs = initTabs();
const tip = createTooltip();

function nextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const SPEC = {
  type: { kind: 'select', opts: Object.keys(LOAN_TYPES), def: 'home' },
  amt: { kind: 'money', def: (s) => LOAN_TYPES[s.type].amt },
  rate: { kind: 'num', min: 0, max: 40, def: (s) => LOAN_TYPES[s.type].rate },
  tu: { kind: 'seg', opts: ['y', 'm'], def: 'y' },
  ten: { kind: 'int', min: 1, max: 480, def: (s) => (s.tu === 'm' ? LOAN_TYPES[s.type].ten * 12 : LOAN_TYPES[s.type].ten) },
  start: { kind: 'month', def: nextMonth(), always: true },
  once: { kind: 'money0', def: 500000 },
  oncem: { kind: 'int', min: 1, max: 480, def: 12 },
  yr: { kind: 'money0', def: 100000 },
  mode: { kind: 'seg', opts: ['tenure', 'emi'], def: 'tenure' },
  ret: { kind: 'num', min: 0, max: 40, def: 10 },
  tax: { kind: 'check', def: false },
  slab: { kind: 'select', opts: ['5', '20', '30'], def: '30' },
  price: { kind: 'money', def: 10000000 },
  down: { kind: 'num', min: 0, max: 100, def: 20 },
  stamp: { kind: 'num', min: 0, max: 20, def: 7 },
  rbr: { kind: 'num', min: 0, max: 40, def: 8.5 },
  rbt: { kind: 'int', min: 1, max: 40, def: 20 },
  maint: { kind: 'money0', def: 3000 },
  ptax: { kind: 'money0', def: 6000 },
  upk: { kind: 'num', min: 0, max: 30, def: 5 },
  appr: { kind: 'num', min: -10, max: 30, def: 5 },
  rent: { kind: 'money', def: 25000 },
  rinc: { kind: 'num', min: 0, max: 30, def: 7 },
  rret: { kind: 'num', min: 0, max: 40, def: 10 },
  hz: { kind: 'int', min: 1, max: 40, def: 20 },
};

const LOAN_KEYS = ['type', 'amt', 'rate', 'tu', 'ten', 'start'];
const PREPAY_KEYS = ['once', 'oncem', 'yr', 'mode', 'ret', 'tax', 'slab'];
const form = createForm(SPEC, (k) => {
  const S = form.state;
  if (k === 'type') {
    const t = LOAN_TYPES[S.type];
    form.set('tu', 'y', true);
    form.set('amt', t.amt, true);
    form.set('rate', t.rate, true);
    form.set('ten', t.ten, true);
    form.sync();
  }
  if (k === 'tu') {
    form.set('ten', S.tu === 'm' ? Math.min(480, S.ten * 12) : Math.max(1, Math.round(S.ten / 12)), true);
    form.sync();
  }
  if (LOAN_KEYS.includes(k)) { amLimit = 15; openYears.clear(); renderEmi(); renderPrepay(); }
  else if (PREPAY_KEYS.includes(k)) renderPrepay();
  else { rvbLimit = 15; renderRvb(); }
});
const S = form.state;

/* ---------- Helpers ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => { const d = monthDate(S.start, m); return `${MON[d.month - 1]} ${d.year}`; };
const months = () => Math.min(480, S.tu === 'y' ? S.ten * 12 : S.ten);
function span(n) {
  const y = Math.floor(n / 12);
  const m = n % 12;
  return [y ? `${y} yr${y === 1 ? '' : 's'}` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '0 mo';
}
const pctTxt = (v, d = 1) => `${fixed(v, d)}%`;
const tile = (lab, value, sub, cls = '') =>
  `<div class="tile ${cls}"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

/* ---------- EMI tab ---------- */
let amLimit = 15;
const openYears = new Set();
let years = [];
const amPager = createPager(document.getElementById('am-pager'), { onMore: () => { amLimit += 15; renderAmTable(); } });

function renderEmi() {
  const n = months();
  const s = schedule(S.amt, S.rate, n);
  const name = LOAN_TYPES[S.type].name;
  const paid = S.amt + s.totalInterest;
  const firstYear = s.rows.slice(0, 12);
  const fyInt = firstYear.reduce((a, r) => a + r.interest, 0) / Math.max(1, firstYear.reduce((a, r) => a + r.pay, 0));
  document.getElementById('emi-answer').innerHTML =
    `An EMI of <mark>${inr(Math.round(s.emi0))}</mark> a month for ${esc(span(n))} repays a ${esc(name)} of <b>${inr(S.amt)}</b> and costs <b>${inr(Math.round(s.totalInterest))}</b> in interest.`;
  document.getElementById('emi-tiles').innerHTML = [
    tile('Monthly EMI', inr(Math.round(s.emi0)), `${n} EMIs at ${pctTxt(S.rate, 2)} a year`, 'hl'),
    tile('Total interest', inr(Math.round(s.totalInterest)), `${pctTxt((s.totalInterest / S.amt) * 100, 0)} of the amount borrowed`),
    tile('Total paid', inr(Math.round(paid)), 'Principal plus interest'),
    tile('First year: share to interest', pctTxt(fyInt * 100, 0), 'Of the first 12 EMIs'),
    tile('Last EMI', esc(monthName(s.months)), `First EMI ${monthName(1)}`),
  ].join('');

  // Group months by calendar year.
  years = [];
  s.rows.forEach((r) => {
    const y = monthDate(S.start, r.m).year;
    let g = years.at(-1);
    if (!g || g.year !== y) { g = { year: y, rows: [], principal: 0, interest: 0, paid: 0 }; years.push(g); }
    g.rows.push(r);
    g.principal += r.principal;
    g.interest += r.interest;
    g.paid += r.pay;
    g.bal = r.bal;
  });
  drawSplit();
  renderAmTable();
}

function drawSplit() {
  columnChart(document.getElementById('split-chart'), {
    labels: years.map((g) => String(g.year)),
    series: [
      { name: 'Principal', color: 'var(--s1)', values: years.map((g) => g.principal) },
      { name: 'Interest', color: 'var(--s2)', values: years.map((g) => g.interest) },
    ],
    tip: (i) => {
      const g = years[i];
      return `<b>${g.year}</b> · ${g.rows.length} EMI${g.rows.length === 1 ? '' : 's'}<br>Principal ${inr(Math.round(g.principal))}<br>Interest ${inr(Math.round(g.interest))}<br>Balance at end ${inr(Math.round(g.bal))}`;
    },
  });
}

function renderAmTable() {
  const shown = years.slice(0, amLimit);
  const pctPaid = (bal) => `${fixed((1 - bal / S.amt) * 100, 1)}%`;
  document.querySelector('#am-table tbody').innerHTML = shown.map((g) => {
    const open = openYears.has(g.year);
    let html = `<tr class="row${open ? ' open' : ''}" data-year="${g.year}" tabindex="0" aria-expanded="${open}">
      <td class="sticky"><b>${g.year}</b></td><td class="n">${g.rows.length}</td><td class="n">${inr(Math.round(g.principal))}</td><td class="n">${inr(Math.round(g.interest))}</td>
      <td class="n">${inr(Math.round(g.paid))}</td><td class="n">${inr(Math.round(g.bal))}</td><td class="n">${pctPaid(g.bal)}</td></tr>`;
    if (open) {
      html += g.rows.map((r) => `<tr class="sub"><td class="sticky">${esc(monthName(r.m))} <span class="muted">#${r.m}</span></td><td class="n"></td><td class="n">${inr(Math.round(r.principal))}</td><td class="n">${inr(Math.round(r.interest))}</td><td class="n">${inr(Math.round(r.pay))}</td><td class="n">${inr(Math.round(r.bal))}</td><td class="n">${pctPaid(r.bal)}</td></tr>`).join('');
    }
    return html;
  }).join('');
  amPager.update(shown.length, years.length);
  document.getElementById('am-hint').textContent = `${years.length} calendar years · click a year for its months${years.length > 15 ? ' · 15 at a time · scroll for more' : ''}`;
}

const amBody = document.querySelector('#am-table tbody');
const toggleYear = (tr) => {
  const y = Number(tr.dataset.year);
  if (openYears.has(y)) openYears.delete(y); else openYears.add(y);
  renderAmTable();
};
amBody.addEventListener('click', (e) => { const tr = e.target.closest('tr.row'); if (tr) toggleYear(tr); });
amBody.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) {
    e.preventDefault();
    const y = e.target.dataset.year;
    toggleYear(e.target);
    amBody.querySelector(`tr.row[data-year="${y}"]`)?.focus();
  }
});

/* ---------- Prepay tab ---------- */
function prepayArgs() {
  const n = months();
  return {
    P: S.amt, rate: S.rate, n, start: S.start, mode: S.mode, yearly: S.yr,
    oneOff: { amt: S.once, month: Math.min(S.oncem, n) },
    tax: S.tax ? { slab: Number(S.slab) / 100, cess: RULES.cess, cap: RULES.sec24bCap } : null,
  };
}

function renderPrepay() {
  const n = months();
  const args = prepayArgs();
  document.getElementById('pp-loan-hint').innerHTML = `Loan from the <a href="#emi">EMI tab</a>: ${inr(S.amt)} at ${pctTxt(S.rate, 2)} for ${esc(span(n))}`;
  document.getElementById('oncem-date').textContent = S.oncem > n ? `Loan has ${n} EMIs; using #${n}` : monthName(Math.min(S.oncem, n));
  const answer = document.getElementById('pp-answer');
  const tilesEl = document.getElementById('pp-tiles');
  if (!(S.once > 0) && !(S.yr > 0)) {
    answer.textContent = 'Enter a one-off or yearly prepayment to compare.';
    tilesEl.innerHTML = '';
    document.querySelector('#loan-compare-table tbody').innerHTML = '';
    document.querySelector('#worth-compare-table tbody').innerHTML = '';
    return;
  }
  const r = prepayVsInvest({ ...args, investPct: S.ret });
  const be = breakEven(args);
  const { base, pre } = r;
  const saved = base.totalInterest - pre.totalInterest;
  const monthsSaved = base.months - pre.months;
  const firstPre = pre.rows.find((x) => x.prepay > 0);
  const emiAfter = firstPre && pre.rows[firstPre.m] ? pre.rows[firstPre.m].pay : pre.emi0;
  const totalPre = pre.rows.reduce((a, x) => a + x.prepay, 0);
  const end = monthName(n);
  const gap = Math.abs(r.diff);
  const beTxt = be == null ? 'above 40%' : pctTxt(be, 2);
  const lead = Math.abs(r.diff) < 1
    ? `Prepaying and investing at ${pctTxt(S.ret, 2)} come out level by ${esc(end)}.`
    : r.diff > 0
      ? `Prepaying leaves you <mark>${inr(Math.round(gap))} better off</mark> than investing at ${pctTxt(S.ret, 2)}, by ${esc(end)}.`
      : `Investing at ${pctTxt(S.ret, 2)} leaves you <mark>${inr(Math.round(gap))} better off</mark> than prepaying, by ${esc(end)}.`;
  answer.innerHTML = `${lead} Investing has to earn more than <b>${beTxt}</b> after tax to beat prepaying.`;

  const newEmiTile = S.mode === 'emi'
    ? tile('New EMI', inr(Math.round(emiAfter)), `After the first prepayment; ${inr(Math.round(pre.emiEnd))} by the end`)
    : tile('EMI', inr(Math.round(base.emi0)), 'Unchanged: the loan ends sooner instead');
  tilesEl.innerHTML = [
    tile('Interest saved', inr(Math.round(saved)), `${inr(Math.round(totalPre))} prepaid in all`, 'hl'),
    tile('Loan ends', esc(monthName(pre.months)), monthsSaved > 0 ? `${span(monthsSaved)} sooner` : 'Same end date'),
    newEmiTile,
    tile('Break-even return', beTxt, 'After tax; above this, investing wins'),
    tile(r.diff >= 0 ? 'Prepaying ahead by' : 'Investing ahead by', inr(Math.round(gap)), `Net worth in ${end}`),
  ].join('');

  const row = (k, a, b) => `<tr><td class="sticky">${esc(k)}</td><td class="n">${a}</td><td class="n">${b}</td></tr>`;
  document.querySelector('#loan-compare-table tbody').innerHTML = [
    row('EMI at the start', inr(Math.round(base.emi0)), inr(Math.round(pre.emi0))),
    row('EMI at the end', inr(Math.round(base.emi0)), inr(Math.round(pre.emiEnd))),
    row('Number of EMIs', base.months, pre.months),
    row('Last EMI', esc(monthName(base.months)), esc(monthName(pre.months))),
    row('Prepaid', '–', inr(Math.round(totalPre))),
    row('Total interest', inr(Math.round(base.totalInterest)), inr(Math.round(pre.totalInterest))),
  ].join('');
  const w = (a, b) => [a >= b ? 'win' : '', b > a ? 'win' : ''];
  const [wa, wb] = w(r.prepay.corpus, r.invest.corpus);
  document.querySelector('#worth-compare-table tbody').innerHTML = [
    row('Money put into investments', inr(Math.round(r.prepay.put)), inr(Math.round(r.invest.put))),
    S.tax ? row('Tax saved (₹2 lakh deduction)', inr(Math.round(r.prepay.taxSaved)), inr(Math.round(r.invest.taxSaved))) : '',
    row(`Investments in ${end}`, inr(Math.round(r.prepay.corpus)), inr(Math.round(r.invest.corpus))),
    row('Loan left', '₹0', '₹0'),
    `<tr><td class="sticky"><b>Net worth</b></td><td class="n ${wa}">${inr(Math.round(r.prepay.corpus))}</td><td class="n ${wb}">${inr(Math.round(r.invest.corpus))}</td></tr>`,
  ].join('');
}

/* ---------- Rent vs buy tab ---------- */
let rvbLimit = 15;
let rvb = null;
const rvbPager = createPager(document.getElementById('rvb-pager'), { onMore: () => { rvbLimit += 15; renderRvbTable(); } });

function renderRvb() {
  rvb = rentVsBuy({
    price: S.price, downPct: S.down, stampPct: S.stamp, rate: S.rbr, tenureYears: S.rbt,
    maint: S.maint, ptax: S.ptax, upkeepUpPct: S.upk, apprPct: S.appr,
    rent: S.rent, rentUpPct: S.rinc, investPct: S.rret, horizon: S.hz,
  });
  const last = rvb.years.at(-1);
  const ahead = last.buyNW - last.rentNW;
  document.getElementById('down-amt').textContent = `${inr(Math.round(rvb.down))} down · loan ${inr(Math.round(rvb.loan))}`;
  document.getElementById('rent-yield').textContent = `Rent is ${fixed(((S.rent * 12) / S.price) * 100, 1)}% of the price a year`;
  const endTxt = `after ${S.hz} year${S.hz === 1 ? '' : 's'}`;
  let lead;
  if (rvb.crossYear) {
    lead = `Buying pulls ahead of renting and investing in <mark>year ${rvb.crossYear}</mark>`;
    lead += ahead >= 0 ? ` and is ${inr(Math.round(ahead))} ahead ${endTxt}.` : `, but renting is back ahead by ${inr(Math.round(-ahead))} ${endTxt}.`;
  } else {
    lead = `Renting and investing stays ahead for all ${S.hz} years; the gap ${endTxt} is <mark>${inr(Math.round(-ahead))}</mark>.`;
  }
  document.getElementById('rvb-answer').innerHTML = lead;
  document.getElementById('rvb-tiles').innerHTML = [
    tile('Cash needed to buy', inr(Math.round(rvb.down + rvb.stamp)), `Down payment + ${fixed(S.stamp, 1)}% stamp duty and registration`),
    tile('EMI', inr(Math.round(rvb.emi)), `${S.rbt} years at ${pctTxt(S.rbr, 2)}`),
    tile('Buying pulls ahead', rvb.crossYear ? `Year ${rvb.crossYear}` : 'Not yet', rvb.crossYear ? 'First year-end where buying leads' : `Not within ${S.hz} years`, 'hl'),
    tile(`Buy: net worth, year ${S.hz}`, inr(Math.round(last.buyNW)), `Home worth ${inr(Math.round(last.home))}`),
    tile(`Rent: net worth, year ${S.hz}`, inr(Math.round(last.rentNW)), `Rent paid in all ${inr(Math.round(rvb.rentPaid))}`),
  ].join('');
  drawRvb();
  renderRvbTable();
}

function drawRvb() {
  if (!rvb) return;
  const ys = rvb.years;
  lineChart(document.getElementById('rvb-chart'), {
    labels: ys.map((r) => `Y${r.y}`),
    series: [
      { name: 'Buy', color: 'var(--s1)', values: ys.map((r) => r.buyNW) },
      { name: 'Rent', color: 'var(--s2)', values: ys.map((r) => r.rentNW) },
    ],
    marker: rvb.crossYear,
    tip: (i) => `<b>Year ${ys[i].y}</b><br>Buy ${inr(Math.round(ys[i].buyNW))}<br>Rent and invest ${inr(Math.round(ys[i].rentNW))}`,
  });
}

function renderRvbTable() {
  const ys = rvb.years;
  const shown = ys.slice(0, rvbLimit);
  document.querySelector('#rvb-table tbody').innerHTML = shown.map((r) => {
    const win = r.buyNW >= r.rentNW;
    return `<tr${r.y === rvb.crossYear ? ' class="open"' : ''}><td class="sticky"><b>${r.y}</b></td><td class="n">${inr(Math.round(r.home))}</td><td class="n">${inr(Math.round(r.bal))}</td><td class="n">${inr(Math.round(r.buyer ?? 0))}</td>
      <td class="n bl${win ? ' win' : ''}">${inr(Math.round(r.buyNW))}</td><td class="n${win ? '' : ' win'}">${inr(Math.round(r.rentNW))}</td>
      <td class="n bl">${r.y ? inr(Math.round(r.rent)) : '–'}</td><td class="n">${r.y ? inr(Math.round(r.buyCost)) : '–'}</td></tr>`;
  }).join('');
  rvbPager.update(shown.length, ys.length);
  document.getElementById('rvb-hint').textContent = `Year 0 is the day you buy · the leader each year is in green${ys.length > 15 ? ' · 15 at a time · scroll for more' : ''}`;
}

/* ---------- Wiring ---------- */
const splitHost = document.getElementById('split-chart');
const rvbHost = document.getElementById('rvb-chart');
wireChart(splitHost, tip, drawSplit);
wireChart(rvbHost, tip, drawRvb);
document.addEventListener('tabchange', (e) => {
  if (e.detail === 'emi') drawSplit();
  if (e.detail === 'rent-vs-buy') drawRvb();
});

renderEmi();
renderPrepay();
renderRvb();
tabs.goToHash();
