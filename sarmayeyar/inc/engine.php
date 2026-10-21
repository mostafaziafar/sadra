<?php
/**
 * موتور قوانین (فانکشنال): ارزش‌گذاری پرتفوی، مدل تخصیص، شکاف‌ها، سیگنال‌ها، نبض بازار
 */
if (!defined('SARMAYEYAR')) exit;

/* مدل‌های هدف بر اساس ریسک‌پذیری (درصد) */
function engine_target_models(): array {
    return [
        'conservative' => ['cash' => 18, 'fixedInc' => 32, 'gold' => 20, 'fx' => 10, 'iranEq' => 5, 'globalEq' => 5, 'crypto' => 3, 'fund' => 7],
        'balanced'     => ['cash' => 10, 'fixedInc' => 20, 'gold' => 18, 'fx' => 12, 'iranEq' => 13, 'globalEq' => 13, 'crypto' => 8, 'fund' => 6],
        'aggressive'   => ['cash' => 5,  'fixedInc' => 10, 'gold' => 14, 'fx' => 10, 'iranEq' => 20, 'globalEq' => 20, 'crypto' => 17, 'fund' => 4],
    ];
}

/** کلاس‌های «دارایی پایه» که از مدل تخصیص سرمایه بیرون می‌مانند */
function engine_anchor_classes(): array { return ['realEstate']; }

function engine_target_weights(string $risk, string $horizon): array {
    $models = engine_target_models();
    $base = $models[$risk] ?? $models['balanced'];
    $shift = function (array &$w, array $from, array $to, float $pts) {
        foreach ($from as $k) $w[$k] = max(0, ($w[$k] ?? 0) - $pts / count($from));
        foreach ($to as $k) $w[$k] = ($w[$k] ?? 0) + $pts / count($to);
    };
    if ($horizon === 'short') { $shift($base, ['crypto', 'globalEq', 'iranEq'], ['cash', 'fixedInc'], 8); $shift($base, ['crypto'], ['gold'], 2); }
    if ($horizon === 'long')  { $base['crypto'] += 3; $base['globalEq'] += 2; $base['cash'] = max(0, $base['cash'] - 5); }
    $sum = array_sum($base) ?: 1;
    $out = [];
    foreach ($base as $k => $v) $out[$k] = round($v / $sum * 1000) / 10;
    return $out;
}

/** نرخ دلار از snapshot (تومان) */
function engine_usd_toman(): float {
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_snapshot(false);
    }
    if (is_array($snap) && !empty($snap['assets'])) {
        foreach ($snap['assets'] as $a) {
            if ($a['id'] === 'ir_usd' && !empty($a['metrics']['last'])) {
                $v = (float) $a['metrics']['last'];
                return $v > 600000 ? round($v * 0.1, 2) : $v;
            }
        }
        foreach ($snap['assets'] as $a) {
            if ($a['id'] === 'ir_usdt' && !empty($a['metrics']['last'])) {
                $v = (float) $a['metrics']['last'];
                return $v > 600000 ? round($v * 0.1, 2) : $v;
            }
        }
    }
    $a = cache_stale('a:ir_usd');
    if (is_array($a) && !empty($a['extra']['price'])) {
        $v = (float) $a['extra']['price'];
        return $v > 600000 ? round($v * 0.1, 2) : $v;
    }
    return 263800.0;
}

/** ارزش‌گذاری پرتفوی + تفکیک دارایی پایه از سبد سرمایه‌گذاری */
function engine_value_portfolio(array $s): array {
    $rate = engine_usd_toman();
    $rows = []; $total = 0.0; $anchor = 0.0; $byClass = [];
    foreach ($s['portfolio'] ?? [] as $p) {
        $amt = (float) ($p['amount'] ?? 0);
        $usd = ($p['unit'] ?? 'unit') === 'usd' ? $amt : ($rate ? $amt / $rate : 0);
        $toman = ($p['unit'] ?? 'unit') === 'usd' ? $amt * $rate : $amt;
        $total += $toman;
        if (in_array($p['cls'] ?? '', engine_anchor_classes(), true)) $anchor += $toman;
        $byClass[$p['cls'] ?? 'cash'] = ($byClass[$p['cls'] ?? 'cash'] ?? 0) + $toman;
        $rows[] = $p + ['toman' => $toman, 'usd' => $usd];
    }
    return ['rate' => $rate, 'rows' => $rows, 'totalToman' => $total, 'anchorToman' => $anchor, 'byClass' => $byClass];
}

