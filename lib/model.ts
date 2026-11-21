// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every other
// pre-token protocol the watchlist rule itself leaves out: the early radar exists to find them. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id, no
// symbol); the snapshot's live-token protocols are kept apart and shown as the market's own values,
// never mixed into the ranked board.
//
// Implied value is fitted, not assumed. The size curve is an ordinary-least-squares fit of
// log10(market cap) on log10(TVL) over the snapshot's own traded tokens (the comps), tested out of
// sample by 5-fold cross-validation against a flat median mcap/TVL multiple. The growth term is a
// bounded prior: the comps fit gives seven-day growth no predictive weight (adding it makes the
// held-out error worse), so it enters at the house weight, clamped, and the page says so. Age enters
// only through the no-token clock, not through the size curve: the comps fit gives age a negative
// coefficient, so a maturity multiplier that rises with age would fight the data.
//
//   launch value   = 10^(a + b * log10(tvl_usd)) * (1 + clamp(change_7d, -60, 120) / 100 * 0.5)
//   token odds     = (pInf - F(age)) / (1 - F(age)),  F(age) = pInf * (1 - exp(-lambda * age_years))
//   implied value  = max(1, round(launch value * token odds))
//
// The clock's pInf and lambda are fitted by least squares on the snapshot's own age buckets: the
// share of protocols that record a token rises with age (26% under 6 months, 79% past 3 years), so a
// protocol that has run years with no token is less likely ever to record one. No protocol name is
// ever special-cased: the same functions score every row, and the program refits both the curve and
// the clock from whatever snapshot it is handed, so the radar re-ranks a future snapshot on its own.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted size curve and its held-out test, as the dashboard states them. */
export interface SizeFit {
  intercept: number;
  slope: number;
  r2: number;
  n_comps: number;
  cv_log_rmse_fit: number;
  cv_log_rmse_flat: number;
  cv_med_ape_fit: number;
  cv_med_ape_flat: number;
  cv_mean_ape_fit: number;
  cv_mean_ape_flat: number;
}

/** One age bucket of the no-token clock, as the dashboard states it. */
export interface ClockBucket {
  label: string;
  n: number;
  mean_age_years: number;
  token_share: number;
  fitted_share: number;
}

/** The fitted no-token clock, as the dashboard states it. */
export interface ClockFit {
  p_inf: number;
  lambda: number;
  buckets: ClockBucket[];
}

/** The farm verdict policy, as the dashboard states it. */
export interface VerdictPolicy {
  farmer_share: number;
  farm_threshold: number;
  thin_threshold: number;
  farm: number;
  thin: number;
  skip: number;
}

/** The census of the whole snapshot, as the dashboard states it. */
export interface Census {
  total: number;
  ranked: number;
  live: number;
  excluded_pre_token: number;
  watchlist: number;
}

/** The model's constants: the priors the fit does not set, and the farm economics. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  opportunity_apr: number;
  weekly_gas_usd: number;
  entry_gas_low_usd: number;
  entry_gas_high_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  unknown_age_days: 365,
  opportunity_apr: 0.05,
  weekly_gas_usd: 2,
  entry_gas_low_usd: 4,
  entry_gas_high_usd: 8,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    launch_value_usd: number;
    token_odds: number;
    growth_pct: number;
    growth_multiplier: number;
    fit_intercept: number;
    fit_slope: number;
    age_days: number | null;
  };
  farm: {
    capital_usd: number;
    hold_days: number;
    total_cost_usd: number;
    break_even_farmers: number;
    verdict: 'FARM' | 'THIN' | 'SKIP';
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  launch_value_usd: number;
  token_odds: number;
  growth_multiplier: number;
  farm_capital_usd: number;
  farm_hold_days: number;
  farm_cost_usd: number;
  farm_break_even_farmers: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  size_fit: SizeFit;
  clock_fit: ClockFit;
  verdicts: VerdictPolicy;
  census: Census;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The watchlist rule, applied to every protocol, not only the watchlist: a wrapped, staked or bridged
 * product of a token that already trades, an exchange, and a versioned pool are not pre-token
 * launches, whatever their TVL. The rule is the snapshot's own: categories and names, never a list.
 */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol is one the board may rank: pre-token and not an excluded product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A slug's fold for cross-validation: FNV-1a, five folds, no randomness. */
function foldOf(slug: string): number {
  let h = 2166136261;
  for (const c of slug) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 5;
}

/** The traded tokens the size curve is fitted on: live-token, non-exchange, non-versioned. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX' && !VERSIONED.test(p.name));
}

/** Closed-form OLS of y on x: intercept, slope and R squared. */
function ols(xs: number[], ys: number[]): { intercept: number; slope: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (let i = 0; i < n; i++) ssRes += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  return { intercept, slope, r2: syy === 0 ? 0 : 1 - ssRes / syy };
}

