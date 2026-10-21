<?php
/**
 * نصب‌کننده خط فرمان (CLI) — برای سرورهایی که دسترسی SSH دارند
 *
 * اجرا:
 *   php tools/install-cli.php                 # نصب کامل با تنظیمات پیش‌فرض + دریافت داده
 *   php tools/install-cli.php --no-warm       # بدون دریافت داده بازار
 *   php tools/install-cli.php --provider=avalai --key=sk-xxx --model=auto --auto
 *   php tools/install-cli.php --data-dir=/home/USER/sarmayeyar-data
 *   php tools/install-cli.php --demo          # وصل شدن به شبیه‌ساز محلی هوش مصنوعی (پورت 4000)
 *   php tools/install-cli.php --cron          # فقط چاپ خط cron
 *
 * گزینه‌های کاربران و دیتابیس:
 *   --admin-email=you@site.com --admin-pass=Secret123 --admin-name="نام شما"
 *   --db=mysql --db-host=localhost --db-name=sarmayeyar --db-user=user --db-pass=pass
 *   --db=sqlite --db-path=/home/USER/data/sarmayeyar.sqlite
 *   --site-name="سرمایه‌یار" --open-register --no-approval --public
 */
declare(strict_types=1);
define('SARMAYEYAR', 1);
define('BASE_DIR', dirname(__DIR__));
define('PUBLIC_DIR', BASE_DIR);

$args = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z0-9-]+)(?:=(.*))?$/i', $a, $m)) $args[$m[1]] = $m[2] ?? true;
}

$dataDir = is_string($args['data-dir'] ?? null) ? rtrim($args['data-dir'], '/') : BASE_DIR . '/data';
define('DATA_DIR', $dataDir);
$adminEmail = is_string($args['admin-email'] ?? null) ? $args['admin-email'] : 'admin@gmail.com';
$adminPass  = is_string($args['admin-pass'] ?? null) ? $args['admin-pass'] : '11111111admin';
$adminName  = is_string($args['admin-name'] ?? null) ? $args['admin-name'] : 'مدیر سیستم';

require_once BASE_DIR . '/inc/universe_data.php';
require_once BASE_DIR . '/inc/util.php';
require_once BASE_DIR . '/inc/store.php';
require_once BASE_DIR . '/inc/db.php';
require_once BASE_DIR . '/inc/auth.php';
require_once BASE_DIR . '/inc/users.php';
require_once BASE_DIR . '/inc/sources.php';
require_once BASE_DIR . '/inc/analytics.php';
require_once BASE_DIR . '/inc/market.php';
require_once BASE_DIR . '/inc/engine.php';
require_once BASE_DIR . '/inc/ai.php';
require_once BASE_DIR . '/inc/admin.php';
date_default_timezone_set('Asia/Tehran');

/* ------------------------------- کمک‌کننده‌ها */
function say(string $m): void { fwrite(STDOUT, $m . PHP_EOL); }
function ok(string $m): void { fwrite(STDOUT, "  ✅ $m" . PHP_EOL); }
function bad(string $m): void { fwrite(STDOUT, "  ❌ $m" . PHP_EOL); }
function info(string $m): void { fwrite(STDOUT, "  ℹ️  $m" . PHP_EOL); }
function box(string $t): void { fwrite(STDOUT, PHP_EOL . "── $t " . str_repeat('─', max(0, 54 - mb_strlen($t))) . PHP_EOL); }

say('');
say('💹  سرمایه‌یار — نصب‌کننده خط فرمان');
say('');

/* ------------------------------- ۱) پیش‌نیازها */
box('۱) بررسی پیش‌نیازها');
$fails = 0;
$checks = [
    'PHP >= 7.4' => version_compare(PHP_VERSION, '7.4.0', '>='),
    'افزونه json' => function_exists('json_encode'),
    'دریافت داده (cURL یا allow_url_fopen)' => function_exists('curl_init') || ini_get('allow_url_fopen'),
    'افزونه openssl (HTTPS)' => extension_loaded('openssl'),
];
foreach ($checks as $label => $pass) { $pass ? ok($label) : (bad($label) . ($fails++)); }
info('نسخه PHP: ' . PHP_VERSION);
if (!function_exists('curl_init')) info('cURL نیست → حالت سری/کندتر فعال می‌شود (توصیه: نصب php-curl)');

if (!is_dir($dataDir) && !@mkdir($dataDir, 0755, true)) { bad('ساخت پوشه داده ناموفق: ' . $dataDir); exit(1); }