function engine_analyze_portfolio(array $s): array {
    $pf = engine_value_portfolio($s);
    $target = engine_target_weights($s['profile']['risk'] ?? 'balanced', $s['profile']['horizon'] ?? 'mid');
    $investable = (float) ($s['profile']['investableCash'] ?? 0);
    $base = max(0.0, $pf['totalToman'] - $pf['anchorToman']) + $investable;

    $weights = [];
    foreach ($pf['byClass'] as $cls => $v) {
        if (in_array($cls, engine_anchor_classes(), true)) continue;
        $weights[$cls] = $base ? $v / $base : 0;
    }
    if ($investable) $weights['cash'] = (($pf['byClass']['cash'] ?? 0) + $investable) / $base;
    $pf['weights'] = $weights;
    $pf['baseToman'] = $base;

    $classes = universe_classes();
    $gaps = [];
    $allCls = array_unique(array_merge(array_keys($target), array_keys($weights)));
    foreach ($allCls as $cls) {
        if (in_array($cls, engine_anchor_classes(), true)) continue;
        $cur = ($weights[$cls] ?? 0) * 100;
        $tgt = (float) ($target[$cls] ?? 0);
        $gaps[] = ['cls' => $cls, 'clsFa' => $classes[$cls]['fa'] ?? $cls,
            'current' => round($cur, 1), 'target' => $tgt, 'gap' => round($tgt - $cur, 1)];
    }
    usort($gaps, fn($a, $b) => $b['gap'] <=> $a['gap']);

    $deploy = [];
    if ($investable > 0) {
        $positive = array_values(array_filter($gaps, fn($g) => $g['gap'] > 0));
        $sumGap = array_sum(array_column($positive, 'gap')) ?: 1;
        foreach ($positive as $g) {
            $amount = $investable * ($g['gap'] / $sumGap);
            if ($amount > $investable * 0.02) $deploy[] = ['cls' => $g['cls'], 'clsFa' => $g['clsFa'], 'amountToman' => (int) round($amount), 'gap' => $g['gap']];
        }
    }
    $anchors = [];
    foreach ($pf['byClass'] as $cls => $v) {
        if (in_array($cls, engine_anchor_classes(), true)) $anchors[] = ['cls' => $cls, 'clsFa' => $classes[$cls]['fa'] ?? $cls, 'toman' => $v];
    }
    return $pf + ['target' => $target, 'gaps' => $gaps, 'deploy' => $deploy, 'investable' => $investable, 'anchors' => $anchors];
}

/* -------------------------------------------------- دلایل و ریسک هر سیگنال */

