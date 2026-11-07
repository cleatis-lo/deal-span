// DealSpan simple mode: 3 plain-English steps for small-business buyers.
// All math is in engine.js (tested). This file only renders. No AI.
import * as E from "./engine.js";
import { INDUSTRIES, SOURCES } from "./data.js";
import { PRECEDENTS } from "./precedents.js";
import { buildOwnerWorkbook } from "./owner-workbook.js";
import { answerModel } from "./answer.js";
import { OPT, ADD_CATS, blankSimple, exampleOwner, exampleFirst, toDeal, ready, rowsToSimple, simpleToRows, subsectorsFor } from "./simple-map.js";

const KEY = "dealspan_simple_v1";
let S, D, R, STEP = 0;

// ---------- formatting ----------
const $m = v => !isFinite(v) ? "—" : (v < 0 ? "-" : "") + "$" + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : Math.round(Math.abs(v) / 1e3).toLocaleString() + "K");
const pc = v => Math.round(v * 100) + "%";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = s => { const v = parseFloat(String(s).replace(/[$,\s]/g, "")); return isFinite(v) ? v : 0; };
const lbl = (set, v) => ((OPT[set].find(o => o[0] === v) || [, ""])[1]).toLowerCase();

// ---------- state ----------
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (x) { } }
function load() { try { const t = localStorage.getItem(KEY); if (!t) return null; const b = blankSimple(), o = JSON.parse(t); return Object.assign(b, o, { q: { ...b.q, ...(o.q || {}) } }); } catch (x) { return null; } }
function recompute() { D = toDeal(S); R = E.runAll(D, PRECEDENTS); }

// ---------- widgets ----------
const money = (label, key, help) => `<label class="q">${esc(label)}<span class="money"><span>$</span><input inputmode="numeric" data-k="${key}" value="${S[key] ? (+S[key]).toLocaleString("en-US") : ""}" placeholder="0"></span>${help ? `<span class="h">${esc(help)}</span>` : ""}</label>`;
const chips = (k, label, opts) => `<div class="qblock"><div class="qt">${esc(label)}</div><div class="chips">${opts.map(o => `<button class="chip ${S.q[k] === o[0] ? "on" : ""}" data-q="${k}" data-v="${o[0]}">${esc(o[1])}</button>`).join("")}</div></div>`;

function render() {
  document.querySelectorAll(".steps button").forEach((b, i) => { b.className = i === STEP ? "on" : (i < STEP || (i === 2 && ready(S)) ? "done" : ""); });
  document.getElementById("view").innerHTML = [step1, step2, step3][STEP]();
  window.scrollTo(0, 0);
}

