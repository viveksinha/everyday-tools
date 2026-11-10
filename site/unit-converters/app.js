import { initPage, initTabs, esc } from '../assets/site.js';

initPage();
const tabs = initTabs();

/* =====================================================================
   Conversion factors (checked Nov 2026; sources listed on the page)
   ===================================================================== */
const NUM_UNITS = [
  { id: 'one', name: 'Ones (plain number)', f: 1 },
  { id: 'thousand', name: 'Thousand', f: 1e3 },
  { id: 'lakh', name: 'Lakh', f: 1e5, sys: 'in' },
  { id: 'crore', name: 'Crore', f: 1e7, sys: 'in' },
  { id: 'lakh-crore', name: 'Lakh crore', f: 1e12, sys: 'in' },
  { id: 'million', name: 'Million', f: 1e6, sys: 'intl' },
  { id: 'billion', name: 'Billion', f: 1e9, sys: 'intl' },
  { id: 'trillion', name: 'Trillion', f: 1e12, sys: 'intl' },
];

const SQM = 10.763910416709722; // sq ft in 1 sq m (1 ft = 0.3048 m exactly)
// Bigha by state, sq ft. Square Yards and Kotak Mahindra Bank; "alt" records where they disagree.
const BIGHA = [
  { id: 'up', name: 'Uttar Pradesh', sqft: 27000, note: 'Kotak says 5 to 20 biswa per bigha; Sobha uses a 27,225 sq ft pucca bigha for biswa' },
  { id: 'bihar', name: 'Bihar', sqft: 27220, note: '20 katha per bigha; varies slightly by district' },
  { id: 'jharkhand', name: 'Jharkhand', sqft: 27211, note: '' },
  { id: 'rajasthan-pucca', name: 'Rajasthan (pucca)', sqft: 27225, note: 'Square Yards: 1 biswa ≈ 1,361 sq ft' },
  { id: 'rajasthan-kachha', name: 'Rajasthan (kachha)', sqft: 17424, note: 'Kotak only' },
  { id: 'gujarat', name: 'Gujarat', sqft: 17424, note: 'Varies within the state' },
  { id: 'west-bengal', name: 'West Bengal', sqft: 14400, note: '20 katha per bigha' },
  { id: 'assam', name: 'Assam', sqft: 14400, note: '5 katha per bigha' },
  { id: 'tripura', name: 'Tripura', sqft: 14400, note: 'Square Yards only' },
  { id: 'madhya-pradesh', name: 'Madhya Pradesh', sqft: 12000, note: '' },
  { id: 'punjab', name: 'Punjab', sqft: 9070, note: 'Kotak lists 9,090' },
  { id: 'haryana', name: 'Haryana', sqft: 9070, note: 'Sources disagree: Kotak lists 27,225' },
  { id: 'himachal-pradesh', name: 'Himachal Pradesh', sqft: 8712, note: '' },
  { id: 'uttarakhand', name: 'Uttarakhand', sqft: 6804, note: 'Square Yards lists 6,806' },
];
const LAND = [
  { id: 'sqft', name: 'Square foot (sq ft)', sqft: 1, where: 'Everywhere; plots and flats' },
  { id: 'sqm', name: 'Square metre (sq m)', sqft: SQM, where: 'Official records, registration' },
  { id: 'sqyd', name: 'Square yard (gaj)', sqft: 9, where: 'North India plots' },
  { id: 'acre', name: 'Acre', sqft: 43560, where: 'Farmland everywhere' },
  { id: 'hectare', name: 'Hectare', sqft: 10000 * SQM, where: 'Official records' },
  { id: 'cent', name: 'Cent', sqft: 435.6, where: 'Kerala, Tamil Nadu, parts of Andhra Pradesh' },
  { id: 'guntha', name: 'Guntha', sqft: 1089, where: 'Maharashtra, Karnataka, Telangana, AP, parts of Gujarat' },
  { id: 'ground', name: 'Ground', sqft: 2400, where: 'Tamil Nadu, mainly Chennai' },
  { id: 'kanal', name: 'Kanal', sqft: 5445, where: 'Punjab, Haryana, parts of Himachal' },
  { id: 'marla', name: 'Marla', sqft: 272.25, where: 'Punjab, Haryana; 225 sq ft in some plot conventions' },
  { id: 'bigha', name: 'Bigha', sqft: null, where: 'Varies by state' },
  { id: 'biswa', name: 'Biswa (1/20 bigha)', sqft: null, where: 'Varies by state' },
];

