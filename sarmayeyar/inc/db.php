<?php
/**
 * لایهٔ دیتابیس — بومی PDO، پشتیبانی از SQLite (بدون تنظیم) و MySQL
 * -----------------------------------------------------------------
 * تنظیمات به این ترتیب خوانده می‌شود:
 *   ۱) ثابت SARMAYEYAR_DB در config.php
 *   ۲) فایل data/db.json (نوشته‌شده توسط نصب‌کننده)
 *   ۳) پیش‌فرض: SQLite در data/sarmayeyar.sqlite
 * اگر هیچ‌کدام در دسترس نبود، برنامه به حالت «تک‌کاربره فایلی» برمی‌گردد
 * (db_ok() = false) و از store.json استفاده می‌کند تا هرگز از کار نیفتد.
 */
if (!defined('SARMAYEYAR')) exit;

/* ------------------------------ تنظیمات ------------------------------ */

function db_config_path(): string {
    $p = store_paths();
    return $p['dir'] . '/db.json';
}

function db_config_file(): ?array {
    $f = db_config_path();
    if (!is_file($f)) return null;
    $j = json_decode((string) @file_get_contents($f), true);
    return is_array($j) ? $j : null;
}

function db_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $fromConst = defined('SARMAYEYAR_DB') && is_array(SARMAYEYAR_DB) ? SARMAYEYAR_DB : null;
    $fromFile  = db_config_file();
    $base = [
        'driver' => 'sqlite',
        'path'   => store_paths()['dir'] . '/sarmayeyar_132.sqlite',
        'host' => 'localhost', 'port' => 3306, 'name' => 'sarmayeyar_132', 'user' => '', 'pass' => '',
        'prefix' => '',
        'enabled' => true,
    ];
    $cfg = array_merge($base, is_array($fromFile) ? $fromFile : [], is_array($fromConst) ? $fromConst : []);
    if ($cfg['driver'] === 'sqlite' && empty($cfg['path'])) {
        $cfg['path'] = store_paths()['dir'] . '/sarmayeyar_132.sqlite';
    }
    return $cfg;
}

