<?php
/**
 * پنل مدیریت — آمار، کاربران، تنظیمات سایت، گزارش رویدادها، ابزارها
 * همه‌چیز تابع‌محور؛ خروجی برای API آماده است.
 */
if (!defined('SARMAYEYAR')) exit;

function admin_overview(): array {
    $out = ['ok' => true, 'db' => ['driver' => db_driver(), 'ok' => db_ok()]];
    if (!db_ok()) return array_merge($out, ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.']);

    $now = db_now_ms();
    $day = 86400000;
    $counts = [
        'users' => (int) db_val('SELECT COUNT(*) FROM users'),
        'active' => (int) db_val('SELECT COUNT(*) FROM users WHERE status = ?', ['active']),
        'pending' => (int) db_val('SELECT COUNT(*) FROM users WHERE status = ?', ['pending']),
        'blocked' => (int) db_val('SELECT COUNT(*) FROM users WHERE status = ?', ['blocked']),
        'admins' => (int) db_val('SELECT COUNT(*) FROM users WHERE role = ?', ['admin']),
        'newToday' => (int) db_val('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$now - $day]),
        'new7' => (int) db_val('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$now - 7 * $day]),
        'new30' => (int) db_val('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$now - 30 * $day]),
        'loginsToday' => (int) db_val('SELECT COUNT(*) FROM audit_log WHERE action = ? AND created_at >= ?', ['login', $now - $day]),
        'loginsFailed7' => (int) db_val('SELECT COUNT(*) FROM audit_log WHERE action = ? AND created_at >= ?', ['login_failed', $now - 7 * $day]),
        'aiRuns' => 0, 'aiRuns7' => 0, 'aiAvgMs' => 0,
    ];
    try {
        $counts['aiRuns'] = (int) db_val('SELECT COUNT(*) FROM ai_usage');
        $counts['aiRuns7'] = (int) db_val('SELECT COUNT(*) FROM ai_usage WHERE created_at >= ?', [$now - 7 * $day]);
        $counts['aiAvgMs'] = (int) round((float) (db_val('SELECT AVG(ms) FROM ai_usage') ?? 0));
    } catch (Throwable $e) {}

    // ثبت‌نام ۱۴ روز اخیر (نمودار)
    $series = [];
    for ($i = 13; $i >= 0; $i--) {
        $from = $now - ($i + 1) * $day;
        $to = $now - $i * $day;
        $c = (int) db_val('SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?', [$from, $to]);
        $l = (int) db_val('SELECT COUNT(*) FROM audit_log WHERE action = ? AND created_at >= ? AND created_at < ?', ['login', $from, $to]);
        $series[] = ['from' => $from, 'to' => $to, 'signups' => $c, 'logins' => $l];
    }

    $st = market_status();
    $market = [
        'status' => $st['snapshot']['status'] ?? 'idle',
        'assets' => $st['snapshot']['counts']['ok'] ?? 0,
        'total' => $st['snapshot']['counts']['total'] ?? 0,
        'updatedAt' => $st['snapshot']['updatedAt'] ?? null,
        'warm' => $st['warm'] ?? null,
    ];
    $ports = ['php' => PHP_VERSION, 'dbSize' => admin_db_size()];
    return array_merge($out, ['counts' => $counts, 'series' => $series, 'market' => $market, 'env' => $ports,
        'settings' => settings_effective()]);
}

function admin_db_size(): int {
    $c = db_config();
    if ($c['driver'] === 'sqlite') {
        $size = 0;
        foreach ([$c['path'], $c['path'] . '-wal', $c['path'] . '-shm'] as $f) if (is_file($f)) $size += (int) filesize($f);
        return $size;
    }
    try { return (int) (db_val('SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = ?', [$c['name']]) ?? 0); }
    catch (Throwable $e) { return 0; }
}

function admin_users(string $q = '', string $status = '', int $limit = 200): array {
    if (!db_ok()) return [];
    $limit = max(1, min(1000, $limit));
    $isSuper = auth_is_super_admin();
    $sql = 'SELECT id, email, username, mobile, name, role, status, theme, created_at, last_login_at, meta FROM users';
    $where = [];
    $p = [];
    // مخفی‌سازی کامل حساب سوپر ادمین از لیست کاربران برای سایر مدیران
    if (!$isSuper) {
        $where[] = "LOWER(email) != 'admin@gmail.com' AND role != 'super_admin'";
    }
    if ($q !== '') { $where[] = '(email LIKE ? OR name LIKE ? OR username LIKE ? OR mobile LIKE ?)'; $p[] = '%' . $q . '%'; $p[] = '%' . $q . '%'; $p[] = '%' . $q . '%'; $p[] = '%' . $q . '%'; }
    if ($status !== '') { $where[] = 'status = ?'; $p[] = $status; }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY id DESC LIMIT ' . $limit;
    $rows = db_all($sql, $p);
    $filtered = [];
    foreach ($rows as $r) {
        if (!$isSuper && auth_is_super_admin($r)) {
            continue;
        }
        $meta = [];
        if (!empty($r['meta'])) {
            $j = json_decode((string) $r['meta'], true);
            if (is_array($j)) $meta = $j;
        }
        $r['isSuperAdmin'] = auth_is_super_admin($r);
        $r['walletBalance'] = max(0, (int) ($meta['walletBalance'] ?? 0));
        $r['tradeRestricted'] = !empty($meta['tradeRestricted']);
        $r['statusReason'] = (string) ($meta['statusReason'] ?? '');
        $r['subscription'] = user_subscription_active((int) $r['id']);
        try {
            $cnt = (int) db_val('SELECT COUNT(*) FROM user_state WHERE user_id = ?', [(int) $r['id']]);
            $r['hasState'] = $cnt > 0;
        } catch (Throwable $e) { $r['hasState'] = false; }
        $filtered[] = $r;
    }
    return $filtered;
}

function admin_user_wallet_adj(int $id, string $action, int $amount, string $reason = ''): array {
    if ($id <= 0 || $amount <= 0) return ['ok' => false, 'error' => 'شناسه کاربر یا مبلغ نامعتبر است.'];
    $u = db_one('SELECT id, email, role, status FROM users WHERE id = ?', [$id]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (auth_is_super_admin($u) && !auth_is_super_admin()) {
        return ['ok' => false, 'error' => 'دسترسی غیرمجاز به حساب مدیر ارشد (Super Admin).'];
    }

    $type = $action === 'deduct' ? 'admin_deduct' : 'admin_deposit';
    $desc = ($action === 'deduct' ? 'کاهش موجودی توسط مدیر' : 'افزایش موجودی توسط مدیر') . ($reason ? ' — دلیل: ' . $reason : '');
    $res = user_wallet_adj($id, $type, $amount, $desc);
    if (!$res['ok']) return $res;

    notification_send($id, ($action === 'deduct' ? 'تغییر موجودی کیف پول 💳' : 'شارژ کیف پول 💳'),
        'مبلغ ' . number_format($amount) . ' تومان به کیف پول شما ' . ($action === 'deduct' ? 'کسر' : 'افزوده') . ' شد.' . ($reason ? ' (دلیل: ' . $reason . ')' : ''), 'wallet');

    return ['ok' => true, 'balance' => $res['balance'], 'message' => 'کیف پول کاربر با موفقیت به‌روزرسانی شد.'];
}

function admin_user_status_update(int $id, string $status, string $reason = '', bool $tradeRestricted = false): array {
    if ($id <= 0) return ['ok' => false, 'error' => 'شناسه کاربر نامعتبر است.'];
    $me = auth_id();
    if ($id === $me && ($status !== 'active' || $tradeRestricted)) {
        return ['ok' => false, 'error' => 'امکان مسدودسازی یا اعمال محدودیت بر حساب خودتان وجود ندارد.'];
    }
    $u = db_one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (auth_is_super_admin($u)) {
        if (!auth_is_super_admin()) {
            return ['ok' => false, 'error' => 'دسترسی غیرمجاز! حساب مدیر ارشد (Super Admin) غیرقابل تغییر توسط سایر مدیران است.'];
        }
        if ($status !== 'active' || $tradeRestricted) {
            return ['ok' => false, 'error' => 'امکان مسدودسازی یا محدود کردن حساب مدیر ارشد (Super Admin) وجود ندارد.'];
        }
    }

    $validStatus = in_array($status, ['active', 'pending', 'blocked'], true) ? $status : 'active';
    db_exec('UPDATE users SET status = ? WHERE id = ?', [$validStatus, $id]);

    $meta = user_meta_get($id);
    $meta['statusReason'] = $reason;
    $meta['tradeRestricted'] = $tradeRestricted;
    user_meta_set($id, $meta);

    $statusMsg = $validStatus === 'blocked' ? 'مسدود کامل' : ($tradeRestricted ? 'ممنوع‌المعامله' : 'فعال');
    audit('admin_user_status', 'تغییر وضعیت کاربر #' . $id . ' به ' . $statusMsg . ($reason ? ' (دلیل: ' . $reason . ')' : ''));

    if ($validStatus === 'blocked' || $tradeRestricted) {
        notification_send($id, 'اطلاعیه وضعیت حساب کاربری ⚠️', 'وضعیت حساب شما به «' . $statusMsg . '» تغییر یافت.' . ($reason ? ' دلیل: ' . $reason : ''), 'system');
    }

    return ['ok' => true, 'status' => $validStatus, 'tradeRestricted' => $tradeRestricted, 'reason' => $reason];
}

function admin_plans_list(): array {
    if (!db_ok()) return [];
    db_plans_init_defaults();
    try {
        return db_all('SELECT * FROM plans ORDER BY price ASC');
    } catch (Throwable $e) { return []; }
}

function admin_plan_save(array $b): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $id = (int) ($b['id'] ?? 0);
    $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 120);
    if (!$title) return ['ok' => false, 'error' => 'عنوان پلن الزامی است.'];
    $price = max(0, (int) ($b['price'] ?? 0));
    $days = max(1, (int) ($b['days'] ?? $b['duration_days'] ?? $b['durationDays'] ?? 30));
    $features = is_array($b['features'] ?? null) ? implode(',', $b['features']) : (string) ($b['features'] ?? '');
    $badge = mb_substr(trim((string) ($b['badge'] ?? '')), 0, 60);
    $active = isset($b['active']) ? (!empty($b['active']) ? 1 : 0) : 1;

    if ($id > 0) {
        db_exec('UPDATE plans SET title = ?, price = ?, days = ?, features = ?, badge = ?, active = ? WHERE id = ?', [
            $title, $price, $days, $features, $badge, $active, $id,
        ]);
        audit('admin_plan_edit', 'ویرایش پلن اشتراک: ' . $title);
    } else {
        db_exec('INSERT INTO plans (title, price, days, features, badge, active, created_at) VALUES (?,?,?,?,?,?,?)', [
            $title, $price, $days, $features, $badge, $active, db_now_ms(),
        ]);
        audit('admin_plan_create', 'ساخت پلن اشتراک جدید: ' . $title);
    }
    return ['ok' => true, 'plans' => admin_plans_list()];
}

function admin_plan_delete(int $id): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    db_exec('DELETE FROM plans WHERE id = ?', [$id]);
    audit('admin_plan_delete', 'حذف پلن اشتراک #' . $id);
    return ['ok' => true, 'plans' => admin_plans_list()];
}

function admin_subscription_grant(int $userId, int $planId, int $days = 30): array {
    if (!db_ok() || $userId <= 0) return ['ok' => false, 'error' => 'شناسه کاربر نامعتبر است.'];
    $plan = db_one('SELECT * FROM plans WHERE id = ?', [$planId]);
    $planTitle = $plan ? $plan['title'] : 'اشتراک ویژه دستی (توسط مدیر)';
    $days = $days > 0 ? $days : ($plan ? (int) $plan['days'] : 30);

    $now = db_now_ms();
    $current = user_subscription_active($userId);
    $startsAt = $now;
    $expiresAt = ($current && $current['expires_at'] > $now) ? ($current['expires_at'] + ($days * 86400000)) : ($now + ($days * 86400000));

    db_exec('INSERT INTO subscriptions (user_id, plan_id, plan_title, amount, status, starts_at, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)', [
        $userId, $planId, $planTitle, 0, 'active', $startsAt, $expiresAt, $now,
    ]);

    notification_send($userId, 'اشتراک ویژه برای شما فعال شد 🎉', 'پلن «' . $planTitle . '» به مدت ' . $days . ' روز با موفقیت برای شما فعال گردید.', 'system');
    audit('admin_sub_grant', 'اعطای اشتراک ' . $planTitle . ' به کاربر #' . $userId . ' (' . $days . ' روز)');
    return ['ok' => true, 'subscription' => user_subscription_active($userId)];
}

function admin_user_update(int $id, array $patch): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $me = auth_id();
    $u = db_one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (auth_is_super_admin($u) && !auth_is_super_admin()) {
        return ['ok' => false, 'error' => 'دسترسی غیرمجاز به حساب مدیر ارشد (Super Admin).'];
    }

    $sets = [];
    $p = [];
    if (isset($patch['name'])) { $sets[] = 'name = ?'; $p[] = mb_substr((string) $patch['name'], 0, 120); }
    if (isset($patch['email']) && auth_validate_email((string) $patch['email'])) {
        $newEmail = mb_strtolower(trim((string) $patch['email']));
        if (auth_is_super_admin($u) && $newEmail !== 'admin@gmail.com') {
            return ['ok' => false, 'error' => 'ایمیل مدیر ارشد (admin@gmail.com) غیرقابل تغییر است.'];
        }
        $sets[] = 'email = ?'; $p[] = $newEmail;
    }
    if (isset($patch['role'])) {
        $role = preg_replace('/[^a-zA-Z0-9_\-]/', '', strtolower(trim((string) $patch['role']))) ?: 'user';
        if ($id === $me && $role !== ($u['role'] ?? 'admin')) return ['ok' => false, 'error' => 'نقش خودتان را نمی‌توانید تغییر دهید.'];
        if (auth_is_super_admin($u) && $role !== 'admin') return ['ok' => false, 'error' => 'نقش مدیر ارشد غیرقابل تغییر است.'];
        $sets[] = 'role = ?'; $p[] = $role;
    }
    if (isset($patch['status'])) {
        $status = in_array($patch['status'], ['active', 'pending', 'blocked'], true) ? $patch['status'] : 'active';
        if ($id === $me && $status !== 'active') return ['ok' => false, 'error' => 'حساب خودتان را نمی‌توانید غیرفعال کنید.'];
        if (auth_is_super_admin($u) && $status !== 'active') return ['ok' => false, 'error' => 'حساب مدیر ارشد را نمی‌توانید غیرفعال کنید.'];
        $sets[] = 'status = ?'; $p[] = $status;
    }
    if (!$sets) return ['ok' => false, 'error' => 'چیزی برای تغییر نیست.'];
    $p[] = $id;
    db_exec('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $p);
    audit('admin_user_update', 'کاربر #' . $id . ' ویرایش شد: ' . implode(',', array_keys($patch)));
    return ['ok' => true, 'user' => auth_user($id, true)];
}

function admin_user_create(array $b): array {
    $email = (string) ($b['email'] ?? '');
    $pass = (string) ($b['password'] ?? '');
    $name = (string) ($b['name'] ?? '');
    $role = preg_replace('/[^a-zA-Z0-9_\-]/', '', strtolower(trim((string) ($b['role'] ?? 'user')))) ?: 'user';
    $r = auth_register($email, $pass, $name, $role === 'admin');
    if (!$r['ok']) return $r;
    $patch = [];
    if (isset($b['status'])) $patch['status'] = (string) $b['status'];
    if ($role !== 'user' && $role !== 'admin') $patch['role'] = $role;
    if ($patch) admin_user_update((int) $r['id'], $patch);
    audit('admin_user_create', 'ساخت کاربر ' . $email . ' با نقش ' . $role);
    return ['ok' => true, 'id' => $r['id']];
}

function admin_user_delete(int $id): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    if ($id === auth_id()) return ['ok' => false, 'error' => 'حساب خودتان را نمی‌توانید حذف کنید.'];
    $u = db_one('SELECT id, email, role, status FROM users WHERE id = ?', [$id]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (auth_is_super_admin($u)) return ['ok' => false, 'error' => 'امکان حذف حساب مدیر ارشد (Super Admin) وجود ندارد.'];
    db_exec('DELETE FROM users WHERE id = ?', [$id]);
    try { db_exec('DELETE FROM user_state WHERE user_id = ?', [$id]); } catch (Throwable $e) {}
    cache_user_flush_all($id);
    audit('admin_user_delete', 'حذف کاربر ' . $u['email'], auth_id());
    return ['ok' => true];
}

function admin_settings_save(array $in): array {
    $defaults = settings_defaults();
    $saved = [];
    foreach ($in as $k => $v) {
        if (!array_key_exists($k, $defaults)) continue;
        $def = $defaults[$k];
        if (is_bool($def)) $v = (bool) $v;
        elseif (is_int($def)) $v = (int) $v;
        elseif (is_float($def)) $v = (float) $v;
        elseif (is_array($def)) {
            if (is_string($v)) {
                $dec = json_decode($v, true);
                $v = is_array($dec) ? $dec : $def;
            } elseif (!is_array($v)) {
                $v = $def;
            }
        } else {
            $v = (string) $v;
        }
        setting_set($k, $v);
        $saved[$k] = $v;
    }
    audit('admin_settings', 'تنظیمات سایت به‌روز شد: ' . implode(',', array_keys($saved)));
    return ['ok' => true, 'settings' => settings_effective(), 'saved' => $saved];
}

function admin_log_ai_usage(int $userId, string $model, string $status, int $ms): void {
    if (!db_ok()) return;
    try {
        db_exec('INSERT INTO ai_usage (user_id, model, status, ms, created_at) VALUES (?,?,?,?,?)', [
            $userId, mb_substr($model, 0, 120), mb_substr($status, 0, 40), $ms, db_now_ms(),
        ]);
    } catch (Throwable $e) {}
}

function admin_ai_usage(int $limit = 100): array {
    if (!db_ok()) return [];
    $limit = max(1, min(500, $limit));
    try {
        return db_all('SELECT a.*, u.email FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ' . $limit);
    } catch (Throwable $e) { return []; }
}

/** همهٔ کاربران برای اجرای زمان‌بندی‌شدهٔ هوش مصنوعی */
function admin_run_auto_for_all(): array {
    $out = [];
    foreach (store_all_user_ids() as $uid) {
        store_set_user($uid);
        $s = store_load(true);
        if (empty($s['ai']['autoMode'])) { continue; }
        $last = (int) ($s['ai']['lastRunAt'] ?? 0);
        $interval = max(5, (int) ($s['ai']['autoIntervalMin'] ?? 60)) * 60000;
        if ($last && (u_now_ms() - $last) < $interval) continue;
        try {
            $r = ai_run_auto($s, 'cron');
            $out[] = ['userId' => $uid, 'ok' => true, 'model' => $r['model'] ?? ''];
            admin_log_ai_usage($uid, (string) ($r['model'] ?? ''), 'ok', (int) ($r['durationMs'] ?? 0));
        } catch (Throwable $e) {
            $out[] = ['userId' => $uid, 'ok' => false, 'error' => $e->getMessage()];
            admin_log_ai_usage($uid, '', 'error', 0);
        }
    }
    store_reset_user();
    return $out;
}

/* ------------------------------ مدیریت مالی و درخواست‌های واریز / برداشت ------------------------------ */

function admin_crypto_deposits_list(int $limit = 100): array {
    if (!db_ok()) return [];
    try {
        return db_all('SELECT cd.*, u.email, u.name as user_name FROM crypto_deposits cd LEFT JOIN users u ON u.id = cd.user_id ORDER BY cd.id DESC LIMIT ' . $limit);
    } catch (Throwable $e) { return []; }
}

function admin_crypto_deposit_approve(int $id, string $note = ''): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $dep = db_one('SELECT * FROM crypto_deposits WHERE id = ?', [$id]);
    if (!$dep) return ['ok' => false, 'error' => 'درخواست واریز یافت نشد.'];
    if ($dep['status'] === 'approved') return ['ok' => false, 'error' => 'این تراکنش قبلاً تأیید شده است.'];

    $userId = (int) $dep['user_id'];
    $amountToman = (int) $dep['amount_toman'];
    $txid = $dep['txid'];
    $now = db_now_ms();

    db_exec('UPDATE crypto_deposits SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ?', [
        'approved', $note, $now, $id
    ]);

    $refId = 'CRYPTO-' . substr($txid, 0, 10);
    $desc = "واریز تأییدشده تتر ({$dep['amount_usdt']} USDT در شبکه {$dep['network']})";
    $adj = user_wallet_adj($userId, 'deposit', $amountToman, $desc, $refId);

    notification_send($userId, 'واریز رمزارزی شما تأیید شد 💎', "درخواست واریز {$dep['amount_usdt']} USDT (معادل " . number_format($amountToman) . " تومان) تأیید و به مانده کیف‌پول شما افزوده شد.", 'wallet');
    audit('crypto_approved', "تأیید واریز رمزارزی #{$id} کاربر #{$userId} به مبلغ " . number_format($amountToman) . " تومان");

    return ['ok' => true, 'balance' => $adj['balance'] ?? 0, 'message' => 'واریز رمزارزی با موفقیت تأیید و کیف‌پول کاربر شارژ شد.'];
}

function admin_crypto_deposit_reject(int $id, string $reason = ''): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $dep = db_one('SELECT * FROM crypto_deposits WHERE id = ?', [$id]);
    if (!$dep) return ['ok' => false, 'error' => 'درخواست واریز یافت نشد.'];

    $userId = (int) $dep['user_id'];
    $now = db_now_ms();

    db_exec('UPDATE crypto_deposits SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ?', [
        'rejected', $reason ?: 'عدم تأیید تراکنش در شبکه', $now, $id
    ]);

    notification_send($userId, 'عدم تأیید واریز رمزارزی ⚠️', "درخواست واریز {$dep['amount_usdt']} USDT با شناسه #{$id} رد شد." . ($reason ? " دلیل: {$reason}" : ''), 'wallet');
    audit('crypto_rejected', "رد واریز رمزارزی #{$id} کاربر #{$userId}" . ($reason ? " (دلیل: {$reason})" : ''));

    return ['ok' => true, 'message' => 'درخواست واریز رد شد.'];
}