function engine_reasons(array $a, array $m, ?array $gapInfo): array {
    $r = [];
    if (($m['dd52'] ?? null) !== null && $m['dd52'] < -0.05) $r[] = u_pct_fa(-$m['dd52']) . ' زیر سقف ۵۲ هفته (سقف: ' . u_num_fmt($m['hi52']) . ')';
    if (($m['distMA200'] ?? null) !== null && $m['distMA200'] < -0.03) $r[] = u_pct_fa(-$m['distMA200']) . ' پایین‌تر از میانگین ۲۰۰روزه → حاشیه امن نسبی';
    if (($m['rel1m'] ?? null) !== null && $m['rel1m'] < -0.02) $r[] = 'عملکرد یک‌ماهه ' . u_pct_fa($m['rel1m']) . ' نسبت به هم‌گروهی‌هایش (عقب‌ماندگی نسبی)';
    if (($m['rel3m'] ?? null) !== null && $m['rel3m'] < -0.03) $r[] = 'در ۳ ماه ' . u_pct_fa($m['rel3m']) . ' از هم‌گروهی‌ها عقب‌تر مانده';
    if (($m['rsi14'] ?? null) !== null && $m['rsi14'] < 42) $r[] = 'RSI ۱۴ برابر ' . round($m['rsi14']) . ' → فشار فروش/اشباع فروش نسبی';
    if (($m['z1m'] ?? null) !== null && $m['z1m'] < -1) $r[] = 'بازده یک‌ماهه ' . number_format($m['z1m'], 1) . ' انحراف‌معیار زیر میانگین تاریخی خودش (کشش بازگشتی)';
    if (($m['ma50v200'] ?? null) !== null && $m['ma50v200'] > 0.005) $r[] = 'ساختار میانگین‌ها صعودی است (MA50 بالای MA200) → روند بلندمدت حفظ شده';
    if (($m['r1y'] ?? null) !== null && $m['r1y'] > 0.15 && ($m['dd52'] ?? 0) < -0.06) $r[] = 'بازده ۱ ساله ' . u_pct_fa($m['r1y']) . '؛ افت فعلی احتمالاً اصلاح در روند صعودی است';
    if (($a['region'] ?? '') === 'iran' && isset($m['usdDd52']) && $m['usdDd52'] !== null) {
        if ($m['usdDd52'] < -0.08) $r[] = 'بر حسب دلار ' . u_pct_fa(-$m['usdDd52']) . ' زیر سقف ۵۲ هفته → بازده واقعی عقب‌تر از تورم/دلار';
        if (($m['usdR3m'] ?? null) !== null && $m['usdR3m'] < -0.03) $r[] = 'در ۳ ماه به دلار ' . u_pct_fa($m['usdR3m']) . ' (افت ارزش نسبت به دلار)';
        if (($m['usdDd52'] ?? 0) > -0.03 && ($m['dd52'] ?? 0) > -0.03) $r[] = 'در سقف تاریخی تومانی است؛ فشاری برای بازگشت قیمت وجود ندارد (مواظب خرید در سقف)';
    }
    if ($gapInfo && $gapInfo['gap'] > 2) $r[] = 'کلاس دارایی «' . $gapInfo['clsFa'] . '» در پرتفوی شما ' . $gapInfo['gap'] . ' واحد سبک‌تر از مدل هدف است';
    return array_slice($r, 0, 6);
}

function engine_risks(array $a, array $m): array {
    $r = [];
    if (($m['riskLevel'] ?? '') === 'high') $r[] = 'نوسان بالا (' . u_pct_fa($m['vol252'] ?? null) . ' سالانه) — حجم پله‌ای و کوچک';
    if (($m['maxDD1y'] ?? 0) < -0.35) $r[] = 'حداکثر افت ۱ ساله گذشته ' . u_pct_fa(-$m['maxDD1y']) . ' بوده است';
    if (($m['quality'] ?? 1) < 0.8) $r[] = 'نقدشوندگی/عمق بازار پایین‌تر از حد مطلوب — اسپرد و ریسک اجرا';
    if (($a['region'] ?? '') === 'iran') $r[] = 'ریسک سیاستی/نرخ‌گذاری دستوری و شوک‌های خبری در بازار ایران';
    if (($a['cls'] ?? '') === 'crypto') $r[] = 'همبستگی بالا با بیت‌کوین و حساسیت به مقررات/پلتفرم‌های معاملاتی';
    if (($a['cls'] ?? '') === 'fx') $r[] = 'ارز = شرط‌بندی روی نرخ؛ ریسک مداخله بانک مرکزی';
    if (($m['distMA200'] ?? null) !== null && $m['distMA200'] < -0.15) $r[] = 'روند بلندمدت هنوز نزولی است؛ ورود قبل از تأیید روند پرخطر است';
    $r[] = 'این تحلیل جایگزین مشاوره سرمایه‌گذاری رسمی نیست.';
    return array_slice($r, 0, 4);
}

/* ------------------------------------------------------------ سیگنال‌ها */

