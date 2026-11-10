import { initPage, initTabs, createTooltip, esc, inr } from '../assets/site.js';

/* =====================================================================
   TAX RULES. Update here when a Budget changes anything.
   Checked Nov 2026 against incometax.gov.in (rates page), Budget 2026-27
   commentary (no change to slabs, rebate, surcharge, cess) and the
   Income-tax Rules, 2026 (HRA city list). See the About tab for links.
   ===================================================================== */
const RULES = {
  // [upper limit of slab, rate]
  newSlabs: [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]],
  oldSlabs: {
    u60: [[250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]],
    60: [[300000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]],
    80: [[500000, 0], [1000000, 0.20], [Infinity, 0.30]],
  },
  stdNew: 75000,
  stdOld: 50000,
  rebateNew: { limit: 1200000, max: 60000, marginalRelief: true },
  rebateOld: { limit: 500000, max: 12500, marginalRelief: false },
  // [income above which the rate applies, surcharge rate]
  surchargeNew: [[5000000, 0.10], [10000000, 0.15], [20000000, 0.25]],
  surchargeOld: [[5000000, 0.10], [10000000, 0.15], [20000000, 0.25], [50000000, 0.37]],
  cess: 0.04,
  cap80C: 150000,
  cap80DSelf: { u60: 25000, senior: 50000 },
  cap80DParents: 50000, // 25,000, or 50,000 if a parent is 60+
  cap24b: 200000, // self-occupied home, old regime only
  cap80CCD1B: 50000,
  nps2Old: 0.10, // employer NPS, share of basic + DA
  nps2New: 0.14,
  hraMetro: 0.5,
  hraOther: 0.4,
  hraRentFloor: 0.1,
  // Shares of a company not listed in India
  ltcgRate: 0.125,
  ltcgAfterMonths: 24, // long-term if held MORE than this
  ltcgSurchargeCap: 0.15,
  // Payroll conventions
  pfRate: 0.12,
  gratuityRate: 0.0481, // 15/26 of a month's basic per year ÷ 12 months
};
const YEARS = {
  '2026-27': { label: 'Tax year 2026-27', hraCities: 'Mumbai, Delhi, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad' },
  '2025-26': { label: 'FY 2025-26', hraCities: 'Mumbai, Delhi, Kolkata, Chennai' },
};

initPage();
const tabs = initTabs();
const tip = createTooltip();

/* ---------- Tax engine ---------- */
export function slabTax(income, slabs) {
  let tax = 0;
  let prev = 0;
  const rows = [];
  for (const [upto, rate] of slabs) {
    const amt = Math.max(0, Math.min(income, upto) - prev);
    rows.push({ from: prev, to: upto, rate, amt, tax: amt * rate });
    tax += amt * rate;
    prev = upto;
  }
  return { tax, rows };
}

// Full tax on slab-rate income: slab tax → rebate (+ marginal relief) → surcharge (+ marginal relief) → cess.
export function computeTax(taxable, regime, age = 'u60') {
  taxable = Math.max(0, taxable);
  const slabs = regime === 'new' ? RULES.newSlabs : RULES.oldSlabs[age];
  const { tax: base, rows } = slabTax(taxable, slabs);
  const rb = regime === 'new' ? RULES.rebateNew : RULES.rebateOld;
  let rebate = 0;
  if (taxable <= rb.limit) rebate = Math.min(base, rb.max);
  else if (rb.marginalRelief && base > taxable - rb.limit) rebate = base - (taxable - rb.limit);
  const afterRebate = base - rebate;

  let rate = 0;
  let thr = 0;
  for (const [t, r] of regime === 'new' ? RULES.surchargeNew : RULES.surchargeOld) if (taxable > t) { rate = r; thr = t; }
  const surchargeFull = afterRebate * rate;
  let surchargeRelief = 0;
  if (rate > 0) {
    const atThreshold = computeTax(thr, regime, age).preCess;
    const cap = atThreshold + (taxable - thr);
    if (afterRebate + surchargeFull > cap) surchargeRelief = afterRebate + surchargeFull - cap;
  }
  const surcharge = surchargeFull - surchargeRelief;
  const preCess = afterRebate + surcharge;
  const cess = preCess * RULES.cess;
  return { taxable, base, rows, rebate, surchargeRate: rate, surchargeFull, surchargeRelief, surcharge, preCess, cess, total: Math.round(preCess + cess) };
}

