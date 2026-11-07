// DealSpan UI. Renders inputs and results; all math lives in engine.js.
import { runAll } from "./engine.js";
import { SOURCES, INDUSTRIES, ADDBACK_RULES, DEFAULTS, demoDeal, blankDeal } from "./data.js";
import { PRECEDENTS } from "./precedents.js";
import { parseCSV, rowsToPrecedents } from "./csv.js";
import { buildTemplate, parseTemplate, buildMemoWorkbook, getPath, setPath } from "./template.js";

const STORE = "dealspan_v2";
const STEPS = [["setup", "Setup"], ["earnings", "Real earnings"], ["value", "Value & deal"], ["memo", "Memo"]];
let D, R, STEP = "setup", PREC = PRECEDENTS.slice(), DRAWER = null;

// ---------- formatting ----------
const $m = v => !isFinite(v) ? "n/a" : (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + "M" : Math.round(Math.abs(v) / 1e3).toLocaleString() + "K");
const $k = v => !isFinite(v) ? "n/a" : (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString();
const x2 = v => isFinite(v) ? v.toFixed(2) + "x" : "n/a";
const x1 = v => isFinite(v) ? v.toFixed(1) + "x" : "n/a";
const pc = (v, d = 0) => isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const src = k => SOURCES[k] ? `<a href="${SOURCES[k].url}" target="_blank" rel="noopener">source</a>` : "";

// ---------- state ----------
function save() { try { localStorage.setItem(STORE, JSON.stringify({ D, STEP })); } catch (e) { /* storage unavailable */ } }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "null");
    if (s && s.D && s.D.platform) { D = s.D; D.assumptions = { ...DEFAULTS, ...D.assumptions }; STEP = s.STEP || "setup"; return; }
  } catch (e) { /* ignore */ }
  D = demoDeal();
}
function hasData() { return D.platform.ebitda > 0 && D.target.financials.at(-1).revenue > 0; }
function recompute() { R = hasData() ? runAll(D, PREC) : null; }
function toast(msg) {
  document.querySelectorAll(".toast").forEach(x => x.remove());
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

// ---------- inputs ----------
// type: money | pct | num | text | select | bool
function field(label, path, type = "money", opts = {}) {
  const v = getPath(D, path);
  let input;
  if (type === "select") input = `<select data-path="${path}" data-type="text">${opts.options.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else if (type === "bool") return `<label class="check"><input type="checkbox" data-path="${path}" data-type="bool" ${v ? "checked" : ""}> ${esc(label)}</label>`;
  else {
    const shown = type === "pct" ? +(v * 100).toFixed(2) : type === "money" ? (v ? Math.round(v).toLocaleString() : "0") : (v ?? "");
    input = `<input data-path="${path}" data-type="${type}" value="${esc(shown)}" ${type === "text" ? "" : 'inputmode="decimal"'} aria-label="${esc(label)}">`;
  }
  const unit = type === "pct" ? " (%)" : type === "money" ? " ($)" : opts.unit ? ` (${opts.unit})` : "";
  return `<label class="f ${opts.wide ? "wide" : ""}"><span>${esc(label)}${unit}</span>${input}</label>`;
}
function readInput(el) {
  const t = el.dataset.type, raw = el.type === "checkbox" ? el.checked : el.value;
  if (t === "bool") return !!raw;
  if (t === "text") return raw;
  const n = Number(String(raw).replace(/[$,%\s]/g, ""));
  if (!isFinite(n)) return null;
  return t === "pct" ? n / 100 : n;
}

// ---------- chrome ----------
function renderSteps() {
  document.getElementById("steps").innerHTML = STEPS.map(([k, l], i) =>
    `<button data-step="${k}" ${STEP === k ? 'aria-current="step"' : ""}><span class="n">${i + 1}</span>${l}</button>`).join("");
}

function renderSpan() {
  const el = document.getElementById("span");
  if (!R) { el.innerHTML = `<div class="span-inner"><div class="span-call"><b>No deal loaded</b><small>Load the demo or upload a template to see the price span.</small></div><div></div></div>`; return; }
  const P = R.prices;
  const pts = [P.standalone.low, P.bidUpTo, P.walkAway, P.ask, P.financeableMax].filter(v => isFinite(v) && v > 0);
  const lo = Math.min(...pts) * 0.85, hi = Math.max(...pts) * 1.06;
  const left = v => `calc((100% - 28px) * ${Math.max(0, Math.min(1, (v - lo) / (hi - lo)))})`;
  const mark = (cls, v, label, below) => `<div class="span-mark ${cls} ${below ? "below" : ""}" style="left:${left(v)}">${below ? "<i></i>" : ""}${label}<br><b>${$m(v)}</b>${below ? "" : "<i></i>"}</div>`;
  const marks = [
    ["bid", P.bidUpTo, "Bid up to", false],
    ["walk", P.walkAway, "Walk away", true],
    ["ask", P.ask, "Seller's ask", false],
    ["fin", P.financeableMax, "Financing limit", true]
  ];
  // Avoid label collisions on the same row: nudge to the other row when two marks are within ~9% of the track.
  const rows = { false: [], true: [] };
  marks.forEach(m => {
    const f = (m[1] - lo) / (hi - lo);
    if (rows[m[3]].some(g => Math.abs(g - f) < 0.11)) m[3] = !m[3];
    rows[m[3]].push(f);
  });
  el.innerHTML = `<div class="span-inner">
    <div class="span-call"><b>${esc(D.target.name || "Target")} into ${esc(D.platform.name || "platform")}</b><small>${esc(R.call)}</small></div>
    <div class="span-track" aria-label="Price span">
      <div class="span-axis"></div>
      <div class="span-band" style="left:${left(P.standalone.low)};width:calc(${left(P.bidUpTo)} - ${left(P.standalone.low)})"></div>
      <div class="span-band walk" style="left:${left(P.bidUpTo)};width:calc(${left(P.walkAway)} - ${left(P.bidUpTo)})"></div>
      ${marks.map(m => mark(...m)).join("")}
      <div class="span-off" title="Public company multiples applied to a small business">Public comps<br><b>${$m(R.val.pub.mid)}</b> ▸</div>
    </div></div>`;
}

// ---------- step 1: setup ----------
function renderSetup() {
  const t = D.target, q = t.qual;
  const fin = t.financials;
  const ind = INDUSTRIES.map(i => [i.id, i.label]);
  return `
  <div class="page-head"><div><h1>Set up the deal</h1>
    <p class="lede">Enter the target's numbers and the seller's add-backs, plus a short profile of your platform. Everything recalculates as you type.</p></div></div>

  <div class="drop no-print" id="drop">
    <div><h3 style="margin:0">Start from the Excel template</h3><p>Fill in the template's Financials, Add-backs and Deal sheets, then upload it here or drop it on this box.</p></div>
    <div class="btns">
      <button class="btn" data-act="template">Download template</button>
      <label class="btn primary">Upload template<input type="file" accept=".xlsx,.xls" data-act="upload"></label>
      <button class="btn quiet" data-act="demo">Load demo deal</button>
      <button class="btn quiet" data-act="blank">Clear all</button>
    </div>
  </div>

  <div class="cols-3">
    <section class="section">
      <header><h2>Target</h2><p>The company you're buying.</p></header>
      <div class="grid-fields">
        ${field("Company name", "target.name", "text", { wide: true })}
        ${field("Industry", "target.industry", "select", { options: ind, wide: true })}
        ${field("Seller's asking price", "askingPrice")}
        ${field("Owner's total pay", "target.ownerComp")}
      </div>
      <h3 style="margin-top:18px">P&amp;L</h3>
      <table><thead><tr><th style="width:34%">Line item</th>${fin.map((f, j) => `<th><input class="txt" data-path="target.financials.${j}.label" data-type="text" value="${esc(f.label)}" aria-label="Period ${j + 1} label" style="text-align:right"></th>`).join("")}</tr></thead>
      <tbody>${[["Revenue", "revenue"], ["Cost of goods sold", "cogs"], ["Operating expenses (excl. D&A)", "opex"], ["Depreciation & amortization", "da"], ["Capital expenditures", "capex"]].map(([l, k]) =>
        `<tr><td>${l}</td>${fin.map((f, j) => `<td><input data-path="target.financials.${j}.${k}" data-type="money" inputmode="decimal" value="${Math.round(f[k] || 0).toLocaleString()}" aria-label="${l} ${esc(f.label)}"></td>`).join("")}</tr>`).join("")}
        <tr class="sub"><td>EBITDA</td>${fin.map((f, j) => `<td data-ebitda="${j}">${$k(f.revenue - f.cogs - f.opex)}</td>`).join("")}</tr>
      </tbody></table>
    </section>

    <section class="section">
      <header><h2>Your platform</h2><p>Used to size combined debt and the value of folding the target in.</p></header>
      <div class="grid-fields" style="grid-template-columns:1fr 1fr">
        ${field("Platform name", "platform.name", "text", { wide: true })}
        ${field("Revenue", "platform.revenue")}
        ${field("EBITDA", "platform.ebitda")}
        ${field("Existing debt", "platform.existingDebt")}
        ${field("Annual capex", "platform.capex")}
        ${field("Platform valuation", "platform.multiple", "num", { unit: "x EBITDA" })}
        ${field("Equity available", "platform.equityAvailable")}
      </div>
      <p class="faint" style="margin:12px 0 0">Platform valuation is the multiple your platform would sell at. It drives the multiple-arbitrage math, so be honest.</p>
    </section>
  </div>

  <section class="section" style="margin-top:18px">
    <header><h2>Seller's add-backs</h2><p>Copy these from the CIM exactly as the seller states them. DealSpan applies its rules on the next step.</p></header>
    <table><thead><tr><th class="l" style="width:48%">Description</th><th style="width:16%">Amount ($)</th><th class="l">Category</th><th></th></tr></thead><tbody>
    ${t.addbacks.map((a, i) => `<tr>
      <td><input class="txt" data-path="target.addbacks.${i}.desc" data-type="text" value="${esc(a.desc)}" aria-label="Add-back description"></td>
      <td><input data-path="target.addbacks.${i}.amount" data-type="money" inputmode="decimal" value="${Math.round(a.amount).toLocaleString()}" aria-label="Add-back amount"></td>
      <td><select data-path="target.addbacks.${i}.category" data-type="text" aria-label="Add-back category">${Object.entries(ADDBACK_RULES).map(([k, r]) => `<option value="${k}" ${a.category === k ? "selected" : ""}>${r.label}</option>`).join("")}</select></td>
      <td><button class="btn quiet small" data-act="delAddback" data-i="${i}" aria-label="Remove add-back">Remove</button></td></tr>`).join("")}
    </tbody></table>
    <button class="btn small" data-act="addAddback" style="margin-top:10px">Add an add-back</button>
  </section>

  <div class="cols">
    <section class="section">
      <header><h2>Synergies you expect</h2><p>Enter what you'd claim in an IC memo. DealSpan haircuts it on step 3.</p></header>
      <div class="grid-fields" style="grid-template-columns:1fr 1fr">
        ${field("Procurement savings, % of target COGS", "synergy.procurementPct", "pct")}
        ${field("Back-office savings per year", "synergy.backOffice")}
        ${field("Facility savings per year", "synergy.facility")}
        ${field("Price increase, % of target revenue", "synergy.pricingPct", "pct")}
        ${field("Cross-sell, % of target revenue", "synergy.crossSellPct", "pct")}
        ${field("Margin on cross-sell revenue", "synergy.contributionMargin", "pct")}
      </div>
    </section>
    <section class="section">
      <header><h2>Risk questions</h2><p>Answer from the CIM and your first call with the seller.</p></header>
      <div class="grid-fields" style="grid-template-columns:1fr 1fr">
        ${field("Top customer, % of revenue", "target.qual.topCustomerPct", "pct")}
        ${field("Top 5 customers, % of revenue", "target.qual.top5CustomerPct", "pct")}
        ${field("Owner dependence", "target.qual.ownerDependence", "select", { options: [[1, "1: runs without owner"], [2, "2: light involvement"], [3, "3: owner manages day-to-day"], [4, "4: owner holds key relationships"], [5, "5: owner is the business"]] })}
        ${field("Recurring revenue", "target.qual.recurringPct", "pct")}
        ${field("Key non-owner employees", "target.qual.keyEmployees", "num")}
        ${field("Top supplier, % of purchases", "target.qual.topSupplierPct", "pct")}
        ${field("Years left on lease", "target.qual.leaseYrs", "num")}
        ${field("Financial statements", "target.qual.financialQuality", "select", { options: [["audited", "Audited"], ["reviewed", "CPA-reviewed"], ["tax_returns", "Tax returns only"], ["internal", "Internal only"]] })}
      </div>
      <div style="display:grid;gap:6px;margin-top:12px">
        ${field("Key employee retention agreed", "target.qual.keyRetained", "bool")}
        ${field("Lease is assignable", "target.qual.leaseAssignable", "bool")}
        ${field("Licenses transfer to a new owner", "target.qual.licensesTransferable", "bool")}
        ${field("Customer contracts are assignable", "target.qual.contractsAssignable", "bool")}
      </div>
    </section>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn primary" data-step="earnings" ${hasData() ? "" : "disabled"}>See real earnings</button></div>`;
}

// ---------- step 2: earnings ----------
function renderEarnings() {
  const e = R.eq, max = Math.max(e.seller, e.adjusted, e.reported) || 1;
  const bar = (cls, label, v) => `<div class="ebar ${cls}"><span>${label}</span><div><div class="bar" style="width:${(v / max) * 100}%"></div></div><b>${$m(v)}</b></div>`;
  return `
  <div class="page-head"><div><h1>What the target really earns</h1>
    <p class="lede">The seller says ${$m(e.seller)} of adjusted EBITDA. After applying standard quality-of-earnings rules to each add-back, DealSpan gets ${$m(e.adjusted)}, ${pc(e.haircut, 1)} lower. Every later step uses DealSpan's number.</p></div>
    <button class="btn primary" data-step="value">Value the deal</button></div>

  <section class="section">
    <div class="ebars">
      ${bar("seller", "Seller's adjusted EBITDA", e.seller)}
      ${bar("ours", "DealSpan adjusted EBITDA", e.adjusted)}
      ${bar("reported", "Reported EBITDA (P&amp;L)", e.reported)}
    </div>
  </section>

  <section class="section">
    <header><h2>Add-back by add-back</h2><p>Acceptance rates are editable under Assumptions. They're anchored to lender evidence that QoE work cuts stated earnings 8–15% on about half of small deals (${src("pioneer")}).</p></header>
    <table><thead><tr><th class="l">Item</th><th>Seller claims</th><th>DealSpan accepts</th><th>Cut</th></tr></thead><tbody>
      <tr><td>Reported LTM EBITDA<span class="note">Revenue − COGS − operating expenses, latest period</span></td><td>${$k(e.reported)}</td><td>${$k(e.reported)}</td><td></td></tr>
      <tr><td>Owner pay above a market salary<span class="note">${$k(D.target.ownerComp)} owner pay − ${$k(D.assumptions.marketOwnerSalary)} to hire a replacement GM (${src("pioneer")})</span></td><td>${$k(e.ownerExcess)}</td><td>${$k(e.ownerExcess)}</td><td></td></tr>
      ${e.items.map(i => `<tr><td>${esc(i.desc)}<span class="note">${i.rule.label}: ${pc(i.rule.accept)} accepted. ${i.rule.note}</span></td><td>${$k(i.claimed)}</td><td>${$k(i.accepted)}</td><td class="${i.cut > 0 ? "cut" : ""}">${i.cut > 0 ? "−" + $k(i.cut).slice(1) : ""}</td></tr>`).join("")}
      <tr class="total"><td>Adjusted EBITDA</td><td>${$k(e.seller)}</td><td>${$k(e.adjusted)}</td><td class="cut">−${$k(e.seller - e.adjusted).slice(1)}</td></tr>
    </tbody></table>
    <p class="faint" style="margin:10px 0 0">If every seller add-back were rejected, EBITDA would be ${$m(e.downside)}. Add-backs plus excess owner pay equal ${pc(e.addbackPct)} of reported EBITDA.</p>
  </section>`;
}

// ---------- step 3: value & deal ----------
function footballField() {
  const v = R.val, ask = R.prices.ask;
  const core = v.methods.filter(m => !m.reference);
  const all = [...core.map(m => [m.low, m.high]), [v.standalone.low, v.standalone.high], [ask, ask]].flat();
  const lo = Math.min(...all) * 0.85, hi = Math.max(...all) * 1.08;
  const p = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
  const askLine = `<div class="ff-ask" style="left:${p(ask)}%"></div>`;
  const row = (label, sub, m, cls) => `<div class="ff-row"><div class="lbl">${label}<small>${$m(m.low)} to ${$m(m.high)}. ${sub}</small></div>
    <div class="ff-track"><div class="ff-bar ${cls}" style="left:${p(m.low)}%;width:${p(m.high) - p(m.low)}%"></div><div class="ff-mid" style="left:${p(m.mid)}%"></div>${askLine}</div></div>`;
  return `<div class="ff">
    <div class="ff-row"><div></div><div class="ff-track ff-head"><span class="ff-asklbl" style="left:${p(ask)}%">Seller's ask ${$m(ask)}</span></div></div>
    ${core.map(m => row(esc(m.label), `${m.basis} ${m.src ? src(m.src) : ""}`, m, "")).join("")}
    ${row("<b>Standalone value</b>", "Average of the methods above.", v.standalone, "std")}
    <div class="ff-row"><div class="lbl">${esc(v.pub.label)}<small>${v.pub.basis} ${src("damodaran")}</small></div>
      <div class="ff-track">${askLine}<span class="ff-off">${$m(v.pub.mid)}, off the chart ▸</span></div></div>
  </div>`;
}

function finTable() {
  const rows = [["Purchase price", "price"], ["Fees (" + pc(D.assumptions.feesPct) + ")", "fees"], ["New senior debt", "incremental"], ["Seller note (" + pc(D.assumptions.sellerNotePct) + " of price)", "sellerNote"], ["Sponsor equity", "equity"]];
  const b = R.atBid, a = R.atAsk, bs = R.atBidStress, as = R.atAskStress, A = D.assumptions;
  const cov = v => `<span class="${v < A.minFCCR ? "cut" : ""}">${x2(v)}</span>`;
  return `<table><thead><tr><th class="l"></th><th>At your bid</th><th>At the ask</th></tr></thead><tbody>
    ${rows.map(([l, k]) => `<tr><td>${l}</td><td>${$k(b[k])}</td><td>${$k(a[k])}</td></tr>`).join("")}
    <tr class="sub"><td>Equity as % of uses</td><td>${pc(b.equityPct)}</td><td>${pc(a.equityPct)}</td></tr>
    <tr><td>Combined senior leverage<span class="note">Cap ${x1(A.maxSeniorLeverage)} pro forma EBITDA (assumption)</span></td><td>${x2(b.seniorLeverage)}</td><td>${x2(a.seniorLeverage)}</td></tr>
    <tr><td>Total leverage incl. seller note</td><td>${x2(b.totalLeverage)}</td><td>${x2(a.totalLeverage)}</td></tr>
    <tr><td>Fixed-charge coverage<span class="note">Covenant ${x2(A.minFCCR)} (assumption)</span></td><td>${cov(b.fccr)}</td><td>${cov(a.fccr)}</td></tr>
    <tr><td>Coverage if rates rise ${A.stressBps}bp</td><td>${cov(bs.fccr)}</td><td>${cov(as.fccr)}</td></tr>
    <tr class="sub"><td>What limits the debt</td><td>${b.binding}</td><td>${a.binding}</td></tr>
  </tbody></table>`;
}

function renderValue() {
  const v = R.val, s = R.syn, A = D.assumptions, P = R.prices;
  return `
  <div class="page-head"><div><h1>Value and deal math</h1>
    <p class="lede">What the target is worth on its own, what it's worth inside your platform, and how much the combined company can borrow.</p></div>
    <button class="btn primary" data-step="memo">Write the memo</button></div>

  <section class="section">
    <header><h2>Standalone value</h2><p>Public comps value big, liquid companies. Applied to a ${$m(v.ebitda)}-EBITDA business they overstate value by ${pc(v.publicPremium)}. That gap is how buyers overpay.</p></header>
    ${footballField()}
  </section>

  <div class="cols">
    <section class="section">
      <header><h2>Synergies, realistically</h2><p>Bain found ~70% of acquirers overestimate synergies (${src("bain")}). Revenue synergies miss by ~23% and take ~5 years (${src("mckinsey")}).</p></header>
      <table><thead><tr><th class="l">Lever</th><th>You claimed</th><th>Realistic</th></tr></thead><tbody>
        ${s.levers.map(l => `<tr><td>${l.lever}<span class="note">${l.type === "cost" ? `Cost: ${pc(A.costRealize)} captured over ${A.costYrs} yrs` : `Revenue: ${pc(A.revRealize)} captured over ${A.revYrs} yrs`}</span></td><td>${$k(l.claimed)}</td><td>${$k(l.realistic)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No synergies entered. Add them on Setup if this is a true add-on.</td></tr>`}
        <tr class="total"><td>Run-rate per year</td><td>${$k(s.claimed)}</td><td>${$k(s.runRate)}</td></tr>
      </tbody></table>
      <p class="faint" style="margin:10px 0 0">One-time integration cost ${$k(s.integrationCost)}. Five-year present value of realistic synergies after that cost, at ${pc(A.discountRate)}: <b>${$m(s.pv)}</b>. No terminal value is counted.</p>
    </section>

    <section class="section">
      <header><h2>Value inside your platform</h2><p>The target is worth your platform's multiple once it's part of the platform. That gain belongs to you, not the seller.</p></header>
      <div class="stats">
        <div class="stat"><span>Inside value</span><b>${$m(R.value.atBid.insideValue)}</b><small>${x1(D.platform.multiple)} × (EBITDA + realistic synergies)</small></div>
        <div class="stat ok"><span>Value created at bid</span><b>${$m(R.value.atBid.created)}</b><small>after price, fees, integration</small></div>
        <div class="stat ${R.value.atAsk.created < R.value.atBid.created ? "" : "ok"}"><span>Value created at ask</span><b>${$m(R.value.atAsk.created)}</b><small>${$m(R.value.atBid.created - R.value.atAsk.created)} handed to the seller</small></div>
      </div>
      <p class="faint" style="margin:12px 0 0">Buying at ${x1(P.bidUpTo / v.ebitda)} and owning it at ${x1(D.platform.multiple)} is the multiple arbitrage. It only works if you don't pay it away up front.</p>
    </section>
  </div>

  <section class="section" style="margin-top:18px">
    <header><h2>Combined financing</h2><p>New debt sits on your platform's facility at ${pc(A.baseRate + A.seniorSpread, 2)} (prime ${pc(A.baseRate, 2)} + ${pc(A.seniorSpread, 2)}; ${src("prime")}). Lenders size on pro forma EBITDA of ${$m(R.cf.pfEbitda)} with no credit for synergies. Cash available for debt service after capex and taxes: ${$m(R.cf.cfads)}.</p></header>
    <div class="cols" style="align-items:start">
      <div>${finTable()}</div>
      <div class="stats" style="grid-template-columns:1fr 1fr">
        <div class="stat"><span>Leverage today</span><b>${x2(R.before.leverage)}</b><small>platform debt / EBITDA</small></div>
        <div class="stat"><span>Leverage after, at bid</span><b>${x2(R.atBid.totalLeverage)}</b><small>incl. seller note</small></div>
        <div class="stat"><span>Most you can finance</span><b>${$m(P.financeableMax)}</b><small>with ${$m(D.platform.equityAvailable)} of equity</small></div>
        <div class="stat ${R.atAskStress.fccr < 1.1 ? "warn" : ""}"><span>Stressed coverage at ask</span><b>${x2(R.atAskStress.fccr)}</b><small>+${A.stressBps}bp on all senior debt</small></div>
      </div>
    </div>
  </section>`;
}

// ---------- step 4: memo ----------
function renderMemo() {
  const P = R.prices, A = D.assumptions, e = R.eq;
  const why = [
    `Standalone value is ${$m(P.standalone.mid)}: the average of ${R.val.methods.filter(m => !m.reference).map(m => m.label).join(" and ")}, applied to DealSpan's ${$m(e.adjusted)} of adjusted EBITDA, not the seller's ${$m(e.seller)}.`,
    `Walk-away adds ${pc(A.synergyShareMax)} of the ${$m(R.syn.pv)} synergy value. You keep the rest and all of the multiple arbitrage.`,
    P.financeableMax < P.walkAway + 1 ? `The walk-away is capped by financing: with ${$m(D.platform.equityAvailable)} of equity the platform can fund at most ${$m(P.financeableMax)}.` : `Financing isn't the constraint: the platform could fund up to ${$m(P.financeableMax)}.`,
    `At the ask, coverage falls to ${x2(R.atAskStress.fccr)} if rates rise ${A.stressBps}bp (covenant ${x2(A.minFCCR)}).`
  ];
  return `
  <div class="page-head"><div><h1>Deal memo</h1>
    <p class="lede">${esc(D.target.name)} as an add-on to ${esc(D.platform.name)}. ${esc(D.target.description)}</p></div>
    <div class="no-print" style="display:flex;gap:8px"><button class="btn" data-act="print">Print</button><button class="btn primary" data-act="export">Export to Excel</button></div></div>

  <div class="memo-head">
    <div class="bid"><span>Bid up to</span><b>${$m(P.bidUpTo)}</b><small>${x1(P.bidUpTo / e.adjusted)} adjusted EBITDA</small></div>
    <div class="walk"><span>Walk away above</span><b>${$m(P.walkAway)}</b><small>${x1(P.walkAway / e.adjusted)} adjusted EBITDA</small></div>
    <div class="ask"><span>Seller's ask</span><b>${$m(P.ask)}</b><small>${x1(P.ask / e.adjusted)} adjusted, ${x1(P.ask / e.seller)} on the seller's number</small></div>
  </div>
  <div class="call ${R.callClass}">${esc(R.call)}<span>${P.ask > P.walkAway ? `The ask is ${$m(P.ask - P.walkAway)} above your walk-away price.` : P.ask > P.bidUpTo ? `The ask is ${$m(P.ask - P.bidUpTo)} above your bid.` : `The ask is ${$m(P.bidUpTo - P.ask)} below your bid.`}</span></div>

  <div class="cols-3">
    <section class="section">
      <header><h2>Diligence before you sign an LOI</h2></header>
      <ol class="conds">${R.conditions.map(c => `<li><b><span class="dot ${c.rating}"></span>${esc(c.area)}</b>${esc(c.ask)}</li>`).join("") || "<li>No red or yellow risks. Confirm earnings with a QoE.</li>"}</ol>
      <h3 style="margin-top:20px">How the prices were set</h3>
      <ul class="why">${why.map(w => `<li>${w}</li>`).join("")}</ul>
    </section>
    <section class="section">
      <header><h2>Risk scorecard</h2><p>${R.risk.score.red} red, ${R.risk.score.yellow} yellow, ${R.risk.score.green} green</p></header>
      <table><tbody>${R.risk.items.map(r => `<tr><td><span class="dot ${r.rating}"></span>${r.area}<span class="note">${esc(r.finding)}</span></td></tr>`).join("")}</tbody></table>
    </section>
  </div>
  <p class="faint" style="margin-top:14px">Pre-LOI screen, not a quality-of-earnings report or valuation opinion. Every number comes from your inputs, a labeled rule, or a cited source. No AI is used.</p>`;
}

// ---------- drawers ----------
function renderDrawer() {
  const el = document.getElementById("drawer");
  if (!DRAWER) { el.innerHTML = ""; return; }
  let body = "";
  if (DRAWER === "assumptions") {
    const A = "assumptions.";
    body = `<header><h2>Assumptions</h2><button class="btn quiet" data-act="close">Close</button></header>
      <p class="muted">Every rule DealSpan uses. Sourced values link to their source; the rest are labeled assumptions you can change.</p>
      <h3>Earnings</h3><div class="grid-fields">${field("Market salary for a replacement GM", A + "marketOwnerSalary")}</div>
      <table style="margin:10px 0 18px"><thead><tr><th class="l">Add-back category</th><th>Accepted</th></tr></thead><tbody>
        ${Object.entries(ADDBACK_RULES).map(([k, r]) => `<tr><td>${r.label}<span class="note">${r.note}</span></td><td style="width:110px"><input data-rule="${k}" inputmode="decimal" value="${Math.round(r.accept * 100)}" aria-label="${r.label} acceptance %"></td></tr>`).join("")}
      </tbody></table>
      <h3>Financing</h3><div class="grid-fields">
        ${field("Base rate (prime)", A + "baseRate", "pct")}${field("Senior spread", A + "seniorSpread", "pct")}${field("Annual amortization", A + "amortPct", "pct")}
        ${field("Max senior leverage", A + "maxSeniorLeverage", "num", { unit: "x EBITDA" })}${field("Coverage covenant", A + "minFCCR", "num", { unit: "x" })}${field("Minimum sponsor equity", A + "minEquityPct", "pct")}
        ${field("Seller note, % of price", A + "sellerNotePct", "pct")}${field("Seller note rate", A + "sellerNoteRate", "pct")}${field("Seller note term", A + "sellerNoteTermYrs", "num", { unit: "yrs" })}
        ${field("Deal fees, % of price", A + "feesPct", "pct")}${field("Tax rate", A + "taxRate", "pct")}${field("Rate stress", A + "stressBps", "num", { unit: "bp" })}
      </div>
      <h3 style="margin-top:18px">Synergies and pricing</h3><div class="grid-fields">
        ${field("Cost synergies captured", A + "costRealize", "pct")}${field("Years to capture cost", A + "costYrs", "num")}
        ${field("Revenue synergies captured", A + "revRealize", "pct")}${field("Years to capture revenue", A + "revYrs", "num")}
        ${field("Integration cost", A + "integrationCostMult", "num", { unit: "x cost synergies" })}${field("Discount rate", A + "discountRate", "pct")}
        ${field("Max share of synergies paid to seller", A + "synergyShareMax", "pct")}
      </div>
      <p style="margin-top:18px"><button class="btn" data-act="resetAssumptions">Reset to defaults</button></p>`;
  } else if (DRAWER === "precedents") {
    const samples = PREC.filter(p => p.isSample).length;
    body = `<header><h2>Precedent deals (${PREC.length})</h2><button class="btn quiet" data-act="close">Close</button></header>
      <p class="muted">Public, sourced deals only. Rows without a source URL are rejected on import. ${samples ? `<b class="cut">${samples} sample rows are loaded.</b>` : ""}</p>
      <p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="precTemplate">Download CSV</button><label class="btn primary">Import CSV<input type="file" accept=".csv" data-act="precImport"></label></p>
      <table><thead><tr><th class="l">Target</th><th class="l">Industry</th><th>EV</th><th>EBITDA</th><th>EV/EBITDA</th></tr></thead><tbody>
      ${PREC.map(p => `<tr><td>${esc(p.target)}<span class="note">${esc(p.acquirer)}, ${esc(p.date)}. <a href="${esc(p.source)}" target="_blank" rel="noopener">source</a></span></td><td class="l">${esc(p.industry)}</td><td>${$m(p.ev)}</td><td>${p.ebitda > 0 ? $m(p.ebitda) : "n/a"}</td><td>${p.ebitda > 0 ? x1(p.ev / p.ebitda) : "n/a"}</td></tr>`).join("")}
      </tbody></table>`;
  } else if (DRAWER === "sources") {
    body = `<header><h2>Sources</h2><button class="btn quiet" data-act="close">Close</button></header>
      <ul class="src-list">${Object.values(SOURCES).map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("")}</ul>
      <p class="faint" style="margin-top:14px">Precedent deals each link to their own press release or filing. See the Precedents panel.</p>`;
  }
  el.innerHTML = `<div class="drawer-bg" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true">${body}</aside>`;
}

// ---------- render ----------
function render() {
  recompute();
  renderSteps(); renderSpan(); renderDrawer();
  const main = document.getElementById("main");
  if (STEP !== "setup" && !R) STEP = "setup";
  main.innerHTML = STEP === "setup" ? renderSetup() : STEP === "earnings" ? renderEarnings() : STEP === "value" ? renderValue() : renderMemo();
  bindDrop();
  save();
}
// Re-render results without stealing focus from the input being typed in.
function refreshKeepFocus(el) {
  const path = el.dataset.path || el.dataset.rule, start = el.selectionStart;
  render();
  const again = document.querySelector(el.dataset.rule ? `[data-rule="${path}"]` : `[data-path="${path}"]`);
  if (again) { again.focus(); try { again.setSelectionRange(start, start); } catch (e) { /* selects */ } }
}

// ---------- file handling ----------
function download(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
async function handleUpload(file) {
  try {
    const wb = window.XLSX.read(await file.arrayBuffer());
    const { deal, warnings } = parseTemplate(wb);
    deal.assumptions = { ...D.assumptions };
    D = deal; STEP = hasData() ? "earnings" : "setup"; render();
    toast(warnings.length ? `Loaded ${file.name}. Check: ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ""}` : `Loaded ${file.name}.`);
  } catch (err) { toast(`Couldn't read ${file.name}: ${err.message}`); }
}
function bindDrop() {
  const z = document.getElementById("drop"); if (!z) return;
  z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("over"); });
  z.addEventListener("dragleave", () => z.classList.remove("over"));
  z.addEventListener("drop", e => { e.preventDefault(); z.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); });
}

