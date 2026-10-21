<?php
/**
 * لایهٔ ذخیره‌سازی حالت کاربر — بدون کلاس، فقط توابع
 * ----------------------------------------------------
 * هر کاربر یک «حالت» دارد: پروفایل، پرتفوی، تنظیمات هوش مصنوعی، گفتگو، سیگنال‌ها.
 * نگهداری حالت به دو شکل ممکن است:
 *   ۱) دیتابیس (جدول user_state) — پیش‌فرض جدید؛ چندکاربره
 *   ۲) فایل data/store.json — حالت مهمان/تک‌کاربره و پشتیبان
 * دادهٔ بازار (cache.json) مشترک همهٔ کاربران است.
 */
if (!defined('SARMAYEYAR')) exit;

function store_paths(): array {
    static $p = null;
    if ($p !== null) return $p;
    $dir = defined('DATA_DIR') ? DATA_DIR : (__DIR__ . '/../data');
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $p = ['dir' => rtrim($dir, '/'), 'store' => rtrim($dir, '/') . '/store.json', 'cache' => rtrim($dir, '/') . '/cache.json'];
    return $p;
}

/* ------------------------------ کاربر جاری ذخیره‌سازی ------------------------------ */

function store_user_id(): int {
    static $forced = false;
    static $uid = 0;
    if ($forced) return $uid;
    return function_exists('auth_id') ? (int) (auth_id() ?? 0) : 0;
}

/** تعیین صریح کاربر (برای cron و پنل مدیریت) */
function store_set_user(?int $uid): void {
    $GLOBALS['__store_uid_forced'] = true;
    $GLOBALS['__store_uid'] = (int) ($uid ?? 0);
}

function store_reset_user(): void { $GLOBALS['__store_uid_forced'] = false; }

function store_current_uid(): int {
    if (!empty($GLOBALS['__store_uid_forced'])) return (int) ($GLOBALS['__store_uid'] ?? 0);
    return function_exists('auth_id') ? (int) (auth_id() ?? 0) : 0;
}

/* ------------------------------ ساختار پیش‌فرض ------------------------------ */

function store_default(): array {
    return [
        'createdAt' => date('c'),
        'profile' => [
            'name' => '', 'risk' => 'balanced', 'horizon' => 'mid',
            'investableCash' => 0, 'baseCurrency' => 'toman',
        ],
        'portfolio' => [],
        'ai' => [
            'provider' => 'openai', 'baseUrl' => '', 'apiKey' => '', 'model' => 'auto',
            'temperature' => 0.3, 'autoMode' => false, 'autoIntervalMin' => 60,
            'lastModels' => [], 'autoPick' => null, 'lastRunAt' => null, 'lastRunStatus' => null,
        ],
        'settings' => ['signalCount' => 8, 'warmSeconds' => 18, 'warmBatch' => 22],
        'signals' => [],
        'chat' => [],
    ];
}

/* ------------------------------ خواندن/نوشتن ------------------------------ */

/** نگهداری حالت در حافظهٔ درخواست — برای هر کاربر جداگانه */
function store_state(?array $set = null): array {
    static $cache = [];
    $uid = store_current_uid();
    if ($set !== null) { $cache[$uid] = $set; return $set; }
    if (isset($cache[$uid])) return $cache[$uid];
    return $cache[$uid] = store_read($uid);
}

function store_state_reset(): void {
    // با ست کردن یک آرایه روی همان uid کلید، کش بازنویسی می‌شود
    $uid = store_current_uid();
    store_state(store_read($uid));
}

function store_read(int $uid): array {
    $default = store_default();
    if ($uid > 0 && db_ok()) {
        try {
            $row = db_one('SELECT json FROM user_state WHERE user_id = ?', [$uid]);
            if ($row && is_string($row['json']) && $row['json'] !== '') {
                $data = json_decode($row['json'], true);
                if (is_array($data)) return u_deep_merge($default, $data);
            }
            return $default;
        } catch (Throwable $e) { u_log('store_read db failed: ' . $e->getMessage()); }
    }
    $file = store_paths()['store'];
    if (is_file($file)) {
        $raw = @file_get_contents($file);
        $data = $raw ? json_decode($raw, true) : null;
        if (is_array($data)) return u_deep_merge($default, $data);
    }
    return $default;
}

function store_load(bool $force = false): array {
    if ($force) {
        $uid = store_current_uid();
        return store_state(store_read($uid));
    }
    return store_state();
}

function store_write_atomic(string $file, string $content): bool {
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) return false;
    return @rename($tmp, $file);
}

function store_save(array $s): array {
    $uid = store_current_uid();
    if ($uid > 0 && db_ok()) {
        try {
            $json = u_json($s);
            $exists = db_val('SELECT COUNT(*) FROM user_state WHERE user_id = ?', [$uid]);
            if ((int) $exists > 0) {
                db_exec('UPDATE user_state SET json = ?, updated_at = ? WHERE user_id = ?', [$json, db_now_ms(), $uid]);
            } else {
                db_exec('INSERT INTO user_state (user_id, json, updated_at) VALUES (?,?,?)', [$uid, $json, db_now_ms()]);
            }
            store_state($s);
            return $s;
        } catch (Throwable $e) { u_log('store_save db failed: ' . $e->getMessage()); }
    }
    store_write_atomic(store_paths()['store'], u_json($s, JSON_PRETTY_PRINT));
    store_state($s);
    return $s;
}

