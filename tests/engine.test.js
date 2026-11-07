// Every expected value below was worked out by hand from the demo inputs in js/data.js.
// Teammate 2: re-check these in Excel. If a rule changes, update the expected value AND the comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import { demoDeal, DEFAULTS } from "../js/data.js";
import { PRECEDENTS } from "../js/precedents.js";
import { parseCSV, rowsToPrecedents } from "../js/csv.js";

const close = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const demo = () => E.runAll(demoDeal(), PRECEDENTS);

test("helpers: pmt, quantile, solveMax", () => {
  close(E.pmt(0.06, 5, 900000), 213656.76, 0.01);    // standard annuity payment
  close(E.pmt(0, 4, 1000), 250, 1e-9);                 // zero-rate case
  assert.equal(E.pmt(0.06, 5, 0), 0);
  close(E.quantile([1, 2, 3, 4], 0.5), 2.5, 1e-9);     // linear interpolation
  close(E.quantile([3.75, 5.75, 4.444], 0.25), 4.097, 0.001);
  close(E.solveMax(x => x <= 7.3, 0, 100), 7.3, 1e-6);
});

test("financial summary: LTM EBITDA and CAGR", () => {
  const R = demo();
  assert.equal(R.fin.ltm.ebitda, 1050000);                        // 8.20M - 4.92M - 2.23M
  close(R.fin.revCagr, Math.sqrt(8200000 / 7200000) - 1, 1e-12);  // 2-period CAGR = 6.72%
});

test("earnings quality: seller vs DealSpan adjusted EBITDA", () => {
  const { eq } = demo();
  assert.equal(eq.reported, 1050000);
  assert.equal(eq.ownerExcess, 160000);       // 285K owner pay - 125K market salary
  assert.equal(eq.claimedTotal, 320000);      // 60 + 45 + 52 + 125 + 38
  assert.equal(eq.seller, 1530000);           // 1,050 + 160 + 320
  // accepted: 60x75% + 45x80% + 52x90% + 125x25% + 38x0% (one-time claimed 2 yrs running -> rejected)
  //         = 45 + 36 + 46.8 + 31.25 + 0 = 159.05K
  close(eq.acceptedTotal, 159050, 1e-6);
  close(eq.adjusted, 1369050, 1e-6);
  close(eq.haircut, 1 - 1369050 / 1530000, 1e-12);   // 10.5%
  assert.equal(eq.items[4].recurring, true);
  assert.equal(eq.downside, 1210000);                 // rejects every seller add-back
});

test("size benchmark thresholds", () => {
  assert.equal(E.sizeBenchmark(500000).metric, "SDE");
  assert.equal(E.sizeBenchmark(1388050).mult, 5.5);
  assert.equal(E.sizeBenchmark(2500000).mult, 7.0);
});

test("valuation: precedents, benchmark, standalone, public comps", () => {
  const { val } = demo();
  // Home-services deals with EBITDA in 0.25x–4x of $1.37M: Kent Island 3.75x, CMI 5.75x, Jake Marshall 4.44x
  assert.equal(val.prec.count, 3);
  close(val.prec.med, 20 / 4.5, 1e-9);
  const benchMid = 5.5 * 1369050;                      // 7,529,775
  const precMid = (20 / 4.5) * 1369050;                // 6,084,667
  close(val.standalone.mid, (benchMid + precMid) / 2, 1e-6);   // 6,807,221
  close(val.pub.mid, 17.18 * 1369050, 1e-6);           // 23.5M: the "size trap"
  assert.ok(val.publicPremium > 2.4);                   // public comps imply >3.4x the standalone value
});

test("synergies: claimed vs realistic, PV", () => {
  const { syn } = demo();
  close(syn.claimedCost, 248400, 1e-6);   // 2% x 4.92M COGS + 90K + 60K
  close(syn.claimedRev, 143500, 1e-6);    // 5% x 8.2M x 35% contribution margin
  close(syn.runRate, 248400 * 0.9 + 143500 * 0.77, 1e-6);   // 334,055
  close(syn.integrationCost, 248400, 1e-6);
  // PV: -248.4K + sum over 5 yrs of phased synergies at 15%
  let pv = -248400;
  for (let y = 1; y <= 5; y++) pv += (223560 * Math.min(1, y / 2) + 110495 * Math.min(1, y / 5)) / Math.pow(1.15, y);
  close(syn.pv, pv, 1e-6);
});

test("combined cash flow available for debt service", () => {
  const { cf } = demo();
  assert.equal(cf.pfEbitda, 4100000 + 1369050);
  assert.equal(cf.capex, 775000);
  close(cf.taxes, 0.25 * (5469050 - 775000), 1e-6);
  close(cf.cfads, 3520537.5, 1e-6);
});

