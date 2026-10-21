<?php
/**
 * مدیر داده بازار (فانکشنال)
 *  - warm: دریافت تدریجی و کش‌شده‌ی دارایی‌ها در چند «پاس»
 *  - finalize: متریک‌ها، امتیازها، تحلیل دلاری بازار ایران، ساخت snapshot
 * همه‌ی توابع با کش روی دیسک کار می‌کنند تا روی هاست اشتراکی هم بدون cron دوام بیاورند.
 */
if (!defined('SARMAYEYAR')) exit;

const MARKET_TTL          = 1200000;  // ۲۰ دقیقه: عمر قابل قبول snapshot
const ASSET_CACHE_TTL     = 3600000;  // ۱ ساعت: عمر کش هر دارایی (سری روزانه)
const SNAPSHOT_VERSION    = 'v1';

function market_assets_dir(): string {
    return defined('PUBLIC_DIR') ? PUBLIC_DIR . '/assets' : dirname(__DIR__) . '/assets';
}
function market_data_dir(): string {
    return defined('DATA_DIR') ? DATA_DIR : dirname(__DIR__) . '/data';
}

function market_assets_index(): array {
    static $idx = null;
    if ($idx !== null) return $idx;
    $idx = [];
    foreach (universe_assets() as $a) $idx[$a['id']] = $a;
    return $idx;
}

/* --------------------------------------------------- دریافت یک دارایی */

/** خواندن بخشی از سری زمانی از فایل سبک (بدون درخواست شبکه) */
function market_series_from_file(string $id): array {
    $f = market_assets_dir() . '/' . $id . '.csv';
    if (!is_file($f)) return [];
    $rows = @file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$rows) return [];
    $head = str_getcsv(array_shift($rows));
    $ti = array_search('t', $head, true); $ci = array_search('c', $head, true);
    $hi = array_search('h', $head, true); $li = array_search('l', $head, true);
    if ($ti === false || $ci === false) return [];
    $out = [];
    foreach ($rows as $line) {
        $c = str_getcsv($line);
        if (!isset($c[$ti], $c[$ci])) continue;
        $out[] = ['t' => (int) $c[$ti], 'c' => (float) $c[$ci],
            'h' => isset($c[$hi]) ? (float) $c[$hi] : (float) $c[$ci],
            'l' => isset($c[$li]) ? (float) $c[$li] : (float) $c[$ci]];
    }
    return $out;
}

function market_load_one(array $asset, bool $force = false): array {
    $id = $asset['id'];
    $key = 'a:' . $id;
    if (!$force) {
        $c = cache_get($key, ASSET_CACHE_TTL);
        if (is_array($c) && !empty($c['series'])) return $c;
    }
    $res = ['ok' => false, 'series' => [], 'extra' => [], 'type' => $asset['src']['type'], 'at' => u_now_ms()];

    if ($asset['src']['type'] === 'tgju') {
        $res['series'] = tgju_history($asset['src']['symbol'], 430, $force);
        $snap = tgju_snapshot($force);
        $s = $snap[$asset['src']['symbol']] ?? null;
        if ($s && $s['price'] !== null) {
            $res['extra'] = ['price' => $s['price'], 'changePct' => $s['changePct'], 'dayChangeAbs' => $s['change'], 'ts' => $s['ts']];
        }
    } else {
        // اگر فایل سری زمانی موجود باشد، اول از آن می‌خوانیم (سریع، بدون شبکه)
        $fileSeries = market_series_from_file($id);
        if (count($fileSeries) > 60) {
            $res['series'] = $fileSeries;
            $prev = $fileSeries[count($fileSeries) - 2]['c'] ?? null;
            $last = end($fileSeries)['c'];
            $res['extra'] = ['price' => $last, 'changePct' => $prev ? ($last / $prev - 1) * 100 : null];
        } else {
            $y = yahoo_chart($asset['src']['symbol'], '2y', $force);
            if ($y) {
                $res['series'] = $y['series'];
                $prev = $y['prevClose'];
                $res['extra'] = ['price' => $y['price'], 'changePct' => $prev ? ($y['price'] / $prev - 1) * 100 : null, 'marketTime' => $y['marketTime']];
                $res['quote'] = ['price' => $y['price'], 'prevClose' => $y['prevClose'], 'currency' => $y['currency'], 'exchange' => $y['exchange'], 'marketTime' => $y['marketTime']];
            }
        }
    }

    if (!$res['series']) {
        $stale = cache_stale($key);
        return is_array($stale) ? $stale : $res;
    }
    $res['ok'] = true;
    cache_set($key, $res);
    return $res;
}