function db_write_config(array $cfg): bool {
    $cur = db_config();
    $save = array_merge($cur, $cfg);
    unset($save['enabled']);
    $ok = store_write_atomic(db_config_path(), u_json($save, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return $ok !== false;
}

/* ------------------------------ اتصال ------------------------------ */

function db(): ?PDO {
    static $pdo = null;
    static $tried = false;
    if ($tried) return $pdo;
    $tried = true;

    $c = db_config();
    if (empty($c['enabled'])) return null;

    try {
        if ($c['driver'] === 'sqlite') {
            $dir = dirname((string) $c['path']);
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            $pdo = new PDO('sqlite:' . $c['path'], null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA busy_timeout = 5000');
            $pdo->exec('PRAGMA foreign_keys = ON');
        } else {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int) $c['port'], $c['name']);
            $pdo = new PDO($dsn, (string) $c['user'], (string) $c['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        }
    } catch (Throwable $e) {
        u_log('db connect failed: ' . $e->getMessage());
        $pdo = null;
    }
    return $pdo;
}

function db_reset(): void {
    // برای تست اتصال با تنظیمات تازه در همان درخواست
    $ref = new ReflectionFunction('db');
    // ثابت‌های static را نمی‌توان ساده ریست کرد؛ به‌جایش اتصال را در جای لازم دوباره می‌سازیم
}

function db_ok(): bool { return db() instanceof PDO; }

function db_driver(): string { $c = db_config(); return (string) $c['driver']; }

function db_test_config(array $cfg): array {
    $c = array_merge(db_config(), $cfg);
    try {
        if ($c['driver'] === 'sqlite') {
            $dir = dirname((string) $c['path']);
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            if (!is_dir($dir) || !is_writable($dir)) return ['ok' => false, 'error' => 'پوشهٔ داده قابل نوشتن نیست: ' . $dir];
            $t = new PDO('sqlite:' . $c['path']);
            $t->exec('CREATE TABLE IF NOT EXISTS _probe(id INTEGER)');
            $t->exec('DROP TABLE _probe');
            return ['ok' => true, 'message' => 'SQLite آماده است', 'driver' => 'sqlite'];
        }
        $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $c['host'], (int) $c['port']);
        $t = new PDO($dsn, (string) $c['user'], (string) $c['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $name = preg_replace('/[^A-Za-z0-9_]/', '', (string) $c['name']);
        if ($name === '') return ['ok' => false, 'error' => 'نام دیتابیس معتبر نیست'];
        $t->exec('CREATE DATABASE IF NOT EXISTS `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $t->exec('USE `' . $name . '`');
        $t->exec('CREATE TABLE IF NOT EXISTS _probe(id INT)');
        $t->exec('DROP TABLE _probe');
        return ['ok' => true, 'message' => 'اتصال MySQL و ساخت دیتابیس موفق بود', 'driver' => 'mysql'];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage(), 'driver' => $c['driver']];
    }
}

/* ------------------------------ اجرای پرس‌وجو ------------------------------ */

function db_exec(string $sql, array $p = []): int {
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st->rowCount();
}

function db_all(string $sql, array $p = []): array {
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st->fetchAll();
}

function db_one(string $sql, array $p = []): ?array {
    $st = db()->prepare($sql);
    $st->execute($p);
    $r = $st->fetch();
    return $r === false ? null : $r;
}

function db_val(string $sql, array $p = []) {
    $st = db()->prepare($sql);
    $st->execute($p);
    $v = $st->fetchColumn();
    return $v === false ? null : $v;
}

function db_last_id(): int { return (int) db()->lastInsertId(); }

/* ------------------------------ جدول‌ها (Migrate) ------------------------------ */

function db_schema(): array {
    $mysql = db_driver() === 'mysql';
    $id = $mysql ? 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $engine = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    $text = $mysql ? 'MEDIUMTEXT' : 'TEXT';
    $ts = $mysql ? 'BIGINT' : 'INTEGER';

    return [
        'users' => "CREATE TABLE IF NOT EXISTS users (
            id $id,
            email VARCHAR(190) NOT NULL UNIQUE,
            username VARCHAR(60) NOT NULL DEFAULT '',
            mobile VARCHAR(40) NOT NULL DEFAULT '',
            name VARCHAR(120) NOT NULL DEFAULT '',
            pass_hash VARCHAR(255) NOT NULL DEFAULT '',
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            theme VARCHAR(10) NOT NULL DEFAULT 'dark',
            created_at $ts NOT NULL DEFAULT 0,
            last_login_at $ts NOT NULL DEFAULT 0,
            meta $text
        )$engine",

        'settings' => "CREATE TABLE IF NOT EXISTS settings (
            k VARCHAR(64) NOT NULL PRIMARY KEY,
            v $text
        )$engine",

        'user_state' => "CREATE TABLE IF NOT EXISTS user_state (
            user_id BIGINT NOT NULL PRIMARY KEY,
            json $text,
            updated_at $ts NOT NULL DEFAULT 0
        )$engine",

        'audit_log' => "CREATE TABLE IF NOT EXISTS audit_log (
            id $id,
            user_id BIGINT NOT NULL DEFAULT 0,
            action VARCHAR(64) NOT NULL DEFAULT '',
            detail VARCHAR(500) NOT NULL DEFAULT '',
            ip VARCHAR(64) NOT NULL DEFAULT '',
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'ai_usage' => "CREATE TABLE IF NOT EXISTS ai_usage (
            id $id,
            user_id BIGINT NOT NULL DEFAULT 0,
            model VARCHAR(120) NOT NULL DEFAULT '',
            status VARCHAR(40) NOT NULL DEFAULT '',
            ms INTEGER NOT NULL DEFAULT 0,
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'plans' => "CREATE TABLE IF NOT EXISTS plans (
            id $id,
            title VARCHAR(120) NOT NULL,
            price BIGINT NOT NULL DEFAULT 0,
            days INTEGER NOT NULL DEFAULT 30,
            features $text,
            badge VARCHAR(60) NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1,
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'subscriptions' => "CREATE TABLE IF NOT EXISTS subscriptions (
            id $id,
            user_id BIGINT NOT NULL,
            plan_id BIGINT NOT NULL DEFAULT 0,
            plan_title VARCHAR(120) NOT NULL DEFAULT '',
            amount BIGINT NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            starts_at $ts NOT NULL DEFAULT 0,
            expires_at $ts NOT NULL DEFAULT 0,
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'wallet_tx' => "CREATE TABLE IF NOT EXISTS wallet_tx (
            id $id,
            user_id BIGINT NOT NULL,
            type VARCHAR(30) NOT NULL DEFAULT 'deposit',
            amount BIGINT NOT NULL DEFAULT 0,
            balance_after BIGINT NOT NULL DEFAULT 0,
            description VARCHAR(255) NOT NULL DEFAULT '',
            ref_id VARCHAR(100) NOT NULL DEFAULT '',
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'notifications' => "CREATE TABLE IF NOT EXISTS notifications (
            id $id,
            user_id BIGINT NOT NULL DEFAULT 0,
            title VARCHAR(150) NOT NULL,
            body $text,
            category VARCHAR(40) NOT NULL DEFAULT 'signal',
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'crypto_deposits' => "CREATE TABLE IF NOT EXISTS crypto_deposits (
            id $id,
            user_id BIGINT NOT NULL,
            amount_toman BIGINT NOT NULL DEFAULT 0,
            amount_usdt DOUBLE NOT NULL DEFAULT 0,
            network VARCHAR(30) NOT NULL DEFAULT 'TRC20',
            txid VARCHAR(150) NOT NULL DEFAULT '',
            wallet_address VARCHAR(150) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            admin_note VARCHAR(255) NOT NULL DEFAULT '',
            created_at $ts NOT NULL DEFAULT 0,
            reviewed_at $ts NOT NULL DEFAULT 0
        )$engine",

        'withdrawals' => "CREATE TABLE IF NOT EXISTS withdrawals (
            id $id,
            user_id BIGINT NOT NULL,
            amount BIGINT NOT NULL DEFAULT 0,
            bank_name VARCHAR(100) NOT NULL DEFAULT '',
            account_holder VARCHAR(120) NOT NULL DEFAULT '',
            card_number VARCHAR(30) NOT NULL DEFAULT '',
            sheba VARCHAR(40) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            tracking_code VARCHAR(100) NOT NULL DEFAULT '',
            admin_note VARCHAR(255) NOT NULL DEFAULT '',
            created_at $ts NOT NULL DEFAULT 0,
            processed_at $ts NOT NULL DEFAULT 0
        )$engine",

        'auto_investments' => "CREATE TABLE IF NOT EXISTS auto_investments (
            id $id,
            user_id BIGINT NOT NULL,
            ref_id VARCHAR(64) NOT NULL DEFAULT '',
            asset_id VARCHAR(64) NOT NULL DEFAULT '',
            asset_name VARCHAR(190) NOT NULL DEFAULT '',
            asset_cls VARCHAR(64) NOT NULL DEFAULT 'crypto',
            total_amount BIGINT NOT NULL DEFAULT 0,
            step1_amount BIGINT NOT NULL DEFAULT 0,
            step1_price DOUBLE NOT NULL DEFAULT 0,
            step1_status VARCHAR(32) NOT NULL DEFAULT 'executed',
            step1_time $ts NOT NULL DEFAULT 0,
            step2_amount BIGINT NOT NULL DEFAULT 0,
            step2_price DOUBLE NOT NULL DEFAULT 0,
            step2_status VARCHAR(32) NOT NULL DEFAULT 'pending_limit',
            step2_time $ts NOT NULL DEFAULT 0,
            stop_loss DOUBLE NOT NULL DEFAULT 0,
            target1 DOUBLE NOT NULL DEFAULT 0,
            target2 DOUBLE NOT NULL DEFAULT 0,
            current_price DOUBLE NOT NULL DEFAULT 0,
            pnl_percent DOUBLE NOT NULL DEFAULT 0,
            pnl_amount BIGINT NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            actions_log $text,
            created_at $ts NOT NULL DEFAULT 0,
            updated_at $ts NOT NULL DEFAULT 0
        )$engine",

        'roles' => "CREATE TABLE IF NOT EXISTS roles (
            id $id,
            slug VARCHAR(64) NOT NULL UNIQUE,
            title VARCHAR(120) NOT NULL,
            description VARCHAR(255) NOT NULL DEFAULT '',
            permissions $text,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'auth_fields' => "CREATE TABLE IF NOT EXISTS auth_fields (
            id $id,
            field_key VARCHAR(64) NOT NULL UNIQUE,
            title VARCHAR(120) NOT NULL,
            type VARCHAR(40) NOT NULL DEFAULT 'text',
            is_required INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            placeholder VARCHAR(190) NOT NULL DEFAULT '',
            help_text VARCHAR(255) NOT NULL DEFAULT '',
            default_val VARCHAR(190) NOT NULL DEFAULT '',
            validation_rules $text,
            options $text,
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'trading_bots' => "CREATE TABLE IF NOT EXISTS trading_bots (
            id $id,
            code VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(190) NOT NULL,
            subtitle VARCHAR(255) NOT NULL DEFAULT '',
            basket_type VARCHAR(64) NOT NULL DEFAULT 'all',
            strategy VARCHAR(64) NOT NULL DEFAULT 'grid_dca',
            strategy_fa VARCHAR(120) NOT NULL DEFAULT '',
            risk_level VARCHAR(32) NOT NULL DEFAULT 'balanced',
            price_toman BIGINT NOT NULL DEFAULT 0,
            min_capital BIGINT NOT NULL DEFAULT 5000000,
            duration_days INTEGER NOT NULL DEFAULT 30,
            win_rate DOUBLE NOT NULL DEFAULT 84.0,
            expected_monthly_pct VARCHAR(64) NOT NULL DEFAULT '۱۲٪ تا ۱۸٪',
            stop_loss_pct DOUBLE NOT NULL DEFAULT 4.5,
            tp1_pct DOUBLE NOT NULL DEFAULT 7.5,
            tp2_pct DOUBLE NOT NULL DEFAULT 14.0,
            max_open_trades INTEGER NOT NULL DEFAULT 5,
            trailing_stop INTEGER NOT NULL DEFAULT 1,
            assets_json $text,
            features_json $text,
            sim_config_json $text,
            badge VARCHAR(64) NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at $ts NOT NULL DEFAULT 0
        )$engine",

        'user_bot_instances' => "CREATE TABLE IF NOT EXISTS user_bot_instances (
            id $id,
            user_id BIGINT NOT NULL,
            ref_id VARCHAR(64) NOT NULL DEFAULT '',
            bot_id BIGINT NOT NULL DEFAULT 0,
            bot_code VARCHAR(64) NOT NULL DEFAULT '',
            bot_name VARCHAR(190) NOT NULL DEFAULT '',
            basket_name VARCHAR(190) NOT NULL DEFAULT '',
            basket_type VARCHAR(64) NOT NULL DEFAULT '',
            strategy VARCHAR(64) NOT NULL DEFAULT '',
            license_paid BIGINT NOT NULL DEFAULT 0,
            initial_capital BIGINT NOT NULL DEFAULT 0,
            current_equity BIGINT NOT NULL DEFAULT 0,
            in_trade_capital BIGINT NOT NULL DEFAULT 0,
            free_margin BIGINT NOT NULL DEFAULT 0,
            total_pnl BIGINT NOT NULL DEFAULT 0,
            total_pnl_pct DOUBLE NOT NULL DEFAULT 0,
            realized_pnl BIGINT NOT NULL DEFAULT 0,
            trades_count INTEGER NOT NULL DEFAULT 0,
            won_trades INTEGER NOT NULL DEFAULT 0,
            stop_loss_pct DOUBLE NOT NULL DEFAULT 4.5,
            tp1_pct DOUBLE NOT NULL DEFAULT 7.5,
            tp2_pct DOUBLE NOT NULL DEFAULT 14.0,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            sub_positions_json $text,
            live_logs_json $text,
            sim_config_json $text,
            started_at $ts NOT NULL DEFAULT 0,
            expires_at $ts NOT NULL DEFAULT 0,
            updated_at $ts NOT NULL DEFAULT 0
        )$engine",
    ];
}

