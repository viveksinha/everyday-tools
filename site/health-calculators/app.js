import { initPage, initTabs, createTooltip, esc, inr, fixed } from '../assets/site.js';

initPage();
const tabs = initTabs();

/* =====================================================================
   Guidance constants (checked Nov 2026; sources on the About tab)
   ===================================================================== */
// Protein, g per kg body weight per day.
const GOALS = [
  { id: 'sedentary', name: 'Mostly sitting, little exercise', lo: 0.83, hi: 0.83, src: 'ICMR-NIN 2024 RDA' },
  { id: 'active', name: 'Regular exercise (cardio, sport)', lo: 1.2, hi: 1.6, src: 'Lower half of ACSM/AND/DC 2016 (1.2–2.0)' },
  { id: 'strength', name: 'Strength training to build muscle', lo: 1.6, hi: 2.2, src: 'Morton 2018 meta-analysis (1.6, 95% CI to 2.2)' },
  { id: 'older', name: 'Over 65', lo: 1.0, hi: 1.2, src: 'PROT-AGE 2013' },
];
const LB = 0.45359237;

// Indian Food Composition Tables 2017 (ICMR-NIN): protein g per 100 g edible portion.
// diet: lowest diet that includes it (vegan < veg < egg < nonveg).
const FOODS = [
  { code: 'B013', name: 'Masoor dal (lentil)', per100: 24.35, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'B010', name: 'Moong dal (green gram)', per100: 23.88, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'B003', name: 'Urad dal (black gram)', per100: 23.06, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'B021', name: 'Toor / arhar dal (red gram)', per100: 21.7, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'B001', name: 'Chana dal (Bengal gram)', per100: 21.55, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'B002', name: 'Kala chana, whole', per100: 18.77, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'B020', name: 'Rajma, red', per100: 19.91, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'B025', name: 'Soya bean, white', per100: 37.8, g: 30, serving: '30 g dry', diet: 'vegan' },
  { code: 'H012', name: 'Groundnut (peanut)', per100: 23.65, g: 30, serving: '30 g', diet: 'vegan' },
  { code: 'H001', name: 'Almond', per100: 18.41, g: 30, serving: '30 g', diet: 'vegan' },
  { code: 'A019', name: 'Wheat flour (atta)', per100: 10.57, g: 60, serving: '60 g flour', diet: 'vegan' },
  { code: 'A015', name: 'Rice, milled', per100: 7.94, g: 75, serving: '75 g raw', diet: 'vegan' },
  { code: 'L003', name: 'Paneer', per100: 18.86, g: 50, serving: '50 g', diet: 'veg' },
  { code: 'L002', name: 'Cow milk, whole', per100: 3.26, g: 250, serving: '250 g (a glass)', diet: 'veg' },
  { code: 'L001', name: 'Buffalo milk, whole', per100: 3.68, g: 250, serving: '250 g (a glass)', diet: 'veg' },
  { code: 'M004', name: 'Egg, whole, boiled', per100: 13.43, g: 50, serving: '1 egg (≈50 g)', diet: 'egg' },
  { code: 'N003', name: 'Chicken breast, skinless', per100: 21.81, g: 100, serving: '100 g raw', diet: 'nonveg' },
  { code: 'S006', name: 'Rohu fish', per100: 19.71, g: 100, serving: '100 g raw', diet: 'nonveg' },
];
const DIET_RANK = { vegan: 0, veg: 1, egg: 2, nonveg: 3 };

// Caffeine per drink, mg. Brews vary; these are typical values.
const DRINKS = [
  { id: 'filter', name: 'Filter coffee (kaapi), ~150 ml', mg: 100, src: 'Estimate. No lab study found; blogs give 80–120 mg' },
  { id: 'brewed', name: 'Brewed / drip coffee, 240 ml', mg: 96, src: 'Mayo Clinic' },
  { id: 'instant', name: 'Instant coffee, 240 ml', mg: 62, src: 'Mayo Clinic' },
  { id: 'espresso', name: 'Espresso, single shot (30 ml)', mg: 64, src: 'Mayo Clinic (63–64 mg across editions)' },
  { id: 'chai', name: 'Chai, ~150 ml cup', mg: 30, src: 'Scaled from Mayo Clinic black tea, 47 mg per 240 ml; strong chai has more' },
  { id: 'green', name: 'Green tea, 240 ml', mg: 28, src: 'Mayo Clinic' },
  { id: 'cola', name: 'Cola, 330 ml can', mg: 40, src: 'Scaled from Mayo Clinic, 22–33 mg per 240 ml' },
  { id: 'energy', name: 'Energy drink, 250 ml can (India)', mg: 75, src: 'FSSAI cap of 300 mg per litre' },
  { id: 'custom', name: 'Something else', mg: 50, src: 'Type the mg from the label' },
];
const LIMIT_DAY = 400; // FDA, EFSA: healthy adults
const LIMIT_DOSE = 200; // EFSA single dose
const DAY_START = 5 * 60; // the day runs 05:00 to 05:00
const DAYS_PER_MONTH = 30;