/* --------------------------------------------------- پاس‌های گرم‌کردن */

/**
 * دریافت یک «پاس» از دارایی‌ها — به‌صورت موازی (curl_multi) تا روی هاست واقعی سریع باشد.
 * دارایی‌های کش‌شده و معتبر رد می‌شوند؛ فقط داده‌های تازه/منقضی درخواست می‌شوند.
 */
function market_process_batch(int $batch, int $offset, bool $force = false): array {
    $assets = array_slice(universe_assets(), $offset, $batch);
    if (!$assets) return ['ok' => 0, 'fail' => 0, 'processed' => 0];

    $requests = [];     // key => درخواست
    $plan = [];         // id => ['type'=>.., 'req'=>key, 'asset'=>..]
    $ok = 0; $fail = 0;
    $tgjuSnap = null;

    foreach ($assets as $a) {
        $key = 'a:' . $a['id'];
        $cached = $force ? null : cache_get($key, ASSET_CACHE_TTL);
        if (is_array($cached) && !empty($cached['series'])) { $ok++; continue; }

        if ($a['src']['type'] === 'tgju') {
            if ($tgjuSnap === null) {
                $tgjuSnap = (!$force && cache_get('tgju:snapshot', TGJU_SNAPSHOT_TTL)) ?: null;
                if ($tgjuSnap === null) {
                    $requests['tgju:snapshot'] = ['key' => 'tgju:snapshot', 'url' => 'https://call1.tgju.org/ajax.json',
                        'headers' => ['Referer: https://www.tgju.org/', 'Accept: application/json']];
                }
            }
            $rk = 'tgju:hist:' . $a['src']['symbol'];
            $requests[$rk] = ['key' => $rk,
                'url' => 'https://api.tgju.org/v1/market/indicator/summary-table-data/' . rawurlencode($a['src']['symbol']) . '?start=0&length=430',
                'headers' => ['Referer: https://www.tgju.org/', 'Accept: application/json']];
            $plan[$a['id']] = ['type' => 'tgju', 'asset' => $a, 'req' => $rk];
        } else {
            $fileSeries = market_series_from_file($a['id']);
            if (count($fileSeries) > 60) {
                $prev = $fileSeries[count($fileSeries) - 2]['c'] ?? null;
                $last = end($fileSeries)['c'];
                $entry = ['ok' => true, 'series' => $fileSeries, 'type' => 'yahoo', 'at' => u_now_ms(),
                    'extra' => ['price' => $last, 'changePct' => $prev ? ($last / $prev - 1) * 100 : null], 'fromFile' => true];
                cache_set($key, $entry);
                $ok++;
                continue;
            }
            $rk = 'yf:' . $a['src']['symbol'];
            $requests[$rk] = ['key' => $rk, 'url' => yahoo_url('https://query2.finance.yahoo.com', $a['src']['symbol'], '2y'),
                'headers' => ['Accept: application/json']];
            $plan[$a['id']] = ['type' => 'yahoo', 'asset' => $a, 'req' => $rk];
        }
    }

    if ($requests) {
        $results = http_request_many(array_values($requests), 8, 20);

        // اسنپ‌شات TGJU (اگر دریافت شد)
        if (isset($results['tgju:snapshot'])) {
            $j = http_json_decode($results['tgju:snapshot']['body'] ?? '');
            if ($j && !empty($j['current'])) {
                $out = [];
                foreach ($j['current'] as $k => $v) {
                    $out[$k] = ['symbol' => $k, 'price' => u_num($v['p'] ?? null), 'low' => u_num($v['l'] ?? null),
                        'high' => u_num($v['h'] ?? null), 'change' => u_num($v['d'] ?? null),
                        'changePct' => u_num($v['dp'] ?? null), 'ts' => $v['ts'] ?? ''];
                }
                cache_set('tgju:snapshot', $out);
                $tgjuSnap = $out;
            }
        }
        if ($tgjuSnap === null) $tgjuSnap = (array) (cache_stale('tgju:snapshot') ?: []);

        foreach ($plan as $id => $pl) {
            $res = $results[$pl['req']] ?? null;
            $a = $pl['asset'];
            if (!$res || !$res['ok']) {
                // تلاش دوباره تک‌درخواستی (خطای گذرا)
                $j = http_get_json($requests[$pl['req']]['url'], $requests[$pl['req']]['headers'], 18, 2);
                $body = $j ? '{"ok":1}' : '';
                if (!$j) { $fail++; continue; }
                $parsed = $pl['type'] === 'tgju' ? tgju_history_parse($j) : yahoo_parse($j);
            } else {
                $j = http_json_decode($res['body']);
                $parsed = $pl['type'] === 'tgju' ? tgju_history_parse($j) : yahoo_parse($j);
            }
            if ($pl['type'] === 'tgju') {
                if (!$parsed) { $fail++; continue; }
                $snapRow = $tgjuSnap[$a['src']['symbol']] ?? null;
                $extra = ($snapRow && $snapRow['price'] !== null)
                    ? ['price' => $snapRow['price'], 'changePct' => $snapRow['changePct'], 'dayChangeAbs' => $snapRow['change'], 'ts' => $snapRow['ts']]
                    : [];
                cache_set('a:' . $id, ['ok' => true, 'series' => $parsed, 'extra' => $extra, 'type' => 'tgju', 'at' => u_now_ms()]);
                cache_set('s:tgju:' . $a['src']['symbol'], $parsed);
                $ok++;
            } else {
                if (!$parsed) { $fail++; continue; }
                $prev = $parsed['prevClose'];
                $entry = ['ok' => true, 'series' => $parsed['series'], 'type' => 'yahoo', 'at' => u_now_ms(),
                    'extra' => ['price' => $parsed['price'], 'changePct' => $prev ? ($parsed['price'] / $prev - 1) * 100 : null,
                        'marketTime' => $parsed['marketTime']],
                    'quote' => ['price' => $parsed['price'], 'prevClose' => $prev, 'currency' => $parsed['currency'],
                        'exchange' => $parsed['exchange'], 'marketTime' => $parsed['marketTime']]];
                cache_set('a:' . $id, $entry);
                cache_set('s:yf:' . $a['src']['symbol'], $parsed);
                $ok++;
            }
        }
    }

    return ['ok' => $ok, 'fail' => $fail, 'processed' => count($assets)];
}

