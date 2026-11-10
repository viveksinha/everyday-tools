import { initPage, initTabs, createPager, createTooltip, esc, inr, fixed } from '../assets/site.js';
import { sip, goal, fdVsFunds, TAX } from './calc.js';
import { columnChart, wireChart } from './chart.js';
import { createForm, inWords } from './form.js';

initPage();
const tabs = initTabs();
const tip = createTooltip();

// Defaults are round examples. Pre-tax rates on the FD tab are placeholders; enter today's rates.
const SPEC = {
  amt: { kind: 'money', def: 10000 },
  su: { kind: 'num', min: 0, max: 50, def: 0 },
  ret: { kind: 'num', min: 0, max: 40, def: 12 },
  yrs: { kind: 'int', min: 1, max: 50, def: 10 },
  lump: { kind: 'money0', def: 0 },
  inf: { kind: 'num', min: 0, max: 20, def: 6 },
  gt: { kind: 'money', def: 10000000 },
  gy: { kind: 'int', min: 1, max: 50, def: 15 },
  ginf: { kind: 'num', min: 0, max: 20, def: 6 },
  gret: { kind: 'num', min: 0, max: 40, def: 12 },
  gsu: { kind: 'num', min: 0, max: 50, def: 0 },
  famt: { kind: 'money', def: 1000000 },
  fy: { kind: 'num', min: 0.5, max: 30, def: 3 },
  fslab: { kind: 'select', opts: ['0', '5', '10', '15', '20', '25', '30'], def: '30' },
  fdr: { kind: 'num', min: 0, max: 20, def: 7 },
  dr: { kind: 'num', min: 0, max: 20, def: 7 },
  ar: { kind: 'num', min: 0, max: 20, def: 6.5 },
  fsen: { kind: 'check', def: false },
};
const GROUP = { amt: 'sip', su: 'sip', ret: 'sip', yrs: 'sip', lump: 'sip', inf: 'sip', gt: 'goal', gy: 'goal', ginf: 'goal', gret: 'goal', gsu: 'goal' };
const form = createForm(SPEC, (k) => {
  const g = GROUP[k] || 'fd';
  if (g === 'sip') { sipLimit = 15; renderSip(); }
  else if (g === 'goal') { goalLimit = 15; renderGoal(); }
  else renderFd();
});
const S = form.state;