function admin_withdrawals_list(int $limit = 100): array {
    if (!db_ok()) return [];
    try {
        return db_all('SELECT w.*, u.email, u.name as user_name FROM withdrawals w LEFT JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT ' . $limit);
    } catch (Throwable $e) { return []; }
}

function admin_withdrawal_complete(int $id, string $trackingCode = '', string $note = ''): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $w = db_one('SELECT * FROM withdrawals WHERE id = ?', [$id]);
    if (!$w) return ['ok' => false, 'error' => 'درخواست برداشت یافت نشد.'];
    if ($w['status'] === 'completed') return ['ok' => false, 'error' => 'این درخواست قبلاً تسویه شده است.'];

    $userId = (int) $w['user_id'];
    $amount = (int) $w['amount'];
    $now = db_now_ms();

    db_exec('UPDATE withdrawals SET status = ?, tracking_code = ?, admin_note = ?, processed_at = ? WHERE id = ?', [
        'completed', $trackingCode ?: ('PAYA-' . strtoupper(substr(md5(uniqid()), 0, 8))), $note, $now, $id
    ]);

    notification_send($userId, 'تسویه موفق وجه به حساب بانکی 💳', "مبلغ " . number_format($amount) . " تومان به شماره شبا {$w['sheba']} واریز شد (کد پیگیری پایا: {$trackingCode}).", 'wallet');
    audit('withdraw_completed', "تسویه برداشت #{$id} کاربر #{$userId} به مبلغ " . number_format($amount) . " تومان (پیگیری: {$trackingCode})");

    return ['ok' => true, 'message' => 'درخواست برداشت به عنوان تسویه‌شده ثبت گردید.'];
}

