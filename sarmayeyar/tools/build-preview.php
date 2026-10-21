<?php
declare(strict_types=1);
/**
 * سازندهٔ «نسخهٔ تک‌فایل خودکفا» سرمایه‌یار
 * ---------------------------------------------------------------------------
 * از قالب public/index.src.html یک index.html می‌سازد که CSS، JS، فونت فارسی و
 * یک اسنپ‌شات دادهٔ واقعی بازار همه درون خودش جاسازی شده‌اند:
 *
 *   - اگر فایل را بدون سرور باز کنید (دابل‌کلیک / file://) → با دادهٔ اسنپ‌شات کار می‌کند.
 *   - اگر روی هاست/PHP سرو شود → همان کد، داده زنده را از API می‌خواند (شیم غیرفعال).
 *
 * استفاده:
 *   php tools/build-preview.php                                  # ساخت index.html از اسنپ‌شات فعلی
 *   php tools/build-preview.php --capture http://localhost:8080  # گرفتن داده تازه از سرور در حال اجرا
 *   php tools/build-preview.php --out /path/to/index.html        # یک کپی اضافه در مسیر دلخواه
 */

$BASE = dirname(__DIR__);
$argvList = $argv ?? [];
$outExtra = null;
$capture = null;
$capUser = 'admin@gmail.com';   // ایمیل/رمز برای گرفتن دادهٔ احرازشده
$capPass = '11111111admin';

for ($i = 1; $i < count($argvList); $i++) {
    if ($argvList[$i] === '--out' && isset($argvList[$i + 1])) { $outExtra = $argvList[++$i]; }
    elseif ($argvList[$i] === '--capture' && isset($argvList[$i + 1])) { $capture = rtrim($argvList[++$i], '/'); }
    elseif ($argvList[$i] === '--email' && isset($argvList[$i + 1])) { $capUser = (string) $argvList[++$i]; }
    elseif ($argvList[$i] === '--password' && isset($argvList[$i + 1])) { $capPass = (string) $argvList[++$i]; }
}

function say(string $m): void { fwrite(STDOUT, $m . PHP_EOL); }
function die_fa(string $m): void { fwrite(STDERR, '✗ ' . $m . PHP_EOL); exit(1); }

/* ---------------- ۱) گرفتن داده از سرور در حال اجرا (اختیاری) ---------------- */
if ($capture !== null) {
    say('→ دریافت داده از ' . $capture . ' ...');
    $gets  = ['/api/state', '/api/market?ensure=0', '/api/signals', '/api/system', '/api/pulse',
              '/api/portfolio', '/api/portfolio/analysis', '/api/ai/last', '/api/health'];
    $posts = ['/api/ai/models' => [], '/api/ai/chat' => ['message' => 'وضعیت بازار چطور است؟'],
              '/api/warm?budget=9000' => []];
    $data = [];

    /* کوکی نشست: برای دادهٔ شخصی (پرتفوی، تحلیل) باید وارد شد */
    $jar = tempnam(sys_get_temp_dir(), 'sycookie');
    $fetch = function (string $method, string $url, ?array $body) use ($jar) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_COOKIEJAR => $jar,
            CURLOPT_COOKIEFILE => $jar,
        ]);
        if ($body !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE)); }
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $j = json_decode((string) $raw, true);
        return $code >= 200 && $code < 300 && is_array($j) ? $j : null;
    };

    /* اگر ایمیل/رمز داده شده، اول وارد می‌شویم تا دادهٔ شخصی هم گرفته شود */
    if ($capUser !== '') {
        $login = $fetch('POST', $capture . '/api/auth/login', ['email' => $capUser, 'password' => $capPass]);
        say($login ? '   ✓ ورود با ' . $capUser : '   ⚠ ورود ناموفق — فقط دادهٔ عمومی گرفته می‌شود');
    }

    foreach ($gets as $path) {
        $body = $fetch('GET', $capture . $path, null);
        if ($body === null) { say('   ⚠ ' . $path . ' → دریافت نشد'); continue; }
        $key = parse_url($path, PHP_URL_PATH);
        $data[$key] = ['method' => 'GET', 'path' => $key, 'query' => '', 'body' => $body];
    }
    foreach ($posts as $path => $payload) {
        $body = $fetch('POST', $capture . $path, $payload);
        if ($body === null) { continue; }
        $key = parse_url($path, PHP_URL_PATH);
        $data[$key] = ['method' => 'POST', 'path' => $key, 'query' => '', 'body' => $body];
    }
    if (!$data) { die_fa('هیچ داده‌ای دریافت نشد؛ مطمئن شوید سرور اجراست.'); }
    file_put_contents($BASE . '/preview/demo-data.json', json_encode($data, JSON_UNESCAPED_UNICODE));
    say('✓ داده ذخیره شد: preview/demo-data.json (' . count($data) . ' منبع)');
}

