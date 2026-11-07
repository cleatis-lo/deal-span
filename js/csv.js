// CSV parsing + precedent row validation. Pure functions, no DOM.
import { INDUSTRIES } from "./data.js";

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== "")) rows.push(row);
  return rows;
}

const num = v => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return isFinite(n) ? n : 0;
};

// Validates rows: needs a known industry, EV > 0, revenue or EBITDA > 0, and a source URL.
export function rowsToPrecedents(rows) {
  if (!rows.length) return { deals: [], skipped: [] };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const ix = k => head.indexOf(k);
  const ids = new Set(INDUSTRIES.map(i => i.id));
  const deals = [], skipped = [];
  rows.slice(1).forEach((r, n) => {
    const g = k => (ix(k) >= 0 ? (r[ix(k)] ?? "").trim() : "");
    const d = {
      id: "p" + deals.length,
      industry: g("industry"), subsector: g("subsector"), date: g("date"),
      target: g("target"), acquirer: g("acquirer"),
      ev: num(g("ev")), revenue: num(g("revenue")), ebitda: num(g("ebitda")),
      basis: g("basis") || g("metric_basis"), notes: g("notes"), source: g("source"), currency: g("currency") || "USD",
      // Fields used to match deals to yours (see selectComparables in engine.js). Blank = unknown.
      buyerType: (g("buyer_type") || "").toLowerCase(),
      earnout: /^y/i.test(g("earnout")),
      stakePct: num(g("stake_pct")) || 100,
      ebitdaBasis: (g("ebitda_basis") || "").toLowerCase(),
      ebitdaDerived: /^y/i.test(g("ebitda_derived")),
      isSample: /sample/i.test(g("source")) || /^sample/i.test(g("target"))
    };
    const why = !ids.has(d.industry) ? "unknown industry" : !(d.ev > 0) ? "missing EV" :
      !(d.revenue > 0 || d.ebitda > 0) ? "needs revenue or EBITDA" : !/^https?:\/\//.test(d.source) ? "missing source URL" : "";
    if (why) skipped.push(`row ${n + 2} (${d.target || "?"}): ${why}`); else deals.push(d);
  });
  return { deals, skipped };
}