// King Arthur Baking ingredient weight chart: grams per US cup (236.6 ml).
// Rice and cocoa (½ cup), butter (8 tbsp = ½ cup), honey (1 tbsp), cornstarch (¼ cup) scaled to a cup.
const US_CUP_ML = 236.5882365;
const INGREDIENTS = [
  { id: 'flour', name: 'All-purpose flour (maida)', g: 120 },
  { id: 'wholewheat', name: 'Whole wheat flour', g: 113 },
  { id: 'besan', name: 'Chickpea flour (besan)', g: 85 },
  { id: 'semolina', name: 'Semolina (sooji, rava)', g: 163 },
  { id: 'sugar', name: 'Sugar, granulated', g: 198 },
  { id: 'brown-sugar', name: 'Brown sugar, packed', g: 213 },
  { id: 'icing-sugar', name: 'Powdered (icing) sugar', g: 113 },
  { id: 'rice', name: 'Rice, long grain, uncooked', g: 198 },
  { id: 'oats', name: 'Rolled oats', g: 89 },
  { id: 'cocoa', name: 'Cocoa powder', g: 84 },
  { id: 'cornstarch', name: 'Cornflour (cornstarch)', g: 112 },
  { id: 'butter', name: 'Butter', g: 226 },
  { id: 'oil', name: 'Vegetable oil', g: 198 },
  { id: 'milk', name: 'Milk', g: 227 },
  { id: 'curd', name: 'Yogurt (curd)', g: 227 },
  { id: 'water', name: 'Water', g: 227 },
  { id: 'honey', name: 'Honey', g: 336 },
];
const K_UNITS = [
  { id: 'uscup', name: 'US cup (236.6 ml)', ml: US_CUP_ML },
  { id: 'metcup', name: 'Metric cup (250 ml)', ml: 250 },
  { id: 'tbsp', name: 'Tablespoon (15 ml)', ml: 15 },
  { id: 'tsp', name: 'Teaspoon (5 ml)', ml: 5 },
  { id: 'ml', name: 'Millilitre', ml: 1 },
  { id: 'g', name: 'Gram', g: 1 },
  { id: 'oz', name: 'Ounce (weight)', g: 28.349523125 },
];
// Beko oven chart: gas mark, °F, °C as printed.
const GAS = [[1, 275, 140], [2, 300, 150], [3, 325, 165], [4, 350, 177], [5, 375, 190], [6, 400, 200], [7, 425, 220], [8, 450, 230], [9, 475, 245], [10, 500, 260]];

