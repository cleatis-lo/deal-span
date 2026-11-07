// Reference data, tool rules and the demo case. Every rule is either sourced (see SOURCES)
// or labeled "assumption" so a user can see it and change it on the Assumptions panel.

export const SOURCES = {
  damodaran: { label: "Damodaran, NYU Stern: EV/EBITDA by industry (US, Jan 2026)", url: "https://pages.stern.nyu.edu/adamodar/New_Home_Page/datafile/vebitda.html" },
  bizbuysell: { label: "BizBuySell Insight Report (Q1 2026): ~2.7x cash flow (SDE) median for Main Street sales", url: "https://www.bizbuysell.com/insight-report/" },
  pioneer: { label: "Pioneer Buy-Side Brief (2026): ~5.5x EBITDA for $1–5M TEV deals; owner replacement comp $100–150K; QoE cuts stated earnings 8–15% on ~half of deals", url: "https://matthiassmith.kit.com/posts/the-pioneer-buy-side-brief-a-candid-look-at-what-s-actually-closing-in-the-sba-acquisition-market-in-2026" },
  gfdata: { label: "GF Data via ACG (Q2 2026): 7.0x adjusted EBITDA, lower-middle-market sponsor deals", url: "https://www.acg.org/news-trends/news/gf-data-reports-show-steady-middle-market-deal-flow-amid-more-selective" },
  mckinsey: { label: "McKinsey (2018): revenue synergies miss by ~23% on average; ~5 yrs to capture vs ~2 yrs for cost synergies", url: "https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/seven-rules-to-crack-the-code-on-revenue-synergies-in-ma" },
  bain: { label: "Bain (2014): ~70% of acquirers overestimate synergies", url: "https://www.consultancy.uk/news/1191/bain-70-firms-overstate-ma-business-case-benefits" },
  prime: { label: "WSJ Prime Rate 6.75% (verify current before demo)", url: "https://www.fedprimerate.com/" }
};

// Small-business category -> Damodaran public EV/EBITDA (Jan 2026). Cyclicality is a tool assumption.
export const INDUSTRIES = [
  { id: "home_services", label: "Home & commercial services (HVAC, plumbing, electrical)", damo: "Engineering/Construction", publicEvEbitda: 17.18, cyc: "medium" },
  { id: "business_services", label: "Business services", damo: "Business & Consumer Services", publicEvEbitda: 14.26, cyc: "medium" },
  { id: "it_services", label: "IT services / managed service provider", damo: "Computer Services", publicEvEbitda: 14.10, cyc: "low" },
  { id: "software", label: "Software / SaaS", damo: "Software (System & Application)", publicEvEbitda: 24.48, cyc: "low" },
  { id: "healthcare_services", label: "Healthcare services", damo: "Healthcare Support Services", publicEvEbitda: 11.17, cyc: "low" },
  { id: "manufacturing", label: "Industrial manufacturing", damo: "Machinery", publicEvEbitda: 16.22, cyc: "high" },
  { id: "distribution", label: "Wholesale / distribution", damo: "Retail (Distributors)", publicEvEbitda: 13.71, cyc: "medium" },
  { id: "restaurants", label: "Restaurants", damo: "Restaurant/Dining", publicEvEbitda: 17.49, cyc: "high" },
  { id: "trucking", label: "Trucking / logistics", damo: "Trucking", publicEvEbitda: 10.41, cyc: "high" },
  { id: "environmental", label: "Environmental & waste services", damo: "Environmental & Waste Services", publicEvEbitda: 15.61, cyc: "low" },
  { id: "building_products", label: "Building products", damo: "Building Materials", publicEvEbitda: 11.61, cyc: "high" },
  { id: "education", label: "Education / training", damo: "Education", publicEvEbitda: 9.26, cyc: "medium" },
  { id: "retail", label: "Specialty retail", damo: "Retail (Special Lines)", publicEvEbitda: 11.47, cyc: "high" },
  { id: "marketing", label: "Marketing / advertising agency", damo: "Advertising", publicEvEbitda: 12.00, cyc: "high" },
  { id: "food_mfg", label: "Food manufacturing", damo: "Food Processing", publicEvEbitda: 10.01, cyc: "low" }
];

// Share of each claimed add-back the tool accepts (assumption, anchored to Pioneer's QoE evidence).
export const ADDBACK_RULES = {
  one_time:      { label: "One-time / non-recurring", accept: 0.75, note: "Accepted with documentation; 'one-time' items that recur get rejected." },
  personal:      { label: "Owner's personal expenses", accept: 0.80, note: "Needs receipts or GL detail; partial credit is common." },
  discretionary: { label: "Discretionary (donations, family on payroll)", accept: 0.90, note: "Usually accepted if clearly non-operating." },
  pro_forma:     { label: "Pro forma / run-rate (contracts not yet earned)", accept: 0.25, note: "Buyers and lenders rarely pay for earnings that haven't happened." },
  other:         { label: "Other / unsupported", accept: 0.50, note: "Unsupported adjustments get heavy haircuts." }
};

