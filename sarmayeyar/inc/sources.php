<?php
/**
 * منابع داده بازار — توابع فانکشنال با کش
 *   TGJU      : بازار ایران (ارز، طلا، سکه، شاخص بورس، کریپتوی تومانی) + تاریخچه روزانه
 *   Yahoo     : بازارهای جهانی (شاخص، ETF، کالا، ارز، اوراق، کریپتو)
 *   CoinGecko : داده تکمیلی کریپتو
 *
 * نکته مهم: برای سرعت، درخواست‌ها به‌صورت موازی (curl_multi) ارسال می‌شوند؛
 * اگر curl نباشد، حالت سری پشتیبان فعال می‌شود.
 */
if (!defined('SARMAYEYAR')) exit;

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/* -------------------------------------------------- تنظیمات شبکه */
/**
 * پیکربندی شبکهٔ خروجی: پروکسی (برای هاست‌هایی که به منابع خارجی دسترسی ندارند)،
 * مهلت انتظار، و روشن/خاموش بودن هر منبع. مقادیر از جدول settings خوانده می‌شوند
 * و فقط یک بار در هر درخواست کش می‌شوند.
 */
function sy_net_config(): array {
    global $SY_NET_CFG;
    if ($SY_NET_CFG !== null) return $SY_NET_CFG;
    $cfg = ['proxy' => '', 'timeout' => 15, 'insecure' => false,
        'tgju' => true, 'yahoo' => true, 'coingecko' => true];
    if (function_exists('settings_effective') && function_exists('db_ok') && db_ok()) {
        try {
            $s = settings_effective();
            $cfg['proxy'] = trim((string) ($s['httpProxy'] ?? ''));
            $cfg['timeout'] = max(5, min(60, (int) ($s['srcTimeout'] ?? 15)));
            $cfg['insecure'] = !empty($s['srcInsecure']);
            foreach (['tgju', 'yahoo', 'coingecko'] as $k) {
                $cfg[$k] = !isset($s['src' . ucfirst($k)]) ? true : (bool) $s['src' . ucfirst($k)];
            }
        } catch (Throwable $e) { /* پیش از نصب دیتابیس: مقادیر پیش‌فرض */ }
    }
    $SY_NET_CFG = $cfg;
    return $cfg;
}
function sy_net_reset(): void {
    global $SY_NET_CFG;
    $SY_NET_CFG = null;
}

/** روشن کردن حالت نادیده‌گرفتن گواهی SSL در زمان اجرا و ذخیره در دیتابیس در صورت امکان */
function sy_net_set_insecure_runtime(bool $persist = true): void {
    global $SY_NET_CFG;
    if ($SY_NET_CFG === null) sy_net_config();
    if (is_array($SY_NET_CFG)) {
        $SY_NET_CFG['insecure'] = true;
    }
    if ($persist && function_exists('db_ok') && db_ok() && function_exists('setting_set')) {
        try {
            setting_set('srcInsecure', true);
        } catch (Throwable $e) {}
    }
}

/** تشخیص خطای مربوط به گواهی SSL / CA Bundle */
function is_ssl_errno(int $errno, string $err = ''): bool {
    if (in_array($errno, [35, 51, 58, 60, 77, 82, 83, 90], true)) return true;
    if ($err !== '' && preg_match('/(certificate|issuer|CA cert|SSL handshake|SSL certificate|unable to get local issuer|self-signed|peer failed verification)/i', $err)) return true;
    return false;
}

/** آیا این منبع روشن است؟ */
function src_enabled(string $key): bool {
    $c = sy_net_config();
    return !empty($c[$key]);
}

/** مهلت انتظار مؤثر برای درخواست‌ها */
function src_timeout(int $fallback = 15): int {
    $c = sy_net_config();
    return max(5, min(60, (int) ($c['timeout'] ?? $fallback)));
}

