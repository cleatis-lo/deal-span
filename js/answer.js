// The plain-English answer, as data. Both the answer page (simple.js) and the Excel
// export (owner-workbook.js) read from answerModel(), so they can never disagree.
// Pure functions, no DOM. All math stays in engine.js. No AI.
import { OPT, buildingValue, extraWC, usesSBA } from "./simple-map.js";

export const money = v => !isFinite(v) ? "—" : (v < 0 ? "-" : "") + "$" + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : Math.round(Math.abs(v) / 1e3).toLocaleString("en-US") + "K");
const lbl = (set, v) => ((OPT[set].find(o => o[0] === v) || [, ""])[1]).toLowerCase();

// What to ask the seller for, per adjustment type.
export const ADD_ASK = {
  one_time: "invoices or settlement papers, plus 3 years of the books showing it didn't happen before.",
  personal: "receipts showing the expense is personal and stops after the sale.",
  discretionary: "payroll records and job duties, to confirm you won't need to replace the person.",
  pro_forma: "the signed contract, start date and expected margin. Pay for it only once it's earned (an earnout).",
  other: "the detailed books and a written explanation of why it won't happen again."
};
export const ADD_WHY = {
  one_time: "Mostly counted, if it truly won't happen again.",
  personal: "Partly counted. Banks want receipts for personal expenses.",
  discretionary: "Usually counted.",
  pro_forma: "Mostly not counted. It hasn't been earned yet.",
  other: "Half counted. It's unclear what this is."
};

// Engine risk areas -> owner language: [title, what we saw, ask the seller, protect yourself].
export function plainFlag(f, S, R) {
  const q = S.q, e = R.eq, fin = R.fin;
  const P = {
    "Customer concentration": ["Sales depend on a few customers", `The biggest customer is about ${lbl("topCustomer", q.topCustomer)} of sales and the top 5 are ${lbl("top5", q.top5)}. If a big one leaves, profit drops fast.`, "Is there a signed contract with the biggest customers, and when does it end? Ask to talk to them before you sign.", "Tie part of the price to those customers staying (an earnout)."],
    "Owner dependence": ["The business depends on the owner", `The owner ${+q.owner >= 5 ? "is the business" : +q.owner === 4 ? "holds the key customer relationships" : "manages it day-to-day"}. Customers may follow them out the door.`, "Who has the customer relationships, licenses and pricing knowledge today?", "Require the owner to stay 6–12 months to hand things over, and line up a manager before closing."],
    "Recurring revenue": ["Not much repeat business", `${lbl("recurring", q.recurring).replace(/^./, c => c.toUpperCase())} of sales repeats or is under contract. The rest has to be won again every year.`, "How much of last year's sales came from service plans or repeat customers?", "Base your price on the repeat sales and treat one-off jobs as a bonus."],
    "Key employees": ["Key employees might leave", q.staff === "no" ? "You don't know whether the key people will stay." : "Key employees haven't agreed to stay yet.", "Can you meet the key employees before closing? Are they paid fairly?", "Offer stay bonuses, paid at closing or after one year."],
    "Revenue trend": ["Sales aren't growing", `Sales changed about ${(fin.revCagr * 100).toFixed(1)}% a year.`, "Why? Lost customers, lower prices, or one big job ending?", "Price it on today's profit, not the seller's forecast."],
    "Margin trend": ["Profit margins are shrinking", `Profit as a share of sales fell ${Math.abs(fin.marginChange * 100).toFixed(1)} points.`, "What changed: wages, material costs, or prices?", "Price it on the weaker year if the cause won't go away."],
    "Add-back quality": ["The profit depends on the seller's adjustments", `The adjustments add ${Math.round(e.addbackPct * 100)}% on top of reported profit, and about ${Math.round(e.haircut * 100)}% of the seller's number probably won't hold up.`, "Ask for receipts and records for every adjustment over $10K.", "Hire an accountant to verify profit (a quality-of-earnings review) and tie the price to what they find."],
    "Industry cyclicality": ["Sales could drop in a recession", `This type of business ${R.val.ind.cyc === "high" ? "usually gets hit hard" : "usually feels it some"} when the economy slows.`, "How did sales hold up in 2020 and in the last slowdown?", "Borrow less than the maximum and keep a cash cushion."],
    "Supplier concentration": ["It depends on one supplier", q.supplier === "yes" ? "One supplier provides more than half of what they buy." : "You don't know yet whether one supplier dominates.", "Are there other suppliers? Will the supplier agreement continue after the sale?", "Get the supplier's sign-off before closing."],
    "Lease": ["The building lease", q.lease === "short" ? "Less than 2 years left on the lease, or it can't be transferred." : "Only 2–5 years left on the lease.", "Will the landlord transfer or extend the lease? Is the seller the landlord?", "Make a signed lease a condition of closing. Banks usually want it to run as long as the loan."],
    "Licenses & contracts": ["Licenses or contracts may not transfer", q.transfer === "partly" ? "Some licenses or customer contracts may not transfer to you." : "You don't know whether licenses and contracts will transfer.", "List every license, permit and customer contract. Whose name is on each?", "Make the transfers a condition of closing."],
    "Financial statement quality": ["The financial records are thin", `The records are ${lbl("books", q.books)}.`, "Can they show bank statements that match the tax returns?", "Don't skip the quality-of-earnings review."]
  };
  const x = P[f.area] || [f.area, f.finding, f.ask, ""];
  return { rating: f.rating, title: x[0], what: x[1], ask: x[2], fix: x[3] };
}

