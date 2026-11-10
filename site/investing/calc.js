// SIP, goal and FD-vs-funds arithmetic. Pure functions, no DOM.
// SIP convention: annual return is nominal and compounds monthly (monthly rate = annual ÷ 12),
// each instalment is paid at the start of the month, and a lumpsum is invested on day one.
// This is the convention most Indian SIP calculators use.

// Tax rules, checked Nov 2026 (FY 2026-27). See the Sources block on the page.
export const TAX = {
  cess: 0.04, // health and education cess on income tax
  equitySTCG: 0.2, // equity-oriented funds held 12 months or less
  equityLTCG: 0.125, // held more than 12 months, on gains above the yearly exemption
  equityLTCGExempt: 125000, // per financial year, across all listed equity gains
  fdTdsRate: 0.1, // TDS with PAN
  fdTdsThreshold: 50000, // interest per bank per year, under 60
  fdTdsThresholdSenior: 100000, // 60 and over
};

export function sip({ monthly, stepUpPct = 0, ratePct, years, lump = 0, inflationPct = 0 }) {
  const i = ratePct / 1200;
  let bal = lump;
  let invested = lump;
  let p = monthly;
  const rows = [];
  for (let y = 1; y <= years; y++) {
    let yearIn = 0;
    for (let k = 0; k < 12; k++) {
      bal = (bal + p) * (1 + i);
      invested += p;
      yearIn += p;
    }
    rows.push({ y, monthly: p, yearIn, invested, value: bal, gains: bal - invested, real: bal / (1 + inflationPct / 100) ** y });
    p *= 1 + stepUpPct / 100;
  }
  const last = rows.at(-1) || { invested: lump, value: lump, gains: 0, real: lump };
  return { rows, invested: last.invested, value: last.value, gains: last.value - last.invested, real: last.real };
}

export function goal({ targetToday, years, inflationPct, ratePct, stepUpPct = 0 }) {
  const future = targetToday * (1 + inflationPct / 100) ** years;
  const perRupee = sip({ monthly: 1, stepUpPct, ratePct, years }).value;
  const monthly = perRupee > 0 ? future / perRupee : null;
  const lump = future / (1 + ratePct / 1200) ** (years * 12);
  const plan = sip({ monthly, stepUpPct, ratePct, years });
  return { future, monthly, lump, invested: plan.invested, plan };
}

// Post-tax value of `amount` after `years` in an FD, a debt fund and an arbitrage fund.
// slab is the marginal slab rate (0.3 for 30%). Cess is added on top; surcharge is ignored.
export function fdVsFunds({ amount, years, slab, fdPct, debtPct, arbPct }) {
  const c = 1 + TAX.cess;
  const t = slab * c;
  // FD: quarterly compounding, interest taxed every year as it accrues (cumulative FD),
  // with the tax paid out of the deposit so it stops compounding.
  const fdEff = (1 + fdPct / 400) ** 4 - 1;
  const fdPre = amount * (1 + fdEff) ** years;
  const fdPost = amount * (1 + fdEff * (1 - t)) ** years;
  const fdYear1Interest = amount * fdEff;
  // Debt fund bought on or after 1 Apr 2023: whole gain taxed at slab when you redeem, no indexation.
  const debtPre = amount * (1 + debtPct / 100) ** years;
  const debtTax = (debtPre - amount) * t;
  // Arbitrage fund (equity-oriented): 20% up to 12 months, else 12.5% above ₹1.25 lakh.
  const arbPre = amount * (1 + arbPct / 100) ** years;
  const arbGain = arbPre - amount;
  const longTerm = years >= 1;
  const arbTax = longTerm ? Math.max(0, arbGain - TAX.equityLTCGExempt) * TAX.equityLTCG * c : Math.max(0, arbGain) * TAX.equitySTCG * c;
  const cagr = (v) => (v / amount) ** (1 / years) - 1;
  const out = [
    { key: 'fd', name: 'Fixed deposit', pre: fdPre, tax: fdPre - fdPost, post: fdPost, rule: `Slab ${Math.round(slab * 100)}% + cess, every year` },
    { key: 'debt', name: 'Debt fund', pre: debtPre, tax: debtTax, post: debtPre - debtTax, rule: `Slab ${Math.round(slab * 100)}% + cess, at redemption` },
    { key: 'arb', name: 'Arbitrage fund', pre: arbPre, tax: arbTax, post: arbPre - arbTax, rule: longTerm ? 'LTCG 12.5% + cess above ₹1.25 lakh' : 'STCG 20% + cess' },
  ];
  out.forEach((r) => { r.cagr = cagr(r.post); r.preCagr = cagr(r.pre); });
  return { rows: out, fdYear1Interest, longTerm, effSlab: t };
}
