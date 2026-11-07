// ============================================================
// DealSpan engine: deterministic, rule-based. No AI at runtime.
// Every output is a function of the inputs, a labeled rule, or a cited source.
// Pure functions only (no DOM), so every formula is unit-tested in tests/.
// ============================================================
import { INDUSTRIES, ADDBACK_RULES, ADDBACK_TESTS } from "./data.js";

// ---------- helpers ----------
export const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
export const pmt = (rate, n, pv) => (pv <= 0 || n <= 0 ? 0 : rate === 0 ? pv / n : pv * rate / (1 - Math.pow(1 + rate, -n)));
export function quantile(arr, q) {
  const a = arr.filter(x => isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
// Largest x in [lo, hi] where ok(x) is true, assuming ok is monotone (true then false).
export function solveMax(ok, lo, hi, iters = 100) {
  if (!ok(lo)) return lo;
  if (ok(hi)) return hi;
  for (let i = 0; i < iters; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}
export const industryById = id => INDUSTRIES.find(i => i.id === id) || INDUSTRIES[0];

// ---------- 1. Target financial summary ----------
export function analyzeFinancials(t) {
  const rows = t.financials.map(y => {
    const grossProfit = y.revenue - y.cogs;
    const ebitda = grossProfit - y.opex;
    return { ...y, grossProfit, ebitda, ebitdaMargin: y.revenue ? ebitda / y.revenue : 0 };
  });
  const first = rows[0], ltm = rows[rows.length - 1], n = rows.length - 1;
  const revCagr = n > 0 && first.revenue > 0 && ltm.revenue > 0 ? Math.pow(ltm.revenue / first.revenue, 1 / n) - 1 : 0;
  return { rows, ltm, revCagr, marginChange: ltm.ebitdaMargin - first.ebitdaMargin };
}

// ---------- 2. Earnings quality ----------
// Seller's adjusted EBITDA = reported + every claimed add-back + owner pay above market salary.
// DealSpan adjusted EBITDA = reported + owner pay above market + (claimed x acceptance rule) per add-back.
export function analyzeEarnings(t, fin, A) {
  const reported = fin.ltm.ebitda;
  const ownerExcess = Math.max(0, (Number(t.ownerComp) || 0) - A.marketOwnerSalary);
  const items = t.addbacks.map(a => {
    const rule = ADDBACK_RULES[a.category] || ADDBACK_RULES.other;
    const claimed = Number(a.amount) || 0;
    // Rule: a "one-time" item that was also claimed last year recurs, so none of it is accepted.
    const recurring = a.category === "one_time" && !!a.priorYear;
    const accept = recurring ? 0 : rule.accept;
    return { ...a, rule, recurring, accept, claimed, accepted: claimed * accept, cut: claimed * (1 - accept),
      ruleText: recurring ? "Claimed as one-time two years running, so rejected (0% accepted)." : `${rule.label}: ${Math.round(rule.accept * 100)}% accepted. ${rule.note}` };
  });
  const claimedTotal = sum(items.map(i => i.claimed));
  const acceptedTotal = sum(items.map(i => i.accepted));
  const seller = reported + ownerExcess + claimedTotal;
  const adjusted = reported + ownerExcess + acceptedTotal;
  const downside = reported + ownerExcess; // rejects every seller add-back
  return {
    reported, ownerExcess, items, claimedTotal, acceptedTotal, seller, adjusted, downside,
    haircut: seller > 0 ? 1 - adjusted / seller : 0,
    addbackPct: reported > 0 ? (claimedTotal + ownerExcess) / reported : Infinity
  };
}

// ---------- 3. Standalone valuation ----------
// Size benchmark: sourced point multiples, +/- 1.0x band (0.5x for SDE) is an assumption.
export function sizeBenchmark(ebitda) {
  if (ebitda < 750000) return { name: "Main Street deals (SDE)", metric: "SDE", mult: 2.7, low: 2.2, high: 3.2, src: "bizbuysell" };
  if (ebitda < 2000000) return { name: "Small private deals ($1–5M TEV)", metric: "EBITDA", mult: 5.5, low: 4.5, high: 6.5, src: "pioneer" };
  return { name: "Lower-middle-market sponsor deals", metric: "EBITDA", mult: 7.0, low: 6.0, high: 8.0, src: "gfdata" };
}

// ---------- 3a. Comparable deals: score every deal on how similar it is to yours ----------
// Points (max 100): same subsector 25 · size 30 · buyer type 15 · structure 10 · recency 10 · profit basis 10.
// Only same-industry deals with an EBITDA figure can score, and deals more than 5x your size either way are never used. The closest deals (score >= minCompScore,
// at most maxComps) are used, and closer deals carry more weight (similarity-weighted median).
export function scoreComparable(p, m, A) {
  if (p.industry !== m.industry || !(p.ev > 0) || !(p.ebitda > 0) || !(m.ebitda > 0)) return null;
  const reasons = [];
  let sub = 0;
  if (m.subsector && p.subsector && p.subsector.toLowerCase() === m.subsector.toLowerCase()) { sub = 25; reasons.push("same type of work"); }
  const ratio = p.ebitda / m.ebitda, r = Math.max(ratio, 1 / ratio);
  const size = 30 * Math.max(0, 1 - Math.log(r) / Math.log(5));
  reasons.push(ratio >= 1 ? `${ratio.toFixed(1)}x your size` : `${(1 / ratio).toFixed(1)}x smaller than yours`);
  let buyer = 0;
  if (p.buyerType && m.buyerType) {
    if (p.buyerType === m.buyerType) { buyer = 15; reasons.push("same kind of buyer"); }
    // A first-time buyer and a search-fund-style holding company both buy without an existing business to merge into.
    else if ([p.buyerType, m.buyerType].sort().join() === "financial,individual") { buyer = 10; reasons.push("search-fund style buyer, close to a first-time buyer"); }
    else buyer = 5;
  }
  let structure = 0;
  if (!!p.earnout === !!m.earnout) { structure += 5; reasons.push(p.earnout ? "also had an earnout" : "no earnout, like yours"); }
  if ((p.stakePct || 100) >= 100) structure += 5; else reasons.push(`only ${p.stakePct}% bought`);
  const yrs = A.asOfYear - parseInt(String(p.date).slice(0, 4), 10);
  const recency = !isFinite(yrs) ? 0 : yrs <= 2 ? 10 : yrs <= 5 ? 5 : 0;
  if (recency === 0) reasons.push("older deal");
  const basis = p.ebitdaBasis === "ltm" ? 10 : 5;
  if (p.ebitdaBasis === "forward") reasons.push("priced on forecast profit");
  const score = sub + size + buyer + structure + recency + basis;
  return { score, parts: { sub, size, buyer, structure, recency, basis }, reasons, multiple: p.ev / p.ebitda };
}

// Weighted median: sort by value, take the first value where cumulative weight reaches half the total.
export function weightedMedian(items) {
  const a = items.filter(i => isFinite(i.v) && i.w > 0).sort((x, y) => x.v - y.v);
  if (!a.length) return NaN;
  const half = a.reduce((s, i) => s + i.w, 0) / 2;
  let c = 0;
  for (const i of a) { c += i.w; if (c >= half) return i.v; }
  return a[a.length - 1].v;
}

export function selectComparables(precedents, m, A) {
  const scored = precedents.map(p => { const s = scoreComparable(p, m, A); return s ? { ...p, ...s } : null; })
    .filter(Boolean).sort((x, y) => y.score - x.score);
  // Hard size rule: a deal more than 5x bigger or smaller than yours (size points = 0) is never used.
  const used = scored.filter(p => p.score >= A.minCompScore && p.parts.size > 0).slice(0, A.maxComps);
  const mults = used.map(p => p.multiple);
  const avgScore = used.length ? sum(used.map(p => p.score)) / used.length : 0;
  const confidence = used.length >= 5 && avgScore >= 60 ? "high" : used.length >= 3 ? "medium" : "low";
  return {
    deals: used, considered: scored.length, count: used.length, avgScore, confidence,
    q1: quantile(mults, 0.25), q3: quantile(mults, 0.75),
    med: weightedMedian(used.map(p => ({ v: p.multiple, w: p.score }))),
    sampleOnly: used.length > 0 && used.every(p => p.isSample)
  };
}

export function analyzeValuation(t, eq, precedents, A) {
  const ind = industryById(t.industry);
  const e = eq.adjusted;
  // Precedents: the closest deals by similarity score (see selectComparables).
  const prec = selectComparables(precedents, { industry: t.industry, subsector: t.subsector, ebitda: e, buyerType: t.buyerType, earnout: !!t.earnout }, A);
  const bench = sizeBenchmark(e);
  // For SDE-sized businesses the benchmark applies to SDE (adds back the full owner salary).
  // SDE adds back the owner's full pay: adjusted EBITDA already includes pay above market, so add the market salary part.
  const benchBase = bench.metric === "SDE" ? e + Math.min(Number(t.ownerComp) || 0, A.marketOwnerSalary) : e;
  const methods = [];
  if (prec.count >= 3) methods.push({ key: "precedents", label: `Closest precedent deals (${prec.count}, ${prec.confidence} match${prec.sampleOnly ? ", sample data" : ""})`, low: prec.q1 * e, mid: prec.med * e, high: prec.q3 * e, basis: `25th–75th percentile ${prec.q1.toFixed(1)}x–${prec.q3.toFixed(1)}x EV/EBITDA, similarity-weighted median ${prec.med.toFixed(1)}x` });
  methods.push({ key: "benchmark", label: bench.name, low: bench.low * benchBase, mid: bench.mult * benchBase, high: bench.high * benchBase, basis: `${bench.mult.toFixed(1)}x ${bench.metric} (range ${bench.low.toFixed(1)}–${bench.high.toFixed(1)}x)`, src: bench.src });
  const core = methods.slice();
  const pub = { label: `Public comps: ${ind.damo} (reference only)`, low: ind.publicEvEbitda * 0.85 * e, mid: ind.publicEvEbitda * e, high: ind.publicEvEbitda * 1.15 * e, basis: `${ind.publicEvEbitda.toFixed(1)}x EV/EBITDA ±15%, public companies`, src: "damodaran", reference: true };
  // Standalone value = simple average of the non-reference methods (rule, shown to the user).
  const standalone = {
    low: sum(core.map(m => m.low)) / core.length,
    mid: sum(core.map(m => m.mid)) / core.length,
    high: sum(core.map(m => m.high)) / core.length
  };
  return {
    ind, ebitda: e, prec, bench, methods: [...core, pub], standalone, pub,
    impliedMultiple: standalone.mid / e,
    publicPremium: standalone.mid > 0 ? pub.mid / standalone.mid - 1 : 0
  };
}

// ---------- 4. Synergies (skeptical by design) ----------
export function analyzeSynergies(t, fin, s, A) {
  const tgt = fin.ltm;
  const cost = [
    { lever: "Procurement savings", claimed: tgt.cogs * (s.procurementPct || 0) },
    { lever: "Back-office consolidation", claimed: s.backOffice || 0 },
    { lever: "Facility consolidation", claimed: s.facility || 0 }
  ].filter(x => x.claimed > 0).map(x => ({ ...x, type: "cost", realistic: x.claimed * A.costRealize }));
  const rev = [
    { lever: "Cross-sell to platform customers", claimed: tgt.revenue * (s.crossSellPct || 0) * (s.contributionMargin || 0) },
    { lever: "Pricing", claimed: tgt.revenue * (s.pricingPct || 0) }
  ].filter(x => x.claimed > 0).map(x => ({ ...x, type: "revenue", realistic: x.claimed * A.revRealize }));
  const claimedCost = sum(cost.map(c => c.claimed)), claimedRev = sum(rev.map(r => r.claimed));
  const realCost = claimedCost * A.costRealize, realRev = claimedRev * A.revRealize;
  const integrationCost = claimedCost * A.integrationCostMult;
  const years = [];
  let pv = -integrationCost; // paid in year 0
  for (let y = 1; y <= 5; y++) {
    const c = realCost * Math.min(1, y / A.costYrs), r = realRev * Math.min(1, y / A.revYrs);
    years.push({ y, cost: c, revenue: r, total: c + r });
    pv += (c + r) / Math.pow(1 + A.discountRate, y);
  }
  return {
    levers: [...cost, ...rev], claimedCost, claimedRev, claimed: claimedCost + claimedRev,
    realCost, realRev, runRate: realCost + realRev, integrationCost, years,
    pv: Math.max(0, pv), // 5-year PV, no terminal value (conservative rule)
    haircut: claimedCost + claimedRev > 0 ? 1 - (realCost + realRev) / (claimedCost + claimedRev) : 0
  };
}

// ---------- 5. Combined financing at a given price ----------
// The add-on is funded with incremental senior debt on the platform's facility, a seller note,
// and sponsor equity. Lenders size on pro forma EBITDA with no credit for synergies.
export function combinedCFADS(platform, tgtLtm, eq, A) {
  const pfEbitda = platform.ebitda + eq.adjusted;
  const capex = (platform.capex || 0) + (tgtLtm.capex || 0);
  const taxes = Math.max(0, pfEbitda - capex) * A.taxRate; // conservative: ignores interest tax shield
  return { pfEbitda, capex, taxes, cfads: pfEbitda - capex - taxes };
}

export function structureAt(price, ctx, rateBump = 0) {
  const { platform, A, cf } = ctx;
  const rate = A.baseRate + A.seniorSpread;
  const fees = price * A.feesPct;
  const uses = price + fees + (A.extraUses || 0); // extraUses: cash needed at closing beyond the price (assumption input)
  const sellerNote = price * A.sellerNotePct;
  const sellerDS = pmt(A.sellerNoteRate, A.sellerNoteTermYrs, sellerNote);
  const existing = platform.existingDebt || 0;
  // Senior capacity: the tighter of the leverage cap and the coverage covenant (at the base rate).
  const capLeverage = A.maxSeniorLeverage * cf.pfEbitda;
  const capCoverage = Math.max(0, (cf.cfads / A.minFCCR - sellerDS) / (rate + A.amortPct));
  const capTotal = Math.min(capLeverage, capCoverage);
  // Optional cap on the new loan itself (e.g. SBA 7(a) maximum). Undefined = no cap.
  const newLoanCap = isFinite(A.maxNewLoan) ? A.maxNewLoan : Infinity;
  const incrementalCapacity = Math.max(0, Math.min(capTotal - existing, newLoanCap));
  const minEquity = uses * A.minEquityPct;
  const need = Math.max(0, uses - sellerNote - minEquity); // debt needed if the sponsor puts in only the minimum
  const incremental = Math.min(incrementalCapacity, need);
  const equity = uses - sellerNote - incremental;
  const seniorTotal = existing + incremental;
  const r = rate + rateBump;
  const seniorDS = seniorTotal * (r + A.amortPct);
  const debtService = seniorDS + sellerDS;
  return {
    price, fees, uses, sellerNote, sellerDS, existing, incremental, incrementalCapacity, equity,
    seniorTotal, rate: r, seniorDS, debtService,
    fccr: debtService > 0 ? cf.cfads / debtService : Infinity,
    seniorLeverage: seniorTotal / cf.pfEbitda,
    totalLeverage: (seniorTotal + sellerNote) / cf.pfEbitda,
    minEquity,
    binding: incrementalCapacity >= need ? "minimum equity rule" : (capTotal - existing) > newLoanCap ? "loan size cap" : capLeverage <= capCoverage ? "senior leverage cap" : "coverage covenant",
    equityPct: uses > 0 ? equity / uses : 0
  };
}

// Day-1 equity value created for the platform's owners by buying at `price`:
// the target (plus realistic synergies) is worth the platform multiple inside the platform.
export function valueCreated(price, ctx) {
  const { platform, eq, syn, A } = ctx;
  const insideValue = platform.multiple * (eq.adjusted + syn.runRate);
  const cost = price * (1 + A.feesPct) + syn.integrationCost;
  return { insideValue, cost, created: insideValue - cost, arbitrage: platform.multiple * eq.adjusted - price * (1 + A.feesPct) };
}

// ---------- 6. Risk scorecard ----------
const rate3 = (v, g, y, higherIsBetter) => !isFinite(v) ? "na" : higherIsBetter ? (v >= g ? "green" : v >= y ? "yellow" : "red") : (v <= g ? "green" : v <= y ? "yellow" : "red");

export function analyzeRisk(t, fin, eq, val) {
  const q = t.qual, R = [];
  const pct = v => `${Math.round(v * 100)}%`;
  const add = (area, rating, weight, finding, ask) => R.push({ area, rating, weight, finding, ask });
  add("Customer concentration", rate3(q.topCustomerPct, 0.10, 0.20, false), 3, `Top customer is ${pct(q.topCustomerPct)} of revenue; top 5 are ${pct(q.top5CustomerPct)}.`, "Revenue by customer for 3 years; call the top customer before LOI; check contract term and change-of-control clauses.");
  const od = q.ownerDependence;
  add("Owner dependence", od <= 2 ? "green" : od === 3 ? "yellow" : "red", 3, `Owner dependence ${od}/5 (${["", "runs without owner", "light involvement", "owner manages day-to-day", "owner holds key relationships", "owner is the business"][od]}).`, "Map who holds customer relationships, licenses and pricing; negotiate a 6–12 month transition and an earnout.");
  add("Recurring revenue", rate3(q.recurringPct, 0.50, 0.20, true), 2, `${pct(q.recurringPct)} of revenue is recurring or contracted.`, "Split revenue into service agreements vs. one-off jobs; check renewal history.");
  add("Key employees", q.keyEmployees >= 2 && q.keyRetained ? "green" : q.keyEmployees >= 1 ? "yellow" : "red", 2, `${q.keyEmployees} key non-owner employee(s); retention ${q.keyRetained ? "agreed" : "not agreed"}.`, "Meet the key employees; fund stay bonuses at close.");
  add("Revenue trend", rate3(fin.revCagr, 0.05, 0.0, true), 1, `Revenue CAGR ${(fin.revCagr * 100).toFixed(1)}%.`, "Monthly revenue for 24 months; split growth into price vs. volume.");
  add("Margin trend", fin.marginChange >= 0 ? "green" : fin.marginChange >= -0.02 ? "yellow" : "red", 1, `EBITDA margin moved ${(fin.marginChange * 100).toFixed(1)} pts.`, "Job-level margins; what drove the change?");
  add("Add-back quality", rate3(eq.addbackPct, 0.15, 0.30, false), 3, `Add-backs are ${isFinite(eq.addbackPct) ? pct(eq.addbackPct) : "n/a"} of reported EBITDA; DealSpan cut ${pct(eq.haircut)} of the seller's number.`, "GL detail and receipts for every add-back over $10K; tie the final price to QoE-verified EBITDA.");
  add("Industry cyclicality", val.ind.cyc === "low" ? "green" : val.ind.cyc === "medium" ? "yellow" : "red", 1, `${val.ind.label}: ${val.ind.cyc} cyclicality (tool rule).`, "How did revenue hold up in 2020?");
  add("Supplier concentration", rate3(q.topSupplierPct, 0.25, 0.50, false), 1, `Top supplier is ${pct(q.topSupplierPct)} of purchases.`, "Confirm the dealer/supplier agreement survives a change of ownership.");
  add("Lease", q.leaseYrs >= 5 && q.leaseAssignable ? "green" : q.leaseYrs >= 2 ? "yellow" : "red", 1, `${q.leaseYrs} yrs left; ${q.leaseAssignable ? "assignable" : "assignment not confirmed"}.`, "Landlord consent and renewal options as a closing condition.");
  add("Licenses & contracts", q.licensesTransferable && q.contractsAssignable ? "green" : (q.licensesTransferable || q.contractsAssignable) ? "yellow" : "red", 2, `Licenses ${q.licensesTransferable ? "transferable" : "not confirmed transferable"}; contracts ${q.contractsAssignable ? "assignable" : "need consent"}.`, "List every license and contract and its named holder; make consents a closing condition.");
  const fq = { audited: "green", reviewed: "green", tax_returns: "yellow", internal: "red" }[q.financialQuality] || "red";
  add("Financial statement quality", fq, 2, `Financials are ${{ audited: "audited", reviewed: "CPA-reviewed", tax_returns: "tax returns only", internal: "internally prepared" }[q.financialQuality] || "unknown"}.`, "Reconcile the P&L to tax returns and bank statements (proof of cash).");
  const score = { green: 0, yellow: 0, red: 0, na: 0 };
  R.forEach(r => score[r.rating]++);
  const sev = { red: 2, yellow: 1, green: 0, na: 0 };
  const top3 = R.filter(r => r.rating === "red" || r.rating === "yellow")
    .sort((a, b) => sev[b.rating] * 10 + b.weight - (sev[a.rating] * 10 + a.weight)).slice(0, 3);
  return { items: R, score, top3 };
}

// ---------- 7. Run everything + the bid ----------
export function runAll(d, precedents) {
  const A = d.assumptions;
  const platform = d.platform;
  // Deal context used to pick comparable deals: who is buying, and whether the seller will take an earnout.
  const t = { ...d.target, buyerType: d.buyerType || (platform.ebitda > 0 ? "strategic" : "financial"), earnout: !!(d.sellerTerms && d.sellerTerms.earnout) };
  const fin = analyzeFinancials(t);
  const eq = analyzeEarnings(t, fin, A);
  const val = analyzeValuation(t, eq, precedents, A);
  const syn = analyzeSynergies(t, fin, d.synergy, A);
  const cf = combinedCFADS(platform, fin.ltm, eq, A);
  const ctx = { platform, A, cf, eq, syn };

  // Financeable max: highest price where the sponsor's equity check fits the cash available.
  const hi = Math.max(1, eq.adjusted) * 30;
  const financeableMax = solveMax(p => structureAt(p, ctx).equity <= (platform.equityAvailable || 0) + 0.5, 0, hi);

  // Pricing rules (shown to the user):
  //   Bid up to  = standalone value (pay for the business, keep the synergies)
  //   Walk away  = standalone value + at most `synergyShareMax` of the synergy PV
  //   both capped at what the platform can finance.
  const bidUpTo = Math.min(val.standalone.mid, financeableMax);
  const walkAway = Math.min(val.standalone.mid + A.synergyShareMax * syn.pv, financeableMax);
  const ask = d.askingPrice || 0;
  const atAsk = structureAt(ask, ctx);
  const atAskStress = structureAt(ask, ctx, A.stressBps / 10000);
  const atBid = structureAt(bidUpTo, ctx);
  const atBidStress = structureAt(bidUpTo, ctx, A.stressBps / 10000);
  const before = { leverage: platform.ebitda > 0 ? (platform.existingDebt || 0) / platform.ebitda : 0 };

  let call, callClass;
  if (ask <= bidUpTo) { call = "Ask is at or below standalone value. Move to LOI."; callClass = "green"; }
  else if (ask <= walkAway) { call = "Ask is inside your walk-away but pays the seller for synergies. Negotiate toward the bid."; callClass = "yellow"; }
  else { call = ask > financeableMax && walkAway >= financeableMax ? "Ask is above what the platform can finance. Counter at the bid or walk." : "Ask is above your walk-away price. Counter at the bid or walk."; callClass = "red"; }

  // The deck's unit of loss: EBITDA overstatement x the multiple the price implies.
  // Ask multiple is measured on the seller's own EBITDA, since that's the number the ask is built on.
  const askMultiple = eq.seller > 0 ? ask / eq.seller : 0;
  const mispricing = { overstatement: eq.seller - eq.adjusted, askMultiple, priceImpact: (eq.seller - eq.adjusted) * askMultiple };
  // Add-backs to test first: ranked by price at stake if the add-back turns out to be false (claimed x ask multiple).
  const toTest = eq.items.filter(i => i.claimed > 0)
    .map(i => ({ desc: i.desc, category: i.category, claimed: i.claimed, accepted: i.accepted, priceAtStake: i.claimed * askMultiple, test: ADDBACK_TESTS[i.category] || ADDBACK_TESTS.other, recurring: i.recurring }))
    .sort((a, b) => b.priceAtStake - a.priceAtStake).slice(0, 3);
  const risk = analyzeRisk(t, fin, eq, val);
  const conditions = risk.top3.map(r => ({ area: r.area, rating: r.rating, ask: r.ask }));

  return {
    fin, eq, val, syn, cf, risk, before, mispricing, toTest,
    prices: { ask, bidUpTo, walkAway, financeableMax, standalone: val.standalone },
    atAsk, atAskStress, atBid, atBidStress,
    value: { atAsk: valueCreated(ask, ctx), atBid: valueCreated(bidUpTo, ctx) },
    call, callClass, conditions: conditions.slice(0, 3)
  };
}
