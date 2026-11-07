// Excel export in plain English. Reads only answerModel() (js/answer.js), the same data the
// answer page shows, so the file and the screen always agree. X = SheetJS (window.XLSX in the
// browser; passed in so tests can run it in Node). No AI.
import { simpleToRows } from "./simple-map.js";

const USD = "$#,##0", MULT = '0.0"x"', PCT = "0%", RATIO = '"$"0.00';

// rows: arrays of cells. A cell is a plain value, or { v, z } to set a number format.
function sheet(X, rows, widths) {
  const ws = X.utils.aoa_to_sheet(rows.map(r => r.map(c => (c && typeof c === "object" && "v" in c ? c.v : c))));
  rows.forEach((r, i) => r.forEach((c, j) => {
    if (c && typeof c === "object" && "z" in c && typeof c.v === "number") {
      const ref = X.utils.encode_cell({ r: i, c: j });
      if (ws[ref]) ws[ref].z = c.z;
    }
  }));
  ws["!cols"] = widths.map(w => ({ wch: w }));
  return ws;
}
const $ = v => ({ v: Math.round(v), z: USD });
const x = v => ({ v: Math.round(v * 100) / 100, z: MULT });
const cov = v => ({ v: Math.round(v * 100) / 100, z: RATIO });

export function buildOwnerWorkbook(X, S, M, SOURCES) {
  const wb = X.utils.book_new();
  const add = (name, rows, widths) => X.utils.book_append_sheet(wb, sheet(X, rows, widths), name);
  const verdict = { green: "The price can work", yellow: "Close to your limit", red: "Don't pay the asking price" }[M.callClass] || M.callClass;
  const F = M.financing, C = M.comps, E = M.earnings;

  add("Answer", [
    ["DealSpan: should you buy this business?"], [M.name], [],
    ["Verdict", verdict], ["", M.say], ["", M.sub], [],
    ["Offer up to", $(M.bid), M.bidNote],
    ["Walk away above", $(M.walk), M.walkNote],
    ["Asking price", $(M.ask), M.askNote],
    ["What it's worth on its own (low)", $(M.worth.low)],
    ["What it's worth on its own (middle)", $(M.worth.mid)],
    ["What it's worth on its own (high)", $(M.worth.high)],
    ["Most you can finance", $(M.finMax)],
    ...(M.building > 0 ? [[], ["All prices include the building at", $(M.building), "The business itself is valued on its profit."]] : []),
    [], ["Each tab covers one part of the answer: Real profit, What it's worth, Paying for it, What could go wrong, Offer letter."],
    [M.disclaimer]
  ], [36, 16, 90]);

  add("Real profit", [
    ["What the business really earns, per year"], [],
    ["Seller says", $(E.seller)],
    ["A bank will likely believe", $(E.adjusted)],
    ["Overpayment if you pay the asking price on the seller's number", $(E.overpay)], [],
    ["Seller's adjustment", "Seller claims", "We count", "Why"],
    ...E.lines.map(l => [l.label, $(l.claimed), $(l.counted), l.note]), [],
    ["How we decide: each type of adjustment gets a fixed rule based on how lenders treat it. Independent accountants cut the seller's number by 8–15% on about half of small-business loans."],
    [`We replace the owner's pay with a $${Math.round(E.managerSalary).toLocaleString("en-US")} manager's salary, because you'll pay someone to do their job.`],
    ["Overpayment = the profit gap × the asking price ÷ the seller's profit."]
  ], [60, 16, 16, 70]);

  add("What it's worth", [
    ["What it's worth on its own"], [],
    ["Low", $(M.worth.low)], ["Middle", $(M.worth.mid)], ["High", $(M.worth.high)], [],
    ["How well the sold businesses match yours", C.confidence + " match", C.enough ? `${C.count} closest of ${C.considered} ${C.industry.toLowerCase()} deals` : "Not enough close matches (need 3 within 5x your size). Value uses the small-business average only."], [],
    ["Sold business", "Buyer", "Year", "Price", "Sales", "Profit", "Price ÷ profit", "Similarity (of 100)", "Why it matched", "Source"],
    ...C.deals.map(d => [d.target, d.acquirer, d.year, $(d.ev), d.revenue > 0 ? $(d.revenue) : "", $(d.ebitda), x(d.multiple), Math.round(d.score), d.reasons.join("; "), d.source]), [],
    [`Also used: the ${C.benchMult}x average for businesses this size. Big public companies in this industry trade around ${C.publicMult.toFixed(0)}x; small businesses sell for far less.`],
    [`Similarity score, out of 100: same type of work 25, size 30 (zero at 5x bigger or smaller), same kind of buyer 15, deal structure 10, how recent 10, actual vs. forecast profit 10. A deal needs ${C.minScore}+ points to count; closer deals count more.`]
  ], [44, 34, 8, 14, 14, 14, 14, 18, 70, 60]);

  add("Paying for it", [
    ["How you'd pay for it, at the asking price"], [],
    ["Where the money comes from", "Amount"],
    [`${F.loanName} (about ${(F.rate * 100).toFixed(1)}% interest)`, $(F.bank)],
    ["Seller financing (paid back over time)", $(F.seller)],
    ["Your cash", $(F.yourCash)],
    ...(F.gap > 0 ? [["Missing", $(F.gap)]] : []),
    ["Total needed at closing", $(F.total)], [],
    ["Your cash available", $(F.have)], ["Cash this deal needs from you", $(F.need)], [],
    [`Can ${F.combined ? "the combined business" : "the business"} pay its loans?`, F.coverageWord],
    ["Profit earned for every $1 of loan payments", cov(F.coverage), `Banks want at least $${F.minCoverage.toFixed(2)}.`],
    [`If interest rates rise ${(F.stressBps / 100).toFixed(0)}%`, F.stressWord],
    ["Profit for every $1 of loan payments, after the rise", cov(F.stressCoverage)], [],
    ...F.notes.map(n => [n])
  ], [52, 18, 40]);

  add("What could go wrong", [
    ["How serious", "Problem", "What we saw", "Ask the seller", "Protect yourself"],
    ...M.flags.map(f => [f.rating === "red" ? "Serious" : "Watch", f.title, f.what, f.ask, f.fix]),
    ...(M.flags.length ? [] : [["", "Nothing flagged from your answers.", "", "", ""]])
  ], [12, 40, 70, 70, 60]);

  if (M.synergy) {
    const Y = M.synergy;
    add("Savings together", [
      ["What you'd gain by combining the two businesses"], [],
      ["Extra profit you expect per year", $(Y.expected)],
      ["Plan on (per year, once it's fully in)", $(Y.planOn)],
      ["One-time cost to combine", $(Y.integrationCost)],
      ["Value of the savings over 5 years", $(Y.pv)],
      ["Combined yearly profit", $(Y.combinedProfit)],
      ["Total debt ÷ profit, after buying", x(Y.debtToProfit), Y.debtWord], [],
      ["Most buyers overestimate this. Extra sales from combining come in about a quarter below plan and take around 5 years; cost savings are more reliable and arrive in about 2."],
      ["These savings are yours, so we never let you pay the seller more than half of them."],
      ...(Y.overlapNote ? [[Y.overlapNote]] : [])
    ], [44, 16, 20]);
  }

  add("Offer letter", [
    ["Your offer letter"], [],
    ["Offer up to", $(M.bid)], ["Walk away above", $(M.walk)], [],
    ["Check these seller adjustments first", "Asking price that rests on it", "Ask the seller for"],
    ...M.toCheck.map(t => [t.desc, $(t.atStake), t.ask]), [],
    ["Conditions to put in the letter"],
    ...M.conditions.map((c, i) => [`${i + 1}. ${c}`])
  ], [60, 22, 80]);

  add("Seller numbers", simpleToRows(S), [36, 16, 70]);

  add("Sources", [
    ["Source", "Link"],
    ...Object.values(SOURCES).map(s => [s.label, s.url]),
    ...C.deals.map(d => [`Sold business: ${d.target} (${d.year})`, d.source])
  ], [100, 90]);
  return wb;
}