function market_warm_state(): array {
    $total = count(universe_assets());
    $p = cache_stale('warm:progress');
    if (!is_array($p)) $p = ['offset' => 0, 'done' => 0, 'total' => $total, 'status' => 'idle', 'startedAt' => null];
    $p['total'] = $total;
    return $p;
}

/** تضمین آماده بودن داده بازار (با بودجه زمانی مشخص) */
function market_ensure(int $budget_ms = 18000, bool $force = false): array {
    $t0 = microtime(true);
    $snap = cache_stale('market:snapshot');
    $age = cache_age_ms('market:snapshot');
    $total = count(universe_assets());

    if (!$force && is_array($snap) && $age !== null && $age < MARKET_TTL && !empty($snap['assets'])) {
        return [
            'status' => $snap['status'] ?? 'ready',
            'age' => $age,
            'served' => 'snapshot',
            'offset' => $total,
            'done' => count($snap['assets'] ?? []),
            'total' => $total,
            'counts' => $snap['counts'] ?? ['ok' => count($snap['assets'] ?? []), 'total' => $total]
        ];
    }

    $p = market_warm_state();
    $stale = ($age === null || $age >= MARKET_TTL);

    // اگر ریست اجباری خواسته شده یا پاس قبلی تمام شده و کش کهنه است
    if (($force && $p['status'] !== 'warming') || ($stale && $p['status'] !== 'warming')) {
        $p = ['offset' => 0, 'done' => 0, 'total' => $total, 'status' => 'warming', 'startedAt' => u_now_ms()];
        cache_set('warm:progress', $p);
    }

    $settings = store_load()['settings'] ?? [];
    $batch = (int) ($settings['warmBatch'] ?? 25);
    $batch = max(10, min(50, $batch));

    while ($p['offset'] < $total && (microtime(true) - $t0) * 1000 < $budget_ms) {
        market_process_batch($batch, $p['offset'], false);
        $p['offset'] = min($total, $p['offset'] + $batch);
        $p['done'] = $p['offset'];
        $p['status'] = ($p['offset'] >= $total) ? 'ready' : 'warming';
        cache_set('warm:progress', $p);
    }

    if ($p['offset'] >= $total || empty($snap['assets'])) {
        market_finalize($force);
        $p['status'] = 'ready';
        $p['finishedAt'] = u_now_ms();
        cache_set('warm:progress', $p);
        $snap = cache_stale('market:snapshot');
    }

    $counts = is_array($snap) ? ($snap['counts'] ?? ['ok' => count($snap['assets'] ?? []), 'total' => $total]) : ['ok' => $p['done'], 'total' => $total];
    return [
        'status' => $p['status'],
        'progress' => $p,
        'offset' => $p['offset'],
        'done' => $p['done'],
        'total' => $total,
        'counts' => $counts,
        'budget_ms' => $budget_ms
    ];
}