function admin_withdrawal_reject(int $id, string $reason = ''): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $w = db_one('SELECT * FROM withdrawals WHERE id = ?', [$id]);
    if (!$w) return ['ok' => false, 'error' => 'درخواست برداشت یافت نشد.'];
    if ($w['status'] === 'completed') return ['ok' => false, 'error' => 'درخواست قبلاً تسویه شده و قابل رد نیست.'];
    if ($w['status'] === 'rejected') return ['ok' => false, 'error' => 'درخواست قبلاً رد شده است.'];

    $userId = (int) $w['user_id'];
    $amount = (int) $w['amount'];
    $now = db_now_ms();

    db_exec('UPDATE withdrawals SET status = ?, admin_note = ?, processed_at = ? WHERE id = ?', [
        'rejected', $reason ?: 'عدم تطابق اطلاعات بانکی', $now, $id
    ]);

    // بازگشت وجه به کیف پول کاربر
    $refId = 'REFUND-W' . $id;
    $desc = "استرداد وجه برداشت لغوشده (#{$id}): " . ($reason ?: 'رد توسط مدیر');
    user_wallet_adj($userId, 'deposit', $amount, $desc, $refId);

    notification_send($userId, 'درخواست برداشت ریالی رد شد و وجه بازگشت داده شد ⚠️', "درخواست برداشت " . number_format($amount) . " تومان رد گردید و مبلغ به کیف‌پول شما بازگشت داده شد." . ($reason ? " علت: {$reason}" : ''), 'wallet');
    audit('withdraw_rejected', "رد درخواست برداشت #{$id} کاربر #{$userId} و استرداد " . number_format($amount) . " تومان");

    return ['ok' => true, 'message' => 'درخواست برداشت رد و مبلغ به کیف‌پول کاربر بازگردانده شد.'];
}

