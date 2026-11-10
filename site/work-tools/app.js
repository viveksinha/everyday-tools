import { initPage, initTabs, esc, inr } from '../assets/site.js';

initPage();
const tabs = initTabs();

/* ---------- Settings you might want to change ---------- */
const DEFAULTS = {
  hoursPerYear: 2000, // 40 h × 50 weeks
  perYear: { weekly: 52, daily: 250 }, // 250 ≈ 2,000 h ÷ 8 h days
  workStart: 9,
  workEnd: 18,
};
const CURRENCIES = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
// Shown first in every time-zone picker. Everything else comes from Intl.supportedValuesOf('timeZone').
const COMMON_ZONES = [
  ['Asia/Kolkata', 'India (Kolkata, Mumbai, Bengaluru)'],
  ['Europe/London', 'London'],
  ['America/New_York', 'New York'],
  ['America/Chicago', 'Chicago'],
  ['America/Denver', 'Denver'],
  ['America/Los_Angeles', 'San Francisco, Los Angeles'],
  ['America/Toronto', 'Toronto'],
  ['America/Sao_Paulo', 'São Paulo'],
  ['Europe/Berlin', 'Berlin'],
  ['Europe/Paris', 'Paris'],
  ['Europe/Amsterdam', 'Amsterdam'],
  ['Africa/Lagos', 'Lagos'],
  ['Africa/Johannesburg', 'Johannesburg'],
  ['Asia/Dubai', 'Dubai'],
  ['Asia/Karachi', 'Karachi'],
  ['Asia/Dhaka', 'Dhaka'],
  ['Asia/Singapore', 'Singapore'],
  ['Asia/Shanghai', 'Shanghai'],
  ['Asia/Tokyo', 'Tokyo'],
  ['Australia/Sydney', 'Sydney'],
  ['Pacific/Auckland', 'Auckland'],
  ['UTC', 'UTC'],
];

