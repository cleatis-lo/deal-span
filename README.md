# DealSpan

**Add-on deal diligence for independent sponsors and small PE platforms.** Upload a target's financials and the seller's add-backs, add a short profile of your platform, and DealSpan tells you what the target really earns, what it's worth on its own and inside your platform, how much debt the combined company can carry, and the most you should bid.

Built by RedHaek for a 24-hour fintech hackathon.

## How it works

1. **Setup:** fill the Excel template (download it in the app) or type the numbers in.
2. **Real earnings:** every seller add-back gets a rule-based acceptance rate (run-rate contracts 25%, one-time items 75%, and so on). Owner pay above a market GM salary is added back.
3. **Value & deal:** standalone value from sourced precedent deals and small-deal benchmarks, with public comps shown off to the side as the "size trap"; synergies cut back with Bain/McKinsey base rates; combined leverage and fixed-charge coverage with a +300bp stress.
4. **Memo:** *Bid up to* (standalone value), *walk away above* (standalone + at most 50% of synergy value, capped by financing), the top 3 diligence items, a risk scorecard, and an Excel export.

## Trust

- **No AI at runtime.** The engine (`js/engine.js`) is pure, deterministic functions.
- **Every rule is visible** in the Assumptions panel, and sourced figures link to their source.
- **Every formula is tested:** `npm test` (Node 20+) checks the demo case against hand-computed values in `tests/engine.test.js`, plus an Excel template round-trip.
- Precedent deals (`data/precedent_transactions.csv`) are public deals, each with a source link. Regenerate `js/precedents.js` with `npm run build:precedents`.

DealSpan is a pre-LOI screen, not a quality-of-earnings report or a valuation opinion. The demo companies are fictional.

## Run locally

```
python3 -m http.server 8080   # then open http://localhost:8080
npm test
```

No build step; the site is static and runs on GitHub Pages.
