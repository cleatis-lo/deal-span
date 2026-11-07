# DealSpan

**Should you buy this business, and for how much?** DealSpan helps small-business owners and first-time buyers screen a business before making an offer. Three plain-English steps:

1. **The business:** asking price, sales, profit, owner pay, and the seller's adjustments exactly as claimed (type them in or upload the Excel template).
2. **About you:** your cash, your current business if you have one, and nine click-to-answer risk questions.
3. **Your answer:** offer up to / walk away above, what the business really earns, what it's worth, how you'd pay for it, what could go wrong, and what to put in the offer letter. Download it to Excel.

Where it fits: after you get the seller's numbers and before you sign an offer letter (LOI). It is a first screen, not a quality-of-earnings report or a valuation opinion.

Built by RedHaek for a 24-hour fintech hackathon.

## How the numbers work

- **Real earnings:** each seller adjustment gets a fixed acceptance rule (income not yet earned 25%, one-time items 75%, one-time items claimed two years running 0%, and so on). Owner pay above a $125K manager salary is added back.
- **Value:** comparable deals with public prices plus small-deal benchmarks. Public-company multiples are shown only as a warning.
- **Pricing rules:** *Offer up to* = what the business is worth on its own. *Walk away above* = that value plus at most half the value of your expected savings from combining. Both are capped at what you can finance.
- **Financing:** deals up to $7.5M use SBA 7(a) terms ($5M loan cap, about 10 years, 10% down); larger deals use a conventional bank loan. Coverage is stress-tested with a +3% rate rise.

## Trust

- **No AI at runtime.** `js/engine.js` is pure, deterministic functions.
- **Every formula is tested:** `npm test` (Node 20+) checks the examples against hand-computed values.
- Rules and assumptions are labeled in `js/data.js` and `js/simple-map.js`; sourced figures link to their source.
- Precedent deals (`data/precedent_transactions.csv`) are public deals, each with a source link. Regenerate `js/precedents.js` with `npm run build:precedents`.
- Small deals ($2–23M) come mostly from Kingsway, a public holding company that buys businesses search-fund style and discloses price, revenue and adjusted EBITDA for each deal. They are tagged `buyer_type=financial`; a first-time buyer gets partial buyer-match credit for them. Partial stakes are grossed up to 100%. Other small-deal sources: Decisive Dividend (Canadian manufacturing holdco), Nova Leap Health (home care), Universal Technical Institute, Hudson Technologies, Quest Resource, Titanium Transportation. Foreign-currency deals are converted to US dollars on load at fixed approximate rates (`FX_TO_USD` in `js/data.js`); multiples are unaffected. Also excluded: bankruptcy auctions (BBQ Holdings' Granite City and Tahoe Joe's), deals where the price included real estate that can't be separated (Big Lake Lumber), and broker listings (asking prices, not sale prices). Excluded: deals with no disclosed profit (SPI, The HR Team, Ledgers), a deal that never closed (NICR), and deals whose price and profit were for different periods (1847 Holdings / CMD).

The example companies are fictional.

## Run locally

```
python3 -m http.server 8080   # then open http://localhost:8080
npm test
```

No build step; the site is static and runs on GitHub Pages.
