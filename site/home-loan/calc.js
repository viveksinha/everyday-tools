// Loan arithmetic. Pure functions, no DOM, so they can be checked by hand or in Node.
// Convention: annual rates are nominal and compound monthly (monthly rate = annual ÷ 12),
// the same way Indian lenders quote EMIs. Investment returns on this page use the same rule.

export const monthlyRate = (annualPct) => annualPct / 1200;

export function emi(P, annualPct, n) {
  if (!(P > 0) || !(n > 0)) return 0;
  const r = monthlyRate(annualPct);
  if (r === 0) return P / n;
  const f = (1 + r) ** n;
  return (P * r * f) / (f - 1);
}

// Month-by-month schedule with optional prepayments.
// opts.oneOff = { amt, month }: paid right after EMI number `month`.
// opts.yearly = amt: paid after every 12th EMI (12, 24, 36 …).
// opts.mode = 'tenure' keeps the EMI and ends the loan early; 'emi' keeps the end date and lowers the EMI.
export function schedule(P, annualPct, n, opts = {}) {
  const r = monthlyRate(annualPct);
  const emi0 = emi(P, annualPct, n);
  let pay = emi0;
  let bal = P;
  const rows = [];
  for (let m = 1; m <= n && bal > 0; m++) {
    const interest = bal * r;
    const principal = Math.min(Math.max(pay - interest, 0), bal);
    bal -= principal;
    if (bal < 0.01) bal = 0;
    let pre = 0;
    if (bal > 0) {
      if (opts.oneOff?.amt > 0 && opts.oneOff.month === m) pre += opts.oneOff.amt;
      if (opts.yearly > 0 && m % 12 === 0) pre += opts.yearly;
      pre = Math.min(pre, bal);
      bal -= pre;
      if (bal < 0.01) bal = 0;
      if (pre > 0 && opts.mode === 'emi' && bal > 0 && n - m > 0) pay = emi(bal, annualPct, n - m);
    }
    rows.push({ m, pay: interest + principal, interest, principal, prepay: pre, bal });
  }
  const totalInterest = rows.reduce((s, x) => s + x.interest, 0);
  return { emi0, emiEnd: pay, rows, months: rows.length, totalInterest };
}

// Calendar year and Indian financial year (Apr–Mar) of EMI number m, given the first EMI month "YYYY-MM".
export function monthDate(start, m) {
  const [y, mo] = start.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + (m - 1);
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
export const fyOf = ({ year, month }) => (month >= 4 ? year : year - 1);

// Prepay vs invest over the original tenure. Every month both plans spend the same cash:
// the original EMI plus the planned prepayment. Whatever a plan doesn't send to the bank
// goes into an investment earning `investPct` a year (monthly compounding, invested at month end).
// Optional tax: old-regime home-loan interest deduction, capped per financial year.
export function prepayVsInvest({ P, rate, n, oneOff, yearly, mode, investPct, start, tax }) {
  const base = schedule(P, rate, n);
  const pre = schedule(P, rate, n, { oneOff, yearly, mode });
  const planned = (m) => (oneOff?.amt > 0 && oneOff.month === m ? oneOff.amt : 0) + (yearly > 0 && m % 12 === 0 && m < n ? yearly : 0);
  const i = monthlyRate(investPct);
  const taxRate = tax ? tax.slab * (1 + tax.cess) : 0;
  function run(s) {
    let corpus = 0;
    let put = 0;
    let fyInterest = 0;
    let taxSaved = 0;
    for (let m = 1; m <= n; m++) {
      const row = s.rows[m - 1];
      const out = row ? row.pay + row.prepay : 0;
      let inject = base.emi0 + planned(m) - out;
      if (tax) {
        fyInterest += row ? row.interest : 0;
        const d = monthDate(start, m);
        if (d.month === 3 || m === n) {
          const saved = taxRate * Math.min(fyInterest, tax.cap);
          inject += saved;
          taxSaved += saved;
          fyInterest = 0;
        }
      }
      corpus = corpus * (1 + i) + Math.max(0, inject);
      put += Math.max(0, inject);
    }
    return { corpus, put, taxSaved };
  }
  const a = run(pre);
  const b = run(base);
  return { prepay: a, invest: b, diff: a.corpus - b.corpus, base, pre };
}

export function breakEven(args) {
  const d = (r) => prepayVsInvest({ ...args, investPct: r }).diff;
  let lo = 0;
  let hi = 40;
  if (d(lo) <= 0) return 0;
  if (d(hi) > 0) return null;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (d(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Rent vs buy, simulated month by month. Both households spend the same each month;
// whoever spends less invests the difference. The renter starts by investing the buyer's
// up-front cash (down payment + stamp duty and registration).
export function rentVsBuy(o) {
  const loan = o.price * (1 - o.downPct / 100);
  const down = o.price - loan;
  const stamp = o.price * (o.stampPct / 100);
  const sch = schedule(loan, o.rate, o.tenureYears * 12);
  const i = monthlyRate(o.investPct);
  let renter = down + stamp;
  let buyer = 0;
  let rentPaid = 0;
  let upkeepPaid = 0;
  const years = [{ y: 0, home: o.price, bal: loan, buyNW: down, rentNW: renter, rent: 0, buyCost: 0 }];
  let yRent = 0;
  let yBuy = 0;
  for (let t = 1; t <= o.horizon * 12; t++) {
    const yi = Math.floor((t - 1) / 12);
    const rent = o.rent * (1 + o.rentUpPct / 100) ** yi;
    const upkeep = (o.maint + o.ptax / 12) * (1 + o.upkeepUpPct / 100) ** yi;
    const row = sch.rows[t - 1];
    const buyCost = (row ? row.pay : 0) + upkeep;
    const diff = buyCost - rent;
    renter = renter * (1 + i) + Math.max(diff, 0);
    buyer = buyer * (1 + i) + Math.max(-diff, 0);
    rentPaid += rent;
    upkeepPaid += upkeep;
    yRent += rent;
    yBuy += buyCost;
    if (t % 12 === 0) {
      const y = t / 12;
      const home = o.price * (1 + o.apprPct / 100) ** y;
      const bal = row ? row.bal : 0;
      years.push({ y, home, bal, buyer, buyNW: home - bal + buyer, rentNW: renter, rent: yRent, buyCost: yBuy });
      yRent = 0;
      yBuy = 0;
    }
  }
  const cross = years.find((r) => r.y > 0 && r.buyNW >= r.rentNW);
  return { loan, down, stamp, emi: sch.emi0, years, crossYear: cross ? cross.y : null, rentPaid, upkeepPaid, totalInterest: sch.totalInterest };
}