/** ترجمهٔ خطای cURL به پیام فارسی قابل‌فهم */
function http_error_reason(int $errno, string $err): string {
    $err = trim($err);
    $net = sy_net_config();
    $viaProxy = !empty($net['proxy']);
    $map = [
        5  => $viaProxy ? 'پروکسی پاسخ نداد — آدرس/پورت پروکسی را بررسی کنید'
                        : 'پروکسی پاسخ نداد یا آدرس پروکسی اشتباه است',
        6  => 'نام دامنه پیدا نشد (مشکل DNS روی سرور) — سرور به DNS دسترسی ندارد',
        7  => $viaProxy ? 'اتصال به سرورِ مقصد از طریق پروکسی برقرار نشد'
                        : 'اتصال برقرار نشد: فایروال هاست یا محدودیت شبکه، پورت ۴۴۳ را بسته است',
        23 => 'خطای نوشتن داده',
        28 => 'زمان انتظار تمام شد (سرور کند است یا مسیر بسته است)',
        35 => 'خطای دست‌دادن SSL/TLS — هاست شما گواهی‌های لازم را ندارد (با فعال شدن نادیده‌گرفتن SSL برطرف می‌شود)',
        47 => 'تعداد تغییر مسیرها بیش از حد شد',
        52 => 'سرور مقصد پاسخ خالی داد',
        56 => 'اتصال وسط راه قطع شد',
        60 => 'گواهی SSL سرور مقصد روی هاست تأیید نشد (با گزینهٔ «نادیده‌گرفتن بررسی SSL» برطرف می‌شود — نیازی به پروکسی ندارید)',
        77 => 'فایل گواهی‌های امنیتی روی هاست یافت نشد (با گزینهٔ «نادیده‌گرفتن بررسی SSL» برطرف می‌شود — نیازی به پروکسی ندارید)',
    ];
    if ($errno > 0 && isset($map[$errno])) return $map[$errno];
    /* ترجمهٔ پیام‌های خام و رایج cURL */
    if (stripos($err, 'Could not resolve host') !== false) return 'نام دامنه پیدا نشد (DNS سرور کار نمی‌کند)';
    if (stripos($err, 'Connection refused') !== false || stripos($err, 'Could not connect') !== false) {
        return 'اتصال برقرار نشد (فایروال/فیلترینگ هاست یا بسته بودن مسیر)';
    }
    if (stripos($err, 'timed out') !== false || stripos($err, 'Operation timed out') !== false) return 'زمان انتظار تمام شد (مسیر بسته است یا سرور کند است)';
    if (stripos($err, 'certificate') !== false || stripos($err, 'issuer') !== false || stripos($err, 'SSL') !== false) {
        return 'خطای گواهی SSL هاست (با گزینهٔ «نادیده‌گرفتن بررسی SSL» برطرف می‌شود — نیازی به پروکسی ندارید)';
    }
    if ($err !== '') return 'دسترسی برقرار نشد (' . mb_substr($err, 0, 80) . ')';
    return 'دسترسی برقرار نشد';
}

/* ---------------------------------------------------------------- HTTP */

function http_apply_opts($ch, array $req, int $timeout, ?bool $overrideInsecure = null) {
    $net = sy_net_config();
    $insecure = ($overrideInsecure !== null) ? $overrideInsecure : !empty($net['insecure']);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(8, $timeout),
        CURLOPT_ENCODING       => '',
        CURLOPT_SSL_VERIFYPEER => !$insecure,
        CURLOPT_SSL_VERIFYHOST => $insecure ? 0 : 2,
        CURLOPT_USERAGENT      => $req['user_agent'] ?? UA_DESKTOP,
        CURLOPT_HTTPHEADER     => $req['headers'] ?? [],
    ]);
    if (($req['method'] ?? 'GET') === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $req['body'] ?? '');
    }
    /* پروکسی خروجی (اختیاری) — راه‌حل هاست‌هایی که به منابع خارجی دسترسی ندارند */
    if (!empty($net['proxy'])) {
        curl_setopt($ch, CURLOPT_PROXY, $net['proxy']);
        curl_setopt($ch, CURLOPT_PROXYTYPE,
            str_starts_with(strtolower($net['proxy']), 'socks5') ? CURLPROXY_SOCKS5_HOSTNAME : CURLPROXY_HTTP);
    }
    return $ch;
}