// Everyday units: factor to the base unit (NIST SP 811), or to/from functions.
const EVERYDAY = {
  length: { name: 'Length', base: 'm', units: [
    { id: 'mm', name: 'Millimetre', f: 0.001, def: '1/1000 m' },
    { id: 'cm', name: 'Centimetre', f: 0.01, def: '1/100 m' },
    { id: 'm', name: 'Metre', f: 1, def: 'SI base unit' },
    { id: 'km', name: 'Kilometre', f: 1000, def: '1,000 m' },
    { id: 'in', name: 'Inch', f: 0.0254, def: '2.54 cm exactly' },
    { id: 'ft', name: 'Foot', f: 0.3048, def: '12 in = 30.48 cm' },
    { id: 'yd', name: 'Yard', f: 0.9144, def: '3 ft = 91.44 cm' },
    { id: 'mi', name: 'Mile', f: 1609.344, def: '1,760 yd' },
  ] },
  weight: { name: 'Weight', base: 'kg', units: [
    { id: 'mg', name: 'Milligram', f: 1e-6, def: '1/1000 g' },
    { id: 'g', name: 'Gram', f: 0.001, def: '1/1000 kg' },
    { id: 'kg', name: 'Kilogram', f: 1, def: 'SI base unit' },
    { id: 't', name: 'Tonne', f: 1000, def: '1,000 kg' },
    { id: 'oz', name: 'Ounce', f: 0.028349523125, def: '1/16 lb' },
    { id: 'lb', name: 'Pound', f: 0.45359237, def: '0.45359237 kg exactly' },
    { id: 'st', name: 'Stone', f: 6.35029318, def: '14 lb' },
  ] },
  temperature: { name: 'Temperature', units: [
    { id: 'c', name: 'Celsius (°C)', to: (v) => v, from: (c) => c, def: 'Water freezes at 0, boils at 100' },
    { id: 'f', name: 'Fahrenheit (°F)', to: (v) => (v - 32) * 5 / 9, from: (c) => c * 9 / 5 + 32, def: '°F = °C × 9/5 + 32' },
    { id: 'k', name: 'Kelvin (K)', to: (v) => v - 273.15, from: (c) => c + 273.15, def: 'K = °C + 273.15' },
  ] },
  speed: { name: 'Speed', base: 'm/s', units: [
    { id: 'kmh', name: 'km/h', f: 1 / 3.6, def: '1,000 m per hour' },
    { id: 'ms', name: 'm/s', f: 1, def: 'SI unit' },
    { id: 'mph', name: 'mph', f: 0.44704, def: '1 mile per hour' },
    { id: 'kn', name: 'Knot', f: 1852 / 3600, def: '1 nautical mile (1,852 m) per hour' },
  ] },
  fuel: { name: 'Fuel economy', units: [
    { id: 'kmpl', name: 'km per litre', to: (v) => v, from: (k) => k, def: 'Used in India' },
    { id: 'l100', name: 'Litres per 100 km', to: (v) => 100 / v, from: (k) => 100 / k, def: '100 ÷ km/l' },
    { id: 'mpgus', name: 'mpg (US gallon)', to: (v) => v * 1.609344 / 3.785411784, from: (k) => k * 3.785411784 / 1.609344, def: 'US gallon = 3.785411784 l' },
    { id: 'mpguk', name: 'mpg (UK gallon)', to: (v) => v * 1.609344 / 4.54609, from: (k) => k * 4.54609 / 1.609344, def: 'UK gallon = 4.54609 l' },
  ] },
};
// Calculator.net shoe chart: [US, UK/India, EU, foot cm]
const SHOES = {
  women: [[4, 2, 34, 21.2], [4.5, 2.5, 34, 21.6], [5, 3, 35, 22], [5.5, 3.5, 36, 22.4], [6, 4, 36, 22.9], [6.5, 4.5, 37, 23.3], [7, 5, 38, 23.7], [7.5, 5.5, 38, 24.1], [8, 6, 39, 24.6], [8.5, 6.5, 39, 25], [9, 7, 40, 25.4], [9.5, 7.5, 41, 25.8], [10, 8, 41, 26.2], [10.5, 8.5, 42, 26.7], [11, 9, 43, 27.1], [11.5, 9.5, 43, 27.5], [12, 10, 44, 27.9]],
  men: [[6, 5, 38, 23.7], [6.5, 5.5, 38, 24.1], [7, 6, 39, 24.6], [7.5, 6.5, 39, 25], [8, 7, 40, 25.4], [8.5, 7.5, 41, 25.8], [9, 8, 41, 26.2], [9.5, 8.5, 42, 26.7], [10, 9, 43, 27.1], [10.5, 9.5, 43, 27.5], [11, 10, 44, 27.9], [11.5, 10.5, 45, 28.4], [12, 11, 45, 28.8], [12.5, 11.5, 46, 29.2], [13, 12, 46, 29.6], [13.5, 12.5, 47, 30.1], [14, 13, 48, 30.5]],
};

/* =====================================================================
   Pure helpers (exported so checks can call them)
   ===================================================================== */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function below1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ''));
  return parts.join(' ');
}
export function wordsIndian(n) {
  n = Math.floor(n);
  if (n === 0) return 'zero';
  const out = [];
  const crore = Math.floor(n / 1e7);
  let rest = n % 1e7;
  if (crore) out.push(`${wordsIndian(crore)} crore`);
  const lakh = Math.floor(rest / 1e5); rest %= 1e5;
  const th = Math.floor(rest / 1e3); rest %= 1e3;
  if (lakh) out.push(`${below1000(lakh)} lakh`);
  if (th) out.push(`${below1000(th)} thousand`);
  if (rest) out.push(below1000(rest));
  return out.join(' ');
}
export function wordsIntl(n) {
  n = Math.floor(n);
  if (n === 0) return 'zero';
  const scales = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];
  const out = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) out.unshift(below1000(chunk) + (scales[i] ? ` ${scales[i]}` : ''));
    n = Math.floor(n / 1000);
    i += 1;
  }
  return out.join(' ');
}
export const landConvert = (v, fromSqft, toSqft) => (v * fromSqft) / toSqft;
export const cToF = (c) => c * 9 / 5 + 32;
export const fToGas = (f) => (f - 250) / 25;