/* ---------- URL state shared by all tabs ---------- */
const params = new URLSearchParams(location.search);
function setParams(obj) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') p.delete(k);
    else p.set(k, String(v));
  }
  const q = p.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
}
const intParam = (k, def, min = 0, max = Infinity) => {
  const v = Number(params.get(k));
  return params.has(k) && Number.isFinite(v) && v >= min && v <= max ? v : def;
};
const pick = (k, allowed, def) => (allowed.includes(params.get(k)) ? params.get(k) : def);
const setSeg = (el, v) => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
const onSeg = (el, fn) => el.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  setSeg(el, b.dataset.v);
  fn(b.dataset.v);
});
const tile = (lab, value, sub) =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div></div>`;

/* =====================================================================
   1. MEETING COST
   ===================================================================== */
function money(n, cur, d) {
  if (!Number.isFinite(n)) return '–';
  const digits = d ?? (Math.abs(n) >= 100 ? 0 : 2);
  if (cur === 'INR') return inr(n, digits);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}
function inWords(n, cur) {
  if (!Number.isFinite(n) || n < 1000) return '';
  if (cur === 'INR') {
    if (n >= 1e7) return `${+(n / 1e7).toFixed(2)} crore`;
    if (n >= 1e5) return `${+(n / 1e5).toFixed(2)} lakh`;
    return `${+(n / 1e3).toFixed(1)} thousand`;
  }
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)} million`;
  return `${+(n / 1e3).toFixed(1)} thousand`;
}
const parseAmt = (s) => {
  const v = Number(String(s).replace(/[^\d.]/g, ''));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

function parseRows(s) {
  if (!s) return null;
  const rows = s.split(';').map((r) => {
    const [label, count, amt, basis, cur] = r.split('~');
    return {
      label: (label || '').slice(0, 40),
      count: Math.max(0, Math.round(Number(count) || 0)),
      amt: Math.max(0, Number(amt) || 0),
      basis: basis === 'h' ? 'h' : 'y',
      cur: CURRENCIES[cur] ? cur : 'INR',
    };
  }).filter((r) => r.label || r.count || r.amt);
  return rows.length ? rows.slice(0, 12) : null;
}
const cleanLabel = (s) => s.replace(/[~;]/g, ' ');
const encodeRows = (rows) => rows.map((r) => [cleanLabel(r.label), r.count, r.amt, r.basis, r.cur].join('~')).join(';');

const m = {
  rows: parseRows(params.get('r')) ?? [
    { label: 'Engineer', count: 4, amt: 2500000, basis: 'y', cur: 'INR' },
    { label: 'Manager', count: 1, amt: 4000000, basis: 'y', cur: 'INR' },
  ],
  dur: intParam('dur', 60, 1, 24 * 60),
  hpy: intParam('hpy', DEFAULTS.hoursPerYear, 1, 8784),
  rec: pick('rec', ['once', 'weekly', 'daily'], 'once'),
  per: null,
};
m.per = intParam('per', m.rec === 'once' ? DEFAULTS.perYear.weekly : DEFAULTS.perYear[m.rec], 1, 366);

const rowsEl = document.getElementById('m-rows');
const hourly = (r) => (r.basis === 'h' ? r.amt : r.amt / m.hpy);

function rowHtml(r, i) {
  const curOpts = Object.entries(CURRENCIES).map(([k, s]) => `<option value="${k}"${k === r.cur ? ' selected' : ''}>${s} ${k}</option>`).join('');
  return `<div class="mrow" data-i="${i}">
    <input class="input-num f-label" type="text" data-f="label" value="${esc(r.label)}" aria-label="Role" placeholder="Role">
    <input class="input-num" type="number" data-f="count" min="0" step="1" value="${r.count}" aria-label="People">
    <input class="input-num" type="text" inputmode="decimal" data-f="amt" value="${esc(r.amt.toLocaleString(r.cur === 'INR' ? 'en-IN' : 'en-US'))}" aria-label="Pay per person">
    <select class="select" data-f="basis" aria-label="Per"><option value="y"${r.basis === 'y' ? ' selected' : ''}>year</option><option value="h"${r.basis === 'h' ? ' selected' : ''}>hour</option></select>
    <select class="select" data-f="cur" aria-label="Currency">${curOpts}</select>
    <button class="btn rm" type="button" data-rm="${i}" aria-label="Remove role" title="Remove role">×</button>
    <div class="rate" data-rate="${i}"></div>
  </div>`;
}
function renderRows() {
  rowsEl.innerHTML = m.rows.map(rowHtml).join('');
  updateRates();
}
function updateRates() {
  m.rows.forEach((r, i) => {
    const el = rowsEl.querySelector(`[data-rate="${i}"]`);
    if (!el) return;
    const w = r.basis === 'y' ? inWords(r.amt, r.cur) : '';
    el.textContent = `${w ? `${w} a year · ` : ''}${money(hourly(r), r.cur)} an hour each`;
  });
}

// Totals per currency, so mixed-currency meetings aren't silently converted.
function totals(minutes) {
  const t = {};
  for (const r of m.rows) {
    if (!r.count || !r.amt) continue;
    t[r.cur] = (t[r.cur] || 0) + r.count * hourly(r) * (minutes / 60);
  }
  return t;
}
const fmtTotals = (t, d) => {
  const keys = Object.keys(t);
  return keys.length ? keys.map((k) => money(t[k], k, d)).join(' + ') : money(0, m.rows[0]?.cur || 'INR');
};
const people = () => m.rows.reduce((s, r) => s + (r.count || 0), 0);

function renderMeeting(sync = true) {
  const cost = totals(m.dur);
  const perHour = totals(60);
  const perMin = totals(1);
  const n = people();
  const recurring = m.rec !== 'once';
  document.getElementById('m-per-wrap').hidden = !recurring;
  document.getElementById('m-per-hint').textContent = m.rec === 'daily' ? `Default ${DEFAULTS.perYear.daily}: working days in a year` : `Default ${DEFAULTS.perYear.weekly}: weeks in a year`;
  const yearly = Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, v * m.per]));
  const yearlyHours = (n * m.dur * m.per) / 60;
  document.getElementById('m-answer').innerHTML = n
    ? `A ${m.dur}-minute meeting with <b>${n} ${n === 1 ? 'person' : 'people'}</b> costs about <mark>${esc(fmtTotals(cost))}</mark> in salary time${recurring ? `, or <b>${esc(fmtTotals(yearly))}</b> a year if it happens ${m.per} times` : ''}.`
    : 'Add at least one person with a salary or hourly rate.';
  document.getElementById('m-tiles').innerHTML = [
    tile('This meeting', esc(fmtTotals(cost)), `${m.dur} min · ${n} ${n === 1 ? 'person' : 'people'}`),
    tile('Per hour of meeting', esc(fmtTotals(perHour)), 'Everyone in the room, together'),
    tile('Per minute', esc(fmtTotals(perMin, 2)), 'Each extra minute adds this'),
    recurring ? tile(`Per year (${m.rec})`, esc(fmtTotals(yearly)), `${m.per} meetings · ${Math.round(yearlyHours).toLocaleString('en-IN')} person-hours`) : tile('Person-hours', (n * m.dur / 60).toLocaleString('en-IN', { maximumFractionDigits: 1 }), 'Time spent across everyone'),
  ].join('');
  renderTimer();
  if (sync) setParams({ r: encodeRows(m.rows), dur: m.dur, hpy: m.hpy, rec: m.rec, per: recurring ? m.per : null });
}