/* =====================================================================
   Pure arithmetic (exported for checks)
   ===================================================================== */
export const proteinRange = (kg, goal) => [kg * goal.lo, kg * goal.hi];
export const perGramProtein = (p) => p.price / (p.pack_g * p.protein / 100);
export const monthlyPowder = (gapG, ppg) => Math.max(0, gapG) * DAYS_PER_MONTH * ppg;
// Minutes since DAY_START for an "HH:MM" string.
export const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  const t = (h * 60 + (m || 0)) % 1440;
  return (t - DAY_START + 1440) % 1440;
};
export const caffeineAt = (drinks, tMin, halfLifeH) =>
  drinks.reduce((s, d) => {
    const dt = tMin - toMin(d.time);
    return dt < 0 ? s : s + d.mg * 0.5 ** (dt / 60 / halfLifeH);
  }, 0);
export const monthly = (perServing, servings) => perServing * servings * DAYS_PER_MONTH;

/* =====================================================================
   Helpers
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const tile = (lab, value, sub) =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub">${esc(sub)}</div></div>`;
const numOr = (v, d, min = -Infinity, max = Infinity) => {
  const x = Number(v);
  return v != null && v !== '' && Number.isFinite(x) && x >= min && x <= max ? x : d;
};
const clock = (min) => {
  const t = (min + DAY_START) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;
};
const g0 = (n) => `${Math.round(n)}`;

/* =====================================================================
   Load sibling data (whey, supplements, magnesium)
   ===================================================================== */
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
const [whey, supp, mag] = await Promise.all([
  getJson('../whey-protein/data.json').catch(() => null),
  getJson('../supplements/data.json').catch(() => null),
  getJson('../magnesium/data.json').catch(() => null),
]);
if (!whey || !supp || !mag) {
  const el = $('load-error');
  el.hidden = false;
  el.textContent = "Couldn't load some product data, so powder and supplement prices may be missing. If you opened this file from disk, serve the site folder instead.";
}

/* =====================================================================
   URL state
   ===================================================================== */
const P = new URLSearchParams(location.search);
const state = {
  w: numOr(P.get('w'), 70, 20, 400),
  u: P.get('u') === 'lb' ? 'lb' : 'kg',
  goal: GOALS.some((g) => g.id === P.get('goal')) ? P.get('goal') : 'active',
  diet: DIET_RANK[P.get('diet')] != null ? P.get('diet') : 'veg',
  meals: [3, 4, 5].includes(Number(P.get('meals'))) ? Number(P.get('meals')) : 3,
  eat: numOr(P.get('eat'), 50, 0, 400),
  drinks: P.get('d') != null
    ? P.get('d').split('~').filter(Boolean).map((s) => {
      const [t, id, mg] = s.split('.');
      const time = /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : '08:00';
      const def = DRINKS.find((x) => x.id === id) || DRINKS.at(-1);
      return { time, id: def.id, mg: numOr(mg, def.mg, 0, 1000) };
    }).slice(0, 20)
    : [{ time: '08:00', id: 'filter', mg: 100 }, { time: '11:30', id: 'chai', mg: 30 }, { time: '16:30', id: 'chai', mg: 30 }],
  hl: numOr(P.get('hl'), 5, 1.5, 9.5),
  bed: /^\d{2}:\d{2}$/.test(P.get('bed') || '') ? P.get('bed') : '23:00',
  stack: null, // filled after catalogue is built
};
function syncUrl() {
  const p = new URLSearchParams({ w: String(state.w), u: state.u, goal: state.goal, diet: state.diet, meals: String(state.meals), eat: String(state.eat) });
  p.set('d', state.drinks.map((d) => `${d.time.replace(':', '')}.${d.id}.${d.mg}`).join('~'));
  p.set('hl', String(state.hl));
  p.set('bed', state.bed);
  p.set('s', state.stack.map((s) => [s.key, s.serv, s.price ?? '', s.key === 'c' ? s.name : ''].join('*').replace(/\*+$/, '')).join(','));
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
}