/* ---------------- ۲) خواندن ورودی‌ها ---------------- */
$read = function (string $rel) use ($BASE): string {
    $p = $BASE . '/' . $rel;
    if (!is_file($p)) { die_fa('فایل پیدا نشد: ' . $rel); }
    return (string) file_get_contents($p);
};

$html   = $read('public/index.src.html');
$css    = $read('public/styles.css');
$js     = $read('public/app.js');
$demo   = $read('preview/demo-data.json');
$font   = $read('preview/vazirmatn-arabic.woff2');
$urange = trim($read('preview/vazirmatn-unicode-range.txt'));

/* ---------------- ۳) فونت فارسی درون‌خطی ---------------- */
$fontCss = "@font-face{font-family:'Vazirmatn';font-style:normal;font-weight:300 700;font-display:swap;"
    . "src:url(data:font/woff2;base64," . base64_encode($font) . ") format('woff2');"
    . "unicode-range:{$urange}}";

/* ---------------- ۴) شیم داده (فقط وقتی فایل بدون سرور باز شود) ---------------- */
$shim = <<<'JS'
/* ===== شیم دادهٔ خودکفا =====================================================
   حالت‌ها:
   ۱) روی سرور (هاست/PHP): هر درخواست به API واقعی می‌رود؛ اگر سرور پاسخ معتبر
      بدهد همان استفاده می‌شود (داده زنده). شیم هیچ دخالتی نمی‌کند.
   ۲) بدون سرور (file:// یا پیش‌نمایش بدون شبکه): درخواست شبکه شکست می‌خورد →
      پاسخ از اسنپ‌شات جاسازی‌شده داده می‌شود تا کل رابط گرافیکی سالم بماند.
   ========================================================================= */