rowsEl.addEventListener('input', (e) => {
  const row = e.target.closest('.mrow');
  if (!row) return;
  const r = m.rows[+row.dataset.i];
  const f = e.target.dataset.f;
  if (f === 'label') r.label = e.target.value.slice(0, 40);
  else if (f === 'count') r.count = Math.max(0, Math.round(Number(e.target.value) || 0));
  else if (f === 'amt') r.amt = parseAmt(e.target.value);
  else if (f === 'basis') r.basis = e.target.value;
  else if (f === 'cur') r.cur = e.target.value;
  updateRates();
  renderMeeting();
});
rowsEl.addEventListener('focusout', (e) => {
  if (e.target.dataset.f !== 'amt') return;
  const r = m.rows[+e.target.closest('.mrow').dataset.i];
  e.target.value = r.amt.toLocaleString(r.cur === 'INR' ? 'en-IN' : 'en-US');
});
rowsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b) return;
  m.rows.splice(+b.dataset.rm, 1);
  if (!m.rows.length) m.rows.push({ label: '', count: 1, amt: 0, basis: 'y', cur: 'INR' });
  renderRows();
  renderMeeting();
});
document.getElementById('m-add').addEventListener('click', () => {
  if (m.rows.length >= 12) return;
  const last = m.rows.at(-1);
  m.rows.push({ label: '', count: 1, amt: 0, basis: last?.basis || 'y', cur: last?.cur || 'INR' });
  renderRows();
  renderMeeting();
  rowsEl.querySelector('.mrow:last-of-type .f-label')?.focus();
});
const durEl = document.getElementById('m-dur');
const hpyEl = document.getElementById('m-hpy');
const perEl = document.getElementById('m-per');
durEl.value = m.dur;
hpyEl.value = m.hpy;
perEl.value = m.per;
durEl.addEventListener('input', () => { const v = Number(durEl.value); if (v > 0) { m.dur = v; renderMeeting(); } });
hpyEl.addEventListener('input', () => { const v = Number(hpyEl.value); if (v > 0) { m.hpy = v; updateRates(); renderMeeting(); } });
perEl.addEventListener('input', () => { const v = Number(perEl.value); if (v > 0) { m.per = v; renderMeeting(); } });
const recEl = document.getElementById('m-rec');
setSeg(recEl, m.rec);
onSeg(recEl, (v) => {
  m.rec = v;
  if (v !== 'once') { m.per = DEFAULTS.perYear[v]; perEl.value = m.per; }
  renderMeeting();
});

/* Live timer */
const timer = { running: false, startedAt: 0, banked: 0, id: 0 };
const elapsedMs = () => timer.banked + (timer.running ? performance.now() - timer.startedAt : 0);
function renderTimer() {
  const ms = elapsedMs();
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  document.getElementById('t-clock').textContent = `${hh}:${mm}:${ss}`;
  document.getElementById('t-cost').textContent = fmtTotals(totals(ms / 60000), 2);
}
const startBtn = document.getElementById('t-start');
startBtn.addEventListener('click', () => {
  if (timer.running) {
    timer.banked = elapsedMs();
    timer.running = false;
    clearInterval(timer.id);
    startBtn.textContent = 'Resume';
  } else {
    timer.startedAt = performance.now();
    timer.running = true;
    timer.id = setInterval(renderTimer, 250);
    startBtn.textContent = 'Pause';
  }
  renderTimer();
});
document.getElementById('t-reset').addEventListener('click', () => {
  clearInterval(timer.id);
  Object.assign(timer, { running: false, startedAt: 0, banked: 0 });
  startBtn.textContent = 'Start';
  renderTimer();
});

renderRows();
renderMeeting(false);

/* =====================================================================
   2. TIME ZONES (all offsets come from Intl; nothing hard-coded)
   ===================================================================== */
const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }
  return fmtCache.get(tz);
}
function partsAt(ms, tz) {
  const p = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}
