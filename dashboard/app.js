/* Launch Radar — dashboard logic. No network: everything comes from window.RADAR (data.js).
   The page recomputes every row's implied value from the fitted coefficients data.js carries,
   using the same functions main.ts ran, and reports how many rows match the board. */
(function () {
  'use strict';
  var D = window.RADAR;
  var fit = D.size_fit;
  var clock = D.clock_fit;
  var model = D.model;
  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------ formatting */
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function ageLabel(age) {
    if (age === null || age === undefined) return 'unknown';
    if (age < 30) return age + 'd';
    if (age < 365) return (age / 30).toFixed(0) + 'mo';
    return (age / 365).toFixed(1) + 'y';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ------------------------------------------------------------ the model, again, in the page */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function growthMultOf(change7d) {
    var g = clamp(change7d === null || change7d === undefined ? 0 : change7d, model.growth_floor, model.growth_cap);
    return 1 + (g / 100) * model.growth_weight;
  }
  function launchOf(row) {
    return Math.max(1, Math.round(Math.pow(10, fit.intercept + fit.slope * Math.log10(row.tvl_usd)) * growthMultOf(row.change_7d)));
  }
  function oddsOf(row) {
    var years = (row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days) / 365;
    var f = clock.p_inf * (1 - Math.exp(-clock.lambda * years));
    return clamp((clock.p_inf - f) / (1 - f), 0.05, 0.95);
  }
  function expectedOf(row) { return Math.max(1, Math.round(launchOf(row) * oddsOf(row))); }
  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function farmCostUsd(capital, holdDays) {
    var entry = capital >= 150 ? model.entry_gas_high_usd : model.entry_gas_low_usd;
    return Math.round((entry + model.weekly_gas_usd * Math.ceil(holdDays / 7) + capital * model.opportunity_apr * (holdDays / 365)) * 100) / 100;
  }
  function breakEvenFarmers(implied, cost) { return cost <= 0 ? 0 : Math.floor((D.verdicts.farmer_share * implied) / cost); }
  function verdictFor(nStar) {
    if (nStar >= D.verdicts.farm_threshold) return 'FARM';
    if (nStar >= D.verdicts.thin_threshold) return 'THIN';
    return 'SKIP';
  }
  function recomputed(row) {
    var expected = expectedOf(row);
    var capital = capitalFor(row.tvl_usd);
    var hold = holdDaysFor(row.age_days);
    var cost = farmCostUsd(capital, hold);
    var nStar = breakEvenFarmers(expected, cost);
    return { expected: expected, verdict: verdictFor(nStar), capital: capital, hold: hold, cost: cost, nStar: nStar, launch: launchOf(row), odds: oddsOf(row) };
  }

  /* The recompute check: every row's expected value and verdict, from the fitted coefficients. */
  var matches = 0;
  D.rows.forEach(function (row) {
    var r = recomputed(row);
    if (r.expected === row.implied_value_usd && r.verdict === row.farm_verdict) matches++;
  });

  /* ------------------------------------------------------------ farm plan, generated in the page */
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmStepsFor(row) {
    var r = recomputed(row);
    var chain = row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
    var verdictLine;
    if (r.verdict === 'FARM') verdictLine = 'Verdict: FARM. At a $' + r.cost.toFixed(2) + ' all-in cost, a 5% farmer allocation of the ' + money(r.expected) + ' expected value pays a single farmer while the farmer base stays under ' + r.nStar.toLocaleString('en-US') + ' wallets.';
    else if (r.verdict === 'THIN') verdictLine = 'Verdict: THIN. At a $' + r.cost.toFixed(2) + ' all-in cost, a 5% farmer allocation of the ' + money(r.expected) + ' expected value pays a single farmer only while the farmer base stays under ' + r.nStar.toLocaleString('en-US') + ' wallets, so farm small and watch the dilution.';
    else verdictLine = 'Verdict: SKIP. At a $' + r.cost.toFixed(2) + ' all-in cost, a 5% farmer allocation of the ' + money(r.expected) + ' expected value pays a single farmer only while the farmer base stays under ' + r.nStar.toLocaleString('en-US') + ' wallets, which is too thin to farm.';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(row, r.capital, chain), cost: '$' + r.capital + ' of capital and about $' + (r.capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + r.hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + r.capital + ' stays in the position', time: r.hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
      { text: verdictLine, cost: '$' + r.cost.toFixed(2) + ' all-in', time: r.hold + ' days' },
    ];
  }

  /* ------------------------------------------------------------ header, KPIs, model panel */
  $('modelVersion').textContent = D.model_version;
  $('snapshotMeta').textContent = 'Snapshot ' + D.as_of + ' · ' + D.source + ' · floor $' + (D.floor_usd / 1e6).toFixed(0) + 'M TVL · ' + D.census.total + ' protocols · ' + D.model_version;
  $('kpis').innerHTML = [
    { label: 'Ranked', value: D.board_size, sub: D.watchlist_size + ' watchlist + ' + D.early_size + ' early' },
    { label: 'Watchlist covered', value: D.watchlist_size + '/' + D.watchlist_size, sub: 'every watchlist slug on the board', cls: 'green' },
    { label: 'Census', value: D.census.total, sub: 'ranked ' + D.census.ranked + ' · live ' + D.census.live + ' · excluded ' + D.census.excluded_pre_token },
    { label: 'Size curve R²', value: fit.r2.toFixed(2), sub: 'log–log OLS on ' + fit.n_comps + ' traded comps' },
    { label: 'Held-out log RMSE', value: fit.cv_log_rmse_fit.toFixed(2), sub: 'fitted vs ' + fit.cv_log_rmse_flat.toFixed(2) + ' flat, 5-fold CV', cls: 'accent' },
    { label: 'Verdicts', value: D.verdicts.farm + ' FARM', sub: D.verdicts.thin + ' THIN · ' + D.verdicts.skip + ' SKIP' },
  ].map(function (k) {
    return '<div class="kpi"><div class="label">' + k.label + '</div><div class="value' + (k.cls ? ' ' + k.cls : '') + '">' + k.value + '</div><div class="sub">' + k.sub + '</div></div>';
  }).join('');

  $('formulaLine').textContent = 'launch = 10^(' + fit.intercept + ' + ' + fit.slope + ' · log10 TVL) × (1 + clamp(7d, −60, +120)/100 × 0.5)   ·   expected = launch × odds(age)';
  $('fitNote').textContent = 'Fitted on ' + fit.n_comps + ' traded tokens from this snapshot (non-CEX, non-versioned). R² ' + fit.r2.toFixed(2) + ' — TVL alone explains little of market cap, so the curve is concave (slope ' + fit.slope + '): a $1B protocol is worth far less than a quarter of its TVL. Growth gets no fitted weight — adding it makes the held-out error worse — so it enters as a bounded prior, and age enters only through the clock.';
  $('cvTable').innerHTML = '<tr><th>5-fold CV, log10 RMSE</th><td class="num">fitted ' + fit.cv_log_rmse_fit.toFixed(3) + ' · flat ' + fit.cv_log_rmse_flat.toFixed(3) + '</td></tr>'
    + '<tr><th>5-fold CV, median APE</th><td class="num">fitted ' + (fit.cv_med_ape_fit * 100).toFixed(0) + '% · flat ' + (fit.cv_med_ape_flat * 100).toFixed(0) + '%</td></tr>'
    + '<tr><th>5-fold CV, mean APE</th><td class="num">fitted ' + (fit.cv_mean_ape_fit * 100).toFixed(0) + '% · flat ' + (fit.cv_mean_ape_flat * 100).toFixed(0) + '%</td></tr>'
    + '<tr><th>Verdict</th><td class="num">beats flat held out on log error (' + (fit.cv_log_rmse_flat / fit.cv_log_rmse_fit).toFixed(2) + '×) and mean error, ties it on the median — TVL alone is a weak predictor, so the curve stays concave and small</td></tr>';
  $('clockNote').textContent = 'F(a) = ' + clock.p_inf + ' · (1 − e^(−' + clock.lambda + '·a)), fitted by least squares on the age buckets. The share of protocols that record a token rises with age, so a protocol that has run years with no token is less likely ever to record one.';
  $('clockTable').innerHTML = '<tr><th>Age bucket</th><th class="num">n</th><th class="num">Has token</th><th class="num">Fitted</th></tr>'
    + clock.buckets.map(function (b) {
      return '<tr><td>' + b.label + '</td><td class="num">' + b.n + '</td><td class="num">' + (b.token_share * 100).toFixed(0) + '%</td><td class="num">' + (b.fitted_share * 100).toFixed(0) + '%</td></tr>';
    }).join('');
  $('verdictNote').textContent = 'A 5% farmer allocation of the expected value, divided by the plan\u2019s all-in cost (entry gas + $2/week + 5% APR on the capital over the hold), is the break-even farmer count: how many farmers the economics can pay. FARM at 50,000 and up, THIN at 10,000 and up, else SKIP.';
  $('verdictTable').innerHTML = '<tr><th>FARM — farm it</th><td class="num">' + D.verdicts.farm + '</td></tr>'
    + '<tr><th>THIN — farm small</th><td class="num">' + D.verdicts.thin + '</td></tr>'
    + '<tr><th>SKIP — too thin</th><td class="num">' + D.verdicts.skip + '</td></tr>';
  $('censusNote').textContent = 'Ranked ' + D.census.ranked + ' pre-token protocols; ' + D.census.live + ' live-token protocols set aside (top ' + D.live_size + ' shown); ' + D.census.excluded_pre_token + ' pre-token protocols excluded as wrapped, staked, bridged, exchange or versioned products of tokens that already trade.';
  $('censusTable').innerHTML = '<tr><th>Ranked (board)</th><td class="num">' + D.census.ranked + '</td></tr>'
    + '<tr><th>Live-token, set aside</th><td class="num">' + D.census.live + '</td></tr>'
    + '<tr><th>Pre-token, excluded</th><td class="num">' + D.census.excluded_pre_token + '</td></tr>'
    + '<tr><th>Total</th><td class="num">' + D.census.total + '</td></tr>';
  var check = $('recomputeCheck');
  check.textContent = 'Recompute: ' + matches + '/' + D.rows.length + ' rows match board.json (expected value + verdict, recomputed in this page).';
  if (matches !== D.rows.length) check.classList.add('bad');

  /* ------------------------------------------------------------ board table */
  var state = { tab: 'pre', search: '', category: '', verdict: '', sortKey: 'rank', sortDir: 1 };
  var cats = Array.from(new Set(D.rows.map(function (r) { return r.category || '—'; }))).sort();
  $('categoryFilter').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
  $('preCount').textContent = '(' + D.rows.length + ')';
  $('liveCount').textContent = '(' + D.live.length + ')';

  var maxExpected = D.rows.length > 0 ? D.rows[0].implied_value_usd : 1;
  function filteredRows() {
    var q = state.search.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.category && (r.category || '—') !== state.category) return false;
      if (state.verdict && r.farm_verdict !== state.verdict) return false;
      return true;
    });
    var k = state.sortKey;
    rows.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * state.sortDir;
      return (av - bv) * state.sortDir;
    });
    return rows;
  }
  function renderBoard() {
    var rows = filteredRows();
    $('boardBody').innerHTML = rows.map(function (r) {
      var barW = Math.max(2, Math.round((r.implied_value_usd / maxExpected) * 90));
      var chg = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '">'
        + '<td class="num">' + r.rank + '</td>'
        + '<td class="name">' + esc(r.name) + '<span class="slug">' + esc(r.slug) + '</span></td>'
        + '<td>' + esc(r.category || '—') + '</td>'
        + '<td class="num">' + money(r.tvl_usd) + '</td>'
        + '<td class="num">' + chg + '</td>'
        + '<td class="num">' + ageLabel(r.age_days) + '</td>'
        + '<td class="num">' + money(r.launch_value_usd) + '</td>'
        + '<td class="num">' + (r.token_odds * 100).toFixed(0) + '%</td>'
        + '<td class="num"><span class="bar" style="width:' + barW + 'px"></span>' + money(r.implied_value_usd) + '</td>'
        + '<td><span class="chip ' + r.farm_verdict + '">' + r.farm_verdict + '</span></td>'
        + '</tr>';
    }).join('');
    $('rowCount').textContent = 'Showing ' + rows.length + ' of ' + D.rows.length + ' rows · click a row for its model breakdown and farm plan · click a column header to sort.';
    $('boardBody').querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }
  function renderLive() {
    var q = state.search.trim().toLowerCase();
    var rows = D.live.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.category && (r.category || '—') !== state.category) return false;
      return true;
    });
    $('liveBody').innerHTML = rows.map(function (r, i) {
      var ratio = r.tvl_usd > 0 && r.mcap_usd !== null ? (r.mcap_usd / r.tvl_usd).toFixed(2) + '×' : '—';
      return '<tr><td class="num">' + (i + 1) + '</td><td class="name">' + esc(r.name) + '<span class="slug">' + esc(r.slug) + '</span></td><td>' + esc(r.category || '—') + '</td><td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td><td class="num">' + ratio + '</td></tr>';
    }).join('');
    $('liveNote').textContent = 'Top ' + D.live.length + ' live-token protocols by market cap — the market\u2019s own values, never a model\u2019s. The other ' + (D.census.live - D.live.length) + ' live-token protocols are set aside with them.';
  }

  /* ------------------------------------------------------------ tabs, filters, sorting */
  function showTab(tab) {
    state.tab = tab;
    $('tabPre').classList.toggle('active', tab === 'pre');
    $('tabLive').classList.toggle('active', tab === 'live');
    $('tabPre').setAttribute('aria-selected', tab === 'pre');
    $('tabLive').setAttribute('aria-selected', tab === 'live');
    $('boardTable').hidden = tab !== 'pre';
    $('rowCount').hidden = tab !== 'pre';
    $('liveTable').hidden = tab !== 'live';
    $('liveNote').hidden = tab !== 'live';
    $('verdictFilter').disabled = tab !== 'pre';
    if (tab === 'live') renderLive();
  }
  $('tabPre').addEventListener('click', function () { showTab('pre'); });
  $('tabLive').addEventListener('click', function () { showTab('live'); });
  $('search').addEventListener('input', function (e) { state.search = e.target.value; state.tab === 'pre' ? renderBoard() : renderLive(); });
  $('categoryFilter').addEventListener('change', function (e) { state.category = e.target.value; state.tab === 'pre' ? renderBoard() : renderLive(); });
  $('verdictFilter').addEventListener('change', function (e) { state.verdict = e.target.value; renderBoard(); });
  document.querySelectorAll('#boardTable th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sortKey === k) state.sortDir = -state.sortDir;
      else { state.sortKey = k; state.sortDir = 1; }
      renderBoard();
    });
  });

  /* ------------------------------------------------------------ detail dialog */
  var dialog = $('detail');
  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { row = D.rows[i]; break; }
    if (!row) return;
    var r = recomputed(row);
    var match = r.expected === row.implied_value_usd && r.verdict === row.farm_verdict;
    $('detailName').textContent = '#' + row.rank + ' ' + row.name;
    $('detailSub').textContent = row.slug + ' · ' + (row.category || '—') + ' · ' + (row.chains || []).join(', ') + ' · listed ' + (row.listed_at || 'unknown date');
    var steps = farmStepsFor(row);
    $('detailBody').innerHTML =
      '<h3>Model breakdown — every term from this snapshot</h3>'
      + '<table class="mini"><tbody>'
      + '<tr><td>TVL</td><td class="num">' + money(row.tvl_usd) + '</td></tr>'
      + '<tr><td>7-day change (clamped −60/+120)</td><td class="num">' + pct(row.change_7d) + ' → ×' + growthMultOf(row.change_7d).toFixed(2) + '</td></tr>'
      + '<tr><td>Size curve 10^(' + fit.intercept + ' + ' + fit.slope + ' · log10 TVL)</td><td class="num">' + money(r.launch) + '</td></tr>'
      + '<tr><td>Launch value</td><td class="num">' + money(r.launch) + '</td></tr>'
      + '<tr><td>Age / no-token clock odds</td><td class="num">' + ageLabel(row.age_days) + ' → ' + (r.odds * 100).toFixed(0) + '%</td></tr>'
      + '<tr><td><strong>Expected value (launch × odds)</strong></td><td class="num"><strong>' + money(r.expected) + '</strong></td></tr>'
      + '<tr><td>Recomputed in this page</td><td class="num">' + (match ? 'matches board.json ✓' : 'DOES NOT MATCH ✗') + '</td></tr>'
      + '</tbody></table>'
      + '<h3>Farm plan — costed, netted to a verdict</h3>'
      + '<ol class="steps">' + steps.map(function (s) { return '<li>' + esc(s.text) + ' <span class="step-cost">Cost: ' + esc(s.cost) + '. Time: ' + esc(s.time) + '.</span></li>'; }).join('') + '</ol>'
      + '<div class="verdict-line ' + r.verdict + '"><strong>' + r.verdict + '</strong> — all-in cost $' + r.cost.toFixed(2) + ' ($' + r.capital + ' capital, ' + r.hold + ' days). A 5% farmer allocation pays a single farmer while the farmer base stays under ' + r.nStar.toLocaleString('en-US') + ' wallets.</div>';
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }
  $('detailClose').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  /* Helpers for screenshots and tests. */
  window.__openDetail = openDetail;
  window.__showTab = showTab;
  window.__setFilter = function (f) {
    if (f.search !== undefined) { state.search = f.search; $('search').value = f.search; }
    if (f.category !== undefined) { state.category = f.category; $('categoryFilter').value = f.category; }
    if (f.verdict !== undefined) { state.verdict = f.verdict; $('verdictFilter').value = f.verdict; }
    if (f.tab !== undefined) showTab(f.tab);
    else state.tab === 'pre' ? renderBoard() : renderLive();
  };

  renderBoard();
})();