// ---------- events ----------
document.addEventListener("click", e => {
  const stepBtn = e.target.closest("[data-step]");
  if (stepBtn && !stepBtn.disabled) {
    if (stepBtn.dataset.step !== "setup" && !R) { toast("Enter target revenue and platform EBITDA first, or load the demo."); return; }
    STEP = stepBtn.dataset.step; render(); window.scrollTo(0, 0); return;
  }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (b.tagName === "INPUT" || (b.tagName === "LABEL")) return; // file inputs handled on change
  if (act !== "sources" && b.tagName === "A") e.preventDefault();
  switch (act) {
    case "demo": D = demoDeal(); STEP = "setup"; render(); toast("Demo deal loaded: Ridgeline Mechanical into Tri-State Comfort."); break;
    case "blank": D = blankDeal(); D.assumptions = { ...DEFAULTS }; STEP = "setup"; render(); break;
    case "template": download("DealSpan_input_template.xlsx", new Blob([window.XLSX.write(buildTemplate(hasData() ? D : blankDeal()), { type: "array", bookType: "xlsx" })])); break;
    case "addAddback": D.target.addbacks.push({ desc: "", amount: 0, category: "one_time" }); render(); break;
    case "delAddback": D.target.addbacks.splice(+b.dataset.i, 1); render(); break;
    case "export": download(`DealSpan_memo_${(D.target.name || "deal").replace(/\W+/g, "_")}.xlsx`, new Blob([window.XLSX.write(buildMemoWorkbook(D, R, SOURCES), { type: "array", bookType: "xlsx" })])); toast("Exported the memo to Excel."); break;
    case "print": window.print(); break;
    case "assumptions": case "precedents": case "sources": e.preventDefault(); DRAWER = act; renderDrawer(); break;
    case "close": DRAWER = null; render(); break;
    case "resetAssumptions": D.assumptions = { ...DEFAULTS }; resetRules(); render(); toast("Assumptions reset to defaults."); break;
    case "precTemplate": {
      const head = "industry,subsector,date,target,acquirer,ev,revenue,ebitda,currency,basis,notes,source\n";
      const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const body = PREC.map(p => [p.industry, p.subsector, p.date, p.target, p.acquirer, p.ev, p.revenue, p.ebitda, "USD", p.basis, p.notes, p.source].map(q).join(",")).join("\n");
      download("precedent_transactions.csv", new Blob([head + body], { type: "text/csv" })); break;
    }
  }
});