function store_patch(array $patch): array {
    $s = u_deep_merge(store_load(), $patch);
    store_save($s);
    return $s;
}

/** حالت عمومی (بدون کلید API) برای مرورگر */
function store_public(array $s): array {
    $s['ai']['hasKey'] = !empty($s['ai']['apiKey']);
    $s['ai']['apiKey'] = null;
    return $s;
}

/** فهرست شناسهٔ کاربران دارای حالت ذخیره‌شده (برای cron) */
function store_all_user_ids(): array {
    if (!db_ok()) return [0];
    try {
        $ids = [];
        foreach (db_all('SELECT id FROM users WHERE status = ?', ['active']) as $r) $ids[] = (int) $r['id'];
        foreach (db_all('SELECT user_id FROM user_state') as $r) {
            $id = (int) $r['user_id'];
            if ($id > 0 && !in_array($id, $ids, true)) $ids[] = $id;
        }
        return $ids ?: [0];
    } catch (Throwable $e) { return [0]; }
}

/** انتقال حالت قدیمی فایلی به دیتابیس (یک‌بار در نصب/ارتقا) */
function store_import_legacy(int $userId): bool {
    if ($userId <= 0 || !db_ok()) return false;
    try {
        $exists = (int) db_val('SELECT COUNT(*) FROM user_state WHERE user_id = ?', [$userId]);
        if ($exists > 0) return false;
        $file = store_paths()['store'];
        if (!is_file($file)) return false;
        $data = json_decode((string) @file_get_contents($file), true);
        if (!is_array($data)) return false;
        $merged = u_deep_merge(store_default(), $data);
        unset($merged['ai']['apiKey']);   // کلید از نسخهٔ قبلی منتقل نمی‌شود؛ امن‌تر است
        db_exec('INSERT INTO user_state (user_id, json, updated_at) VALUES (?,?,?)', [$userId, u_json($merged), db_now_ms()]);
        @rename($file, $file . '.imported');
        return true;
    } catch (Throwable $e) { u_log('legacy import failed: ' . $e->getMessage()); return false; }
}

/* ============================ کش (مشترک همهٔ کاربران) ============================ */

function cache_state(?array $set = null): array {
    static $c = null;
    if ($set !== null) { $c = $set; return $c; }
    if ($c === null) $c = cache_read_file();
    return $c;
}

function cache_read_file(): array {
    $file = store_paths()['cache'];
    $raw = is_file($file) ? @file_get_contents($file) : '';
    $data = $raw ? json_decode($raw, true) : null;
    return is_array($data) ? $data : [];
}

function cache_load(bool $force = false): array {
    if ($force) return cache_state(cache_read_file());
    return cache_state();
}

function cache_set(string $key, $value): void {
    $c = cache_load(true);
    $c[$key] = ['t' => u_now_ms(), 'v' => $value];
    store_write_atomic(store_paths()['cache'], u_json($c));
    cache_state($c);
}

function cache_set_many(array $items): void {
    if (!$items) return;
    $c = cache_load(true);
    $t = u_now_ms();
    foreach ($items as $k => $v) $c[$k] = ['t' => $t, 'v' => $v];
    store_write_atomic(store_paths()['cache'], u_json($c));
    cache_state($c);
}

function cache_entry(string $key): ?array {
    $c = cache_load();
    return $c[$key] ?? null;
}

function cache_get(string $key, ?int $ttl_ms = null) {
    $e = cache_entry($key);
    if ($e === null) return null;
    if ($ttl_ms !== null && (u_now_ms() - (int) $e['t']) > $ttl_ms) return null;
    return $e['v'];
}

function cache_stale(string $key) {
    $e = cache_entry($key);
    return $e === null ? null : $e['v'];
}

function cache_age_ms(string $key): ?int {
    $e = cache_entry($key);
    return $e === null ? null : (u_now_ms() - (int) $e['t']);
}

function cache_forget(string $key): void {
    $c = cache_load(true);
    if (isset($c[$key])) { unset($c[$key]); store_write_atomic(store_paths()['cache'], u_json($c)); }
}

/** پاک‌سازی کل کش بازار (نگه‌داشتن تحلیل‌های هوش مصنوعی) */
function cache_flush_market(): void {
    $c = cache_load(true);
    $keep = [];
    foreach ($c as $k => $v) {
        if (str_starts_with($k, 'ai:')) $keep[$k] = $v;
    }
    store_write_atomic(store_paths()['cache'], u_json($keep));
}

/** کلید کش مخصوص کاربر جاری (برای تحلیل هوش مصنوعی) */
function cache_user_key(string $suffix): string {
    $uid = store_current_uid();
    return $uid > 0 ? ('ai:u' . $uid . ':' . $suffix) : ('ai:' . $suffix);
}

function cache_user_flush_all(int $uid): void {
    $c = cache_load(true);
    $changed = false;
    foreach ($c as $k => $v) {
        if (str_starts_with($k, 'ai:u' . $uid . ':')) { unset($c[$k]); $changed = true; }
    }
    if ($changed) store_write_atomic(store_paths()['cache'], u_json($c));
}