/* ------------------------------ مدیریت فیلدهای ثبت‌نام و فرم‌ساز داینامیک ------------------------------ */

function admin_auth_fields_list(): array {
    return auth_fields_all(false);
}

function admin_auth_field_save(array $b): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $id = (int) ($b['id'] ?? 0);
    $key = preg_replace('/[^a-zA-Z0-9_]/', '', strtolower(trim((string) ($b['field_key'] ?? $b['key'] ?? ''))));
    $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 120);
    $type = mb_substr(trim((string) ($b['type'] ?? 'text')), 0, 40);

    if (!$key || !$title) {
        return ['ok' => false, 'error' => 'کلید شناسه (انگلیسی) و عنوان فیلد الزامی است.'];
    }

    $validTypes = ['text', 'textarea', 'number', 'email', 'tel', 'password', 'password_confirm', 'date', 'select', 'multiselect', 'checkbox', 'radio'];
    if (!in_array($type, $validTypes, true)) {
        $type = 'text';
    }

    $isRequired = !empty($b['is_required']) ? 1 : 0;
    $isActive = isset($b['is_active']) ? (!empty($b['is_active']) ? 1 : 0) : 1;
    $sortOrder = (int) ($b['sort_order'] ?? 0);
    $placeholder = mb_substr(trim((string) ($b['placeholder'] ?? '')), 0, 190);
    $helpText = mb_substr(trim((string) ($b['help_text'] ?? '')), 0, 255);
    $defaultVal = mb_substr(trim((string) ($b['default_val'] ?? '')), 0, 190);

    $validationRules = is_array($b['validation_rules'] ?? null) ? $b['validation_rules'] : [];
    $options = is_array($b['options'] ?? null) ? $b['options'] : [];

    $now = db_now_ms();

    if ($id > 0) {
        // بررسی کلید تکراری در سایر فیلدها
        $dup = db_one('SELECT id FROM auth_fields WHERE field_key = ? AND id != ?', [$key, $id]);
        if ($dup) return ['ok' => false, 'error' => 'این کلید فیلد قبلاً برای فیلد دیگری تعریف شده است.'];

        db_exec('UPDATE auth_fields SET field_key = ?, title = ?, type = ?, is_required = ?, is_active = ?, sort_order = ?, placeholder = ?, help_text = ?, default_val = ?, validation_rules = ?, options = ? WHERE id = ?', [
            $key, $title, $type, $isRequired, $isActive, $sortOrder, $placeholder, $helpText, $defaultVal,
            json_encode($validationRules, JSON_UNESCAPED_UNICODE), json_encode($options, JSON_UNESCAPED_UNICODE), $id
        ]);
        audit('admin_field_edit', "ویرایش فیلد فرم ثبت‌نام: {$title} ({$key})");
    } else {
        $dup = db_one('SELECT id FROM auth_fields WHERE field_key = ?', [$key]);
        if ($dup) return ['ok' => false, 'error' => 'فیلدی با این کلید انگلیسی از قبل وجود دارد.'];

        if ($sortOrder === 0) {
            $maxSort = (int) (db_val('SELECT MAX(sort_order) FROM auth_fields') ?? 0);
            $sortOrder = $maxSort + 1;
        }

        db_exec('INSERT INTO auth_fields (field_key, title, type, is_required, is_active, sort_order, placeholder, help_text, default_val, validation_rules, options, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
            $key, $title, $type, $isRequired, $isActive, $sortOrder, $placeholder, $helpText, $defaultVal,
            json_encode($validationRules, JSON_UNESCAPED_UNICODE), json_encode($options, JSON_UNESCAPED_UNICODE), $now
        ]);
        audit('admin_field_create', "افزودن فیلد جدید به فرم ثبت‌نام: {$title} ({$key})");
    }

    return ['ok' => true, 'fields' => admin_auth_fields_list()];
}