/* ---------- Formatting ---------- */
const r0 = (n) => inr(Math.round(n));
const pctTxt = (r) => `${+(r * 100).toFixed(2)}%`;
function inWords(n) {
  if (!Number.isFinite(n) || n < 1000) return '';
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} crore`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} lakh`;
  return `₹${+(n / 1e3).toFixed(1)} thousand`;
}
const lakh = (n) => (n === Infinity ? '' : n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} cr` : `₹${+(n / 1e5).toFixed(2)} L`);
const usd = (n) => (Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 }) : '–');
const tile = (lab, value, sub, cls = '') =>
  `<div class="tile ${cls}"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

/* ---------- State in the URL ---------- */
// Each input: key, default, kind ('inr' | 'usd' | 'pct' | 'num'), label, container id
const FIELDS = [
  // Regime tab
  { k: 'g', d: 2000000, kind: 'inr', label: 'Gross salary (yearly)', box: 'ri-income' },
  { k: 'oi', d: 0, kind: 'inr', label: 'Other income (interest, rent…)', box: 'ri-income' },
  { k: 'basic', d: 800000, kind: 'inr', label: 'Basic + DA (yearly)', box: 'ri-income', help: 'Used for HRA and the employer NPS limit' },
  { k: 'hra', d: 320000, kind: 'inr', label: 'HRA received (yearly)', box: 'ri-hra' },
  { k: 'rent', d: 300000, kind: 'inr', label: 'Rent paid (yearly)', box: 'ri-hra' },
  { k: 'c80', d: 150000, kind: 'inr', label: '80C (PF, PPF, ELSS, insurance…)', box: 'ri-ded', cap: () => RULES.cap80C },
  { k: 'd80', d: 25000, kind: 'inr', label: '80D health insurance, self & family', box: 'ri-ded', cap: () => (S.age === 'u60' ? RULES.cap80DSelf.u60 : RULES.cap80DSelf.senior) },
  { k: 'd80p', d: 0, kind: 'inr', label: '80D health insurance, parents', box: 'ri-ded', cap: () => RULES.cap80DParents },
  { k: 'hl', d: 0, kind: 'inr', label: 'Home-loan interest, 24(b)', box: 'ri-ded', cap: () => RULES.cap24b },
  { k: 'nps1b', d: 0, kind: 'inr', label: 'Own NPS, 80CCD(1B)', box: 'ri-ded', cap: () => RULES.cap80CCD1B },
  { k: 'nps2', d: 0, kind: 'inr', label: 'Employer NPS, 80CCD(2)', box: 'ri-ded', help: 'Both regimes · limit 10% of basic (old), 14% (new)' },
  // In-hand tab
  { k: 'ctc', d: 2500000, kind: 'inr', label: 'CTC (yearly)', box: 'ih-fields' },
  { k: 'bp', d: 50, kind: 'pct', label: 'Basic as % of CTC', box: 'ih-fields' },
  { k: 'vp', d: 10, kind: 'pct', label: 'Variable / bonus as % of CTC', box: 'ih-fields' },
  // RSU tab
  { k: 'sh', d: 50, kind: 'num', label: 'Shares vesting', box: 'rsu-fields' },
  { k: 'px', d: 200, kind: 'usd', label: 'Market price on vest date (US$)', box: 'rsu-fields' },
  { k: 'en', d: 20, kind: 'num', label: 'Shares bought', box: 'espp-fields' },
  { k: 'ps', d: 180, kind: 'usd', label: 'Price at offer start (US$)', box: 'espp-fields' },
  { k: 'pp', d: 200, kind: 'usd', label: 'Price on purchase date (US$)', box: 'espp-fields' },
  { k: 'dc', d: 15, kind: 'pct', label: 'Purchase discount', box: 'espp-fields' },
  { k: 'fx', d: 94, kind: 'num', label: '₹ per US$ at vest / purchase', box: 'tax-fields', help: 'Example: about ₹94 in early Nov 2026. Use the SBI TT buying rate your employer used.' },
  { k: 'sp', d: 220, kind: 'usd', label: 'Sale price (US$)', box: 'tax-fields' },
  { k: 'sfx', d: 94, kind: 'num', label: '₹ per US$ at sale', box: 'tax-fields' },
  { k: 'hm', d: 30, kind: 'num', label: 'Months held before selling', box: 'tax-fields' },
];
const CHOICES = {
  yr: { d: '2026-27', ok: Object.keys(YEARS) },
  age: { d: 'u60', ok: ['u60', '60', '80'] },
  metro: { d: '1', ok: ['0', '1'] },
  pf: { d: 'full', ok: ['full', '25000', '15000', 'none'] },
  gr: { d: '1', ok: ['0', '1'] },
  pt: { d: '2500', ok: ['2500', '2400', '0'] },
  ihr: { d: 'new', ok: ['new', 'old'] },
  sv: { d: 'new', ok: ['new', 'old'] },
  lb: { d: '1', ok: ['0', '1'] },
  slab: { d: '0.3', ok: ['0.3', '0.25', '0.2', '0.15', '0.1', '0.05', '0'] },
  sc: { d: '0', ok: ['0', '0.1', '0.15', '0.25', '0.37'] },
};
const params = new URLSearchParams(location.search);
const S = {};
for (const f of FIELDS) {
  const v = Number(params.get(f.k));
  S[f.k] = params.has(f.k) && Number.isFinite(v) && v >= 0 ? v : f.d;
}
for (const [k, c] of Object.entries(CHOICES)) S[k] = c.ok.includes(params.get(k)) ? params.get(k) : c.d;

