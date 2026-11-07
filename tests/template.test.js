// Round-trip: build the Excel template from the demo deal, parse it back, and get the same results.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// Load the same browser bundle the app uses, in a sandbox, exactly as a <script> tag would.
const sandbox = {};
vm.runInNewContext(readFileSync(new URL("../vendor/xlsx.full.min.js", import.meta.url), "utf8"), sandbox);
globalThis.window = { XLSX: sandbox.XLSX };
const { buildTemplate, parseTemplate } = await import("../js/template.js");
const { demoDeal } = await import("../js/data.js");
const { runAll } = await import("../js/engine.js");
const { PRECEDENTS } = await import("../js/precedents.js");

test("template round-trip reproduces the demo deal's results", () => {
  const X = window.XLSX, d = demoDeal();
  const bytes = X.write(buildTemplate(d), { type: "buffer", bookType: "xlsx" });
  const { deal, warnings } = parseTemplate(X.read(bytes));
  assert.deepEqual(warnings, []);
  deal.assumptions = d.assumptions;
  // Compare as JSON: arrays built by the sandboxed SheetJS realm have a different Array prototype.
  const j = x => JSON.parse(JSON.stringify(x));
  assert.deepEqual(j(deal.target.financials), j(d.target.financials));
  assert.deepEqual(j(deal.target.addbacks), j(d.target.addbacks));
  assert.deepEqual(j(deal.target.qual), j(d.target.qual));
  assert.equal(deal.platform.ebitda, d.platform.ebitda);
  const a = runAll(d, PRECEDENTS), b = runAll(deal, PRECEDENTS);
  assert.equal(b.prices.bidUpTo, a.prices.bidUpTo);
  assert.equal(b.prices.walkAway, a.prices.walkAway);
});

test("template parse: percentages typed as whole numbers and bad categories", () => {
  const X = window.XLSX, d = demoDeal();
  const wb = buildTemplate(d);
  const ws = wb.Sheets["Deal"];
  const rows = X.utils.sheet_to_json(ws, { header: 1 });
  const i = rows.findIndex(r => String(r[0]).startsWith("Risk: top customer"));
  rows[i][1] = 14; // user typed 14 instead of 0.14
  wb.Sheets["Deal"] = X.utils.aoa_to_sheet(rows);
  const add = X.utils.sheet_to_json(wb.Sheets["Add-backs"], { header: 1 });
  add[1][2] = "Legal stuff";
  wb.Sheets["Add-backs"] = X.utils.aoa_to_sheet(add);
  const { deal, warnings } = parseTemplate(wb);
  assert.equal(deal.target.qual.topCustomerPct, 0.14);
  assert.equal(deal.target.addbacks[0].category, "other");
  assert.equal(warnings.length, 1);
});

test("template parse rejects a file without a Financials sheet", () => {
  const X = window.XLSX, wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["a"]]), "Sheet1");
  assert.throws(() => parseTemplate(wb), /Financials/);
});