/* ------------------------------- ۲) دیتابیس و جدول‌ها */
box('۲) دیتابیس و جدول‌ها');
$driver = is_string($args['db'] ?? null) ? strtolower($args['db']) : null;
if ($driver === 'mysql') {
    db_write_config([
        'driver' => 'mysql', 'host' => (string) ($args['db-host'] ?? 'localhost'),
        'port' => (int) ($args['db-port'] ?? 3306), 'name' => (string) ($args['db-name'] ?? 'sarmayeyar_116'),
        'user' => (string) ($args['db-user'] ?? ''), 'pass' => (string) ($args['db-pass'] ?? ''),
        'enabled' => true,
    ]);
} elseif ($driver === 'sqlite') {
    db_write_config(['driver' => 'sqlite', 'path' => (string) ($args['db-path'] ?? ($dataDir . '/sarmayeyar_116.sqlite')), 'enabled' => true]);
}
if (!db_ok()) {
    bad('اتصال دیتابیس برقرار نشد؛ برنامه در حالت تک‌کاربرهٔ فایلی کار می‌کند.');
    info('برای MySQL: --db=mysql --db-name=... --db-user=... --db-pass=...');
} else {
    $mig = db_migrate();
    if ($mig['ok']) ok('دیتابیس ' . db_driver() . ' آماده است (جدول‌ها: ' . implode(', ', $mig['tables']) . ')');
    else bad('ساخت جدول‌ها ناموفق: ' . ($mig['error'] ?? ''));
    foreach (settings_defaults() as $k => $v) if (setting_get($k, '__none__') === '__none__') setting_set($k, $v);
}

/* ------------------------------- ۳) حساب مدیر و تنظیمات سایت */
box('۳) حساب مدیر و تنظیمات سایت');
if (db_ok()) {
    $siteName = is_string($args['site-name'] ?? null) ? $args['site-name'] : (string) setting_get('siteName', 'سرمایه‌یار');
    setting_set('siteName', $siteName);
    if (!empty($args['open-register'])) setting_set('allowRegister', true);
    if (!empty($args['no-approval'])) setting_set('requireApproval', false);
    if (!empty($args['public'])) setting_set('requireLogin', false);
    if (!empty($args['require-login'])) setting_set('requireLogin', true);
    if (!empty($args['approval'])) setting_set('requireApproval', true);
    $count = (int) db_val('SELECT COUNT(*) FROM users');
    if ($count === 0) {
        if ($adminEmail === '' || $adminPass === '') {
            $adminEmail = $adminEmail !== '' ? $adminEmail : 'admin@localhost';
            $adminPass = $adminPass !== '' ? $adminPass : ('sy' . bin2hex(random_bytes(4)));
            info('رمز مدیر ساخته شد — همین حالا یادداشت کنید: ' . $adminPass);
        }
        $r = auth_register($adminEmail, $adminPass, $adminName, true);
        if ($r['ok']) ok('حساب مدیر ساخته شد: ' . $adminEmail);
        else bad('ساخت مدیر ناموفق: ' . $r['error']);
        if (!empty($r['id'])) {
            if (store_import_legacy((int) $r['id'])) ok('دادهٔ قبلی کاربر به حساب مدیر منتقل شد.');
        }
    } else {
        info('کاربران قبلاً ساخته شده‌اند (' . $count . ' کاربر) — چیزی تغییر نکرد.');
    }
}
ok('پوشه داده: ' . $dataDir);

$assetsDir = market_assets_dir();
if (!is_dir($assetsDir)) @mkdir($assetsDir, 0755, true);
ok('پوشه assets: ' . $assetsDir);

/* ------------------------------- ۲) تنظیمات */
box('۶) تنظیمات هوش مصنوعی');
$s = store_load();
$changed = false;
if (isset($args['provider']) && is_string($args['provider'])) { $s['ai']['provider'] = $args['provider']; $changed = true; }
if (!empty($args['key'])) { $s['ai']['apiKey'] = (string) $args['key']; $changed = true; }
if (!empty($args['base-url'])) { $s['ai']['baseUrl'] = (string) $args['base-url']; $changed = true; }
if (!empty($args['model'])) { $s['ai']['model'] = (string) $args['model']; $changed = true; }
if (!empty($args['auto'])) { $s['ai']['autoMode'] = true; $changed = true; }
if (!empty($args['interval'])) { $s['ai']['autoIntervalMin'] = max(5, min(1440, (int) $args['interval'])); $changed = true; }
if (!empty($args['demo'])) {
    $s['ai']['provider'] = 'custom';
    $s['ai']['baseUrl'] = 'http://127.0.0.1:4000/v1';
    $s['ai']['apiKey'] = $s['ai']['apiKey'] ?: 'demo-key';
    $s['ai']['model'] = 'auto';
    $changed = true;
    info('حالت دمو: به شبیه‌ساز محلی وصل شد (python3 tools/mock_ai_server.py را اجرا کنید).');
}
if ($changed) { store_save($s); ok('تنظیمات ذخیره شد.'); }
else info('تنظیمات پیش‌فرض حفظ شد (کلید API را بعداً از داخل سایت هم می‌توانید بگذارید).');