/** ارسال موازی چند درخواست؛ خروجی: [key => ['ok'=>bool,'status'=>int,'body'=>string,'error'=>?string,'ms'=>int]] */
function http_request_many(array $requests, int $concurrency = 6, int $timeout = 15): array {
    if (!$requests) return [];
    if (!function_exists('curl_multi_init')) return http_request_many_serial($requests, $timeout);

    $results = [];
    $queue = array_values($requests);
    $handles = [];   // spl_object_id => key
    $mh = curl_multi_init();
    $running = 0;

    $add_next = function () use (&$queue, &$handles, $mh, $timeout, $concurrency) {
        while (count($handles) < $concurrency && $queue) {
            $req = array_shift($queue);
            $ch = curl_init($req['url']);
            http_apply_opts($ch, $req, $timeout);
            curl_multi_add_handle($mh, $ch);
            $handles[spl_object_id($ch)] = ['key' => $req['key'], 'ch' => $ch, 't0' => microtime(true)];
        }
    };

    $add_next();
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1.0);
        while ($info = curl_multi_info_read($mh)) {
            $ch = $info['handle'];
            $id = spl_object_id($ch);
            $meta = $handles[$id] ?? null;
            if ($meta) {
                $body = curl_multi_getcontent($ch);
                $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                $err  = curl_error($ch);
                $results[$meta['key']] = [
                    'ok' => ($info['result'] === CURLE_OK && $code >= 200 && $code < 400 && $body !== null && $body !== ''),
                    'status' => $code, 'body' => (string) $body, 'error' => $err ?: null,
                    'errno' => (int) $info['result'],
                    'ms' => (int) round((microtime(true) - $meta['t0']) * 1000),
                ];
                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
                unset($handles[$id]);
            }
        }
        $add_next();
    } while ($running || $handles || $queue);

    curl_multi_close($mh);

    /* رفع خودکار خطای گواهی SSL: اگر خطای SSL رخ داد، خودکار با insecure تکرار می‌کنیم */
    $net = sy_net_config();
    $sslFailedKeys = [];
    if (empty($net['insecure'])) {
        foreach ($results as $k => $res) {
            if (!$res['ok'] && is_ssl_errno((int)($res['errno'] ?? 0), (string)($res['error'] ?? ''))) {
                $sslFailedKeys[] = $k;
            }
        }
    }
    if ($sslFailedKeys) {
        sy_net_set_insecure_runtime();
        $retryReqs = [];
        foreach ($requests as $r) {
            if (in_array($r['key'] ?? null, $sslFailedKeys, true)) $retryReqs[] = $r;
        }
        if ($retryReqs) {
            $retried = http_request_many($retryReqs, $concurrency, $timeout);
            foreach ($retried as $rk => $rv) {
                $results[$rk] = $rv;
            }
        }
    }

    return $results;
}

function http_request_many_serial(array $requests, int $timeout = 15): array {
    $out = [];
    foreach ($requests as $key => $req) {
        $out[$req['key'] ?? $key] = http_request_one($req, $timeout);
    }
    return $out;
}

