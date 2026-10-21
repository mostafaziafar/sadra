<?php
/* ---------------------------------------------------------------------------
 * نگهبان نسخهٔ PHP — این برنامه به PHP 8.0 یا بالاتر نیاز دارد.
 * این بخش عمداً با نحو ساده (سازگار با PHP قدیمی) نوشته شده تا روی هاست‌های
 * قدیمی هم پیام فارسی درست نشان داده شود، نه خطای سفید.
 * ------------------------------------------------------------------------- */
if (version_compare(PHP_VERSION, '8.0.0', '<')) {
    @http_response_code(500);
    @header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width, initial-scale=1">'
       . '<title>نسخهٔ PHP قدیمی است</title><style>'
       . 'body{margin:0;background:#0b1020;color:#e8ecf6;font-family:Tahoma,sans-serif;line-height:2;padding:40px 18px}'
       . '.box{max-width:640px;margin:40px auto;background:#121a2e;border:1px solid rgba(255,255,255,.12);'
       . 'border-radius:16px;padding:22px}h1{font-size:20px;margin:0 0 10px}'
       . 'code{background:rgba(255,255,255,.08);padding:3px 7px;border-radius:6px;direction:ltr;display:inline-block;font-size:13px}'
       . '.warn{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);border-radius:10px;padding:10px 12px;font-size:14px}'
       . 'ul{padding-inline-start:20px;margin:10px 0}a{color:#22d3ee}'
       . '</style></head><body><div class="box"><h1>⚠️ نسخهٔ PHP سرور شما قدیمی است</h1>'
       . '<div class="warn">نسخهٔ فعلی: <code>' . PHP_VERSION . '</code> — نیازمند: <code>PHP 8.0+</code></div>'
       . '<p>برای اجرای سرمایه‌یار، از کنترل‌پنل هاست (cPanel / DirectAdmin) نسخهٔ PHP را روی ۸.۱ یا بالاتر بگذارید:</p>'
       . '<ul><li>cPanel → بخش <b>MultiPHP Manager</b> → دامنه را انتخاب و نسخه را تغییر دهید.</li>'
       . '<li>DirectAdmin → <b>PHP Version Selector</b>.</li>'
       . '<li>اگر دسترسی ندارید، از پشتیبانی هاست بخواهید PHP را ارتقا دهد.</li></ul>'
       . '<p>بعد از تغییر نسخه، همین صفحه را دوباره باز کنید.</p></div></body></html>';
    exit;
}
/**
 * سرمایه‌یار — نصب‌کنندهٔ وب
 * -------------------------------------------------------------------------
 * همه‌چیز را خودش انجام می‌دهد: ساخت دیتابیس و جدول‌ها، ساخت حساب مدیر،
 * تنظیمات سایت، تست منابع داده، پیکربندی هوش مصنوعی و دریافت دادهٔ بازار.
 * هم مستقیم (/install.php) و هم از طریق روتر index.php کار می‌کند.
 */
if (!defined('SARMAYEYAR')) define('SARMAYEYAR', 1);
if (!defined('BASE_DIR')) define('BASE_DIR', __DIR__);
if (!defined('PUBLIC_DIR')) define('PUBLIC_DIR', __DIR__);
if (getenv('SARMAYEYAR_DATA') && !defined('DATA_DIR')) define('DATA_DIR', rtrim(getenv('SARMAYEYAR_DATA'), '/'));
elseif (!defined('DATA_DIR')) define('DATA_DIR', __DIR__ . '/data');
if (is_file(__DIR__ . '/config.php')) require_once __DIR__ . '/config.php';

require_once __DIR__ . '/inc/universe_data.php';
require_once __DIR__ . '/inc/util.php';
require_once __DIR__ . '/inc/store.php';
require_once __DIR__ . '/inc/db.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/users.php';
require_once __DIR__ . '/inc/sources.php';
require_once __DIR__ . '/inc/analytics.php';
require_once __DIR__ . '/inc/market.php';
require_once __DIR__ . '/inc/engine.php';
require_once __DIR__ . '/inc/ai.php';
require_once __DIR__ . '/inc/admin.php';
date_default_timezone_set('Asia/Tehran');
auth_start_session();

$ACTION = (string) ($_GET['action'] ?? '');

function ins_json($code, $data) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo u_json($data);
    exit;
}

function ins_body(): array {
    $raw = file_get_contents('php://input');
    $j = $raw ? json_decode($raw, true) : null;
    return is_array($j) ? $j : [];
}

function ins_lock_path(): string { return store_paths()['dir'] . '/installed.lock'; }
function ins_done(): bool { return is_file(ins_lock_path()) && auth_installed(); }

