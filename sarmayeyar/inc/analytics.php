<?php
/**
 * تحلیل کمی و امتیازدهی — تمام توابع «خالص» هستند: داده می‌گیرند و داده برمی‌گردانند
 * (هیچ نوشتن فایل/شبکه‌ای اینجا انجام نمی‌شود تا تست‌پذیر بماند)
 */
if (!defined('SARMAYEYAR')) exit;

function analytics_rsi(array $closes, int $n = 14): ?float {
    if (count($closes) < $n + 1) return null;
    $gain = 0.0; $loss = 0.0;
    $start = count($closes) - $n;
    for ($i = $start; $i < count($closes); $i++) {
        if ($i - 1 < 0) continue;
        $d = $closes[$i] - $closes[$i - 1];
        if ($d >= 0) $gain += $d; else $loss -= $d;
    }
    $ag = $gain / $n; $al = $loss / $n;
    if ($al == 0.0) return 100.0;
    return 100 - 100 / (1 + $ag / $al);
}

/**
 * متریک‌های یک دارایی از سری قیمت
 * $series: [['t'=>ms,'c'=>close,'h'=>high,'l'=>low], ...] صعودی
 */
function analytics_metrics(array $asset, array $series, array $extra = []): ?array {
    if (count($series) < 25) return null;
    $scale = (float) ($asset['unitScale'] ?? 1.0);
    if ($scale <= 0) $scale = 1.0;
    $closes = [];
    foreach ($series as $s) {
        $c = $s['c'] ?? null;
        if ($c !== null && is_finite((float) $c) && $c > 0) $closes[] = (float) $c * $scale;
    }
    $n = count($closes);
    if ($n < 25) return null;

    $at = fn(int $back) => ($n - 1 - $back >= 0) ? $closes[$n - 1 - $back] : null;
    $last = $closes[$n - 1];

    $m = [
        'r1w' => null, 'r1m' => null, 'r3m' => null, 'r6m' => null, 'r1y' => null, 'ytd' => null,
        'vol30' => null, 'vol252' => null, 'vol30d_pct' => null,
        'ma50' => null, 'ma200' => null, 'distMA50' => null, 'distMA200' => null, 'ma50v200' => null,
        'dd52' => null, 'maxDD1y' => null, 'z1m' => null, 'rsi14' => null, 'sharpe1y' => null,
        'hi52' => null, 'lo52' => null, 'range52pos' => null, 'last' => $last,
    ];

    foreach (['r1w' => 5, 'r1m' => 21, 'r3m' => 63, 'r6m' => 126, 'r1y' => 252] as $k => $back) {
        $p0 = $at((int) $back);
        $m[$k] = $p0 ? ($last / $p0 - 1) : null;
    }

    // بازده از ابتدای سال میلادی
    $lastT = (int) end($series)['t'];
    $year = (int) gmdate('Y', (int) floor($lastT / 1000));
    foreach ($series as $s) {
        if ((int) gmdate('Y', (int) floor($s['t'] / 1000)) === $year && $s['c'] > 0) { $m['ytd'] = $last / $s['c'] - 1; break; }
    }

    // نوسان
    $rets = [];
    for ($i = 1; $i < $n; $i++) $rets[] = $closes[$i] / $closes[$i - 1] - 1;
    $v30 = u_stdev(array_slice($rets, -30));
    $v252 = u_stdev(array_slice($rets, -252));
    $m['vol30'] = $v30 * sqrt(252);
    $m['vol252'] = $v252 * sqrt(252);
    $m['vol30d_pct'] = $v30;

    $m['ma50'] = u_sma($closes, 50);
    $m['ma200'] = u_sma($closes, 200);
    if ($m['ma50']) $m['distMA50'] = $last / $m['ma50'] - 1;
    if ($m['ma200']) $m['distMA200'] = $last / $m['ma200'] - 1;
    if ($m['ma50'] && $m['ma200']) $m['ma50v200'] = $m['ma50'] / $m['ma200'] - 1;

    // سقف/کف ۵۲ هفته و حداکثر افت
    $win = array_slice($closes, -252);
    $m['hi52'] = max($win);
    $m['lo52'] = min($win);
    $m['dd52'] = $m['hi52'] ? $last / $m['hi52'] - 1 : null;
    $m['range52pos'] = ($m['hi52'] > $m['lo52']) ? ($last - $m['lo52']) / ($m['hi52'] - $m['lo52']) : 0.5;
    $peak = -INF; $mdd = 0.0;
    foreach ($win as $w) {
        if ($w > $peak) $peak = $w;
        $d = $w / $peak - 1;
        if ($d < $mdd) $mdd = $d;
    }
    $m['maxDD1y'] = $mdd;

    // z-score بازده یک‌ماهه نسبت به توزیع خودش
    if ($n > 81) {
        $roll = [];
        for ($i = max(21, $n - 252); $i < $n; $i++) $roll[] = $closes[$i] / $closes[$i - 21] - 1;
        $sd = u_stdev($roll);
        if ($sd > 0) $m['z1m'] = (($m['r1m'] ?? 0) - u_mean($roll)) / $sd;
    }

    $m['rsi14'] = analytics_rsi($closes, 14);
    if ($m['r1y'] !== null && $v252 > 0) $m['sharpe1y'] = (u_mean(array_slice($rets, -252)) / $v252) * sqrt(252);

    if (isset($extra['cg']) && is_array($extra['cg'])) {
        $cg = $extra['cg'];
        $m['marketCap'] = $cg['market_cap'] ?? null;
        $m['cg7d'] = $cg['price_change_percentage_7d_in_currency'] ?? null;
        $m['cg30d'] = $cg['price_change_percentage_30d_in_currency'] ?? null;
        $m['athChange'] = $cg['ath_change_percentage'] ?? null;
        $m['marketCapRank'] = $cg['market_cap_rank'] ?? null;
    }
    if (isset($extra['price']) && $extra['price'] !== null) $m['last'] = (float) $extra['price'] * $scale;
    if (isset($extra['changePct']) && $extra['changePct'] !== null) $m['dayChangePct'] = (float) $extra['changePct'];
    if (isset($extra['dayChangeAbs']) && $extra['dayChangeAbs'] !== null) $m['dayChangeAbs'] = (float) $extra['dayChangeAbs'] * $scale;
    if (isset($extra['ts'])) $m['ts'] = $extra['ts'];

    return $m;
}