function http_request_one(array $req, int $timeout = 15): array {
    $t0 = microtime(true);
    if (function_exists('curl_init')) {
        $ch = curl_init($req['url']);
        http_apply_opts($ch, $req, $timeout);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        $errno = (int) curl_errno($ch);
        curl_close($ch);

        $net = sy_net_config();
        if (($body === false || $code === 0) && empty($net['insecure']) && is_ssl_errno($errno, (string)$err)) {
            sy_net_set_insecure_runtime();
            $ch = curl_init($req['url']);
            http_apply_opts($ch, $req, $timeout, true);
            $body = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $err = curl_error($ch);
            $errno = (int) curl_errno($ch);
            curl_close($ch);
        }

        $ok = ($body !== false && $code >= 200 && $code < 400 && $body !== '');
        return ['ok' => $ok, 'status' => $code, 'body' => (string) ($body ?: ''), 'error' => $err ?: null,
            'errno' => $errno, 'ms' => (int) round((microtime(true) - $t0) * 1000)];
    }
    /* پشتیبان: file_get_contents */
    $netF = sy_net_config();
    $insecure = !empty($netF['insecure']);
    $opts = [
        'http' => [
            'method' => $req['method'] ?? 'GET',
            'timeout' => $timeout,
            'ignore_errors' => true,
            'header' => implode("\r\n", array_merge(['User-Agent: ' . UA_DESKTOP], $req['headers'] ?? [])),
        ],
        'ssl' => [
            'verify_peer' => !$insecure,
            'verify_peer_name' => !$insecure,
            'allow_self_signed' => $insecure,
        ],
    ];
    if (!empty($netF['proxy'])) { $opts['http']['proxy'] = $netF['proxy']; $opts['http']['request_fulluri'] = true; }
    if (($req['method'] ?? 'GET') === 'POST') $opts['http']['content'] = $req['body'] ?? '';
    $body = @file_get_contents($req['url'], false, stream_context_create($opts));
    if ($body === false && !$insecure) {
        $opts['ssl'] = ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true];
        $body = @file_get_contents($req['url'], false, stream_context_create($opts));
        if ($body !== false) sy_net_set_insecure_runtime();
    }
    return ['ok' => $body !== false, 'status' => $body === false ? 0 : 200, 'body' => (string) ($body ?: ''), 'error' => $body === false ? 'stream failed' : null, 'ms' => (int) round((microtime(true) - $t0) * 1000)];
}

function http_json_decode(?string $body) {
    if ($body === null || $body === '') return null;
    $j = json_decode($body, true);
    return is_array($j) ? $j : null;
}

function http_get_json(string $url, array $headers = [], int $timeout = 15, int $retries = 2, int $sleep_ms = 500) {
    for ($i = 0; $i < max(1, $retries); $i++) {
        $r = http_request_one(['url' => $url, 'headers' => $headers], $timeout);
        if ($r['ok']) {
            $j = http_json_decode($r['body']);
            if ($j !== null) return $j;
        }
        if ($i < $retries - 1) usleep($sleep_ms * 1000 * ($i + 1));
    }
    return null;
}

function http_post_json(string $url, array $headers, array $payload, int $timeout = 120) {
    $headers[] = 'Content-Type: application/json';
    $r = http_request_one(['url' => $url, 'method' => 'POST', 'headers' => $headers, 'body' => u_json($payload)], $timeout);
    $j = http_json_decode($r['body']);
    if (!$r['ok']) {
        $msg = is_array($j) ? ($j['error']['message'] ?? $j['message'] ?? u_json($j)) : mb_substr($r['body'], 0, 300);
        return ['ok' => false, 'status' => $r['status'], 'error' => 'خطای سرویس (' . $r['status'] . '): ' . $msg, 'json' => $j];
    }
    return ['ok' => true, 'status' => $r['status'], 'json' => $j, 'error' => null];
}

/* ------------------------------------------------------------ TGJU */

const TGJU_SNAPSHOT_TTL = 240000;      // ۴ دقیقه
const TGJU_HISTORY_TTL  = 43200000;    // ۱۲ ساعت
const YAHOO_TTL         = 1800000;     // ۳۰ دقیقه (سری روزانه)

