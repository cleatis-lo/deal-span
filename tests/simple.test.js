// Simple (owner) mode: the plain-English answers must map to the right engine inputs,
// and the SBA loan cap must bind where expected. Expected values worked out by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../js/engine.js";
import { PRECEDENTS } from "../js/precedents.js";
import { DEFAULTS } from "../js/data.js";
import { toDeal, exampleOwner, exampleFirst, usesSBA, SBA_TERMS, rowsToSimple, blankSimple } from "../js/simple-map.js";

const close = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

test("simple mapping: P&L, owner pay and add-backs reach the engine unchanged", () => {
  const d = toDeal(exampleOwner());
  const R = E.runAll(d, PRECEDENTS);
  assert.equal(R.fin.ltm.ebitda, 1050000);          // 8.2M sales - (8.2M - 1.05M profit)
  assert.equal(R.eq.seller, 1530000);               // same seller number as the v2 demo
  close(R.eq.adjusted, 1369050, 1e-6);              // same rule-based number as the v2 demo
  assert.equal(d.target.addbacks[4].priorYear, true);
});

test("simple mapping: risk answers become engine scores", () => {
  const q = toDeal(exampleOwner()).target.qual;
  assert.equal(q.topCustomerPct, 0.15);
  assert.equal(q.ownerDependence, 4);
  assert.equal(q.topSupplierPct, 0.35);             // "not sure" -> 35% (yellow band)
  assert.deepEqual([q.leaseYrs, q.leaseAssignable], [3, true]);             // "2-5 years left"
  assert.deepEqual([q.licensesTransferable, q.contractsAssignable], [true, false]); // "some of them"
});

test("SBA terms apply at or below $7.5M, conventional above", () => {
  assert.equal(usesSBA({ asking: 7500000 }), true);
  assert.equal(usesSBA({ asking: 7500001 }), false);
  const a = toDeal(exampleOwner()).assumptions;
  assert.equal(a.minEquityPct, SBA_TERMS.minEquityPct);
  const big = toDeal({ ...exampleOwner(), asking: 9000000 }).assumptions;
  assert.equal(big.minEquityPct, DEFAULTS.minEquityPct);
  assert.equal(big.maxNewLoan, undefined);
});

test("SBA $5M cap binds on the new loan only", () => {
  const R = E.runAll(toDeal(exampleOwner()), PRECEDENTS);
  assert.equal(R.atAsk.incremental, 5000000);       // capped at $5M
  assert.equal(R.atAsk.binding, "loan size cap");
  assert.equal(R.atAsk.existing, 1000000);          // buyer's existing debt is separate
  // uses = 7.25M x 1.03 = 7,467,500; seller note 725K; equity = 7,467,500 - 725,000 - 5,000,000
  close(R.atAsk.equity, 1742500, 1e-6);
});

test("first-time buyer: no platform, so the target's own cash flow carries the loan", () => {
  const d = toDeal(exampleFirst());
  assert.equal(d.platform.ebitda, 0);
  const R = E.runAll(d, PRECEDENTS);
  close(R.cf.pfEbitda, 1369050, 1e-6);
  assert.ok(R.prices.financeableMax < R.prices.ask); // can't finance the $6.75M ask with $900K
  assert.equal(R.callClass, "red");
});

test("simple template rows parse into the simple state", () => {
  const s = rowsToSimple([
    ["Field", "Value"], ["Business name", "Smith Plumbing"], ["Industry", "home_services"], ["Asking price", "$2,000,000"],
    ["Sales, last 12 months", "3,000,000"], ["Profit (EBITDA), last 12 months", "400000"],
    ["Adjustment: Owner's boat", "20000", "personal"], ["Adjustment: Mystery", "5000", "made_up"]
  ], blankSimple());
  assert.equal(s.name, "Smith Plumbing");
  assert.equal(s.asking, 2000000);
  assert.equal(s.addbacks.length, 2);
  assert.equal(s.addbacks[1].cat, "other");           // unknown category falls back to "other"
});

test("building: valued separately from the business, added as cash needed at closing", () => {
  const s = { ...exampleOwner(), buildingValue: 1000000, q: { ...exampleOwner().q, building: "yes" } };
  const d = toDeal(s);
  assert.equal(d.askingPrice, 6250000);            // 7.25M ask - 1.0M building = the business alone
  assert.equal(d.assumptions.extraUses, 1000000);
});

test("seller wants all cash: no seller note; earnout flag reaches the comparable matching", () => {
  const cash = toDeal({ ...exampleOwner(), q: { ...exampleOwner().q, sellerPay: "cash" } });
  assert.equal(cash.assumptions.sellerNotePct, 0);
  const eo = toDeal({ ...exampleOwner(), q: { ...exampleOwner().q, sellerPay: "earnout" } });
  assert.equal(eo.sellerTerms.earnout, true);
  assert.equal(eo.assumptions.sellerNotePct, DEFAULTS.sellerNotePct);
});

test("overlap scales the savings you can count", () => {
  const no = toDeal({ ...exampleOwner(), q: { ...exampleOwner().q, overlap: "no" } });
  assert.equal(no.synergy.backOffice, 60000);      // 120K entered x 0.5
});