function syncUrl() {
  const p = new URLSearchParams();
  for (const f of FIELDS) if (S[f.k] !== f.d) p.set(f.k, String(S[f.k]));
  for (const [k, c] of Object.entries(CHOICES)) if (S[k] !== c.d) p.set(k, S[k]);
  const q = p.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
}

/* ---------- Inputs ---------- */
const fmtField = (f, v) => (f.kind === 'inr' ? v.toLocaleString('en-IN') : v.toLocaleString('en-US', { maximumFractionDigits: 4 }));
function buildFields() {
  for (const f of FIELDS) {
    const box = document.getElementById(f.box);
    const lab = document.createElement('label');
    lab.className = 'field';
    const pre = f.kind === 'inr' ? '₹' : f.kind === 'usd' ? '$' : '';
    const post = f.kind === 'pct' ? '%' : '';
    lab.innerHTML = `<span>${esc(f.label)}</span>
      <div class="input-wrap">${pre ? `<span class="pre">${pre}</span>` : ''}<input class="input-num${pre ? '' : ' sfx'}" type="text" inputmode="decimal" autocomplete="off" id="f-${f.k}" data-k="${f.k}">${post ? `<span class="post">${post}</span>` : ''}</div>
      <span class="words" id="w-${f.k}">${f.help ? esc(f.help) : ''}</span>`;
    box.appendChild(lab);
    const input = lab.querySelector('input');
    input.value = fmtField(f, S[f.k]);
    input.addEventListener('input', () => {
      const raw = input.value.replace(/[^\d.]/g, '');
      const v = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(v)) return;
      S[f.k] = v;
      renderAll();
    });
    input.addEventListener('blur', () => { input.value = fmtField(f, S[f.k]); });
  }
}
function fieldNotes() {
  for (const f of FIELDS) {
    const el = document.getElementById(`w-${f.k}`);
    const cap = f.cap?.();
    if (cap != null && S[f.k] > cap) el.innerHTML = `<span class="cap">Capped at ${esc(inr(cap))}</span>`;
    else if (f.kind === 'inr' && S[f.k] >= 1000 && !f.help) el.textContent = inWords(S[f.k]);
    else el.textContent = f.help || '';
  }
}

function bindSeg(id, key) {
  const seg = document.getElementById(id);
  const paint = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S[key])));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    S[key] = b.dataset.v;
    renderAll();
  });
  return paint;
}

/* ---------- Regime tab ---------- */
export function regimeCalc(s) {
  const salary = s.g;
  const basic = s.basic;
  const capSelf = s.age === 'u60' ? RULES.cap80DSelf.u60 : RULES.cap80DSelf.senior;
  const hraEx = s.rent > 0
    ? Math.max(0, Math.min(s.hra, s.rent - RULES.hraRentFloor * basic, (s.metro === '1' ? RULES.hraMetro : RULES.hraOther) * basic))
    : 0;
  const d = {
    hra: hraEx,
    c80: Math.min(s.c80, RULES.cap80C),
    d80: Math.min(s.d80, capSelf) + Math.min(s.d80p, RULES.cap80DParents),
    hl: Math.min(s.hl, RULES.cap24b),
    nps1b: Math.min(s.nps1b, RULES.cap80CCD1B),
  };
  const oldOnly = d.hra + d.c80 + d.d80 + d.hl + d.nps1b;
  const stdOld = Math.min(RULES.stdOld, salary);
  const stdNew = Math.min(RULES.stdNew, salary);
  const npsOld = Math.min(s.nps2, RULES.nps2Old * basic);
  const npsNew = Math.min(s.nps2, RULES.nps2New * basic);
  const gross = salary + s.oi;
  const oldBase = gross - stdOld - npsOld; // before old-only deductions
  const oldT = computeTax(oldBase - oldOnly, 'old', s.age);
  const newT = computeTax(gross - stdNew - npsNew, 'new');
  // Break-even: smallest old-only deduction total at which old tax ≤ new tax.
  let breakEven = 0;
  if (computeTax(oldBase, 'old', s.age).total > newT.total) {
    let lo = 0;
    let hi = Math.max(0, oldBase);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (computeTax(oldBase - mid, 'old', s.age).total <= newT.total) hi = mid; else lo = mid;
    }
    breakEven = hi;
  }
  return { d, oldOnly, stdOld, stdNew, npsOld, npsNew, gross, oldT, newT, breakEven };
}