function tgju_snapshot(bool $force = false): array {
    if (!src_enabled('tgju')) return (array) (cache_stale('tgju:snapshot') ?: []);
    if (!$force) {
        $c = cache_get('tgju:snapshot', TGJU_SNAPSHOT_TTL);
        if (is_array($c)) return $c;
    }
    $j = http_get_json('https://call1.tgju.org/ajax.json',
        ['Referer: https://www.tgju.org/', 'Accept: application/json'], 20, 2);
    if (!$j || empty($j['current'])) return (array) (cache_stale('tgju:snapshot') ?: []);
    $out = [];
    foreach ($j['current'] as $k => $v) {
        $out[$k] = [
            'symbol' => $k,
            'price' => u_num($v['p'] ?? null),
            'low' => u_num($v['l'] ?? null),
            'high' => u_num($v['h'] ?? null),
            'change' => u_num($v['d'] ?? null),
            'changePct' => u_num($v['dp'] ?? null),
            'ts' => $v['ts'] ?? '',
        ];
    }
    cache_set('tgju:snapshot', $out);
    return $out;
}

/** تاریخچه روزانه TGJU → [['t'=>ms,'c'=>close,'h'=>high,'l'=>low], ...] صعودی */
function tgju_history_parse(?array $json): array {
    $rows = $json['data'] ?? [];
    $series = [];
    foreach ($rows as $r) {
        if (!is_array($r) || count($r) < 7) continue;
        $low = u_num($r[1]); $high = u_num($r[2]); $close = u_num($r[3]);
        $d = explode('/', (string) ($r[6] ?? ''));
        if ($close === null || count($d) !== 3) continue;
        $t = gmmktime(0, 0, 0, (int) $d[1], (int) $d[2], (int) $d[0]);
        if ($t === false) continue;
        $series[] = ['t' => $t * 1000, 'c' => $close, 'h' => $high ?? $close, 'l' => $low ?? $close];
    }
    usort($series, fn($a, $b) => $a['t'] <=> $b['t']);
    return $series;
}

function tgju_history(string $symbol, int $length = 430, bool $force = false): array {
    if (!src_enabled('tgju')) return (array) (cache_stale('s:tgju:' . $symbol) ?: []);
    $key = 's:tgju:' . $symbol;
    if (!$force) {
        $c = cache_get($key, TGJU_HISTORY_TTL);
        if (is_array($c) && count($c) > 20) return $c;
    }
    $j = http_get_json('https://api.tgju.org/v1/market/indicator/summary-table-data/' . rawurlencode($symbol) . '?start=0&length=' . $length,
        ['Referer: https://www.tgju.org/', 'Accept: application/json'], 25, 2);
    $series = tgju_history_parse($j);
    if (!$series) return (array) (cache_stale($key) ?: []);
    cache_set($key, $series);
    return $series;
}

/* ----------------------------------------------------------- Yahoo */

function yahoo_parse(?array $json): ?array {
    $r = $json['chart']['result'][0] ?? null;
    if (!$r || empty($r['timestamp'])) return null;
    $q = $r['indicators']['quote'][0] ?? [];
    $series = [];
    foreach ($r['timestamp'] as $i => $ts) {
        $c = $q['close'][$i] ?? null;
        if ($c === null) continue;
        $series[] = [
            't' => (int) $ts * 1000, 'c' => (float) $c,
            'h' => isset($q['high'][$i]) ? (float) $q['high'][$i] : (float) $c,
            'l' => isset($q['low'][$i]) ? (float) $q['low'][$i] : (float) $c,
            'v' => isset($q['volume'][$i]) ? $q['volume'][$i] : null,
        ];
    }
    if (!$series) return null;
    $meta = $r['meta'] ?? [];
    return [
        'series' => $series,
        'symbol' => $meta['symbol'] ?? '',
        'currency' => $meta['currency'] ?? 'USD',
        'price' => isset($meta['regularMarketPrice']) ? (float) $meta['regularMarketPrice'] : (float) end($series)['c'],
        'prevClose' => isset($meta['chartPreviousClose']) ? (float) $meta['chartPreviousClose'] : (isset($meta['previousClose']) ? (float) $meta['previousClose'] : null),
        'marketTime' => isset($meta['regularMarketTime']) ? (int) $meta['regularMarketTime'] * 1000 : null,
        'exchange' => $meta['fullExchangeName'] ?? ($meta['exchangeName'] ?? ''),
    ];
}