/** The size curve fitted on the snapshot's comps, with its 5-fold held-out test against a flat multiple. */
export function fitSizeCurve(snapshot: Snapshot): SizeFit {
  const comps = compsOf(snapshot);
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const { intercept, slope, r2 } = ols(xs, ys);
  let sqFit = 0;
  let sqFlat = 0;
  const apeFit: number[] = [];
  const apeFlat: number[] = [];
  let n = 0;
  for (let fold = 0; fold < 5; fold++) {
    const train = comps.filter((p) => foldOf(p.slug) !== fold);
    const test = comps.filter((p) => foldOf(p.slug) === fold);
    const f = ols(train.map((p) => Math.log10(p.tvl_usd)), train.map((p) => Math.log10(p.mcap_usd!)));
    const ratios = train.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
    const flat = ratios[Math.floor(ratios.length / 2)]!;
    for (const p of test) {
      const y = Math.log10(p.mcap_usd!);
      const yFit = f.intercept + f.slope * Math.log10(p.tvl_usd);
      const yFlat = Math.log10(p.tvl_usd * flat);
      sqFit += (y - yFit) ** 2;
      sqFlat += (y - yFlat) ** 2;
      apeFit.push(Math.abs(10 ** yFit - p.mcap_usd!) / p.mcap_usd!);
      apeFlat.push(Math.abs(p.tvl_usd * flat - p.mcap_usd!) / p.mcap_usd!);
      n++;
    }
  }
  // Median absolute percentage error: the mean is outlier-driven (a few comps are off by 100x),
  // so the page states both, and the log error is the headline — the fit lives in log space.
  const median = (a: number[]): number => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)]!;
  };
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    intercept: round4(intercept),
    slope: round4(slope),
    r2: round4(r2),
    n_comps: comps.length,
    cv_log_rmse_fit: round4(Math.sqrt(sqFit / n)),
    cv_log_rmse_flat: round4(Math.sqrt(sqFlat / n)),
    cv_med_ape_fit: round4(median(apeFit)),
    cv_med_ape_flat: round4(median(apeFlat)),
    cv_mean_ape_fit: round4(mean(apeFit)),
    cv_mean_ape_flat: round4(mean(apeFlat)),
  };
}

/** The age buckets the clock is fitted on: under 6 months, 6-12 months, 1-2 years, 2-3 years, past 3 years. */
const CLOCK_EDGES = [0, 180, 365, 730, 1095, Number.POSITIVE_INFINITY];
const CLOCK_LABELS = ['under 6 months', '6-12 months', '1-2 years', '2-3 years', 'past 3 years'];