function db_migrate(): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'اتصال دیتابیس برقرار نیست'];
    $applied = [];
    try {
        foreach (db_schema() as $name => $sql) {
            db()->exec($sql);
            $applied[] = $name;
        }
        // ایندکس‌های کمکی (بی‌خطا تکرار می‌شوند)
        foreach ([
            'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)',
        ] as $idx) {
            try { db()->exec($idx); } catch (Throwable $e) { /* MySQL از IF NOT EXISTS در ایندکس پشتیبانی نمی‌کند */ }
        }
        if (db_driver() === 'mysql') {
            foreach ([
                'CREATE INDEX idx_audit_created ON audit_log(created_at)',
                'CREATE INDEX idx_users_created ON users(created_at)',
            ] as $idx) { try { db()->exec($idx); } catch (Throwable $e) {} }
        }

        // ارتقای خودکار ستون‌های جدید جدول کاربران (username و mobile) و ربات‌های ترید (sim_config_json)
        try {
            db()->exec("ALTER TABLE users ADD COLUMN username VARCHAR(60) NOT NULL DEFAULT ''");
        } catch (Throwable $e) {}
        try {
            db()->exec("ALTER TABLE users ADD COLUMN mobile VARCHAR(40) NOT NULL DEFAULT ''");
        } catch (Throwable $e) {}
        try {
            db()->exec("ALTER TABLE trading_bots ADD COLUMN sim_config_json TEXT");
        } catch (Throwable $e) {}
        try {
            db()->exec("ALTER TABLE user_bot_instances ADD COLUMN sim_config_json TEXT");
        } catch (Throwable $e) {}

        // مقداردهی اولیه نقش‌ها در صورت خالی بودن
        try {
            $roleCount = (int) db_val('SELECT COUNT(*) FROM roles');
            if ($roleCount === 0) {
                $now = db_now_ms();
                $defaultRoles = [
                    ['admin', 'مدیر سیستم', 'دسترسی کامل به تمام بخش‌ها و تنظیمات سامانه', ['all' => true], 0],
                    ['user', 'کاربر عادی', 'دسترسی پایه به بازار، سبد دارایی و سیگنال‌های عمومی', ['signals_view' => true, 'portfolio_manage' => true], 1],
                    ['vip', 'کاربر ویژه VIP', 'دسترسی به تمام ۶۰+ سیگنال زنده، هوش مصنوعی و معاملات خودکار', ['signals_view' => true, 'signals_vip' => true, 'portfolio_manage' => true, 'ai_chat' => true, 'auto_invest' => true], 0],
                    ['analyst', 'تحلیل‌گر بازار', 'دسترسی ویژه به موتور تحلیل، هوش مصنوعی و سیگنال‌ها', ['signals_view' => true, 'signals_vip' => true, 'ai_chat' => true, 'ai_models' => true], 0],
                ];
                foreach ($defaultRoles as $dr) {
                    db_exec('INSERT INTO roles (slug, title, description, permissions, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
                        $dr[0], $dr[1], $dr[2], json_encode($dr[3], JSON_UNESCAPED_UNICODE), $dr[4], $now
                    ]);
                }
            }
        } catch (Throwable $e) {}

        // مقداردهی اولیه فیلدهای فرم ثبت‌نام در صورت خالی بودن
        try {
            $fieldCount = (int) db_val('SELECT COUNT(*) FROM auth_fields');
            if ($fieldCount === 0) {
                $now = db_now_ms();
                $defaultFields = [
                    ['name', 'نام و نام خانوادگی', 'text', 1, 1, 1, 'مثلاً: علی رضایی', 'نام و نام خانوادگی خود را کامل وارد کنید.', '', ['min_length' => 3, 'max_length' => 100], []],
                    ['username', 'نام کاربری', 'text', 0, 1, 2, 'user_name (لاتین)', 'حداقل ۳ حرف بدون فاصله.', '', ['min_length' => 3, 'max_length' => 40, 'regex_type' => 'alphanumeric'], []],
                    ['email', 'پست الکترونیک (ایمیل)', 'email', 1, 1, 3, 'example@domain.com', 'جهت ورود به حساب و بازیابی رمز عبور.', '', ['regex_type' => 'email'], []],
                    ['mobile', 'شماره تلفن همراه', 'tel', 0, 1, 4, '۰۹۱۲xxxxxxx', 'جهت دریافت هشدارهای پیامکی و امنیت حساب.', '', ['regex_type' => 'mobile_ir'], []],
                    ['password', 'کلمه عبور', 'password', 1, 1, 5, '••••••••', 'حداقل ۶ کاراکتر شامل حروف و ارقام.', '', ['min_length' => 6], []],
                    ['password_confirm', 'تکرار کلمه عبور', 'password_confirm', 1, 1, 6, '••••••••', 'تکرار کلمه عبور بالا را بنویسید.', '', [], []],
                    ['terms_agree', 'پذیرش قوانین و شرایط سامانه', 'checkbox', 1, 1, 7, '', 'ثبت‌نام در سامانه به منزله پذیرش کامل قوانین و مقررات است.', '1', [], []],
                ];
                foreach ($defaultFields as $df) {
                    db_exec('INSERT INTO auth_fields (field_key, title, type, is_required, is_active, sort_order, placeholder, help_text, default_val, validation_rules, options, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                        $df[0], $df[1], $df[2], $df[3], $df[4], $df[5], $df[6], $df[7], $df[8], json_encode($df[9], JSON_UNESCAPED_UNICODE), json_encode($df[10], JSON_UNESCAPED_UNICODE), $now
                    ]);
                }
            }
        } catch (Throwable $e) {}

        // مقداردهی اولیه ربات‌های ترید پیش‌فرض در صورت خالی بودن
        try {
            $botCount = (int) db_val('SELECT COUNT(*) FROM trading_bots');
            if ($botCount === 0) {
                $now = db_now_ms();
                $defaultBots = [
                    [
                        'code' => 'alpha_precious',
                        'name' => 'ربات ترید آلفا — سبد نقره، طلا و صندوق‌های فلزات گرانبها',
                        'subtitle' => 'ورود ۲ پله‌ای هوشمند + حد ضرر متحرک روی طلا، سکه، نقره ۹۹۹ و صندوق‌های طلا/نقره',
                        'basket_type' => 'ir_precious',
                        'strategy' => 'grid_dca',
                        'strategy_fa' => 'پله‌ای هوشمند (Grid DCA) + حد ضرر متحرک',
                        'risk_level' => 'balanced',
                        'price_toman' => 490000,
                        'min_capital' => 5000000,
                        'duration_days' => 30,
                        'win_rate' => 86.5,
                        'expected_monthly_pct' => '۱۴٪ تا ۲۲٪',
                        'stop_loss_pct' => 4.0,
                        'tp1_pct' => 7.5,
                        'tp2_pct' => 14.5,
                        'max_open_trades' => 6,
                        'trailing_stop' => 1,
                        'assets' => [
                            ['assetId' => 'geram18', 'name' => 'طلای ۱۸ عیار', 'weight' => 30],
                            ['assetId' => 'ir_silver_gram', 'name' => 'گرم نقره ۹۹۹ بازار ایران', 'weight' => 25],
                            ['assetId' => 'etf_ayar', 'name' => 'صندوق طلای عیار (مفید)', 'weight' => 25],
                            ['assetId' => 'etf_simin', 'name' => 'صندوق نقره سیمین (بورس کالا)', 'weight' => 20],
                        ],
                        'features' => [
                            'شکار خودکار حباب منفی صندوق‌های طلا و نقره در بورس کالا',
                            'ورود ۵۰٪ فوری و ۵۰٪ در پولبک به کف حمایتی',
                            'ریسک‌فری کردن خودکار معامله پس از رسیدن به هدف اول',
                            'گزارش لحظه‌ای سود/زیان و لاگ زنده تصمیمات ربات'
                        ],
                        'badge' => 'پرفروش‌ترین 🔥'
                    ],
                    [
                        'code' => 'bourse_turbo',
                        'name' => 'ربات توربو بورس — سبد سهام بنیادی و صندوق‌های اهرمی',
                        'subtitle' => 'الگوریتم شکار واگرایی مثبت RSI و ورود پول هوشمند در نمادهای شاخص‌ساز و اهرمی',
                        'basket_type' => 'ir_bourse_fund',
                        'strategy' => 'momentum_breakout',
                        'strategy_fa' => 'نوسان‌گیری مومنتوم و شکار جامانده‌های بورس',
                        'risk_level' => 'aggressive',
                        'price_toman' => 690000,
                        'min_capital' => 5000000,
                        'duration_days' => 30,
                        'win_rate' => 82.0,
                        'expected_monthly_pct' => '۱۶٪ تا ۲۸٪',
                        'stop_loss_pct' => 5.0,
                        'tp1_pct' => 9.0,
                        'tp2_pct' => 18.0,
                        'max_open_trades' => 6,
                        'trailing_stop' => 1,
                        'assets' => [
                            ['assetId' => 'etf_shetab', 'name' => 'صندوق اهرمی شتاب (آگاه)', 'weight' => 25],
                            ['assetId' => 'etf_ahrom', 'name' => 'صندوق اهرمی اهرم (کاریزما)', 'weight' => 20],
                            ['assetId' => 'ir_foolad', 'name' => 'فولاد مبارکه اصفهان (فولاد)', 'weight' => 20],
                            ['assetId' => 'ir_femeli', 'name' => 'ملی صنایع مس ایران (فملی)', 'weight' => 20],
                            ['assetId' => 'ir_shepna', 'name' => 'پالایش نفت اصفهان (شپنا)', 'weight' => 15],
                        ],
                        'features' => [
                            'تشخیص ورود پول حقیقی و شکست مقاومت‌های کلیدی بورس',
                            'تنظیم خودکار حد ضرر و سیو سود پله‌ای در سقف‌های روزانه',
                            'توزیع ریسک بین لیدرهای فلزی/پالایشی و صندوق‌های اهرمی',
                            'مانیتورینگ لحظه‌ای تابلوی معاملات و صف‌های خرید/فروش'
                        ],
                        'badge' => 'ویژه بورس و اهرمی ⚡'
                    ],
                    [
                        'code' => 'global_quantum',
                        'name' => 'ربات کوانتوم جهانی — سبد اونس طلا/نقره، فارکس و رمزارز',
                        'subtitle' => 'معامله‌گر ۲۴ ساعته در بازارهای مالی بین‌المللی، کریپتوکارنسی و کامودیتی‌های جهانی',
                        'basket_type' => 'global_markets',
                        'strategy' => 'ai_trailing',
                        'strategy_fa' => 'هوش مصنوعی کوانتوم + Trailing Stop پویا',
                        'risk_level' => 'aggressive',
                        'price_toman' => 980000,
                        'min_capital' => 10000000,
                        'duration_days' => 30,
                        'win_rate' => 84.5,
                        'expected_monthly_pct' => '۱۸٪ تا ۳۰٪',
                        'stop_loss_pct' => 4.5,
                        'tp1_pct' => 8.5,
                        'tp2_pct' => 16.5,
                        'max_open_trades' => 8,
                        'trailing_stop' => 1,
                        'assets' => [
                            ['assetId' => 'btc', 'name' => 'بیت‌کوین (BTC)', 'weight' => 25],
                            ['assetId' => 'eth', 'name' => 'اتریوم (ETH)', 'weight' => 20],
                            ['assetId' => 'xau_usd', 'name' => 'اونس جهانی طلا (XAU/USD)', 'weight' => 25],
                            ['assetId' => 'xag_usd', 'name' => 'اونس جهانی نقره (XAG/USD)', 'weight' => 15],
                            ['assetId' => 'nasdaq', 'name' => 'نزدک ۱۰۰ آمریکا (NASDAQ)', 'weight' => 15],
                        ],
                        'features' => [
                            'ترید ۲۴/۷ در بازارهای جهانی بدون تعطیلی',
                            'پوشش نوسانات شاخص دلار (DXY) و بازده اوراق خزانه‌داری آمریکا',
                            'مدیریت پوزیشن چندارزی با محاسبه لحظه‌ای معادل تومانی',
                            'سیگنال‌گیری همزمان از اندیکاتورهای تکنیکال و جریان نقدینگی جهانی'
                        ],
                        'badge' => 'هوش مصنوعی جهانی 🌍'
                    ],
                    [
                        'code' => 'balanced_shield',
                        'name' => 'ربات سپر متعادل ۳۶۰ — سبد ترکیبی ضدتورم (داخلی + جهانی)',
                        'subtitle' => 'توازن خودکار بین طلا، نقره، ارز، بورس و درآمد ثابت برای رشد پایدار و کم‌نوسان',
                        'basket_type' => 'balanced_basket',
                        'strategy' => 'mean_reversion',
                        'strategy_fa' => 'بازتوازن هوشمند (Auto-Rebalance) و شکار جامانده‌ها',
                        'risk_level' => 'balanced',
                        'price_toman' => 590000,
                        'min_capital' => 5000000,
                        'duration_days' => 30,
                        'win_rate' => 89.0,
                        'expected_monthly_pct' => '۱۲٪ تا ۱۸٪',
                        'stop_loss_pct' => 3.5,
                        'tp1_pct' => 6.5,
                        'tp2_pct' => 12.0,
                        'max_open_trades' => 6,
                        'trailing_stop' => 1,
                        'assets' => [
                            ['assetId' => 'geram18', 'name' => 'طلای ۱۸ عیار', 'weight' => 25],
                            ['assetId' => 'ir_silver_bar', 'name' => 'شمش نقره ۱ کیلویی ایران', 'weight' => 15],
                            ['assetId' => 'usdt_irt', 'name' => 'تتر تومانی (USDT/IRT)', 'weight' => 20],
                            ['assetId' => 'etf_agas', 'name' => 'صندوق سهامی آگاس (آگاه)', 'weight' => 20],
                            ['assetId' => 'etf_kamand', 'name' => 'صندوق درآمد ثابت کمند', 'weight' => 20],
                        ],
                        'features' => [
                            'مناسب برای تمام سبدهای سرمایه‌گذاری با ریسک متعادل',
                            'انتقال خودکار سود از بازارهای اشباع خرید به بازارهای جامانده',
                            'حفظ ۲۰٪ سپر نقدینگی در صندوق درآمد ثابت برای شکار ریزش‌ها',
                            'گزارش لحظه‌ای وزن فعلی سبد در برابر وزن هدف'
                        ],
                        'badge' => 'توصیه سرمایه‌یار ⭐'
                    ],
                    [
                        'code' => 'safe_arbitrage',
                        'name' => 'ربات محافظ سرمایه — آربیتراژ صندوق‌ها و گواهی نقره/طلا',
                        'subtitle' => 'کم‌ریسک‌ترین ربات ترید با تمرکز بر اختلاف قیمت تابلو و ارزش ذاتی (NAV) صندوق‌ها',
                        'basket_type' => 'ir_precious',
                        'strategy' => 'grid_dca',
                        'strategy_fa' => 'آربیتراژ NAV و میانگین‌گیری کم‌ریسک',
                        'risk_level' => 'conservative',
                        'price_toman' => 350000,
                        'min_capital' => 2000000,
                        'duration_days' => 30,
                        'win_rate' => 92.5,
                        'expected_monthly_pct' => '۹٪ تا ۱۴٪',
                        'stop_loss_pct' => 2.5,
                        'tp1_pct' => 5.0,
                        'tp2_pct' => 9.5,
                        'max_open_trades' => 4,
                        'trailing_stop' => 1,
                        'assets' => [
                            ['assetId' => 'etf_lotus', 'name' => 'صندوق طلای لوتوس (پارسیان)', 'weight' => 30],
                            ['assetId' => 'ir_silver_cert', 'name' => 'گواهی سپرده نقره بورس کالا', 'weight' => 25],
                            ['assetId' => 'etf_kamand', 'name' => 'صندوق درآمد ثابت کمند', 'weight' => 30],
                            ['assetId' => 'rob', 'name' => 'ربع سکه', 'weight' => 15],
                        ],
                        'features' => [
                            'حداقل ریسک ممکن با تمرکز بر دارایی‌های با پشتوانه فیزیکی',
                            'خرید در زمان حباب منفی و فروش در حباب مثبت',
                            'مناسب برای سرمایه‌گذاران محافظه‌کار و جایگزین سپرده بانکی',
                            'امکان برداشت سود لحظه‌ای در هر زمان'
                        ],
                        'badge' => 'کم‌ریسک و امن 🛡️'
                    ]
                ];
                foreach ($defaultBots as $b) {
                    db_exec('INSERT INTO trading_bots (code, name, subtitle, basket_type, strategy, strategy_fa, risk_level, price_toman, min_capital, duration_days, win_rate, expected_monthly_pct, stop_loss_pct, tp1_pct, tp2_pct, max_open_trades, trailing_stop, assets_json, features_json, badge, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)', [
                        $b['code'], $b['name'], $b['subtitle'], $b['basket_type'], $b['strategy'], $b['strategy_fa'], $b['risk_level'],
                        $b['price_toman'], $b['min_capital'], $b['duration_days'], $b['win_rate'], $b['expected_monthly_pct'],
                        $b['stop_loss_pct'], $b['tp1_pct'], $b['tp2_pct'], $b['max_open_trades'], $b['trailing_stop'],
                        json_encode($b['assets'], JSON_UNESCAPED_UNICODE),
                        json_encode($b['features'], JSON_UNESCAPED_UNICODE),
                        $b['badge'], $now
                    ]);
                }
            }
        } catch (Throwable $e) {}

        return ['ok' => true, 'tables' => $applied];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage(), 'tables' => $applied];
    }
}

