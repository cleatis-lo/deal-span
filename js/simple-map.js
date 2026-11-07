// Simple (owner) mode: turns the plain-English 3-step answers into a full engine deal.
// Pure functions, no DOM, so the mapping is unit-tested in tests/simple.test.js.
import { DEFAULTS, INDUSTRIES } from "./data.js";

// Plain-English answer choices -> engine values.
export const OPT = {
  topCustomer: [["0.05", "Under 10%"], ["0.15", "10–20%"], ["0.27", "20–35%"], ["0.45", "Over 35%"]],
  top5: [["0.2", "Under 30%"], ["0.4", "30–50%"], ["0.6", "50–70%"], ["0.8", "Over 70%"]],
  owner: [["1", "Runs without them"], ["2", "Checks in weekly"], ["3", "Manages day-to-day"], ["4", "Holds the key customer relationships"], ["5", "The owner IS the business"]],
  recurring: [["0.1", "Almost none"], ["0.35", "About a third"], ["0.6", "More than half"], ["0.85", "Almost all"]],
  staff: [["yes", "Yes, they've agreed to stay"], ["probably", "Probably, nothing signed"], ["no", "No / don't know"]],
  lease: [["own", "Seller owns the building / no lease"], ["long", "5+ years left, can transfer"], ["mid", "2–5 years left"], ["short", "Under 2 years or can't transfer"]],
  transfer: [["yes", "Yes"], ["partly", "Some of them"], ["no", "No / don't know"]],
  supplier: [["no", "No"], ["unsure", "Not sure"], ["yes", "Yes"]],
  books: [["reviewed", "Prepared or reviewed by a CPA"], ["tax_returns", "Tax returns only"], ["internal", "Owner's own spreadsheets / QuickBooks"]],
  building: [["no", "No"], ["yes", "Yes, the building is included"]],
  wc: [["included", "Yes, it's included"], ["extra", "No, it's extra on top"], ["unsure", "Not sure"]],
  sellerPay: [["cash", "All cash at closing"], ["note", "Will carry a note (be paid over time)"], ["earnout", "Open to an earnout (paid if targets are hit)"]],
  overlap: [["yes", "Yes, same customers or area"], ["partly", "Partly"], ["no", "No"]]
};

// How much of your expected savings to believe, by how much the two businesses overlap (assumption).
export const OVERLAP_FACTOR = { yes: 1.0, partly: 0.75, no: 0.5 };

// Subsectors that exist in the comparable-deal data for an industry (for the "what exactly" question).
export function subsectorsFor(industry, precedents) {
  return [...new Set(precedents.filter(p => p.industry === industry && p.ebitda > 0 && p.subsector).map(p => p.subsector))].sort();
}

export const ADD_CATS = [
  ["personal", "Owner's personal expenses paid by the business"],
  ["one_time", "One-time cost that won't happen again"],
  ["discretionary", "Family on payroll / donations"],
  ["pro_forma", "Income they expect but haven't earned yet"],
  ["other", "Other / not sure"]
];

// Small deals are usually financed with an SBA 7(a) loan: $5M max, ~10-year term, 10% minimum equity.
// Terms below are assumptions (verify the current SBA SOP); larger deals use the conventional DEFAULTS.
export const SBA_MAX_PRICE = 7500000;
export const SBA_TERMS = { seniorSpread: 0.0275, amortPct: 0.10, minEquityPct: 0.10, maxNewLoan: 5000000 };

export function blankSimple() {
  return {
    name: "", industry: "home_services", subsector: "", buildingValue: 0, wcAmount: 0, asking: 0, sales: 0, profit: 0, salesPrev: 0, profitPrev: 0, ownerPay: 0, equipment: 0,
    addbacks: [], cash: 0, bizSales: 0, bizProfit: 0, bizDebt: 0, savings: 0, extraSales: 0,
    q: { topCustomer: "0.15", top5: "0.4", owner: "3", recurring: "0.35", staff: "probably", lease: "mid", transfer: "yes", supplier: "no", books: "tax_returns",
         building: "no", wc: "included", sellerPay: "note", overlap: "partly" }
  };
}

// Example 1: an HVAC company owner buying a competitor (same target as the v2 demo).
export function exampleOwner() {
  return Object.assign(blankSimple(), {
    name: "Ridgeline Mechanical (example)", industry: "home_services", subsector: "Commercial HVAC / mechanical contractor", asking: 7250000,
    sales: 8200000, profit: 1050000, salesPrev: 7200000, profitPrev: 830000, ownerPay: 285000, equipment: 175000,
    addbacks: [
      { desc: "One-time legal settlement", cat: "one_time", amt: 60000 },
      { desc: "Owner's truck & fuel", cat: "personal", amt: 45000 },
      { desc: "Spouse on payroll (doesn't work there)", cat: "discretionary", amt: 52000 },
      { desc: "New school-district contract (starts next year)", cat: "pro_forma", amt: 125000 },
      { desc: "Software switch (also claimed as one-time last year)", cat: "one_time", amt: 38000, priorYear: true }
    ],
    cash: 1500000, bizSales: 12000000, bizProfit: 1500000, bizDebt: 1000000, savings: 120000, extraSales: 400000,
    q: { topCustomer: "0.15", top5: "0.4", owner: "4", recurring: "0.35", staff: "probably", lease: "mid", transfer: "partly", supplier: "unsure", books: "tax_returns",
         building: "no", wc: "included", sellerPay: "note", overlap: "yes" }
  });
}
// Example 2: same business, bought by someone without a company.
export function exampleFirst() {
  return Object.assign(exampleOwner(), { asking: 6750000, cash: 900000, bizSales: 0, bizProfit: 0, bizDebt: 0, savings: 0, extraSales: 0 });
}