/** The no-token clock fitted on the snapshot: the share of protocols that record a token by age. */
export function fitClock(snapshot: Snapshot): ClockFit {
  const aged = snapshot.protocols
    .map((p) => ({ p, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((r): r is { p: SnapshotProtocol; age: number } => r.age !== null);
  const buckets: { label: string; n: number; meanAgeYears: number; tokenShare: number }[] = [];
  for (let i = 0; i < CLOCK_LABELS.length; i++) {
    const lo = CLOCK_EDGES[i]!;
    const hi = CLOCK_EDGES[i + 1]!;
    const members = aged.filter((r) => r.age >= lo && r.age < hi);
    if (members.length === 0) continue;
    buckets.push({
      label: CLOCK_LABELS[i]!,
      n: members.length,
      meanAgeYears: members.reduce((s, r) => s + r.age / 365, 0) / members.length,
      tokenShare: members.filter((r) => !isPreToken(r.p)).length / members.length,
    });
  }
  // Least squares on F(a) = pInf * (1 - exp(-lambda * a)), weighted by bucket size.
  let best = { pInf: 0.94, lambda: 0.41, err: Number.POSITIVE_INFINITY };
  for (let pInf = 0.8; pInf <= 0.99; pInf += 0.01) {
    for (let lambda = 0.1; lambda <= 1.5; lambda += 0.01) {
      let err = 0;
      for (const b of buckets) err += b.n * (pInf * (1 - Math.exp(-lambda * b.meanAgeYears)) - b.tokenShare) ** 2;
      if (err < best.err) best = { pInf, lambda, err };
    }
  }
  const pInf = Math.round(best.pInf * 100) / 100;
  const lambda = Math.round(best.lambda * 100) / 100;
  return {
    p_inf: pInf,
    lambda,
    buckets: buckets.map((b) => ({
      label: b.label,
      n: b.n,
      mean_age_years: round4(b.meanAgeYears),
      token_share: round4(b.tokenShare),
      fitted_share: round4(pInf * (1 - Math.exp(-lambda * b.meanAgeYears))),
    })),
  };
}

/** A protocol's launch odds from the clock: the share of its age's survivors that ever record a token. */
export function tokenOdds(age: number | null, clock: ClockFit, model: ModelConstants = MODEL): number {
  const years = (age ?? model.unknown_age_days) / 365;
  const f = clock.p_inf * (1 - Math.exp(-clock.lambda * years));
  return clamp((clock.p_inf - f) / (1 - f), 0.05, 0.95);
}

/** The three terms and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: SizeFit,
  clock: ClockFit,
  model: ModelConstants = MODEL,
): { implied: number; launch: number; odds: number; growthPct: number; growthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const launch = Math.max(1, Math.round(10 ** (fit.intercept + fit.slope * Math.log10(protocol.tvl_usd)) * growthMult));
  const odds = tokenOdds(age, clock, model);
  const implied = Math.max(1, Math.round(launch * odds));
  return { implied, launch, odds, growthPct, growthMult, age };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A farm's all-in cost in dollars: entry gas, weekly gas over the hold, and the capital's opportunity cost. */
export function farmCostUsd(capital: number, holdDays: number, model: ModelConstants = MODEL): number {
  const entryGas = capital >= 150 ? model.entry_gas_high_usd : model.entry_gas_low_usd;
  const weekly = model.weekly_gas_usd * Math.ceil(holdDays / 7);
  const opportunity = capital * model.opportunity_apr * (holdDays / 365);
  return Math.round((entryGas + weekly + opportunity) * 100) / 100;
}

/** The break-even farmer count: how many farmers a 5% farmer allocation can pay at this plan's cost. */
export function breakEvenFarmers(implied: number, costUsd: number, farmerShare = 0.05): number {
  if (costUsd <= 0) return 0;
  return Math.floor((farmerShare * implied) / costUsd);
}

/** The verdict from the break-even count: 50,000 farmers and up is a farm, 10,000 and up is thin, else skip. */
export function verdictFor(nStar: number): 'FARM' | 'THIN' | 'SKIP' {
  if (nStar >= 50000) return 'FARM';
  if (nStar >= 10000) return 'THIN';
  return 'SKIP';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function money(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, and a last step that
 * nets the plan to a verdict. The plan is derived from the protocol's own record (category, chains,
 * TVL, age) and the fitted implied value, never from a hand-written list of names.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  model: ModelConstants = MODEL,
): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const cost = farmCostUsd(capital, hold, model);
  const nStar = breakEvenFarmers(implied, cost);
  const verdict = verdictFor(nStar);
  const verdictLine =
    verdict === 'FARM'
      ? `Verdict: FARM. At a $${cost.toFixed(2)} all-in cost, a 5% farmer allocation of the ${money(implied)} expected value pays a single farmer while the farmer base stays under ${nStar.toLocaleString('en-US')} wallets.`
      : verdict === 'THIN'
        ? `Verdict: THIN. At a $${cost.toFixed(2)} all-in cost, a 5% farmer allocation of the ${money(implied)} expected value pays a single farmer only while the farmer base stays under ${nStar.toLocaleString('en-US')} wallets, so farm small and watch the dilution.`
        : `Verdict: SKIP. At a $${cost.toFixed(2)} all-in cost, a 5% farmer allocation of the ${money(implied)} expected value pays a single farmer only while the farmer base stays under ${nStar.toLocaleString('en-US')} wallets, which is too thin to farm.`;
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
    { text: verdictLine, cost: `$${cost.toFixed(2)} all-in`, time: `${hold} days` },
  ];
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: SizeFit, clock: ClockFit, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable protocol, whatever its TVL. The watchlist is a floor, never a
  // ceiling: a protocol below the floor, or one the list leaves out, is no worse a subject.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, launch, odds, growthPct, growthMult, age } = impliedValue(p, snapshot.as_of, fit, clock, model);
    const capital = capitalFor(p);
    const hold = holdDaysFor(age);
    const cost = farmCostUsd(capital, hold, model);
    const nStar = breakEvenFarmers(implied, cost);
    return { p, implied, launch, odds, growthPct, growthMult, age, capital, hold, cost, nStar, verdict: verdictFor(nStar) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      launch_value_usd: s.launch,
      token_odds: round4(s.odds),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      fit_intercept: fit.intercept,
      fit_slope: fit.slope,
      age_days: s.age,
    },
    farm: {
      capital_usd: s.capital,
      hold_days: s.hold,
      total_cost_usd: s.cost,
      break_even_farmers: s.nStar,
      verdict: s.verdict,
    },
    farm_steps: farmSteps(s.p, s.age, s.implied, model).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    launch_value_usd: row.model.launch_value_usd,
    token_odds: row.model.token_odds,
    growth_multiplier: row.model.growth_multiplier,
    farm_capital_usd: row.farm.capital_usd,
    farm_hold_days: row.farm.hold_days,
    farm_cost_usd: row.farm.total_cost_usd,
    farm_break_even_farmers: row.farm.break_even_farmers,
    farm_verdict: row.farm.verdict,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitSizeCurve(snapshot);
  const clock = fitClock(snapshot);
  const board = buildBoard(snapshot, fit, clock, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdicts: VerdictPolicy = {
    farmer_share: 0.05,
    farm_threshold: 50000,
    thin_threshold: 10000,
    farm: board.filter((r) => r.farm.verdict === 'FARM').length,
    thin: board.filter((r) => r.farm.verdict === 'THIN').length,
    skip: board.filter((r) => r.farm.verdict === 'SKIP').length,
  };
  const census: Census = {
    total: snapshot.protocols.length,
    ranked: board.length,
    live: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    excluded_pre_token: snapshot.protocols.filter((p) => isPreToken(p) && !isRankable(p)).length,
    watchlist: snapshot.watchlist.length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    size_fit: fit,
    clock_fit: clock,
    verdicts,
    census,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