function yahoo_url(string $host, string $symbol, string $range = '2y', string $interval = '1d'): string {
    return $host . '/v8/finance/chart/' . rawurlencode($symbol) . '?range=' . $range . '&interval=' . $interval . '&includePrePost=false';
}

function yahoo_chart(string $symbol, string $range = '2y', bool $force = false): ?array {
    if (!src_enabled('yahoo')) { $st = cache_stale('s:yf:' . $symbol); return is_array($st) ? $st : null; }
    $key = 's:yf:' . $symbol;
    if (!$force) {
        $c = cache_get($key, YAHOO_TTL);
        if (is_array($c) && !empty($c['series'])) return $c;
    }
    $hosts = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'];
    foreach ($hosts as $host) {
        $j = http_get_json(yahoo_url($host, $symbol, $range), ['Accept: application/json'], 15, 2, 700);
        $parsed = yahoo_parse($j);
        if ($parsed) { cache_set($key, $parsed); return $parsed; }
    }
    $stale = cache_stale($key);
    return is_array($stale) ? $stale : null;
}

/* ------------------------------------------------------- CoinGecko */

const CG_TTL = 600000; // ۱۰ دقیقه

function coin_gecko_markets(array $ids): array {
    if (!src_enabled('coingecko')) return [];
    $ids = array_values(array_filter(array_unique($ids)));
    if (!$ids) return [];
    $key = 'cg:' . md5(implode(',', $ids));
    $c = cache_get($key, CG_TTL);
    if (is_array($c)) return $c;
    $url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' . implode(',', $ids)
        . '&price_change_percentage=1h,24h,7d,30d,1y&order=market_cap_desc';
    $j = http_get_json($url, ['Accept: application/json'], 20, 2);
    if (!is_array($j)) return (array) (cache_stale($key) ?: []);
    $out = [];
    foreach ($j as $coin) if (isset($coin['id'])) $out[$coin['id']] = $coin;
    cache_set($key, $out);
    return $out;
}

/* ------------------------------------------------ تشخیص منابع داده */
/**
 * عیب‌یابی منابع داده: برای هر منبع یک درخواست سبک می‌فرستد و دقیقاً می‌گوید
 * چه اتفاقی افتاد (کد HTTP، خطای cURL، مدت زمان) + راهنمای رفع.
 * خروجی: ['tests' => [...], 'ok' => bool, 'outbound' => bool]
 */