export const usesSBA = s => (s.asking || 0) <= SBA_MAX_PRICE;

// The building, if included, is priced separately at the value entered: the business is valued on its profit,
// and the building is added on top. Working capital that's extra on top of the price is cash you need at closing.
export const buildingValue = s => (s.q && s.q.building === "yes" ? (s.buildingValue || 0) : 0);
export const extraWC = s => (s.q && s.q.wc === "extra" ? (s.wcAmount || 0) : 0);

export function toDeal(s) {
  const q0 = { ...blankSimple().q, ...(s.q || {}) };
  s = { ...s, q: q0 };
  const bldg = buildingValue(s), wc = extraWC(s);
  const overlap = s.bizSales > 0 ? (OVERLAP_FACTOR[q0.overlap] ?? 0.75) : 1;
  const capex = s.equipment || 0;
  const financials = [];
  if (s.salesPrev > 0) financials.push({ label: "2 years ago", revenue: s.salesPrev, cogs: 0, opex: s.salesPrev - (s.profitPrev || 0), da: capex, capex });
  financials.push({ label: "Last 12 months", revenue: s.sales, cogs: 0, opex: s.sales - s.profit, da: capex, capex });
  const q = s.q;
  const lease = { own: [10, true], long: [6, true], mid: [3, true], short: [1, false] }[q.lease];
  const tr = { yes: [true, true], partly: [true, false], no: [false, false] }[q.transfer];
  const staff = { yes: [2, true], probably: [2, false], no: [0, false] }[q.staff];
  // Buyer's existing business: equipment spend assumed at the target's capex/sales ratio (assumption, shown in the app).
  const capexRatio = s.sales > 0 ? capex / s.sales : 0;
  return {
    target: {
      name: s.name || "The business", industry: INDUSTRIES.some(i => i.id === s.industry) ? s.industry : "home_services", subsector: s.subsector || "", description: "",
      financials, ownerComp: s.ownerPay || 0,
      addbacks: s.addbacks.map(a => ({ desc: a.desc || "Adjustment", amount: a.amt || 0, category: a.cat, priorYear: !!a.priorYear })),
      qual: {
        topCustomerPct: +q.topCustomer, top5CustomerPct: Math.max(+q.top5, +q.topCustomer), ownerDependence: +q.owner, recurringPct: +q.recurring,
        keyEmployees: staff[0], keyRetained: staff[1], topSupplierPct: { no: 0.2, unsure: 0.35, yes: 0.55 }[q.supplier],
        leaseYrs: lease[0], leaseAssignable: lease[1], licensesTransferable: tr[0], contractsAssignable: tr[1], financialQuality: q.books
      }
    },
    platform: {
      name: "Your business", description: "", revenue: s.bizSales || 0, ebitda: s.bizProfit || 0,
      capex: (s.bizSales || 0) * capexRatio, existingDebt: s.bizDebt || 0, multiple: 5.0, equityAvailable: s.cash || 0
    },
    buyerType: s.bizSales > 0 ? "strategic" : "individual",
    sellerTerms: { earnout: q0.sellerPay === "earnout" },
    askingPrice: Math.max(0, (s.asking || 0) - bldg),   // the business alone; the building is added back on screen
    synergy: { procurementPct: 0, backOffice: (s.savings || 0) * overlap, facility: 0, crossSellPct: s.sales > 0 ? (s.extraSales || 0) * overlap / s.sales : 0, contributionMargin: 0.35, pricingPct: 0 },
    assumptions: { ...DEFAULTS, ...(usesSBA(s) ? SBA_TERMS : {}), sellerNotePct: q0.sellerPay === "cash" ? 0 : DEFAULTS.sellerNotePct, extraUses: bldg + wc }
  };
}

export const ready = s => s.asking > 0 && s.sales > 0 && s.profit > 0;

const num = s => { const v = parseFloat(String(s).replace(/[$,\s]/g, "")); return isFinite(v) ? v : 0; };
// Read our simple Excel/CSV template (rows of [field, value, category]).
export function rowsToSimple(rows, base) {
  const n = blankSimple(); if (base && base.q) n.q = base.q;
  const map = { "business name": "name", "industry": "industry", "asking price": "asking", "sales, last 12 months": "sales", "profit (ebitda), last 12 months": "profit", "owner's total pay": "ownerPay", "sales, 2 years ago": "salesPrev", "profit, 2 years ago": "profitPrev", "yearly equipment spending": "equipment" };
  rows.forEach(r => {
    const k = String(r[0] || "").trim(), lk = k.toLowerCase();
    if (lk.startsWith("adjustment:")) { const cat = String(r[2] || "other").trim().toLowerCase(); n.addbacks.push({ desc: k.slice(11).trim(), cat: ADD_CATS.some(c => c[0] === cat) ? cat : "other", amt: num(r[1]) }); return; }
    const f = map[lk]; if (!f) return;
    n[f] = (f === "name" || f === "industry") ? String(r[1] || "").trim() : num(r[1]);
  });
  if (!INDUSTRIES.some(i => i.id === n.industry)) n.industry = "home_services";
  return n;
}