function offsetMin(ms, tz) {
  const p = partsAt(ms, tz);
  return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000) / 60000;
}
// UTC instant of a wall-clock time in a zone. Two passes settle DST edges.
function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const o1 = offsetMin(guess, tz);
  let t = guess - o1 * 60000;
  const o2 = offsetMin(t, tz);
  if (o2 !== o1) t = guess - o2 * 60000;
  return t;
}
function offsetLabel(ms, tz) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName')?.value || '';
  } catch {
    const o = offsetMin(ms, tz);
    return `GMT${o >= 0 ? '+' : '−'}${Math.floor(Math.abs(o) / 60)}${Math.abs(o) % 60 ? `:${String(Math.abs(o) % 60).padStart(2, '0')}` : ''}`;
  }
}
const validTz = (tz) => { try { fmt(tz); return true; } catch { return false; } };
const COMMON_MAP = new Map(COMMON_ZONES);
const zoneName = (tz) => COMMON_MAP.get(tz) || tz.split('/').pop().replace(/_/g, ' ');
const shortName = (tz) => zoneName(tz).split(' (')[0];

let allZones = [];
try { allZones = Intl.supportedValuesOf('timeZone'); } catch { allZones = []; }
const commonResolved = new Set(COMMON_ZONES.flatMap(([z]) => { try { return [z, new Intl.DateTimeFormat('en-US', { timeZone: z }).resolvedOptions().timeZone]; } catch { return [z]; } }));
const otherZones = allZones.filter((z) => !commonResolved.has(z));
const zoneOptions = (sel) => {
  const extra = !COMMON_MAP.has(sel) && !otherZones.includes(sel) ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : '';
  return `${extra}<optgroup label="Common">${COMMON_ZONES.map(([z, l]) => `<option value="${z}"${z === sel ? ' selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>
  <optgroup label="All time zones">${otherZones.map((z) => `<option value="${esc(z)}"${z === sel ? ' selected' : ''}>${esc(z.replace(/_/g, ' '))}</option>`).join('')}</optgroup>`;
};
const hourOpts = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

function parseZones(s) {
  if (!s) return null;
  const z = s.split(';').map((x) => {
    const [tz, a, b] = x.split(',');
    const ws = Number(a);
    const we = Number(b);
    return validTz(tz) ? {
      tz,
      ws: Number.isInteger(ws) && ws >= 0 && ws <= 23 ? ws : DEFAULTS.workStart,
      we: Number.isInteger(we) && we >= 1 && we <= 24 ? we : DEFAULTS.workEnd,
    } : null;
  }).filter(Boolean).slice(0, 6);
  return z.length >= 1 ? z : null;
}
const tzs = {
  zones: parseZones(params.get('z')) ?? [
    { tz: 'Asia/Kolkata', ws: 9, we: 18 },
    { tz: 'Europe/London', ws: 9, we: 18 },
    { tz: 'America/New_York', ws: 9, we: 18 },
  ],
  date: isIso(params.get('d')) ? params.get('d') : todayIso(),
};
while (tzs.zones.length < 2) tzs.zones.push({ tz: 'UTC', ws: 9, we: 18 });

const tzRowsEl = document.getElementById('tz-rows');
function renderTzRows() {
  tzRowsEl.innerHTML = tzs.zones.map((z, i) => `<div class="tzrow" data-i="${i}">
    <select class="select f-zone" data-f="tz" aria-label="Time zone ${i + 1}">${zoneOptions(z.tz)}</select>
    <select class="select" data-f="ws" aria-label="Work starts">${hourOpts(z.ws, 0, 23)}</select>
    <select class="select" data-f="we" aria-label="Work ends">${hourOpts(z.we, 1, 24)}</select>
    <span class="now" data-now="${i}"></span>
    <button class="btn rm" type="button" data-rm="${i}" aria-label="Remove place" title="Remove place"${tzs.zones.length <= 2 ? ' disabled' : ''}>×</button>
  </div>`).join('');
  document.getElementById('tz-add').disabled = tzs.zones.length >= 6;
  renderNow();
}
function renderNow() {
  const now = Date.now();
  tzs.zones.forEach((z, i) => {
    const el = tzRowsEl.querySelector(`[data-now="${i}"]`);
    if (!el) return;
    const p = partsAt(now, z.tz);
    el.textContent = `Now ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')} · ${offsetLabel(now, z.tz)}`;
  });
}
setInterval(renderNow, 30000);