/* -------------------------------------------------------- نهایی‌سازی */

function market_finalize(bool $force = false): array {
    $t0 = microtime(true);
    $assets = universe_assets();
    $byId = market_assets_index();
    $metrics = []; $errors = []; $rows = []; $seriesLite = [];
    $usdMap = []; $usdMapMetrics = [];

    // بارگذاری اسنپ‌شات قبلی یا اولیه برای جلوگیری از خالی شدن داده در هاست‌های محدود
    $prevSnap = cache_stale('market:snapshot');
    if (!is_array($prevSnap) || empty($prevSnap['assets'])) {
        $prevSnap = market_seed_snapshot();
    }
    $fallbackAssetsById = [];
    if (is_array($prevSnap) && !empty($prevSnap['assets'])) {
        foreach ($prevSnap['assets'] as $pa) {
            if (!empty($pa['id'])) $fallbackAssetsById[$pa['id']] = $pa;
        }
    }

    // سری دلار برای تحلیل «دلاری» بازار ایران
    $usdRes = market_load_one($byId['ir_usd'] ?? ['id' => 'ir_usd', 'src' => ['type' => 'tgju', 'symbol' => 'price_dollar_rl']], false);
    $usdSeries = $usdRes['series'] ?? [];
    if ($usdSeries) {
        foreach ($usdSeries as $p) $usdMap[gmdate('Y-m-d', (int) floor($p['t'] / 1000))] = $p['c'];
    }

    foreach ($assets as $a) {
        $r = market_load_one($a, false);
        if (empty($r['series'])) {
            if (!isset($fallbackAssetsById[$a['id']])) $errors[] = $a['id'];
            continue;
        }
        $series = array_slice($r['series'], -420);
        $m = analytics_metrics($a, $series, $r['extra'] ?? []);
        if (!$m) {
            if (!isset($fallbackAssetsById[$a['id']])) $errors[] = $a['id'];
            continue;
        }
        $metrics[$a['id']] = $m;

        // تحلیل دلاری برای دارایی‌های ایران
        if ($a['region'] === 'iran' && $a['id'] !== 'ir_usd' && $usdMap && count($series) >= 40) {
            $ratio = [];
            foreach ($series as $p) {
                $k = gmdate('Y-m-d', (int) floor($p['t'] / 1000));
                $u = $usdMap[$k] ?? null;
                if ($u && $p['c']) $ratio[] = ['t' => $p['t'], 'c' => $p['c'] / $u, 'h' => ($p['h'] ?? $p['c']) / $u, 'l' => ($p['l'] ?? $p['c']) / $u];
            }
            if (count($ratio) >= 60) {
                $um = analytics_metrics($a, $ratio);
                if ($um) $usdMapMetrics[$a['id']] = $um;
            }
        }

        // سری سبک برای اسپارک‌لاین و فایل داده
        $sc = (float) ($a['unitScale'] ?? 1.0);
        if ($sc <= 0) $sc = 1.0;
        $closes = array_map(fn($p) => $p['c'] * $sc, array_slice($series, -90));
        $seriesLite[$a['id']] = array_map(fn($c) => round($c, 6), $closes);
    }
    $usdMetrics = $usdMapMetrics ?? [];

    // داده تکمیلی کریپتو
    $cgIds = [];
    foreach ($assets as $a) if (!empty($a['cg'])) $cgIds[] = $a['cg'];
    $cg = coin_gecko_markets($cgIds);
    foreach ($assets as $a) {
        if (!empty($a['cg']) && isset($cg[$a['cg']], $metrics[$a['id']])) {
            $c = $cg[$a['cg']];
            $metrics[$a['id']]['marketCap'] = $c['market_cap'] ?? null;
            $metrics[$a['id']]['cg7d'] = $c['price_change_percentage_7d_in_currency'] ?? null;
            $metrics[$a['id']]['cg30d'] = $c['price_change_percentage_30d_in_currency'] ?? null;
            $metrics[$a['id']]['athChange'] = $c['ath_change_percentage'] ?? null;
            $metrics[$a['id']]['marketCapRank'] = $c['market_cap_rank'] ?? null;
        }
    }

    $scored = analytics_score_universe($metrics, $byId, $usdMetrics);
    $metrics = $scored['metrics'];

    foreach ($assets as $a) {
        if (isset($metrics[$a['id']])) {
            $m = $metrics[$a['id']];
            $m['levels'] = analytics_trade_levels($m);
            $rows[] = [
                'id' => $a['id'], 'name' => $a['name'], 'cls' => $a['cls'],
                'clsFa' => universe_classes()[$a['cls']]['fa'] ?? $a['cls'],
                'region' => $a['region'], 'unit' => $a['unit'],
                'quality' => $a['quality'] ?? 0.8, 'group' => $a['group'] ?? null,
                'noTrade' => !empty($a['noTrade']),
                'sparkline' => $seriesLite[$a['id']] ?? [],
                'metrics' => $m,
            ];
        } elseif (isset($fallbackAssetsById[$a['id']])) {
            $rows[] = $fallbackAssetsById[$a['id']];
        }
    }
    usort($rows, fn($x, $y) => ($y['metrics']['oppScore'] ?? 0) <=> ($x['metrics']['oppScore'] ?? 0));

    $okCount = count($rows);
    $status = $okCount === 0 ? 'idle' : 'ready';
    $payload = [
        'version' => SNAPSHOT_VERSION,
        'status' => $status,
        'updatedAt' => u_now_ms(),
        'counts' => ['ok' => $okCount, 'fail' => 0, 'total' => count($assets)],
        'errors' => [],
        'classMedians' => $scored['classMedians'] ?: ($prevSnap['classMedians'] ?? []),
        'classMediansUsd' => $scored['classMediansUsd'] ?: ($prevSnap['classMediansUsd'] ?? []),
        'assets' => $rows,
        'durationMs' => (int) round((microtime(true) - $t0) * 1000),
    ];
    cache_set('market:snapshot', $payload);

    // خروجی JSON سبک برای مصرف خارجی/برنامه‌نویسی
    $lite = [];
    foreach ($rows as $r) {
        $lite[] = [
            'id' => $r['id'], 'name' => $r['name'], 'cls' => $r['cls'], 'region' => $r['region'], 'unit' => $r['unit'],
            'price' => $r['metrics']['last'], 'dayChangePct' => $r['metrics']['dayChangePct'] ?? null,
            'r1m' => $r['metrics']['r1m'], 'r3m' => $r['metrics']['r3m'], 'r1y' => $r['metrics']['r1y'],
            'dd52' => $r['metrics']['dd52'], 'lagScore' => $r['metrics']['lagScore'], 'oppScore' => $r['metrics']['oppScore'],
            'signal' => $r['metrics']['signal'], 'risk' => $r['metrics']['riskLevel'],
            'usd' => isset($r['metrics']['usdR3m']) ? ['r1m' => $r['metrics']['usdR1m'], 'r3m' => $r['metrics']['usdR3m'], 'dd52' => $r['metrics']['usdDd52']] : null,
        ];
    }
    store_write_atomic(market_data_dir() . '/market.json', u_json(['updatedAt' => $payload['updatedAt'], 'status' => $status, 'assets' => $lite], JSON_PRETTY_PRINT));

    return $payload;
}

