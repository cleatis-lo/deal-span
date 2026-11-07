// Regenerates js/precedents.js from data/precedent_transactions.csv.
// Run: node tools/build-precedents.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { parseCSV, rowsToPrecedents } from "../js/csv.js";

const text = readFileSync(new URL("../data/precedent_transactions.csv", import.meta.url), "utf8");
const { deals, skipped } = rowsToPrecedents(parseCSV(text));
const out =
  "// GENERATED from data/precedent_transactions.csv by tools/build-precedents.mjs. Do not edit by hand.\n" +
  "export const PRECEDENTS = " + JSON.stringify(deals, null, 1) + ";\n";
writeFileSync(new URL("../js/precedents.js", import.meta.url), out);
console.log(`Wrote ${deals.length} deals (${skipped.length} skipped).`);
skipped.forEach(s => console.log("  skipped:", s));