function engine_generate_signals(array $s, ?int $count = null): array {
    $count = max(60, $count ?? (int) ($s['settings']['signalCount'] ?? 60));
    $pf = engine_analyze_portfolio($s);
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_snapshot(false);
    }
    $assets = is_array($snap) ? $snap['assets'] : [];
    if (!$assets) return ['signals' => [], 'portfolio' => $pf, 'marketPulse' => engine_market_pulse($s), 'generatedAt' => u_now_ms(), 'engine' => 'rules-php'];

    $candidates = [];
    foreach ($assets as $a) {
        if (!empty($a['noTrade'])) continue;
        $m = $a['metrics'];
        if ($m['last'] === null) continue;
        $gap = null;
        foreach ($pf['gaps'] as $g) if ($g['cls'] === $a['cls']) $gap = $g;
        $gapBonus = $gap ? max(-8, min(12, $gap['gap'] * 1.1)) : 0;
        $fit = (int) max(0, min(100, round($m['oppScore'] + $gapBonus)));
        $candidates[] = ['a' => $a, 'm' => $m, 'fit' => $fit, 'gap' => $gap];
    }
    usort($candidates, fn($x, $y) => $y['fit'] <=> $x['fit']);

    $picked = array_slice($candidates, 0, $count);

    // درصد تخصیص → نرمال‌سازی به سقف ۱۰۰٪ نقد
    $rawPcts = [];
    foreach ($picked as $c) {
        $basePct = max(3, min(18, (int) round(($c['m']['oppScore'] / 100) * 14)));
        $mult = ($c['gap'] && $c['gap']['gap'] > 3) ? 1.3 : (($c['gap'] && $c['gap']['gap'] < -3) ? 0.55 : 1);
        $rawPcts[] = max(2, $basePct * $mult);
    }
    $sumPct = array_sum($rawPcts) ?: 1;
    $scale = $sumPct > 100 ? 100 / $sumPct : 1;

    $signals = [];
    $rank = 1;
    foreach ($picked as $i => $c) {
        $a = $c['a']; $m = $c['m']; $gap = $c['gap'];
        $lv = $m['levels'] ?? analytics_trade_levels($m);
        $pct = round($rawPcts[$i] * $scale, 1);
        $signals[] = [
            'id' => 'sig_' . $a['id'], 'rank' => $rank++, 'assetId' => $a['id'],
            'name' => $a['name'], 'cls' => $a['cls'], 'clsFa' => $a['clsFa'],
            'subCat' => $a['subCat'] ?? '',
            'region' => $a['region'], 'unit' => $a['unit'],
            'price' => $m['last'], 'dayChangePct' => $m['dayChangePct'] ?? null,
            'signal' => $m['signal'], 'tone' => $m['tone'],
            'confidence' => (int) max(35, min(92, round($c['fit'] * 0.85 + $m['trendScore'] * 0.15))),
            'oppScore' => $m['oppScore'], 'lagScore' => $m['lagScore'], 'riskLevel' => $m['riskLevel'],
            'fitScore' => $c['fit'], 'suggestedPct' => $pct,
            'suggestedAmountToman' => $pf['investable'] ? (int) round($pf['investable'] * $pct / 100) : 0,
            'horizonFa' => $m['riskLevel'] === 'high' ? 'کوتاه‌مدت — پله‌ای' : ((($m['ma50v200'] ?? 0) > 0) ? 'میان‌مدت' : 'بلندمدت'),
            'levels' => ['entryLow' => $lv['entryLow'], 'entryHigh' => $lv['entryHigh'], 'stop' => $lv['stop'],
                'target1' => $lv['target1'], 'target2' => $lv['target2'], 'rr' => $lv['rr'], 'rr2' => $lv['rr2']],
            'metrics' => [
                'r1w' => $m['r1w'], 'r1m' => $m['r1m'], 'r3m' => $m['r3m'], 'r6m' => $m['r6m'], 'r1y' => $m['r1y'],
                'vol252' => $m['vol252'], 'dd52' => $m['dd52'], 'distMA200' => $m['distMA200'], 'rsi14' => $m['rsi14'],
                'rel1m' => $m['rel1m'], 'rel3m' => $m['rel3m'], 'z1m' => $m['z1m'], 'hi52' => $m['hi52'], 'lo52' => $m['lo52'],
                'range52pos' => $m['range52pos'], 'sharpe1y' => $m['sharpe1y'], 'breakdown' => $m['breakdown'] ?? null,
                'marketCap' => $m['marketCap'] ?? null, 'lagLocal' => $m['lagLocal'], 'lagUsd' => $m['lagUsd'],
                'percentile' => $m['percentile'],
            ],
            'usd' => (($a['region'] === 'iran') && isset($m['usdR1m'])) ? [
                'r1m' => $m['usdR1m'], 'r3m' => $m['usdR3m'], 'r1y' => $m['usdR1y'],
                'dd52' => $m['usdDd52'], 'lag' => $m['lagUsd'],
            ] : null,
            'reasons' => engine_reasons($a, $m, $gap),
            'risks' => engine_risks($a, $m),
            'sparkline' => $a['sparkline'] ?? [],
            'portfolioGap' => $gap ? ['current' => $gap['current'], 'target' => $gap['target'], 'gap' => $gap['gap']] : null,
        ];
    }
    return ['signals' => $signals, 'portfolio' => $pf, 'marketPulse' => engine_market_pulse($s),
        'generatedAt' => u_now_ms(), 'engine' => 'rules-php'];
}