function source_probe(int $timeout = 10): array {
    $net = sy_net_config();
    $reqs = [
        'net' => ['key' => 'net', 'url' => 'https://www.cloudflare.com/cdn-cgi/trace',
            'headers' => ['Accept: text/plain']],
        'tgju' => ['key' => 'tgju', 'url' => 'https://call1.tgju.org/ajax.json',
            'headers' => ['Referer: https://www.tgju.org/', 'Accept: application/json']],
        'yahoo' => ['key' => 'yahoo', 'url' => 'https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d',
            'headers' => ['Accept: application/json']],
        'coingecko' => ['key' => 'coingecko', 'url' => 'https://api.coingecko.com/api/v3/ping',
            'headers' => ['Accept: application/json']],
    ];
    $raw = http_request_many($reqs, 4, max(6, min(20, $timeout)));

    $meta = [
        'net' => ['label' => 'اتصال کلی سرور به اینترنت', 'optional' => false,
            'hint' => 'اگر این مورد قرمز است، سرور شما خروجی اینترنت ندارد؛ با پشتیبانی هاست تماس بگیرید.'],
        'tgju' => ['label' => 'TGJU — طلا، ارز، سکه و بورس ایران', 'optional' => false,
            'hint' => 'منبع اصلی بازار ایران. اگر مسدود است، از بخش «تنظیمات شبکه» پروکسی بدهید یا موقتاً خاموشش کنید.'],
        'yahoo' => ['label' => 'Yahoo Finance — بازارهای جهانی', 'optional' => false,
            'hint' => 'هاست‌های ایرانی معمولاً به Yahoo دسترسی ندارند. یک پروکسی خروجی (HTTP/SOCKS5) وارد کنید.'],
        'coingecko' => ['label' => 'CoinGecko — دادهٔ تکمیلی کریپتو', 'optional' => true,
            'hint' => 'اختیاری است؛ اگر در دسترس نبود، کریپتو از Yahoo خوانده می‌شود و سایت کار می‌کند.'],
    ];

    $tests = [];
    foreach ($meta as $key => $m) {
        $r = $raw[$key] ?? null;
        $enabled = ($key === 'net') ? true : src_enabled($key);
        $status = (int) ($r['status'] ?? 0);
        $ok = !empty($r['ok']);
        $bodyOk = $ok;
        if ($ok && $key === 'tgju') $bodyOk = is_array(http_json_decode($r['body'])) && !empty(http_json_decode($r['body'])['current']);
        if ($ok && $key === 'yahoo') $bodyOk = is_array(http_json_decode($r['body'])) && !empty(http_json_decode($r['body'])['chart']['result']);
        if ($ok && $key === 'coingecko') $bodyOk = !empty(http_json_decode($r['body']));

        $ms = (int) ($r['ms'] ?? 0);
        if (!$enabled) {
            $reason = 'خاموش است (از تنظیمات شبکه می‌توانید روشن کنید)';
        } elseif ($bodyOk) {
            $reason = 'پاسخ درست از سرور مقصد (' . $status . ') در ' . $ms . ' میلی‌ثانیه';
        } elseif ($status === 403) {
            $reason = 'سرور مقصد دسترسی را رد کرد (HTTP 403) — IP سرور شما محدود شده است';
        } elseif ($status === 429) {
            $reason = 'سرور مقصد درخواست‌های زیاد را موقتاً بسته است (HTTP 429) — چند دقیقه بعد دوباره امتحان کنید';
        } elseif ($status >= 500) {
            $reason = 'خطای سرور مقصد (HTTP ' . $status . ')';
        } elseif ($ok && !$bodyOk) {
            $reason = 'پاسخ آمد ولی محتوایش داده نبود (احتمالاً صفحهٔ واسط/فیلتر)';
        } else {
            $reason = http_error_reason((int) ($r['errno'] ?? 0), (string) ($r['error'] ?? ''));
            if ($status > 0) $reason .= ' (HTTP ' . $status . ')';
        }
        $tests[] = [
            'key' => $key, 'label' => $m['label'], 'ok' => $enabled ? $bodyOk : false,
            'enabled' => $enabled, 'optional' => $m['optional'], 'status' => $status, 'ms' => $ms,
            'reason' => $reason, 'hint' => $m['hint'],
            'detail' => $enabled ? ($bodyOk ? ('سالم · ' . $ms . 'ms') : 'ناموفق') : 'خاموش',
        ];
    }

    $byKey = [];
    foreach ($tests as $t) $byKey[$t['key']] = $t;
    $needed = [($byKey['tgju']['ok'] ?? false), ($byKey['yahoo']['ok'] ?? false)];
    $skipped = (!src_enabled('tgju')) || (!src_enabled('yahoo'));
    $ok = in_array(true, $needed, true) || $skipped;
    return [
        'ok' => $ok, 'tests' => $tests, 'outbound' => (bool) ($byKey['net']['ok'] ?? false),
        'proxy' => (string) $net['proxy'], 'timeout' => (int) $net['timeout'],
        'sources' => ['tgju' => src_enabled('tgju'), 'yahoo' => src_enabled('yahoo'), 'coingecko' => src_enabled('coingecko')],
        'curl' => function_exists('curl_init'),
    ];
}