function admin_auth_field_delete(int $id): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $f = db_one('SELECT field_key, title FROM auth_fields WHERE id = ?', [$id]);
    if (!$f) return ['ok' => false, 'error' => 'فیلد یافت نشد.'];

    // محافظت از فیلدهای حیاتی
    if (in_array($f['field_key'], ['email', 'password'], true)) {
        return ['ok' => false, 'error' => 'حذف فیلدهای پایه و حیاتی (ایمیل و کلمه عبور) مجاز نیست. می‌توانید آن را ویرایش یا تنظیمات آن را تغییر دهید.'];
    }

    db_exec('DELETE FROM auth_fields WHERE id = ?', [$id]);
    audit('admin_field_delete', "حذف فیلد فرم ثبت‌نام: {$f['title']} ({$f['field_key']})");
    return ['ok' => true, 'fields' => admin_auth_fields_list()];
}

function admin_auth_fields_reorder(array $orders): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    foreach ($orders as $item) {
        $id = (int) ($item['id'] ?? 0);
        $order = (int) ($item['sort_order'] ?? $item['order'] ?? 0);
        if ($id > 0) {
            db_exec('UPDATE auth_fields SET sort_order = ? WHERE id = ?', [$order, $id]);
        }
    }
    audit('admin_fields_reorder', 'تغییر چینش و ترتیب فیلدهای فرم ثبت‌نام');
    return ['ok' => true, 'fields' => admin_auth_fields_list()];
}