function renderRegime() {
  const R = regimeCalc(S);
  const diff = R.oldT.total - R.newT.total;
  const winner = diff > 0 ? 'new' : diff < 0 ? 'old' : 'tie';
  document.getElementById('regime-answer').innerHTML = winner === 'tie'
    ? `Both regimes come to <mark>${esc(r0(R.newT.total))}</mark> of tax.`
    : `The <b>${winner} regime</b> costs <mark>${esc(r0(Math.abs(diff)))}</mark> less tax a year, which is ${esc(r0(Math.abs(diff) / 12))} more take-home a month.`;
  const beSub = R.breakEven === 0
    ? 'Old regime already matches or beats the new one'
    : `You have ${r0(R.oldOnly)} · ${R.oldOnly >= R.breakEven ? 'enough' : `${r0(R.breakEven - R.oldOnly)} short`}`;
  document.getElementById('regime-tiles').innerHTML = [
    tile('New regime tax', esc(r0(R.newT.total)), `On ${r0(R.newT.taxable)} taxable`, winner === 'new' ? 'win' : ''),
    tile('Old regime tax', esc(r0(R.oldT.total)), `On ${r0(R.oldT.taxable)} taxable`, winner === 'old' ? 'win' : ''),
    tile('Difference', esc(r0(Math.abs(diff))), winner === 'tie' ? 'Same either way' : `${winner === 'new' ? 'New' : 'Old'} regime is lower · ${r0(Math.abs(diff) / 12)} a month`),
    tile('Old regime break-even', esc(r0(R.breakEven)), beSub),
  ].join('');

  const negs = (n) => (n ? `−${r0(n)}` : '–');
  const rows = [
    ['Salary + other income', r0(R.gross), r0(R.gross)],
    ['Standard deduction', negs(R.stdOld), negs(R.stdNew)],
    ['HRA exemption', negs(R.d.hra), '–'],
    ['80C', negs(R.d.c80), '–'],
    ['80D', negs(R.d.d80), '–'],
    ['Home-loan interest', negs(R.d.hl), '–'],
    ['Own NPS 80CCD(1B)', negs(R.d.nps1b), '–'],
    ['Employer NPS 80CCD(2)', negs(R.npsOld), negs(R.npsNew)],
    ['Taxable income', r0(R.oldT.taxable), r0(R.newT.taxable), 'total'],
    ['Tax on slabs', r0(R.oldT.base), r0(R.newT.base)],
    ['Rebate 87A / marginal relief', negs(R.oldT.rebate), negs(R.newT.rebate)],
    ['Surcharge', R.oldT.surcharge ? `${r0(R.oldT.surcharge)} (${pctTxt(R.oldT.surchargeRate)})` : '–', R.newT.surcharge ? `${r0(R.newT.surcharge)} (${pctTxt(R.newT.surchargeRate)})` : '–'],
    ['Surcharge marginal relief', R.oldT.surchargeRelief ? `incl. −${r0(R.oldT.surchargeRelief)}` : '–', R.newT.surchargeRelief ? `incl. −${r0(R.newT.surchargeRelief)}` : '–'],
    ['Cess 4%', r0(R.oldT.cess), r0(R.newT.cess)],
    ['Total tax', r0(R.oldT.total), r0(R.newT.total), 'total'],
  ];
  document.querySelector('#steps-table tbody').innerHTML = rows
    .map(([k, a, b, cls]) => `<tr${cls ? ` class="${cls}"` : ''}><th class="sticky" style="font-weight:550">${esc(k)}</th><td class="n">${esc(a)}</td><td class="n">${esc(b)}</td></tr>`)
    .join('');

  const T = S.sv === 'new' ? R.newT : R.oldT;
  document.querySelector('#slab-table tbody').innerHTML = T.rows
    .map((r) => `<tr${r.amt ? '' : ' class="dim"'}><th class="sticky" style="font-weight:550">${r.to === Infinity ? `Above ${lakh(r.from)}` : `${r.from ? lakh(r.from) : '₹0'} – ${lakh(r.to)}`}</th><td class="n">${pctTxt(r.rate)}</td><td class="n">${esc(r0(r.amt))}</td><td class="n">${esc(r0(r.tax))}</td></tr>`)
    .join('') + `<tr class="total"><th class="sticky">Slab tax</th><td></td><td class="n">${esc(r0(T.taxable))}</td><td class="n">${esc(r0(T.base))}</td></tr>`;
}