test("financing at the asking price", () => {
  const { atAsk: s } = demo();
  assert.equal(s.uses, 9270000);          // 9.0M + 3% fees
  assert.equal(s.sellerNote, 900000);
  close(s.equity, 2781000, 1e-6);          // 30% minimum equity binds
  close(s.incremental, 5589000, 1e-6);
  close(s.sellerNote + s.incremental + s.equity, s.uses, 1e-6);   // sources = uses
  const ds = 16589000 * (0.0925 + 0.05) + 213656.7603880705;
  close(s.fccr, 3520537.5 / ds, 1e-9);     // 1.37x
  assert.equal(s.binding, "minimum equity rule");
});

test("stress test: +300bp lowers coverage", () => {
  const R = demo();
  const ds = 16589000 * (0.1225 + 0.05) + 213656.7603880705;
  close(R.atAskStress.fccr, 3520537.5 / ds, 1e-9);   // 1.14x
  assert.ok(R.atAskStress.fccr < R.atAsk.fccr);
});

test("coverage covenant binds when equity is scarce", () => {
  const d = demoDeal();
  d.assumptions.minEquityPct = 0;
  const R = E.runAll(d, PRECEDENTS);
  close(R.atAsk.fccr, 1.25, 1e-9);          // senior debt sized exactly to the 1.25x covenant
  assert.equal(R.atAsk.binding, "coverage covenant");
});

test("pricing rules: bid <= walk-away <= financeable max", () => {
  const R = demo();
  const p = R.prices;
  close(p.bidUpTo, R.val.standalone.mid, 1e-6);
  close(p.walkAway, R.val.standalone.mid + 0.5 * R.syn.pv, 1e-6);
  assert.ok(p.bidUpTo <= p.walkAway && p.walkAway <= p.financeableMax);
  // At the financeable max the sponsor's equity check equals the cash available.
  const ctx = { platform: demoDeal().platform, A: DEFAULTS, cf: R.cf, eq: R.eq, syn: R.syn };
  close(E.structureAt(p.financeableMax, ctx).equity, 3000000, 1);
  assert.equal(R.callClass, "red");          // demo ask (9.0M) is above walk-away (7.1M)
});

test("financing cap limits the walk-away when the platform is cash-poor", () => {
  const d = demoDeal();
  d.platform.equityAvailable = 1000000;
  const R = E.runAll(d, PRECEDENTS);
  close(R.prices.walkAway, R.prices.financeableMax, 1e-6);
  assert.ok(R.prices.financeableMax < R.val.standalone.mid);
});

test("value created: multiple arbitrage", () => {
  const R = demo();
  close(R.value.atBid.arbitrage, 8.0 * 1369050 - R.prices.bidUpTo * 1.03, 1e-6);
  close(R.value.atAsk.insideValue, 8.0 * (1369050 + R.syn.runRate), 1e-6);
});

test("monotonic: a bigger unsupported add-back never raises the bid by its full amount", () => {
  const d = demoDeal();
  d.target.addbacks.push({ desc: "Projected price increase", amount: 200000, category: "pro_forma" });
  const R = E.runAll(d, PRECEDENTS);
  close(R.eq.adjusted - 1369050, 50000, 1e-6);   // only 25% accepted
});

test("risk scorecard: top 3 diligence items are the worst red/yellow areas", () => {
  const { risk, conditions } = demo();
  assert.equal(risk.items.length, 12);
  assert.deepEqual(conditions.map(c => c.area), ["Owner dependence", "Add-back quality", "Customer concentration"]);
});

test("precedent CSV: rows need industry, EV, a metric and a source URL", () => {
  const rows = parseCSV('industry,target,ev,revenue,ebitda,source\nhome_services,"A, Inc.",10,5,2,https://x.com\nhome_services,B,10,5,2,\nfoo,C,10,5,2,https://x.com\n');
  const { deals, skipped } = rowsToPrecedents(rows);
  assert.equal(deals.length, 1);
  assert.equal(deals[0].target, "A, Inc.");
  assert.equal(skipped.length, 2);
  assert.ok(PRECEDENTS.every(p => /^https?:\/\//.test(p.source)));
});

test("mispricing: EBITDA overstatement x the ask's multiple (the deck's unit of loss)", () => {
  const { mispricing: m, toTest } = demo();
  close(m.overstatement, 1530000 - 1369050, 1e-6);       // 160,950
  close(m.askMultiple, 9000000 / 1530000, 1e-12);        // 5.88x on the seller's EBITDA
  close(m.priceImpact, 160950 * 9000000 / 1530000, 1e-6); // ~$947K of overpayment
  // Add-backs to test first: biggest claimed dollars first
  assert.deepEqual(toTest.map(t => t.claimed), [125000, 60000, 52000]);
});

test("recurring one-time rule only applies to one-time items", () => {
  const d = demoDeal();
  d.target.addbacks = [{ desc: "x", amount: 100000, category: "personal", priorYear: true }];
  const R = E.runAll(d, PRECEDENTS);
  close(R.eq.acceptedTotal, 80000, 1e-6);   // personal stays at 80%
});