const localMin = (ms, tz) => { const p = partsAt(ms, tz); return p.h * 60 + p.mi; };
// Is the span [ms, ms + spanMin) inside this person's working hours (in their local time)?
function inWork(ms, z, spanMin) {
  const a = localMin(ms, z.tz);
  const b = a + spanMin;
  const ws = z.ws * 60;
  const we = z.we * 60;
  if (ws < we) return a >= ws && b <= we;
  if (ws === we) return false;
  return a >= ws || b <= we; // overnight shift, e.g. 22 to 6
}
const hhmm = (ms, tz) => { const p = partsAt(ms, tz); return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; };
function dayShift(ms, tz, refIso) {
  const p = partsAt(ms, tz);
  const diff = Math.round((Date.UTC(p.y, p.mo - 1, p.d) - Date.parse(`${refIso}T00:00:00Z`)) / 86400000);
  return diff;
}
const shiftTxt = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '');

const STEP = 15; // minutes
function computeSlots() {
  const [y, mo, d] = tzs.date.split('-').map(Number);
  const ref = tzs.zones[0].tz;
  const base = zonedToUtc(y, mo, d, 0, 0, ref);
  const end = zonedToUtc(...(() => { const n = new Date(Date.UTC(y, mo - 1, d + 1)); return [n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()]; })(), 0, 0, ref);
  const steps = [];
  for (let t = base; t < end; t += STEP * 60000) steps.push({ t, n: tzs.zones.filter((z) => inWork(t, z, STEP)).length });
  return { base, end, steps };
}
function runsWhere(steps, test) {
  const runs = [];
  let cur = null;
  for (const s of steps) {
    if (test(s)) {
      if (cur) cur.to = s.t + STEP * 60000;
      else cur = { from: s.t, to: s.t + STEP * 60000, n: s.n };
    } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs;
}

function renderZones(sync = true) {
  const { base, end, steps } = computeSlots();
  const ref = tzs.zones[0].tz;
  const N = tzs.zones.length;
  const hours = Math.round((end - base) / 3600000);
  const cols = Array.from({ length: hours }, (_, i) => base + i * 3600000);
  const cellState = (t, z) => {
    let c = 0;
    for (let k = 0; k < 60; k += STEP) if (inWork(t + k * 60000, z, STEP)) c++;
    return c === 60 / STEP ? 'work' : c ? 'half' : 'off';
  };
  const colOv = cols.map((t) => tzs.zones.every((z) => cellState(t, z) === 'work'));
  const head = `<thead><tr><th class="sticky">${esc(shortName(ref))} time</th>${cols.map((t, i) => `<th class="n${colOv[i] ? ' ov' : ''}">${hhmm(t, ref).slice(0, 2)}</th>`).join('')}</tr></thead>`;
  const body = tzs.zones.map((z) => {
    const cells = cols.map((t, i) => {
      const st = cellState(t, z);
      const lbl = hhmm(t, z.tz);
      const sh = shiftTxt(dayShift(t, z.tz, tzs.date));
      return `<td class="${st}${colOv[i] ? ' ov' : ''}" title="${esc(zoneName(z.tz))}: ${lbl}${sh ? ` (${sh} day)` : ''}">${lbl.slice(0, 2)}${lbl.endsWith(':00') ? '' : `<span class="mm">:${lbl.slice(3)}</span>`}${sh ? `<sup>${sh}</sup>` : ''}</td>`;
    }).join('');
    return `<tr><th class="sticky">${esc(shortName(z.tz))}<small>${esc(offsetLabel(base + 12 * 3600000, z.tz))} · ${String(z.ws).padStart(2, '0')}–${String(z.we).padStart(2, '0')}</small></th>${cells}</tr>`;
  }).join('');
  document.getElementById('tz-grid').innerHTML = head + `<tbody>${body}</tbody>`;

  // Best slots: runs where everyone is in hours; otherwise runs with the most people in hours.
  let runs = runsWhere(steps, (s) => s.n === N);
  const all = runs.length > 0;
  let best = N;
  if (!all) {
    best = Math.max(...steps.map((s) => s.n));
    runs = best > 0 ? runsWhere(steps, (s) => s.n === best) : [];
  }
  runs.sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.from - b.from);
  const dur = (r) => { const mins = (r.to - r.from) / 60000; const h = Math.floor(mins / 60); const mm = mins % 60; return `${h ? `${h} h` : ''}${h && mm ? ' ' : ''}${mm ? `${mm} min` : ''}`; };
  const whoOut = (r) => tzs.zones.filter((z) => !inWork(r.from, z, STEP)).map((z) => shortName(z.tz));
  const dateLbl = new Date(`${tzs.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const answer = document.getElementById('tz-answer');
  if (all) {
    const total = runs.reduce((s, r) => s + (r.to - r.from), 0) / 60000;
    const r = runs[0];
    answer.innerHTML = `On <b>${esc(dateLbl)}</b> everyone is in working hours for <mark>${esc(dur({ from: 0, to: total * 60000 }))}</mark>, from ${tzs.zones.map((z) => `<b>${hhmm(r.from, z.tz)}–${hhmm(r.to, z.tz)}</b> in ${esc(zoneName(z.tz))}`).join(', ')}.`;
  } else if (best > 0) {
    answer.innerHTML = `On <b>${esc(dateLbl)}</b> no time fits everyone's working hours. The closest options have <mark>${best} of ${N}</mark> places in hours.`;
  } else {
    answer.innerHTML = `On <b>${esc(dateLbl)}</b> nobody is in working hours. Check the hours you set.`;
  }
  document.getElementById('tz-slots-hint').textContent = all ? 'Everyone in working hours · longest first' : 'Closest options · longest first';
  document.getElementById('tz-slots').innerHTML = runs.length
    ? `<thead><tr><th>Length</th>${tzs.zones.map((z) => `<th>${esc(shortName(z.tz))}</th>`).join('')}${all ? '' : '<th>Outside hours</th>'}</tr></thead><tbody>${runs.slice(0, 15).map((r) => `<tr><td class="nowrap"><b>${esc(dur(r))}</b></td>${tzs.zones.map((z) => {
      const sh = shiftTxt(dayShift(r.from, z.tz, tzs.date));
      return `<td class="nowrap">${hhmm(r.from, z.tz)}–${hhmm(r.to, z.tz)}${sh ? ` <span class="muted small">(${sh} day)</span>` : ''}</td>`;
    }).join('')}${all ? '' : `<td>${esc(whoOut(r).join(', '))}</td>`}</tr>`).join('')}</tbody>`
    : '<tbody><tr><td><div class="empty">No slots to show.</div></td></tr></tbody>';
  if (sync) setParams({ z: tzs.zones.map((z) => `${z.tz},${z.ws},${z.we}`).join(';'), d: tzs.date });
}