/* ---------- In-hand tab ---------- */
export function inHandCalc(s) {
  const basic = s.ctc * s.bp / 100;
  const pfBase = s.pf === 'none' ? 0 : s.pf === 'full' ? basic : Math.min(basic, Number(s.pf) * 12);
  const erPF = RULES.pfRate * pfBase;
  const grat = s.gr === '1' ? RULES.gratuityRate * basic : 0;
  const gross = Math.max(0, s.ctc - erPF - grat);
  const variable = Math.min(gross, s.ctc * s.vp / 100);
  const eePF = erPF;
  const pt = Number(s.pt);
  const taxOn = (sal) => {
    if (s.ihr === 'new') return computeTax(sal - Math.min(RULES.stdNew, sal), 'new');
    return computeTax(sal - Math.min(RULES.stdOld, sal) - pt - Math.min(eePF, RULES.cap80C), 'old', 'u60');
  };
  const tax = taxOn(gross).total;
  const taxFixed = taxOn(gross - variable).total;
  const yearly = gross - eePF - pt - tax;
  const monthlyFixed = (gross - variable - eePF - pt - taxFixed) / 12;
  return { basic, pfBase, erPF, grat, gross, variable, eePF, pt, tax, taxFixed, yearly, monthlyFixed };
}

function renderInHand() {
  const H = inHandCalc(S);
  document.getElementById('ih-answer').innerHTML = `On a CTC of <b>${esc(r0(S.ctc))}</b>, about <mark>${esc(r0(H.monthlyFixed))}</mark> reaches your account each month, plus about ${esc(r0(H.variable - (H.tax - H.taxFixed)))} of variable pay after tax.`;
  document.getElementById('ih-tiles').innerHTML = [
    tile('Monthly in-hand', esc(r0(H.monthlyFixed)), 'Fixed pay only, tax spread over 12 months'),
    tile('Yearly in-hand', esc(r0(H.yearly)), `With full variable pay · ${r0(H.yearly / 12)} a month on average`),
    tile('Income tax', esc(r0(H.tax)), `${S.ihr === 'new' ? 'New' : 'Old'} regime · ${(H.tax / Math.max(1, H.gross) * 100).toFixed(1)}% of gross salary`),
    tile('Gross salary', esc(r0(H.gross)), 'CTC minus employer PF and gratuity'),
  ].join('');

  const steps = [
    { k: 'CTC', v: S.ctc, type: 'total' },
    { k: 'Employer PF', v: -H.erPF },
    { k: 'Gratuity', v: -H.grat },
    { k: 'Gross salary', v: H.gross, type: 'total' },
    { k: 'Your PF', v: -H.eePF },
    { k: 'Professional tax', v: -H.pt },
    { k: 'Income tax', v: -H.tax },
    { k: 'In-hand (yearly)', v: H.yearly, type: 'end' },
  ];
  const share = (n) => (S.ctc ? `${(Math.abs(n) / S.ctc * 100).toFixed(1)}%` : '–');
  document.querySelector('#wf-table tbody').innerHTML = steps
    .map((s) => `<tr${s.type ? ' class="total"' : ''}><th class="sticky" style="font-weight:${s.type ? 700 : 550}">${s.type ? '' : '− '}${esc(s.k)}</th><td class="n${s.v < 0 ? ' neg' : ''}">${esc(r0(Math.abs(s.v)))}</td><td class="n${s.v < 0 ? ' neg' : ''}">${esc(r0(Math.abs(s.v) / 12))}</td><td class="n">${share(s.v)}</td></tr>`)
    .join('') + `<tr class="dim"><th class="sticky" style="font-weight:550">of which variable pay</th><td class="n">${esc(r0(H.variable))}</td><td class="n">–</td><td class="n">${share(H.variable)}</td></tr>`;
  drawWaterfall(steps.filter((s) => s.type || s.v !== 0));
}