/* =====================================================================
   Formatting
   ===================================================================== */
const $ = (id) => document.getElementById(id);
function fmt(v, maxD = 4) {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e15) return v.toExponential(4);
  if (a < 0.0001) return v.toPrecision(3);
  if (a < 0.01) return v.toLocaleString('en-IN', { maximumSignificantDigits: 3 });
  return v.toLocaleString('en-IN', { maximumFractionDigits: a >= 1000 ? 2 : maxD });
}
const parseV = (s) => {
  const t = String(s ?? '').replace(/,/g, '').trim();
  if (t === '' || t === '-' || t === '.') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
const tile = (lab, value, sub) =>
  `<div class="tile"><div class="label">${esc(lab)}</div><div class="value">${value}</div><div class="sub">${esc(sub)}</div></div>`;
const opt = (list, sel) => list.map((u) => `<option value="${u.id}"${u.id === sel ? ' selected' : ''}>${esc(u.name)}</option>`).join('');

/* =====================================================================
   State in the URL
   ===================================================================== */
const P = new URLSearchParams(location.search);
const pick = (k, list, d) => (list.some((u) => u.id === P.get(k)) ? P.get(k) : d);
const numP = (k, d) => { const v = parseV(P.get(k)); return v == null ? d : v; };
const state = {
  nv: numP('nv', 2.5), nu: pick('nu', NUM_UNITS, 'crore'),
  lv: numP('lv', 1), lu: pick('lu', LAND, 'acre'), ls: pick('ls', BIGHA, 'up'),
  kv: numP('kv', 1), ku: pick('ku', K_UNITS, 'uscup'), ki: pick('ki', INGREDIENTS, 'flour'),
  ov: numP('ov', 180), ou: ['C', 'F', 'G'].includes(P.get('ou')) ? P.get('ou') : 'C',
  ec: EVERYDAY[P.get('ec')] ? P.get('ec') : 'length', ev: numP('ev', 1), eu: P.get('eu'),
  sg: P.get('sg') === 'women' ? 'women' : 'men', ss: ['uk', 'us', 'eu'].includes(P.get('ss')) ? P.get('ss') : 'uk', sz: numP('sz', 8),
};
const EV_DEFAULT = { length: 'km', weight: 'kg', temperature: 'c', speed: 'kmh', fuel: 'kmpl' };
if (!EVERYDAY[state.ec].units.some((u) => u.id === state.eu)) state.eu = EV_DEFAULT[state.ec];
function syncUrl() {
  const p = new URLSearchParams();
  for (const k of ['nv', 'nu', 'lv', 'lu', 'ls', 'kv', 'ku', 'ki', 'ov', 'ou', 'ec', 'ev', 'eu', 'sg', 'ss', 'sz']) p.set(k, String(state[k]));
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
}

/* =====================================================================
   1. Lakh and crore
   ===================================================================== */
$('num-u').innerHTML = opt(NUM_UNITS, state.nu);
const LADDER = [
  ['One thousand', 1e3, 'One thousand'], ['One lakh', 1e5, '100 thousand'], ['Ten lakh', 1e6, 'One million'],
  ['One crore', 1e7, 'Ten million'], ['Ten crore', 1e8, '100 million'], ['100 crore', 1e9, 'One billion'],
  ['1,000 crore', 1e10, 'Ten billion'], ['One lakh crore', 1e12, 'One trillion'],
];
$('ladder-table').querySelector('tbody').innerHTML = LADDER.map(([a, n, b]) =>
  `<tr><th class="sticky">${a}</th><td class="n">${n.toLocaleString('en-IN')}</td><td class="n">${n.toLocaleString('en-US')}</td><td>${b}</td></tr>`).join('');

function renderNumbers() {
  const u = NUM_UNITS.find((x) => x.id === state.nu);
  const n = state.nv * u.f;
  const big = Math.abs(n) >= 1e18;
  const show = (f) => fmt(n / f, 6);
  const target = u.sys === 'in' ? (n >= 1e9 ? ['billion', 1e9] : ['million', 1e6]) : (n >= 1e7 ? ['crore', 1e7] : ['lakh', 1e5]);
  $('num-answer').innerHTML = big ? 'That number is too large for this page.'
    : `<b>${esc(fmt(state.nv, 6))} ${u.id === 'one' ? '' : esc(u.name.toLowerCase())}</b> is <mark>${esc(show(target[1]))} ${target[0]}</mark>${u.sys ? '' : ` (${esc(show(u.sys === 'in' ? 1e6 : 1e7))} ${u.sys === 'in' ? 'million' : 'crore'})`}.`;
  $('num-tiles').innerHTML = [
    tile('Lakh', esc(show(1e5)), '1 lakh = 100,000'),
    tile('Crore', esc(show(1e7)), '1 crore = 10 million'),
    tile('Million', esc(show(1e6)), '1 million = 10 lakh'),
    tile('Billion', esc(show(1e9)), '1 billion = 100 crore'),
  ].join('');
  const whole = Math.round(Math.abs(n) * 100) / 100;
  const frac = whole % 1 !== 0;
  $('words-in').textContent = big ? '–' : (n < 0 ? 'minus ' : '') + wordsIndian(whole) + (frac ? ' (whole part)' : '');
  $('words-intl').textContent = big ? '–' : (n < 0 ? 'minus ' : '') + wordsIntl(whole) + (frac ? ' (whole part)' : '');
  $('digits-in').textContent = big ? '' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  $('digits-intl').textContent = big ? '' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/* =====================================================================
   2. Land
   ===================================================================== */
$('land-u').innerHTML = opt(LAND, state.lu);
$('land-s').innerHTML = opt(BIGHA, state.ls);
const landSqft = (u) => {
  const b = BIGHA.find((x) => x.id === state.ls).sqft;
  return u.id === 'bigha' ? b : u.id === 'biswa' ? b / 20 : u.sqft;
};
function renderLand() {
  const from = LAND.find((x) => x.id === state.lu);
  const st = BIGHA.find((x) => x.id === state.ls);
  const total = state.lv * landSqft(from);
  $('land-answer').innerHTML = `<b>${esc(fmt(state.lv))} ${esc(from.name.replace(/ \(.*\)/, '').toLowerCase())}</b> is <mark>${esc(fmt(total))} sq ft</mark>, or ${esc(fmt(total / SQM))} sq m.`;
  $('land-table').querySelector('tbody').innerHTML = LAND.map((u) => {
    const f = landSqft(u);
    const varies = u.sqft == null;
    return `<tr${u.id === state.lu ? ' class="open"' : ''}><th class="sticky">${esc(u.name)}</th><td class="n"><b>${esc(fmt(total / f))}</b></td><td class="n">${esc(fmt(f))}</td><td>${varies ? `<span class="chip warn">Varies</span> ${esc(st.name)} value` : esc(u.where)}</td></tr>`;
  }).join('');
  $('bigha-table').querySelector('tbody').innerHTML = BIGHA.map((b) => `<tr${b.id === state.ls ? ' class="open"' : ''}>
    <th class="sticky">${esc(b.name)}</th><td class="n">${fmt(b.sqft)}</td><td class="n">${fmt(b.sqft / SQM, 1)}</td><td class="n">${fmt(b.sqft / 9, 1)}</td><td class="n">${fmt(b.sqft / 43560, 3)}</td><td class="small">${esc(b.note)}</td></tr>`).join('');
}

/* =====================================================================
   3. Kitchen
   ===================================================================== */
$('k-u').innerHTML = opt(K_UNITS, state.ku);
$('k-i').innerHTML = opt(INGREDIENTS, state.ki);
const density = (ing) => ing.g / US_CUP_ML; // g per ml
export const kitchenGrams = (v, unitId, ingId) => {
  const u = K_UNITS.find((x) => x.id === unitId);
  const ing = INGREDIENTS.find((x) => x.id === ingId);
  return u.ml ? v * u.ml * density(ing) : v * u.g;
};
function renderKitchen() {
  const ing = INGREDIENTS.find((x) => x.id === state.ki);
  const u = K_UNITS.find((x) => x.id === state.ku);
  const g = kitchenGrams(state.kv, state.ku, state.ki);
  const ml = g / density(ing);
  $('k-answer').innerHTML = `<b>${esc(fmt(state.kv))} × ${esc(u.name.replace(/ \(.*\)/, '').toLowerCase())}</b> of ${esc(ing.name.toLowerCase())} weighs about <mark>${esc(fmt(g, 0))} g</mark>.`;
  $('k-tiles').innerHTML = [
    tile('Grams', esc(fmt(g, 0)), ing.name),
    tile('US cups', esc(fmt(ml / US_CUP_ML, 2)), '236.6 ml each'),
    tile('Metric cups', esc(fmt(ml / 250, 2)), '250 ml each'),
    tile('Tablespoons', esc(fmt(ml / 15, 1)), '15 ml each'),
    tile('Teaspoons', esc(fmt(ml / 5, 1)), '5 ml each'),
    tile('Millilitres', esc(fmt(ml, 0)), 'By volume'),
  ].join('');
  $('cup-table').querySelector('tbody').innerHTML = INGREDIENTS.map((i) => {
    const d = density(i);
    return `<tr${i.id === state.ki ? ' class="open"' : ''}><th class="sticky">${esc(i.name)}</th><td class="n"><b>${fmt(i.g, 0)} g</b></td><td class="n">${fmt(250 * d, 0)} g</td><td class="n">${fmt(15 * d, 1)} g</td><td class="n">${fmt(5 * d, 1)} g</td></tr>`;
  }).join('');
}

function renderOven() {
  let c, f, gas;
  if (state.ou === 'C') { c = state.ov; f = cToF(c); } else if (state.ou === 'F') { f = state.ov; c = (f - 32) * 5 / 9; } else { gas = state.ov; f = 250 + 25 * gas; c = (f - 32) * 5 / 9; }
  if (gas == null) gas = fToGas(f);
  const gr = Math.round(gas);
  const gasTxt = gas < 0.5 ? 'Below 1' : gas > 10.5 ? 'Above 10' : String(gr);
  const gasSub = gas < 0.5 || gas > 10.5 ? 'Outside the gas-mark chart' : Math.abs(gas - gr) < 0.01 ? 'Exact match' : `Nearest mark (${fmt(gas, 1)})`;
  $('o-tiles').innerHTML = [
    tile('Celsius', `${esc(fmt(c, 0))}<span class="unit">°C</span>`, 'Conventional oven'),
    tile('Fahrenheit', `${esc(fmt(f, 0))}<span class="unit">°F</span>`, '°C × 9/5 + 32'),
    tile('Gas mark', esc(gasTxt), gasSub),
  ].join('');
  $('gas-table').querySelector('tbody').innerHTML = GAS.map(([g, F, C]) =>
    `<tr${gas >= 0.5 && gas <= 10.5 && g === gr ? ' class="open"' : ''}><th class="sticky">${g}</th><td class="n">${F}</td><td class="n">${C}</td><td class="n">${fmt((F - 32) * 5 / 9, 1)}</td></tr>`).join('');
}

/* =====================================================================
   4. Everyday
   ===================================================================== */
$('ev-cat').innerHTML = Object.entries(EVERYDAY).map(([k, c]) => `<button type="button" data-cat="${k}" aria-pressed="${k === state.ec}">${esc(c.name)}</button>`).join('');
function fillEvUnits() {
  $('ev-u').innerHTML = opt(EVERYDAY[state.ec].units, state.eu);
}
export function everyday(cat, v, fromId) {
  const c = EVERYDAY[cat];
  const from = c.units.find((u) => u.id === fromId);
  if (from.f != null) {
    const base = v * from.f;
    return Object.fromEntries(c.units.map((u) => [u.id, base / u.f]));
  }
  const base = from.to(v);
  return Object.fromEntries(c.units.map((u) => [u.id, u.from(base)]));
}
function renderEveryday() {
  document.querySelectorAll('#ev-cat button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.ec)));
  const c = EVERYDAY[state.ec];
  const out = everyday(state.ec, state.ev, state.eu);
  $('ev-table').querySelector('tbody').innerHTML = c.units.map((u) =>
    `<tr${u.id === state.eu ? ' class="open"' : ''}><th class="sticky">${esc(u.name)}</th><td class="n"><b>${esc(fmt(out[u.id]))}</b></td><td class="small">${esc(u.def)}</td></tr>`).join('');
}

const SYS_COL = { us: 0, uk: 1, eu: 2 };
const SYS_NAME = { us: 'US', uk: 'UK / India', eu: 'EU' };
function fillShoeSizes() {
  const col = SYS_COL[state.ss];
  const sizes = [...new Set(SHOES[state.sg].map((r) => r[col]))];
  if (!sizes.includes(state.sz)) state.sz = sizes[Math.floor(sizes.length / 2)];
  $('shoe-size').innerHTML = sizes.map((s) => `<option value="${s}"${s === state.sz ? ' selected' : ''}>${s}</option>`).join('');
}
function renderShoes() {
  document.querySelectorAll('#shoe-g button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === state.sg)));
  const col = SYS_COL[state.ss];
  const rows = SHOES[state.sg];
  const hits = rows.filter((r) => r[col] === state.sz);
  const span = (i) => { const v = [...new Set(hits.map((r) => r[i]))]; return v.length > 1 ? `${v[0]} to ${v.at(-1)}` : String(v[0]); };
  const others = ['uk', 'us', 'eu'].filter((s) => s !== state.ss).map((s) => `<b>${SYS_NAME[s]} ${span(SYS_COL[s])}</b>`).join(' · ');
  $('shoe-answer').innerHTML = hits.length
    ? `${state.sg === 'men' ? "Men's" : "Women's"} ${SYS_NAME[state.ss]} <mark>${state.sz}</mark> is ${others}, about ${span(3)} cm foot length.`
    : 'Pick a size.';
  $('shoe-table').querySelector('tbody').innerHTML = rows.map((r) =>
    `<tr${r[col] === state.sz ? ' class="open"' : ''}><th class="sticky n">${r[1]}</th><td class="n">${r[0]}</td><td class="n">${r[2]}</td><td class="n">${r[3]}</td></tr>`).join('');
}

/* =====================================================================
   Wiring
   ===================================================================== */
function bindNum(inputId, key, render) {
  const el = $(inputId);
  el.value = state[key];
  el.addEventListener('input', () => { const v = parseV(el.value); if (v == null) return; state[key] = v; render(); syncUrl(); });
}
bindNum('num-v', 'nv', renderNumbers);
bindNum('land-v', 'lv', renderLand);
bindNum('k-v', 'kv', renderKitchen);
bindNum('o-v', 'ov', renderOven);
bindNum('ev-v', 'ev', renderEveryday);
const onSel = (id, key, fn) => $(id).addEventListener('change', (e) => { state[key] = e.target.value; fn(); syncUrl(); });
onSel('num-u', 'nu', renderNumbers);
onSel('land-u', 'lu', renderLand);
onSel('land-s', 'ls', renderLand);
onSel('k-u', 'ku', renderKitchen);
onSel('k-i', 'ki', renderKitchen);
onSel('o-u', 'ou', renderOven);
onSel('ev-u', 'eu', renderEveryday);
$('o-u').value = state.ou;
$('ev-cat').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  state.ec = b.dataset.cat;
  state.eu = EV_DEFAULT[state.ec];
  fillEvUnits(); renderEveryday(); syncUrl();
});
$('shoe-g').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-g]');
  if (!b) return;
  // Keep the same foot length when switching charts.
  const cm = SHOES[state.sg].find((r) => r[SYS_COL[state.ss]] === state.sz)?.[3];
  state.sg = b.dataset.g;
  const near = cm == null ? null : SHOES[state.sg].reduce((a, r) => (Math.abs(r[3] - cm) < Math.abs(a[3] - cm) ? r : a));
  if (near) state.sz = near[SYS_COL[state.ss]];
  fillShoeSizes(); renderShoes(); syncUrl();
});
$('shoe-sys').value = state.ss;
$('shoe-sys').addEventListener('change', (e) => {
  const row = SHOES[state.sg].find((r) => r[SYS_COL[state.ss]] === state.sz);
  state.ss = e.target.value;
  if (row) state.sz = row[SYS_COL[state.ss]];
  fillShoeSizes(); renderShoes(); syncUrl();
});
$('shoe-size').addEventListener('change', (e) => { state.sz = Number(e.target.value); renderShoes(); syncUrl(); });

fillEvUnits();
fillShoeSizes();
renderNumbers();
renderLand();
renderKitchen();
renderOven();
renderEveryday();
renderShoes();
syncUrl();
tabs.goToHash();