/* =====================================================================
   1. Protein
   ===================================================================== */
$('p-goal').innerHTML = GOALS.map((g) => `<option value="${g.id}">${esc(g.name)} · ${g.lo === g.hi ? g.lo : `${g.lo}–${g.hi}`} g/kg</option>`).join('');
const livePowders = whey ? whey.products.filter((p) => /^live/i.test(p.status) && p.price && p.pack_g && p.protein) : [];
if (whey) {
  $('whey-date').textContent = `checked ${whey.checked_label}`;
  $('about-whey-date').textContent = `checked ${whey.checked_label}`;
}

function renderProtein() {
  const kg = state.u === 'kg' ? state.w : state.w * LB;
  const goal = GOALS.find((g) => g.id === state.goal);
  const [lo, hi] = proteinRange(kg, goal);
  const gapLo = Math.max(0, lo - state.eat);
  const gapHi = Math.max(0, hi - state.eat);
  const rangeTxt = Math.round(lo) === Math.round(hi) ? `${g0(lo)} g` : `${g0(lo)}–${g0(hi)} g`;
  $('p-answer').innerHTML = `At <b>${esc(fixed(kg, kg % 1 ? 1 : 0))} kg</b>, aim for about <mark>${rangeTxt} of protein a day</mark>.`;

  const powders = livePowders
    .filter((p) => (state.diet === 'vegan' ? p.type === 'plant' : true))
    .map((p) => ({ ...p, ppg: perGramProtein(p) }))
    .sort((a, b) => a.ppg - b.ppg)
    .slice(0, 5);
  const cheapest = powders[0];

  $('p-tiles').innerHTML = [
    tile('Daily target', rangeTxt, `${goal.lo === goal.hi ? goal.lo : `${goal.lo}–${goal.hi}`} g/kg · ${goal.src}`),
    tile('Per meal', Math.round(lo / state.meals) === Math.round(hi / state.meals) ? `${g0(lo / state.meals)} g` : `${g0(lo / state.meals)}–${g0(hi / state.meals)} g`, `${state.meals} even meals`),
    tile('Gap to fill', gapHi <= 0 ? '0 g' : Math.round(gapLo) === Math.round(gapHi) ? `${g0(gapLo)} g` : `${g0(gapLo)}–${g0(gapHi)} g`, gapHi <= 0 ? `You already eat ${state.eat} g` : `After the ${state.eat} g you already eat`),
    tile('Cheapest powder, a month', cheapest ? (gapHi <= 0 ? '₹0' : `${inr(monthlyPowder(gapLo, cheapest.ppg))}–${inr(monthlyPowder(gapHi, cheapest.ppg)).replace('₹', '')}`) : '–', cheapest ? `${cheapest.brand} at ${inr(cheapest.ppg, 2)} per g protein` : 'No price data'),
  ].join('');

  $('powder-hint').textContent = gapHi <= 0 ? 'No gap at this intake' : `${Math.round(gapLo) === Math.round(gapHi) ? g0(gapLo) : `${g0(gapLo)}–${g0(gapHi)}`} g a day × ${DAYS_PER_MONTH} days${state.diet === 'vegan' ? ' · plant and yeast powders only' : ''}`;
  $('powder-table').querySelector('tbody').innerHTML = powders.length ? powders.map((p) => `<tr>
    <td class="sticky col-name"><div class="pbrand">${esc(p.brand)}</div><div class="pname">${esc(p.product)}</div></td>
    <td>${esc(p.type)}</td>
    <td class="n"><b>${inr(p.ppg, 2)}</b></td>
    <td class="n">${gapHi <= 0 ? '₹0' : `${inr(monthlyPowder(gapLo, p.ppg))}${Math.round(gapLo) === Math.round(gapHi) ? '' : `–${inr(monthlyPowder(gapHi, p.ppg)).replace('₹', '')}`}`}</td>
    <td class="small">${inr(p.price)} for ${fixed(p.pack_g / 1000, 2)} kg · ${p.protein}% protein</td></tr>`).join('')
    : '<tr><td colspan="5"><div class="empty">No powder prices loaded.</div></td></tr>';

  const rank = DIET_RANK[state.diet];
  const foods = FOODS.filter((f) => DIET_RANK[f.diet] <= rank);
  $('food-table').querySelector('tbody').innerHTML = foods.map((f) => {
    const per = f.per100 * f.g / 100;
    return `<tr><th class="sticky">${esc(f.name)}</th><td>${esc(f.serving)}</td><td class="n"><b>${fixed(per, 1)} g</b></td>
      <td class="n">${gapLo <= 0 ? '–' : `${fixed(gapLo / per, 1)}${Math.round(gapLo) === Math.round(gapHi) ? '' : `–${fixed(gapHi / per, 1)}`}`}</td><td class="n">${fixed(f.per100, 1)} g <span class="muted small">${f.code}</span></td></tr>`;
  }).join('');
}