if (isset($args['cron'])) {
    say('');
    say('خط cron پیشنهادی را در crontab -e اضافه کنید:');
    say('  */5 * * * * cd ' . BASE_DIR . ' && php tools/cron-warm.php >/dev/null 2>&1');
    exit(0);
}

/* ------------------------------- ۳) تست منابع داده */
box('۷) تست منابع داده بازار');
$snapData = tgju_snapshot(true);
$usd = $snapData['price_dollar_rl']['price'] ?? null;
$usd ? ok('TGJU — دلار آزاد: ' . number_format((float) $usd)) : bad('TGJU پاسخ نداد');
$y = yahoo_chart('^GSPC', '6mo', true);
$y ? ok('Yahoo — S&P 500: ' . number_format((float) $y['price'], 2) . ' (' . count($y['series']) . ' روز)') : bad('Yahoo پاسخ نداد');
$cg = coin_gecko_markets(['bitcoin']);
!empty($cg) ? ok('CoinGecko — بیت‌کوین: ' . number_format((float) ($cg['bitcoin']['current_price'] ?? 0))) : bad('CoinGecko پاسخ نداد');

/* ------------------------------- ۴) تست هوش مصنوعی */
box('۸) تست اتصال هوش مصنوعی');
try {
    $c = ai_cfg(store_load());
    if ($c['apiKey'] || $c['noKey']) {
        $r = ai_list_models($c);
        ok('اتصال برقرار: ' . $r['label'] . ' — ' . count($r['models']) . ' مدل');
        ok('مدل انتخابی خودکار: ' . ($r['auto'] ?? '—'));
        try {
            $out = ai_chat($c, [['role' => 'user', 'content' => 'فقط بنویس: آماده']], 20, 45);
            ok('پاسخ تست: ' . trim($out['text']));
        } catch (Throwable $e) { bad('چت ناموفق: ' . $e->getMessage()); }
    } else {
        info('کلید API ثبت نشده — این مرحله رد شد (بعداً از تب «هوش مصنوعی» در سایت قابل تنظیم است).');
    }
} catch (Throwable $e) { bad('اتصال ناموفق: ' . $e->getMessage()); }

/* ------------------------------- ۵) دریافت داده بازار */
if (!isset($args['no-warm'])) {
    box('۹) دریافت داده بازار (۷۰ دارایی)');
    $total = count(universe_assets());
    $t0 = microtime(true);
    $rounds = 0;
    while (true) {
        $r = market_ensure(25000, $rounds === 0 && !empty($args['force']));
        $st = market_status();
        $w = $st['warm'];
        say(sprintf('  پاس %d: %d/%d دارایی (%.0f ثانیه)', ++$rounds, $w['done'] ?? 0, $w['total'] ?? $total, microtime(true) - $t0));
        if (($r['status'] ?? '') === 'ready' || $rounds > 12) break;
    }
    $st = market_status();
    if (($st['snapshot']['status'] ?? '') === 'ready') {
        ok('داده بازار آماده است: ' . $st['snapshot']['counts']['ok'] . '/' . $total . ' دارایی');
    } else {
        info('داده ناقص است؛ با اجرای cron یا دکمه «به‌روزرسانی» در سایت تکمیل می‌شود.');
    }
} else {
    info('دریافت داده رد شد (--no-warm). در اولین بازدید سایت انجام می‌شود.');
}

/* ------------------------------- ۶) آزمون تولید سیگنال */
box('۱۰) آزمون موتور تحلیل');
$sig = engine_generate_signals(store_load(), 8);
say('  تعداد سیگنال: ' . count($sig['signals']));
foreach (array_slice($sig['signals'], 0, 5) as $x) {
    say(sprintf('   #%d %s — %s | امتیاز فرصت %d | تخصیص %s٪', $x['rank'], $x['name'], $x['signal'], $x['oppScore'], $x['suggestedPct']));
}

/* ------------------------------- ۷) پایان */
box('پایان نصب');
say('  آدرس سایت: ' . (getenv('SITE_URL') ?: 'http://localhost:8000'));
say('  اجرای سریع تست: cd ' . BASE_DIR . ' && php -S 0.0.0.0:8000 index.php');
say('  Cron پیشنهادی:');
say('    */5 * * * * cd ' . BASE_DIR . ' && php tools/cron-warm.php >/dev/null 2>&1');
say('');
say('  ⚠️  برای امنیت: فایل install.php را حذف/تغییرنام دهید و روی سایت احراز هویت بگذارید.');
say('');