/**
 * امتیازدهی گروهی: عقب‌ماندگی، فرصت، ریسک
 * $usdMetricsById فقط برای دارایی‌های ایران (سنجش بازده واقعی نسبت به دلار)
 */
function analytics_score_universe(array $metricsById, array $assetsById, array $usdMetricsById = []): array {
    $avgs = []; $avgsUsd = [];
    foreach ($metricsById as $id => $m) {
        $cls = $assetsById[$id]['cls'] ?? 'other';
        $avgs[$cls] ??= ['r1m' => [], 'r3m' => [], 'r1y' => [], 'vol' => [], 'dd' => []];
        if ($m['r1m'] !== null) $avgs[$cls]['r1m'][] = $m['r1m'];
        if ($m['r3m'] !== null) $avgs[$cls]['r3m'][] = $m['r3m'];
        if ($m['r1y'] !== null) $avgs[$cls]['r1y'][] = $m['r1y'];
        if ($m['vol252'] !== null) $avgs[$cls]['vol'][] = $m['vol252'];
        if ($m['dd52'] !== null) $avgs[$cls]['dd'][] = $m['dd52'];
        $mu = $usdMetricsById[$id] ?? null;
        if ($mu) {
            $avgsUsd[$cls] ??= ['r1m' => [], 'r3m' => []];
            if ($mu['r1m'] !== null) $avgsUsd[$cls]['r1m'][] = $mu['r1m'];
            if ($mu['r3m'] !== null) $avgsUsd[$cls]['r3m'][] = $mu['r3m'];
        }
    }
    $med = []; $medUsd = [];
    foreach ($avgs as $cls => $a) {
        $med[$cls] = ['r1m' => u_median($a['r1m']), 'r3m' => u_median($a['r3m']), 'r1y' => u_median($a['r1y']),
            'vol' => u_median($a['vol']), 'dd' => u_median($a['dd'])];
    }
    foreach ($avgsUsd as $cls => $a) $medUsd[$cls] = ['r1m' => u_median($a['r1m']), 'r3m' => u_median($a['r3m'])];
    $allR1m = []; $allR3m = [];
    foreach ($avgsUsd as $a) { $allR1m = array_merge($allR1m, $a['r1m']); $allR3m = array_merge($allR3m, $a['r3m']); }
    $allUsdMed = ['r1m' => u_median($allR1m), 'r3m' => u_median($allR3m)];

    $rawList = [];
    foreach ($metricsById as $id => $m) {
        $a = $assetsById[$id] ?? null;
        if (!$a) continue;
        $q = (float) ($a['quality'] ?? 0.8);
        $clsMed = $med[$a['cls']] ?? [];

        /* --- عقب‌ماندگی بر حسب پول محلی --- */
        $rel1m = ($m['r1m'] !== null && ($clsMed['r1m'] ?? null) !== null) ? $m['r1m'] - $clsMed['r1m'] : 0.0;
        $rel3m = ($m['r3m'] !== null && ($clsMed['r3m'] ?? null) !== null) ? $m['r3m'] - $clsMed['r3m'] : 0.0;
        $cRel1m = u_clamp01(0.5 - $rel1m / 0.30);
        $cRel3m = u_clamp01(0.5 - $rel3m / 0.45);
        $cDD     = u_clamp01(-(float) ($m['dd52'] ?? 0) / 0.30);
        $cBelow  = u_clamp01(-(float) ($m['distMA200'] ?? 0) / 0.20);
        $cZ      = u_clamp01(0.5 - (float) ($m['z1m'] ?? 0) / 3);
        $lagLocal = 100 * (0.28 * $cRel1m + 0.18 * $cRel3m + 0.24 * $cDD + 0.20 * $cBelow + 0.10 * $cZ);

        /* --- عقب‌ماندگی بر حسب دلار (بازار ایران) --- */
        $lagUsd = null;
        $mu = $usdMetricsById[$id] ?? null;
        if ($mu) {
            $cm = $medUsd[$a['cls']] ?? $allUsdMed;
            $uRel1m = ($mu['r1m'] !== null && ($cm['r1m'] ?? null) !== null) ? $mu['r1m'] - $cm['r1m'] : 0.0;
            $uRel3m = ($mu['r3m'] !== null && ($cm['r3m'] ?? null) !== null) ? $mu['r3m'] - $cm['r3m'] : 0.0;
            $uDD    = u_clamp01(-(float) ($mu['dd52'] ?? 0) / 0.30);
            $uBelow = u_clamp01(-(float) ($mu['distMA200'] ?? 0) / 0.20);
            $uRel = 0.34 * u_clamp01(0.5 - $uRel1m / 0.30) + 0.26 * u_clamp01(0.5 - $uRel3m / 0.45) + 0.24 * $uDD + 0.16 * $uBelow;
            $lagUsd = 100 * $uRel;
            $m['usdR1m'] = $mu['r1m']; $m['usdR3m'] = $mu['r3m']; $m['usdR1y'] = $mu['r1y'];
            $m['usdDd52'] = $mu['dd52']; $m['usdDistMA200'] = $mu['distMA200'];
        }
        $lagScore = ($lagUsd === null) ? $lagLocal : (0.52 * $lagLocal + 0.48 * $lagUsd);

        /* --- سلامت روند و ریسک --- */
        $trend = 0.45 * u_clamp01(0.5 + (float) ($m['ma50v200'] ?? 0) / 0.12)
               + 0.55 * u_clamp01(0.5 + (float) ($m['distMA200'] ?? 0) / 0.18);
        $volShare = u_clamp01(0.5 + (((float) ($m['vol252'] ?? 0.3)) - (float) ($clsMed['vol'] ?? ($m['vol252'] ?? 0.3))) / 0.5);
        $riskLevel = $volShare > 0.66 ? 'high' : ($volShare > 0.36 ? 'med' : 'low');
        $riskPenalty = u_clamp01(1 - (0.55 * $volShare + 0.45 * u_clamp01(-(float) ($m['maxDD1y'] ?? 0) / 0.5))) * 0.6 + 0.4;
        $meanRev = u_clamp01(-((float) ($m['dd52'] ?? 0)) / 0.45) * 0.6 + u_clamp01(0.5 - (float) ($m['z1m'] ?? 0) / 3) * 0.4;

        $raw = 0.40 * ($lagScore / 100) + 0.26 * $trend + 0.20 * $meanRev * $riskPenalty + 0.14 * $riskPenalty;

        $m['rel1m'] = $rel1m; $m['rel3m'] = $rel3m;
        $m['lagScore'] = (int) round(u_clamp01($lagScore / 100) * 100);
        $m['lagLocal'] = (int) round(u_clamp01($lagLocal / 100) * 100);
        $m['lagUsd'] = $lagUsd === null ? null : (int) round(u_clamp01($lagUsd / 100) * 100);
        $m['trendScore'] = (int) round($trend * 100);
        $m['riskLevel'] = $riskLevel;
        $m['riskPenalty'] = (int) round($riskPenalty * 100);
        $m['quality'] = $q;
        $m['rawScore'] = $raw;
        $m['breakdown'] = [
            'relative' => (int) round(100 * (0.28 * $cRel1m + 0.18 * $cRel3m) / 0.46),
            'drawdown' => (int) round(100 * $cDD),
            'belowTrend' => (int) round(100 * $cBelow),
            'momentumZ' => (int) round(100 * $cZ),
            'trend' => (int) round($trend * 100),
            'risk' => (int) round($riskPenalty * 100),
        ];
        $metricsById[$id] = $m;
        $rawList[] = [$id, $raw];
    }

    /* --- کالیبراسیون نهایی امتیاز فرصت (ترکیب امتیاز مطلق و رتبه‌ی درصدی) --- */
    $sorted = array_map(fn($x) => $x[1], $rawList);
    sort($sorted, SORT_NUMERIC);
    $n = max(1, count($sorted));
    foreach ($rawList as [$id, $raw]) {
        $m = $metricsById[$id];
        $a = $assetsById[$id];
        $q = (float) ($a['quality'] ?? 0.8);
        $absStretch = u_clamp01(($raw * (0.75 + 0.25 * $q) - 0.34) / 0.32);
        // رتبه درصدی (جست‌وجوی دودویی)
        $lo = 0; $hi = $n;
        while ($lo < $hi) { $mid = ($lo + $hi) >> 1; if ($sorted[$mid] < $raw) $lo = $mid + 1; else $hi = $mid; }
        $pct = $n > 1 ? ($lo + 0.5) / $n : 0.5;
        $m['oppScore'] = (int) round(8 + 92 * u_clamp01(0.60 * $absStretch + 0.40 * pow($pct, 0.92)));
        $m['percentile'] = (int) round($pct * 100);

        /* --- برچسب سیگنال --- */
        $hot = (($m['z1m'] ?? 0) > 1.7) && (($m['distMA50'] ?? 0) > 0.12);
        $realLag = $m['lagUsd'] === null ? $m['lagLocal'] : max($m['lagLocal'], $m['lagUsd']);
        if ($hot)                          { $m['signal'] = 'گرمای خرید — احتیاط';            $m['tone'] = 'warn'; }
        elseif ($m['oppScore'] >= 70 && $m['riskLevel'] !== 'high')
                                           { $m['signal'] = 'فرصت قوی';                        $m['tone'] = 'buy'; }
        elseif ($m['oppScore'] >= 58)      { $m['signal'] = 'آماده رصد برای ورود';              $m['tone'] = 'watch'; }
        elseif ((($m['dd52'] ?? 0) < -0.45) && (($m['distMA200'] ?? 0) < -0.1))
                                           { $m['signal'] = 'پرریسک — در انتظار تأیید';         $m['tone'] = 'risk'; }
        elseif ($realLag >= 55)            { $m['signal'] = 'عقب‌مانده — نیازمند کاتالیزور';    $m['tone'] = 'watch'; }
        else                               { $m['signal'] = 'خنثی';                             $m['tone'] = 'neutral'; }
        $metricsById[$id] = $m;
    }

    return ['metrics' => $metricsById, 'classMedians' => $med, 'classMediansUsd' => $medUsd];
}