function drawWaterfall(steps) {
  const host = document.getElementById('wf-chart');
  const W = host.clientWidth;
  if (!W) return;
  const rowH = 34;
  const labelW = W < 520 ? 104 : 150;
  const valW = W < 520 ? 74 : 96;
  const top = 4;
  const H = top + steps.length * rowH + 4;
  const max = Math.max(1, ...steps.map((s) => Math.abs(s.v)));
  const plotW = W - labelW - valW - 8;
  const x = (v) => labelW + (v / max) * plotW;
  let run = 0;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<line class="gridline" x1="${labelW}" x2="${labelW}" y1="0" y2="${H}"/>`;
  steps.forEach((s, i) => {
    let a;
    let b;
    let fill;
    if (s.type) { a = 0; b = s.v; run = s.v; fill = s.type === 'end' ? 'var(--s3)' : 'var(--s1)'; } else { a = run + s.v; b = run; run = a; fill = 'var(--s2)'; }
    const y = top + i * rowH + 7;
    const h = rowH - 14;
    const x0 = x(Math.min(a, b));
    const w = Math.max(1, x(Math.max(a, b)) - x0);
    const r = Math.min(4, w / 2);
    // Bar with 4px rounded end on the right.
    const path = `M${x0},${y}H${x0 + w - r}Q${x0 + w},${y} ${x0 + w},${y + r}V${y + h - r}Q${x0 + w},${y + h} ${x0 + w - r},${y + h}H${x0}Z`;
    const t = `<b>${esc(s.k)}</b><br>${s.v < 0 ? '−' : ''}${esc(r0(Math.abs(s.v)))} a year · ${esc(r0(Math.abs(s.v) / 12))} a month`;
    svg += `<g data-tip="${esc(t)}"><rect x="0" y="${top + i * rowH}" width="${W}" height="${rowH}" fill="transparent"/>`
      + `<text x="${labelW - 8}" y="${y + h / 2 + 4}" text-anchor="end">${esc(s.k)}</text>`
      + `<path d="${path}" fill="${fill}"/>`
      + `<text class="val" x="${x0 + w + 6}" y="${y + h / 2 + 4}">${s.v < 0 ? '−' : ''}${esc(Math.abs(s.v) >= 1e5 ? lakh(Math.abs(s.v)) : r0(Math.abs(s.v)))}</text></g>`;
  });
  host.innerHTML = `${svg}</svg>`;
}
const wf = document.getElementById('wf-chart');
wf.addEventListener('mousemove', (e) => {
  const g = e.target.closest('[data-tip]');
  if (g) tip.show(g.dataset.tip, e.clientX, e.clientY); else tip.hide();
});
wf.addEventListener('mouseleave', () => tip.hide());

/* ---------- RSU / ESPP tab ---------- */
export function rsuCalc(s) {
  const slab = Number(s.slab);
  const sc = Number(s.sc);
  const salaryTax = (x) => Math.max(0, x) * slab * (1 + sc) * (1 + RULES.cess);
  const longTerm = s.hm > RULES.ltcgAfterMonths;
  const gainsTax = (g) => (g <= 0 ? 0 : longTerm
    ? g * RULES.ltcgRate * (1 + Math.min(sc, RULES.ltcgSurchargeCap)) * (1 + RULES.cess)
    : salaryTax(g));
  const rsu = { shares: s.sh, fmv: s.px, paid: 0 };
  const buy = (1 - s.dc / 100) * (s.lb === '1' ? Math.min(s.ps, s.pp) : s.pp);
  const espp = { shares: s.en, fmv: s.pp, paid: buy };
  for (const o of [rsu, espp]) {
    o.perqUsd = Math.max(0, o.fmv - o.paid) * o.shares;
    o.perq = o.perqUsd * s.fx;
    o.vestTax = salaryTax(o.perq);
    o.cost = Math.max(o.fmv, o.paid) * o.shares * s.fx; // amount paid + amount already taxed
    o.sale = o.shares * s.sp * s.sfx;
    o.gain = o.sale - o.cost;
    o.saleTax = gainsTax(o.gain);
  }
  return { rsu, espp, longTerm, buy };
}

function renderRsu() {
  const X = rsuCalc(S);
  const { rsu, espp } = X;
  const kind = X.longTerm ? 'Long-term (held over 24 months)' : 'Short-term (24 months or less)';
  document.getElementById('rsu-answer').innerHTML = `Vesting and buying these shares adds <mark>${esc(r0(rsu.perq + espp.perq))}</mark> to your salary, with about ${esc(r0(rsu.vestTax + espp.vestTax))} of tax on it.`;
  document.getElementById('rsu-tiles').innerHTML = [
    tile('RSU perquisite', esc(r0(rsu.perq)), `${rsu.shares} × ${usd(rsu.fmv)} × ₹${S.fx}`),
    tile('Tax at vest', esc(r0(rsu.vestTax)), `At ${pctTxt(Number(S.slab))} slab${Number(S.sc) ? ` + ${pctTxt(Number(S.sc))} surcharge` : ''} + 4% cess`),
    tile('ESPP perquisite', esc(r0(espp.perq)), `Paid ${usd(X.buy)} a share vs ${usd(espp.fmv)} market`),
    tile('Tax at purchase', esc(r0(espp.vestTax)), 'Same slab rate as salary'),
    tile('Tax on sale', esc(r0(rsu.saleTax + espp.saleTax)), `${X.longTerm ? 'LTCG 12.5%' : 'STCG at slab'} on ${r0(Math.max(0, rsu.gain) + Math.max(0, espp.gain))} gain`),
  ].join('');
  document.getElementById('rsu-hint').textContent = kind;
  const row = (k, a, b, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th class="sticky" style="font-weight:550">${esc(k)}</th><td class="n">${esc(a)}</td><td class="n">${esc(b)}</td></tr>`;
  document.querySelector('#rsu-table tbody').innerHTML = [
    row('Shares', String(rsu.shares), String(espp.shares)),
    row('Market price at vest / purchase', usd(rsu.fmv), usd(espp.fmv)),
    row('You paid a share', usd(0), usd(espp.paid)),
    row('Perquisite (US$)', usd(rsu.perqUsd), usd(espp.perqUsd)),
    row(`Perquisite at ₹${S.fx} per $`, r0(rsu.perq), r0(espp.perq), 'total'),
    row('Tax at vest / purchase', r0(rsu.vestTax), r0(espp.vestTax)),
    row('Cost for capital gains', r0(rsu.cost), r0(espp.cost)),
    row(`Sale value at ${usd(S.sp)} × ₹${S.sfx}`, r0(rsu.sale), r0(espp.sale)),
    row(rsu.gain < 0 || espp.gain < 0 ? 'Gain (loss)' : 'Gain', rsu.gain < 0 ? `(${r0(-rsu.gain)})` : r0(rsu.gain), espp.gain < 0 ? `(${r0(-espp.gain)})` : r0(espp.gain)),
    row(X.longTerm ? 'Tax on sale: 12.5% LTCG + cess' : 'Tax on sale: slab rate + cess', r0(rsu.saleTax), r0(espp.saleTax), 'total'),
  ].join('');
}

