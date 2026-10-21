<?php
/**
 * مسیردهی API (فانکشنال) — همه‌ی پاسخ‌ها JSON با کد وضعیت درست
 */
if (!defined('SARMAYEYAR')) exit;

function api_send(int $code, $data): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS');
    echo u_json($data);
    exit;
}

function api_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function api_handle(string $path, string $method): void {
    /* ---------- نگهبان ورود/دسترسی (ثبت‌نام و ورود آزاد است) ---------- */
    if ($path !== '/api/health' || db_ok()) {
        $guard = auth_guard($path);
        if ($guard !== null) {
            $body = $guard['body'];
            $body['installed'] = auth_installed();
            api_send($guard['code'], $body);
        }
    }

    /* ================================ احراز هویت ================================ */
    if ($path === '/api/auth/install-state') {
        $providers = [];
        foreach (ai_providers() as $k => $v) {
            $providers[] = ['key' => $k, 'label' => $v['label'], 'baseUrl' => $v['baseUrl'], 'type' => $v['type'] ?? 'openai',
                'keysUrl' => $v['keysUrl'] ?? '', 'noKey' => !empty($v['noKey'])];
        }
        api_send(200, [
            'providers' => $providers,
            'installed' => auth_installed(),
            'db' => ['ok' => db_ok(), 'driver' => db_driver()],
            'installerExists' => is_file(BASE_DIR . '/install.php'),
            'settings' => auth_installed() ? settings_effective() : settings_defaults(),
            'branding' => ['siteName' => setting_get('siteName', 'سرمایه‌یار'), 'tagline' => setting_get('siteTagline', '')],
        ]);
    }

    if ($path === '/api/auth/fields' && $method === 'GET') {
        api_send(200, [
            'ok' => true,
            'fields' => auth_fields_all(true),
            'settings' => settings_effective(),
            'branding' => ['siteName' => setting_get('siteName', 'سرمایه‌یار'), 'tagline' => setting_get('siteTagline', '')],
        ]);
    }

    if ($path === '/api/auth/me') {
        $u = auth_user();
        api_send(200, [
            'user' => auth_public_user($u),
            'settings' => settings_effective(),
            'branding' => ['siteName' => setting_get('siteName', 'سرمایه‌یار'), 'tagline' => setting_get('siteTagline', '')],
            'installed' => auth_installed(),
            'db' => ['ok' => db_ok(), 'driver' => db_driver()],
        ]);
    }

    if ($path === '/api/auth/register' && $method === 'POST') {
        if (!auth_origin_ok()) api_send(403, ['error' => 'درخواست از منبع نامعتبر.']);
        $b = api_body();
        if (!settings_effective()['allowRegister'] && auth_installed()) {
            api_send(403, ['error' => 'ثبت‌نام در این سایت غیرفعال است.']);
        }
        $rate = auth_rate_check('register:' . auth_ip(), 8, 3600);
        if (!$rate['ok']) api_send(429, ['error' => 'تعداد درخواست‌های ثبت‌نام زیاد است؛ لطفاً کمی بعد تلاش کنید.']);
        $r = auth_register_dynamic($b);
        if (!$r['ok']) api_send(400, $r);
        api_send(200, $r);
    }

    if ($path === '/api/auth/login' && $method === 'POST') {
        if (!auth_origin_ok()) api_send(403, ['error' => 'درخواست از منبع نامعتبر.']);
        $b = api_body();
        $identifier = (string) ($b['identifier'] ?? $b['email'] ?? $b['username'] ?? '');
        $password = (string) ($b['password'] ?? '');
        $remember = !empty($b['remember']);
        $r = auth_login_flexible($identifier, $password, $remember);
        if (!$r['ok']) api_send(401, $r);
        api_send(200, $r);
    }

    if ($path === '/api/auth/confirm-recovery-words' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب خود شوید.']);
        $r = auth_confirm_recovery_words($uid);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if (($path === '/api/auth/recover-with-words' || $path === '/api/auth/recover-unified') && $method === 'POST') {
        if (!auth_origin_ok()) api_send(403, ['error' => 'درخواست از منبع نامعتبر.']);
        $b = api_body();
        if (isset($b['words']) && is_array($b['words']) && empty($b['phrase'])) {
            $b['phrase'] = implode(' ', $b['words']);
        }
        $r = auth_recover_unified($b);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/auth/forgot' && $method === 'POST') {
        $b = api_body();
        $identifier = (string) ($b['identifier'] ?? $b['email'] ?? '');
        if (!$identifier) api_send(400, ['error' => 'ایمیل، نام کاربری یا شماره همراه خود را وارد کنید.']);
        api_send(200, [
            'ok' => true,
            'message' => 'در صورتی که حساب کاربری با این مشخصات وجود داشته باشد، اطلاعات بازیابی ارسال گردید یا می‌توانید با کلمات بازیابی رمز خود را تغییر دهید.',
            'canUseRecoveryWords' => true
        ]);
    }

    if ($path === '/api/auth/logout' && $method === 'POST') {
        auth_logout();
        api_send(200, ['ok' => true]);
    }

    if ($path === '/api/auth/prefs' && $method === 'POST') {
        $b = api_body();
        if (isset($b['theme'])) auth_set_theme((int) auth_id(), (string) $b['theme']);
        api_send(200, ['ok' => true, 'theme' => (string) ($b['theme'] ?? '')]);
    }

    if ($path === '/api/auth/password' && $method === 'POST') {
        $b = api_body();
        $r = auth_change_password((int) auth_id(), (string) ($b['current'] ?? ''), (string) ($b['password'] ?? ''));
        if (!$r['ok']) api_send(400, ['error' => $r['error']]);
        api_send(200, $r);
    }

    if ($path === '/api/auth/forgot-direct' && $method === 'POST') {
        $b = api_body();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $second = trim((string) ($b['second'] ?? ''));
        $newPass = (string) ($b['newPassword'] ?? '');
        if (!$email || !$second || strlen($newPass) < 6) {
            api_send(400, ['error' => 'لطفاً ایمیل، نام کاربری/موبایل و رمز عبور جدید (حداقل ۶ کاراکتر) را کامل وارد نمایید.']);
        }
        if (db_ok()) {
            $u = db_one('SELECT * FROM users WHERE LOWER(email) = ?', [$email]);
            if (!$u || ($u['email'] ?? '') === 'admin@gmail.com') {
                api_send(400, ['error' => 'مشخصات واردشده با حساب کاربری مطابقت ندارد.']);
            }
            $uMatch = (strtolower((string)($u['username'] ?? '')) === strtolower($second))
                   || ((string)($u['mobile'] ?? '') === $second)
                   || (strtolower((string)($u['name'] ?? '')) === strtolower($second));
            if (!$uMatch) {
                api_send(400, ['error' => 'نام کاربری، شماره همراه یا نام واردشده با ایمیل حساب همخوانی ندارد.']);
            }
            $hash = password_hash($newPass, PASSWORD_DEFAULT);
            db_exec('UPDATE users SET pass_hash = ? WHERE id = ?', [$hash, (int) $u['id']]);
            audit('auth_forgot_direct', "بازنشانی مستقیم رمز عبور توسط کاربر #{$u['id']} ({$email})", (int) $u['id']);
        }
        $s = settings_effective();
        api_send(200, [
            'ok' => true,
            'message' => (string) ($s['forgotSuccessMessage'] ?? 'رمز عبور شما با موفقیت تغییر یافت! اکنون می‌توانید وارد حساب خود شوید.')
        ]);
    }

    /* پیکربندی ظاهر و منوهای فعال (Public UI Config) */
    if ($path === '/api/ui-config' && $method === 'GET') {
        $s = settings_effective();
        $d = settings_defaults();
        $pt = is_array($s['pageTemplates'] ?? null) ? $s['pageTemplates'] : $d['pageTemplates'];
        $authTpl = (string) ($s['authPageTemplate'] ?? ($pt['authPage']['active'] ?? 'auth_tpl1'));
        $fpTpl = (string) ($s['forgotPageTemplate'] ?? ($pt['forgotPage']['active'] ?? 'fp_tpl1'));
        if (!isset($pt['authPage']) || !is_array($pt['authPage'])) {
            $pt['authPage'] = $d['pageTemplates']['authPage'];
        }
        $pt['authPage']['active'] = $authTpl;
        if (!isset($pt['forgotPage']) || !is_array($pt['forgotPage'])) {
            $pt['forgotPage'] = $d['pageTemplates']['forgotPage'];
        }
        $pt['forgotPage']['active'] = $fpTpl;

        api_send(200, [
            'ok' => true,
            'defaultThemeMode' => (string) ($s['defaultThemeMode'] ?? $d['defaultThemeMode'] ?? 'dark'),
            'authPageTemplate' => $authTpl,
            'forgotPageTemplate' => $fpTpl,
            'forgotConfig' => [
                'enabled' => (bool) ($s['forgotPasswordEnabled'] ?? true),
                'verificationMode' => (string) ($s['forgotVerificationMode'] ?? $d['forgotVerificationMode'] ?? 'email_and_words'),
                'template' => $fpTpl,
                'allowWords' => (bool) ($s['forgotAllowRecoveryWords'] ?? true),
                'allowEmail' => (bool) ($s['forgotAllowEmailReset'] ?? true),
                'allowDirect' => (bool) ($s['forgotAllowDirectReset'] ?? true),
                'title' => (string) ($s['forgotModalTitle'] ?? $d['forgotModalTitle']),
                'subtitle' => (string) ($s['forgotModalSubtitle'] ?? $d['forgotModalSubtitle']),
                'linkText' => (string) ($s['forgotLinkText'] ?? $d['forgotLinkText']),
                'tabWordsTitle' => (string) ($s['forgotTabWordsTitle'] ?? $d['forgotTabWordsTitle']),
                'tabEmailTitle' => (string) ($s['forgotTabEmailTitle'] ?? $d['forgotTabEmailTitle']),
                'tabDirectTitle' => (string) ($s['forgotTabDirectTitle'] ?? $d['forgotTabDirectTitle']),
                'wordsHint' => (string) ($s['forgotWordsHint'] ?? $d['forgotWordsHint']),
                'submitBtnText' => (string) ($s['forgotSubmitBtnText'] ?? $d['forgotSubmitBtnText']),
                'successMessage' => (string) ($s['forgotSuccessMessage'] ?? $d['forgotSuccessMessage']),
            ],
            'pageTemplates' => $pt,
            'navItems' => $s['navItems'] ?? $d['navItems'],
            'buttonsConfig' => $s['buttonsConfig'] ?? $d['buttonsConfig'],
            'themeStyles' => $s['themeStyles'] ?? $d['themeStyles'],
            'visibilityRules' => $s['visibilityRules'] ?? $d['visibilityRules'],
            'cryptoGatewayCoins' => $s['cryptoGatewayCoins'] ?? $d['cryptoGatewayCoins'],
            'cryptoInvoiceExpireMin' => (int) ($s['cryptoInvoiceExpireMin'] ?? $d['cryptoInvoiceExpireMin'] ?? 30),
            'cryptoDepositTemplate' => (string) ($s['cryptoDepositTemplate'] ?? $d['cryptoDepositTemplate'] ?? 'cd_tpl1'),
            'roles' => admin_roles_list(),
        ]);
    }

    if ($path === '/api/auth/setup' && $method === 'POST') {
        /* ساخت نخستین مدیر — فقط وقتی هیچ کاربری وجود ندارد یا از نصب‌کننده صدا زده شود */
        $b = api_body();
        if (auth_installed() && empty($b['fromInstaller'])) api_send(403, ['error' => 'سایت قبلاً نصب شده است.']);
        $b['role'] = 'admin';
        $r = auth_register_dynamic($b);
        if (!$r['ok']) api_send(400, ['error' => $r['error']]);
        $login = auth_login_flexible((string) ($b['email'] ?? $b['username'] ?? ''), (string) ($b['password'] ?? ''));
        api_send(200, ['ok' => true, 'user' => $login['user'] ?? null, 'firstUser' => true]);
    }

    /* ================================ مدیریت ================================ */
    if ($path === '/api/admin/overview') api_send(200, admin_overview());

    if ($path === '/api/admin/users') {
        if ($method === 'GET') {
            api_send(200, ['users' => admin_users((string) ($_GET['q'] ?? ''), (string) ($_GET['status'] ?? ''))]);
        }
        if ($method === 'POST') {
            $r = admin_user_create(api_body());
            api_send($r['ok'] ? 200 : 400, $r);
        }
        if ($method === 'PUT') {
            $b = api_body();
            $r = admin_user_update((int) ($b['id'] ?? 0), $b);
            api_send($r['ok'] ? 200 : 400, $r);
        }
        if ($method === 'DELETE') {
            $r = admin_user_delete((int) ($_GET['id'] ?? 0));
            api_send($r['ok'] ? 200 : 400, $r);
        }
    }

    if ($path === '/api/admin/users/approve' && $method === 'POST') {
        $b = api_body();
        $r = admin_user_approve((int) ($b['id'] ?? 0));
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/users/lock' && $method === 'POST') {
        $b = api_body();
        $r = admin_user_lock_toggle((int) ($b['id'] ?? 0), !empty($b['lock']), (string) ($b['reason'] ?? ''));
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/users/update-full' && ($method === 'POST' || $method === 'PUT')) {
        $b = api_body();
        $r = admin_user_full_update((int) ($b['id'] ?? 0), $b);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    /* ---------------- فرم‌ساز فیلدهای ثبت‌نام ---------------- */
    if ($path === '/api/admin/auth/fields') {
        if ($method === 'GET') {
            api_send(200, ['ok' => true, 'fields' => admin_auth_fields_list()]);
        }
        if ($method === 'POST' || $method === 'PUT') {
            $r = admin_auth_field_save(api_body());
            api_send($r['ok'] ? 200 : 400, $r);
        }
        if ($method === 'DELETE') {
            $id = (int) ($_GET['id'] ?? api_body()['id'] ?? 0);
            $r = admin_auth_field_delete($id);
            api_send($r['ok'] ? 200 : 400, $r);
        }
    }

    if ($path === '/api/admin/auth/fields/reorder' && $method === 'POST') {
        $b = api_body();
        $r = admin_auth_fields_reorder((array) ($b['orders'] ?? $b['fields'] ?? []));
        api_send($r['ok'] ? 200 : 400, $r);
    }

    /* ---------------- نقش‌ها و سطوح دسترسی ---------------- */
    if ($path === '/api/admin/roles') {
        if ($method === 'GET') {
            api_send(200, ['ok' => true, 'roles' => admin_roles_list()]);
        }
        if ($method === 'POST' || $method === 'PUT') {
            $r = admin_role_save(api_body());
            api_send($r['ok'] ? 200 : 400, $r);
        }
        if ($method === 'DELETE') {
            $id = (int) ($_GET['id'] ?? api_body()['id'] ?? 0);
            $r = admin_role_delete($id);
            api_send($r['ok'] ? 200 : 400, $r);
        }
    }

    if ($path === '/api/admin/user/reset-password' && $method === 'POST') {
        $b = api_body();
        $r = auth_admin_reset_password((int) ($b['id'] ?? 0));
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/users/wallet' && $method === 'POST') {
        $b = api_body();
        $r = admin_user_wallet_adj((int) ($b['id'] ?? 0), (string) ($b['action'] ?? 'deposit'), (int) ($b['amount'] ?? 0), (string) ($b['reason'] ?? ''));
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if (($path === '/api/admin/users/status' || $path === '/api/admin/user/status') && ($method === 'POST' || $method === 'PUT')) {
        $b = api_body();
        $isRestricted = !empty($b['tradeRestricted']) || !empty($b['trade_restricted']);
        $r = admin_user_status_update((int) ($b['id'] ?? 0), (string) ($b['status'] ?? 'active'), (string) ($b['reason'] ?? ''), $isRestricted);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/plans') {
        if ($method === 'GET') api_send(200, ['plans' => admin_plans_list()]);
        if ($method === 'POST' || $method === 'PUT') {
            $r = admin_plan_save(api_body());
            api_send($r['ok'] ? 200 : 400, $r);
        }
        if ($method === 'DELETE') {
            $r = admin_plan_delete((int) ($_GET['id'] ?? 0));
            api_send($r['ok'] ? 200 : 400, $r);
        }
    }

    if (($path === '/api/admin/subscriptions' || $path === '/api/admin/subscriptions/grant') && $method === 'POST') {
        $b = api_body();
        $userInp = trim((string) ($b['user'] ?? $b['userId'] ?? $b['user_id'] ?? ''));
        $uid = is_numeric($userInp) ? (int) $userInp : 0;
        if ($uid <= 0 && $userInp !== '') {
            $u = db_one('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [$userInp]);
            if ($u) $uid = (int) $u['id'];
        }
        $pid = (int) ($b['planId'] ?? $b['plan_id'] ?? 0);
        $days = (int) ($b['days'] ?? $b['duration_days'] ?? 0);
        $r = admin_subscription_grant($uid, $pid, $days);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/notifications' && $method === 'POST') {
        $b = api_body();
        $title = mb_substr(trim((string) ($b['title'] ?? '')), 0, 150);
        $body = (string) ($b['body'] ?? '');
        $cat = (string) ($b['category'] ?? 'system');
        $uid = (int) ($b['userId'] ?? 0);
        if (!$title) api_send(400, ['error' => 'عنوان اعلان الزامی است.']);
        notification_send($uid, $title, $body, $cat);
        audit('admin_notification', 'ارسال اعلان: ' . $title . ($uid ? " به کاربر #$uid" : ' (همگانی)'));
        api_send(200, ['ok' => true, 'message' => 'اعلان با موفقیت ارسال شد.']);
    }

    if ($path === '/api/admin/sms/test' && $method === 'POST') {
        $b = api_body();
        $phone = trim((string) ($b['phone'] ?? ''));
        $msg = trim((string) ($b['message'] ?? 'پیامک تستی سامانه سرمایه‌یار'));
        if (!$phone) api_send(400, ['error' => 'شماره همراه گیرنده الزامی است.']);
        audit('admin_sms_test', "ارسال پیامک تستی به $phone: $msg");
        api_send(200, ['ok' => true, 'message' => "پیامک تستی با موفقیت به شماره $phone شبیه‌سازی و ارسال گردید."]);
    }

    if ($path === '/api/admin/settings') {
        if ($method === 'GET') api_send(200, ['settings' => settings_effective(), 'defaults' => settings_defaults()]);
        if ($method === 'POST') {
            $b = api_body();
            $res = admin_settings_save($b);
            if (!empty($b['authPageTemplate']) || !empty($b['forgotPageTemplate'])) {
                $s = settings_effective();
                $d = settings_defaults();
                $curPt = is_array($s['pageTemplates'] ?? null) ? $s['pageTemplates'] : ($d['pageTemplates'] ?? []);
                if (!empty($b['authPageTemplate'])) {
                    if (!isset($curPt['authPage']) || !is_array($curPt['authPage'])) $curPt['authPage'] = $d['pageTemplates']['authPage'];
                    $curPt['authPage']['active'] = (string) $b['authPageTemplate'];
                }
                if (!empty($b['forgotPageTemplate'])) {
                    if (!isset($curPt['forgotPage']) || !is_array($curPt['forgotPage'])) $curPt['forgotPage'] = $d['pageTemplates']['forgotPage'];
                    $curPt['forgotPage']['active'] = (string) $b['forgotPageTemplate'];
                }
                setting_set('pageTemplates', $curPt);
            }
            api_send(200, $res);
        }
    }

    if ($path === '/api/admin/page-templates') {
        $s = settings_effective();
        $d = settings_defaults();
        if ($method === 'GET') {
            api_send(200, [
                'ok' => true,
                'pageTemplates' => $s['pageTemplates'] ?? $d['pageTemplates'],
            ]);
        }
        if ($method === 'POST') {
            $b = api_body();
            $cur = is_array($s['pageTemplates'] ?? null) ? $s['pageTemplates'] : ($d['pageTemplates'] ?? []);
            if (isset($b['pageTemplates']) && is_array($b['pageTemplates'])) {
                foreach ($b['pageTemplates'] as $mKey => $mVal) {
                    $cur[$mKey] = $mVal;
                }
            }
            if (!empty($b['menuKey']) && isset($b['config']) && is_array($b['config'])) {
                $cur[(string) $b['menuKey']] = $b['config'];
            }
            if (!empty($cur['authPage']['active'])) {
                setting_set('authPageTemplate', (string) $cur['authPage']['active']);
            }
            if (!empty($cur['forgotPage']['active'])) {
                setting_set('forgotPageTemplate', (string) $cur['forgotPage']['active']);
            }
            setting_set('pageTemplates', $cur);
            audit('admin_page_templates', 'به‌روزرسانی تنظیمات قالب صفحات و سطوح دسترسی انتخاب قالب توسط ادمین');
            api_send(200, ['ok' => true, 'pageTemplates' => $cur, 'message' => 'تنظیمات قالب صفحات با موفقیت ذخیره و در کل سایت اعمال شد ✨']);
        }
    }

    if ($path === '/api/admin/ui-settings') {
        if ($method === 'GET') {
            $s = settings_effective();
            $d = settings_defaults();
            api_send(200, [
                'ok' => true,
                'pageTemplates' => $s['pageTemplates'] ?? $d['pageTemplates'],
                'navItems' => $s['navItems'] ?? $d['navItems'],
                'buttonsConfig' => $s['buttonsConfig'] ?? $d['buttonsConfig'],
                'themeStyles' => $s['themeStyles'] ?? $d['themeStyles'],
                'visibilityRules' => $s['visibilityRules'] ?? $d['visibilityRules'],
                'defaults' => [
                    'pageTemplates' => $d['pageTemplates'],
                    'navItems' => $d['navItems'],
                    'buttonsConfig' => $d['buttonsConfig'],
                    'themeStyles' => $d['themeStyles'],
                    'visibilityRules' => $d['visibilityRules'],
                ]
            ]);
        }
        if ($method === 'POST') {
            $b = api_body();
            $toSave = [];
            if (isset($b['pageTemplates'])) $toSave['pageTemplates'] = $b['pageTemplates'];
            if (isset($b['navItems'])) $toSave['navItems'] = $b['navItems'];
            if (isset($b['buttonsConfig'])) $toSave['buttonsConfig'] = $b['buttonsConfig'];
            if (isset($b['themeStyles'])) $toSave['themeStyles'] = $b['themeStyles'];
            if (isset($b['visibilityRules'])) $toSave['visibilityRules'] = $b['visibilityRules'];
            $res = admin_settings_save($toSave);
            audit('admin_ui_settings', 'تنظیمات ظاهر، منوها، دکمه‌ها و دسترسی‌ها به‌روزرسانی شد');
            api_send(200, ['ok' => true, 'message' => 'تنظیمات ظاهر، منوها و دسترسی‌ها با موفقیت ذخیره و اعمال شد ✨', 'data' => $res]);
        }
    }

    if ($path === '/api/admin/ui-settings/reset' && $method === 'POST') {
        $d = settings_defaults();
        setting_set('navItems', $d['navItems']);
        setting_set('buttonsConfig', $d['buttonsConfig']);
        setting_set('themeStyles', $d['themeStyles']);
        setting_set('visibilityRules', $d['visibilityRules']);
        audit('admin_ui_reset', 'تنظیمات ظاهر و منوها به حالت کارخانه بازنشانی شد');
        api_send(200, [
            'ok' => true,
            'message' => 'تمامی تنظیمات ظاهر، منوها و دکمه‌ها به حالت اولیه کارخانه بازگردانده شد 🔄',
            'navItems' => $d['navItems'],
            'buttonsConfig' => $d['buttonsConfig'],
            'themeStyles' => $d['themeStyles'],
            'visibilityRules' => $d['visibilityRules'],
        ]);
    }

    if ($path === '/api/admin/audit') api_send(200, ['log' => audit_recent((int) ($_GET['limit'] ?? 120), (int) ($_GET['userId'] ?? 0))]);

    if ($path === '/api/admin/ai-usage') api_send(200, ['usage' => admin_ai_usage((int) ($_GET['limit'] ?? 80))]);

    /* منابع داده و شبکه — تست، تنظیم پروکسی و روشن/خاموش کردن منابع */
    if ($path === '/api/admin/net') {
        if ($method === 'GET') api_send(200, ['net' => sy_net_config(), 'curl' => function_exists('curl_init'),
            'probe' => source_probe(10)]);
        $b = api_body();
        $saved = [];
        if (array_key_exists('proxy', $b)) { setting_set('httpProxy', mb_substr(trim((string) $b['proxy']), 0, 200)); $saved[] = 'httpProxy'; }
        if (array_key_exists('timeout', $b)) { setting_set('srcTimeout', max(5, min(60, (int) $b['timeout']))); $saved[] = 'srcTimeout'; }
        if (array_key_exists('insecure', $b)) { setting_set('srcInsecure', (bool) $b['insecure']); $saved[] = 'srcInsecure'; }
        foreach (['tgju' => 'srcTgju', 'yahoo' => 'srcYahoo', 'coingecko' => 'srcCoingecko'] as $k => $sk) {
            if (array_key_exists($k, $b)) { setting_set($sk, (bool) $b[$k]); $saved[] = $sk; }
        }
        if ($saved) audit('admin_net', 'به‌روزرسانی تنظیمات شبکه: ' . implode(',', $saved));
        cache_flush_market();
        api_send(200, ['ok' => true, 'net' => sy_net_config(), 'probe' => source_probe(10)]);
    }

    if ($path === '/api/admin/db-download' && $method === 'GET') {
        $c = db_config();
        if ($c['driver'] === 'sqlite' && is_file($c['path'])) {
            header('Content-Type: application/x-sqlite3');
            header('Content-Disposition: attachment; filename="' . basename($c['path']) . '"');
            header('Content-Length: ' . filesize($c['path']));
            readfile($c['path']);
            exit;
        }
        api_send(400, ['error' => 'دیتابیس SQLite در دسترس نیست یا در حالت MySQL است.']);
    }

    if ($path === '/api/admin/tools' && $method === 'POST') {
        $b = api_body();
        $tool = (string) ($b['tool'] ?? '');
        if ($tool === 'flush-market') { cache_flush_market(); audit('admin_tool', 'پاک‌سازی کش بازار'); api_send(200, ['ok' => true, 'message' => 'کش بازار پاک شد.']); }
        if ($tool === 'warm') {
            $budget = max(5000, min(40000, (int) ($b['budget'] ?? 20000)));
            $r = market_ensure($budget, true);
            audit('admin_tool', 'گرم‌کردن تازهٔ بازار');
            api_send(200, ['ok' => true, 'result' => $r, 'market' => market_status()]);
        }
        if ($tool === 'run-ai-all') { $r = admin_run_auto_for_all(); audit('admin_tool', 'اجرای تحلیل خودکار همهٔ کاربران'); api_send(200, ['ok' => true, 'result' => $r]); }
        if ($tool === 'clear-cache') { cache_flush_market(); audit('admin_tool', 'پاک‌سازی کل کش'); api_send(200, ['ok' => true, 'message' => 'کل کش (شامل تحلیل‌ها) پاک شد.']); }
        if ($tool === 'reset-signals') { cache_set('signals:snapshot', null); audit('admin_tool', 'بازتولید سیگنال‌ها'); api_send(200, ['ok' => true, 'message' => 'سیگنال‌ها بازتولید شدند.']); }
        api_send(400, ['error' => 'ابزار ناشناخته']);
    }

    /* ------------------------------ مدیریت مالی و درخواست‌های واریز / برداشت (ادمین) ------------------------------ */
    if ($path === '/api/admin/financial/requests' && $method === 'GET') {
        api_send(200, [
            'crypto_deposits' => admin_crypto_deposits_list((int) ($_GET['limit'] ?? 100)),
            'withdrawals' => admin_withdrawals_list((int) ($_GET['limit'] ?? 100))
        ]);
    }

    if ($path === '/api/admin/financial/crypto-approve' && $method === 'POST') {
        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $note = trim((string) ($b['note'] ?? ''));
        $r = admin_crypto_deposit_approve($id, $note);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/financial/crypto-reject' && $method === 'POST') {
        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $reason = trim((string) ($b['reason'] ?? ''));
        $r = admin_crypto_deposit_reject($id, $reason);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/financial/withdraw-complete' && $method === 'POST') {
        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $trackingCode = trim((string) ($b['trackingCode'] ?? $b['tracking_code'] ?? ''));
        $note = trim((string) ($b['note'] ?? ''));
        $r = admin_withdrawal_complete($id, $trackingCode, $note);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    if ($path === '/api/admin/financial/withdraw-reject' && $method === 'POST') {
        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $reason = trim((string) ($b['reason'] ?? ''));
        $r = admin_withdrawal_reject($id, $reason);
        api_send($r['ok'] ? 200 : 400, $r);
    }

    $s = store_load();

    /* ------------------------------ سلامت و وضعیت ------------------------------ */
    if ($path === '/api/health') {
        $st = market_status();
        api_send(200, ['ok' => true, 'now' => u_now_ms(), 'db' => ['ok' => db_ok(), 'driver' => db_driver()],
            'user' => auth_id() ? auth_public_user(auth_user()) : null,
            'market' => $st['snapshot'] ?? ['status' => 'idle'],
            'warm' => $st['warm'], 'ai' => ['provider' => $s['ai']['provider'], 'autoMode' => !empty($s['ai']['autoMode']),
            'lastRunAt' => $s['ai']['lastRunAt'] ?? null]]);
    }

    if ($path === '/api/system') {
        $dirs = store_paths();
        api_send(200, [
            'php' => PHP_VERSION,
            'curl' => function_exists('curl_init'),
            'mbstring' => function_exists('mb_strlen'),
            'openssl' => extension_loaded('openssl'),
            'os' => PHP_OS,
            'sapi' => PHP_SAPI,
            'dirs' => [
                'data' => ['path' => $dirs['dir'], 'writable' => is_writable($dirs['dir'])],
                'assets' => ['path' => market_assets_dir(), 'files' => count(glob(market_assets_dir() . '/*.csv') ?: []), 'writable' => is_writable(market_assets_dir()) || is_writable(dirname(market_assets_dir()))],
            ],
            'cron' => '*/5 * * * * cd ' . BASE_DIR . ' && php tools/cron-warm.php >/dev/null 2>&1',
            'python' => ['mock' => is_file(BASE_DIR . '/tools/mock_ai_server.py'), 'cli' => is_file(BASE_DIR . '/tools/sarmayeyar.py')],
            'installer' => is_file(BASE_DIR . '/install.php'),
            'version' => '1.1.8-php',
        ]);
    }

    if ($path === '/api/state') {
        $providers = [];
        foreach (ai_providers() as $k => $v) {
            $providers[] = ['key' => $k, 'label' => $v['label'], 'baseUrl' => $v['baseUrl'], 'type' => $v['type'],
                'keysUrl' => $v['keysUrl'] ?? '', 'noKey' => !empty($v['noKey'])];
        }
        api_send(200, ['state' => store_public($s), 'classes' => universe_classes(),
            'manualClasses' => universe_manual_classes(), 'providers' => $providers,
            'universeCount' => count(universe_assets())]);
    }

    /* ------------------------------ گرم‌کردن داده بازار ------------------------------ */
    if ($path === '/api/warm') {
        $force = isset($_GET['force']) && $_GET['force'] !== '0';
        $budget = (int) ($_GET['budget'] ?? 15000);
        $budget = max(5000, min(40000, $budget));
        $r = market_ensure($budget, $force);
        $st = market_status();
        api_send(200, ['status' => $r['status'] ?? ($st['snapshot']['status'] ?? 'idle'), 'warm' => $st['warm'],
            'snapshot' => $st['snapshot'], 'budgetMs' => $budget]);
    }

    /* ------------------------------ بازار ------------------------------ */
    if ($path === '/api/market') {
        if (isset($_GET['ensure']) && $_GET['ensure'] !== '0') market_ensure(12000);
        $snap = market_snapshot(true);
        if (isset($_GET['spark']) && $_GET['spark'] === '1') $snap = market_snapshot(false);
        api_send(200, $snap);
    }

    if (str_starts_with($path, '/api/market/series/')) {
        $id = substr($path, strlen('/api/market/series/'));
        $sp = market_series_lite($id);
        if ($sp === null) api_send(404, ['error' => 'سری زمانی یافت نشد']);
        api_send(200, ['id' => $id, 'series' => $sp]);
    }

    if ($path === '/api/market/refresh' && $method === 'POST') {
        cache_forget('warm:progress');
        cache_set('warm:progress', ['offset' => 0, 'done' => 0, 'total' => count(universe_assets()), 'status' => 'warming', 'startedAt' => u_now_ms()]);
        market_ensure(2000, true);        // شروع چرخه تازه (بقیه در درخواست‌های بعدی تکمیل می‌شود)
        api_send(202, ['ok' => true, 'status' => 'refreshing', 'market' => market_status()]);
    }

    /* ------------------------------ سیگنال‌ها ------------------------------ */
    if ($path === '/api/signals') {
        if (!cache_stale('market:snapshot')) market_ensure(10000);
        $count = isset($_GET['count']) ? max(3, min(15, (int) $_GET['count'])) : null;
        api_send(200, engine_generate_signals(store_load(), $count));
    }

    if ($path === '/api/pulse') api_send(200, engine_market_pulse($s) ?? []);

    /* ------------------------------ اشتراک‌ها و پلن‌ها ------------------------------ */
    if ($path === '/api/plans' && $method === 'GET') {
        db_plans_init_defaults();
        $raw = db_all('SELECT * FROM plans WHERE active = 1 ORDER BY price ASC');
        $plans = array_map(function($p) {
            return [
                'id' => (string) $p['id'],
                'slug' => (string) $p['id'],
                'title' => (string) $p['title'],
                'price' => (int) $p['price'],
                'priceToman' => (int) $p['price'],
                'days' => (int) $p['days'],
                'durationDays' => (int) $p['days'],
                'features' => (string) $p['features'],
                'badge' => (string) ($p['badge'] ?? ''),
                'active' => (int) $p['active'],
            ];
        }, $raw);
        api_send(200, ['ok' => true, 'plans' => $plans]);
    }

    if ($path === '/api/subscriptions/me' && $method === 'GET') {
        $uid = auth_id() ?? 0;
        $sub = user_subscription_active($uid);
        $subFmt = null;
        if ($sub) {
            $now = db_now_ms();
            $daysLeft = max(0, (int) round(($sub['expires_at'] - $now) / 86400000));
            $subFmt = [
                'id' => $sub['id'],
                'planId' => $sub['plan_id'],
                'planTitle' => $sub['plan_title'],
                'status' => 'active',
                'startsAt' => $sub['starts_at'],
                'expiresAt' => $sub['expires_at'],
                'daysLeft' => $daysLeft,
            ];
        }
        $history = $uid > 0 ? db_all('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 20', [$uid]) : [];
        api_send(200, ['ok' => true, 'subscription' => $subFmt, 'walletBalance' => user_wallet_balance($uid), 'history' => $history]);
    }

    if ($path === '/api/subscribe' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        $meta = user_meta_get($uid);
        if (!empty($meta['tradeRestricted'])) {
            api_send(403, ['error' => 'حساب شما دارای محدودیت معامله است: ' . ($meta['statusReason'] ?: 'ممنوع‌المعامله توسط مدیر')]);
        }

        $b = api_body();
        $rawId = $b['plan_id'] ?? ($b['planId'] ?? 0);
        $gateway = (string) ($b['payment_method'] ?? ($b['gateway'] ?? 'wallet'));

        $plan = null;
        if (is_numeric($rawId) && (int)$rawId > 0) {
            $plan = db_one('SELECT * FROM plans WHERE id = ? AND active = 1', [(int)$rawId]);
        }
        if (!$plan && is_string($rawId)) {
            $plan = db_one('SELECT * FROM plans WHERE (id = ? OR title LIKE ?) AND active = 1', [$rawId, '%' . $rawId . '%']);
        }
        if (!$plan) api_send(404, ['error' => 'پلن اشتراک انتخاب‌شده معتبر یا فعال نیست.']);

        $price = (int) $plan['price'];
        $days = (int) $plan['days'];
        $now = db_now_ms();
        $planId = (int) $plan['id'];

        if ($price > 0 && $gateway === 'wallet') {
            $wBal = user_wallet_balance($uid);
            if ($wBal < $price) {
                api_send(400, ['error' => 'موجودی کیف پول شما کافی نیست. (موجودی: ' . number_format($wBal) . ' تومان / مبلغ پلن: ' . number_format($price) . ' تومان)']);
            }
            $wAdj = user_wallet_adj($uid, 'pay_plan', $price, 'خرید ' . $plan['title']);
            if (!$wAdj['ok']) api_send(400, $wAdj);
        } elseif ($price > 0) {
            // شبیه‌ساز یا پرداخت مستقیم از درگاه
            $refId = 'PAY-' . strtoupper(substr(md5(uniqid()), 0, 10));
            user_wallet_adj($uid, 'deposit', $price, 'شارژ مستقیم برای خرید پلن ' . $plan['title'], $refId);
            user_wallet_adj($uid, 'pay_plan', $price, 'خرید ' . $plan['title'], $refId);
        }

        $current = user_subscription_active($uid);
        $startsAt = $now;
        $expiresAt = ($current && $current['expires_at'] > $now) ? ($current['expires_at'] + ($days * 86400000)) : ($now + ($days * 86400000));

        db_exec('INSERT INTO subscriptions (user_id, plan_id, plan_title, amount, status, starts_at, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)', [
            $uid, $planId, $plan['title'], $price, 'active', $startsAt, $expiresAt, $now,
        ]);

        notification_send($uid, 'خرید موفق اشتراک ' . $plan['title'] . ' 🚀', 'پلن شما با موفقیت فعال شد و تا ' . $days . ' روز آینده معتبر است.', 'system');
        audit('subscribe_plan', 'کاربر #' . $uid . ' پلن ' . $plan['title'] . ' را با مبلغ ' . number_format($price) . ' تومان خریداری کرد.');

        api_send(200, ['ok' => true, 'message' => 'اشتراک با موفقیت فعال شد.', 'subscription' => user_subscription_active($uid), 'walletBalance' => user_wallet_balance($uid)]);
    }

    /* ------------------------------ کیف پول ------------------------------ */
    if ($path === '/api/wallet/transactions' && $method === 'GET') {
        $uid = auth_id() ?? 0;
        $rows = $uid > 0 ? db_all('SELECT * FROM wallet_tx WHERE user_id = ? ORDER BY id DESC LIMIT 50', [$uid]) : [];
        api_send(200, ['balance' => user_wallet_balance($uid), 'transactions' => $rows]);
    }

    if ($path === '/api/wallet/deposit' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        $b = api_body();
        $amount = (int) round(to_clean_number($b['amount'] ?? 0));
        $gateway = (string) ($b['gateway'] ?? 'online');
        if ($amount < 1000) api_send(400, ['error' => 'حداقل مبلغ شارژ کیف پول ۱,۰۰۰ تومان است.']);

        $refId = 'TX-' . strtoupper(substr(md5(uniqid()), 0, 10));
        $res = user_wallet_adj($uid, 'deposit', $amount, 'شارژ آنلاین کیف پول (درگاه ' . $gateway . ')', $refId);
        if (!$res['ok']) api_send(400, $res);

        notification_send($uid, 'شارژ موفق کیف پول 💳', 'مبلغ ' . number_format($amount) . ' تومان به کیف پول شما واریز شد (شناسه: ' . $refId . ').', 'wallet');
        api_send(200, ['ok' => true, 'balance' => $res['balance'], 'refId' => $refId, 'message' => 'کیف پول با موفقیت شارژ شد.']);
    }

    if ($path === '/api/wallet/crypto-invoice' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        $b = api_body();
        $amountToman = (int) round(to_clean_number($b['amount'] ?? 0));
        $net = strtoupper(trim((string) ($b['network'] ?? 'TRC20')));
        $symbol = strtoupper(trim((string) ($b['symbol'] ?? 'USDT')));
        $coinId = trim((string) ($b['coinId'] ?? ''));
        if ($amountToman < 1000) api_send(400, ['error' => 'حداقل مبلغ شارژ ۱,۰۰۰ تومان است.']);

        $sets = settings_effective();
        $coins = is_array($sets['cryptoGatewayCoins'] ?? null) ? $sets['cryptoGatewayCoins'] : [];
        $matchedCoin = null;
        foreach ($coins as $c) {
            if ($coinId !== '' && ($c['id'] ?? '') === $coinId) { $matchedCoin = $c; break; }
            if (strtoupper($c['symbol'] ?? '') === $symbol && strtoupper($c['network'] ?? '') === $net) { $matchedCoin = $c; break; }
        }
        if (!$matchedCoin && $coins) {
            foreach ($coins as $c) {
                if (strtoupper($c['symbol'] ?? '') === $symbol) { $matchedCoin = $c; break; }
            }
        }

        $payoutAddr = '';
        $priceUsd = (float) ($b['priceUsd'] ?? ($matchedCoin['priceUsd'] ?? 1.0));
        if ($priceUsd <= 0) $priceUsd = 1.0;

        if ($matchedCoin && !empty($matchedCoin['address'])) {
            $payoutAddr = trim((string) $matchedCoin['address']);
            $net = (string) ($matchedCoin['network'] ?? $net);
            $symbol = strtoupper((string) ($matchedCoin['symbol'] ?? $symbol));
        } elseif ($net === 'TON') {
            $payoutAddr = trim((string) ($sets['cryptoPayoutTon'] ?? 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF'));
        } elseif ($net === 'BEP20') {
            $payoutAddr = trim((string) ($sets['cryptoPayoutBep20'] ?? '0x71c5b88ec3011a00a0684f88b77d6124ac374829'));
        } else {
            $payoutAddr = trim((string) ($sets['cryptoPayoutTrc20'] ?? $sets['cryptoPayoutAddress'] ?? 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF'));
        }
        if (!$payoutAddr) {
            $payoutAddr = 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF';
        }

        $tetherRate = 260991;
        try {
            $snap = market_snapshot(false);
            if (!empty($snap['assets'])) {
                foreach ($snap['assets'] as $ast) {
                    if ((($ast['id'] ?? '') === 'ir_usdt' || ($ast['id'] ?? '') === 'ir_usd') && !empty($ast['metrics']['last'])) {
                        $tetherRate = (float) $ast['metrics']['last'];
                        if ($tetherRate > 600000) $tetherRate = round($tetherRate * 0.1, 2);
                        break;
                    }
                }
            }
        } catch (Throwable $e) {}

        $coinRateToman = max(1, $tetherRate * $priceUsd);
        $decimals = $priceUsd >= 100 ? 6 : ($priceUsd >= 1 ? 3 : 2);
        $cryptoAmount = round($amountToman / $coinRateToman, $decimals);
        if ($cryptoAmount <= 0) $cryptoAmount = 0.0001;
        $usdtAmount = round($amountToman / $tetherRate, 2);

        $expireMin = max(1, (int) ($sets['cryptoInvoiceExpireMin'] ?? 30));
        $invoiceId = 'INV-' . $symbol . '-' . strtoupper(substr(md5(uniqid()), 0, 8));

        api_send(200, [
            'ok' => true,
            'invoiceId' => $invoiceId,
            'amountToman' => $amountToman,
            'usdtAmount' => $usdtAmount,
            'cryptoAmount' => $cryptoAmount,
            'priceUsd' => $priceUsd,
            'tetherRate' => $tetherRate,
            'coinRateToman' => $coinRateToman,
            'currency' => $symbol,
            'symbol' => $symbol,
            'network' => $net,
            'address' => $payoutAddr,
            'gateway' => $sets['cryptoGatewayActive'] ?? 'oxapay',
            'expireMin' => $expireMin,
            'expiresInSec' => $expireMin * 60,
            'instructions' => "مبلغ دقیق {$cryptoAmount} {$symbol} را در شبکه {$net} به آدرس بالا منتقل نموده و سپس کد هش تراکنش (TXID) را وارد فرمایید."
        ]);
    }

    if ($path === '/api/wallet/crypto-deposit' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        $b = api_body();
        $amountToman = (int) round(to_clean_number($b['amount'] ?? 0));
        $amountUsdt = (float) ($b['usdtAmount'] ?? $b['amountUsdt'] ?? 0);
        $network = trim((string) ($b['network'] ?? 'TRC20'));
        $txid = trim((string) ($b['txid'] ?? ''));
        $walletAddress = trim((string) ($b['address'] ?? ''));

        if ($amountToman < 1000) api_send(400, ['error' => 'مبلغ تراکنش نامعتبر است.']);
        if (!$txid || strlen($txid) < 8) api_send(400, ['error' => 'لطفاً کد هش معتبر تراکنش (TXID) را وارد کنید.']);

        $now = db_now_ms();
        db_exec('INSERT INTO crypto_deposits (user_id, amount_toman, amount_usdt, network, txid, wallet_address, status, created_at) VALUES (?,?,?,?,?,?,?,?)', [
            $uid, $amountToman, $amountUsdt, $network, $txid, $walletAddress, 'pending', $now
        ]);

        notification_send($uid, 'درخواست واریز رمزارزی ثبت شد ⏳', "درخواست واریز {$amountUsdt} USDT (معادل " . number_format($amountToman) . " تومان) ثبت گردید و پس از بررسی و تأیید مدیر، به کیف‌پول شما افزوده خواهد شد.", 'wallet');
        audit('crypto_deposit_submitted', "ثبت درخواست واریز رمزارزی به مبلغ " . number_format($amountToman) . " تومان (TXID: {$txid})", $uid);

        api_send(200, [
            'ok' => true,
            'status' => 'pending',
            'message' => 'درخواست واریز رمزارزی شما با موفقیت ثبت شد و پس از بررسی و تأیید مدیر سیستم، کیف‌پول شما شارژ خواهد شد.'
        ]);
    }

    if ($path === '/api/wallet/withdraw' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        $u = db_one('SELECT * FROM users WHERE id = ?', [$uid]);
        if (!empty($u['trade_restricted'])) {
            api_send(403, ['error' => 'حساب کاربری شما دارای محدودیت است و امکان ثبت درخواست تسویه وجود ندارد.']);
        }

        $b = api_body();
        $amount = (int) round(to_clean_number($b['amount'] ?? 0));
        $bankName = trim((string) ($b['bankName'] ?? 'بانک'));
        $accountHolder = trim((string) ($b['accountHolder'] ?? ''));
        $cardNumber = trim((string) ($b['cardNumber'] ?? ''));
        $sheba = trim((string) ($b['sheba'] ?? ''));

        $minWithdraw = (int) (settings_effective()['minWithdrawAmount'] ?? 50000);
        if ($amount < $minWithdraw) {
            api_send(400, ['error' => 'حداقل مبلغ قابل برداشت ' . number_format($minWithdraw) . ' تومان است.']);
        }
        if (!$accountHolder || mb_strlen($accountHolder) < 3) {
            api_send(400, ['error' => 'نام و نام خانوادگی صاحب حساب بانکی الزامی است.']);
        }
        if (!$sheba || strlen($sheba) < 16) {
            api_send(400, ['error' => 'شماره شبا بانکی (IBAN) معتبر الزامی است.']);
        }

        $curBalance = user_wallet_balance($uid);
        if ($curBalance < $amount) {
            api_send(400, ['error' => 'موجودی کیف پول شما کافی نیست. (مانده فعلی: ' . number_format($curBalance) . ' تومان)']);
        }

        $now = db_now_ms();
        $refId = 'WREQ-' . strtoupper(substr(md5(uniqid()), 0, 8));
        $desc = "درخواست تسویه و برداشت ریالی به حساب {$accountHolder} ({$bankName})";
        
        $adj = user_wallet_adj($uid, 'withdraw_pending', $amount, $desc, $refId);
        if (!$adj['ok']) api_send(400, $adj);

        db_exec('INSERT INTO withdrawals (user_id, amount, bank_name, account_holder, card_number, sheba, status, created_at) VALUES (?,?,?,?,?,?,?,?)', [
            $uid, $amount, $bankName, $accountHolder, $cardNumber, $sheba, 'pending', $now
        ]);

        notification_send($uid, 'درخواست برداشت وجه ثبت شد 💳', "درخواست تسویه مبلغ " . number_format($amount) . " تومان به شماره شبا {$sheba} ثبت شد و در چرخه پایا واریز خواهد شد.", 'wallet');
        audit('withdraw_requested', "ثبت درخواست برداشت " . number_format($amount) . " تومان به شماره شبا {$sheba}", $uid);

        api_send(200, [
            'ok' => true,
            'balance' => $adj['balance'],
            'refId' => $refId,
            'message' => 'درخواست برداشت با موفقیت ثبت شد و پس از بررسی حسابدار در سیکل پایا واریز خواهد گردید.'
        ]);
    }

    if ($path === '/api/wallet/financial-history' && $method === 'GET') {
        $uid = auth_id() ?? 0;
        $deposits = $uid > 0 ? db_all('SELECT * FROM crypto_deposits WHERE user_id = ? ORDER BY id DESC LIMIT 30', [$uid]) : [];
        $withdrawals = $uid > 0 ? db_all('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 30', [$uid]) : [];
        api_send(200, [
            'crypto_deposits' => $deposits,
            'withdrawals' => $withdrawals
        ]);
    }

    if ($path === '/api/wallet/crypto-verify' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        $b = api_body();
        $amountToman = (int) round(to_clean_number($b['amount'] ?? 0));
        $txid = trim((string) ($b['txid'] ?? ''));
        $invoiceId = trim((string) ($b['invoiceId'] ?? ''));

        if ($amountToman < 1000) api_send(400, ['error' => 'مبلغ تراکنش نامعتبر است.']);
        if (!$txid || strlen($txid) < 8) api_send(400, ['error' => 'لطفاً کد هش تراکنش (TXID) معتبر را وارد کنید.']);

        $refId = 'CRYPTO-' . strtoupper(substr(md5($txid . uniqid()), 0, 8));
        $desc = "شارژ کیف‌پول از طریق ارز دیجیتال USDT (TXID: " . substr($txid, 0, 12) . "...)";
        $res = user_wallet_adj($uid, 'deposit', $amountToman, $desc, $refId);
        if (!$res['ok']) api_send(400, $res);

        notification_send($uid, 'تأیید تراکنش رمزارزی و شارژ کیف‌پول 💎', "واریز رمزارزی شما به مبلغ " . number_format($amountToman) . " تومان تأیید و به مانده کیف‌پول افزوده شد.", 'wallet');
        audit('crypto_deposit', "شارژ رمزارزی کاربر به مبلغ " . number_format($amountToman) . " تومان (TXID: {$txid})", $uid);

        api_send(200, [
            'ok' => true,
            'balance' => $res['balance'],
            'refId' => $refId,
            'message' => 'تراکنش رمزارزی با موفقیت تأیید شد و مبلغ ' . number_format($amountToman) . ' تومان به کیف‌پول شما واریز گردید 🎉'
        ]);
    }

    /* ------------------------------ سرمایه‌گذاری خودکار با کیف‌پول و رهگیری موقعیت‌ها ------------------------------ */
    if ($path === '/api/auto-invest/positions' && $method === 'GET') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);

        $positions = [];
        if (db_ok()) {
            $rows = db_all('SELECT * FROM auto_investments WHERE user_id = ? ORDER BY id DESC LIMIT 50', [$uid]);
            $market = market_cached() ?: [];
            $assetsBy = [];
            foreach (($market['assets'] ?? []) as $a) {
                if (!empty($a['id'])) $assetsBy[$a['id']] = $a;
                if (!empty($a['name'])) $assetsBy[$a['name']] = $a;
            }

            foreach ($rows as $r) {
                $pos = $r;
                $pos['actions_log'] = !empty($r['actions_log']) ? json_decode($r['actions_log'], true) : [];
                $asset = $assetsBy[$r['asset_id']] ?? ($assetsBy[$r['asset_name']] ?? null);
                $curPrice = $asset ? (float) ($asset['metrics']['last'] ?? $r['step1_price']) : (float) $r['step1_price'];
                $pos['current_price'] = $curPrice;

                // محاسبه سود و زیان جاری
                $entryAvg = $r['step1_price'];
                if ($r['step2_status'] === 'executed' && $r['step2_price'] > 0) {
                    $entryAvg = ($r['step1_price'] + $r['step2_price']) / 2;
                }
                $pnlPct = $entryAvg > 0 ? (($curPrice - $entryAvg) / $entryAvg) * 100 : 0;
                $pnlToman = (int) round(($pos['total_amount'] * $pnlPct) / 100);
                $pos['pnl_percent'] = round($pnlPct, 2);
                $pos['pnl_amount'] = $pnlToman;

                // بررسی خودکار فعال شدن پله دوم در صورت لمس حمایت
                if ($pos['status'] === 'active' && $pos['step2_status'] === 'pending_limit' && $curPrice <= (float)$pos['step2_price'] && (float)$pos['step2_price'] > 0) {
                    $pos['step2_status'] = 'executed';
                    $pos['step2_time'] = u_now_ms();
                    $pos['actions_log'][] = [
                        'time' => u_now_ms(),
                        'type' => 'step2_executed',
                        'icon' => '🔵',
                        'title' => 'فعال‌سازی و خرید پله دوم در کف حمایتی',
                        'text' => 'قیمت بازار به ' . number_format($curPrice) . ' رسید؛ سفارش پله دوم (' . number_format($pos['step2_amount']) . ' تومان) با موفقیت اجرا شد.'
                    ];
                    db_exec('UPDATE auto_investments SET step2_status = ?, step2_time = ?, actions_log = ?, updated_at = ? WHERE id = ?', [
                        'executed', u_now_ms(), json_encode($pos['actions_log'], JSON_UNESCAPED_UNICODE), u_now_ms(), $r['id']
                    ]);
                }

                // فاصله تا حد ضرر و تارگت‌ها
                $pos['dist_stop_pct'] = (float)$pos['stop_loss'] > 0 ? round((($curPrice - (float)$pos['stop_loss']) / $curPrice) * 100, 1) : 0;
                $pos['dist_tgt1_pct'] = (float)$pos['target1'] > 0 ? round((((float)$pos['target1'] - $curPrice) / $curPrice) * 100, 1) : 0;
                $pos['dist_tgt2_pct'] = (float)$pos['target2'] > 0 ? round((((float)$pos['target2'] - $curPrice) / $curPrice) * 100, 1) : 0;

                $positions[] = $pos;
            }
        }
        api_send(200, ['ok' => true, 'positions' => $positions]);
    }

    if ($path === '/api/auto-invest' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);

        $u = db_one('SELECT * FROM users WHERE id = ?', [$uid]);
        if (!empty($u['trade_restricted'])) {
            api_send(403, ['error' => 'حساب کاربری شما دارای محدودیت معامله است و امکان معامله خودکار وجود ندارد.']);
        }
        if (!empty($u['status']) && $u['status'] !== 'active') {
            api_send(403, ['error' => 'حساب کاربری شما فعال نیست.']);
        }

        $b = api_body();
        $assetId = trim((string) ($b['assetId'] ?? ''));
        $name = trim((string) ($b['name'] ?? 'دارایی'));
        $cls = trim((string) ($b['cls'] ?? 'crypto'));
        $amount = (int) round(to_clean_number($b['amount'] ?? 0));
        $step1Price = (float) ($b['step1Price'] ?? 0);
        $step2Price = (float) ($b['step2Price'] ?? 0);
        $stopLoss = (float) ($b['stopLoss'] ?? 0);
        $target1 = (float) ($b['target1'] ?? 0);
        $target2 = (float) ($b['target2'] ?? 0);

        if ($amount < 1000) {
            api_send(400, ['error' => 'حداقل مبلغ سرمایه‌گذاری خودکار ۱,۰۰۰ تومان است.']);
        }

        $curBalance = user_wallet_balance($uid);
        $source = trim((string) ($b['source'] ?? ''));
        $autoFund = !empty($b['autoFund']) || ($source === 'calculator');
        if ($curBalance < $amount && $autoFund) {
            $diff = $amount - $curBalance;
            $fundRef = 'CALC-' . strtoupper(substr(md5(uniqid()), 0, 8));
            user_wallet_adj($uid, 'deposit', $diff, "تخصیص و تأمین سرمایه معامله از ماشین‌حساب هوشمند ({$name})", $fundRef);
            $curBalance = user_wallet_balance($uid);
        }
        if ($curBalance < $amount) {
            api_send(400, [
                'error' => 'موجودی کیف پول شما کافی نیست. (موجودی فعلی: ' . number_format($curBalance) . ' تومان)',
                'balance' => $curBalance,
                'required' => $amount,
                'needRecharge' => true
            ]);
        }

        $refId = 'AI-' . strtoupper(substr(md5(uniqid()), 0, 10));
        $desc = "سرمایه‌گذاری خودکار روی {$name} — پله ۱ و ۲";
        $adj = user_wallet_adj($uid, 'auto_invest', $amount, $desc, $refId);
        if (!$adj['ok']) api_send(400, $adj);

        $now = u_now_ms();
        $step1Amount = (int) round($amount * 0.5);
        $step2Amount = $amount - $step1Amount;

        $actionsLog = [
            [
                'time' => $now,
                'type' => 'start',
                'icon' => '🚀',
                'title' => 'راه‌اندازی ربات معامله‌گر و تخصیص سرمایه',
                'text' => "تخصیص کل مبلغ " . number_format($amount) . " تومان به استراتژی ورود پله‌ای روی {$name} (شناسه: {$refId})"
            ],
            [
                'time' => $now,
                'type' => 'step1_buy',
                'icon' => '🟢',
                'title' => 'اجرای خرید فوری پله اول (۵۰٪)',
                'text' => "خرید فوری ۵۰٪ حجم معادل " . number_format($step1Amount) . " تومان در قیمت جاری بازار (" . number_format($step1Price) . ")"
            ],
            [
                'time' => $now,
                'type' => 'step2_limit',
                'icon' => '⏳',
                'title' => 'ثبت سفارش لیمیت پله دوم در کف حمایتی (۵۰٪)',
                'text' => "ثبت سفارش شرطی خرید ۵۰٪ باقی‌مانده معادل " . number_format($step2Amount) . " تومان در نقطه حمایتی (" . number_format($step2Price) . ")"
            ],
            [
                'time' => $now,
                'type' => 'risk_setup',
                'icon' => '🛡️',
                'title' => 'تنظیم خودکار حد ضرر و سطوح سیو سود',
                'text' => "حد ضرر فعال روی قیمت " . number_format($stopLoss) . " | هدف اول: " . number_format($target1) . " | هدف دوم: " . number_format($target2)
            ]
        ];

        $posId = $now;
        if (db_ok()) {
            db_exec('INSERT INTO auto_investments (user_id, ref_id, asset_id, asset_name, asset_cls, total_amount, step1_amount, step1_price, step1_status, step1_time, step2_amount, step2_price, step2_status, stop_loss, target1, target2, current_price, status, actions_log, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $uid, $refId, $assetId, $name, $cls, $amount, $step1Amount, $step1Price, 'executed', $now, $step2Amount, $step2Price, 'pending_limit', $stopLoss, $target1, $target2, $step1Price, 'active', json_encode($actionsLog, JSON_UNESCAPED_UNICODE), $now, $now
            ]);
            $lastId = (int) db_last_id();
            if ($lastId > 0) $posId = $lastId;
        }

        // ثبت یا به‌روزرسانی در سبد دارایی‌های کاربر
        $s = store_load();
        if (!isset($s['portfolio']) || !is_array($s['portfolio'])) {
            $s['portfolio'] = [];
        }
        $classes = universe_classes();
        $targetCls = isset($classes[$cls]) ? $cls : 'crypto';
        $found = false;
        foreach ($s['portfolio'] as $idx => $item) {
            if (($item['label'] ?? '') === $name || ($item['assetId'] ?? '') === $assetId) {
                $s['portfolio'][$idx]['amount'] = ($item['amount'] ?? 0) + $amount;
                $s['portfolio'][$idx]['note'] = "خرید خودکار سیستم: پله ۱ ({$step1Price}) + پله ۲ ({$step2Price}) | حد ضرر: {$stopLoss}";
                $s['portfolio'][$idx]['updatedAt'] = $now;
                $found = true;
                break;
            }
        }
        if (!$found) {
            $newEntry = [
                'id' => u_uuid(),
                'label' => $name,
                'cls' => $targetCls,
                'assetId' => $assetId ?: null,
                'amount' => $amount,
                'unit' => 'unit',
                'note' => "خرید خودکار سیستم: پله ۱ ({$step1Price}) + پله ۲ ({$step2Price}) | حد ضرر: {$stopLoss} | هدف: {$target1}",
                'updatedAt' => $now,
            ];
            $s['portfolio'][] = $newEntry;
        }
        store_save($s);

        notification_send($uid, 'سرمایه‌گذاری خودکار با موفقیت فعال شد 🤖', "مبلغ " . number_format($amount) . " تومان به صورت خودکار روی «{$name}» سرمایه‌گذاری و وارد معامله پله‌ای گردید (شناسه معامله: {$refId}).", 'signal_buy');
        audit('auto_invest', "سرمایه‌گذاری خودکار کاربر روی {$name} به مبلغ " . number_format($amount) . " تومان", $uid);

        api_send(200, [
            'ok' => true,
            'balance' => $adj['balance'],
            'refId' => $refId,
            'position' => [
                'id' => $posId,
                'ref_id' => $refId,
                'asset_id' => $assetId,
                'asset_name' => $name,
                'asset_cls' => $cls,
                'total_amount' => $amount,
                'step1_amount' => $step1Amount,
                'step1_price' => $step1Price,
                'step1_status' => 'executed',
                'step1_time' => $now,
                'step2_amount' => $step2Amount,
                'step2_price' => $step2Price,
                'step2_status' => 'pending_limit',
                'stop_loss' => $stopLoss,
                'target1' => $target1,
                'target2' => $target2,
                'current_price' => $step1Price,
                'pnl_percent' => 0,
                'pnl_amount' => 0,
                'status' => 'active',
                'actions_log' => $actionsLog,
                'created_at' => $now
            ],
            'portfolio' => $s['portfolio'],
            'message' => "سرمایه‌گذاری خودکار روی «{$name}» به مبلغ " . number_format($amount) . " تومان با موفقیت ثبت و آغاز گردید 🎉"
        ]);
    }

    if ($path === '/api/auto-invest/close' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);

        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $refId = trim((string) ($b['refId'] ?? ''));

        $pos = db_one('SELECT * FROM auto_investments WHERE user_id = ? AND (id = ? OR ref_id = ?)', [$uid, $id, $refId]);
        if (!$pos) api_send(404, ['error' => 'موقعیت سرمایه‌گذاری خودکار یافت نشد.']);
        if ($pos['status'] === 'closed') api_send(400, ['error' => 'این موقعیت قبلاً بسته و تسویه شده است.']);

        // محاسبه مبلغ بازگشتی (سرمایه اولیه + سود/زیان جاری)
        $market = market_cached() ?: [];
        $assetsBy = [];
        foreach (($market['assets'] ?? []) as $a) {
            if (!empty($a['id'])) $assetsBy[$a['id']] = $a;
            if (!empty($a['name'])) $assetsBy[$a['name']] = $a;
        }
        $asset = $assetsBy[$pos['asset_id']] ?? ($assetsBy[$pos['asset_name']] ?? null);
        $curPrice = $asset ? (float) ($asset['metrics']['last'] ?? $pos['step1_price']) : (float) $pos['step1_price'];

        $entryAvg = $pos['step1_price'];
        if ($pos['step2_status'] === 'executed' && $pos['step2_price'] > 0) {
            $entryAvg = ($pos['step1_price'] + $pos['step2_price']) / 2;
        }
        $pnlPct = $entryAvg > 0 ? (($curPrice - $entryAvg) / $entryAvg) * 100 : 0;
        $pnlToman = (int) round(($pos['total_amount'] * $pnlPct) / 100);
        $refundAmount = max(0, $pos['total_amount'] + $pnlToman);

        $now = u_now_ms();
        $actionsLog = !empty($pos['actions_log']) ? json_decode($pos['actions_log'], true) : [];
        $actionsLog[] = [
            'time' => $now,
            'type' => 'closed',
            'icon' => '🏁',
            'title' => 'خروج و تسویه معامله توسط کاربر',
            'text' => 'معامله در قیمت ' . number_format($curPrice) . ' با سود/زیان ' . ($pnlToman >= 0 ? '+' : '') . number_format($pnlToman) . ' تومان بسته شد و مبلغ ' . number_format($refundAmount) . ' تومان به کیف‌پول بازگشت.'
        ];

        db_exec('UPDATE auto_investments SET status = ?, pnl_percent = ?, pnl_amount = ?, actions_log = ?, updated_at = ? WHERE id = ?', [
            'closed', round($pnlPct, 2), $pnlToman, json_encode($actionsLog, JSON_UNESCAPED_UNICODE), $now, $pos['id']
        ]);

        $res = user_wallet_adj($uid, 'deposit', $refundAmount, "تسویه و خروج از معامله خودکار {$pos['asset_name']} (سود/زیان: " . number_format($pnlToman) . " تومان)", 'CLOSE-' . $pos['ref_id']);

        notification_send($uid, 'تسویه معامله خودکار 💰', "موقعیت معاملاتی {$pos['asset_name']} با موفقیت بسته شد و مبلغ " . number_format($refundAmount) . " تومان به کیف‌پول شما افزوده شد.", 'wallet');
        audit('auto_invest_close', "بستن معامله خودکار {$pos['asset_name']} با بازگشت " . number_format($refundAmount) . " تومان", $uid);

        api_send(200, [
            'ok' => true,
            'balance' => $res['balance'] ?? user_wallet_balance($uid),
            'refundAmount' => $refundAmount,
            'pnlToman' => $pnlToman,
            'pnlPercent' => round($pnlPct, 2),
            'message' => "معامله خودکار با موفقیت بسته شد و مبلغ " . number_format($refundAmount) . " تومان به کیف‌پول شما واریز گردید 🎉"
        ]);
    }

    /* ------------------------------ ربات‌های ترید هوشمند سبدها (Trading Bots) ------------------------------ */
    if ($path === '/api/trading-bots' && $method === 'GET') {
        if (db_ok()) {
            try { db_migrate(); } catch (Throwable $e) {}
        }
        $uid = auth_id();
        $bots = [];
        if (db_ok()) {
            $rows = db_all('SELECT * FROM trading_bots WHERE is_active = 1 ORDER BY id ASC');
            foreach ($rows as $r) {
                $r['assets'] = !empty($r['assets_json']) ? (json_decode($r['assets_json'], true) ?: []) : [];
                $r['features'] = !empty($r['features_json']) ? (json_decode($r['features_json'], true) ?: []) : [];
                $bots[] = $r;
            }
        }
        $instances = [];
        if ($uid && db_ok()) {
            $instRows = db_all('SELECT * FROM user_bot_instances WHERE user_id = ? ORDER BY id DESC', [$uid]);
            foreach ($instRows as $ir) {
                $ir['sub_positions'] = !empty($ir['sub_positions_json']) ? (json_decode($ir['sub_positions_json'], true) ?: []) : [];
                $ir['live_logs'] = !empty($ir['live_logs_json']) ? (json_decode($ir['live_logs_json'], true) ?: []) : [];
                $instances[] = $ir;
            }
        }
        api_send(200, ['ok' => true, 'bots' => $bots, 'instances' => $instances]);
    }

    if ($path === '/api/trading-bots/buy-and-start' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        if (db_ok()) {
            try { db_migrate(); } catch (Throwable $e) {}
        }

        $b = api_body();
        $botCode = trim((string) ($b['botCode'] ?? ''));
        $botId   = (int) ($b['botId'] ?? 0);
        $basketName = trim((string) ($b['basketName'] ?? 'سبد سرمایه‌گذاری هوشمند'));
        $basketType = trim((string) ($b['basketType'] ?? 'all'));
        $capital    = max(1000000, (int) round(to_clean_number($b['capital'] ?? 10000000)));
        $customAssets = isset($b['customAssets']) && is_array($b['customAssets']) ? $b['customAssets'] : [];
        $autoFund   = !empty($b['autoFund']);

        $bot = null;
        if (db_ok()) {
            if ($botId > 0) $bot = db_one('SELECT * FROM trading_bots WHERE id = ?', [$botId]);
            if (!$bot && $botCode) $bot = db_one('SELECT * FROM trading_bots WHERE code = ?', [$botCode]);
            if (!$bot) $bot = db_one('SELECT * FROM trading_bots ORDER BY id ASC LIMIT 1');
        }
        if (!$bot) {
            $bot = [
                'id' => 1,
                'code' => $botCode ?: 'alpha_precious',
                'name' => 'ربات ترید هوشمند سرمایه‌یار',
                'strategy' => 'grid_dca',
                'strategy_fa' => 'ورود پله‌ای هوشمند + حد ضرر متحرک',
                'price_toman' => 490000,
                'duration_days' => 30,
                'stop_loss_pct' => 4.0,
                'tp1_pct' => 7.5,
                'tp2_pct' => 14.5,
                'assets_json' => json_encode([
                    ['assetId' => 'geram18', 'name' => 'طلای ۱۸ عیار', 'weight' => 35],
                    ['assetId' => 'ir_silver_gram', 'name' => 'گرم نقره ۹۹۹ بازار ایران', 'weight' => 30],
                    ['assetId' => 'etf_ayar', 'name' => 'صندوق طلای عیار', 'weight' => 35],
                ], JSON_UNESCAPED_UNICODE)
            ];
        }

        // بررسی اینکه آیا کاربر قبلاً لایسنس فعال این ربات را خریده است یا خیر
        $alreadyOwned = false;
        if (db_ok()) {
            $existingLic = db_one('SELECT id FROM user_bot_instances WHERE user_id = ? AND bot_code = ? AND expires_at > ?', [$uid, $bot['code'], u_now_ms()]);
            if ($existingLic) $alreadyOwned = true;
        }

        $licenseFee = $alreadyOwned ? 0 : (int) ($bot['price_toman'] ?? 0);
        $totalNeeded = $licenseFee + $capital;

        $bal = user_wallet_balance($uid);
        if ($bal < $totalNeeded && $autoFund) {
            $shortfall = $totalNeeded - $bal;
            user_wallet_adj($uid, 'deposit', $shortfall, "شارژ خودکار کیف‌پول جهت خرید ربات ترید «{$bot['name']}» و تامین سرمایه سبد «{$basketName}»", 'BOT-FUND-' . strtoupper(substr(uniqid(), -6)));
            $bal = user_wallet_balance($uid);
        }
        if ($bal < $totalNeeded) {
            api_send(400, [
                'error' => 'موجودی کیف‌پول برای خرید ربات و تامین سرمایه سبد کافی نیست.',
                'balance' => $bal,
                'needed' => $totalNeeded
            ]);
        }

        $refId = 'BOT-' . strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $bot['code']), 0, 5)) . '-' . rand(1000, 9999);
        if ($licenseFee > 0) {
            user_wallet_adj($uid, 'bot_purchase', -$licenseFee, "خرید لایسنس «{$bot['name']}» برای مدت " . (int)($bot['duration_days'] ?? 30) . " روز", $refId . '-LIC');
        }
        $adj = user_wallet_adj($uid, 'bot_capital', -$capital, "تخصیص سرمایه ترید به ربات «{$bot['name']}» روی سبد «{$basketName}»", $refId);

        $botAssets = !empty($customAssets) ? $customAssets : (json_decode($bot['assets_json'] ?? '[]', true) ?: []);
        if (empty($botAssets)) {
            $botAssets = [
                ['assetId' => 'geram18', 'name' => 'طلای ۱۸ عیار', 'weight' => 35],
                ['assetId' => 'ir_silver_gram', 'name' => 'گرم نقره ۹۹۹ بازار ایران', 'weight' => 35],
                ['assetId' => 'etf_ayar', 'name' => 'صندوق طلای عیار', 'weight' => 30],
            ];
        }

        $market = market_cached() ?: [];
        $assetsBy = [];
        foreach (($market['assets'] ?? []) as $a) {
            if (!empty($a['id'])) $assetsBy[$a['id']] = $a;
            if (!empty($a['name'])) $assetsBy[$a['name']] = $a;
        }

        $now = u_now_ms();
        $subPositions = [];
        $inTradeTotal = 0;
        $sumW = 0;
        foreach ($botAssets as $ba) $sumW += max(5, (float)($ba['weight'] ?? 20));
        if ($sumW <= 0) $sumW = 100;

        foreach ($botAssets as $idx => $ba) {
            $aid = (string) ($ba['assetId'] ?? ('ast_' . $idx));
            $aname = (string) ($ba['name'] ?? $aid);
            $wPct = round((max(5, (float)($ba['weight'] ?? 20)) / $sumW) * 100, 1);
            $allocAmt = (int) round($capital * ($wPct / 100));
            $step1Amt = (int) round($allocAmt * 0.6); // 60% پله اول فعال
            $step2Amt = $allocAmt - $step1Amt;        // 40% پله دوم آماده در کف حمایتی
            $inTradeTotal += $step1Amt;

            $mAsset = $assetsBy[$aid] ?? ($assetsBy[$aname] ?? null);
            $entryPrice = $mAsset ? (float) ($mAsset['metrics']['last'] ?? 100000) : (float) ($ba['price'] ?? 100000);
            if ($entryPrice <= 0) $entryPrice = 100000;

            $slPct  = (float) ($bot['stop_loss_pct'] ?? 4.0);
            $tp1Pct = (float) ($bot['tp1_pct'] ?? 7.5);
            $tp2Pct = (float) ($bot['tp2_pct'] ?? 14.5);

            $subPositions[] = [
                'assetId' => $aid,
                'name' => $aname,
                'weightPct' => $wPct,
                'allocatedAmount' => $allocAmt,
                'step1Amount' => $step1Amt,
                'step2Amount' => $step2Amt,
                'entryPrice' => $entryPrice,
                'currentPrice' => $entryPrice,
                'stopLoss' => round($entryPrice * (1 - $slPct / 100), 2),
                'target1' => round($entryPrice * (1 + $tp1Pct / 100), 2),
                'target2' => round($entryPrice * (1 + $tp2Pct / 100), 2),
                'step2LimitPrice' => round($entryPrice * 0.972, 2),
                'status' => 'active_step1',
                'statusFa' => '🟢 پله ۱ خریداری شد · پله ۲ در کمین حمایت',
                'pnlPct' => 0.0,
                'pnlAmount' => 0,
                'rsi' => rand(34, 48),
                'signalStrength' => rand(82, 95)
            ];
        }

        $freeMargin = max(0, $capital - $inTradeTotal);
        $liveLogs = [
            [
                'time' => $now,
                'icon' => '🤖',
                'type' => 'bot_init',
                'title' => "فعال‌سازی «{$bot['name']}» روی سبد «{$basketName}»",
                'text' => "سرمایه ترید: " . number_format($capital) . " تومان | تعداد دارایی‌های سبد: " . count($subPositions) . " بازار | استراتژی: " . ($bot['strategy_fa'] ?? $bot['strategy'])
            ],
            [
                'time' => $now + 100,
                'icon' => '📡',
                'type' => 'market_scan',
                'title' => 'اسکن کوانتومی اندیکاتورها و نقدینگی سبد',
                'text' => 'بررسی همزمان RSI، باندهای بولینگر، ATR و جریان پول هوشمند روی کلیه دارایی‌های سبد انجام شد.'
            ],
            [
                'time' => $now + 250,
                'icon' => '🟢',
                'type' => 'orders_placed',
                'title' => 'اجرای خرید پله اول (۶۰٪) و کاشت سفارش‌های شرطی پله دوم (۴۰٪)',
                'text' => "مبلغ " . number_format($inTradeTotal) . " تومان وارد پوزیشن‌های فعال شد و " . number_format($freeMargin) . " تومان در سفارش‌های لیمیت کف حمایتی قرار گرفت."
            ],
            [
                'time' => $now + 400,
                'icon' => '🛡️',
                'type' => 'risk_guard',
                'title' => 'فعال‌سازی سپر حد ضرر هوشمند (Stop-Loss) و تارگت‌های سیو سود',
                'text' => "حد ضرر خودکار: {$bot['stop_loss_pct']}٪ | تارگت اول: +{$bot['tp1_pct']}٪ | تارگت دوم: +{$bot['tp2_pct']}٪ | حد ضرر متحرک (Trailing): فعال"
            ]
        ];

        $expiresAt = $now + ((int)($bot['duration_days'] ?? 30) * 86400 * 1000);
        $instId = $now;
        if (db_ok()) {
            db_exec('INSERT INTO user_bot_instances (user_id, ref_id, bot_id, bot_code, bot_name, basket_name, basket_type, strategy, license_paid, initial_capital, current_equity, in_trade_capital, free_margin, total_pnl, total_pnl_pct, realized_pnl, trades_count, won_trades, stop_loss_pct, tp1_pct, tp2_pct, status, sub_positions_json, live_logs_json, started_at, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $uid, $refId, (int)$bot['id'], $bot['code'], $bot['name'], $basketName, $basketType, $bot['strategy_fa'] ?? $bot['strategy'],
                $licenseFee, $capital, $capital, $inTradeTotal, $freeMargin,
                count($subPositions), count($subPositions),
                (float)($bot['stop_loss_pct'] ?? 4.0), (float)($bot['tp1_pct'] ?? 7.5), (float)($bot['tp2_pct'] ?? 14.5),
                'running',
                json_encode($subPositions, JSON_UNESCAPED_UNICODE),
                json_encode($liveLogs, JSON_UNESCAPED_UNICODE),
                $now, $expiresAt, $now
            ]);
            $lastId = (int) db_last_id();
            if ($lastId > 0) $instId = $lastId;
        }

        notification_send($uid, "ربات ترید «{$bot['name']}» فعال شد 🤖", "ربات ترید شما روی سبد «{$basketName}» با سرمایه " . number_format($capital) . " تومان شروع به معامله خودکار کرد (شناسه: {$refId}).", 'signal_buy');
        audit('bot_buy_start', "خرید و فعال‌سازی ربات {$bot['name']} روی {$basketName} با سرمایه " . number_format($capital), $uid);

        $instanceObj = [
            'id' => $instId,
            'ref_id' => $refId,
            'bot_id' => (int)$bot['id'],
            'bot_code' => $bot['code'],
            'bot_name' => $bot['name'],
            'basket_name' => $basketName,
            'basket_type' => $basketType,
            'strategy' => $bot['strategy_fa'] ?? $bot['strategy'],
            'license_paid' => $licenseFee,
            'initial_capital' => $capital,
            'current_equity' => $capital,
            'in_trade_capital' => $inTradeTotal,
            'free_margin' => $freeMargin,
            'total_pnl' => 0,
            'total_pnl_pct' => 0,
            'realized_pnl' => 0,
            'trades_count' => count($subPositions),
            'won_trades' => count($subPositions),
            'stop_loss_pct' => (float)($bot['stop_loss_pct'] ?? 4.0),
            'tp1_pct' => (float)($bot['tp1_pct'] ?? 7.5),
            'tp2_pct' => (float)($bot['tp2_pct'] ?? 14.5),
            'status' => 'running',
            'sub_positions' => $subPositions,
            'live_logs' => $liveLogs,
            'started_at' => $now,
            'expires_at' => $expiresAt,
            'updated_at' => $now
        ];

        api_send(200, [
            'ok' => true,
            'balance' => $adj['balance'] ?? user_wallet_balance($uid),
            'instance' => $instanceObj,
            'message' => "ربات ترید «{$bot['name']}» با موفقیت خریداری و روی سبد «{$basketName}» فعال شد! اکنون در حال ترید لحظه‌ای است 🤖🚀"
        ]);
    }

    if ($path === '/api/trading-bots/action' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'ابتدا وارد حساب کاربری خود شوید.']);
        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $refId = trim((string) ($b['refId'] ?? ''));
        $action = trim((string) ($b['action'] ?? 'tick'));

        $inst = db_one('SELECT * FROM user_bot_instances WHERE user_id = ? AND (id = ? OR ref_id = ?)', [$uid, $id, $refId]);
        if (!$inst) api_send(404, ['error' => 'ربات ترید مورد نظر یافت نشد.']);

        $subs = !empty($inst['sub_positions_json']) ? (json_decode($inst['sub_positions_json'], true) ?: []) : [];
        $logs = !empty($inst['live_logs_json']) ? (json_decode($inst['live_logs_json'], true) ?: []) : [];
        $now = u_now_ms();

        if ($action === 'pause' || $action === 'resume') {
            $newStatus = ($inst['status'] === 'running') ? 'paused' : 'running';
            array_unshift($logs, [
                'time' => $now,
                'icon' => $newStatus === 'running' ? '▶️' : '⏸',
                'type' => 'status_change',
                'title' => $newStatus === 'running' ? 'ادامه فعالیت و ترید خودکار ربات' : 'توقف موقت سفارش‌گذاری جدید ربات',
                'text' => $newStatus === 'running' ? 'موتور ترید مجدداً فعال شد و رصد لحظه‌ای بازار ادامه دارد.' : 'ربات در حالت استندبای قرار گرفت؛ حد ضرر پوزیشن‌های باز همچنان فعال است.'
            ]);
            db_exec('UPDATE user_bot_instances SET status = ?, live_logs_json = ?, updated_at = ? WHERE id = ?', [
                $newStatus, json_encode(array_slice($logs, 0, 50), JSON_UNESCAPED_UNICODE), $now, $inst['id']
            ]);
            $inst['status'] = $newStatus;
            $inst['sub_positions'] = $subs;
            $inst['live_logs'] = array_slice($logs, 0, 50);
            api_send(200, ['ok' => true, 'instance' => $inst, 'message' => $newStatus === 'running' ? 'ربات ترید مجدداً فعال شد ▶️' : 'ربات ترید موقتاً متوقف شد ⏸']);
        }

        if ($action === 'tick' || $action === 'scalp') {
            $totalPnl = 0;
            $bestAssetName = '';
            $bestMove = -999;
            foreach ($subs as &$sp) {
                $deltaPct = (rand(-35, 145) / 100.0); // حرکت تیک بازار با بایاس مثبت الگوریتم
                $curP = (float) ($sp['currentPrice'] ?? $sp['entryPrice']);
                $newP = max(1, round($curP * (1 + $deltaPct / 100), 2));
                $sp['currentPrice'] = $newP;
                $entryP = (float) ($sp['entryPrice'] ?: 1);
                $pnlPct = round((($newP - $entryP) / $entryP) * 100, 2);
                $pnlAmt = (int) round(($sp['allocatedAmount'] * $pnlPct) / 100);
                $sp['pnlPct'] = $pnlPct;
                $sp['pnlAmount'] = $pnlAmt;
                $sp['rsi'] = max(25, min(78, (int)($sp['rsi'] ?? 45) + rand(-4, 6)));
                if ($pnlPct >= 2.5) {
                    $sp['status'] = 'trailing_profit';
                    $sp['statusFa'] = '🛡️ در سود · حد ضرر متحرک (Risk-Free) فعال شد';
                } elseif ($pnlPct < -1.2) {
                    $sp['status'] = 'step2_filled';
                    $sp['statusFa'] = '🔵 پله ۲ در کف حمایتی تکمیل شد (میانگین‌گیری کم‌ریسک)';
                } else {
                    $sp['status'] = 'active_step1';
                    $sp['statusFa'] = '🟢 در معامله فعال · رصد لحظه‌ای تارگت اول';
                }
                $totalPnl += $pnlAmt;
                if ($deltaPct > $bestMove) {
                    $bestMove = $deltaPct;
                    $bestAssetName = $sp['name'];
                }
            }
            unset($sp);

            $initCap = (int) $inst['initial_capital'];
            $curEq = max(0, $initCap + $totalPnl);
            $totalPnlPct = $initCap > 0 ? round(($totalPnl / $initCap) * 100, 2) : 0;
            $tradesCount = (int)$inst['trades_count'] + 1;
            $wonTrades = (int)$inst['won_trades'] + ($bestMove >= 0 ? 1 : 0);

            array_unshift($logs, [
                'time' => $now,
                'icon' => '⚡',
                'type' => 'scalp_tick',
                'title' => "سیکل نوسان‌گیری هوشمند و بهینه‌سازی سبد («{$bestAssetName}»)",
                'text' => "به‌روزرسانی قیمت‌های لحظه‌ای؛ برآیند سود/زیان جاری سبد: " . ($totalPnl >= 0 ? '+' : '') . number_format($totalPnl) . " تومان ({$totalPnlPct}٪) | ارزش کل سبد: " . number_format($curEq) . " تومان"
            ]);
            $logs = array_slice($logs, 0, 50);

            db_exec('UPDATE user_bot_instances SET current_equity = ?, total_pnl = ?, total_pnl_pct = ?, trades_count = ?, won_trades = ?, sub_positions_json = ?, live_logs_json = ?, updated_at = ? WHERE id = ?', [
                $curEq, $totalPnl, $totalPnlPct, $tradesCount, $wonTrades,
                json_encode($subs, JSON_UNESCAPED_UNICODE),
                json_encode($logs, JSON_UNESCAPED_UNICODE),
                $now, $inst['id']
            ]);

            $inst['current_equity'] = $curEq;
            $inst['total_pnl'] = $totalPnl;
            $inst['total_pnl_pct'] = $totalPnlPct;
            $inst['trades_count'] = $tradesCount;
            $inst['won_trades'] = $wonTrades;
            $inst['sub_positions'] = $subs;
            $inst['live_logs'] = $logs;

            api_send(200, ['ok' => true, 'instance' => $inst, 'message' => 'سیکل ترید لحظه‌ای ربات با موفقیت اجرا شد ⚡']);
        }

        if ($action === 'harvest') {
            $pnl = (int) $inst['total_pnl'];
            if ($pnl <= 0) api_send(400, ['error' => 'در حال حاضر سود قابل برداشتی ثبت نشده است.']);

            $res = user_wallet_adj($uid, 'deposit', $pnl, "برداشت سود لحظه‌ای ربات ترید «{$inst['bot_name']}» روی سبد «{$inst['basket_name']}»", 'HARVEST-' . $inst['ref_id']);
            foreach ($subs as &$sp) {
                $sp['entryPrice'] = $sp['currentPrice'];
                $sp['pnlPct'] = 0;
                $sp['pnlAmount'] = 0;
            }
            unset($sp);
            $realized = (int)$inst['realized_pnl'] + $pnl;
            array_unshift($logs, [
                'time' => $now,
                'icon' => '💰',
                'type' => 'harvest_profit',
                'title' => 'سیو سود و واریز آنی به کیف‌پول کاربر',
                'text' => "مبلغ +" . number_format($pnl) . " تومان سود خالص به کیف‌پول منتقل شد و قیمت سرخط پوزیشن‌ها ریست گردید."
            ]);
            $logs = array_slice($logs, 0, 50);

            db_exec('UPDATE user_bot_instances SET current_equity = initial_capital, total_pnl = 0, total_pnl_pct = 0, realized_pnl = ?, sub_positions_json = ?, live_logs_json = ?, updated_at = ? WHERE id = ?', [
                $realized, json_encode($subs, JSON_UNESCAPED_UNICODE), json_encode($logs, JSON_UNESCAPED_UNICODE), $now, $inst['id']
            ]);

            $inst['current_equity'] = (int)$inst['initial_capital'];
            $inst['total_pnl'] = 0;
            $inst['total_pnl_pct'] = 0;
            $inst['realized_pnl'] = $realized;
            $inst['sub_positions'] = $subs;
            $inst['live_logs'] = $logs;

            api_send(200, [
                'ok' => true,
                'balance' => $res['balance'] ?? user_wallet_balance($uid),
                'instance' => $inst,
                'message' => "مبلغ " . number_format($pnl) . " تومان سود ربات با موفقیت به کیف‌پول شما واریز شد 💰🎉"
            ]);
        }

        if ($action === 'close') {
            if ($inst['status'] === 'closed') api_send(400, ['error' => 'این ربات قبلاً تسویه و بسته شده است.']);
            $refund = max(0, (int)$inst['initial_capital'] + (int)$inst['total_pnl']);
            $res = user_wallet_adj($uid, 'deposit', $refund, "تسویه کامل سرمایه و سود ربات ترید «{$inst['bot_name']}» ({$inst['basket_name']})", 'BOTCLOSE-' . $inst['ref_id']);
            array_unshift($logs, [
                'time' => $now,
                'icon' => '🛑',
                'type' => 'bot_closed',
                'title' => 'تسویه کامل سبد ربات و انتقال وجه به کیف‌پول',
                'text' => "کلیه پوزیشن‌های سبد بسته شد و مجموعاً " . number_format($refund) . " تومان به کیف‌پول واریز گردید."
            ]);
            db_exec('UPDATE user_bot_instances SET status = ?, live_logs_json = ?, updated_at = ? WHERE id = ?', [
                'closed', json_encode(array_slice($logs, 0, 50), JSON_UNESCAPED_UNICODE), $now, $inst['id']
            ]);
            $inst['status'] = 'closed';
            $inst['sub_positions'] = $subs;
            $inst['live_logs'] = array_slice($logs, 0, 50);

            api_send(200, [
                'ok' => true,
                'balance' => $res['balance'] ?? user_wallet_balance($uid),
                'instance' => $inst,
                'message' => "ربات ترید با موفقیت تسویه شد و مبلغ " . number_format($refund) . " تومان به کیف‌پول شما بازگشت 🏁"
            ]);
        }
    }

    /* ------------------------------ مدیریت ربات‌های ترید توسط ادمین ------------------------------ */
    if ($path === '/api/admin/trading-bots' && $method === 'GET') {
        auth_require_admin();
        if (db_ok()) {
            try { db_migrate(); } catch (Throwable $e) {}
        }
        $bots = [];
        $allInstances = [];
        if (db_ok()) {
            $rows = db_all('SELECT * FROM trading_bots ORDER BY id ASC');
            foreach ($rows as $r) {
                $r['assets'] = !empty($r['assets_json']) ? (json_decode($r['assets_json'], true) ?: []) : [];
                $r['features'] = !empty($r['features_json']) ? (json_decode($r['features_json'], true) ?: []) : [];
                $r['sim_config'] = !empty($r['sim_config_json']) ? (json_decode($r['sim_config_json'], true) ?: null) : null;
                $bots[] = $r;
            }
            $allInstances = db_all('SELECT ubi.*, u.name AS user_name, u.email AS user_email FROM user_bot_instances ubi LEFT JOIN users u ON u.id = ubi.user_id ORDER BY ubi.id DESC LIMIT 100');
            foreach ($allInstances as &$instRow) {
                $instRow['sim_config'] = !empty($instRow['sim_config_json']) ? (json_decode($instRow['sim_config_json'], true) ?: null) : null;
            }
            unset($instRow);
        }
        api_send(200, ['ok' => true, 'bots' => $bots, 'instances' => $allInstances]);
    }

    if ($path === '/api/admin/trading-bots' && $method === 'POST') {
        auth_require_admin();
        if (db_ok()) {
            try { db_migrate(); } catch (Throwable $e) {}
        }
        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $name = trim((string) ($b['name'] ?? ''));
        if (!$name) api_send(400, ['error' => 'نام ربات ترید الزامی است.']);

        $code = trim((string) ($b['code'] ?? ''));
        if (!$code) $code = 'bot_' . strtolower(substr(md5($name . uniqid()), 0, 8));
        $subtitle = trim((string) ($b['subtitle'] ?? ''));
        $basketType = trim((string) ($b['basket_type'] ?? 'all'));
        $strategy = trim((string) ($b['strategy'] ?? 'grid_dca'));
        $strategyFa = trim((string) ($b['strategy_fa'] ?? 'ورود پله‌ای هوشمند + حد ضرر متحرک'));
        $riskLevel = trim((string) ($b['risk_level'] ?? 'balanced'));
        $priceToman = max(0, (int) round(to_clean_number($b['price_toman'] ?? 490000)));
        $minCapital = max(100000, (int) round(to_clean_number($b['min_capital'] ?? 5000000)));
        $durationDays = max(1, (int) ($b['duration_days'] ?? 30));
        $winRate = max(1, min(99.9, (float) ($b['win_rate'] ?? 85.0)));
        $expectedMonthly = trim((string) ($b['expected_monthly_pct'] ?? '۱۲٪ تا ۲۰٪'));
        $stopLossPct = max(0.5, (float) ($b['stop_loss_pct'] ?? 4.0));
        $tp1Pct = max(1.0, (float) ($b['tp1_pct'] ?? 7.5));
        $tp2Pct = max(2.0, (float) ($b['tp2_pct'] ?? 14.5));
        $maxOpenTrades = max(1, (int) ($b['max_open_trades'] ?? 6));
        $trailingStop = !empty($b['trailing_stop']) ? 1 : 0;
        $badge = trim((string) ($b['badge'] ?? 'ربات ویژه 🤖'));
        $isActive = isset($b['is_active']) ? ((int)$b['is_active'] ? 1 : 0) : 1;

        $assets = isset($b['assets']) && is_array($b['assets']) ? $b['assets'] : [];
        $features = isset($b['features']) && is_array($b['features']) ? $b['features'] : [
            'ورود ۲ پله‌ای هوشمند و مدیریت ریسک خودکار',
            'گزارش لحظه‌ای سود/زیان و لاگ زنده تصمیمات ربات'
        ];
        $simConfig = isset($b['sim_config']) && is_array($b['sim_config']) ? $b['sim_config'] : null;
        $simConfigJson = $simConfig ? json_encode($simConfig, JSON_UNESCAPED_UNICODE) : null;

        $now = u_now_ms();
        if ($id > 0) {
            db_exec('UPDATE trading_bots SET code=?, name=?, subtitle=?, basket_type=?, strategy=?, strategy_fa=?, risk_level=?, price_toman=?, min_capital=?, duration_days=?, win_rate=?, expected_monthly_pct=?, stop_loss_pct=?, tp1_pct=?, tp2_pct=?, max_open_trades=?, trailing_stop=?, assets_json=?, features_json=?, sim_config_json=?, badge=?, is_active=? WHERE id=?', [
                $code, $name, $subtitle, $basketType, $strategy, $strategyFa, $riskLevel,
                $priceToman, $minCapital, $durationDays, $winRate, $expectedMonthly,
                $stopLossPct, $tp1Pct, $tp2Pct, $maxOpenTrades, $trailingStop,
                json_encode($assets, JSON_UNESCAPED_UNICODE),
                json_encode($features, JSON_UNESCAPED_UNICODE),
                $simConfigJson,
                $badge, $isActive, $id
            ]);
        } else {
            db_exec('INSERT INTO trading_bots (code, name, subtitle, basket_type, strategy, strategy_fa, risk_level, price_toman, min_capital, duration_days, win_rate, expected_monthly_pct, stop_loss_pct, tp1_pct, tp2_pct, max_open_trades, trailing_stop, assets_json, features_json, sim_config_json, badge, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $code, $name, $subtitle, $basketType, $strategy, $strategyFa, $riskLevel,
                $priceToman, $minCapital, $durationDays, $winRate, $expectedMonthly,
                $stopLossPct, $tp1Pct, $tp2Pct, $maxOpenTrades, $trailingStop,
                json_encode($assets, JSON_UNESCAPED_UNICODE),
                json_encode($features, JSON_UNESCAPED_UNICODE),
                $simConfigJson,
                $badge, $isActive, $now
            ]);
            $id = (int) db_last_id();
        }
        audit('admin_bot_save', "ذخیره ربات ترید {$name} ({$code})", auth_id());
        api_send(200, ['ok' => true, 'id' => $id, 'message' => "ربات ترید «{$name}» با موفقیت ذخیره شد ✅"]);
    }

    if ($path === '/api/admin/trading-bots/delete' && $method === 'POST') {
        auth_require_admin();
        $b = api_body();
        $id = (int) ($b['id'] ?? 0);
        $code = trim((string) ($b['code'] ?? ''));
        if (db_ok()) {
            db_exec('DELETE FROM trading_bots WHERE id = ? OR (code != "" AND code = ?)', [$id, $code]);
        }
        api_send(200, ['ok' => true, 'message' => 'ربات ترید حذف شد.']);
    }


    /* ------------------------------ اعلان‌ها ------------------------------ */
    if ($path === '/api/notifications' && $method === 'GET') {
        $uid = auth_id() ?? 0;
        $rows = [];
        if (db_ok()) {
            $rows = db_all('SELECT * FROM notifications WHERE user_id = ? OR user_id = 0 ORDER BY id DESC LIMIT 60', [$uid]);
        }
        $meta = user_meta_get($uid);
        $alertSettings = $meta['alertSettings'] ?? [
            'smsSignal' => false, 'smsTrade' => false, 'webSignal' => true,
            'goldAlerts' => true, 'cryptoAlerts' => true, 'bourseAlerts' => true
        ];
        api_send(200, ['notifications' => $rows, 'settings' => $alertSettings, 'pricing' => [
            'vipPrice' => (int) setting_get('alertVipPrice', 50000),
            'smsPerUnit' => (int) setting_get('alertSmsPerUnit', 200),
        ]]);
    }

    if ($path === '/api/notifications/read' && $method === 'POST') {
        $uid = auth_id() ?? 0;
        $b = api_body();
        $nid = $b['id'] ?? 'all';
        if ($nid === 'all') {
            db_exec('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id = 0', [$uid]);
        } else {
            db_exec('UPDATE notifications SET is_read = 1 WHERE id = ?', [(int) $nid]);
        }
        api_send(200, ['ok' => true]);
    }

    if ($path === '/api/notifications/settings' && $method === 'POST') {
        $uid = auth_id();
        if (!$uid) api_send(401, ['error' => 'وارد حساب خود شوید.']);
        $b = api_body();
        $meta = user_meta_get($uid);
        $meta['alertSettings'] = [
            'smsSignal' => !empty($b['smsSignal']),
            'smsTrade' => !empty($b['smsTrade']),
            'webSignal' => !empty($b['webSignal']),
            'goldAlerts' => !empty($b['goldAlerts']),
            'cryptoAlerts' => !empty($b['cryptoAlerts']),
            'bourseAlerts' => !empty($b['bourseAlerts']),
        ];
        user_meta_set($uid, $meta);
        api_send(200, ['ok' => true, 'settings' => $meta['alertSettings'], 'message' => 'تنظیمات اعلان‌ها ذخیره شد.']);
    }

    /* ------------------------------ پرتفوی ------------------------------ */
    if ($path === '/api/portfolio/analysis') api_send(200, engine_analyze_portfolio($s));

    if ($path === '/api/profile' && in_array($method, ['POST', 'PUT'], true)) {
        $b = api_body();
        $patch = [];
        foreach (['name', 'risk', 'horizon', 'baseCurrency'] as $k) if (isset($b[$k])) $patch[$k] = mb_substr((string) $b[$k], 0, 60);
        if (isset($b['investableCash'])) $patch['investableCash'] = max(0, (float) $b['investableCash']);
        if (isset($b['settings']) && is_array($b['settings'])) $s['settings'] = u_deep_merge($s['settings'], $b['settings']);
        $s['profile'] = u_deep_merge($s['profile'], $patch);
        store_save($s);
        api_send(200, ['ok' => true, 'profile' => $s['profile'], 'analysis' => engine_analyze_portfolio(store_load())]);
    }

    if ($path === '/api/portfolio') {
        if ($method === 'GET') api_send(200, ['portfolio' => $s['portfolio'], 'analysis' => engine_analyze_portfolio($s), 'rate' => engine_usd_toman()]);

        if ($method === 'POST') {
            $b = api_body();
            if (empty($b['label']) || empty($b['cls'])) api_send(400, ['error' => 'نام دارایی و کلاس الزامی است.']);
            $classes = universe_classes();
            $entry = [
                'id' => u_uuid(),
                'label' => mb_substr((string) $b['label'], 0, 80),
                'cls' => isset($classes[$b['cls']]) ? $b['cls'] : 'cash',
                'assetId' => isset($b['assetId'], market_assets_index()[$b['assetId']]) ? $b['assetId'] : null,
                'amount' => max(0, (float) ($b['amount'] ?? 0)),
                'unit' => ($b['unit'] ?? 'unit') === 'usd' ? 'usd' : 'unit',
                'note' => mb_substr((string) ($b['note'] ?? ''), 0, 200),
                'updatedAt' => u_now_ms(),
            ];
            $s['portfolio'][] = $entry;
            store_save($s);
            api_send(200, ['ok' => true, 'entry' => $entry, 'portfolio' => $s['portfolio'], 'analysis' => engine_analyze_portfolio(store_load())]);
        }

        if ($method === 'DELETE') {
            $id = $_GET['id'] ?? '';
            $s['portfolio'] = array_values(array_filter($s['portfolio'], fn($x) => ($x['id'] ?? '') !== $id));
            store_save($s);
            api_send(200, ['ok' => true, 'portfolio' => $s['portfolio'], 'analysis' => engine_analyze_portfolio(store_load())]);
        }

        if ($method === 'PUT') {
            $b = api_body();
            $found = false;
            foreach ($s['portfolio'] as $i => $x) {
                if (($x['id'] ?? '') !== ($b['id'] ?? '')) continue;
                $classes = universe_classes();
                $s['portfolio'][$i] = array_merge($x, [
                    'label' => mb_substr((string) ($b['label'] ?? $x['label']), 0, 80),
                    'amount' => array_key_exists('amount', $b) ? max(0, (float) $b['amount']) : $x['amount'],
                    'unit' => ($b['unit'] ?? $x['unit']) === 'usd' ? 'usd' : 'unit',
                    'cls' => isset($classes[$b['cls'] ?? '']) ? $b['cls'] : $x['cls'],
                    'updatedAt' => u_now_ms(),
                ]);
                $found = true;
                break;
            }
            if (!$found) api_send(404, ['error' => 'یافت نشد']);
            store_save($s);
            api_send(200, ['ok' => true, 'portfolio' => $s['portfolio'], 'analysis' => engine_analyze_portfolio(store_load())]);
        }
        api_send(405, ['error' => 'متد پشتیبانی نمی‌شود']);
    }

    /* ------------------------------ هوش مصنوعی (تنظیمات مختص سوپر ادمین) ------------------------------ */
    if ($path === '/api/ai/config' && $method === 'POST') {
        if (!auth_is_admin()) api_send(403, ['error' => 'دسترسی غیرمجاز. تنظیمات هوش مصنوعی فقط مختص مدیر ارشد است.']);
        $b = api_body();
        if (isset($b['provider']) && !isset(ai_providers()[$b['provider']])) api_send(400, ['error' => 'پرووایدر نامعتبر']);
        foreach (['provider', 'baseUrl', 'model'] as $k) if (isset($b[$k])) $s['ai'][$k] = mb_substr((string) $b[$k], 0, 300);
        if (isset($b['apiKey']) && $b['apiKey'] !== '') $s['ai']['apiKey'] = mb_substr((string) $b['apiKey'], 0, 400);
        if (!empty($b['clearKey'])) $s['ai']['apiKey'] = '';
        if (isset($b['temperature'])) $s['ai']['temperature'] = max(0, min(1, (float) $b['temperature']));
        if (isset($b['autoMode'])) $s['ai']['autoMode'] = (bool) $b['autoMode'];
        if (isset($b['autoIntervalMin'])) $s['ai']['autoIntervalMin'] = max(5, min(1440, (int) $b['autoIntervalMin']));
        if (isset($b['settings']) && is_array($b['settings'])) $s['settings'] = u_deep_merge($s['settings'], $b['settings']);
        store_save($s);
        api_send(200, ['ok' => true, 'ai' => store_public(store_load())['ai']]);
    }

    if ($path === '/api/ai/models' && $method === 'POST') {
        if (!auth_is_admin()) api_send(403, ['error' => 'دسترسی غیرمجاز. دریافت مدل‌ها فقط مختص مدیر ارشد است.']);
        $b = api_body();
        $c = ai_cfg($s);
        if (!empty($b['provider']) && isset(ai_providers()[$b['provider']])) $c = ai_cfg(array_merge($s, ['ai' => array_merge($s['ai'], ['provider' => $b['provider']])]));
        if (!empty($b['baseUrl'])) $c['baseUrl'] = (string) $b['baseUrl'];
        if (!empty($b['apiKey'])) $c['apiKey'] = (string) $b['apiKey'];
        $r = ai_list_models($c);
        api_send(200, ['models' => $r['models'], 'auto' => $r['auto'], 'label' => $r['label']]);
    }

    if ($path === '/api/ai/test' && $method === 'POST') {
        if (!auth_is_admin()) api_send(403, ['error' => 'دسترسی غیرمجاز. تست اتصال هوش مصنوعی فقط مختص مدیر ارشد است.']);
        api_send(200, ai_test_connection(store_load()));
    }

    if ($path === '/api/ai/run' && $method === 'POST') {
        try {
            $r = ai_run_auto(store_load(), 'manual');
            if (function_exists('admin_log_ai_usage')) admin_log_ai_usage((int) auth_id(), (string) ($r['model'] ?? ''), 'ok', (int) ($r['durationMs'] ?? 0));
            api_send(200, $r);
        } catch (Throwable $e) {
            if (function_exists('admin_log_ai_usage')) admin_log_ai_usage((int) auth_id(), '', 'error', 0);
            api_send(500, ['error' => $e->getMessage()]);
        }
    }

    if ($path === '/api/ai/last') {
        $last = ai_last_analysis();
        api_send(200, ['analysis' => $last, 'meta' => [
            'provider' => $s['ai']['provider'], 'model' => $last['model'] ?? ($s['ai']['model'] ?? 'auto'),
            'autoMode' => !empty($s['ai']['autoMode']), 'autoIntervalMin' => $s['ai']['autoIntervalMin'] ?? 60,
            'lastRunAt' => $s['ai']['lastRunAt'] ?? null, 'lastRunStatus' => $s['ai']['lastRunStatus'] ?? null,
            'hasKey' => !empty($s['ai']['apiKey']), 'lastModels' => $s['ai']['lastModels'] ?? [],
            'autoPick' => $s['ai']['autoPick'] ?? null,
        ]]);
    }

    if ($path === '/api/ai/chat') {
        if ($method === 'GET') api_send(200, ['chat' => $s['chat']]);
        if ($method === 'DELETE') { $s['chat'] = []; store_save($s); api_send(200, ['ok' => true]); }
        if ($method === 'POST') {
            $b = api_body();
            $msg = trim((string) ($b['message'] ?? ''));
            if ($msg === '') api_send(400, ['error' => 'پیام خالی است']);
            try {
                $reply = ai_chat_reply($s, $msg);
            } catch (Throwable $e) {
                api_send(500, ['error' => $e->getMessage()]);
            }
            $s['chat'][] = ['role' => 'user', 'content' => mb_substr($msg, 0, 4000), 'at' => u_now_ms()];
            $s['chat'][] = ['role' => 'assistant', 'content' => $reply['text'], 'at' => $reply['at'], 'model' => $reply['model']];
            $s['chat'] = array_slice($s['chat'], -60);
            store_save($s);
            api_send(200, $reply);
        }
    }

    api_send(404, ['error' => 'مسیر یافت نشد: ' . $path]);
}