/* ------------------------------------------------------------ خواندن */

function market_seed_snapshot(): ?array {
    $demoFile = defined('BASE_DIR') ? BASE_DIR . '/preview/demo-data.json' : dirname(__DIR__) . '/preview/demo-data.json';
    if (is_file($demoFile)) {
        $j = json_decode((string) @file_get_contents($demoFile), true);
        if ($j && !empty($j['/api/market']['body']['assets'])) {
            $snap = $j['/api/market']['body'];
            $snap['updatedAt'] = u_now_ms();
            cache_set('market:snapshot', $snap);
            return $snap;
        }
    }
    return null;
}

function market_snapshot(bool $light = true): array {
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_seed_snapshot();
    }
    if (!is_array($snap) || empty($snap['assets'])) return ['status' => 'idle', 'assets' => [], 'counts' => ['ok' => 0, 'fail' => 0, 'total' => count(universe_assets())], 'classes' => universe_classes()];
    if (!$light) { $snap['classes'] = universe_classes(); return $snap; }
    $out = $snap;
    $out['classes'] = universe_classes();
    unset($out['classMediansUsd']);
    $out['assets'] = array_map(function ($a) {
        if (!empty($a['noTrade'])) $a['sparkline'] = [];
        return $a;
    }, $snap['assets']);
    return $out;
}