/** نبض بازار: وضعیت گروه‌ها، عرضه/تقاضا، VIX */
function engine_market_pulse(array $s): ?array {
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_snapshot(false);
    }
    $assets = is_array($snap) ? $snap['assets'] : [];
    if (!$assets) return null;
    $byCls = []; $above = 0; $total = 0;
    foreach ($assets as $a) {
        $m = $a['metrics'];
        if ($m['distMA200'] !== null) { $total++; if ($m['distMA200'] > 0) $above++; }
        $b = $byCls[$a['cls']] ?? ['cls' => $a['cls'], 'clsFa' => $a['clsFa'], 'r1m' => [], 'r3m' => [], 'dd' => [], 'lag' => [], 'n' => 0, 'above' => 0];
        if ($m['r1m'] !== null) $b['r1m'][] = $m['r1m'];
        if ($m['r3m'] !== null) $b['r3m'][] = $m['r3m'];
        if ($m['dd52'] !== null) $b['dd'][] = $m['dd52'];
        $b['lag'][] = $m['lagScore'];
        if ($m['distMA200'] !== null && $m['distMA200'] > 0) $b['above']++;
        $b['n']++;
        $byCls[$a['cls']] = $b;
    }
    $classes = [];
    foreach ($byCls as $b) {
        $classes[] = ['cls' => $b['cls'], 'clsFa' => $b['clsFa'], 'n' => $b['n'],
            'r1m' => $b['r1m'] ? u_mean($b['r1m']) : null, 'r3m' => $b['r3m'] ? u_mean($b['r3m']) : null,
            'dd' => $b['dd'] ? u_mean($b['dd']) : null, 'lag' => $b['lag'] ? u_mean($b['lag']) : null,
            'breadth' => $b['n'] ? $b['above'] / $b['n'] : 0];
    }
    usort($classes, fn($x, $y) => ($y['lag'] ?? 0) <=> ($x['lag'] ?? 0));

    $vix = null; $r1ms = [];
    foreach ($assets as $a) {
        if ($a['id'] === 'g_vix') $vix = $a['metrics']['last'];
        if ($a['metrics']['r1m'] !== null) $r1ms[] = $a['metrics']['r1m'];
    }
    $top = [];
    foreach (array_slice($assets, 0, 6) as $a) {
        $top[] = ['id' => $a['id'], 'name' => $a['name'], 'oppScore' => $a['metrics']['oppScore'],
            'tone' => $a['metrics']['tone'], 'signal' => $a['metrics']['signal']];
    }
    return ['breadth' => $total ? $above / $total : 0, 'avg1m' => $r1ms ? u_mean($r1ms) : null, 'vix' => $vix,
        'classes' => $classes, 'topOps' => $top, 'updatedAt' => $snap['updatedAt'] ?? null];
}