/* ============================== اکشن‌های AJAX ============================== */
if ($ACTION !== '') {
    try {
        switch ($ACTION) {
            case 'check': {
                $dirs = store_paths();
                $dataDir = $dirs['dir'];
                $checks = [
                    ['php', 'نسخهٔ PHP ≥ ۸.۰', version_compare(PHP_VERSION, '8.0.0', '>='), PHP_VERSION],
                    ['curl', 'افزونهٔ cURL (داده بازار)', function_exists('curl_init'), function_exists('curl_init') ? 'فعال' : 'غیرفعال — در cPanel فعال کنید'],
                    ['mbstring', 'افزونهٔ mbstring (متن فارسی)', function_exists('mb_strlen'), function_exists('mb_strlen') ? 'فعال' : 'غیرفعال'],
                    ['json', 'افزونهٔ JSON', function_exists('json_encode'), function_exists('json_encode') ? 'فعال' : 'غیرفعال'],
                    ['pdo', 'PDO (دیتابیس)', extension_loaded('pdo'), extension_loaded('pdo') ? 'فعال' : 'غیرفعال'],
                    ['sqlite', 'درایور SQLite', extension_loaded('pdo_sqlite'), extension_loaded('pdo_sqlite') ? 'آماده' : 'نیست (MySQL بزنید)'],
                    ['mysql', 'درایور MySQL', extension_loaded('pdo_mysql'), extension_loaded('pdo_mysql') ? 'آماده' : 'نیست'],
                    ['session', 'نشست کاربران', function_exists('session_start'), 'فعال'],
                    ['data', 'پوشهٔ data قابل نوشتن', is_dir($dataDir) && is_writable($dataDir), $dataDir],
                    ['openssl', 'OpenSSL (اتصال امن)', extension_loaded('openssl'), extension_loaded('openssl') ? 'فعال' : 'غیرفعال'],
                ];
                $ok = true;
                foreach ($checks as $c) if (!$c[2] && !in_array($c[0], ['sqlite', 'mysql'], true)) $ok = false;
                if (!$checks[8][2]) $ok = false;
                ins_json(200, ['ok' => $ok, 'checks' => array_map(fn($c) => ['key' => $c[0], 'label' => $c[1], 'ok' => (bool) $c[2], 'detail' => (string) $c[3]], $checks)]);
            }

            case 'db-test': {
                $b = ins_body();
                $cfg = [
                    'driver' => ($b['driver'] ?? 'sqlite') === 'mysql' ? 'mysql' : 'sqlite',
                    'host' => (string) ($b['host'] ?? 'localhost'),
                    'port' => (int) ($b['port'] ?? 3306),
                    'name' => (string) (!empty($b['name']) ? $b['name'] : 'sarmayeyar_132'),
                    'user' => (string) ($b['user'] ?? ''),
                    'pass' => (string) ($b['pass'] ?? ''),
                    'path' => (string) (!empty($b['path']) ? $b['path'] : (store_paths()['dir'] . '/sarmayeyar_132.sqlite')),
                ];
                $r = db_test_config($cfg);
                if ($r['ok']) db_write_config($cfg);
                ins_json($r['ok'] ? 200 : 400, $r);
            }

            case 'db-install': {
                $m = db_migrate();
                if (!$m['ok']) ins_json(400, $m);
                foreach (settings_defaults() as $k => $v) if (setting_get($k, '__none__') === '__none__') setting_set($k, $v);
                audit('install', 'جدول‌های دیتابیس ساخته شد (' . db_driver() . ')');
                ins_json(200, ['ok' => true, 'tables' => $m['tables'], 'driver' => db_driver(), 'message' => 'دیتابیس و جدول‌ها آماده شد.']);
            }

            case 'create-admin': {
                $b = ins_body();
                $email = mb_strtolower(trim((string) ($b['email'] ?? 'admin@gmail.com')));
                $pass = (string) ($b['password'] ?? '11111111admin');
                $name = trim((string) ($b['name'] ?? 'مدیر سیستم'));
                if (!auth_validate_email($email)) ins_json(400, ['ok' => false, 'error' => 'ایمیل معتبر نیست.']);
                if (mb_strlen($pass) < 6) ins_json(400, ['ok' => false, 'error' => 'رمز عبور باید حداقل ۶ کاراکتر باشد.']);
                $m = db_migrate();
                if (!$m['ok']) ins_json(400, ['ok' => false, 'error' => $m['error']]);
                $exists = db_one('SELECT id FROM users WHERE email = ?', [$email]);
                if ($exists) {
                    db_exec('UPDATE users SET name = ?, pass_hash = ?, role = ?, status = ? WHERE id = ?',
                        [$name !== '' ? $name : auth_name_from_email($email), password_hash($pass, PASSWORD_DEFAULT), 'admin', 'active', (int) $exists['id']]);
                    audit('install', 'به‌روزرسانی حساب مدیر ' . $email, (int) $exists['id']);
                    ins_json(200, ['ok' => true, 'updated' => true, 'id' => (int) $exists['id'], 'message' => 'حساب مدیر به‌روزرسانی شد.']);
                }
                $now = db_now_ms();
                db_exec('INSERT INTO users (email, username, mobile, name, pass_hash, role, status, theme, created_at, last_login_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
                    $email, 'admin', '', $name ?: 'مدیر سیستم', password_hash($pass, PASSWORD_DEFAULT),
                    'admin', 'active', 'dark', $now, 0, u_json(['source' => 'installer', 'terms_agree' => '1'])
                ]);
                $id = db_last_id();
                audit('install', 'ساخت حساب مدیر ' . $email, $id);
                $imported = store_import_legacy((int) $id);
                ins_json(200, ['ok' => true, 'id' => $id, 'importedLegacy' => (bool) $imported, 'message' => 'حساب مدیر با موفقیت ساخته شد.']);
            }

            case 'save-site': {
                $r = admin_settings_save(ins_body());
                ins_json(200, $r);
            }

            case 'test-sources': {
                /* عیب‌یابی دقیق: هر منبع با علت خطا و راهنمای رفع برمی‌گردد.
                   هرگز خطای مبهم «(200)» نشان نمی‌دهیم و این مرحله هرگز قفل نمی‌کند. */
                try {
                    $r = source_probe(10);
                    $reach = !empty($r['ok']);          // نتیجهٔ واقعی را قبل از بازنویسی نگه می‌داریم
                    $down = array_values(array_filter($r['tests'], fn($t) => empty($t['ok']) && empty($t['optional']) && ($t['key'] ?? '') !== 'net'));
                    $r['reachable'] = $reach;
                    $r['blocking'] = false;             // این مرحله هرگز جلوی نصب را نمی‌گیرد
                    $r['ok'] = true;
                    $r['summary'] = $reach
                        ? 'منابع داده در دسترس‌اند؛ می‌توانید ادامه دهید.'
                        : ('هیچ‌کدام از منابع زنده پاسخ ندادند' . ($down ? '' : '') . '. علت هر مورد پایین نوشته شده. '
                            . 'نصب را ادامه دهید — سایت کار می‌کند و بعداً از همین بخش یا «تنظیمات شبکه» مشکل را حل کنید.');
                    ins_json(200, $r);
                } catch (Throwable $e) {
                    ins_json(200, ['ok' => true, 'reachable' => false, 'tests' => [],
                        'summary' => 'عیب‌یابی ناموفق بود: ' . $e->getMessage(), 'error' => $e->getMessage()]);
                }
            }

            case 'net-get': {
                $n = sy_net_config();
                ins_json(200, ['ok' => true, 'net' => $n, 'curl' => function_exists('curl_init'),
                    'host' => php_uname('s') . ' · ' . ($_SERVER['SERVER_SOFTWARE'] ?? '')]);
            }

            case 'net-save': {
                $b = ins_body();
                if (array_key_exists('proxy', $b)) setting_set('httpProxy', mb_substr(trim((string) $b['proxy']), 0, 200));
                if (array_key_exists('timeout', $b)) setting_set('srcTimeout', max(5, min(60, (int) $b['timeout'])));
                if (array_key_exists('insecure', $b)) setting_set('srcInsecure', (bool) $b['insecure']);
                foreach (['tgju' => 'srcTgju', 'yahoo' => 'srcYahoo', 'coingecko' => 'srcCoingecko'] as $k => $sk) {
                    if (array_key_exists($k, $b)) setting_set($sk, (bool) $b[$k]);
                }
                ins_json(200, ['ok' => true, 'net' => sy_net_config()]);
            }

            case 'ai-save': {
                $b = ins_body();
                if (!empty($b['skip'])) { setting_set('aiConfigured', false); ins_json(200, ['ok' => true, 'skipped' => true]); }
                $uid = (int) auth_id();
                if ($uid <= 0) {
                    $first = db_one('SELECT id FROM users ORDER BY id LIMIT 1');
                    $uid = (int) ($first['id'] ?? 0);
                }
                if ($uid <= 0) ins_json(400, ['ok' => false, 'error' => 'ابتدا حساب مدیر را بسازید.']);
                store_set_user($uid);
                $s = store_load(true);
                $s['ai']['provider'] = isset(ai_providers()[$b['provider'] ?? '']) ? (string) $b['provider'] : 'openai';
                $s['ai']['baseUrl'] = mb_substr((string) ($b['baseUrl'] ?? ''), 0, 300);
                $s['ai']['model'] = mb_substr((string) ($b['model'] ?? 'auto'), 0, 120);
                if (!empty($b['apiKey'])) $s['ai']['apiKey'] = mb_substr((string) $b['apiKey'], 0, 400);
                $s['ai']['autoMode'] = !empty($b['autoMode']);
                if (!empty($b['autoIntervalMin'])) $s['ai']['autoIntervalMin'] = max(5, min(1440, (int) $b['autoIntervalMin']));
                store_save($s);
                setting_set('aiConfigured', !empty($s['ai']['apiKey']));
                $models = [];
                $auto = null;
                try {
                    $r = ai_list_models(ai_cfg($s));
                    $models = $r['models'];
                    $auto = $r['auto'];
                    $s['ai']['lastModels'] = $models;
                    $s['ai']['autoPick'] = $auto;
                    store_save($s);
                } catch (Throwable $e) { /* اتصال نبود؛ ادامه با هشدار */ }
                store_reset_user();
                ins_json(200, ['ok' => true, 'models' => array_slice($models, 0, 30), 'auto' => $auto,
                    'count' => count($models), 'provider' => $s['ai']['provider']]);
            }

            case 'ai-test': {
                $uid = (int) auth_id();
                if ($uid <= 0) { $f = db_one('SELECT id FROM users ORDER BY id LIMIT 1'); $uid = (int) ($f['id'] ?? 0); }
                if ($uid <= 0) ins_json(400, ['ok' => false, 'error' => 'کاربری یافت نشد.']);
                store_set_user($uid);
                $r = ai_test_connection(store_load(true));
                store_reset_user();
                ins_json(200, ['ok' => !$r['chatErr'], 'result' => $r]);
            }

            case 'warm': {
                $budget = max(5000, min(40000, (int) ($_GET['budget'] ?? 15000)));
                $forceReset = !empty($_GET['reset']);
                $r = market_ensure($budget, $forceReset);
                $st = market_status();
                ins_json(200, [
                    'ok' => true,
                    'result' => $r,
                    'market' => $st['snapshot'] ?? [],
                    'warm' => $st['warm'] ?? [],
                    'status' => $r['status'] ?? $st['snapshot']['status'] ?? 'warming',
                    'done' => $r['done'] ?? $st['snapshot']['counts']['ok'] ?? 0,
                    'total' => $r['total'] ?? $st['snapshot']['counts']['total'] ?? count(universe_assets()),
                ]);
            }

            case 'finish': {
                if (!auth_installed()) ins_json(400, ['ok' => false, 'error' => 'ابتدا حساب مدیر را بسازید.']);
                setting_set('installedAt', db_now_ms());
                @file_put_contents(ins_lock_path(), date('c') . "\n");
                audit('install', 'نصب کامل شد');
                ins_json(200, ['ok' => true, 'message' => 'نصب کامل شد.', 'removeInstaller' => true]);
            }

            case 'state': {
                ins_json(200, [
                    'installed' => ins_done(),
                    'db' => ['ok' => db_ok(), 'driver' => db_driver(), 'migrated' => db_is_migrated()],
                    'users' => db_ok() && db_is_migrated() ? (int) db_val('SELECT COUNT(*) FROM users') : 0,
                    'market' => market_status()['snapshot'] ?? null,
                    'php' => PHP_VERSION,
                    'configFile' => is_file(__DIR__ . '/config.php'),
                ]);
            }

            default: ins_json(404, ['ok' => false, 'error' => 'اکشن ناشناخته: ' . $ACTION]);
        }
    } catch (Throwable $e) {
        ins_json(500, ['ok' => false, 'error' => $e->getMessage()]);
    }
}