function market_series_lite(string $id): ?array {
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_seed_snapshot();
    }
    if (!is_array($snap)) return null;
    foreach ($snap['assets'] as $a) if ($a['id'] === $id) return $a['sparkline'] ?? [];
    return null;
}

function market_status(): array {
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_seed_snapshot();
    }
    $p = market_warm_state();
    $total = count(universe_assets());
    $counts = is_array($snap) ? ($snap['counts'] ?? ['ok' => count($snap['assets'] ?? []), 'fail' => 0, 'total' => $total]) : ['ok' => $p['done'] ?? 0, 'fail' => 0, 'total' => $total];
    $status = is_array($snap) ? ($snap['status'] ?? 'ready') : ($p['status'] ?? 'idle');
    return [
        'snapshot' => [
            'status' => $status,
            'updatedAt' => is_array($snap) ? ($snap['updatedAt'] ?? u_now_ms()) : null,
            'counts' => $counts,
        ],
        'warm' => $p + ['age' => cache_age_ms('market:snapshot')],
        'assetsFiles' => count(glob(market_assets_dir() . '/*.csv') ?: []),
    ];
}

/* ---------------------------------------------- ساخت آرشیو CSV (نصب) */

function market_write_series_csv(string $id, array $series): void {
    $dir = market_assets_dir();
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $fh = @fopen($dir . '/' . $id . '.csv', 'w');
    if (!$fh) return;
    fputcsv($fh, ['t', 'c', 'h', 'l']);
    foreach ($series as $p) fputcsv($fh, [$p['t'], $p['c'], $p['h'] ?? $p['c'], $p['l'] ?? $p['c']]);
    fclose($fh);
}
