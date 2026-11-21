# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/loufeng026-byte/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/loufeng026-byte/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every pre-token protocol in the snapshot, ranked by expected launch value, with a costed farm plan for each — built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot (`input/snapshot.json`, 758 frozen DefiLlama protocols as of 2026-11-14), fits its model on the snapshot's own traded tokens, and writes `out/` with:

- `board.json` — **198 rows**: all 40 watchlist protocols plus every other rankable pre-token protocol, ranked 1–198 by expected launch value, each with a 7-step farm plan.
- `data.js` — the same board in compact form for the dashboard, plus the fitted coefficients.
- `dashboard/` — a static offline page (no network): sortable/filterable board, per-protocol detail view with a model breakdown, live-token view, and the full model on the page.
- `screenshots/` — board, detail, and filtered views of the dashboard.
- `dossier.json` — the judge's summary, built with the kit's vendored `vendor/makefun-board.ts`.

## The model (radar-2)

No protocol name is ever special-cased, and no value is a hardcoded multiple. The program refits everything from whatever snapshot it is handed, so it re-ranks a future snapshot on its own.

**1 · Size curve — fitted, not assumed.** `log10(market cap) = a + b · log10(TVL)`, ordinary least squares over the snapshot's 118 traded tokens (non-CEX, non-versioned). On this snapshot: `a = 3.4437, b = 0.4617, R² = 0.14`. The curve is concave: a $1B protocol is worth far less than a quarter of its TVL. Held out by 5-fold cross-validation (folds by slug hash) it beats a flat median mcap/TVL multiple on log error (log10 RMSE 0.888 vs 0.969) and on mean absolute percentage error (952% vs 1,699%), and ties it on median error (86% vs 87%) — TVL alone is a weak predictor, which is why the curve stays concave and the odds and verdicts do the rest of the work.

**2 · Growth — a bounded prior.** The comps fit gives seven-day growth no predictive weight (adding it makes the held-out error worse: log RMSE 0.922 vs 0.888), so it enters at the house weight, clamped: `× (1 + clamp(change_7d, −60, +120)/100 × 0.5)`. The page says this plainly.

**3 · No-token clock — launch odds by age.** The share of protocols that record a token rises with age (26% under 6 months, 79% past 3 years), so a protocol that has run years with no token is less likely ever to record one. The clock `F(a) = 0.95 · (1 − e^(−0.41·a))` is fitted by least squares on the snapshot's age buckets; odds = `(0.95 − F(age)) / (1 − F(age))`, clamped to 5–95%. Unknown age is treated as 365 days.

**Expected value = launch value × token odds**, ranked highest first. Top of the board on this snapshot: Sentora Curator (~$59M), Steakhouse Financial (~$57M), Gauntlet (~$46M).

**4 · Farm verdict — netted to break-even.** Each plan is costed from the protocol's own record: capital by TVL ($50–$250), hold by age (30–60 days), entry gas + $2/week + 5% APR opportunity cost on the capital. A 5% farmer allocation of the expected value, divided by the all-in cost, is the break-even farmer count: how many farmers the economics can pay. FARM at 50,000 and up, THIN at 10,000 and up, else SKIP. On this snapshot: 25 FARM, 153 THIN, 20 SKIP.

**Coverage.** 758 protocols accounted for: 198 ranked, 416 live-token set aside (top 24 shown with the market's own values), 144 pre-token excluded as wrapped, staked, bridged, exchange, or versioned products of tokens that already trade — the watchlist rule applied to every protocol, not only the watchlist.

**Proof in the page.** The dashboard recomputes every row's expected value and verdict from the fitted coefficients it carries and reports the match against `board.json` (198/198 on this snapshot). The farm plan is generated in the page from the same functions, so screenshots, code, and board agree.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Deterministic: two runs on the same snapshot produce byte-identical output. No network, no dependencies.

## Layout

```
main.ts                  entrypoint: reads input/snapshot.json, writes out/
lib/model.ts             the fitted model, farm plans, board builder
vendor/makefun-board.ts  the kit's dossier library, byte for byte
dashboard/               index.html + app.css + app.js (static, offline)
screenshots/              1-board.png, 2-detail.png, 3-filtered.png
input/snapshot.json      the sealed snapshot the program scores
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=9s0rhqbz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