window.__OFFLINE_DEMO__ = __DEMO_DATA__;
(function () {
  const M = window.__OFFLINE_DEMO__;
  const SNAP = (k) => (M[k] && M[k].body) || null;
  const isFile = location.protocol === 'file:';
  const orig = window.fetch ? window.fetch.bind(window) : null;
  let usedSnapshot = false;
  window.__SNAPSHOT_MODE__ = false;

  /* کاربر نمایشی و پاسخ‌های دمو برای حالت بدون سرور (تا صفحهٔ ورود قفل نشود) */
  const DEMO_USER = { id: 1, email: 'demo@sarmayeyar.ir', name: 'کاربر نمایشی', role: 'admin',
    status: 'active', theme: 'dark', createdAt: Date.now() - 86400000, lastLoginAt: Date.now(), isAdmin: true };
  const DEMO = {
    '/api/auth/me': { user: DEMO_USER, installed: true, db: { ok: true, driver: 'sqlite' },
      settings: { siteName: 'سرمایه‌یار', siteTagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان',
        allowRegister: true, requireApproval: false, requireLogin: true, defaultTheme: 'dark', signalCount: 8 },
      branding: { siteName: 'سرمایه‌یار', tagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان' } },
    '/api/auth/login': { ok: true, user: DEMO_USER },
    '/api/auth/register': { ok: true, user: DEMO_USER },
    '/api/auth/logout': { ok: true },
    '/api/auth/prefs': { ok: true },
    '/api/auth/password': { ok: true },
    '/api/auth/install-state': { installed: true, db: { ok: true, driver: 'sqlite' }, settings: {}, branding: {} },
    '/api/admin/overview': { ok: true, db: { driver: 'sqlite', ok: true },
      counts: { users: 2, active: 2, pending: 0, blocked: 0, admins: 1, newToday: 1, new7: 2, new30: 2,
        loginsToday: 3, loginsFailed7: 0, aiRuns: 4, aiRuns7: 4, aiAvgMs: 3200 },
      series: Array.from({ length: 14 }, (_, i) => ({ from: 0, to: Date.now() - (13 - i) * 86400000, signups: i === 12 ? 1 : (i === 5 ? 1 : 0), logins: i % 3 })),
      market: { status: 'ready', assets: 70, total: 70, updatedAt: Date.now() },
      env: { php: '8.4.x', dbSize: 98304 },
      settings: { siteName: 'سرمایه‌یار', siteTagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان',
        allowRegister: true, requireApproval: false, requireLogin: true, defaultTheme: 'dark', signalCount: 8 } },
    '/api/admin/users': { users: [
      { id: 1, email: 'demo@sarmayeyar.ir', name: 'کاربر نمایشی', role: 'admin', status: 'active', created_at: Date.now() - 86400000 * 20, last_login_at: Date.now(), hasState: true },
      { id: 2, email: 'ali@example.com', name: 'علی رضایی', role: 'user', status: 'active', created_at: Date.now() - 86400000 * 5, last_login_at: Date.now() - 86400000, hasState: true } ] },
    '/api/admin/settings': { settings: { siteName: 'سرمایه‌یار', siteTagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان',
        allowRegister: true, requireApproval: false, requireLogin: true, defaultTheme: 'dark', signalCount: 8 },
      defaults: { siteName: 'سرمایه‌یار', siteTagline: '', allowRegister: true, requireApproval: false, requireLogin: true, allowGuest: false, defaultTheme: 'dark', signalCount: 8 } },
    '/api/admin/audit': { log: [
      { id: 3, user_id: 1, action: 'login', detail: 'ورود موفق: demo@sarmayeyar.ir', ip: '127.0.0.1', created_at: Date.now() - 60000 },
      { id: 2, user_id: 0, action: 'register', detail: 'ثبت‌نام: ali@example.com', ip: '127.0.0.1', created_at: Date.now() - 86400000 },
      { id: 1, user_id: 1, action: 'install', detail: 'نصب کامل شد', ip: '127.0.0.1', created_at: Date.now() - 86400000 * 20 } ] },
    '/api/admin/ai-usage': { usage: [
      { id: 2, user_id: 1, email: 'demo@sarmayeyar.ir', model: 'gpt-4o-mini', status: 'ok', ms: 3100, created_at: Date.now() - 120000 },
      { id: 1, user_id: 1, email: 'demo@sarmayeyar.ir', model: 'gpt-4o-mini', status: 'ok', ms: 3300, created_at: Date.now() - 3600000 } ] },
    '/api/admin/tools': { ok: true, message: 'نسخهٔ پیش‌نمایش: ابزارها فقط روی سرور اجرا می‌شوند.' },
    '/api/admin/user/reset-password': { ok: true, tempPassword: 'sy-demo01' },
  };

  const FALLBACK = Object.assign(
    { ok: true, demo: true, note: 'نسخهٔ خودکفا: این عملیات فقط در نسخهٔ نصب‌شده روی سرور فعال است.' },
    { state: (SNAP('/api/state') || {}).state,
      profile: ((SNAP('/api/state') || {}).state || {}).profile,
      analysis: (SNAP('/api/portfolio') || {}).analysis,
      portfolio: (SNAP('/api/portfolio') || {}).portfolio,
      market: SNAP('/api/market'),
      signals: (SNAP('/api/signals') || {}).signals,
      pulse: SNAP('/api/pulse'),
      system: SNAP('/api/system'),
      health: SNAP('/api/health') }
  );

  function keyFor(pathname, search, method) {
    const q = (search || '').replace(/^\?/, '');
    const cands = [];
    if (method === 'GET') {
      if (q) cands.push(pathname + '?' + q);
      cands.push(pathname);
    } else {
      cands.push(method + ' ' + pathname + (q ? '?' + q : ''));
      cands.push(method + ' ' + pathname);
      cands.push(pathname);
    }
    return cands.find((k) => M[k]) || null;
  }

  const snapshotResponse = (path, search, method) => {
    const k = keyFor(path, search, method);
    let body = k ? M[k].body : FALLBACK;
    if (!k && DEMO[path]) body = DEMO[path];
    if (!usedSnapshot) {
      usedSnapshot = true;
      window.__SNAPSHOT_MODE__ = true;
      const r = document.getElementById('demoRibbon');
      if (r) { r.style.display = 'block'; }
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const parseApi = (raw) => {
    const ai = String(raw || '').indexOf('/api');
    if (ai < 0) return null;
    const rest = String(raw).slice(ai);
    const qi = rest.indexOf('?');
    return { path: qi < 0 ? rest : rest.slice(0, qi), search: qi < 0 ? '' : rest.slice(qi) };
  };

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    const method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
    const parsed = parseApi(url);
    if (!parsed) { return orig ? orig(input, init) : Promise.reject(new Error('offline')); }

    // بدون سرور: مستقیم از اسنپ‌شات
    if (isFile || !orig) { return Promise.resolve(snapshotResponse(parsed.path, parsed.search, method)); }

    // روی سرور: اول شبکه؛ فقط اگر شکست خورد یا پاسخ HTML (نه JSON) بود → اسنپ‌شات
    return orig(input, init).then((res) => {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok && ct.indexOf('application/json') < 0) {
        return snapshotResponse(parsed.path, parsed.search, method);
      }
      return res;
    }, () => snapshotResponse(parsed.path, parsed.search, method));
  };

  // نوار «نسخهٔ خودکفا» فقط وقتی واقعاً از اسنپ‌شات استفاده شده باشد
  window.addEventListener('DOMContentLoaded', function () {
    const r = document.getElementById('demoRibbon');
    if (r) { r.style.display = (isFile || window.__SNAPSHOT_MODE__) ? 'block' : 'none'; }
  });
})();
JS;
$shim = str_replace('__DEMO_DATA__', $demo, $shim);

/* ---------------- ۵) مونتاژ ---------------- */
$html = preg_replace('~<link rel="preconnect"[^>]*>\s*~', '', $html);
$html = preg_replace('~<link href="https://fonts\.googleapis\.com[^>]*>\s*~', '', $html);
if (!preg_match('~<link rel="stylesheet" href="styles\.css" />~', $html)) {
    die_fa('در قالب (public/index.src.html) تگ styles.css پیدا نشد.');
}
if (strpos($html, '<script src="app.js"></script>') === false) {
    die_fa('در قالب (public/index.src.html) تگ app.js پیدا نشد.');
}
$html = str_replace('<link rel="stylesheet" href="styles.css" />', "<style>\n{$fontCss}\n{$css}\n</style>", $html);
$html = str_replace('<script src="app.js"></script>', "<script>{$shim}</script>\n<script>{$js}</script>", $html);
$html = str_replace('<div id="toast"', '<div id="demoRibbon" style="display:none;position:fixed;bottom:10px;inset-inline-start:10px;'
    . 'z-index:9999;background:rgba(124,58,237,.9);color:#fff;font:12px Vazirmatn,Tahoma,sans-serif;padding:6px 11px;'
    . 'border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.35)">نسخهٔ خودکفا — نمایش با اسنپ‌شات دادهٔ واقعی</div><div id="toast"', $html);

$targets = [$BASE . '/public/index.html', $BASE . '/preview/sarmayeyar-preview.html'];
if ($outExtra !== null) { $targets[] = $outExtra; }
foreach ($targets as $t) {
    @mkdir(dirname($t), 0775, true);
    if (file_put_contents($t, $html) === false) { die_fa('نوشتن فایل ناموفق بود: ' . $t); }
    say('✅ ' . $t . '  (' . number_format(strlen($html) / 1024, 0) . ' کیلوبایت)');
}
say('   این فایل هم با دابل‌کلیک (بدون سرور) و هم روی هاست (داده زنده) کار می‌کند.');
