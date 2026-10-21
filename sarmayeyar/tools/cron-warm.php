<?php
/**
 * به‌روزرسانی دوره‌ای داده بازار + اجرای تحلیل خودکار هوش مصنوعی
 * این فایل برای Cron طراحی شده است.
 *
 * خط cron پیشنهادی (هر ۵ دقیقه):
 *   cd /path/to/sarmayeyar && php tools/cron-warm.php >/dev/null 2>&1
 *
 * گزینه‌ها:
 *   --force        پاک‌کردن کش بازار و دریافت کامل تازه
 *   --budget=25    بودجه زمانی هر اجرا (ثانیه) — پیش‌فرض ۲۵
 *   --no-ai        فقط داده بازار، بدون اجرای تحلیل هوش مصنوعی
 */
declare(strict_types=1);
define('SARMAYEYAR', 1);
define('BASE_DIR', dirname(__DIR__));
define('PUBLIC_DIR', BASE_DIR);

$args = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z0-9-]+)(?:=(.*))?$/i', $a, $m)) $args[$m[1]] = $m[2] ?? true;
}

if (getenv('SARMAYEYAR_DATA')) define('DATA_DIR', rtrim(getenv('SARMAYEYAR_DATA'), '/'));
elseif (is_file(BASE_DIR . '/config.php')) { require BASE_DIR . '/config.php'; if (!defined('DATA_DIR')) define('DATA_DIR', BASE_DIR . '/data'); }
else define('DATA_DIR', BASE_DIR . '/data');

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

$t0 = microtime(true);
$budget = max(10, min(120, (int) ($args['budget'] ?? 25))) * 1000;
$force = !empty($args['force']);

u_log('cron start' . ($force ? ' (force)' : ''));

/* داده بازار */
$rounds = 0;
while (true) {
    $r = market_ensure((int) $budget, $rounds === 0 ? $force : false);
    $rounds++;
    if (($r['status'] ?? '') === 'ready' && !empty($r['served'] ?? null) === false) {
        if (($r['status'] ?? '') === 'ready') break;
    }
    $st = market_status();
    if (($st['warm']['status'] ?? '') === 'ready') break;
    if ($rounds > 4) break;
}
$st = market_status();
u_log('cron market: ' . u_json($st['snapshot'] ?? ['status' => 'idle']));

/* تحلیل خودکار هوش مصنوعی برای همهٔ کاربران (اگر روشن و زمانش رسیده باشد) */
$auto = null;
$autoList = [];
if (empty($args['no-ai'])) {
    try {
        if (db_ok()) {
            /* حالت چندکاربره: هر کاربرِ دارای حالت ذخیره‌شده بررسی می‌شود */
            foreach (store_all_user_ids() as $uid) {
                store_set_user($uid);
                try {
                    $s = store_load(true);
                    if (empty($s['ai']['autoMode'])) continue;
                    $last = (int) ($s['ai']['lastRunAt'] ?? 0);
                    $interval = max(5, (int) ($s['ai']['autoIntervalMin'] ?? 60)) * 60000;
                    if ($last && (u_now_ms() - $last) < $interval) continue;
                    $r = ai_run_auto($s, 'cron');
                    $autoList[] = ['user' => $uid, 'model' => $r['model'] ?? '', 'ok' => (bool) ($r['analysis'] ?? null)];
                    if (function_exists('admin_log_ai_usage')) admin_log_ai_usage($uid, (string) ($r['model'] ?? ''), 'ok', (int) ($r['durationMs'] ?? 0));
                    u_log('cron auto-analysis: user=' . $uid . ' ' . ($r['model'] ?? '') . ' => ' . ($r['analysis'] ? 'ok' : 'unparsed'));
                } catch (Throwable $e) {
                    if (function_exists('admin_log_ai_usage')) admin_log_ai_usage($uid, '', 'error', 0);
                    u_log('cron auto-analysis failed (user ' . $uid . '): ' . $e->getMessage());
                } finally { store_reset_user(); }
            }
        } else {
            /* حالت تک‌کاربرهٔ فایلی */
            $auto = ai_maybe_auto_run(store_load());
            if ($auto) u_log('cron auto-analysis: ' . ($auto['model'] ?? '') . ' => ' . ($auto['analysis'] ? 'ok' : 'unparsed'));
        }
    } catch (Throwable $e) {
        u_log('cron auto-analysis failed: ' . $e->getMessage());
    }
}

u_log(sprintf('cron done in %.1fs', microtime(true) - $t0));
if (PHP_SAPI === 'cli') {
    echo 'cron: market=' . ($st['snapshot']['status'] ?? 'idle')
       . ' ok=' . ($st['snapshot']['counts']['ok'] ?? 0)
       . ($auto ? ' ai=' . ($auto['model'] ?? 'done') : '')
       . ($autoList ? ' ai-users=' . count($autoList) : '')
       . sprintf(' (%.1fs)', microtime(true) - $t0) . PHP_EOL;
}