const pctTxt = (v, d = 1) => `${fixed(v, d)}%`;
const yrs = (n) => `${fixed(n, Number.isInteger(n) ? 0 : 1)} year${n === 1 ? '' : 's'}`;
const words = (n) => { const w = inWords(n); return w ? `₹${w}` : inr(Math.round(n)); };
const tile = (lab, value, sub, cls = '') =>
  `<div class="tile ${cls}"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

/* ---------- SIP ---------- */
let sipLimit = 15;
let sipRes = null;
const sipPager = createPager(document.getElementById('sip-pager'), { onMore: () => { sipLimit += 15; renderSipTable(); } });

function renderSip() {
  sipRes = sip({ monthly: S.amt, stepUpPct: S.su, ratePct: S.ret, years: S.yrs, lump: S.lump, inflationPct: S.inf });
  const r = sipRes;
  const lumpTxt = S.lump > 0 ? ` plus ${inr(S.lump)} up front` : '';
  const suTxt = S.su > 0 ? `, rising ${pctTxt(S.su, 0)} a year,` : '';
  document.getElementById('sip-answer').innerHTML =
    `${inr(S.amt)} a month${suTxt}${lumpTxt} for ${yrs(S.yrs)} at ${pctTxt(S.ret, 1)} grows to <mark>${inr(Math.round(r.value))}</mark>: ${inr(Math.round(r.invested))} invested and ${inr(Math.round(r.gains))} of gains.`;
  const lastSip = r.rows.at(-1).monthly;
  document.getElementById('sip-tiles').innerHTML = [
    tile('Final value', inr(Math.round(r.value)), words(r.value), 'hl'),
    tile('Invested', inr(Math.round(r.invested)), `${fixed((r.invested / r.value) * 100, 0)}% of the final value`),
    tile('Gains', inr(Math.round(r.gains)), `${fixed(r.value / r.invested, 2)}× the money put in`),
    tile("In today's ₹", inr(Math.round(r.real)), `At ${pctTxt(S.inf, 1)} inflation`),
    S.su > 0 ? tile('SIP in the last year', inr(Math.round(lastSip)), `Up from ${inr(S.amt)}`) : '',
  ].join('');
  drawSip();
  renderSipTable();
}

function drawSip() {
  if (!sipRes) return;
  const rows = sipRes.rows;
  columnChart(document.getElementById('sip-chart'), {
    labels: rows.map((x) => `Y${x.y}`),
    series: [
      { name: 'Invested', color: 'var(--s1)', values: rows.map((x) => x.invested) },
      { name: 'Gains', color: 'var(--s3)', values: rows.map((x) => Math.max(0, x.gains)) },
    ],
    tip: (i) => `<b>End of year ${rows[i].y}</b><br>Value ${inr(Math.round(rows[i].value))}<br>Invested ${inr(Math.round(rows[i].invested))}<br>Gains ${inr(Math.round(rows[i].gains))}`,
  });
}

function renderSipTable() {
  const rows = sipRes.rows;
  const shown = rows.slice(0, sipLimit);
  document.querySelector('#sip-table tbody').innerHTML = shown.map((x) => `<tr><td class="sticky"><b>${x.y}</b></td><td class="n">${inr(Math.round(x.monthly))}</td><td class="n">${inr(Math.round(x.yearIn + (x.y === 1 ? S.lump : 0)))}</td><td class="n">${inr(Math.round(x.invested))}</td><td class="n"><b>${inr(Math.round(x.value))}</b></td><td class="n">${inr(Math.round(x.gains))}</td><td class="n">${inr(Math.round(x.real))}</td></tr>`).join('');
  sipPager.update(shown.length, rows.length);
  document.getElementById('sip-hint').textContent = `Values at the end of each year${rows.length > 15 ? ' · 15 at a time · scroll for more' : ''}`;
}

/* ---------- Goal ---------- */
let goalLimit = 15;
let goalRes = null;
const goalPager = createPager(document.getElementById('goal-pager'), { onMore: () => { goalLimit += 15; renderGoalTable(); } });

function renderGoal() {
  goalRes = goal({ targetToday: S.gt, years: S.gy, inflationPct: S.ginf, ratePct: S.gret, stepUpPct: S.gsu });
  const g = goalRes;
  const suTxt = S.gsu > 0 ? `, rising ${pctTxt(S.gsu, 0)} a year` : '';
  document.getElementById('goal-answer').innerHTML =
    `${words(S.gt)} at today's prices will cost about ${words(g.future)} in ${yrs(S.gy)}. Invest <mark>${inr(Math.round(g.monthly))} a month</mark>${suTxt} at ${pctTxt(S.gret, 1)}, or <b>${inr(Math.round(g.lump))}</b> once today.`;
  document.getElementById('goal-tiles').innerHTML = [
    tile('Monthly SIP needed', inr(Math.round(g.monthly)), S.gsu > 0 ? `In year 1, then +${pctTxt(S.gsu, 0)} a year` : 'Same amount every month', 'hl'),
    tile('Or a lumpsum today', inr(Math.round(g.lump)), words(g.lump)),
    tile('Goal in future ₹', inr(Math.round(g.future)), `${words(S.gt)} at ${pctTxt(S.ginf, 1)} inflation`),
    tile('Total put in by SIP', inr(Math.round(g.invested)), `${fixed((g.invested / g.future) * 100, 0)}% of the goal; returns do the rest`),
  ].join('');
  renderGoalTable();
}

