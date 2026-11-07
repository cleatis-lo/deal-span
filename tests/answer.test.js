// The Excel export must say exactly what the answer page says, in plain English,
// and a saved export must load back into the app with the same numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as E from "../js/engine.js";
import { PRECEDENTS } from "../js/precedents.js";
import { SOURCES } from "../js/data.js";
import { toDeal, exampleOwner, exampleFirst, rowsToSimple, buildingValue } from "../js/simple-map.js";
import { answerModel, money } from "../js/answer.js";
import { buildOwnerWorkbook } from "../js/owner-workbook.js";

const sandbox = {};
vm.runInNewContext(readFileSync(new URL("../vendor/xlsx.full.min.js", import.meta.url), "utf8"), sandbox);
const X = sandbox.XLSX;
const model = S => { const D = toDeal(S), R = E.runAll(D, PRECEDENTS); return { D, R, M: answerModel(S, D, R) }; };
const rows = (wb, name) => X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
const find = (wb, name, label) => rows(wb, name).find(r => r[0] === label);

test("money formatting", () => {
  assert.equal(money(6989248), "$6.99M");
  assert.equal(money(1000000), "$1M");
  assert.equal(money(243000), "$243K");
  assert.equal(money(-50000), "-$50K");
  assert.equal(money(NaN), "—");
});

test("answer model carries the engine's prices, plus the building", () => {
  const S = exampleOwner();
  const { R, M } = model(S);
  assert.equal(M.bid, R.prices.bidUpTo);
  assert.equal(M.walk, R.prices.walkAway);
  assert.equal(M.ask, 7250000);
  const S2 = { ...exampleOwner(), buildingValue: 1000000, q: { ...exampleOwner().q, building: "yes" } };
  const b = model(S2);
  assert.equal(buildingValue(S2), 1000000);
  assert.equal(b.M.ask, 7250000);                          // the ask already includes the building
  assert.equal(b.M.bid, b.R.prices.bidUpTo + 1000000);     // engine values the business without it
  assert.ok(b.M.conditions.some(c => c.includes("appraisal")));
});

test("owner example: verdict, financing and comparables in words", () => {
  const { M } = model(exampleOwner());
  assert.equal(M.callClass, "red");
  assert.equal(M.say, "Don't pay $7.25M.");
  assert.equal(M.comps.count, 6);
  assert.equal(M.comps.confidence, "high");
  assert.equal(M.financing.loanName, "SBA 7(a) loan");
  assert.ok(M.financing.notes.includes("The SBA caps the loan at $5M."));
  assert.ok(M.flags.length > 0 && M.flags.every(f => f.title && f.what && f.ask && f.fix));
});

test("Excel export: same numbers as the screen, real number cells, plain-English tabs", () => {
  for (const S of [exampleOwner(), exampleFirst()]) {
    const { M } = model(S);
    const wb = X.read(X.write(buildOwnerWorkbook(X, S, M, SOURCES), { type: "buffer", bookType: "xlsx" }), { cellNF: true });
    const tabs = ["Answer", "Real profit", "What it's worth", "Paying for it", "What could go wrong", "Offer letter", "Seller numbers", "Sources"];
    for (const t of tabs) assert.ok(wb.SheetNames.includes(t), `missing tab ${t}`);
    assert.equal(wb.SheetNames.includes("Savings together"), !!M.synergy);
    assert.equal(find(wb, "Answer", "Offer up to")[1], Math.round(M.bid));
    assert.equal(find(wb, "Answer", "Walk away above")[1], Math.round(M.walk));
    assert.equal(find(wb, "Answer", "Asking price")[1], Math.round(M.ask));
    assert.equal(find(wb, "Real profit", "A bank will likely believe")[1], Math.round(M.earnings.adjusted));
    // Money cells are numbers formatted as dollars, so they can be summed in Excel.
    const ws = wb.Sheets["Answer"], ref = "B8";
    assert.equal(ws[ref].t, "n");
    assert.equal(ws[ref].z, "$#,##0");
    // One row per comparable deal, in the same order as the screen.
    const comp = rows(wb, "What it's worth");
    const h = comp.findIndex(r => r[0] === "Sold business");
    assert.equal(JSON.stringify(comp.slice(h + 1, h + 1 + M.comps.count).map(r => r[0])), JSON.stringify(M.comps.deals.map(d => d.target)));
    // No finance jargon outside the seller-numbers sheet (which keeps the upload template's labels).
    const jargon = /\b(EBITDA|FCCR|leverage|platform|synerg|standalone|LTM|sponsor|CFADS|tranche)\b/i;
    for (const t of wb.SheetNames.filter(n => n !== "Seller numbers" && n !== "Sources")) {
      const text = rows(wb, t).flat().join(" ");
      assert.ok(!jargon.test(text), `jargon in ${t}: ${(text.match(jargon) || [])[0]}`);
    }
  }
});

test("a saved export loads back with the same seller numbers and the same answer", () => {
  const S = exampleOwner();
  const { M } = model(S);
  const wb = X.read(X.write(buildOwnerWorkbook(X, S, M, SOURCES), { type: "buffer", bookType: "xlsx" }));
  const back = rowsToSimple(rows(wb, "Seller numbers"), S);
  for (const k of ["name", "industry", "asking", "sales", "profit", "ownerPay", "salesPrev", "profitPrev", "equipment", "cash", "bizSales", "bizProfit"]) assert.equal(back[k], S[k], k);
  assert.equal(JSON.stringify(back.addbacks.map(a => [a.desc, a.cat, a.amt])), JSON.stringify(S.addbacks.map(a => [a.desc, a.cat, a.amt])));
  const again = model({ ...back, subsector: S.subsector, q: S.q });
  assert.equal(again.M.bid, M.bid);
  assert.equal(again.M.walk, M.walk);
});

test("SBA quality-of-earnings rule: required at a $3M+ business price, building excluded", () => {
  const big = model(exampleOwner());                                   // $7.25M ask, SBA terms
  assert.equal(big.M.qoeRequired, true);
  assert.ok(big.M.conditions[1].startsWith("The SBA requires"));
  const small = model({ ...exampleOwner(), asking: 2900000 });
  assert.equal(small.M.qoeRequired, false);
  // $3.5M ask including a $1M building = $2.5M business price: below the line.
  const withBuilding = model({ ...exampleOwner(), asking: 3500000, buildingValue: 1000000, q: { ...exampleOwner().q, building: "yes" } });
  assert.equal(withBuilding.M.qoeRequired, false);
});
