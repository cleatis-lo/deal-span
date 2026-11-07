// Excel input template: build, parse, and memo export. Uses SheetJS (window.XLSX).
// Parsing is plain rule-based reading of our own template layout. No AI.
import { ADDBACK_RULES, INDUSTRIES, blankDeal } from "./data.js";

const LINES = [["Revenue", "revenue"], ["Cost of goods sold", "cogs"], ["Operating expenses (excl. D&A)", "opex"], ["Depreciation & amortization", "da"], ["Capital expenditures", "capex"]];

const FIELDS = [
  ["Target name", "target.name"], ["Industry (id from Lists sheet)", "target.industry"], ["Description", "target.description"],
  ["Asking price ($)", "askingPrice"], ["Owner total compensation ($)", "target.ownerComp"],
  ["Platform name", "platform.name"], ["Platform revenue ($)", "platform.revenue"], ["Platform EBITDA ($)", "platform.ebitda"],
  ["Platform annual capex ($)", "platform.capex"], ["Platform existing debt ($)", "platform.existingDebt"],
  ["Platform valuation multiple (x EBITDA)", "platform.multiple"], ["Equity available for this deal ($)", "platform.equityAvailable"],
  ["Synergy: procurement savings (% of target COGS)", "synergy.procurementPct"], ["Synergy: back-office savings ($/yr)", "synergy.backOffice"],
  ["Synergy: facility savings ($/yr)", "synergy.facility"], ["Synergy: cross-sell (% of target revenue)", "synergy.crossSellPct"],
  ["Synergy: contribution margin on cross-sell (%)", "synergy.contributionMargin"], ["Synergy: price increase (% of target revenue)", "synergy.pricingPct"],
  ["Risk: top customer (% of revenue)", "target.qual.topCustomerPct"], ["Risk: top 5 customers (% of revenue)", "target.qual.top5CustomerPct"],
  ["Risk: owner dependence (1 = runs without owner, 5 = owner is the business)", "target.qual.ownerDependence"],
  ["Risk: recurring / contracted revenue (%)", "target.qual.recurringPct"], ["Risk: key non-owner employees (count)", "target.qual.keyEmployees"],
  ["Risk: key employee retention agreed (yes/no)", "target.qual.keyRetained"], ["Risk: top supplier (% of purchases)", "target.qual.topSupplierPct"],
  ["Risk: years left on lease", "target.qual.leaseYrs"], ["Risk: lease assignable (yes/no)", "target.qual.leaseAssignable"],
  ["Risk: licenses transferable (yes/no)", "target.qual.licensesTransferable"], ["Risk: customer contracts assignable (yes/no)", "target.qual.contractsAssignable"],
  ["Risk: financials (audited / reviewed / tax_returns / internal)", "target.qual.financialQuality"]
];
const BOOL = new Set(["target.qual.keyRetained", "target.qual.leaseAssignable", "target.qual.licensesTransferable", "target.qual.contractsAssignable"]);
const TEXT = new Set(["target.name", "target.industry", "target.description", "platform.name", "target.qual.financialQuality"]);

export const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
export function setPath(o, p, v) { const ks = p.split("."); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

export function buildTemplate(d) {
  const X = window.XLSX, wb = X.utils.book_new();
  const fin = [["Line item", ...d.target.financials.map(f => f.label)], ...LINES.map(([lab, k]) => [lab, ...d.target.financials.map(f => f[k] || 0)])];
  const add = [["Description", "Amount ($)", "Category", "Also claimed last year? (yes/no)"], ...d.target.addbacks.map(a => [a.desc, a.amount, a.category, a.priorYear ? "yes" : "no"])];
  const deal = [["Field", "Value"], ...FIELDS.map(([lab, p]) => { const v = getPath(d, p); return [lab, BOOL.has(p) ? (v ? "yes" : "no") : v]; })];
  const lists = [["Add-back categories", "Meaning", "", "Industry ids", "Industry"],
    ...Array.from({ length: Math.max(Object.keys(ADDBACK_RULES).length, INDUSTRIES.length) }, (_, i) => {
      const k = Object.keys(ADDBACK_RULES)[i], ind = INDUSTRIES[i];
      return [k || "", k ? ADDBACK_RULES[k].label : "", "", ind ? ind.id : "", ind ? ind.label : ""];
    })];
  const sheet = (rows, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws["!cols"] = widths.map(w => ({ wch: w })); return ws; };
  X.utils.book_append_sheet(wb, sheet(fin, [34, 14, 14, 14]), "Financials");
  X.utils.book_append_sheet(wb, sheet(add, [52, 14, 16, 30]), "Add-backs");
  X.utils.book_append_sheet(wb, sheet(deal, [70, 30]), "Deal");
  X.utils.book_append_sheet(wb, sheet(lists, [20, 46, 2, 20, 52]), "Lists");
  return wb;
}

const toNum = v => { const n = Number(String(v ?? "").replace(/[$,%\s]/g, "")); return isFinite(n) ? n : 0; };
const isPct = p => /Pct$|contributionMargin$/.test(p);

// Returns { deal, warnings }. Unknown or missing values keep blank defaults and add a warning.
export function parseTemplate(wb) {
  const X = window.XLSX, d = blankDeal(), warnings = [];
  const rows = name => wb.Sheets[name] ? X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }) : null;
  const fin = rows("Financials");
  if (!fin) throw new Error("This file has no Financials sheet. Download the template and fill that in.");
  const labels = fin[0].slice(1).filter(x => String(x).trim() !== "");
  if (labels.length < 2) throw new Error("The Financials sheet needs at least 2 periods (columns B and C).");
  d.target.financials = labels.map((lab, j) => {
    const f = { label: String(lab) };
    LINES.forEach(([text, k], i) => {
      const row = fin.find(r => String(r[0]).trim().toLowerCase() === text.toLowerCase()) || fin[i + 1] || [];
      f[k] = toNum(row[j + 1]);
    });
    return f;
  });
  const ltm = d.target.financials[d.target.financials.length - 1];
  if (!(ltm.revenue > 0)) warnings.push("Latest-period revenue is zero.");
  const add = rows("Add-backs") || [];
  d.target.addbacks = add.slice(1).filter(r => String(r[0]).trim() && toNum(r[1]) !== 0).map(r => {
    let cat = String(r[2]).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!ADDBACK_RULES[cat]) { warnings.push(`Add-back "${r[0]}" has category "${r[2]}"; treated as other.`); cat = "other"; }
    const ab = { desc: String(r[0]).trim(), amount: toNum(r[1]), category: cat };
    if (/^(y|yes|true|1)$/i.test(String(r[3] ?? "").trim())) ab.priorYear = true;
    return ab;
  });
  const deal = rows("Deal") || [];
  FIELDS.forEach(([lab, p]) => {
    const row = deal.find(r => String(r[0]).trim() === lab);
    if (!row || String(row[1]).trim() === "") return;
    let v = row[1];
    if (BOOL.has(p)) v = /^(y|yes|true|1)$/i.test(String(v).trim());
    else if (TEXT.has(p)) v = String(v).trim();
    else { v = toNum(v); if (isPct(p) && v > 1) v = v / 100; }
    setPath(d, p, v);
  });
  if (!INDUSTRIES.some(i => i.id === d.target.industry)) { warnings.push(`Unknown industry "${d.target.industry}"; using home_services.`); d.target.industry = "home_services"; }
  if (!(d.platform.ebitda > 0)) warnings.push("Platform EBITDA is missing, so combined leverage can't be sized.");
  return { deal: d, warnings };
}