const RULE_DEFAULTS = Object.fromEntries(Object.entries(ADDBACK_RULES).map(([k, r]) => [k, r.accept]));
function resetRules() { Object.entries(RULE_DEFAULTS).forEach(([k, v]) => { ADDBACK_RULES[k].accept = v; }); }

document.addEventListener("change", async e => {
  const el = e.target;
  if (el.dataset.act === "upload" && el.files[0]) { await handleUpload(el.files[0]); el.value = ""; return; }
  if (el.dataset.act === "precImport" && el.files[0]) {
    const { deals, skipped } = rowsToPrecedents(parseCSV(await el.files[0].text()));
    if (deals.length) { PREC = deals; render(); }
    toast(`Imported ${deals.length} deals${skipped.length ? `; skipped ${skipped.length} (${skipped[0]})` : ""}.`);
    el.value = ""; return;
  }
  if (el.matches("select[data-path], input[type=checkbox][data-path]")) {
    const v = readInput(el); setPath(D, el.dataset.path, el.dataset.type === "text" && /ownerDependence/.test(el.dataset.path) ? +v : v); render();
  }
});

document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.rule) { const n = Number(el.value); if (isFinite(n)) { ADDBACK_RULES[el.dataset.rule].accept = Math.max(0, Math.min(100, n)) / 100; refreshKeepFocus(el); } return; }
  if (!el.dataset.path || el.matches("select, input[type=checkbox]")) return;
  const v = readInput(el);
  if (v === null) return;
  setPath(D, el.dataset.path, v);
  // Money fields re-format with commas on blur; while typing, recompute everything but keep the cursor.
  clearTimeout(window.__t); window.__t = setTimeout(updateDerived, 120);
});
// On blur, re-format the field in place (no full re-render, so a click on a button isn't lost).
document.addEventListener("focusout", e => {
  const el = e.target;
  if (!(el.dataset && el.dataset.path && el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "file")) return;
  const v = getPath(D, el.dataset.path), t = el.dataset.type;
  if (t === "money") el.value = Math.round(v || 0).toLocaleString();
  else if (t === "pct") el.value = +((v || 0) * 100).toFixed(2);
  updateDerived();
});
function updateDerived() {
  recompute(); renderSpan(); save();
  document.querySelectorAll("[data-ebitda]").forEach(td => { const f = D.target.financials[+td.dataset.ebitda]; td.textContent = $k(f.revenue - f.cogs - f.opex); });
  const go = document.querySelector('.page-head ~ * [data-step="earnings"], main [data-step="earnings"]');
  if (go) go.disabled = !hasData();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && DRAWER) { DRAWER = null; render(); } });

load();
render();