tzRowsEl.addEventListener('change', (e) => {
  const row = e.target.closest('.tzrow');
  if (!row) return;
  const z = tzs.zones[+row.dataset.i];
  const f = e.target.dataset.f;
  if (f === 'tz') z.tz = e.target.value;
  else z[f] = Number(e.target.value);
  renderNow();
  renderZones();
});
tzRowsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]');
  if (!b || tzs.zones.length <= 2) return;
  tzs.zones.splice(+b.dataset.rm, 1);
  renderTzRows();
  renderZones();
});
document.getElementById('tz-add').addEventListener('click', () => {
  if (tzs.zones.length >= 6) return;
  const used = new Set(tzs.zones.map((z) => z.tz));
  const next = COMMON_ZONES.find(([z]) => !used.has(z))?.[0] || 'UTC';
  tzs.zones.push({ tz: next, ws: DEFAULTS.workStart, we: DEFAULTS.workEnd });
  renderTzRows();
  renderZones();
});
const tzDateEl = document.getElementById('tz-date');
tzDateEl.value = tzs.date;
tzDateEl.addEventListener('change', () => { if (isIso(tzDateEl.value)) { tzs.date = tzDateEl.value; renderZones(); } });

renderTzRows();
renderZones(false);

/* =====================================================================
   3. NOTICE PERIOD (dates as UTC day numbers, so DST never shifts a day)
   ===================================================================== */