function db_is_migrated(): bool {
    if (!db_ok()) return false;
    try {
        $n = db_val("SELECT COUNT(*) FROM users");
        return $n !== null;
    } catch (Throwable $e) {
        return false;
    }
}

/* ------------------------------ تنظیمات سایت ------------------------------ */

function setting_get(string $key, $default = null) {
    if (!db_ok()) return $default;
    try {
        $v = db_val('SELECT v FROM settings WHERE k = ?', [$key]);
        if ($v === null) return $default;
        $j = json_decode((string) $v, true);
        return $j === null ? (string) $v : $j;
    } catch (Throwable $e) { return $default; }
}

function setting_set(string $key, $value): void {
    if (!db_ok()) return;
    $json = u_json($value);
    try {
        $exists = db_val('SELECT COUNT(*) FROM settings WHERE k = ?', [$key]);
        if ((int) $exists > 0) db_exec('UPDATE settings SET v = ? WHERE k = ?', [$json, $key]);
        else db_exec('INSERT INTO settings (k, v) VALUES (?, ?)', [$key, $json]);
    } catch (Throwable $e) { u_log('setting_set failed: ' . $e->getMessage()); }
}

function settings_all(): array {
    if (!db_ok()) return [];
    try {
        $rows = db_all('SELECT k, v FROM settings');
        $out = [];
        foreach ($rows as $r) {
            $j = json_decode((string) $r['v'], true);
            $out[$r['k']] = $j === null ? (string) $r['v'] : $j;
        }
        return $out;
    } catch (Throwable $e) { return []; }
}

