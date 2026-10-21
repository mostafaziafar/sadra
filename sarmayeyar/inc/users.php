<?php
/**
 * پل کاربر/حالت — توابع کمکی مشترک بین وب، پنل مدیریت و خط فرمان
 */
if (!defined('SARMAYEYAR')) exit;

/** اجرای یک تابع در بافت یک کاربر مشخص (برای cron و ابزارها) */
function with_user(int $uid, callable $fn) {
    store_set_user($uid);
    try { return $fn(); }
    finally { store_reset_user(); }
}

/** فهرست کاربران فعال (بدون جزئیات حساس) */
function users_active_ids(): array {
    if (!db_ok()) return [];
    try {
        $out = [];
        foreach (db_all('SELECT id FROM users WHERE status = ? ORDER BY id', ['active']) as $r) $out[] = (int) $r['id'];
        return $out;
    } catch (Throwable $e) { return []; }
}

/** ساخت/به‌روزرسانی جدول‌ها + ساخت نخستین مدیر (نصب برنامه‌ای) */
function users_bootstrap(string $email, string $password, string $name = ''): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'اتصال دیتابیس برقرار نیست.'];
    $m = db_migrate();
    if (!$m['ok']) return ['ok' => false, 'error' => $m['error']];
    if (!empty(settings_all())) { /* از قبل تنظیمات دارد */ } else {
        foreach (settings_defaults() as $k => $v) setting_set($k, $v);
    }
    $count = (int) db_val('SELECT COUNT(*) FROM users');
    if ($count > 0) return ['ok' => true, 'existing' => true, 'message' => 'کاربران قبلاً ساخته شده‌اند.'];
    $r = auth_register($email, $password, $name, true);
    if (!$r['ok']) return $r;
    store_import_legacy((int) $r['id']);
    return array_merge($r, ['ok' => true, 'message' => 'مدیر ساخته شد.']);
}