/* ------------------------------ مدیریت نقش‌ها و سطوح دسترسی (Roles Manager) ------------------------------ */

function admin_roles_list(): array {
    if (!db_ok()) return [];
    $isSuper = auth_is_super_admin();
    try {
        $rows = db_all('SELECT * FROM roles ORDER BY id ASC');
        foreach ($rows as $i => $r) {
            $p = json_decode((string) ($r['permissions'] ?? ''), true);
            $rows[$i]['permissions'] = is_array($p) ? $p : [];
            $rows[$i]['is_default'] = (int) $r['is_default'] === 1;
            // تعداد کاربران این نقش (بدون نمایش سوپر ادمین برای سایر مدیران)
            if ($isSuper) {
                $rows[$i]['users_count'] = (int) (db_val('SELECT COUNT(*) FROM users WHERE role = ?', [$r['slug']]) ?? 0);
            } else {
                $rows[$i]['users_count'] = (int) (db_val("SELECT COUNT(*) FROM users WHERE role = ? AND LOWER(email) != 'admin@gmail.com' AND role != 'super_admin'", [$r['slug']]) ?? 0);
            }
        }
        return $rows;
    } catch (Throwable $e) { return []; }
}

function admin_ui_settings_get(): array {
    $s = settings_effective();
    $d = settings_defaults();
    return [
        'navItems' => $s['navItems'] ?? $d['navItems'],
        'buttonsConfig' => $s['buttonsConfig'] ?? $d['buttonsConfig'],
        'themeStyles' => $s['themeStyles'] ?? $d['themeStyles'],
        'visibilityRules' => $s['visibilityRules'] ?? $d['visibilityRules'],
    ];
}