// Loan coverage in words: dollars earned per $1 of loan payments.
export function coverWord(d, minFCCR) {
  d = Math.round(d * 100) / 100;
  return d >= 1.35 ? ["green", "Yes, comfortably"] : d >= minFCCR ? ["green", "Yes, at the bank's minimum"] : d >= 1.1 ? ["amber", "Just barely. Below what banks require"] : ["red", "No"];
}

export function answerModel(S, D, R) {
  const p = R.prices, e = R.eq, v = R.val, a = R.atAsk, st = R.atAskStress, y = R.syn, A = D.assumptions;
  // Prices shown include the building (if any); the engine values the business alone.
  const B = buildingValue(S), WC = extraWC(S);
  const ask = p.ask + B, bid = p.bidUpTo + B, walk = p.walkAway + B, finMax = p.financeableMax + B;
  const worth = { low: p.standalone.low + B, mid: p.standalone.mid + B, high: p.standalone.high + B };
  const flags = R.risk.items.filter(r => r.rating === "red" || r.rating === "yellow")
    .sort((x, z) => (x.rating === "red" ? -1 : 1) - (z.rating === "red" ? -1 : 1)).map(f => plainFlag(f, S, R));
  const reds = flags.filter(f => f.rating === "red").length;
  const limitedByCash = finMax < worth.mid + 1;
  const have = D.platform.equityAvailable;

  // Verdict, from the engine's call.
  let say, sub;
  if (R.callClass === "green") {
    say = reds ? `The price can work, but fix ${reds} serious problem${reds === 1 ? "" : "s"} first.` : `The asking price of ${money(ask)} looks reasonable.`;
    sub = `It's at or below what the business is worth on its own. Don't go above ${money(walk)}, and confirm the profit with an accountant before you sign.`;
  } else if (R.callClass === "yellow") {
    say = `The asking price of ${money(ask)} is close to your limit.`;
    sub = `It's more than the business is worth on its own: you'd be paying the seller for savings only you can create. Offer ${money(bid)} and walk away above ${money(walk)}.`;
  } else {
    say = `Don't pay ${money(ask)}.`;
    sub = limitedByCash
      ? `With ${money(have)} of your own cash, the most you can finance is ${money(finMax)}. Offer up to ${money(bid)} and walk away above ${money(walk)}.`
      : `On the profit a bank will believe, it's worth about ${money(worth.low)}–${money(worth.high)}. Offer up to ${money(bid)} and walk away above ${money(walk)}.`;
  }

  // 1. What it really earns.
  const lines = [];
  if (e.ownerExcess > 0) lines.push({ status: "ok", label: `Owner pay above a manager's salary (${money(D.target.ownerComp)} paid − ${money(A.marketOwnerSalary)} to replace them)`, note: "Counted. You'll pay a manager instead.", claimed: e.ownerExcess, counted: e.ownerExcess });
  e.items.forEach(i => lines.push({
    status: i.accept >= 0.85 ? "ok" : i.accept >= 0.5 ? "part" : "no", label: i.desc,
    note: i.recurring ? "Not counted. They called it one-time last year too, so it keeps happening." : ADD_WHY[i.category] || "",
    claimed: i.claimed, counted: i.accepted
  }));

  // 2. What it's worth: the comparable deals.
  const pc = v.prec;
  const comps = {
    confidence: pc.confidence, count: pc.count, considered: pc.considered, enough: pc.count >= 3,
    industry: v.ind.label, benchMult: v.bench.mult, publicMult: e.adjusted > 0 ? v.pub.mid / e.adjusted : NaN, minScore: A.minCompScore,
    deals: pc.deals.map(d => ({ target: d.target, acquirer: d.acquirer, year: String(d.date).slice(0, 4), ev: d.ev, revenue: d.revenue, ebitda: d.ebitda,
      multiple: d.multiple, score: d.score, reasons: d.reasons, source: d.source, notes: d.notes }))
  };

  // 3. How you'd pay for it (at the asking price).
  const need = a.equity, gap = Math.max(0, need - have);
  const [c1, w1] = coverWord(a.fccr, A.minFCCR), [c2, w2] = coverWord(st.fccr, A.minFCCR);
  const finNotes = [];
  finNotes.push(gap > 0 ? `At ${money(ask)} you'd need ${money(need)} of your own money. You have ${money(have)}. That's why the most you can finance is ${money(finMax)}.` : `You'd put in ${money(need)} of the ${money(have)} you have.`);
  if (a.binding === "loan size cap") finNotes.push("The SBA caps the loan at $5M.");
  if (a.existing > 0) finNotes.push(`Your business already owes ${money(a.existing)}, and the bank looks at both businesses together.`);
  if (WC > 0) finNotes.push(`This includes ${money(WC)} for inventory and receivables paid on top of the price.`);
  if (S.q.sellerPay === "cash") finNotes.push("The seller wants all cash, so there's no seller financing.");
  const financing = {
    loanName: usesSBA(S) ? "SBA 7(a) loan" : "Bank term loan", rate: a.rate,
    bank: a.incremental, seller: a.sellerNote, yourCash: Math.min(need, have), gap, need, have, total: a.uses,
    combined: a.existing > 0 || D.platform.ebitda > 0,
    coverage: a.fccr, coverageColor: c1, coverageWord: w1, stressCoverage: st.fccr, stressColor: c2, stressWord: w2,
    minCoverage: A.minFCCR, stressBps: A.stressBps, notes: finNotes
  };

  // 5. Savings from combining (only if the buyer has a business and expects savings).
  const synergy = y.claimed > 0 ? {
    expected: (S.savings || 0) + (S.extraSales || 0) * 0.35, planOn: y.runRate, integrationCost: y.integrationCost, pv: y.pv,
    combinedProfit: R.cf.pfEbitda, debtToProfit: a.totalLeverage,
    debtWord: a.totalLeverage > 4 ? "high" : a.totalLeverage > 3 ? "moderate" : "healthy",
    overlapNote: S.q.overlap !== "yes" ? `Because the businesses ${S.q.overlap === "no" ? "don't overlap" : "only partly overlap"}, we counted ${S.q.overlap === "no" ? "half" : "three-quarters"} of the savings you entered.` : ""
  } : null;

  // Offer letter.
  const toCheck = R.toTest.map(t => ({ desc: t.desc, atStake: t.priceAtStake, ask: ADD_ASK[t.category] || t.test }));
  const conds = [`Price at or below ${money(walk)}.`, `An accountant's review (quality of earnings) confirms profit of at least ${money(e.adjusted * 0.95)}. If it comes in lower, the price drops.`];
  if (gap > 0) conds.push(`Close the ${money(gap)} cash gap: a bigger seller note, an investor, or a lower price.`);
  flags.filter(f => f.rating === "red" && f.title !== "The profit depends on the seller's adjustments").forEach(f => conds.push(f.fix));
  if (+S.q.owner === 3) conds.push("The owner stays 6–12 months to hand over customers and know-how.");
  const proForma = e.items.filter(i => i.category === "pro_forma" && i.claimed > 0);
  if (S.q.sellerPay === "earnout" && proForma.length) conds.push(`Pay for ${proForma.map(i => i.desc.toLowerCase()).join(", ")} through the earnout, only once it's actually earned.`);
  if (B > 0) conds.push(`An independent appraisal confirms the building is worth at least ${money(B)}.`);

  return {
    name: D.target.name, callClass: R.callClass, say, sub, reds,
    building: B, extraWC: WC, ask, bid, walk, finMax, worth, limitedByCash,
    bidNote: `what it's worth on its own${bid < worth.mid - 1 ? ", limited by what you can finance" : ""}`,
    walkNote: y.pv > 0 && walk > bid + 1 ? "never give the seller more than half your savings" : "your hard limit",
    askNote: ask > walk ? `${money(ask - walk)} above your walk-away` : "inside your limit",
    earnings: { seller: e.seller, adjusted: e.adjusted, overpay: R.mispricing.priceImpact, managerSalary: A.marketOwnerSalary, lines },
    comps, financing, flags, synergy, toCheck, conditions: [...new Set(conds)],
    disclaimer: "This is a first screen, not a quality-of-earnings report or a valuation opinion. Every number comes from your inputs, a fixed rule, or a public source. No AI is used."
  };
}