function settings_defaults(): array {
    return [
        'siteName' => 'سرمایه‌یار',
        'siteTagline' => 'سامانه جامع تحلیل بازار، سیگنال‌های هوشمند و مدیریت سبد دارایی',
        'allowRegister' => true,
        'requireApproval' => false,
        'requireLogin' => true,
        'allowGuest' => false,
        'defaultTheme' => 'dark',

        /* تنظیمات پیشرفته ثبت‌نام، ورود و امنیت */
        'allowLogin' => true,
        'registerMode' => 'public', // 'public' یا 'invite_only'
        'autoLoginAfterRegister' => true,
        'defaultUserStatus' => 'active', // 'active' یا 'pending'
        'defaultUserRole' => 'user',
        'defaultUserGroup' => 'کاربران عمومی',
        'allowProfileEdit' => true,
        'preventDuplicateEmail' => true,
        'preventDuplicateMobile' => true,
        'preventDuplicateUsername' => true,
        'usernameRule' => 'alphanumeric',
        'passMinLen' => 6,
        'passMaxLen' => 100,
        'passRequireUpper' => false,
        'passRequireLower' => false,
        'passRequireNumber' => false,
        'passRequireSpecial' => false,
        'maxLoginAttempts' => 5,
        'lockoutDurationMin' => 15,

        /* کلمات بازیابی حساب (Recovery Words / Mnemonic) */
        'recoveryWordsEnabled' => true,
        'recoveryWordsCount' => 12, // 6, 8, 10, 12, 16
        'recoveryWordsMandatory' => true,
        'recoveryWordsRequireConfirmation' => true,
        'recoveryWordsAllowCopy' => true,
        'recoveryWordsAllowDownload' => true,
        'recoveryWordsTitle' => 'کلمات کلیدی بازیابی حساب (Recovery Words)',
        'recoveryWordsDesc' => 'این کلمات کلید اختصاصی بازیابی حساب کاربری شما هستند. در صورتی که رمز عبور خود را فراموش کنید، تنها با این کلمات می‌توانید حساب خود را بازیابی فرمایید.',
        'recoveryWordsWarning' => 'هشدار امنیتی: این کلمات را در محلی امن و آفلاین یادداشت کنید. کلمات را هرگز در اختیار شخص دیگری قرار ندهید.',
        'recoveryWordsConfirmLabel' => 'کلمات بازیابی را در محلی امن یادداشت و ذخیره کردم.',

        /* روش‌ها و امنیت ورود */
        'loginIdentifierMode' => 'any', // 'any' (ایمیل/نام کاربری/موبایل), 'email_only', 'username_only', 'mobile_only'
        'loginRememberMeEnabled' => true,
        'loginForgotPasswordEnabled' => true,
        'loginRecoveryWordsEnabled' => true,
        'loginCaptchaEnabled' => false,

        /* بازیابی حساب */
        'recoveryMethodEmail' => true,
        'recoveryMethodMobile' => false,
        'recoveryMethodWords' => true,

        /* قوانین و توافق‌نامه */
        'termsRequired' => true,
        'termsText' => 'قوانین و مقررات استفاده از خدمات سرمایه‌یار',
        'termsLink' => '#',
        'privacyText' => 'سیاست حفظ حریم خصوصی',
        'privacyLink' => '#',

        /* تنظیمات ظاهری فرم‌های ورود و عضویت */
        'authFormTitle' => 'سرمایه‌یار',
        'authFormTagline' => 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان',
        'authShowLogo' => true,
        'authRegisterBtnText' => 'ساخت حساب کاربری',
        'authLoginBtnText' => 'ورود به حساب',

        /* تنظیمات موتور تحلیل و سیگنال‌ها */
        'signalCount' => 8,
        'minOppScore' => 40,
        'lagWeight' => 40,
        'trendWeight' => 35,
        'autoRegenMins' => 15,
        /* شبکه و منابع داده */
        'httpProxy' => '',
        'srcTimeout' => 15,
        'srcInsecure' => false,
        'srcTgju' => true,
        'srcYahoo' => true,
        'srcCoingecko' => true,
        /* تنظیمات نوار حرکتی قیمت‌ها (Ticker Marquee) */
        'tickerEnabled' => true,
        'tickerDirection' => 'rtl', // 'rtl' یا 'ltr'
        'tickerSpeed' => 'medium', // 'slow', 'medium', 'fast'
        'tickerPauseOnHover' => true,
        'tickerItemCount' => 12, // تعداد قیمت‌های نمایشی (0 = همه)
        /* کنترل نمایش یا عدم نمایش ابزارها در تب سیگنال‌ها توسط مدیر */
        'signalShowCalculator' => true, // نمایش ماشین‌حساب هوشمند حجم و پله‌های ورود
        'signalShowStrategy' => true,   // نمایش دکمه استراتژی دارایی (دارم / بخرم؟)
        'signalShowAutoInvest' => true, // نمایش دکمه سرمایه‌گذاری خودکار با کیف‌پول
        /* درگاه‌های پرداخت ریالی (Payment Gateways) */
        'gatewayActive' => 'test', // 'test', 'zarinpal', 'nextpay', 'payping', 'idpay', 'zibal', 'mellat'
        'zarinpalMerchant' => '',
        'zarinpalSandbox' => true,
        'nextpayKey' => '',
        'paypingToken' => '',
        'idpayKey' => '',
        'idpaySandbox' => true,
        'zibalMerchant' => '',
        'mellatTerminal' => '',
        'mellatUser' => '',
        'mellatPass' => '',
        /* درگاه پرداخت ارز دیجیتال (Crypto Payment Gateway) */
        'cryptoGatewayActive' => 'oxapay', // 'oxapay', 'nowpayments', 'cryptomus', 'direct_trc20'
        'cryptoGatewayEnabled' => true,
        'cryptoMerchantKey' => '',
        'cryptoPayoutAddress' => '', // آدرس پیش‌فرض
        'cryptoPayoutTrc20' => 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF',
        'cryptoPayoutTon' => 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF',
        'cryptoPayoutBep20' => '0x71c5b88ec3011a00a0684f88b77d6124ac374829',
        'cryptoUsdtNetwork' => 'TRC20', // 'TRC20', 'TON', 'BEP20'
        'cryptoAutoConfirm' => false,
        'cryptoInvoiceExpireMin' => 30, // مدت زمان اعتبار فرم/فاکتور واریز رمزارز (دقیقه)
        'cryptoDepositTemplate' => 'cd_tpl1', // قالب نمایش بخش واریز رمزارز در کیف پول
        'cryptoGatewayCoins' => [
            ['id' => 'usdt_trc20', 'symbol' => 'USDT', 'name' => 'تتر (Tether USDT)', 'network' => 'TRC20', 'address' => 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF', 'priceUsd' => 1.0, 'icon' => '💎', 'active' => true],
            ['id' => 'usdt_ton',   'symbol' => 'USDT', 'name' => 'تتر شبکه تون (USDT-TON)', 'network' => 'TON', 'address' => 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF', 'priceUsd' => 1.0, 'icon' => '💠', 'active' => true],
            ['id' => 'usdt_bep20', 'symbol' => 'USDT', 'name' => 'تتر بایننس (USDT-BEP20)', 'network' => 'BEP20', 'address' => '0x71c5b88ec3011a00a0684f88b77d6124ac374829', 'priceUsd' => 1.0, 'icon' => '🟡', 'active' => true],
            ['id' => 'btc_main',   'symbol' => 'BTC',  'name' => 'بیت‌کوین (Bitcoin)', 'network' => 'BTC', 'address' => 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'priceUsd' => 84500.0, 'icon' => '₿', 'active' => true],
            ['id' => 'eth_erc20',  'symbol' => 'ETH',  'name' => 'اتریوم (Ethereum)', 'network' => 'ERC20', 'address' => '0x71c5b88ec3011a00a0684f88b77d6124ac374829', 'priceUsd' => 2780.0, 'icon' => 'Ξ', 'active' => true],
            ['id' => 'trx_main',   'symbol' => 'TRX',  'name' => 'ترون (Tron TRX)', 'network' => 'TRC20', 'address' => 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF', 'priceUsd' => 0.245, 'icon' => '🔺', 'active' => true],
            ['id' => 'ton_main',   'symbol' => 'TON',  'name' => 'تون‌کوین (Toncoin)', 'network' => 'TON', 'address' => 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF', 'priceUsd' => 3.85, 'icon' => '💎', 'active' => true],
            ['id' => 'sol_main',   'symbol' => 'SOL',  'name' => 'سولانا (Solana)', 'network' => 'SOL', 'address' => '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV', 'priceUsd' => 176.5, 'icon' => '🟣', 'active' => true],
        ],
        'minWithdrawAmount' => 50000, // حداقل مبلغ برداشت ریالی (تومان)
        /* درگاه‌های پیامک (SMS Gateways) */
        'smsActive' => 'simulated', // 'simulated', 'kavenegar', 'ghasedak', 'farazsms', 'melipayamak', 'smsir'
        'smsApiKey' => '',
        'smsSenderNumber' => '10002000',
        'smsPatternSignal' => '',
        'smsPatternExpiry' => '',
        'smsOnSignal' => false,
        'smsOnTrade' => false,
        /* قیمت‌گذاری اعلان‌ها (Notification Pricing) */
        'alertVipPrice' => 50000,
        'alertSmsPerUnit' => 200,
        'alertFreeSignals' => true,

        /* تنظیمات پیش‌فرض تم، صفحه ورود/ثبت‌نام و فراموشی رمز عبور */
        'defaultThemeMode' => 'dark', // 'dark' یا 'light' — حالت پیش‌فرض سایت
        'authPageTemplate' => 'auth_tpl1',
        'forgotPageTemplate' => 'fp_tpl1',
        'forgotVerificationMode' => 'email_and_words', // همه حالت‌ها: words_only, email_only, mobile_only, username_only, email_and_words, mobile_and_words, username_and_words, email_and_mobile, email_and_username, mobile_and_username, email_mobile_and_words, any_with_words, all_tabs_user_choice
        'forgotPasswordEnabled' => true,
        'forgotAllowRecoveryWords' => true,
        'forgotAllowEmailReset' => true,
        'forgotAllowDirectReset' => true,
        'forgotModalTitle' => 'بازیابی رمز عبور و حساب کاربری',
        'forgotModalSubtitle' => 'روش مورد نظر خود را جهت بازیابی و تغییر رمز عبور انتخاب کنید',
        'forgotLinkText' => 'بازیابی رمز عبور / کلمات کلیدی',
        'forgotTabWordsTitle' => '🔑 بازیابی با کلمات کلیدی',
        'forgotTabEmailTitle' => '📧 ارسال کد به ایمیل / پیامک',
        'forgotTabDirectTitle' => '⚡ بازنشانی سریع با مشخصات حساب',
        'forgotWordsHint' => 'کلمات بازیابی صادرشده هنگام ثبت‌نام را به ترتیب در باکس‌های زیر وارد نمایید (یا کل عبارت را در باکس اول Paste کنید).',
        'forgotSubmitBtnText' => 'تغییر رمز عبور و بازیابی حساب',
        'forgotSuccessMessage' => 'رمز عبور شما با موفقیت تغییر یافت! اکنون می‌توانید وارد حساب خود شوید.',

        /* ==================== مدیریت جامع ظاهر، منوها، دکمه‌ها و دسترسی‌ها (UI Customizer) ==================== */
        /* ۰. قالب‌های نمایش صفحات (۱۰ قالب ورود/ثبت‌نام + ۵ قالب فراموشی رمز + ۱۰ قالب داشبورد + ۱۰ قالب سیگنال + ۱۰ قالب معاملات خودکار + سایر منوها = ۸۰ قالب) */
        'pageTemplates' => [
            'authPage'      => ['active' => 'auth_tpl1', 'allowUserSelect' => false, 'allowed' => ['auth_tpl1', 'auth_tpl2', 'auth_tpl3', 'auth_tpl4', 'auth_tpl5', 'auth_tpl6', 'auth_tpl7', 'auth_tpl8', 'auth_tpl9', 'auth_tpl10']],
            'forgotPage'    => ['active' => 'fp_tpl1',   'allowUserSelect' => false, 'allowed' => ['fp_tpl1', 'fp_tpl2', 'fp_tpl3', 'fp_tpl4', 'fp_tpl5']],
            'dashboard'     => ['active' => 'dash_tpl1', 'allowUserSelect' => false, 'allowed' => ['dash_tpl1', 'dash_tpl2', 'dash_tpl3', 'dash_tpl4', 'dash_tpl5', 'dash_tpl6', 'dash_tpl7', 'dash_tpl8', 'dash_tpl9', 'dash_tpl10']],
            'signals'       => ['active' => 'tpl1',      'allowUserSelect' => false, 'allowed' => ['tpl1', 'tpl2', 'tpl3', 'tpl4', 'tpl5', 'tpl6', 'tpl7', 'tpl8', 'tpl9', 'tpl10']],
            'autoInvest'    => ['active' => 'ai_tpl1',   'allowUserSelect' => false, 'allowed' => ['ai_tpl1', 'ai_tpl2', 'ai_tpl3', 'ai_tpl4', 'ai_tpl5', 'ai_tpl6', 'ai_tpl7', 'ai_tpl8', 'ai_tpl9', 'ai_tpl10']],
            'portfolio'     => ['active' => 'pf_tpl1',   'allowUserSelect' => false, 'allowed' => ['pf_tpl1', 'pf_tpl2', 'pf_tpl3', 'pf_tpl4', 'pf_tpl5']],
            'subscriptions' => ['active' => 'wal_tpl1',  'allowUserSelect' => false, 'allowed' => ['wal_tpl1', 'wal_tpl2', 'wal_tpl3', 'wal_tpl4', 'wal_tpl5']],
            'cryptoDeposit' => ['active' => 'cd_tpl1',   'allowUserSelect' => false, 'allowed' => ['cd_tpl1', 'cd_tpl2', 'cd_tpl3', 'cd_tpl4', 'cd_tpl5']],
            'notifications' => ['active' => 'not_tpl1',  'allowUserSelect' => false, 'allowed' => ['not_tpl1', 'not_tpl2', 'not_tpl3', 'not_tpl4', 'not_tpl5']],
            'aiAnalysis'    => ['active' => 'aia_tpl1',  'allowUserSelect' => false, 'allowed' => ['aia_tpl1', 'aia_tpl2', 'aia_tpl3', 'aia_tpl4', 'aia_tpl5']],
            'chat'          => ['active' => 'chat_tpl1', 'allowUserSelect' => false, 'allowed' => ['chat_tpl1', 'chat_tpl2', 'chat_tpl3', 'chat_tpl4', 'chat_tpl5']],
            'guide'         => ['active' => 'gde_tpl1',  'allowUserSelect' => false, 'allowed' => ['gde_tpl1', 'gde_tpl2', 'gde_tpl3', 'gde_tpl4', 'gde_tpl5']],
        ],

        /* ۱. منوها و ناوبری سایت (Navigation Items) */
        'navItems' => [
            ['id' => 'dashboard', 'label' => 'داشبورد', 'icon' => '📊', 'view' => 'dashboard', 'order' => 1, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'signals', 'label' => 'سیگنال‌ها و فرصت‌ها', 'icon' => '⚡', 'view' => 'signals', 'order' => 2, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'auto-invest', 'label' => 'معاملات خودکار', 'icon' => '🤖', 'view' => 'auto-invest', 'order' => 3, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'portfolio', 'label' => 'پرتفوی من', 'icon' => '💼', 'view' => 'portfolio', 'order' => 4, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'subscriptions', 'label' => 'اشتراک و کیف‌پول', 'icon' => '💎', 'view' => 'subscriptions', 'order' => 5, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'notifications', 'label' => 'اعلان‌ها', 'icon' => '🔔', 'view' => 'notifications', 'order' => 6, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'ai-analysis', 'label' => 'تحلیل هوش مصنوعی', 'icon' => '🧠', 'view' => 'ai-analysis', 'order' => 7, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'chat', 'label' => 'گفتگو با تحلیلگر', 'icon' => '💬', 'view' => 'chat', 'order' => 8, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'guide', 'label' => 'راهنما', 'icon' => '📖', 'view' => 'guide', 'order' => 9, 'active' => true, 'badge' => '', 'roles' => ['guest', 'user', 'subscriber', 'admin']],
            ['id' => 'admin', 'label' => 'پنل مدیریت', 'icon' => '🛡️', 'view' => 'admin', 'order' => 10, 'active' => true, 'badge' => 'مدیر', 'roles' => ['admin']],
        ],

        /* ۲. دکمه‌ها و المان‌های تعاملی (Action Buttons & CTAs) */
        'buttonsConfig' => [
            'btn_auto_invest' => [
                'label' => '⚡ سرمایه‌گذاری خودکار با کیف‌پول',
                'icon' => '⚡',
                'active' => true,
                'bg_color' => '#22c55e',
                'text_color' => '#052e16',
                'hover_bg' => '#16a34a',
                'hover_text' => '#ffffff',
                'border_radius' => '10px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_signal_detail' => [
                'label' => '🔍 تحلیل و سطوح معامله',
                'icon' => '🔍',
                'active' => true,
                'bg_color' => '#22d3ee',
                'text_color' => '#083344',
                'hover_bg' => '#06b6d4',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_asset_advisory' => [
                'label' => '🎯 استراتژی دارایی من (دارم / بخرم؟)',
                'icon' => '🎯',
                'active' => true,
                'bg_color' => '#22d3ee',
                'text_color' => '#083344',
                'hover_bg' => '#06b6d4',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_ai_chat' => [
                'label' => '🤖 تحلیل عمیق با AI',
                'icon' => '🤖',
                'active' => true,
                'bg_color' => '#38bdf8',
                'text_color' => '#082f49',
                'hover_bg' => '#0284c7',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_wallet_recharge' => [
                'label' => '💳 شارژ آنلاین کیف‌پول',
                'icon' => '💳',
                'active' => true,
                'bg_color' => '#22c55e',
                'text_color' => '#052e16',
                'hover_bg' => '#16a34a',
                'hover_text' => '#ffffff',
                'border_radius' => '10px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_portfolio_add' => [
                'label' => '＋ افزودن به پرتفوی',
                'icon' => '＋',
                'active' => true,
                'bg_color' => '#38bdf8',
                'text_color' => '#082f49',
                'hover_bg' => '#0284c7',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_auto_close' => [
                'label' => '💰 خروج و تسویه به کیف‌پول',
                'icon' => '💰',
                'active' => true,
                'bg_color' => '#ef4444',
                'text_color' => '#ffffff',
                'hover_bg' => '#dc2626',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_alloc_calc' => [
                'label' => '🧮 ماشین‌حساب هوشمند حجم و پله‌ها',
                'icon' => '🧮',
                'active' => true,
                'bg_color' => '#a855f7',
                'text_color' => '#ffffff',
                'hover_bg' => '#9333ea',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_crypto_payment' => [
                'label' => '🪙 پرداخت رمزارزی (تتر TRC20)',
                'icon' => '🪙',
                'active' => true,
                'bg_color' => '#10b981',
                'text_color' => '#052e16',
                'hover_bg' => '#059669',
                'hover_text' => '#ffffff',
                'border_radius' => '10px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_withdraw_request' => [
                'label' => '🏦 ثبت درخواست تسویه پایا (شبا)',
                'icon' => '🏦',
                'active' => true,
                'bg_color' => '#f59e0b',
                'text_color' => '#451a03',
                'hover_bg' => '#d97706',
                'hover_text' => '#ffffff',
                'border_radius' => '10px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_sub_purchase' => [
                'label' => '💎 خرید و فعال‌سازی اشتراک VIP',
                'icon' => '💎',
                'active' => true,
                'bg_color' => '#8b5cf6',
                'text_color' => '#ffffff',
                'hover_bg' => '#7c3aed',
                'hover_text' => '#ffffff',
                'border_radius' => '10px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_alert_create' => [
                'label' => '🔔 ثبت هشدار قیمتی و پیامکی',
                'icon' => '🔔',
                'active' => true,
                'bg_color' => '#06b6d4',
                'text_color' => '#083344',
                'hover_bg' => '#0891b2',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_refresh_market' => [
                'label' => '↻ بروزرسانی زنده بازار',
                'icon' => '↻',
                'active' => true,
                'bg_color' => '#1e293b',
                'text_color' => '#f1f5f9',
                'hover_bg' => '#334155',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_theme_toggle' => [
                'label' => '🌓 تغییر حالت شب و روز',
                'icon' => '🌓',
                'active' => true,
                'bg_color' => '#1e293b',
                'text_color' => '#f1f5f9',
                'hover_bg' => '#334155',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
            'btn_export_data' => [
                'label' => '📤 خروجی اکسل / CSV',
                'icon' => '📤',
                'active' => true,
                'bg_color' => '#3b82f6',
                'text_color' => '#ffffff',
                'hover_bg' => '#2563eb',
                'hover_text' => '#ffffff',
                'border_radius' => '8px',
                'roles' => ['guest', 'user', 'subscriber', 'admin']
            ],
        ],

        /* ۳. تِم، تایپوگرافی، رنگ‌ها و فونت (Visual Theme & Styles) */
        'themeStyles' => [
            'themePreset' => 'dark-neon',
            'fontFamily' => 'Vazirmatn',
            'fontSizeBase' => '14px',
            'borderRadius' => '12px',
            'bgColor' => '#0b121e',
            'surfaceColor' => '#111c2e',
            'panelColor' => '#152238',
            'panel2Color' => '#1a2a44',
            'headerBg' => 'rgba(11, 18, 30, 0.85)',
            'txtColor' => '#f1f5f9',
            'mutedColor' => '#94a3b8',
            'muted2Color' => '#64748b',
            'accentColor' => '#22d3ee',
            'accentHover' => '#06b6d4',
            'accentTxt' => '#083344',
            'upColor' => '#22c55e',
            'downColor' => '#ef4444',
            'warnColor' => '#f59e0b',
            'btnPrimaryBg' => '#22d3ee',
            'btnPrimaryTxt' => '#083344',
            'btnPrimaryHoverBg' => '#06b6d4',
            'btnPrimaryHoverTxt' => '#ffffff',
            'btnRadius' => '10px',
            'cardRadius' => '14px',
            'customCss' => '',
        ],

        /* ۴. ماتریس دسترسی و نمایش المان‌ها برای نقش‌ها (Visibility Matrix) */
        'visibilityRules' => [
            'views' => [
                'dashboard' => ['guest', 'user', 'subscriber', 'admin'],
                'market' => ['guest', 'user', 'subscriber', 'admin'],
                'signals' => ['guest', 'user', 'subscriber', 'admin'],
                'auto-invest' => ['guest', 'user', 'subscriber', 'admin'],
                'portfolio' => ['guest', 'user', 'subscriber', 'admin'],
                'chat' => ['guest', 'user', 'subscriber', 'admin'],
                'subscriptions' => ['guest', 'user', 'subscriber', 'admin'],
                'notifications' => ['guest', 'user', 'subscriber', 'admin'],
                'ai-analysis' => ['guest', 'user', 'subscriber', 'admin'],
                'ai' => ['guest', 'user', 'subscriber', 'admin'],
                'guide' => ['guest', 'user', 'subscriber', 'admin'],
                'news' => ['guest', 'user', 'subscriber', 'admin'],
                'admin' => ['admin'],
                'ai-settings' => ['admin'],
                'settings' => ['admin'],
                'setup' => ['admin'],
            ],
            'features' => [
                'header_ticker' => ['guest', 'user', 'subscriber', 'admin'],
                'dash_auto_invest_banner' => ['guest', 'user', 'subscriber', 'admin'],
                'signal_auto_invest_btn' => ['guest', 'user', 'subscriber', 'admin'],
                'signal_advisory_btn' => ['guest', 'user', 'subscriber', 'admin'],
                'signal_calc_btn' => ['guest', 'user', 'subscriber', 'admin'],
                'signals_vip' => ['guest', 'user', 'subscriber', 'admin'],
                'ai_chat_modal' => ['guest', 'user', 'subscriber', 'admin'],
                'ai_models' => ['guest', 'user', 'subscriber', 'admin'],
                'wallet_recharge' => ['guest', 'user', 'subscriber', 'admin'],
                'crypto_payment' => ['guest', 'user', 'subscriber', 'admin'],
                'wallet_withdraw' => ['guest', 'user', 'subscriber', 'admin'],
                'portfolio_add' => ['guest', 'user', 'subscriber', 'admin'],
                'export_data' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_auto_invest' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_signal_detail' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_asset_advisory' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_ai_chat' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_wallet_recharge' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_crypto_payment' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_withdraw_request' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_sub_purchase' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_portfolio_add' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_auto_close' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_alloc_calc' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_alert_create' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_refresh_market' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_theme_toggle' => ['guest', 'user', 'subscriber', 'admin'],
                'btn_export_data' => ['guest', 'user', 'subscriber', 'admin'],
                'admin_panel' => ['admin'],
                'ai_settings' => ['admin'],
                'system_settings' => ['admin'],
            ],
        ],
    ];
}

function settings_effective(): array {
    return array_merge(settings_defaults(), settings_all());
}

/* ------------------------------ متای کاربر و کیف پول ------------------------------ */

function user_meta_get(int $userId): array {
    if (!db_ok() || $userId <= 0) return [];
    try {
        $raw = db_val('SELECT meta FROM users WHERE id = ?', [$userId]);
        if (!$raw) return [];
        $j = json_decode((string) $raw, true);
        return is_array($j) ? $j : [];
    } catch (Throwable $e) { return []; }
}

function user_meta_set(int $userId, array $meta): void {
    if (!db_ok() || $userId <= 0) return;
    try {
        db_exec('UPDATE users SET meta = ? WHERE id = ?', [json_encode($meta, JSON_UNESCAPED_UNICODE), $userId]);
    } catch (Throwable $e) {}
}

function user_wallet_balance(int $userId): int {
    $m = user_meta_get($userId);
    return max(0, (int) ($m['walletBalance'] ?? 0));
}

function user_wallet_adj(int $userId, string $type, int $amount, string $description = '', string $refId = ''): array {
    if (!db_ok() || $userId <= 0) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $meta = user_meta_get($userId);
    $current = max(0, (int) ($meta['walletBalance'] ?? 0));
    $isDeduct = in_array($type, ['withdraw', 'withdraw_pending', 'pay_plan', 'pay_alert', 'admin_deduct', 'auto_invest'], true);
    $delta = $isDeduct ? -abs($amount) : abs($amount);
    $newBalance = $current + $delta;
    if ($newBalance < 0) return ['ok' => false, 'error' => 'موجودی کیف پول کافی نیست. (کسری: ' . number_format(abs($newBalance)) . ' تومان)'];

    $meta['walletBalance'] = $newBalance;
    user_meta_set($userId, $meta);

    try {
        db_exec('INSERT INTO wallet_tx (user_id, type, amount, balance_after, description, ref_id, created_at) VALUES (?,?,?,?,?,?,?)', [
            $userId, $type, $isDeduct ? -abs($amount) : abs($amount), $newBalance, $description, $refId, db_now_ms(),
        ]);
    } catch (Throwable $e) {}

    audit('wallet_' . $type, 'تراکنش ' . number_format($amount) . ' تومان: ' . $description . ' (موجودی جدید: ' . number_format($newBalance) . ')', $userId);
    return ['ok' => true, 'balance' => $newBalance, 'delta' => $delta];
}

/* ------------------------------ اشتراک‌ها و پلن‌ها ------------------------------ */

function db_plans_init_defaults(): void {
    if (!db_ok()) return;
    try {
        $c = (int) db_val('SELECT COUNT(*) FROM plans');
        if ($c === 0) {
            $ts = db_now_ms();
            $defaults = [
                ['title' => 'پلن برنزی (پایه)', 'price' => 0, 'days' => 30, 'features' => 'مشاهده سیگنال‌های عمومی بازار,مدیریت سبد دارایی پایه,تحلیل تکنیکال سطح ۱', 'badge' => 'رایگان', 'active' => 1],
                ['title' => 'پلن نقره‌ای (حرفه‌ای)', 'price' => 190000, 'days' => 60, 'features' => 'دسترسی کامل به ۶۰+ سیگنال ایران و جهان,محاسبه هوشمند ورود پله‌ای و حد ضرر,تحلیل اختصاصی هوش مصنوعی,اولویت دریافت اعلان‌های وب', 'badge' => 'محبوب‌ترین', 'active' => 1],
                ['title' => 'پلن طلایی (VIP و نامحدود)', 'price' => 490000, 'days' => 180, 'features' => 'دسترسی نامحدود VIP به تمام بازارها,چت زنده و نامحدود با تحلیلگر هوش مصنوعی,هشدارهای فوری پیامکی و تلگرام,پشتیبانی اختصاصی مدیر', 'badge' => 'ویژه سرمایه‌گذاران', 'active' => 1],
            ];
            foreach ($defaults as $d) {
                db_exec('INSERT INTO plans (title, price, days, features, badge, active, created_at) VALUES (?,?,?,?,?,?,?)', [
                    $d['title'], $d['price'], $d['days'], $d['features'], $d['badge'], $d['active'], $ts,
                ]);
            }
        }
    } catch (Throwable $e) {}
}

function user_subscription_active(int $userId): ?array {
    if (!db_ok() || $userId <= 0) return null;
    $now = db_now_ms();
    try {
        $sub = db_one('SELECT * FROM subscriptions WHERE user_id = ? AND status = "active" AND expires_at > ? ORDER BY expires_at DESC LIMIT 1', [$userId, $now]);
        if ($sub) {
            $daysLeft = max(0, (int) ceil(($sub['expires_at'] - $now) / 86400000));
            $sub['daysLeft'] = $daysLeft;
            return $sub;
        }
    } catch (Throwable $e) {}
    return null;
}

/* ------------------------------ اعلان‌ها و هشدارها ------------------------------ */

function notification_send(int $userId, string $title, string $body, string $category = 'signal'): void {
    if (!db_ok()) return;
    try {
        db_exec('INSERT INTO notifications (user_id, title, body, category, is_read, created_at) VALUES (?,?,?,?,?,?)', [
            $userId, mb_substr($title, 0, 150), $body, $category, 0, db_now_ms(),
        ]);
    } catch (Throwable $e) {}
}

function notifications_init_welcome(int $userId): void {
    if ($userId <= 0) return;
    notification_send($userId, 'به سرمایه‌یار خوش آمدید! 🌟', 'حساب کاربری شما فعال شد. هم‌اکنون می‌توانید دارایی‌های خود را ثبت کرده و سیگنال‌های هوشمند بازار را دریافت کنید.', 'system');
}

/* ------------------------------ لاگ رویداد ------------------------------ */

function audit(string $action, string $detail = '', ?int $userId = null, string $ip = ''): void {
    if (!db_ok()) { u_log('audit ' . $action . ' ' . $detail); return; }
    try {
        db_exec('INSERT INTO audit_log (user_id, action, detail, ip, created_at) VALUES (?,?,?,?,?)', [
            (int) ($userId ?? (function_exists('auth_id') ? (auth_id() ?? 0) : 0)),
            mb_substr($action, 0, 64),
            mb_substr($detail, 0, 500),
            mb_substr($ip !== '' ? $ip : (function_exists('auth_ip') ? auth_ip() : ''), 0, 64),
            (int) round(microtime(true) * 1000),
        ]);
    } catch (Throwable $e) { u_log('audit failed: ' . $e->getMessage()); }
}

function audit_recent(int $limit = 100, int $userId = 0): array {
    if (!db_ok()) return [];
    $limit = max(1, min(500, $limit));
    try {
        if ($userId > 0) return db_all('SELECT * FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ' . $limit, [$userId]);
        return db_all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ' . $limit);
    } catch (Throwable $e) { return []; }
}

function db_now_ms(): int { return (int) round(microtime(true) * 1000); }