export const DEFAULTS = {
  marketOwnerSalary: 125000,  // Pioneer: $100–150K replacement comp
  baseRate: 0.0675,           // prime; verify before demo
  seniorSpread: 0.025,        // assumption: LMM cash-flow loan priced ~prime + 2.5%
  amortPct: 0.05,             // assumption: 5% of senior debt repaid per year
  maxSeniorLeverage: 4.0,     // assumption: senior debt / pro forma EBITDA cap for a ~$5M EBITDA platform
  minFCCR: 1.25,
  minEquityPct: 0.30,         // assumption: sponsor funds at least 30% of uses with equity              // assumption: typical fixed-charge coverage covenant
  stressBps: 300,             // rate shock used for the stress test
  sellerNotePct: 0.10,        // seller note as % of price (assumption)
  sellerNoteRate: 0.06,
  sellerNoteTermYrs: 5,
  feesPct: 0.03,              // legal, QoE, financing fees (assumption)
  taxRate: 0.25,
  synergyShareMax: 0.50,      // walk-away rule: never pay the seller more than half the synergy value
  discountRate: 0.15,         // for PV of synergies
  costRealize: 0.90, costYrs: 2,   // cost synergies: 90% captured (assumption) over ~2 yrs (McKinsey)
  revRealize: 0.77, revYrs: 5,     // revenue synergies: miss ~23%, ~5 yrs (McKinsey 2018)
  integrationCostMult: 1.0         // one-time integration cost = 1.0x run-rate cost synergies (assumption)
};

export function demoDeal() {
  return {
    target: {
      name: "Ridgeline Mechanical Services",
      industry: "home_services",
      description: "Residential & light-commercial HVAC install and service, 3 counties, 38 employees. Fictional demo company.",
      financials: [
        { label: "FY2024", revenue: 7200000, cogs: 4250000, opex: 2120000, da: 140000, capex: 160000 },
        { label: "FY2025", revenue: 7750000, cogs: 4610000, opex: 2200000, da: 150000, capex: 170000 },
        { label: "LTM Sep-26", revenue: 8200000, cogs: 4920000, opex: 2230000, da: 155000, capex: 175000 }
      ],
      ownerComp: 285000,
      addbacks: [
        { desc: "One-time legal settlement (former employee)", amount: 60000, category: "one_time" },
        { desc: "Owner's personal vehicle & fuel", amount: 45000, category: "personal" },
        { desc: "Spouse on payroll (non-working)", amount: 52000, category: "discretionary" },
        { desc: "Run-rate: new school-district service contract", amount: 125000, category: "pro_forma" },
        { desc: "Software migration (claimed one-time, 2nd year in a row)", amount: 38000, category: "other" }
      ],
      qual: {
        topCustomerPct: 0.14, top5CustomerPct: 0.33, ownerDependence: 4, recurringPct: 0.38,
        keyEmployees: 2, keyRetained: false, topSupplierPct: 0.45, leaseYrs: 3, leaseAssignable: true,
        licensesTransferable: false, contractsAssignable: true, financialQuality: "tax_returns"
      }
    },
    platform: {
      name: "Tri-State Comfort Holdings",
      description: "PE-backed HVAC platform, 4 prior add-ons. Fictional demo company.",
      revenue: 32000000, ebitda: 4100000, capex: 600000, existingDebt: 11000000,
      multiple: 8.0, equityAvailable: 3000000
    },
    askingPrice: 9000000,
    synergy: { procurementPct: 0.02, backOffice: 90000, facility: 60000, crossSellPct: 0.05, contributionMargin: 0.35, pricingPct: 0 },
    assumptions: { ...DEFAULTS }
  };
}

export function blankDeal() {
  const d = demoDeal();
  d.target = {
    name: "", industry: "home_services", description: "",
    financials: d.target.financials.map(f => ({ label: f.label, revenue: 0, cogs: 0, opex: 0, da: 0, capex: 0 })),
    ownerComp: 0, addbacks: [],
    qual: { topCustomerPct: 0, top5CustomerPct: 0, ownerDependence: 3, recurringPct: 0, keyEmployees: 0, keyRetained: false, topSupplierPct: 0, leaseYrs: 0, leaseAssignable: false, licensesTransferable: false, contractsAssignable: false, financialQuality: "internal" }
  };
  d.platform = { name: "", description: "", revenue: 0, ebitda: 0, capex: 0, existingDebt: 0, multiple: 7.0, equityAvailable: 0 };
  d.askingPrice = 0;
  d.synergy = { procurementPct: 0, backOffice: 0, facility: 0, crossSellPct: 0, contributionMargin: 0.35, pricingPct: 0 };
  return d;
}