/* ---------- About tab ---------- */
function renderAbout() {
  const y = YEARS[S.yr];
  document.getElementById('about-tiles').innerHTML = [
    tile('Standard deduction', '₹75,000', 'New regime · ₹50,000 in the old'),
    tile('Zero tax up to', '₹12 lakh', 'Taxable income, new regime (rebate up to ₹60,000)'),
    tile('Cess', '4%', 'On tax plus surcharge, both regimes'),
    tile('Top surcharge', '25%', 'New regime · 37% in the old, above ₹5 crore'),
    tile('LTCG on foreign shares', '12.5%', 'Held over 24 months · no indexation'),
  ].join('');
  document.querySelector('#new-slab-ref tbody').innerHTML = RULES.newSlabs.map(([to, rate], i, a) => {
    const from = i ? a[i - 1][0] : 0;
    return `<tr><th class="sticky" style="font-weight:550">${to === Infinity ? `Above ${lakh(from)}` : `${from ? lakh(from) : '₹0'} – ${lakh(to)}`}</th><td class="n">${pctTxt(rate)}</td></tr>`;
  }).join('');
  const bounds = [0, 250000, 300000, 500000, 1000000, Infinity];
  const rateAt = (slabs, v) => slabs.find(([to]) => v < to)[1];
  document.querySelector('#old-slab-ref tbody').innerHTML = bounds.slice(0, -1).map((from, i) => {
    const to = bounds[i + 1];
    return `<tr><th class="sticky" style="font-weight:550">${to === Infinity ? `Above ${lakh(from)}` : `${from ? lakh(from) : '₹0'} – ${lakh(to)}`}</th>${['u60', '60', '80'].map((a) => `<td class="n">${pctTxt(rateAt(RULES.oldSlabs[a], from))}</td>`).join('')}</tr>`;
  }).join('');
  const L = [
    ['Standard deduction (salary)', inr(RULES.stdOld), inr(RULES.stdNew)],
    ['Rebate 87A', `Up to ${inr(RULES.rebateOld.max)} if taxable ≤ ${lakh(RULES.rebateOld.limit)}`, `Up to ${inr(RULES.rebateNew.max)} if taxable ≤ ${lakh(RULES.rebateNew.limit)}, marginal relief above`],
    ['Surcharge', '10% > ₹50 L · 15% > ₹1 cr · 25% > ₹2 cr · 37% > ₹5 cr', '10% > ₹50 L · 15% > ₹1 cr · 25% > ₹2 cr (cap)'],
    ['Cess', '4% of tax + surcharge', '4% of tax + surcharge'],
    ['HRA exemption', `Lowest of HRA, rent − 10% of basic, 50% of basic (${y.hraCities}) or 40% elsewhere`, 'Not allowed'],
    ['80C', `${inr(RULES.cap80C)}`, 'Not allowed'],
    ['80D', '₹25,000 self & family (₹50,000 if 60+), plus up to ₹50,000 for parents', 'Not allowed'],
    ['Home-loan interest 24(b), self-occupied', inr(RULES.cap24b), 'Not allowed'],
    ['Own NPS 80CCD(1B)', inr(RULES.cap80CCD1B), 'Not allowed'],
    ['Employer NPS 80CCD(2)', '10% of basic + DA', '14% of basic + DA'],
    ['Professional tax', 'Deductible from salary', 'Not deductible'],
    ['Employer PF', '12% of basic, on full basic or capped wages (₹25,000 a month from 17 Sep 2026; ₹15,000 before)', 'Same'],
    ['Gratuity in CTC', '4.81% of basic (15 days per year ÷ 26 working days ÷ 12 months), a payroll convention', 'Same'],
    ['Foreign shares, sale', 'LTCG 12.5% if held over 24 months, surcharge capped at 15%; STCG at slab', 'Same'],
  ];
  document.querySelector('#limits-table tbody').innerHTML = L.map(([k, a, b]) => `<tr><th class="sticky" style="font-weight:550">${esc(k)}</th><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('');
}

/* ---------- Wiring ---------- */
buildFields();
const paints = [bindSeg('age-seg', 'age'), bindSeg('slab-seg', 'sv'), bindSeg('pf-seg', 'pf'), bindSeg('ih-reg-seg', 'ihr')];
const yrEl = document.getElementById('yr');
const metroEl = document.getElementById('metro');
const gratEl = document.getElementById('grat');
const ptEl = document.getElementById('pt');
const lbEl = document.getElementById('lb');
const slabEl = document.getElementById('slab');
const scEl = document.getElementById('sc');
yrEl.addEventListener('change', () => { S.yr = yrEl.value; renderAll(); });
metroEl.addEventListener('change', () => { S.metro = metroEl.checked ? '1' : '0'; renderAll(); });
gratEl.addEventListener('change', () => { S.gr = gratEl.checked ? '1' : '0'; renderAll(); });
ptEl.addEventListener('change', () => { S.pt = ptEl.value; renderAll(); });
lbEl.addEventListener('change', () => { S.lb = lbEl.checked ? '1' : '0'; renderAll(); });
slabEl.addEventListener('change', () => { S.slab = slabEl.value; renderAll(); });
scEl.addEventListener('change', () => { S.sc = scEl.value; renderAll(); });

function renderAll() {
  paints.forEach((p) => p());
  yrEl.value = S.yr;
  metroEl.checked = S.metro === '1';
  gratEl.checked = S.gr === '1';
  ptEl.value = S.pt;
  lbEl.checked = S.lb === '1';
  slabEl.value = S.slab;
  scEl.value = S.sc;
  document.getElementById('metro-lbl').textContent = `Rented home in ${YEARS[S.yr].hraCities} (50% of basic)`;
  fieldNotes();
  renderRegime();
  renderInHand();
  renderRsu();
  renderAbout();
  syncUrl();
}

document.addEventListener('tabchange', (e) => { if (e.detail === 'in-hand') renderInHand(); });
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderInHand, 150); });

renderAll();
tabs.goToHash();
// Expose the engine for the test page and the curious.
window.__tax = { RULES, computeTax, regimeCalc, inHandCalc, rsuCalc, S };
