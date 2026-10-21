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
 * سرمایه‌یار — PHP (بدون فریم‌ورک)
 * تنها نقطه ورود برنامه: مسیردهی API + سرو کردن فایل‌های استاتیک
 *
 * نصب آسان: فایل‌ها را در public_html بگذارید و سایت را باز کنید.
 * اگر خواستید داده‌ها بیرون از public_html باشند، فایل config.php بسازید:
 *   <?php define('DATA_DIR', '/home/USER/sarmayeyar-data');
 */

define('SARMAYEYAR', 1);
define('BASE_DIR', __DIR__);
define('PUBLIC_DIR', __DIR__);

// مسیر داده (قابل بازنویسی با config.php یا متغیر محیطی)
if (getenv('SARMAYEYAR_DATA')) define('DATA_DIR', rtrim(getenv('SARMAYEYAR_DATA'), '/'));
else define('DATA_DIR', __DIR__ . '/data');

if (is_file(__DIR__ . '/config.php')) require __DIR__ . '/config.php';

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
require_once __DIR__ . '/inc/api.php';

date_default_timezone_set('Asia/Tehran');

/* نشست کاربر (کوکی امن) */
auth_start_session();

/* اگر نصب تمام نشده و کاربر به صفحهٔ اصلی آمده، راهنمای نصب نشان بده */
function sy_needs_install(): bool {
    $flag = store_paths()['dir'] . '/installed.lock';
    return !is_file($flag) && !auth_installed();
}

/* مسیر نسبی (پشتیبانی از نصب در زیرپوشه) */
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
if ($scriptDir && $scriptDir !== '/' && str_starts_with($uri, $scriptDir)) {
    $uri = substr($uri, strlen($scriptDir));
}
if ($uri === '' || $uri === false) $uri = '/';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'OPTIONS') { api_send(204, []); }

/* ------------------- هدایت به نصب‌کننده (نصب تمام نشده) ------------------- */
if (sy_needs_install() && !str_starts_with($uri, '/api/') && !preg_match('~/(install\.php|install-cli\.php|db\.json)$~', $uri)) {
    if (PHP_SAPI === 'cli-server') { /* اجازهٔ سرو فایل‌ها */ }
    else { header('Location: install.php'); exit; }
}
if (sy_needs_install() && $uri === '/' && PHP_SAPI === 'cli-server') {
    require __DIR__ . '/install.php';
    exit;
}

/* ------------------------------- API ------------------------------- */
if (str_starts_with($uri, '/api/')) {
    try {
        api_handle($uri, $method);
    } catch (Throwable $e) {
        u_log('API error ' . $uri . ': ' . $e->getMessage());
        api_send(500, ['error' => $e->getMessage() ?: 'خطای سرور']);
    }
}

/* ------------------------ فایل‌های استاتیک ------------------------ */
$mime = [
    'html' => 'text/html; charset=utf-8', 'js' => 'application/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8', 'json' => 'application/json; charset=utf-8',
    'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
    'ico' => 'image/x-icon', 'webp' => 'image/webp', 'woff' => 'font/woff', 'woff2' => 'font/woff2',
    'txt' => 'text/plain; charset=utf-8', 'csv' => 'text/csv; charset=utf-8', 'map' => 'application/json',
];

$rel = ltrim($uri, '/');
if ($rel === '') $rel = 'index.html';

/* پشتیبانی از دو ساختار:
   الف) حالت «هاست ساده»: index.php و فایل‌های UI کنار هم در public_html
   ب) حالت پروژه: فایل‌های UI داخل پوشه public/
   و اگر فایل‌های UI در ریشه نبودند، از پوشه public/ سرو می‌شوند. */
$roots = [PUBLIC_DIR, PUBLIC_DIR . '/public'];
$served = false;
foreach ($roots as $root) {
    $base = realpath($root);
    if (!$base) continue;
    $cand = realpath($base . '/' . $rel);
    if (!$cand || !str_starts_with($cand, $base) || !is_file($cand)) continue;
    $ext = strtolower(pathinfo($cand, PATHINFO_EXTENSION));
    if ($ext === 'php') {
        // فایل‌های PHP باید اجرا شوند، نه سرو شدن.
        // در سرور داخلی PHP (php -S با روتر) خودمان اجرا می‌کنیم؛
        // در وب‌سرور واقعی (Apache/nginx) این فایل‌ها مستقیم اجرا می‌شوند و به اینجا نمی‌رسند.
        if (PHP_SAPI === 'cli-server' && basename($cand) !== 'index.php') { require $cand; exit; }
        continue;
    }
    header('Content-Type: ' . ($mime[$ext] ?? 'application/octet-stream'));
    header('Cache-Control: ' . ($ext === 'html' ? 'no-cache' : 'public, max-age=300'));
    readfile($cand);
    $served = true;
    break;
}
if ($served) exit;

/* ------------------------ 404 ------------------------ */
http_response_code(404);
header('Content-Type: text/html; charset=utf-8');
echo '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>۴۰۴</title>'
   . '<body style="font-family:Tahoma;background:#0b1020;color:#e8ecf6;padding:40px;text-align:center">'
   . '<h2>صفحه پیدا نشد</h2><p><a style="color:#22d3ee" href="./">بازگشت به داشبورد سرمایه‌یار</a></p>'
   . '<p style="color:#96a0b5;font-size:12px">اگر تازه نصب کرده‌اید، ابتدا <a style="color:#22d3ee" href="install.php">install.php</a> را اجرا کنید.</p></body></html>';