$installed = ins_done();
$sysInfo = ['php' => PHP_VERSION, 'db' => db_driver(), 'dbOk' => db_ok(), 'installed' => $installed,
            'base' => BASE_DIR, 'data' => store_paths()['dir']];
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>نصب سرمایه‌یار</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%88%3C/text%3E%3C/svg%3E" />
<script>
/* انتخاب تم پیش از رندر (بدون پرش رنگ): مقدار ذخیره‌شده ← وگرنه تنظیم سیستم */
(function () {
  try {
    var t = localStorage.getItem('sy_install_theme');
    if (!t) t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
})();
</script>
<style>
  :root{--bg:#0b1020;--card:#121a2e;--card2:#0f1626;--line:rgba(255,255,255,.09);--txt:#e9eef8;--muted:#9aa6bf;
        --accent:#22d3ee;--accent2:#7c3aed;--ok:#22c55e;--bad:#ef4444;--warn:#f59e0b;--radius:14px;
        --input-bg:#0c1424;--code-bg:#0a1120;--toast-bg:#111a2c;--label:#c9d4ea;--step-on:#fff;
        --haze:rgba(34,211,238,.10);--oktxt:#86efac;--badtxt:#fca5a5;--warntxt:#fcd34d;--shadow:0 10px 30px rgba(0,0,0,.35)}
  /* تم روشن — با سوییچ سرصفحه یا تنظیم سیستم فعال می‌شود */
  html[data-theme="light"]{--bg:#f4f7fc;--card:#ffffff;--card2:#eef3fa;--line:rgba(15,23,42,.12);--txt:#0f172a;--muted:#5b6b85;
        --input-bg:#ffffff;--code-bg:#f1f5fb;--toast-bg:#ffffff;--label:#334155;--step-on:#062a33;
        --haze:rgba(34,211,238,.18);--oktxt:#15803d;--badtxt:#b91c1c;--warntxt:#a16207;--shadow:0 10px 24px rgba(15,23,42,.10)}
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,var(--haze),transparent),var(--bg);
       color:var(--txt);font-family:Vazirmatn,Tahoma,system-ui,sans-serif;line-height:1.9}
  .wrap{max-width:960px;margin:0 auto;padding:24px 16px 60px}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
  .brand{display:flex;align-items:center;gap:12px}
  .logo{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));
        display:grid;place-items:center;font-weight:700;font-size:20px;color:#04121d}
  h1{font-size:20px;margin:0}
  .sub{color:var(--muted);font-size:12.5px}
  .steps{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 20px}
  .step{font-size:12px;padding:6px 11px;border-radius:999px;border:1px solid var(--line);color:var(--muted);background:var(--card2)}
  .step.active{background:linear-gradient(135deg,rgba(34,211,238,.22),rgba(124,58,237,.22));color:var(--step-on);border-color:rgba(34,211,238,.5)}
  .step.done{color:var(--oktxt);border-color:rgba(34,197,94,.4)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:14px;box-shadow:var(--shadow)}
  h2{font-size:16px;margin:0 0 6px}
  .hint{color:var(--muted);font-size:12.5px}
  .grid{display:grid;gap:10px}
  .grid.two{grid-template-columns:1fr 1fr}
  .grid.three{grid-template-columns:1fr 1fr 1fr}
  @media(max-width:720px){.grid.two,.grid.three{grid-template-columns:1fr}}
  label{display:block;font-size:13px;margin-bottom:4px;color:var(--label)}
  input,select{width:100%;padding:10px 11px;border-radius:10px;border:1px solid var(--line);background:var(--input-bg);color:var(--txt);font-family:inherit;font-size:13.5px}
  input:focus,select:focus{outline:2px solid rgba(34,211,238,.35);border-color:transparent}
  .btn{border:0;border-radius:11px;padding:10px 16px;font-family:inherit;font-size:13.5px;cursor:pointer;
       background:linear-gradient(135deg,var(--accent),var(--accent2));color:#04121d;font-weight:700}
  .btn.ghost{background:transparent;border:1px solid var(--line);color:var(--txt);font-weight:500}
  .btn.small{padding:7px 12px;font-size:12.5px}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .list{display:flex;flex-direction:column;gap:8px}
  .item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border-radius:10px;
        background:var(--card2);border:1px solid var(--line);font-size:13px}
  .badge{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid transparent}
  .badge.ok{background:rgba(34,197,94,.14);color:var(--oktxt);border-color:rgba(34,197,94,.35)}
  .badge.bad{background:rgba(239,68,68,.14);color:var(--badtxt);border-color:rgba(239,68,68,.35)}
  .badge.warn{background:rgba(245,158,11,.14);color:var(--warntxt);border-color:rgba(245,158,11,.35)}
  .note{background:rgba(34,211,238,.07);border:1px solid rgba(34,211,238,.25);border-radius:11px;padding:10px 12px;font-size:12.5px}
  .note.warn{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.3)}
  code{background:var(--card2);padding:2px 6px;border-radius:6px;font-size:12px;direction:ltr;display:inline-block;border:1px solid var(--line)}
  pre{background:var(--code-bg);border:1px solid var(--line);border-radius:10px;padding:11px;overflow:auto;direction:ltr;text-align:left;font-size:12px}
  .hide{display:none !important}
  .log{max-height:190px;overflow:auto;background:var(--code-bg);border:1px solid var(--line);border-radius:10px;padding:10px;font-size:12px}
  .log div{padding:2px 0;border-bottom:1px dashed rgba(255,255,255,.05)}
  .toast{position:fixed;bottom:16px;inset-inline-start:16px;background:var(--toast-bg);border:1px solid var(--line);color:var(--txt);box-shadow:var(--shadow);
         padding:11px 15px;border-radius:11px;font-size:13px;transform:translateY(120%);transition:.25s;z-index:99}
  .toast.show{transform:none}
  .toast.ok{border-color:rgba(34,197,94,.5)} .toast.bad{border-color:rgba(239,68,68,.5)}
  .spinner{width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;
           display:inline-block;animation:spin .8s linear infinite;vertical-align:-2px}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo">س</div>
      <div>
        <h1>نصب سرمایه‌یار</h1>
        <div class="sub">PHP <?= htmlspecialchars($sysInfo['php']) ?> · دیتابیس: <?= htmlspecialchars($sysInfo['db']) ?>
          <?= $sysInfo['installed'] ? '· <span style="color:#86efac">قبلاً نصب شده است</span>' : '' ?></div>
      </div>
    </div>
    <div class="row">
      <button class="btn ghost small" id="themeBtn" title="تغییر پوستهٔ روشن/تاریک" aria-label="تغییر پوسته">🌙</button>
      <a class="btn ghost small" href="/">بازگشت به سایت</a>
    </div>
  </header>

  <?php if ($installed): ?>
  <div class="card">
    <h2>سایت نصب شده است ✅</h2>
    <p class="hint">برای امنیت بیشتر، فایل <code>install.php</code> را از سرور حذف یا تغییرنام دهید. اگر می‌خواهید تنظیمات را عوض کنید از پنل مدیریت استفاده کنید.</p>
    <div class="row">
      <a class="btn" href="/">ورود به سایت</a>
      <button class="btn ghost" onclick="document.getElementById('reinstallInfo').classList.toggle('hide')">نصب مجدد / بازبینی</button>
    </div>
    <div id="reinstallInfo" class="hide" style="margin-top:12px">
      <div class="note warn">اجرای دوبارهٔ ویزارد بی‌خطر است: جدول‌ها <b>IF NOT EXISTS</b> ساخته می‌شوند و رمز کاربران دست‌نخورده می‌ماند (مگر رمز مدیر جدید بدهید).</div>
    </div>
  </div>
  <?php endif; ?>

  <div class="steps" id="steps">
    <span class="step active" data-s="1">۱. پیش‌نیازها</span>
    <span class="step" data-s="2">۲. دیتابیس</span>
    <span class="step" data-s="3">۳. حساب مدیر</span>
    <span class="step" data-s="4">۴. تنظیمات سایت</span>
    <span class="step" data-s="5">۵. منابع داده</span>
    <span class="step" data-s="6">۶. داده بازار</span>
    <span class="step" data-s="7">۷. پایان نصب</span>
  </div>

  <!-- ۱ پیش‌نیازها -->
  <section class="card" data-step="1">
    <h2>بررسی پیش‌نیازها</h2>
    <p class="hint">همه‌چیز خودکار بررسی می‌شود؛ فقط موارد ضروری باید سبز باشند.</p>
    <div id="checksBox" class="list" style="margin:12px 0"><span class="spinner"></span> در حال بررسی…</div>
    <div class="row"><button class="btn" id="btnStep2" disabled>ادامه به دیتابیس</button></div>
  </section>

  <!-- ۲ دیتابیس -->
  <section class="card hide" data-step="2">
    <h2>دیتابیس</h2>
    <p class="hint">پیش‌فرض <b>SQLite</b> است: بدون هیچ تنظیمی، فایل دیتابیس خودکار ساخته می‌شود. اگر MySQL/cPanel دارید، مشخصات را وارد کنید تا خودش دیتابیس و جدول‌ها را بسازد.</p>
    <div class="grid two" style="margin-top:12px">
      <div><label>نوع دیتابیس</label>
        <select id="dbDriver">
          <option value="sqlite">SQLite — بدون تنظیم (پیشنهادی)</option>
          <option value="mysql">MySQL / MariaDB (cPanel)</option>
        </select>
      </div>
      <div><label>مسیر فایل SQLite (پیش‌فرض)</label><input id="dbPath" dir="ltr" value="data/sarmayeyar_132.sqlite" /></div>
    </div>
    <div id="mysqlFields" class="grid three hide" style="margin-top:10px">
      <div><label>هاست</label><input id="dbHost" dir="ltr" value="localhost" /></div>
      <div><label>پورت</label><input id="dbPort" dir="ltr" value="3306" /></div>
      <div><label>نام دیتابیس MySQL</label><input id="dbName" dir="ltr" value="sarmayeyar_132" /></div>
      <div><label>نام کاربری</label><input id="dbUser" dir="ltr" placeholder="root" /></div>
      <div><label>رمز عبور</label><input id="dbPass" type="password" dir="ltr" /></div>
      <div style="display:flex;align-items:flex-end"><button class="btn ghost" id="btnDbTest">تست اتصال</button></div>
    </div>
    <div id="dbResult" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="btnDbInstall">ساخت دیتابیس و جدول‌ها</button>
      <button class="btn ghost" data-back="1">مرحله قبل</button>
    </div>
  </section>

  <!-- ۳ حساب مدیر -->
  <section class="card hide" data-step="3">
    <h2>حساب مدیر</h2>
    <p class="hint">حساب پیش‌فرض مدیر با مشخصات زیر تنظیم شده است. می‌توانید همین مقادیر را ذخیره کنید یا تغییر دهید.</p>
    <div class="grid two" style="margin-top:12px">
      <div><label>نام و نام خانوادگی</label><input id="adName" value="مدیر سیستم" /></div>
      <div><label>ایمیل (نام کاربری)</label><input id="adEmail" dir="ltr" value="admin@gmail.com" /></div>
      <div><label>رمز عبور</label><input id="adPass" type="password" dir="ltr" value="11111111admin" /></div>
      <div><label>تکرار رمز عبور</label><input id="adPass2" type="password" dir="ltr" value="11111111admin" /></div>
    </div>
    <div id="adResult" style="margin-top:12px"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="btnAdmin">ساخت حساب مدیر</button>
      <button class="btn ghost" data-back="1">مرحله قبل</button>
    </div>
  </section>

  <!-- ۴ تنظیمات سایت -->
  <section class="card hide" data-step="4">
    <h2>تنظیمات سایت</h2>
    <p class="hint">بعداً هم از پنل مدیریت قابل تغییر است.</p>
    <div class="grid two" style="margin-top:12px">
      <div><label>نام سایت</label><input id="siteName" value="سرمایه‌یار" /></div>
      <div><label>شعار سایت</label><input id="siteTagline" value="سیگنال و فرصت سرمایه‌گذاری — ایران و جهان" /></div>
      <div><label>اجازهٔ ثبت‌نام کاربران جدید</label>
        <select id="allowRegister"><option value="1">بله</option><option value="0">خیر (فقط با دعوت مدیر)</option></select></div>
      <div><label>تأیید دستی حساب‌ها توسط مدیر</label>
        <select id="requireApproval"><option value="0">خیر — فعال شدن فوری</option><option value="1">بله — در انتظار تأیید</option></select></div>
      <div><label>نیاز به ورود برای دیدن سایت</label>
        <select id="requireLogin"><option value="1">بله (پیشنهادی)</option><option value="0">خیر — نمایش عمومی</option></select></div>
      <div><label>پوستهٔ پیش‌فرض</label>
        <select id="defaultTheme"><option value="dark">تاریک</option><option value="light">روشن</option></select></div>
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="btnSite">ذخیره و ادامه</button>
      <button class="btn ghost" data-back="1">مرحله قبل</button>
    </div>
  </section>

  <!-- ۵ منابع داده -->
  <section class="card hide" data-step="5">
    <h2>تست منابع دادهٔ بازار</h2>
    <p class="hint">داده‌ها زنده از منابع عمومی خوانده می‌شوند: TGJU (ایران)، Yahoo Finance (جهان)، CoinGecko (کریپتو).
      این مرحله <b>قفل‌کننده نیست</b>؛ اگر منبعی در دسترس نبود، سایت نصب می‌شود و بعداً از «تنظیمات شبکه» قابل رفع است.</p>

    <div id="srcBox" class="list" style="margin:12px 0"></div>
    <div id="srcSummary" class="hint" style="margin-bottom:10px"></div>

    <div class="row" style="margin-bottom:6px;gap:8px;flex-wrap:wrap">
      <button class="btn" id="btnSrc">اجرای تست</button>
      <button class="btn ghost" id="btnSrcRetry">↻ تلاش دوباره</button>
      <button class="btn ghost" data-back="1">مرحله قبل</button>
      <button class="btn ghost" id="btnSrcNext">ادامه به مرحله بعد ←</button>
    </div>

    <details id="netBox" style="margin-top:12px" open>
      <summary class="hint" style="cursor:pointer">تنظیمات شبکه (برای هاست‌هایی که به منابع خارجی دسترسی ندارند)</summary>
      <div class="grid two" style="margin-top:10px">
        <div>
          <label>پروکسی خروجی (اختیاری)</label>
          <input id="netProxy" dir="ltr" placeholder="http://user:pass@1.2.3.4:8080 یا socks5://1.2.3.4:1080" />
          <div class="hint">اگر هاست‌تان Yahoo/CoinGecko را باز نمی‌کند، از پروکسی سرور خودتان استفاده کنید. اگر باز می‌شود نیازی به پروکسی ندارید.</div>
        </div>
        <div>
          <label>مهلت انتظار هر درخواست (ثانیه)</label>
          <input id="netTimeout" dir="ltr" value="15" />
          <label style="margin-top:8px">منابع و تنظیمات امنیتی</label>
          <div class="row" style="gap:14px;margin-top:6px;flex-wrap:wrap">
            <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="netTgju" style="width:auto" checked /> TGJU (ایران)</label>
            <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="netYahoo" style="width:auto" checked /> Yahoo (جهان)</label>
            <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="netCg" style="width:auto" checked /> CoinGecko</label>
            <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="netInsecure" style="width:auto" /> نادیده‌گرفتن خطای گواهی SSL (رفع خطای SSL هاست)</label>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
        <button class="btn ghost small" id="btnNetSave" type="button">ذخیرهٔ تنظیمات شبکه</button>
        <button class="btn ghost small" id="btnFixSsl" type="button" style="color:var(--ok)">⚡ رفع خودکار مشکل گواهی SSL</button>
        <span class="hint" id="netMsg"></span>
      </div>
    </details>

    <div class="note warn" id="srcHelp" style="margin-top:12px;display:none">
      <b>راهنمای رفع سریع</b>
      <div id="srcHelpBody" class="hint"></div>
    </div>
  </section>

  <!-- ۶ داده بازار -->
  <section class="card hide" data-step="6">
    <h2>دریافت دادهٔ بازار</h2>
    <p class="hint">۷۰ دارایی (ایران + جهان) دریافت و تحلیل می‌شود. دریافت خودکار است و حتی اگر همین حالا انجام ندهید، بعداً در پس‌زمینه تکمیل می‌شود.</p>

    <div style="margin:16px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
        <span id="warmStatusTxt">وضعیت: آمادهٔ دریافت</span>
        <span id="warmPctTxt" style="font-weight:600">۰٪</span>
      </div>
      <div style="height:10px;background:var(--line);border-radius:6px;overflow:hidden">
        <div id="warmBar" style="height:100%;width:0%;background:var(--primary);transition:width .3s ease"></div>
      </div>
    </div>

    <div class="row" style="margin:12px 0;gap:8px;flex-wrap:wrap">
      <button class="btn" id="btnWarm">▶ دریافت خودکار داده‌ها</button>
      <button class="btn ghost" id="btnWarmMore">دریافت دستی (یک بسته)</button>
      <button class="btn ghost" id="btnFinishDirect">رد کردن و پایان نصب ←</button>
    </div>
    <div id="warmBox" class="log" style="max-height:160px;overflow-y:auto;margin-top:10px">—</div>
    <div class="row" style="margin-top:14px">
      <button class="btn" id="btnFinish">پایان نصب و ورود به برنامه 🎉</button>
    </div>
  </section>

  <!-- ۷ پایان -->
  <section class="card hide" data-step="7">
    <h2>نصب کامل شد 🎉</h2>
    <div class="note warn">برای امنیت، فایل <code>install.php</code> را حذف یا تغییرنام دهید.</div>
    <div style="margin-top:12px">
      <b>گام بعدی:</b>
      <ol class="hint" style="margin:6px 0 0">
        <li>وارد سایت شوید و با حساب مدیر وارد شوید.</li>
        <li>در تب «پرتفوی من» دارایی‌های خود را ثبت کنید تا پیشنهادها شخصی شود.</li>
        <li>برای به‌روزرسانی خودکار، این خط cron را اضافه کنید:</li>
      </ol>
      <pre id="cronLine">—</pre>
    </div>
    <div class="row" style="margin-top:12px">
      <a class="btn" href="/">ورود به سایت</a>
      <a class="btn ghost" href="?action=state" target="_blank">وضعیت نصب (JSON)</a>
    </div>
  </section>
        <li>در تب «پرتفوی من» دارایی‌های خود را ثبت کنید تا پیشنهادها شخصی شود.</li>
        <li>برای به‌روزرسانی خودکار، این خط cron را اضافه کنید:</li>
      </ol>
      <pre id="cronLine">—</pre>
    </div>
    <div class="row" style="margin-top:12px">
      <a class="btn" href="/">ورود به سایت</a>
      <a class="btn ghost" href="?action=state" target="_blank">وضعیت نصب (JSON)</a>
    </div>
  </section>
