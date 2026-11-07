// DealSpan simple mode: 3 plain-English steps for small-business buyers.
// All math is in engine.js (tested). This file only renders. No AI.
import * as E from "./engine.js";
import { INDUSTRIES, SOURCES } from "./data.js";
import { PRECEDENTS } from "./precedents.js";
import { buildMemoWorkbook } from "./template.js";
import { OPT, ADD_CATS, blankSimple, exampleOwner, exampleFirst, toDeal, ready, usesSBA, rowsToSimple, subsectorsFor, buildingValue, extraWC } from "./simple-map.js";

const KEY = "dealspan_simple_v1";
let S, D, R, STEP = 0;

// ---------- formatting ----------
const $m = v => !isFinite(v) ? "—" : (v < 0 ? "-" : "") + "$" + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : Math.round(Math.abs(v) / 1e3).toLocaleString() + "K");
const pc = v => Math.round(v * 100) + "%";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = s => { const v = parseFloat(String(s).replace(/[$,\s]/g, "")); return isFinite(v) ? v : 0; };
const lbl = (set, v) => ((OPT[set].find(o => o[0] === v) || [, ""])[1]).toLowerCase();

// What to ask the seller for, per adjustment type (plain-English version of ADDBACK_TESTS).
const ADD_ASK = {
  one_time: "invoices or settlement papers, plus 3 years of the books showing it didn't happen before.",
  personal: "receipts showing the expense is personal and stops after the sale.",
  discretionary: "payroll records and job duties, to confirm you won't need to replace the person.",
  pro_forma: "the signed contract, start date and expected margin. Pay for it only once it's earned (an earnout).",
  other: "the detailed books and a written explanation of why it won't happen again."
};
const ADD_WHY = {
  one_time: "Mostly counted, if it truly won't happen again.",
  personal: "Partly counted. Banks want receipts for personal expenses.",
  discretionary: "Usually counted.",
  pro_forma: "Mostly not counted. It hasn't been earned yet.",
  other: "Half counted. It's unclear what this is."
};