// ---------- step 1 ----------
function step1() {
  const ind = INDUSTRIES.map(i => `<option value="${i.id}" ${i.id === S.industry ? "selected" : ""}>${esc(i.label)}</option>`).join("");
  return `
  <h1>The business you want to buy</h1>
  <p class="lead">Copy these from the seller's listing or financial statements. Use the seller's numbers as-is; we'll check them.</p>
  ${!S.sales ? `<div class="start">
    <button data-ex="owner"><b>Try an example</b><span>An HVAC company owner buying a competitor</span></button>
    <button data-ex="first"><b>Try a first-time buyer</b><span>Same business, bought by someone without a company</span></button>
    <label class="startup"><b>Upload the Excel template</b><span>Fill in our template, then upload it</span><input type="file" accept=".csv,.xlsx,.xls" data-up="1" class="hide"></label>
  </div>` : ""}
  <div class="card"><div class="grid">
    <label class="q">Business name<input class="t" data-k="name" value="${esc(S.name)}" placeholder="e.g. Smith Plumbing"></label>
    <label class="q">What kind of business?<select data-k="industry">${ind}</select></label>
    <label class="q">What exactly do they do?<select data-k="subsector"><option value="">Other / not listed</option>${subsectorsFor(S.industry, PRECEDENTS).map(x => `<option ${x === S.subsector ? "selected" : ""}>${esc(x)}</option>`).join("")}</select><span class="h">We compare it to sold businesses that do the same thing</span></label>
    ${money("Asking price", "asking", "What the seller wants for the whole business")}
    ${money("Sales, last 12 months", "sales", "Total revenue")}
    ${money("Profit, last 12 months", "profit", "Before interest, taxes and depreciation (EBITDA), before any seller adjustments")}
    ${money("Owner's total pay", "ownerPay", "Salary, bonus and benefits the owner takes")}
    ${money("Sales, 2 years ago (optional)", "salesPrev", "Shows whether the business is growing")}
    ${money("Profit, 2 years ago (optional)", "profitPrev", "")}
    ${money("Yearly spending on equipment & vehicles", "equipment", "What it takes to keep the business running")}
  </div></div>
  <div class="card"><h2 style="margin-bottom:6px">What's in the deal</h2><p class="note" style="margin:0 0 6px">Optional, but these change the price and how much cash you need.</p>
    ${chips("building", "Does the asking price include the building?", OPT.building)}
    ${S.q.building === "yes" ? `<div class="grid" style="margin-bottom:8px">${money("What the building is worth", "buildingValue", "Appraisal or broker estimate. We price the building separately from the business.")}</div>` : ""}
    ${chips("wc", "Does the price include inventory and money customers owe (working capital)?", OPT.wc)}
    ${S.q.wc === "extra" ? `<div class="grid" style="margin-bottom:8px">${money("How much extra?", "wcAmount", "Cash you'll pay on top of the price at closing")}</div>` : ""}
    ${S.q.wc === "unsure" ? `<p class="note">Ask the broker. Most small-business prices include a normal amount; if it's extra, you need more cash at closing.</p>` : ""}
    ${chips("sellerPay", "How does the seller want to be paid?", OPT.sellerPay)}
  </div>
  <div class="card">
    <h2>Seller's adjustments</h2>
    <p class="note" style="margin:0 0 14px">Sellers usually say "add these back to profit." List each one exactly as they claim it. We'll decide how much a bank would believe.</p>
    ${S.addbacks.map((a, i) => `<div class="ab">
      <input class="t" data-ab="${i}" data-f="desc" value="${esc(a.desc)}" placeholder="What is it?">
      <select data-ab="${i}" data-f="cat">${ADD_CATS.map(c => `<option value="${c[0]}" ${c[0] === a.cat ? "selected" : ""}>${esc(c[1])}</option>`).join("")}</select>
      <span class="money"><span>$</span><input inputmode="numeric" data-ab="${i}" data-f="amt" value="${a.amt ? (+a.amt).toLocaleString("en-US") : ""}" placeholder="0"></span>
      <button class="btn x" data-del="${i}" title="Remove">✕</button>
      ${a.cat === "one_time" ? `<label class="prior"><input type="checkbox" data-ab="${i}" data-f="priorYear" ${a.priorYear ? "checked" : ""}> They also called this "one-time" last year</label>` : ""}
    </div>`).join("") || `<p class="note">None listed yet.</p>`}
    <button class="btn" data-addab="1">+ Add an adjustment</button>
  </div>
  <div class="nav"><a href="#" class="note" data-tpl="1">Download the Excel template</a><button class="btn go" data-go="1">Next: about you →</button></div>`;
}

// ---------- step 2 ----------
function step2() {
  return `
  <h1>About you and the deal</h1>
  <p class="lead">This tells us how much you can afford and what could go wrong after you buy.</p>
  <div class="card"><h2 style="margin-bottom:14px">Your money</h2><div class="grid">
    ${money("Cash you can put in", "cash", "Your own money toward the purchase")}
    ${money("Your current business: yearly sales", "bizSales", "Leave at 0 if this would be your first business")}
    ${money("Your current business: yearly profit", "bizProfit", "")}
    ${money("Your current business: debt", "bizDebt", "")}
  </div></div>
  ${S.bizSales > 0 ? `<div class="card"><h2>What you'd gain together</h2><p class="note" style="margin:0 0 14px">Your honest guess. We'll adjust it for how often buyers overestimate.</p><div class="grid">
    ${money("Yearly cost savings from combining", "savings", "One office, one bookkeeper, better supplier prices")}
    ${money("Extra yearly sales from each other's customers", "extraSales", "Selling your services to their customers and theirs to yours")}
  </div>${chips("overlap", "Do the two businesses share customers or a service area?", OPT.overlap)}</div>` : ""}
  <div class="card"><h2 style="margin-bottom:6px">Quick risk check</h2><p class="note" style="margin:0 0 10px">Ask the seller or broker if you don't know. "Not sure" is a fine answer for now.</p>
    ${chips("topCustomer", "How much of sales comes from the single biggest customer?", OPT.topCustomer)}
    ${chips("top5", "How much comes from the biggest 5 customers combined?", OPT.top5)}
    ${chips("owner", "How involved is the current owner?", OPT.owner)}
    ${chips("recurring", "How much of sales is repeat or under contract (service plans, maintenance)?", OPT.recurring)}
    ${chips("staff", "Will the key employees stay after the sale?", OPT.staff)}
    ${chips("lease", "What about the building?", OPT.lease)}
    ${chips("transfer", "Will licenses, permits and customer contracts transfer to you?", OPT.transfer)}
    ${chips("supplier", "Does one supplier provide more than half of what they buy?", OPT.supplier)}
    ${chips("books", "How good are the financial records?", OPT.books)}
  </div>
  <div class="nav"><button class="btn" data-go="0">← Back</button><button class="btn go" data-go="2">See my answer →</button></div>`;
}

// ---------- step 3: the answer ----------
function step3() {
  if (!ready(S)) return `<div class="card empty"><h2>We need a few numbers first</h2><p>Enter the asking price, sales and profit on step 1.</p><button class="btn go" data-go="0">Go to step 1</button></div>`;
  recompute();
  const M = answerModel(S, D, R), F = M.financing, C = M.comps, Y = M.synergy, e = M.earnings;
  const ask = M.ask, walk = M.walk, sa = M.worth;
  const seg = (val, cls, txt) => val > 0 ? `<div class="${cls}" style="width:${val / F.total * 100}%">${val / F.total > 0.12 ? txt : ""}</div>` : "";
  const lo = Math.min(sa.low, M.bid, ask, walk) * 0.85, hi = Math.max(sa.high, ask, walk) * 1.08;
  const P = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));
  const shown = M.flags.slice(0, Math.max(4, M.reds)), more = M.flags.slice(shown.length);
  const flagHtml = f => `<div class="flag"><div class="t"><span class="light ${f.rating === "red" ? "red" : "amber"}">${f.rating === "red" ? "Serious" : "Watch"}</span>${esc(f.title)}</div><div class="d">${esc(f.what)}</div><div class="a"><b>Ask the seller:</b> ${esc(f.ask)}</div><div class="a"><b>Protect yourself:</b> ${esc(f.fix)}</div></div>`;
  const n = Y ? 6 : 5;

  return `
  <div class="answer ${M.callClass === "yellow" ? "amber" : M.callClass}">
    <div class="note eyebrow">${esc(M.name)}</div>
    <div class="say">${esc(M.say)}</div>
    <div class="plain">${esc(M.sub)}</div>
    <div class="big3">
      <div><div class="l">Offer up to</div><div class="v">${$m(M.bid)}</div><div class="s">${esc(M.bidNote)}</div></div>
      <div><div class="l">Walk away above</div><div class="v">${$m(walk)}</div><div class="s">${esc(M.walkNote)}</div></div>
      <div><div class="l">Asking price</div><div class="v">${$m(ask)}</div><div class="s">${esc(M.askNote)}</div></div>
    </div>
    ${M.building > 0 ? `<p class="note" style="margin:12px 0 0">All prices include the building at ${$m(M.building)}. The business itself is valued on its profit.</p>` : ""}
  </div>

  <div class="card">
    <div class="sec-h"><span class="n">1</span><h2>What the business really earns</h2></div>
    <div class="compare"><span>Seller says</span><span class="from">${$m(e.seller)}</span><span>→ a bank will likely believe</span><span class="to">${$m(e.adjusted)}</span><span class="note">a year</span></div>
    <p class="plain">Paying the asking price on the seller's number would mean overpaying about <b>${$m(e.overpay)}</b>.</p>
    <div class="lines">${e.lines.map(l => `<div><span class="i ${l.status}">${l.status === "ok" ? "✓" : l.status === "part" ? "½" : "✗"}</span><span>${esc(l.label)}: <span class="note">${esc(l.note)}</span></span><span>${$m(l.counted)} <span class="note">of ${$m(l.claimed)}</span></span></div>`).join("")}</div>
    <details><summary>How we decide this</summary><p class="note">Each type of adjustment gets a fixed rule based on how lenders treat it. In real deals, independent accountants cut the seller's number by 8–15% on about half of small-business loans. We also replace the owner's pay with a ${$m(e.managerSalary)} manager's salary, because you'll have to pay someone to do their job. Overpayment = the profit gap × the price ÷ seller's profit.</p></details>
  </div>

  <div class="card">
    <div class="sec-h"><span class="n">2</span><h2>What it's worth on its own</h2></div>
    <p class="plain">Similar businesses sell for <b>${$m(sa.low)} – ${$m(sa.high)}</b> on that profit.</p>
    <div class="range">
      <div class="track"></div>
      <div class="fair" style="left:${P(sa.low)}%;width:${P(sa.high) - P(sa.low)}%"></div>
      <div class="mk" style="left:${P(ask)}%;background:var(--red)"><span style="color:var(--red)">Asking ${$m(ask)}</span></div>
      <div class="mk" style="left:${P(walk)}%;background:var(--ink)"><em>Walk away ${$m(walk)}</em></div>
    </div>
    <h3>The sold businesses we compared it to <span class="light ${C.confidence === "high" ? "green" : C.confidence === "medium" ? "amber" : "red"}">${C.confidence} match</span></h3>
    ${C.enough ? `<p class="note" style="margin:0 0 8px">We scored every ${esc(C.industry.toLowerCase())} deal with a public price on how much it looks like yours (same work, similar size, same kind of buyer, deal structure, how recent). We used the ${C.count} closest; closer deals count more. ${C.considered - C.count > 0 ? `${C.considered - C.count} others were too different.` : ""}</p>` : `<p class="note" style="margin:0 0 8px">Not enough sold businesses close enough to yours (we need 3 within 5x your size). The value uses the small-business average only. Add more deals to the data to fix this.</p>`}
    ${C.deals.map(d => `<div class="comp"><div class="comp-h"><b>${esc(d.target)}</b><span class="note">${esc(d.acquirer)} · ${esc(d.year)} · <a href="${esc(d.source)}" target="_blank" rel="noopener">source</a></span><span class="mult">${d.multiple.toFixed(1)}x profit</span></div>
      <div class="simbar"><div style="width:${d.score}%"></div></div><div class="note">${Math.round(d.score)}/100 similar: ${esc(d.reasons.join(" · "))}</div></div>`).join("")}
    <p class="note" style="margin-top:12px">Also used: the ${C.benchMult}x average for businesses this size. Big public companies in this industry trade around ${C.publicMult.toFixed(0)}x. Small businesses sell for far less, so don't let anyone price this like a public company.</p>
    <details><summary>How the similarity score works</summary><p class="note">Out of 100: same type of work 25 · size 30 (full points at the same size, zero at 5x bigger or smaller) · same kind of buyer 15 · deal structure 10 (earnout, bought 100%) · how recent 10 · based on actual vs. forecast profit 10. A deal needs ${C.minScore}+ points and must be within 5x your size to count. The price multiple is the similarity-weighted middle of those deals.</p></details>
  </div>

  <div class="card">
    <div class="sec-h"><span class="n">3</span><h2>How you'd pay for it (at the asking price)</h2></div>
    <div class="bar">${seg(F.bank, "c-bank", "Bank loan " + $m(F.bank))}${seg(F.seller, "c-seller", "Seller " + $m(F.seller))}${seg(F.yourCash, "c-you", "Your cash " + $m(F.yourCash))}${seg(F.gap, "c-gap", "Missing " + $m(F.gap))}</div>
    <div class="key"><span><i class="c-bank"></i>${F.loanName}: ${$m(F.bank)} at about ${(F.rate * 100).toFixed(1)}%</span><span><i class="c-seller"></i>Seller financing: ${$m(F.seller)}</span><span><i class="c-you"></i>Your cash: ${$m(F.yourCash)}</span>${F.gap > 0 ? `<span><i class="c-gap"></i>Missing: ${$m(F.gap)}</span>` : ""}</div>
    <p class="plain" style="margin-top:14px">${F.notes.map(esc).join(" ")}</p>
    <div class="grid" style="margin-top:12px">
      <div><div class="note">Can ${F.combined ? "the combined business" : "the business"} pay its loans?</div><span class="light ${F.coverageColor}">${F.coverageWord}</span><div class="note" style="margin-top:4px">It earns $${F.coverage.toFixed(2)} for every $1 of loan payments. Banks want at least $${F.minCoverage.toFixed(2)}.</div></div>
      <div><div class="note">If interest rates rise 3%?</div><span class="light ${F.stressColor}">${F.stressWord}</span><div class="note" style="margin-top:4px">$${F.stressCoverage.toFixed(2)} for every $1 of loan payments.</div></div>
    </div>
  </div>

  ${M.flags.length ? `<div class="card">
    <div class="sec-h"><span class="n">4</span><h2>What could go wrong</h2></div>
    ${shown.map(flagHtml).join("")}
    ${more.length ? `<details><summary>${more.length} smaller thing${more.length === 1 ? "" : "s"} to check</summary>${more.map(flagHtml).join("")}</details>` : ""}
  </div>` : ""}

  ${Y ? `<div class="card">
    <div class="sec-h"><span class="n">5</span><h2>What you'd gain together</h2></div>
    <p class="plain">You expect <b>${$m(Y.expected)}</b> a year in extra profit from combining. Plan on about <b>${$m(Y.planOn)}</b>, and expect it to take time.</p>
    <p class="note">Most buyers overestimate this. On average, extra sales from combining come in about a quarter below plan and take around 5 years. Cost savings are more reliable and arrive in about 2. Budget about ${$m(Y.integrationCost)} one-time to combine the two businesses. Those savings are yours, which is why we never let you pay the seller more than half of them.${Y.overlapNote ? " " + esc(Y.overlapNote) : ""}</p>
    <div class="grid3" style="margin-top:10px">
      <div><div class="note">Combined yearly profit</div><b class="stat">${$m(Y.combinedProfit)}</b></div>
      <div><div class="note">Total debt ÷ profit, after buying</div><b class="stat">${Y.debtToProfit.toFixed(1)}x</b> <span class="light ${Y.debtWord === "high" ? "red" : Y.debtWord === "moderate" ? "amber" : "green"}">${Y.debtWord}</span></div>
      <div><div class="note">Value of the savings (5 years)</div><b class="stat">${$m(Y.pv)}</b></div>
    </div>
  </div>` : ""}

  <div class="card">
    <div class="sec-h"><span class="n">${n}</span><h2>Your offer letter</h2></div>
    <p class="plain"><b>Offer up to ${$m(M.bid)}. Walk away above ${$m(walk)}.</b></p>
    <h3>Check these seller adjustments first</h3>
    <ol class="check">${M.toCheck.map(t => `<li><b>${esc(t.desc)}</b>: ${$m(t.atStake)} of the asking price rests on it. Ask for ${esc(t.ask)}</li>`).join("")}</ol>
    <h3>Conditions to put in the letter</h3>
    <ol class="check">${M.conditions.map(x => `<li>${esc(x)}</li>`).join("")}</ol>
  </div>

  <div class="nav noprint"><button class="btn" data-go="1">← Change answers</button><div class="row"><button class="btn" data-print="1">Print / PDF</button><button class="btn dark" data-xlsx="1">Download Excel</button></div></div>
  <p class="note">${esc(M.disclaimer)}</p>`;
}

// ---------- files ----------
function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.classList.remove("hide"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add("hide"), 3500); }
function download(name, wb) { window.XLSX.writeFile(wb, name); }
function templateDownload() {
  const X = window.XLSX, wb = X.utils.book_new(), ws = X.utils.aoa_to_sheet(simpleToRows());
  ws["!cols"] = [{ wch: 36 }, { wch: 16 }, { wch: 70 }];
  X.utils.book_append_sheet(wb, ws, "Seller numbers"); download("DealSpan_template.xlsx", wb);
}
function upload(file) {
  const rd = new FileReader();
  rd.onload = ev => {
    const wb = window.XLSX.read(ev.target.result, { type: "array" });
    const sh = wb.Sheets["Seller numbers"] || wb.Sheets[wb.SheetNames[0]];
    S = rowsToSimple(window.XLSX.utils.sheet_to_json(sh, { header: 1 }), S); save(); render(); toast("Template loaded. Check the numbers below.");
  };
  rd.readAsArrayBuffer(file);
}
function exportXlsx() { recompute(); download((D.target.name || "deal").replace(/[^a-z0-9]+/gi, "_").slice(0, 40) + "_DealSpan.xlsx", buildOwnerWorkbook(window.XLSX, S, answerModel(S, D, R), SOURCES)); }

// ---------- events ----------
document.addEventListener("input", ev => {
  const t = ev.target;
  if (t.dataset.k) { const k = t.dataset.k; S[k] = (k === "name" || k === "industry") ? t.value : num(t.value); save(); }
  if (t.dataset.ab !== undefined) { const a = S.addbacks[+t.dataset.ab], f = t.dataset.f; a[f] = f === "amt" ? num(t.value) : f === "priorYear" ? t.checked : t.value; save(); }
});
document.addEventListener("change", ev => {
  const t = ev.target;
  if (t.dataset.up && t.files[0]) { upload(t.files[0]); t.value = ""; }
  if (t.closest && t.closest(".money")) { const v = num(t.value); t.value = v ? v.toLocaleString("en-US") : ""; }
  if (t.dataset.ab !== undefined && t.dataset.f === "cat") { const y = window.scrollY; render(); window.scrollTo(0, y); }
  if (t.dataset.k === "bizSales" && STEP === 1) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  if (t.dataset.k === "industry") { S.subsector = ""; save(); const y = window.scrollY; render(); window.scrollTo(0, y); }
});
document.addEventListener("click", ev => {
  const t = ev.target.closest("button,a"); if (!t) return;
  const d = t.dataset;
  if (d.step !== undefined) { STEP = +d.step; render(); }
  if (d.go !== undefined) { ev.preventDefault(); if (+d.go === 2 && !ready(S)) { toast("Enter the asking price, sales and profit first."); STEP = 0; } else STEP = +d.go; render(); }
  if (d.q) { S.q[d.q] = d.v; save(); if (["building", "wc"].includes(d.q)) { const y = window.scrollY; render(); window.scrollTo(0, y); } else t.parentNode.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c === t)); }
  if (d.addab) { S.addbacks.push({ desc: "", cat: "personal", amt: 0 }); save(); render(); }
  if (d.del !== undefined) { S.addbacks.splice(+d.del, 1); save(); render(); }
  if (d.ex) { S = d.ex === "owner" ? exampleOwner() : exampleFirst(); save(); STEP = 2; render(); }
  if (d.tpl) { ev.preventDefault(); templateDownload(); }
  if (d.print) window.print();
  if (d.xlsx) exportXlsx();
  if (d.reset) { S = blankSimple(); save(); STEP = 0; render(); }
});
S = load() || blankSimple(); STEP = ready(S) ? 2 : 0; render();