const DAY = 86400000;
const toDay = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const toIso = (dn) => new Date(dn * DAY).toISOString().slice(0, 10);
const dow = (dn) => new Date(dn * DAY).getUTCDay(); // 0 = Sunday
const fmtDay = (dn, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => new Date(dn * DAY).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

function parseHolidays(text) {
  const out = new Set();
  let bad = 0;
  for (const tok of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
    let mt = tok.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    let y; let mo; let d;
    if (mt) [, y, mo, d] = mt.map(Number);
    else if ((mt = tok.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [, d, mo, y] = mt.map(Number);
    if (!mt || mo < 1 || mo > 12 || d < 1 || d > 31) { bad++; continue; }
    const t = Date.UTC(y, mo - 1, d);
    if (new Date(t).getUTCDate() !== d) { bad++; continue; }
    out.add(Math.round(t / DAY));
  }
  return { days: out, bad };
}

const n = {
  rd: isIso(params.get('rd')) ? params.get('rd') : todayIso(),
  n: intParam('n', 30, 0, 3650),
  u: pick('u', ['d', 'w', 'm'], 'd'),
  cm: pick('cm', ['cal', 'work'], 'cal'),
  wk: pick('wk', ['ss', 's'], 'ss'),
  st: pick('st', ['next', 'same'], 'next'),
  lv: intParam('lv', 0, 0, 365),
  hol: params.get('hol') || '',
};

function noticeCalc() {
  const weekend = n.wk === 'ss' ? [0, 6] : [0];
  const hol = parseHolidays(n.hol);
  const isWork = (dn) => !weekend.includes(dow(dn)) && !hol.days.has(dn);
  const rd = toDay(n.rd);
  const start = rd + (n.st === 'next' ? 1 : 0);
  const workMode = n.cm === 'work' && n.u !== 'm';
  let end;
  let clamped = false;
  if (n.n === 0) end = start - 1;
  else if (n.u === 'm') {
    const s = new Date(start * DAY);
    const y = s.getUTCFullYear();
    const mo = s.getUTCMonth() + n.n;
    const day = s.getUTCDate();
    const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    if (day > lastDay) { clamped = true; end = Math.round(Date.UTC(y, mo, lastDay) / DAY); } else end = Math.round(Date.UTC(y, mo, day) / DAY) - 1;
  } else if (workMode) {
    const need = n.u === 'w' ? n.n * (7 - weekend.length) : n.n;
    let c = 0;
    end = start - 1;
    for (let dn = start; c < need && dn < start + 4000; dn++) if (isWork(dn)) { c++; end = dn; }
  } else {
    end = start + (n.u === 'w' ? n.n * 7 : n.n) - 1;
  }
  // Last working day: the working day on or before the end, then back by leave days.
  let lwd = end;
  while (lwd >= start && !isWork(lwd)) lwd--;
  const leave = [];
  for (let k = 0; k < n.lv && lwd >= start; k++) {
    leave.push(lwd);
    lwd--;
    while (lwd >= start && !isWork(lwd)) lwd--;
  }
  const valid = lwd >= start;
  const today = toDay(todayIso());
  let workLeft = 0;
  for (let dn = Math.max(today, start); dn <= lwd; dn++) if (isWork(dn)) workLeft++;
  let workInNotice = 0;
  for (let dn = start; dn <= end; dn++) if (isWork(dn)) workInNotice++;
  return { rd, start, end, lwd, valid, leave, hol, isWork, weekend, today, workLeft, workInNotice, clamped, workMode };
}

function renderNotice(sync = true) {
  const r = noticeCalc();
  document.getElementById('n-cm-note').textContent = n.u === 'm' && n.cm === 'work' ? 'Months are always counted on the calendar' : '';
  const hn = document.getElementById('n-hol-note');
  hn.textContent = `${r.hol.days.size} holiday${r.hol.days.size === 1 ? '' : 's'} read${r.hol.bad ? ` · ${r.hol.bad} entr${r.hol.bad === 1 ? 'y' : 'ies'} not understood` : ''} · YYYY-MM-DD or DD/MM/YYYY`;
  const unit = { d: n.n === 1 ? 'day' : 'days', w: n.n === 1 ? 'week' : 'weeks', m: n.n === 1 ? 'month' : 'months' }[n.u];
  const kind = r.workMode ? ' working' : '';
  const ans = document.getElementById('n-answer');
  const tilesEl = document.getElementById('n-tiles');
  if (!r.valid) {
    ans.innerHTML = n.n === 0 ? 'With no notice, your last working day is the day you resign.' : 'The leave balance covers the whole notice period, so there are no working days left.';
    tilesEl.innerHTML = '';
  } else {
    const left = r.lwd - r.today;
    ans.innerHTML = `Resigning on <b>${esc(fmtDay(r.rd))}</b> with ${n.n}${kind} ${unit}' notice, your last working day is <mark>${esc(fmtDay(r.lwd))}</mark>${r.lwd !== r.end ? ` (notice ends ${esc(fmtDay(r.end))})` : ''}.`;
    tilesEl.innerHTML = [
      tile('Last working day', esc(fmtDay(r.lwd, { day: 'numeric', month: 'short', year: 'numeric' })), fmtDay(r.lwd, { weekday: 'long' }) + (n.lv ? ` · after ${r.leave.length} leave day${r.leave.length === 1 ? '' : 's'}` : '')),
      tile('Notice ends', esc(fmtDay(r.end, { day: 'numeric', month: 'short', year: 'numeric' })), `${fmtDay(r.end, { weekday: 'long' })} · ${r.end - r.start + 1} calendar days from ${fmtDay(r.start, { day: 'numeric', month: 'short' })}`),
      tile('Days left from today', left < 0 ? 'Passed' : String(left), left < 0 ? `${-left} days ago` : left === 0 ? 'Today is the day' : `Calendar days until ${fmtDay(r.lwd, { day: 'numeric', month: 'short' })}`),
      tile('Working days left', String(r.workLeft), r.today > r.lwd ? 'None left' : `From ${r.today > r.start ? 'today' : 'the start'}, including the last day`),
      tile('Working days in notice', String(r.workInNotice), `${r.hol.days.size ? 'Holidays and weekends' : 'Weekends'} excluded`),
    ].join('');
  }
  renderCalendar(r);
  if (sync) setParams({ rd: n.rd, n: n.n, u: n.u, cm: n.cm, wk: n.wk, st: n.st, lv: n.lv || null, hol: [...r.hol.days].sort().map(toIso).join(',') || null });
}

function renderCalendar(r) {
  const from = new Date(Math.min(r.rd, r.start) * DAY);
  const to = new Date(Math.max(r.end, r.rd) * DAY);
  const months = [];
  let y = from.getUTCFullYear();
  let mo = from.getUTCMonth();
  while ((y < to.getUTCFullYear() || (y === to.getUTCFullYear() && mo <= to.getUTCMonth())) && months.length < 14) {
    months.push([y, mo]);
    mo++;
    if (mo > 11) { mo = 0; y++; }
  }
  const leave = new Set(r.leave);
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  document.getElementById('n-cal').innerHTML = months.map(([yy, mm]) => {
    const first = Math.round(Date.UTC(yy, mm, 1) / DAY);
    const len = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const pad = (dow(first) + 6) % 7; // Monday first
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push('<span></span>');
    for (let d = 0; d < len; d++) {
      const dn = first + d;
      const c = ['d'];
      if (dn >= r.start && dn <= r.end) c.push('notice');
      if (r.weekend.includes(dow(dn))) c.push('wkend');
      if (r.hol.days.has(dn)) c.push('hol');
      if (leave.has(dn)) c.push('leave');
      if (r.valid && dn === r.lwd) c.push('lwd');
      if (dn === r.rd) c.push('rd');
      if (dn === r.today) c.push('today');
      cells.push(`<span class="${c.join(' ')}" title="${esc(fmtDay(dn))}">${d + 1}</span>`);
    }
    return `<div class="n-month"><h4>${new Date(first * DAY).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h4><div class="n-days">${DOW.map((x) => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div></div>`;
  }).join('') + (months.length >= 14 ? '<p class="small muted">Showing the first 14 months.</p>' : '');
}

const rdEl = document.getElementById('n-rd');
const nEl = document.getElementById('n-n');
const lvEl = document.getElementById('n-lv');
const holEl = document.getElementById('n-hol');
rdEl.value = n.rd;
nEl.value = n.n;
lvEl.value = n.lv;
holEl.value = n.hol.split(',').filter(Boolean).join('\n');
rdEl.addEventListener('change', () => { if (isIso(rdEl.value)) { n.rd = rdEl.value; renderNotice(); } });
nEl.addEventListener('input', () => { const v = Number(nEl.value); if (Number.isFinite(v) && v >= 0 && v <= 3650) { n.n = Math.round(v); renderNotice(); } });
lvEl.addEventListener('input', () => { const v = Number(lvEl.value); if (Number.isFinite(v) && v >= 0 && v <= 365) { n.lv = Math.round(v); renderNotice(); } });
holEl.addEventListener('input', () => { n.hol = holEl.value; renderNotice(); });
[['n-u', 'u'], ['n-cm', 'cm'], ['n-wk', 'wk'], ['n-st', 'st']].forEach(([id, key]) => {
  const el = document.getElementById(id);
  setSeg(el, n[key]);
  onSeg(el, (v) => { n[key] = v; renderNotice(); });
});
renderNotice(false);

tabs.goToHash();