// ---------- plain-English risk wording (engine areas -> owner language) ----------
function plainFlag(f) {
  const q = S.q, e = R.eq, fin = R.fin;
  const P = {
    "Customer concentration": ["Sales depend on a few customers", `The biggest customer is about ${lbl("topCustomer", q.topCustomer)} of sales and the top 5 are ${lbl("top5", q.top5)}. If a big one leaves, profit drops fast.`, "Is there a signed contract with the biggest customers, and when does it end? Ask to talk to them before you sign.", "Tie part of the price to those customers staying (an earnout)."],
    "Owner dependence": ["The business depends on the owner", `The owner ${+q.owner >= 5 ? "is the business" : +q.owner === 4 ? "holds the key customer relationships" : "manages it day-to-day"}. Customers may follow them out the door.`, "Who has the customer relationships, licenses and pricing knowledge today?", "Require the owner to stay 6–12 months to hand things over, and line up a manager before closing."],
    "Recurring revenue": ["Not much repeat business", `${lbl("recurring", q.recurring).replace(/^./, c => c.toUpperCase())} of sales repeats or is under contract. The rest has to be won again every year.`, "How much of last year's sales came from service plans or repeat customers?", "Base your price on the repeat sales and treat one-off jobs as a bonus."],
    "Key employees": ["Key employees might leave", q.staff === "no" ? "You don't know whether the key people will stay." : "Key employees haven't agreed to stay yet.", "Can you meet the key employees before closing? Are they paid fairly?", "Offer stay bonuses, paid at closing or after one year."],
    "Revenue trend": ["Sales aren't growing", `Sales changed about ${(fin.revCagr * 100).toFixed(1)}% a year.`, "Why? Lost customers, lower prices, or one big job ending?", "Price it on today's profit, not the seller's forecast."],
    "Margin trend": ["Profit margins are shrinking", `Profit as a share of sales fell ${Math.abs(fin.marginChange * 100).toFixed(1)} points.`, "What changed: wages, material costs, or prices?", "Price it on the weaker year if the cause won't go away."],
    "Add-back quality": ["The profit depends on the seller's adjustments", `The adjustments add ${Math.round(e.addbackPct * 100)}% on top of reported profit, and about ${Math.round(e.haircut * 100)}% of the seller's number probably won't hold up.`, "Ask for receipts and records for every adjustment over $10K.", "Hire an accountant to verify profit (a quality-of-earnings review) and tie the price to what they find."],
    "Industry cyclicality": ["Sales could drop in a recession", `This type of business ${R.val.ind.cyc === "high" ? "usually gets hit hard" : "usually feels it some"} when the economy slows.`, "How did sales hold up in 2020 and in the last slowdown?", "Borrow less than the maximum and keep a cash cushion."],
    "Supplier concentration": ["It depends on one supplier", q.supplier === "yes" ? "One supplier provides more than half of what they buy." : "You don't know yet whether one supplier dominates.", "Are there other suppliers? Will the supplier agreement continue after the sale?", "Get the supplier's sign-off before closing."],
    "Lease": ["The building lease", q.lease === "short" ? "Less than 2 years left on the lease, or it can't be transferred." : "Only 2–5 years left on the lease.", "Will the landlord transfer or extend the lease? Is the seller the landlord?", "Make a signed lease a condition of closing. Banks usually want it to run as long as the loan."],
    "Licenses & contracts": ["Licenses or contracts may not transfer", q.transfer === "partly" ? "Some licenses or customer contracts may not transfer to you." : "You don't know whether licenses and contracts will transfer.", "List every license, permit and customer contract. Whose name is on each?", "Make the transfers a condition of closing."],
    "Financial statement quality": ["The financial records are thin", `The records are ${lbl("books", q.books)}.`, "Can they show bank statements that match the tax returns?", "Don't skip the quality-of-earnings review."]
  };
  const x = P[f.area] || [f.area, f.finding, f.ask, ""];
  return { rating: f.rating, title: x[0], what: x[1], ask: x[2], fix: x[3] };
}

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
  const p = R.prices, e = R.eq, v = R.val, a = R.atAsk, st = R.atAskStress, y = R.syn, A = D.assumptions;
  // Prices on screen include the building (if any); the engine values the business alone.
  const B = buildingValue(S), WC = extraWC(S);
  const ask = p.ask + B, bid = p.bidUpTo + B, walk = p.walkAway + B, finMax = p.financeableMax + B;
  const sa = { low: p.standalone.low + B, mid: p.standalone.mid + B, high: p.standalone.high + B };
  const flags = R.risk.items.filter(r => r.rating === "red" || r.rating === "yellow").sort((x, z) => (x.rating === "red" ? -1 : 1) - (z.rating === "red" ? -1 : 1)).map(plainFlag);
  const reds = flags.filter(f => f.rating === "red").length;
  const limitedByCash = finMax < sa.mid + 1;
  const pc_ = R.val.prec;

  // Verdict in plain English, from the engine's call.
  let say, sub;
  if (R.callClass === "green") {
    say = reds ? `The price can work, but fix ${reds} serious problem${reds === 1 ? "" : "s"} first.` : `The asking price of ${$m(ask)} looks reasonable.`;
    sub = `It's at or below what the business is worth on its own. Don't go above ${$m(walk)}, and confirm the profit with an accountant before you sign.`;
  } else if (R.callClass === "yellow") {
    say = `The asking price of ${$m(ask)} is close to your limit.`;
    sub = `It's more than the business is worth on its own: you'd be paying the seller for savings only you can create. Offer ${$m(bid)} and walk away above ${$m(walk)}.`;
  } else {
    say = `Don't pay ${$m(ask)}.`;
    sub = limitedByCash
      ? `With ${$m(D.platform.equityAvailable)} of your own cash, the most you can finance is ${$m(finMax)}. Offer up to ${$m(bid)} and walk away above ${$m(walk)}.`
      : `On the profit a bank will believe, it's worth about ${$m(sa.low)}–${$m(sa.high)}. Offer up to ${$m(bid)} and walk away above ${$m(walk)}.`;
  }

  // 1. earnings lines
  const lines = [];
  if (e.ownerExcess > 0) lines.push(["ok", `Owner pay above a manager's salary (${$m(D.target.ownerComp)} paid − ${$m(A.marketOwnerSalary)} to replace them)`, e.ownerExcess, e.ownerExcess]);
  e.items.forEach(i => lines.push([i.accept >= 0.85 ? "ok" : i.accept >= 0.5 ? "part" : "no", `${esc(i.desc)}: <span class="note">${i.recurring ? "Not counted. They called it one-time last year too, so it keeps happening." : ADD_WHY[i.category] || ""}</span>`, i.claimed, i.accepted]));

  // 3. financing
  const have = D.platform.equityAvailable, need = a.equity, gap = Math.max(0, need - have), U = a.uses;
  const seg = (val, cls, txt) => val > 0 ? `<div class="${cls}" style="width:${val / U * 100}%">${val / U > 0.12 ? txt : ""}</div>` : "";
  const cover = d => { d = Math.round(d * 100) / 100; return d >= 1.35 ? ["green", "Yes, comfortably"] : d >= A.minFCCR ? ["green", "Yes, at the bank's minimum"] : d >= 1.1 ? ["amber", "Just barely. Below what banks require"] : ["red", "No"]; };
  const [c1, w1] = cover(a.fccr), [c2, w2] = cover(st.fccr);
  const loanName = usesSBA(S) ? "SBA 7(a) loan" : "Bank term loan";

  // range bar
  const lo = Math.min(sa.low, bid, ask, walk) * 0.85, hi = Math.max(sa.high, ask, walk) * 1.08;
  const P = x => Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100));

  // offer letter
  const shown = flags.slice(0, Math.max(4, reds)), more = flags.slice(shown.length);
  const flagHtml = f => `<div class="flag"><div class="t"><span class="light ${f.rating === "red" ? "red" : "amber"}">${f.rating === "red" ? "Serious" : "Watch"}</span>${esc(f.title)}</div><div class="d">${esc(f.what)}</div><div class="a"><b>Ask the seller:</b> ${esc(f.ask)}</div><div class="a"><b>Protect yourself:</b> ${esc(f.fix)}</div></div>`;
  const conds = [`Price at or below ${$m(walk)}.`, `An accountant's review (quality of earnings) confirms profit of at least ${$m(e.adjusted * 0.95)}. If it comes in lower, the price drops.`];
  if (gap > 0) conds.push(`Close the ${$m(gap)} cash gap: a bigger seller note, an investor, or a lower price.`);
  flags.filter(f => f.rating === "red" && f.title !== "The profit depends on the seller's adjustments").forEach(f => conds.push(f.fix));
  if (+S.q.owner === 3) conds.push("The owner stays 6–12 months to hand over customers and know-how.");
  const proForma = e.items.filter(i => i.category === "pro_forma" && i.claimed > 0);
  if (S.q.sellerPay === "earnout" && proForma.length) conds.push(`Pay for ${proForma.map(i => i.desc.toLowerCase()).join(", ")} through the earnout, only once it's actually earned.`);
  if (B > 0) conds.push(`An independent appraisal confirms the building is worth at least ${$m(B)}.`);
  const n = (y.claimed > 0 ? 6 : 5);

  return `
  <div class="answer ${R.callClass === "yellow" ? "amber" : R.callClass}">
    <div class="note eyebrow">${esc(D.target.name)}</div>
    <div class="say">${esc(say)}</div>
    <div class="plain">${esc(sub)}</div>
    <div class="big3">
      <div><div class="l">Offer up to</div><div class="v">${$m(bid)}</div><div class="s">what it's worth on its own${bid < sa.mid - 1 ? ", limited by what you can finance" : ""}</div></div>
      <div><div class="l">Walk away above</div><div class="v">${$m(walk)}</div><div class="s">${y.pv > 0 && walk > bid + 1 ? "never give the seller more than half your savings" : "your hard limit"}</div></div>
      <div><div class="l">Asking price</div><div class="v">${$m(ask)}</div><div class="s">${ask > walk ? `${$m(ask - walk)} above your walk-away` : "inside your limit"}</div></div>
    </div>
    ${B > 0 ? `<p class="note" style="margin:12px 0 0">All prices include the building at ${$m(B)}. The business itself is valued on its profit.</p>` : ""}
  </div>

  <div class="card">
    <div class="sec-h"><span class="n">1</span><h2>What the business really earns</h2></div>
    <div class="compare"><span>Seller says</span><span class="from">${$m(e.seller)}</span><span>→ a bank will likely believe</span><span class="to">${$m(e.adjusted)}</span><span class="note">a year</span></div>
    <p class="plain">Paying the asking price on the seller's number would mean overpaying about <b>${$m(R.mispricing.priceImpact)}</b>.</p>
    <div class="lines">${lines.map(l => `<div><span class="i ${l[0]}">${l[0] === "ok" ? "✓" : l[0] === "part" ? "½" : "✗"}</span><span>${l[1]}</span><span>${$m(l[3])} <span class="note">of ${$m(l[2])}</span></span></div>`).join("")}</div>
    <details><summary>How we decide this</summary><p class="note">Each type of adjustment gets a fixed rule based on how lenders treat it. In real deals, independent accountants cut the seller's number by 8–15% on about half of small-business loans. We also replace the owner's pay with a ${$m(A.marketOwnerSalary)} manager's salary, because you'll have to pay someone to do their job. Overpayment = the profit gap × the price ÷ seller's profit.</p></details>
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
    <h3>The sold businesses we compared it to <span class="light ${pc_.confidence === "high" ? "green" : pc_.confidence === "medium" ? "amber" : "red"}">${pc_.confidence} match</span></h3>
    ${pc_.count >= 3 ? `<p class="note" style="margin:0 0 8px">We scored every ${esc(v.ind.label.toLowerCase())} deal with a public price on how much it looks like yours (same work, similar size, same kind of buyer, deal structure, how recent). We used the ${pc_.count} closest; closer deals count more. ${pc_.considered - pc_.count > 0 ? `${pc_.considered - pc_.count} others were too different.` : ""}</p>` : `<p class="note" style="margin:0 0 8px">Not enough sold businesses close enough to yours (we need 3 within 5x your size). The value uses the small-business average only. Add more deals to the data to fix this.</p>`}
    ${pc_.deals.map(d => `<div class="comp"><div class="comp-h"><b>${esc(d.target)}</b><span class="note">${esc(d.acquirer)} · ${esc(String(d.date).slice(0, 4))} · <a href="${esc(d.source)}" target="_blank" rel="noopener">source</a></span><span class="mult">${d.multiple.toFixed(1)}x profit</span></div>
      <div class="simbar"><div style="width:${d.score}%"></div></div><div class="note">${Math.round(d.score)}/100 similar: ${esc(d.reasons.join(" · "))}</div></div>`).join("")}
    <p class="note" style="margin-top:12px">Also used: the ${v.bench.mult}x average for businesses this size. Big public companies in this industry trade around ${(v.pub.mid / e.adjusted).toFixed(0)}x. Small businesses sell for far less, so don't let anyone price this like a public company.</p>
    <details><summary>How the similarity score works</summary><p class="note">Out of 100: same type of work 25 · size 30 (full points at the same size, zero at 5x bigger or smaller) · same kind of buyer 15 · deal structure 10 (earnout, bought 100%) · how recent 10 · based on actual vs. forecast profit 10. A deal needs ${A.minCompScore}+ points and must be within 5x your size to count. The price multiple is the similarity-weighted middle of those deals.</p></details>
  </div>

  <div class="card">
    <div class="sec-h"><span class="n">3</span><h2>How you'd pay for it (at the asking price)</h2></div>
    <div class="bar">${seg(a.incremental, "c-bank", "Bank loan " + $m(a.incremental))}${seg(a.sellerNote, "c-seller", "Seller " + $m(a.sellerNote))}${seg(Math.min(need, have), "c-you", "Your cash " + $m(Math.min(need, have)))}${seg(gap, "c-gap", "Missing " + $m(gap))}</div>
    <div class="key"><span><i class="c-bank"></i>${loanName}: ${$m(a.incremental)} at about ${(a.rate * 100).toFixed(1)}%</span><span><i class="c-seller"></i>Seller financing: ${$m(a.sellerNote)}</span><span><i class="c-you"></i>Your cash: ${$m(Math.min(need, have))}</span>${gap > 0 ? `<span><i class="c-gap"></i>Missing: ${$m(gap)}</span>` : ""}</div>
    <p class="plain" style="margin-top:14px">${gap > 0 ? `At ${$m(ask)} you'd need <b>${$m(need)}</b> of your own money. You have ${$m(have)}. That's why the most you can finance is ${$m(finMax)}.` : `You'd put in <b>${$m(need)}</b> of the ${$m(have)} you have.`}${a.binding === "loan size cap" ? " The SBA caps the loan at $5M." : ""}${a.existing > 0 ? ` Your business already owes ${$m(a.existing)}, and the bank looks at both businesses together.` : ""}${WC > 0 ? ` This includes ${$m(WC)} for inventory and receivables paid on top of the price.` : ""}${S.q.sellerPay === "cash" ? " The seller wants all cash, so there's no seller financing." : ""}</p>
    <div class="grid" style="margin-top:12px">
      <div><div class="note">Can ${a.existing > 0 || D.platform.ebitda > 0 ? "the combined business" : "the business"} pay its loans?</div><span class="light ${c1}">${w1}</span><div class="note" style="margin-top:4px">It earns $${a.fccr.toFixed(2)} for every $1 of loan payments. Banks want at least $${A.minFCCR.toFixed(2)}.</div></div>
      <div><div class="note">If interest rates rise 3%?</div><span class="light ${c2}">${w2}</span><div class="note" style="margin-top:4px">$${st.fccr.toFixed(2)} for every $1 of loan payments.</div></div>
    </div>
  </div>

  ${flags.length ? `<div class="card">
    <div class="sec-h"><span class="n">4</span><h2>What could go wrong</h2></div>
    ${shown.map(flagHtml).join("")}
    ${more.length ? `<details><summary>${more.length} smaller thing${more.length === 1 ? "" : "s"} to check</summary>${more.map(flagHtml).join("")}</details>` : ""}
  </div>` : ""}

  ${y.claimed > 0 ? `<div class="card">
    <div class="sec-h"><span class="n">5</span><h2>What you'd gain together</h2></div>
    <p class="plain">You expect <b>${$m((S.savings || 0) + (S.extraSales || 0) * 0.35)}</b> a year in extra profit from combining. Plan on about <b>${$m(y.runRate)}</b>, and expect it to take time.</p>
    <p class="note">Most buyers overestimate this. On average, extra sales from combining come in about a quarter below plan and take around 5 years. Cost savings are more reliable and arrive in about 2. Budget about ${$m(y.integrationCost)} one-time to combine the two businesses. Those savings are yours, which is why we never let you pay the seller more than half of them.${S.q.overlap !== "yes" ? ` Because the businesses ${S.q.overlap === "no" ? "don't overlap" : "only partly overlap"}, we counted ${S.q.overlap === "no" ? "half" : "three-quarters"} of the savings you entered.` : ""}</p>
    <div class="grid3" style="margin-top:10px">
      <div><div class="note">Combined yearly profit</div><b class="stat">${$m(R.cf.pfEbitda)}</b></div>
      <div><div class="note">Total debt ÷ profit, after buying</div><b class="stat">${a.totalLeverage.toFixed(1)}x</b> <span class="light ${a.totalLeverage > 4 ? "red" : a.totalLeverage > 3 ? "amber" : "green"}">${a.totalLeverage > 4 ? "high" : a.totalLeverage > 3 ? "moderate" : "healthy"}</span></div>
      <div><div class="note">Value of the savings (5 years)</div><b class="stat">${$m(y.pv)}</b></div>
    </div>
  </div>` : ""}

  <div class="card">
    <div class="sec-h"><span class="n">${n}</span><h2>Your offer letter</h2></div>
    <p class="plain"><b>Offer up to ${$m(bid)}. Walk away above ${$m(walk)}.</b></p>
    <h3>Check these seller adjustments first</h3>
    <ol class="check">${R.toTest.map(t => `<li><b>${esc(t.desc)}</b>: ${$m(t.priceAtStake)} of the asking price rests on it. Ask for ${esc(ADD_ASK[t.category] || t.test)}</li>`).join("")}</ol>
    <h3>Conditions to put in the letter</h3>
    <ol class="check">${[...new Set(conds)].map(x => `<li>${esc(x)}</li>`).join("")}</ol>
  </div>

  <div class="nav noprint"><button class="btn" data-go="1">← Change answers</button><div class="row"><button class="btn" data-print="1">Print / PDF</button><button class="btn dark" data-xlsx="1">Download Excel</button></div></div>
  <p class="note">This is a first screen, not a quality-of-earnings report or a valuation opinion. Every number comes from your inputs, a fixed rule, or a public source. No AI is used.</p>`;
}

// ---------- files ----------
function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.classList.remove("hide"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add("hide"), 3500); }
function download(name, wb) { window.XLSX.writeFile(wb, name); }
const TEMPLATE_ROWS = [
  ["Field", "Value", "Notes"], ["Business name", "", ""], ["Industry", "home_services", INDUSTRIES.map(i => i.id).join(" | ")],
  ["Asking price", "", ""], ["Sales, last 12 months", "", ""], ["Profit (EBITDA), last 12 months", "", "Before seller adjustments"],
  ["Owner's total pay", "", ""], ["Sales, 2 years ago", "", "Optional"], ["Profit, 2 years ago", "", "Optional"], ["Yearly equipment spending", "", ""],
  ["Adjustment: <describe it>", "", "Category in column C: personal | one_time | discretionary | pro_forma | other"]
];
function templateDownload() {
  const X = window.XLSX, wb = X.utils.book_new(), ws = X.utils.aoa_to_sheet(TEMPLATE_ROWS);
  ws["!cols"] = [{ wch: 36 }, { wch: 16 }, { wch: 70 }];
  X.utils.book_append_sheet(wb, ws, "Seller numbers"); download("DealSpan_template.xlsx", wb);
}
function upload(file) {
  const rd = new FileReader();
  rd.onload = ev => {
    const wb = window.XLSX.read(ev.target.result, { type: "array" });
    S = rowsToSimple(window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }), S); save(); render(); toast("Template loaded. Check the numbers below.");
  };
  rd.readAsArrayBuffer(file);
}
function exportXlsx() { recompute(); download((D.target.name || "deal").replace(/[^a-z0-9]+/gi, "_").slice(0, 40) + "_DealSpan.xlsx", buildMemoWorkbook(D, R, SOURCES)); }

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