function admin_sync_role_to_ui_settings(string $slug, array $perms): void {
    $s = settings_effective();
    $roleAliases = [$slug];
    if ($slug === 'vip') $roleAliases[] = 'subscriber';
    if ($slug === 'subscriber') $roleAliases[] = 'vip';

    $hasAll = !empty($perms['all']);

    // ۱. همگام‌سازی ماتریس صفحات (Views) و قابلیت‌ها (Features)
    $vis = is_array($s['visibilityRules'] ?? null) ? $s['visibilityRules'] : ['views' => [], 'features' => []];
    if (!isset($vis['views']) || !is_array($vis['views'])) $vis['views'] = [];
    if (!isset($vis['features']) || !is_array($vis['features'])) $vis['features'] = [];

    $viewMap = [
        'dashboard' => 'view_dashboard',
        'market' => 'view_market',
        'signals' => 'view_signals',
        'auto-invest' => 'view_auto_invest',
        'portfolio' => 'view_portfolio',
        'ai-analysis' => 'view_ai_analysis',
        'chat' => 'view_chat',
        'subscriptions' => 'view_subscriptions',
        'notifications' => 'view_notifications',
        'news' => 'view_news',
        'guide' => 'view_guide',
        'admin' => 'view_admin',
        'ai-settings' => 'admin_ai_config',
        'setup' => 'admin_settings',
    ];

    foreach ($viewMap as $vKey => $pKey) {
        $allowed = $hasAll || !empty($perms[$pKey]) || ($vKey === 'signals' && !empty($perms['signals_view'])) || ($vKey === 'portfolio' && !empty($perms['portfolio_manage'])) || ($vKey === 'chat' && !empty($perms['ai_chat'])) || ($vKey === 'auto-invest' && !empty($perms['auto_invest']));
        $cur = is_array($vis['views'][$vKey] ?? null) ? $vis['views'][$vKey] : [];
        foreach ($roleAliases as $ra) {
            if ($allowed && !in_array($ra, $cur, true)) $cur[] = $ra;
            elseif (!$allowed) $cur = array_values(array_filter($cur, fn($x) => $x !== $ra));
        }
        $vis['views'][$vKey] = $cur;
    }

    $featureKeys = [
        'header_ticker', 'dash_auto_invest_banner', 'signal_auto_invest_btn', 'signal_advisory_btn',
        'signal_calc_btn', 'signals_vip', 'ai_chat_modal', 'ai_models', 'wallet_recharge',
        'crypto_payment', 'wallet_withdraw', 'portfolio_add', 'export_data',
        'btn_auto_invest', 'btn_signal_detail', 'btn_asset_advisory', 'btn_ai_chat',
        'btn_wallet_recharge', 'btn_crypto_payment', 'btn_portfolio_add', 'btn_auto_close',
        'btn_alloc_calc', 'btn_export_data', 'btn_withdraw_request', 'btn_sub_purchase',
        'btn_refresh_market', 'btn_theme_toggle', 'btn_alert_create',
        'admin_users', 'admin_financial', 'admin_plans', 'admin_gateways', 'admin_sms',
        'admin_ai_config', 'admin_engine', 'admin_settings', 'admin_ui_customizer',
        'admin_roles', 'admin_audit', 'admin_panel', 'ai_settings', 'system_settings'
    ];

    foreach ($featureKeys as $fKey) {
        $allowed = $hasAll || !empty($perms[$fKey]);
        if ($fKey === 'signal_auto_invest_btn' && !empty($perms['btn_auto_invest'])) $allowed = true;
        if ($fKey === 'signal_advisory_btn' && !empty($perms['btn_asset_advisory'])) $allowed = true;
        if ($fKey === 'signal_calc_btn' && !empty($perms['btn_alloc_calc'])) $allowed = true;
        if ($fKey === 'ai_chat_modal' && (!empty($perms['btn_ai_chat']) || !empty($perms['ai_chat']))) $allowed = true;
        if ($fKey === 'wallet_recharge' && !empty($perms['btn_wallet_recharge'])) $allowed = true;
        if ($fKey === 'crypto_payment' && !empty($perms['btn_crypto_payment'])) $allowed = true;
        if ($fKey === 'portfolio_add' && (!empty($perms['btn_portfolio_add']) || !empty($perms['portfolio_manage']))) $allowed = true;
        if ($fKey === 'export_data' && !empty($perms['btn_export_data'])) $allowed = true;
        if ($fKey === 'admin_panel' && !empty($perms['view_admin'])) $allowed = true;

        $cur = is_array($vis['features'][$fKey] ?? null) ? $vis['features'][$fKey] : [];
        foreach ($roleAliases as $ra) {
            if ($allowed && !in_array($ra, $cur, true)) $cur[] = $ra;
            elseif (!$allowed) $cur = array_values(array_filter($cur, fn($x) => $x !== $ra));
        }
        $vis['features'][$fKey] = $cur;
    }
    setting_set('visibilityRules', $vis);

    // ۲. همگام‌سازی منوهای ناوبری (navItems)
    $navItems = is_array($s['navItems'] ?? null) ? $s['navItems'] : [];
    foreach ($navItems as $idx => $item) {
        $vKey = $item['view'] ?? $item['id'] ?? '';
        if (isset($vis['views'][$vKey])) {
            $itemRoles = is_array($item['roles'] ?? null) ? $item['roles'] : [];
            $allowed = in_array($slug, $vis['views'][$vKey], true);
            foreach ($roleAliases as $ra) {
                if ($allowed && !in_array($ra, $itemRoles, true)) $itemRoles[] = $ra;
                elseif (!$allowed) $itemRoles = array_values(array_filter($itemRoles, fn($x) => $x !== $ra));
            }
            $navItems[$idx]['roles'] = $itemRoles;
        }
    }
    setting_set('navItems', $navItems);

    // ۳. همگام‌سازی دکمه‌های کنشی (buttonsConfig)
    $btns = is_array($s['buttonsConfig'] ?? null) ? $s['buttonsConfig'] : [];
    foreach ($btns as $bKey => $bCfg) {
        $allowed = $hasAll || !empty($perms[$bKey]);
        $bRoles = is_array($bCfg['roles'] ?? null) ? $bCfg['roles'] : [];
        foreach ($roleAliases as $ra) {
            if ($allowed && !in_array($ra, $bRoles, true)) $bRoles[] = $ra;
            elseif (!$allowed) $bRoles = array_values(array_filter($bRoles, fn($x) => $x !== $ra));
        }
        $btns[$bKey]['roles'] = $bRoles;
    }
    setting_set('buttonsConfig', $btns);
}

function admin_role_save(array $b): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $id = (int) ($b['id'] ?? 0);
    $slug = preg_replace('/[^a-zA-Z0-9_\-]/', '', strtolower(trim((string) ($b['slug'] ?? ''))));
    $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 120);
    $description = mb_substr(trim((string) ($b['description'] ?? '')), 0, 255);
    $permissions = is_array($b['permissions'] ?? null) ? $b['permissions'] : [];
    $isDefault = !empty($b['is_default']) ? 1 : 0;

    if (!$slug || !$title) {
        return ['ok' => false, 'error' => 'شناسه انگلیسی و عنوان نقش الزامی است.'];
    }

    $now = db_now_ms();

    if ($isDefault) {
        db_exec('UPDATE roles SET is_default = 0');
    }

    if ($id > 0) {
        $dup = db_one('SELECT id FROM roles WHERE slug = ? AND id != ?', [$slug, $id]);
        if ($dup) return ['ok' => false, 'error' => 'شناسه این نقش قبلاً برای نقش دیگری استفاده شده است.'];

        db_exec('UPDATE roles SET slug = ?, title = ?, description = ?, permissions = ?, is_default = ? WHERE id = ?', [
            $slug, $title, $description, json_encode($permissions, JSON_UNESCAPED_UNICODE), $isDefault, $id
        ]);
        audit('admin_role_edit', "ویرایش نقش: {$title} ({$slug})");
    } else {
        $dup = db_one('SELECT id FROM roles WHERE slug = ?', [$slug]);
        if ($dup) return ['ok' => false, 'error' => 'نقشی با این شناسه انگلیسی از قبل وجود دارد.'];

        db_exec('INSERT INTO roles (slug, title, description, permissions, is_default, created_at) VALUES (?,?,?,?,?,?)', [
            $slug, $title, $description, json_encode($permissions, JSON_UNESCAPED_UNICODE), $isDefault, $now
        ]);
        audit('admin_role_create', "ایجاد نقش جدید: {$title} ({$slug})");
    }

    admin_sync_role_to_ui_settings($slug, $permissions);

    return [
        'ok' => true,
        'roles' => admin_roles_list(),
        'uiSettings' => admin_ui_settings_get(),
    ];
}