/* =====================================================================
   2. Caffeine
   ===================================================================== */
$('drink-add').innerHTML = DRINKS.map((d) => `<option value="${d.id}">${esc(d.name)} · ${d.mg} mg</option>`).join('');
$('drink-table').querySelector('tbody').innerHTML = DRINKS.filter((d) => d.id !== 'custom').map((d) =>
  `<tr><th class="sticky">${esc(d.name)}</th><td class="n"><b>${d.mg}</b></td><td class="small">${esc(d.src)}</td></tr>`).join('');
const tip = createTooltip();

function renderDrinkRows() {
  $('drink-rows').innerHTML = state.drinks.length ? state.drinks.map((d, i) => `
    <div class="hc-drink">
      <input class="input-num" type="time" data-dt="${i}" value="${d.time}" aria-label="Time of drink ${i + 1}">
      <select class="select" data-did="${i}" aria-label="Drink ${i + 1}">${DRINKS.map((x) => `<option value="${x.id}"${x.id === d.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <input class="input-num" type="number" min="0" max="1000" data-dmg="${i}" value="${d.mg}" aria-label="Caffeine in mg for drink ${i + 1}">
      <button class="btn hc-x" type="button" data-ddel="${i}" aria-label="Remove drink ${i + 1}">×</button>
    </div>`).join('') : '<div class="muted small">No drinks yet.</div>';
}

function renderCaffeine() {
  const bed = toMin(state.bed);
  const total = state.drinks.reduce((s, d) => s + d.mg, 0);
  const atBed = caffeineAt(state.drinks, bed, state.hl);
  let peak = 0;
  let peakT = 0;
  const pts = [];
  for (let t = 0; t <= 1440; t += 10) {
    const v = caffeineAt(state.drinks, t, state.hl);
    pts.push([t, v]);
    if (v > peak) { peak = v; peakT = t; }
  }
  const biggest = state.drinks.reduce((m, d) => Math.max(m, d.mg), 0);
  $('c-hl-v').textContent = `${fixed(state.hl, 1)} h`;
  $('c-answer').innerHTML = state.drinks.length
    ? `At bedtime (${esc(state.bed)}) about <mark>${g0(atBed)} mg</mark> of today's <b>${g0(total)} mg</b> is still in your body.`
    : 'Add a drink to see the curve.';
  $('c-tiles').innerHTML = [
    tile('Total today', `${g0(total)}<span class="unit">mg</span>`, total > LIMIT_DAY ? `Above the ${LIMIT_DAY} mg adult guidance` : `${g0(LIMIT_DAY - total)} mg under the ${LIMIT_DAY} mg guidance`),
    tile('Left at bedtime', `${g0(atBed)}<span class="unit">mg</span>`, `${state.bed} · half-life ${fixed(state.hl, 1)} h`),
    tile('Peak', `${g0(peak)}<span class="unit">mg</span>`, state.drinks.length ? `Around ${clock(peakT)}` : '–'),
    tile('Biggest single drink', `${g0(biggest)}<span class="unit">mg</span>`, biggest > LIMIT_DOSE ? `Above EFSA's ${LIMIT_DOSE} mg single dose` : `Within EFSA's ${LIMIT_DOSE} mg single dose`),
  ].join('');
  drawChart(pts, bed, peak);
  $('c-table').querySelector('tbody').innerHTML = pts.filter(([t]) => t % 60 === 0 && t < 1440)
    .map(([t, v]) => `<tr${Math.abs(t - bed) < 30 ? ' class="open"' : ''}><th class="sticky">${clock(t)}</th><td class="n">${g0(v)}</td></tr>`).join('');
}

function drawChart(pts, bed, peak) {
  const host = $('c-chart');
  const W = Math.max(320, Math.min(1400, host.clientWidth || 900));
  const H = W < 600 ? 220 : 260;
  const L = 44, R = 12, T = 12, B = 26;
  const ymax = Math.max(100, Math.ceil(peak / 50) * 50);
  const x = (t) => L + (t / 1440) * (W - L - R);
  const y = (v) => T + (1 - v / ymax) * (H - T - B);
  const step = ymax <= 200 ? 50 : ymax <= 500 ? 100 : 200;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><g class="axis">`;
  for (let v = 0; v <= ymax; v += step) svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const every = W < 600 ? 360 : 180;
  for (let t = 0; t <= 1440; t += every) svg += `<text x="${x(t)}" y="${H - 6}" text-anchor="${t === 0 ? 'start' : t === 1440 ? 'end' : 'middle'}">${clock(t)}</text>`;
  svg += '</g>';
  const line = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
  svg += `<path d="${line}L${x(1440)},${y(0)}L${x(0)},${y(0)}Z" fill="var(--s1)" fill-opacity=".14"/>`;
  svg += `<path d="${line}" fill="none" stroke="var(--s1)" stroke-width="2.2" stroke-linejoin="round"/>`;
  svg += `<line x1="${x(bed)}" x2="${x(bed)}" y1="${T}" y2="${H - B}" stroke="var(--s3)" stroke-width="2" stroke-dasharray="4 3"/>`;
  svg += `<text x="${x(bed) + (x(bed) > W - 80 ? -6 : 6)}" y="${T + 12}" text-anchor="${x(bed) > W - 80 ? 'end' : 'start'}" style="fill:var(--s3);font-weight:600">Bedtime</text>`;
  for (const d of state.drinks) {
    const t = toMin(d.time);
    svg += `<circle cx="${x(t)}" cy="${y(caffeineAt(state.drinks, t, state.hl))}" r="4.5" fill="var(--s2)" stroke="var(--surface)" stroke-width="1.5"/>`;
  }
  svg += `<line id="c-hover" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink-2)" stroke-width="1" opacity="0"/>`;
  svg += `<rect id="c-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
  host.innerHTML = `${svg}</svg>`;
  const svgEl = host.querySelector('svg');
  const hover = host.querySelector('#c-hover');
  const move = (e) => {
    const r = svgEl.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = Math.max(0, Math.min(1440, Math.round(((px - L) / (W - L - R)) * 1440 / 10) * 10));
    hover.setAttribute('x1', x(t)); hover.setAttribute('x2', x(t)); hover.setAttribute('opacity', '.5');
    const drunk = state.drinks.filter((d) => Math.abs(toMin(d.time) - t) <= 10).map((d) => `${DRINKS.find((k) => k.id === d.id).name.split(',')[0]} (${d.mg} mg)`);
    tip.show(`<b>${clock(t)}</b><br>${g0(caffeineAt(state.drinks, t, state.hl))} mg in the body${drunk.length ? `<br>${esc(drunk.join(', '))}` : ''}`, e.clientX, e.clientY);
  };
  const hit = host.querySelector('#c-hit');
  hit.addEventListener('mousemove', move);
  hit.addEventListener('mouseleave', () => { tip.hide(); hover.setAttribute('opacity', '0'); });
}

/* =====================================================================
   3. Supplement cost
   ===================================================================== */
const CATALOGUE = [];
if (supp) for (const p of supp.products) CATALOGUE.push({ key: `s.${p.id}`, group: `Supplement guide (₹ per serving, ${supp.as_of_label})`, name: `${supp.brand} ${p.name}`, price: p.cost ?? null });
if (mag) for (const p of mag.products) CATALOGUE.push({ key: `m.${p.id}`, group: `Magnesium lab results (₹ per capsule, ${mag.retrieved_label})`, name: `${p.brand} ${p.name}${p.pack ? ` (${p.pack} ${p.unit}s)` : ''}`, price: p.price && p.pack ? p.price / p.pack : null, unit: p.unit });
const byKey = Object.fromEntries(CATALOGUE.map((c) => [c.key, c]));
const groups = [...new Set(CATALOGUE.map((c) => c.group))];
$('s-pick').innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">${CATALOGUE.filter((c) => c.group === g).map((c) => `<option value="${esc(c.key)}">${esc(c.name)}${c.price == null ? ' · no price' : ` · ${inr(c.price, 2)}`}</option>`).join('')}</optgroup>`).join('')
  + '<optgroup label="Other"><option value="c">Something else (type name and price)</option></optgroup>';

function parseStack(s) {
  if (s == null) return [{ key: 's.omega-1000', serv: 1 }, { key: 's.multi-men', serv: 1 }, { key: 'm.unived-120', serv: 1 }].filter((x) => byKey[x.key]);
  return s.split(',').filter(Boolean).map((part) => {
    const [key, serv, price, name] = part.split('*');
    if (key !== 'c' && !byKey[key]) return null;
    return { key, serv: numOr(serv, 1, 0, 20), price: price === '' || price == null ? undefined : numOr(price, undefined, 0, 1e5), name: key === 'c' ? String(name || 'Other item').replace(/[*,]/g, ' ').slice(0, 40) : undefined };
  }).filter(Boolean).slice(0, 30);
}
state.stack = parseStack(P.get('s'));
const itemPrice = (s) => (s.price != null ? s.price : byKey[s.key]?.price ?? null);
const itemName = (s) => (s.key === 'c' ? s.name : byKey[s.key].name);

function renderStackRows() {
  $('s-table').querySelector('tbody').innerHTML = state.stack.length ? state.stack.map((s, i) => {
    const pr = itemPrice(s);
    return `<tr data-i="${i}">
      <td class="sticky col-name">${s.key === 'c'
        ? `<input class="input-num" type="text" data-sname="${i}" value="${esc(s.name)}" maxlength="40" style="text-align:left" aria-label="Item name">`
        : `<div class="pname">${esc(itemName(s))}</div><div class="pflav">${esc(byKey[s.key].group.split(' (')[0])}</div>`}</td>
      <td class="n"><input class="cell-input${s.price != null ? ' user' : ''}" type="number" min="0" step="0.01" data-sprice="${i}" value="${pr == null ? '' : +pr.toFixed(2)}" placeholder="₹" aria-label="Price per serving"></td>
      <td class="n"><input class="cell-input" type="number" min="0" max="20" step="0.5" data-sserv="${i}" value="${s.serv}" aria-label="Servings a day"></td>
      <td class="n" data-cell="month"></td>
      <td class="n" data-cell="share"></td>
      <td class="n"><button class="btn hc-x" type="button" data-sdel="${i}" aria-label="Remove">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="6"><div class="empty">Nothing added yet. Pick a product above.</div></td></tr>';
}
function renderStackTotals() {
  const months = state.stack.map((s) => { const pr = itemPrice(s); return pr == null ? null : monthly(pr, s.serv); });
  const total = months.reduce((a, m) => a + (m ?? 0), 0);
  const missing = months.filter((m) => m == null).length;
  $('s-table').querySelectorAll('tbody tr[data-i]').forEach((tr) => {
    const m = months[Number(tr.dataset.i)];
    tr.querySelector('[data-cell="month"]').innerHTML = m == null ? '<span class="chip warn">Add a price</span>' : `<b>${inr(m)}</b>`;
    tr.querySelector('[data-cell="share"]').textContent = m == null || total === 0 ? '–' : `${Math.round((m / total) * 100)}%`;
  });
  $('s-table').querySelector('tfoot').innerHTML = state.stack.length ? `<tr><th class="sticky">Total</th><td></td><td></td><td class="n">${inr(total)}</td><td></td><td></td></tr>` : '';
  const n = state.stack.length;
  $('s-answer').innerHTML = n ? `${n} ${n === 1 ? 'item costs' : 'items cost'} about <mark>${inr(total)} a month</mark>${missing ? `, not counting ${missing} without a price` : ''}.` : 'Add products to see the monthly cost.';
  $('s-tiles').innerHTML = [
    tile('A month', inr(total), `${DAYS_PER_MONTH} days`),
    tile('A day', inr(total / DAYS_PER_MONTH, 2), 'Across all items'),
    tile('A year', inr(total / DAYS_PER_MONTH * 365), '365 days'),
    tile('Items', String(n), missing ? `${missing} need a price` : 'All priced'),
  ].join('');
  syncUrl();
}

/* =====================================================================
   Wiring
   ===================================================================== */
const pw = $('p-w');
pw.value = state.w;
pw.addEventListener('input', () => { const v = numOr(pw.value.replace(/,/g, ''), null, 1, 400); if (v == null) return; state.w = v; renderProtein(); syncUrl(); });
const setUnitPressed = () => document.querySelectorAll('#p-unit button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.u === state.u)));
setUnitPressed();
$('p-unit').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-u]');
  if (!b || b.dataset.u === state.u) return;
  state.w = Math.round((b.dataset.u === 'lb' ? state.w / LB : state.w * LB) * 10) / 10;
  state.u = b.dataset.u;
  pw.value = state.w;
  setUnitPressed(); renderProtein(); syncUrl();
});
for (const [id, key, cast] of [['p-goal', 'goal', String], ['p-diet', 'diet', String], ['p-meals', 'meals', Number]]) {
  $(id).value = String(state[key]);
  $(id).addEventListener('change', (e) => { state[key] = cast(e.target.value); renderProtein(); syncUrl(); });
}
$('p-eat').value = state.eat;
$('p-eat').addEventListener('input', (e) => { const v = numOr(e.target.value, null, 0, 400); if (v == null) return; state.eat = v; renderProtein(); syncUrl(); });

$('c-bed').value = state.bed;
$('c-bed').addEventListener('input', (e) => { if (/^\d{2}:\d{2}$/.test(e.target.value)) { state.bed = e.target.value; renderCaffeine(); syncUrl(); } });
$('c-hl').value = state.hl;
$('c-hl').addEventListener('input', (e) => { state.hl = Number(e.target.value); renderCaffeine(); syncUrl(); });
$('drink-add-btn').addEventListener('click', () => {
  if (state.drinks.length >= 20) return;
  const def = DRINKS.find((d) => d.id === $('drink-add').value);
  const last = state.drinks.at(-1);
  const t = last ? clock(Math.min(1430, toMin(last.time) + 120)) : '08:00';
  state.drinks.push({ time: t, id: def.id, mg: def.mg });
  renderDrinkRows(); renderCaffeine(); syncUrl();
});
$('drink-rows').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.dt != null && /^\d{2}:\d{2}$/.test(t.value)) state.drinks[t.dataset.dt].time = t.value;
  else if (t.dataset.dmg != null) { const v = numOr(t.value, null, 0, 1000); if (v == null) return; state.drinks[t.dataset.dmg].mg = v; } else return;
  renderCaffeine(); syncUrl();
});
$('drink-rows').addEventListener('change', (e) => {
  const i = e.target.dataset.did;
  if (i == null) return;
  const def = DRINKS.find((d) => d.id === e.target.value);
  state.drinks[i].id = def.id;
  state.drinks[i].mg = def.mg;
  renderDrinkRows(); renderCaffeine(); syncUrl();
});
$('drink-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ddel]');
  if (!b) return;
  state.drinks.splice(Number(b.dataset.ddel), 1);
  renderDrinkRows(); renderCaffeine(); syncUrl();
});

$('s-add').addEventListener('click', () => {
  if (state.stack.length >= 30) return;
  const key = $('s-pick').value;
  state.stack.push(key === 'c' ? { key, serv: 1, price: undefined, name: 'Other item' } : { key, serv: 1 });
  renderStackRows(); renderStackTotals();
});
$('s-table').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.sprice != null) { const s = state.stack[t.dataset.sprice]; s.price = t.value === '' ? undefined : numOr(t.value, undefined, 0, 1e5); t.classList.toggle('user', s.price != null); }
  else if (t.dataset.sserv != null) { const v = numOr(t.value, null, 0, 20); if (v == null) return; state.stack[t.dataset.sserv].serv = v; }
  else if (t.dataset.sname != null) state.stack[t.dataset.sname].name = t.value.replace(/[*,]/g, ' ').slice(0, 40) || 'Other item';
  else return;
  renderStackTotals();
});
$('s-table').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sdel]');
  if (!b) return;
  state.stack.splice(Number(b.dataset.sdel), 1);
  renderStackRows(); renderStackTotals();
});

let lastW = 0;
window.addEventListener('resize', () => { const w = $('c-chart').clientWidth; if (w && Math.abs(w - lastW) > 40) { lastW = w; renderCaffeine(); } });
document.addEventListener('tabchange', (e) => { if (e.detail === 'caffeine') requestAnimationFrame(renderCaffeine); });

renderProtein();
renderDrinkRows();
renderCaffeine();
renderStackRows();
renderStackTotals();
tabs.goToHash();