</div>
<div id="toast" class="toast"></div>

<script>
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let state = <?= u_json(['installed' => $installed, 'db' => $sysInfo['db'], 'base' => BASE_DIR]) ?>;

function toast(msg, kind='') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast ' + kind, 4200);
}
async function apiRaw(query, body, method='POST') {
  const res = await fetch('?action=' + query, {
    method, headers: {'Content-Type':'application/json'},
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error || ('خطا (' + res.status + ')'));
  return j;
}
const api = (action, body, method) => apiRaw(action, body, method);
function goto(n) {
  $$('.card[data-step]').forEach(c => c.classList.toggle('hide', +c.dataset.step !== n));
  $$('#steps .step').forEach(s => {
    const k = +s.dataset.s;
    s.classList.toggle('active', k === n);
    s.classList.toggle('done', k < n);
  });
  window.scrollTo({top:0, behavior:'smooth'});
}
function backButtons() {
  $$('[data-back]').forEach(b => b.onclick = () => goto(Math.max(1, +document.querySelector('.card[data-step]:not(.hide)').dataset.step - 1)));
}
function badge(ok, yes='سالم', no='ناموفق', warn=false) {
  return `<span class="badge ${ok ? 'ok' : (warn ? 'warn' : 'bad')}">${ok ? yes : no}</span>`;
}

/* ---------- ۱ پیش‌نیازها ---------- */
async function runChecks() {
  try {
    const r = await api('check', null, 'GET');
    $('#checksBox').innerHTML = r.checks.map(c =>
      `<div class="item"><span>${c.label}</span><span class="row" style="gap:8px">
        <span class="hint">${c.detail}</span>${badge(c.ok, 'آماده', 'نیاز به رفع', c.key === 'mysql')}</span></div>`).join('');
    $('#btnStep2').disabled = !r.ok;
  } catch (e) {
    $('#checksBox').innerHTML = '<div class="item"><span>بررسی ناموفق</span>' + badge(false,'','') + '</div>';
    toast(e.message, 'bad');
  }
}

/* ---------- ۲ دیتابیس ---------- */
$('#dbDriver').onchange = () => $('#mysqlFields').classList.toggle('hide', $('#dbDriver').value !== 'mysql');
$('#btnDbTest').onclick = async () => {
  try {
    $('#dbResult').innerHTML = '<span class="spinner"></span> در حال تست…';
    const r = await api('db-test', {
      driver: $('#dbDriver').value, path: $('#dbPath').value, host: $('#dbHost').value,
      port: $('#dbPort').value, name: $('#dbName').value, user: $('#dbUser').value, pass: $('#dbPass').value
    });
    $('#dbResult').innerHTML = `<div class="item"><span>${r.message || 'اتصال موفق'}</span>${badge(true,'موفق')}</div>`;
  } catch (e) {
    $('#dbResult').innerHTML = `<div class="item"><span>${e.message}</span>${badge(false,'ناموفق')}</div>`;
    toast(e.message, 'bad');
  }
};
$('#btnDbInstall').onclick = async () => {
  try {
    $('#dbResult').innerHTML = '<span class="spinner"></span> در حال ساخت دیتابیس و جدول‌ها…';
    // اول تنظیمات را ذخیره/تست کن، بعد migrate
    await api('db-test', {
      driver: $('#dbDriver').value, path: $('#dbPath').value, host: $('#dbHost').value,
      port: $('#dbPort').value, name: $('#dbName').value, user: $('#dbUser').value, pass: $('#dbPass').value
    }).catch(() => {});
    const r = await api('db-install', {});
    $('#dbResult').innerHTML = `<div class="item"><span>${r.message} (${r.driver})</span>${badge(true,'ساخته شد')}</div>`;
    toast('دیتابیس آماده شد', 'ok');
    setTimeout(() => goto(3), 500);
  } catch (e) { toast(e.message, 'bad'); $('#dbResult').innerHTML = `<div class="item"><span>${e.message}</span>${badge(false,'ناموفق')}</div>`; }
};

/* ---------- ۳ حساب مدیر ---------- */
$('#btnAdmin').onclick = async () => {
  const pass = $('#adPass').value;
  if (pass !== $('#adPass2').value) return toast('رمزها یکسان نیستند', 'bad');
  if (pass.length < 6) return toast('رمز باید حداقل ۶ کاراکتر باشد', 'bad');
  try {
    $('#adResult').innerHTML = '<span class="spinner"></span> در حال ساخت حساب…';
    const r = await api('create-admin', { email: $('#adEmail').value, password: pass, name: $('#adName').value });
    $('#adResult').innerHTML = `<div class="item"><span>${r.message}${r.importedLegacy ? ' (دادهٔ قبلی هم منتقل شد)' : ''}</span>${badge(true,'آماده')}</div>`;
    toast('حساب مدیر ساخته شد', 'ok');
    setTimeout(() => goto(4), 600);
  } catch (e) { toast(e.message, 'bad'); $('#adResult').innerHTML = `<div class="item"><span>${e.message}</span>${badge(false,'ناموفق')}</div>`; }
};

/* ---------- ۴ تنظیمات سایت ---------- */
$('#btnSite').onclick = async () => {
  try {
    await api('save-site', {
      siteName: $('#siteName').value, siteTagline: $('#siteTagline').value,
      allowRegister: $('#allowRegister').value === '1', requireApproval: $('#requireApproval').value === '1',
      requireLogin: $('#requireLogin').value === '1', defaultTheme: $('#defaultTheme').value
    });
    toast('تنظیمات ذخیره شد', 'ok');
    goto(5);
  } catch (e) { toast(e.message, 'bad'); }
};

/* ---------- ۵ منابع داده ---------- */
$('#btnSrc').onclick = async () => {
  $('#srcBox').innerHTML = '<div class="item"><span class="spinner"></span> در حال تست منابع…</div>';
  try {
    const r = await api('test-sources', {}, 'POST');
    const tests = r.tests || [];
    $('#srcBox').innerHTML = tests.map(t => `
      <div class="item" style="align-items:flex-start">
        <span>${t.label}${t.optional ? ' <span class="hint">(اختیاری)</span>' : ''}<div class="hint">${t.reason || t.detail || ''}</div></span>
        <span class="row" style="gap:8px;flex:0 0 auto">${t.status ? '<span class="hint">HTTP ' + t.status + '</span>' : ''}${t.ms ? '<span class="hint">' + t.ms + 'ms</span>' : ''}${badge(t.ok)}</span>
      </div>`).join('') || '<div class="item"><span>نتیجه‌ای برنگشت</span>' + badge(false) + '</div>';
    const reach = tests.some(t => t.ok);
    $('#srcSummary').innerHTML = r.summary || '';
    const hasSslIssue = tests.some(t => !t.ok && ((t.reason || '').includes('SSL') || (t.reason || '').includes('گواهی')));
    if (!reach || hasSslIssue) {
      $('#srcHelp').style.display = 'block';
      let helpMsg = '';
      if (hasSslIssue) {
        helpMsg += '<div style="margin-bottom:8px;padding:8px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:6px">💡 <b>شما نیازی به پروکسی ندارید!</b> اینترنت سرور شما کاملاً وصل است؛ فقط گواهی امنیتی محلی PHP هاست موجود نیست. دکمهٔ «⚡ رفع خودکار مشکل گواهی SSL» را در پایین بزنید تا حل شود.</div>';
      }
      helpMsg += tests.filter(t => !t.ok && !t.optional).map(t => '• ' + (t.hint || '')).join('<br>');
      helpMsg += '<br>• اگر «اتصال کلی سرور به اینترنت» هم قرمز است، سرور شما دسترسی خروجی ندارد (با پشتیبانی هاست تماس بگیرید).';
      helpMsg += '<br>• راه‌حل معمول: اگر هاست ایرانی است و یاهو مسدود است، یک پروکسی HTTP/SOCKS5 بدهید، یا منبع مسدود را خاموش کنید و با بقیه ادامه دهید.';
      $('#srcHelpBody').innerHTML = helpMsg;
    } else {
      $('#srcHelp').style.display = 'none';
    }
    toast(reach ? 'منابع داده در دسترس‌اند' : 'منابع زنده در دسترس نبودند؛ می‌توانید ادامه دهید', reach ? 'ok' : 'warn');
  } catch (e) {
    toast('عیب‌یابی ناموفق: ' + e.message, 'bad');
    $('#srcBox').innerHTML = '<div class="item"><span>عیب‌یابی ناموفق بود<div class="hint">' + e.message + '</div></span>' + badge(false) + '</div>';
    $('#srcSummary').textContent = 'می‌توانید بدون تست ادامه دهید؛ این مرحله اجباری نیست.';
  }
};
$('#btnSrcNext').onclick = () => goto(6);
$('#btnSrcRetry').onclick = () => $('#btnSrc').click();

/* ---------- تنظیمات شبکه ---------- */
async function loadNet() {
  try {
    const r = await api('net-get', {}, 'POST');
    const n = r.net || {};
    $('#netProxy').value = n.proxy || '';
    $('#netTimeout').value = n.timeout || 15;
    $('#netTgju').checked = !!n.tgju;
    $('#netYahoo').checked = !!n.yahoo;
    $('#netCg').checked = !!n.coingecko;
    $('#netInsecure').checked = !!n.insecure;
    $('#netMsg').textContent = r.curl ? '' : 'هشدار: افزونهٔ cURL روی این هاست فعال نیست؛ سرعت و پایداری کمتر است.';
  } catch (e) { /* دیتابیس هنوز آماده نیست */ }
}
$('#btnNetSave').onclick = async () => {
  $('#netMsg').textContent = 'در حال ذخیره…';
  try {
    await api('net-save', {
      proxy: $('#netProxy').value.trim(), timeout: +$('#netTimeout').value || 15,
      tgju: $('#netTgju').checked, yahoo: $('#netYahoo').checked, coingecko: $('#netCg').checked,
      insecure: $('#netInsecure').checked,
    }, 'POST');
    $('#netMsg').textContent = 'ذخیره شد ✓ حالا «اجرای تست» را بزنید.';
    toast('تنظیمات شبکه ذخیره شد', 'ok');
  } catch (e) { $('#netMsg').textContent = 'خطا: ' + e.message; toast(e.message, 'bad'); }
};
$('#btnFixSsl').onclick = async () => {
  $('#netInsecure').checked = true;
  await $('#btnNetSave').click();
  $('#btnSrc').click();
};

/* ---------- ۶ داده بازار ---------- */
function warmLog(msg) {
  const box = $('#warmBox');
  if (box) box.innerHTML = `<div>${msg}</div>` + box.innerHTML;
}

let warmingRunning = false;

function updateWarmUi(done, total, status) {
  total = total || 70;
  done = Math.min(total, Math.max(0, done || 0));
  const pct = Math.round((done / total) * 100);
  if ($('#warmPctTxt')) $('#warmPctTxt').textContent = pct + '٪';
  if ($('#warmBar')) $('#warmBar').style.width = pct + '%';
  const statusFa = (status === 'ready' || done >= total) ? 'تکمیل شد ✓' : (status === 'warming' ? 'در حال دریافت…' : (status || 'در حال آماده‌سازی'));
  if ($('#warmStatusTxt')) $('#warmStatusTxt').innerHTML = `وضعیت: <b>${statusFa}</b> — ${done} از ${total} دارایی`;
  if (status === 'ready' || done >= total) {
    if ($('#warmBar')) $('#warmBar').style.background = 'var(--ok)';
  }
}

async function runWarmLoop() {
  if (warmingRunning) return;
  warmingRunning = true;
  $('#btnWarm').disabled = true;
  $('#btnWarm').textContent = 'در حال دریافت خودکار…';

  try {
    let done = 0, total = 70, status = 'warming';
    let attempts = 0;
    while (status !== 'ready' && attempts < 8 && warmingRunning) {
      attempts++;
      warmLog(`درخواست بستهٔ ${attempts} از سرور…`);
      const r = await apiRaw('warm&budget=12000', {});
      done = r.done ?? r.market?.counts?.ok ?? r.warm?.done ?? 0;
      total = r.total ?? r.market?.counts?.total ?? r.warm?.total ?? 70;
      status = r.status || (done >= total ? 'ready' : 'warming');
      updateWarmUi(done, total, status);
      warmLog(`پاس ${attempts}: ${done} از ${total} دارایی آماده شد.`);
      if (status === 'ready' || done >= total) break;
      await new Promise(res => setTimeout(res, 350));
    }
    if (status === 'ready' || done >= total) {
      warmLog('<b>✅ تمام داده‌های بازار با موفقیت دریافت و آماده شدند!</b>');
      toast('داده‌های بازار با موفقیت آماده شد', 'ok');
    }
  } catch (e) {
    warmLog(`<span style="color:var(--bad)">خطا: ${e.message} (می‌توانید «پایان نصب» را بزنید و ادامه دهید)</span>`);
  } finally {
    warmingRunning = false;
    $('#btnWarm').disabled = false;
    $('#btnWarm').textContent = '▶ دریافت مجدد داده‌ها';
  }
}

$('#btnWarm').onclick = () => runWarmLoop();
$('#btnWarmMore').onclick = async () => {
  try {
    const r = await apiRaw('warm&budget=15000', {});
    const done = r.done ?? r.market?.counts?.ok ?? 0;
    const total = r.total ?? r.market?.counts?.total ?? 70;
    updateWarmUi(done, total, r.status);
    warmLog(`دریافت دستی: ${done} از ${total} آماده شد.`);
  } catch (e) { warmLog('خطا: ' + e.message); }
};

const finishInstall = async () => {
  try {
    await api('finish', {});
    $('#cronLine').textContent = '*/5 * * * * cd <?= htmlspecialchars(BASE_DIR) ?> && php tools/cron-warm.php >/dev/null 2>&1';
    goto(7);
  } catch (e) { toast(e.message, 'bad'); }
};

$('#btnFinish').onclick = finishInstall;
$('#btnFinishDirect').onclick = finishInstall;

/* ---------- تم روشن/تاریک ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
  const b = $('#themeBtn');
  if (b) { b.textContent = document.documentElement.dataset.theme === 'light' ? '☀️' : '🌙'; b.title = document.documentElement.dataset.theme === 'light' ? 'تاریک کن' : 'روشن کن'; }
  try { localStorage.setItem('sy_install_theme', document.documentElement.dataset.theme); } catch (e) {}
}
$('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');

/* ---------- راه‌اندازی ---------- */
applyTheme(document.documentElement.dataset.theme || 'dark');
$('#btnStep2').onclick = () => goto(2);
runChecks();
loadNet();
backButtons();
if (state.installed) { /* نصب قبلی: کاربر می‌تواند بازبینی کند */ }
</script>
</body>
</html>
