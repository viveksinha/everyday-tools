// Scoring for the whey comparison. A straight port of the spreadsheet formulas,
// so the page and the sheet rank products the same way.

export const TYPE_LABEL = { isolate: 'Isolate', concentrate: 'Concentrate / blend', plant: 'Plant / yeast' };

export const PARTS = [
  { key: 'value', label: 'Value', help: 'Cheap protein (₹ per gram of protein)' },
  { key: 'protein', label: 'Protein %', help: 'High protein per 100 g of powder' },
  { key: 'clean', label: 'Fat & sodium', help: 'Low fat and low sodium' },
  { key: 'sugar', label: 'Sugar', help: 'Less sugar than others in its group' },
  { key: 'lab', label: 'Lab tested', help: 'Independent third-party testing' },
];

export const PRESETS = {
  default: { label: 'Default', weights: { value: 0.3, protein: 0.25, clean: 0.1, sugar: 0.2, lab: 0.15 } },
  quality: { label: 'Quality first', weights: { value: 0.2, protein: 0.3, clean: 0.1, sugar: 0.25, lab: 0.15 } },
};

export const isLive = (p) => /^live/i.test(p.status);
// Whey is scored against whey; plant/yeast only against plant/yeast.
export const groupOf = (p) => (p.type === 'plant' ? 'plant' : 'whey');
export const labTier = (lab) => (/^certified/i.test(lab) ? 'certified' : /^brand lab/i.test(lab) ? 'brand' : 'none');
export const LAB_SCORE = { certified: 100, brand: 60, none: 30 };
export const LAB_LABEL = { certified: 'Certified', brand: 'Brand reports', none: 'None found' };

export const rsPerGram = (price, packG, protein) =>
  price == null || !packG || !protein ? null : price / ((packG * protein) / 100);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Spreadsheet PERCENTRANK.INC: share of values below x. When x isn't in the
// list it interpolates between neighbouring sorted positions. Truncated to
// 3 significant digits like Sheets. Returns null when x is outside the list
// (Sheets returns an error there).
export function percentRank(sorted, x) {
  const n = sorted.length;
  if (n < 2 || x < sorted[0] || x > sorted[n - 1]) return null;
  let r;
  if (sorted.includes(x)) {
    r = sorted.filter((s) => s < x).length / (n - 1);
  } else {
    const i = sorted.findIndex((s) => s > x) - 1;
    r = (i + (x - sorted[i]) / (sorted[i + 1] - sorted[i])) / (n - 1);
  }
  return Math.floor(r * 1000 + 1e-9) / 1000;
}

export function score(products, weights) {
  const rows = products.map((p) => ({
    ...p,
    live: isLive(p),
    group: groupOf(p),
    labTier: labTier(p.lab),
    rsg: rsPerGram(p.price, p.pack_g, p.protein),
    kcalShare: p.kcal ? (p.protein * 4) / p.kcal : null,
  }));

  const cheapest = {};
  const sugars = {};
  for (const g of ['whey', 'plant']) {
    const live = rows.filter((r) => r.live && r.group === g);
    cheapest[g] = Math.min(...live.filter((r) => r.rsg != null).map((r) => r.rsg));
    sugars[g] = live.filter((r) => r.sugar != null).map((r) => r.sugar).sort((a, b) => a - b);
  }
  const minLiveSugar = Math.min(...sugars.whey, ...sugars.plant);

  // Sugar is relative and rounded to a whole number (as in the sheet). If a
  // product's sugar falls outside its group's range, it gets 100 or 0.
  const sugarScore = (r) => {
    if (r.sugar == null) return null;
    const pr = percentRank(sugars[r.group], r.sugar);
    if (pr == null) return r.sugar <= minLiveSugar ? 100 : 0;
    return Math.round(100 * (1 - pr));
  };

  for (const r of rows) {
    const parts = {
      value: r.rsg != null ? (cheapest[r.group] / r.rsg) * 100 : null,
      protein: clamp(((r.protein - 60) / 30) * 100, 0, 100),
      clean: r.sodium != null ? Math.max(0, 100 - 3 * (r.fat ?? 0) - r.sodium / 20) : null,
      sugar: sugarScore(r),
      lab: LAB_SCORE[r.labTier],
    };
    r.parts = parts;
    // No price means no value score, and the sheet leaves the overall blank too.
    if (parts.value == null) {
      r.score = null;
    } else {
      let sum = 0;
      let wsum = 0;
      for (const { key } of PARTS) {
        if (parts[key] == null) continue;
        sum += weights[key] * parts[key];
        wsum += weights[key];
      }
      r.score = wsum > 0 ? Math.round((sum / wsum) * 10) / 10 : null;
    }
  }

  // Ranks: only confirmed ("Live") prices. Plant/yeast sit outside the overall rank.
  const ranked = rows.filter((r) => r.live && r.score != null);
  for (const r of rows) {
    r.rank = null;
    r.typeRank = null;
    if (!r.live || r.score == null) continue;
    if (r.group === 'whey') r.rank = 1 + ranked.filter((o) => o.group === 'whey' && o.score > r.score).length;
    r.typeRank = 1 + ranked.filter((o) => o.type === r.type && o.score > r.score).length;
  }
  return { rows, cheapest };
}

// Per-type summary of confirmed-price rows (the "live numbers" table).
export function typeSummary(rows) {
  const out = {};
  for (const type of Object.keys(TYPE_LABEL)) {
    const live = rows.filter((r) => r.live && r.type === type && r.rsg != null);
    const avg = (f) => live.reduce((s, r) => s + f(r), 0) / live.length;
    const top = live.filter((r) => r.score != null).sort((a, b) => b.score - a.score)[0];
    const cheapest = [...live].sort((a, b) => a.rsg - b.rsg)[0];
    out[type] = {
      count: live.length,
      avgProtein: avg((r) => r.protein),
      avgRsg: avg((r) => r.rsg),
      minRsg: cheapest?.rsg ?? null,
      cheapest,
      avgScore: avg((r) => r.score ?? 0),
      top,
    };
  }
  return out;
}