function renderGoalTable() {
  const rows = goalRes.plan.rows;
  const shown = rows.slice(0, goalLimit);
  document.querySelector('#goal-table tbody').innerHTML = shown.map((x) => `<tr><td class="sticky"><b>${x.y}</b></td><td class="n">${inr(Math.round(x.monthly))}</td><td class="n">${inr(Math.round(x.invested))}</td><td class="n">${inr(Math.round(x.value))}</td><td class="n">${fixed(Math.min(100, (x.value / goalRes.future) * 100), 0)}%</td></tr>`).join('');
  goalPager.update(shown.length, rows.length);
  document.getElementById('goal-hint').textContent = `Following the SIP plan${rows.length > 15 ? ' · 15 at a time · scroll for more' : ''}`;
}

/* ---------- FD vs funds ---------- */
function renderFd() {
  const slab = Number(S.fslab) / 100;
  const res = fdVsFunds({ amount: S.famt, years: S.fy, slab, fdPct: S.fdr, debtPct: S.dr, arbPct: S.ar });
  const rates = { fd: S.fdr, debt: S.dr, arb: S.ar };
  const best = [...res.rows].sort((a, b) => b.post - a.post)[0];
  const tied = res.rows.filter((r) => Math.abs(r.post - best.post) < 1).length > 1;
  document.getElementById('fd-answer').innerHTML = tied
    ? `After ${yrs(S.fy)} and tax at the ${S.fslab}% slab, the top options leave about <mark>${inr(Math.round(best.post))}</mark> from ${inr(S.famt)}.`
    : `After ${yrs(S.fy)} and tax at the ${S.fslab}% slab, ${inr(S.famt)} grows most in the <b>${best.name.toLowerCase()}</b>: <mark>${inr(Math.round(best.post))}</mark>, or ${pctTxt(best.cagr * 100, 2)} a year after tax.`;
  document.getElementById('fd-tiles').innerHTML = res.rows.map((r) =>
    tile(r.name, inr(Math.round(r.post)), `${pctTxt(r.cagr * 100, 2)} a year after tax · tax ${inr(Math.round(r.tax))}`, r === best && !tied ? 'hl' : '')).join('');
  document.querySelector('#fd-table tbody').innerHTML = res.rows.map((r) => `<tr><td class="sticky"><b>${esc(r.name)}</b></td><td class="n">${pctTxt(rates[r.key], 2)}</td><td class="n">${inr(Math.round(r.pre))}</td><td class="n">${inr(Math.round(r.tax))}</td><td class="n${r === best ? ' win' : ''}">${inr(Math.round(r.post))}</td><td class="n">${pctTxt(r.cagr * 100, 2)}</td><td>${esc(r.rule)}</td></tr>`).join('');
  const maxC = Math.max(...res.rows.map((r) => r.cagr), 0.0001);
  document.getElementById('fd-barlist').innerHTML = res.rows.map((r, i) => `<div class="bar-row"><div class="bl-label"><b>${esc(r.name)}</b><span>${inr(Math.round(r.post))} after tax</span></div><div class="bl-track"><span class="bl-fill" style="width:${Math.max(0, (r.cagr / maxC) * 100)}%;background:var(--s${i + 1})"></span></div><div class="bl-val">${pctTxt(r.cagr * 100, 2)}</div></div>`).join('');
  const lim = S.fsen ? TAX.fdTdsThresholdSenior : TAX.fdTdsThreshold;
  const y1 = res.fdYear1Interest;
  document.getElementById('fd-hint').textContent = y1 > lim
    ? `FD interest in year 1 is ${inr(Math.round(y1))}, above ${inr(lim)}: the bank deducts 10% TDS (${inr(Math.round(y1 * TAX.fdTdsRate))}), credited against your tax`
    : `FD interest in year 1 is ${inr(Math.round(y1))}, under the ${inr(lim)} TDS limit for one bank`;
}

/* ---------- Wiring ---------- */
wireChart(document.getElementById('sip-chart'), tip, drawSip);
document.addEventListener('tabchange', (e) => { if (e.detail === 'sip') drawSip(); });

renderSip();
renderGoal();
renderFd();
tabs.goToHash();