/** سطوح ورود/حد ضرر/هدف از نوسان + فاصله تا سقف (شامل سقف دلاری بازار ایران) */
function analytics_trade_levels(array $m): array {
    $s = max((float) ($m['vol30d_pct'] ?? 0.02), 0.006);
    $last = (float) $m['last'];
    $gapLocal = max(0.0, -(float) ($m['dd52'] ?? 0));
    $gapUsd = max(0.0, -(float) ($m['usdDd52'] ?? 0));
    $gap = max($gapLocal, $gapUsd * 0.55);
    $lv = [
        // ناحیه ورود = پولبک به زیر قیمت فعلی (ورود پله‌ای)
        'entryLow' => $last * (1 - max(1.8 * $s, 0.025)),
        'entryHigh' => $last * (1 - min(0.25 * $s, 0.006)),
        'stop' => $last * (1 - max(2.6 * $s, 0.06)),
        'target1' => $last * (1 + max(2.6 * $s, 0.035, $gap * 0.35)),
        'target2' => $last * (1 + max(5.0 * $s, 0.075, $gap * 0.65)),
        'gapToHigh' => $gap,
        'sigmaDaily' => $s,
    ];
    $lv['rr']  = ($lv['entryHigh'] > $lv['stop']) ? ($lv['target1'] - $lv['entryHigh']) / ($lv['entryHigh'] - $lv['stop']) : null;
    $lv['rr2'] = ($lv['entryHigh'] > $lv['stop']) ? ($lv['target2'] - $lv['entryHigh']) / ($lv['entryHigh'] - $lv['stop']) : null;
    return $lv;
}