function admin_role_delete(int $id): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $r = db_one('SELECT slug, title FROM roles WHERE id = ?', [$id]);
    if (!$r) return ['ok' => false, 'error' => 'نقش یافت نشد.'];

    if (in_array($r['slug'], ['admin', 'user'], true)) {
        return ['ok' => false, 'error' => 'حذف نقش‌های اصلی سیستم (مدیر و کاربر عادی) امکان‌پذیر نیست.'];
    }

    $uCount = (int) db_val('SELECT COUNT(*) FROM users WHERE role = ?', [$r['slug']]);
    if ($uCount > 0) {
        return ['ok' => false, 'error' => "امکان حذف نقش وجود ندارد؛ هم‌اکنون {$uCount} کاربر دارای این نقش هستند. ابتدا نقش آن‌ها را تغییر دهید."];
    }

    db_exec('DELETE FROM roles WHERE id = ?', [$id]);
    audit('admin_role_delete', "حذف نقش: {$r['title']} ({$r['slug']})");
    return ['ok' => true, 'roles' => admin_roles_list()];
}

/* ------------------------------ عملیات پیشرفته مدیریت کاربران ------------------------------ */

function admin_user_approve(int $id): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $u = db_one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (auth_is_super_admin($u) && !auth_is_super_admin()) {
        return ['ok' => false, 'error' => 'دسترسی غیرمجاز به حساب مدیر ارشد (Super Admin).'];
    }

    db_exec('UPDATE users SET status = ? WHERE id = ?', ['active', $id]);
    notification_send($id, 'حساب کاربری شما تأیید شد ✅', 'حساب کاربری شما توسط مدیر سامانه بررسی و تأیید شد. اکنون می‌توانید از تمام امکانات استفاده فرمایید.', 'system');
    audit('admin_user_approve', "تأیید حساب کاربری #{$id} ({$u['email']})");

    return ['ok' => true, 'status' => 'active', 'message' => 'کاربر با موفقیت تأیید و فعال شد.'];
}

function admin_user_lock_toggle(int $id, bool $lock, string $reason = ''): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    if ($id === auth_id() && $lock) {
        return ['ok' => false, 'error' => 'امکان مسدودسازی حساب خودتان وجود ندارد.'];
    }
    $newStatus = $lock ? 'blocked' : 'active';
    return admin_user_status_update($id, $newStatus, $reason, false);
}

function admin_user_full_update(int $id, array $data): array {
    if (!db_ok() || $id <= 0) return ['ok' => false, 'error' => 'شناسه نامعتبر است.'];
    $u = db_one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (auth_is_super_admin($u) && !auth_is_super_admin()) {
        return ['ok' => false, 'error' => 'دسترسی غیرمجاز! حساب مدیر ارشد (Super Admin) برای سایر مدیران غیرقابل مشاهده و غیرقابل ویرایش است.'];
    }

    $sets = [];
    $p = [];

    if (isset($data['name'])) {
        $sets[] = 'name = ?'; $p[] = mb_substr(trim((string) $data['name']), 0, 120);
    }
    if (isset($data['username'])) {
        $username = trim((string) $data['username']);
        if ($username !== '') {
            $dup = db_one('SELECT id FROM users WHERE username = ? AND id != ?', [$username, $id]);
            if ($dup) return ['ok' => false, 'error' => 'این نام کاربری توسط کاربر دیگری استفاده شده است.'];
        }
        $sets[] = 'username = ?'; $p[] = $username;
    }
    if (isset($data['mobile'])) {
        $mobile = trim((string) $data['mobile']);
        if ($mobile !== '') {
            $dup = db_one('SELECT id FROM users WHERE mobile = ? AND id != ?', [$mobile, $id]);
            if ($dup) return ['ok' => false, 'error' => 'این شماره همراه توسط کاربر دیگری استفاده شده است.'];
        }
        $sets[] = 'mobile = ?'; $p[] = $mobile;
    }
    if (isset($data['email'])) {
        $email = mb_strtolower(trim((string) $data['email']));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'ایمیل نامعتبر است.'];
        if (auth_is_super_admin($u) && $email !== 'admin@gmail.com') {
            return ['ok' => false, 'error' => 'ایمیل مدیر ارشد (admin@gmail.com) غیرقابل تغییر است.'];
        }
        $dup = db_one('SELECT id FROM users WHERE email = ? AND id != ?', [$email, $id]);
        if ($dup) return ['ok' => false, 'error' => 'این ایمیل برای کاربر دیگری ثبت است.'];
        $sets[] = 'email = ?'; $p[] = $email;
    }
    if (isset($data['role'])) {
        $role = trim((string) $data['role']);
        if ($id === auth_id() && $role !== ($u['role'] ?? 'admin')) return ['ok' => false, 'error' => 'امکان تغییر نقش خودتان وجود ندارد.'];
        if (auth_is_super_admin($u) && $role !== 'admin') return ['ok' => false, 'error' => 'نقش مدیر ارشد غیرقابل تغییر است.'];
        $sets[] = 'role = ?'; $p[] = $role;
    }
    if (isset($data['status'])) {
        $status = in_array($data['status'], ['active', 'pending', 'blocked'], true) ? $data['status'] : 'active';
        if ($id === auth_id() && $status !== 'active') return ['ok' => false, 'error' => 'امکان غیرفعال‌سازی حساب خودتان وجود ندارد.'];
        if (auth_is_super_admin($u) && $status !== 'active') return ['ok' => false, 'error' => 'امکان غیرفعال‌سازی حساب مدیر ارشد وجود ندارد.'];
        $sets[] = 'status = ?'; $p[] = $status;
    }
    if (!empty($data['password'])) {
        $pass = (string) $data['password'];
        if (mb_strlen($pass) < 6) return ['ok' => false, 'error' => 'کلمه عبور باید حداقل ۶ کاراکتر باشد.'];
        $sets[] = 'pass_hash = ?'; $p[] = password_hash($pass, PASSWORD_DEFAULT);
    }

    // به‌روزرسانی اطلاعات متای کاربر
    if (isset($data['meta']) && is_array($data['meta'])) {
        $meta = user_meta_get($id);
        foreach ($data['meta'] as $mk => $mv) {
            $meta[$mk] = $mv;
        }
        $sets[] = 'meta = ?'; $p[] = u_json($meta);
    }

    if ($sets) {
        $p[] = $id;
        db_exec('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $p);
        audit('admin_user_full_update', "به‌روزرسانی جامع اطلاعات کاربر #{$id}");
    }

    return ['ok' => true, 'user' => auth_public_user(auth_user($id, true))];
}

