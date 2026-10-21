#!/usr/bin/env python3
import os
import re
import base64

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read_file(rel):
    p = os.path.join(BASE, rel)
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()

def read_binary(rel):
    p = os.path.join(BASE, rel)
    with open(p, 'rb') as f:
        return f.read()

html = read_file('public/index.src.html')
css = read_file('public/styles.css')
js = read_file('public/app.js')
demo = read_file('preview/demo-data.json')
font = read_binary('preview/vazirmatn-arabic.woff2')
urange = read_file('preview/vazirmatn-unicode-range.txt').strip()

font_b64 = base64.b64encode(font).decode('ascii')
font_css = f"@font-face{{font-family:'Vazirmatn';font-style:normal;font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,{font_b64}) format('woff2');unicode-range:{urange}}}"

shim = """/* ===== شیم دادهٔ خودکفا =====================================================
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

  const DEMO_USER = { id: 1, email: 'admin@gmail.com', name: 'مدیر ارشد کل (Super Admin)', role: 'admin', isSuperAdmin: true,
    status: 'active', theme: 'dark', createdAt: Date.now() - 86400000, lastLoginAt: Date.now(), isAdmin: true, wallet_balance: 350000 };
  const DEMO = {
    '/api/auth/me': { user: DEMO_USER, installed: true, db: { ok: true, driver: 'sqlite' },
      settings: { siteName: 'سرمایه‌یار', siteTagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان',
        allowRegister: true, requireApproval: false, requireLogin: true, defaultTheme: 'dark', signalCount: 8, tickerItemCount: 12 },
      branding: { siteName: 'سرمایه‌یar', tagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان' } },
    '/api/auth/login': { ok: true, user: DEMO_USER },
    '/api/auth/register': { ok: true, user: DEMO_USER, recoveryWords: ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'] },
    '/api/auth/logout': { ok: true },
    '/api/auth/prefs': { ok: true },
    '/api/auth/password': { ok: true },
    '/api/auth/confirm-recovery-words': { ok: true },
    '/api/auth/recover-with-words': { ok: true, message: 'کلمه عبور با موفقیت ثبت شد.' },
    '/api/auth/fields': { ok: true, fields: [
      { id: 1, field_key: 'name', title: 'نام و نام خانوادگی', type: 'text', is_required: 1, is_active: 1, sort_order: 1, placeholder: 'مثلاً: علی رضایی', help_text: 'نام و نام خانوادگی خود را کامل وارد کنید.', default_val: '', validation_rules: { min_length: 3, max_length: 100 }, options: [] },
      { id: 2, field_key: 'username', title: 'نام کاربری', type: 'text', is_required: 0, is_active: 1, sort_order: 2, placeholder: 'user_name (لاتین)', help_text: 'حداقل ۳ حرف انگلیسی بدون فاصله.', default_val: '', validation_rules: { min_length: 3, max_length: 40, regex_type: 'alphanumeric' }, options: [] },
      { id: 3, field_key: 'email', title: 'پست الکترونیک (ایمیل)', type: 'email', is_required: 1, is_active: 1, sort_order: 3, placeholder: 'example@domain.com', help_text: 'جهت ورود به حساب و بازیابی رمز عبور.', default_val: '', validation_rules: { regex_type: 'email' }, options: [] },
      { id: 4, field_key: 'mobile', title: 'شماره تلفن همراه', type: 'tel', is_required: 0, is_active: 1, sort_order: 4, placeholder: '۰۹۱۲xxxxxxx', help_text: 'جهت دریافت هشدارهای پیامکی و امنیت حساب.', default_val: '', validation_rules: { regex_type: 'mobile_ir' }, options: [] },
      { id: 5, field_key: 'password', title: 'کلمه عبور', type: 'password', is_required: 1, is_active: 1, sort_order: 5, placeholder: '••••••••', help_text: 'حداقل ۶ کاراکتر شامل حروف و ارقام.', default_val: '', validation_rules: { min_length: 6 }, options: [] },
      { id: 6, field_key: 'password_confirm', title: 'تکرار کلمه عبور', type: 'password_confirm', is_required: 1, is_active: 1, sort_order: 6, placeholder: '••••••••', help_text: 'تکرار کلمه عبور بالا را بنویسید.', default_val: '', validation_rules: {}, options: [] },
      { id: 7, field_key: 'terms_agree', title: 'پذیرش قوانین و مقررات سامانه', type: 'checkbox', is_required: 1, is_active: 1, sort_order: 7, placeholder: '', help_text: 'ثبت‌نام در سامانه به منزله پذیرش کامل قوانین و شرایط است.', default_val: '1', validation_rules: {}, options: [] }
    ] },
    '/api/auth/install-state': { installed: true, db: { ok: true, driver: 'sqlite' }, settings: {}, branding: {} },
    '/api/admin/auth/fields': { ok: true, fields: [
      { id: 1, field_key: 'name', title: 'نام و نام خانوادگی', type: 'text', is_required: 1, is_active: 1, sort_order: 1, placeholder: 'مثلاً: علی رضایی', help_text: 'نام و نام خانوادگی خود را کامل وارد کنید.', default_val: '', validation_rules: { min_length: 3, max_length: 100 }, options: [] },
      { id: 2, field_key: 'username', title: 'نام کاربری', type: 'text', is_required: 0, is_active: 1, sort_order: 2, placeholder: 'user_name (لاتین)', help_text: 'حداقل ۳ حرف انگلیسی بدون فاصله.', default_val: '', validation_rules: { min_length: 3, max_length: 40, regex_type: 'alphanumeric' }, options: [] },
      { id: 3, field_key: 'email', title: 'پست الکترونیک (ایمیل)', type: 'email', is_required: 1, is_active: 1, sort_order: 3, placeholder: 'example@domain.com', help_text: 'جهت ورود به حساب و بازیابی رمز عبور.', default_val: '', validation_rules: { regex_type: 'email' }, options: [] },
      { id: 4, field_key: 'mobile', title: 'شماره تلفن همراه', type: 'tel', is_required: 0, is_active: 1, sort_order: 4, placeholder: '۰۹۱۲xxxxxxx', help_text: 'جهت دریافت هشدارهای پیامکی و امنیت حساب.', default_val: '', validation_rules: { regex_type: 'mobile_ir' }, options: [] },
      { id: 5, field_key: 'password', title: 'کلمه عبور', type: 'password', is_required: 1, is_active: 1, sort_order: 5, placeholder: '••••••••', help_text: 'حداقل ۶ کاراکتر شامل حروف و ارقام.', default_val: '', validation_rules: { min_length: 6 }, options: [] },
      { id: 6, field_key: 'password_confirm', title: 'تکرار کلمه عبور', type: 'password_confirm', is_required: 1, is_active: 1, sort_order: 6, placeholder: '••••••••', help_text: 'تکرار کلمه عبور بالا را بنویسید.', default_val: '', validation_rules: {}, options: [] },
      { id: 7, field_key: 'terms_agree', title: 'پذیرش قوانین و مقررات سامانه', type: 'checkbox', is_required: 1, is_active: 1, sort_order: 7, placeholder: '', help_text: 'ثبت‌نام در سامانه به منزله پذیرش کامل قوانین و شرایط است.', default_val: '1', validation_rules: {}, options: [] }
    ] },
    '/api/admin/roles': { ok: true, roles: [
      { id: 1, slug: 'admin', title: 'مدیر سیستم', description: 'دسترسی کامل به تمام بخش‌ها و تنظیمات سامانه', permissions: { all: true, color: '#ef4444', badge: 'مدیر' }, is_default: false, users_count: 2 },
      { id: 2, slug: 'user', title: 'کاربر عادی', description: 'دسترسی پایه به بازار، سبد دارایی و سیگنال‌های عمومی', permissions: { signals_view: true, portfolio_manage: true, color: '#38bdf8', badge: 'کاربر' }, is_default: true, users_count: 1 },
      { id: 3, slug: 'vip', title: 'کاربر ویژه VIP', description: 'دسترسی به تمام ۶۰+ سیگنال زنده، هوش مصنوعی و معاملات خودکار', permissions: { signals_view: true, signals_vip: true, portfolio_manage: true, ai_chat: true, auto_invest: true, color: '#eab308', badge: 'VIP 💎' }, is_default: false, users_count: 0 },
      { id: 4, slug: 'analyst', title: 'تحلیل‌گر بازار', description: 'دسترسی ویژه به موتور تحلیل، هوش مصنوعی و سیگنال‌ها', permissions: { signals_view: true, signals_vip: true, ai_chat: true, ai_models: true, color: '#a855f7', badge: 'تحلیل‌گر 📊' }, is_default: false, users_count: 0 }
    ] },
    '/api/admin/overview': { ok: true, db: { driver: 'sqlite', ok: true },
      counts: { users: 3, active: 3, pending: 0, blocked: 0, admins: 2, newToday: 1, new7: 3, new30: 3,
        loginsToday: 3, loginsFailed7: 0, aiRuns: 4, aiRuns7: 4, aiAvgMs: 3200 },
      series: Array.from({ length: 14 }, (_, i) => ({ from: 0, to: Date.now() - (13 - i) * 86400000, signups: i === 12 ? 1 : (i === 5 ? 1 : 0), logins: i % 3 })),
      market: { status: 'ready', assets: 70, total: 70, updatedAt: Date.now() },
      env: { php: '8.4.x', dbSize: 98304 },
      settings: { siteName: 'سرمایه‌یار', siteTagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان',
        allowRegister: true, requireApproval: false, requireLogin: true, defaultTheme: 'dark', signalCount: 8, tickerItemCount: 12 } },
    '/api/admin/users': { users: [
      { id: 1, email: 'admin@gmail.com', name: 'مدیر ارشد کل (Super Admin)', role: 'admin', isSuperAdmin: true, status: 'active', wallet_balance: 350000, created_at: Date.now() - 86400000 * 20, last_login_at: Date.now(), hasState: true },
      { id: 2, email: 'manager@sarmayeyar.ir', name: 'مدیر پشتیبانی سامانه', role: 'admin', isSuperAdmin: false, status: 'active', wallet_balance: 150000, created_at: Date.now() - 86400000 * 10, last_login_at: Date.now() - 3600000, hasState: true },
      { id: 3, email: 'ali@example.com', name: 'علی رضایی', role: 'user', isSuperAdmin: false, status: 'active', wallet_balance: 50000, created_at: Date.now() - 86400000 * 5, last_login_at: Date.now() - 86400000, hasState: true } ] },
    '/api/plans': { ok: true, wallet_balance: 350000, subscription: { is_active: true, plan_title: 'پلن نقره‌ای (حرفه‌ای)', expires_at: Date.now() + 86400000 * 45, days_left: 45 }, plans: [
      { id: 1, slug: 'bronze', title: 'پلن برنزی (پایه)', price: 0, days: 30, duration_days: 30, features: ['مشاهده سیگنال‌های عمومی بازار', 'مدیریت سبد دارایی پایه', 'تحلیل تکنیکال سطح ۱'], badge: 'رایگان' },
      { id: 2, slug: 'silver', title: 'پلن نقره‌ای (حرفه‌ای)', price: 190000, days: 60, duration_days: 60, features: ['دسترسی کامل به ۶۰+ سیگنال ایران و جهان', 'محاسبه هوشمند ورود پله‌ای و حد ضرر', 'تحلیل اختصاصی هوش مصنوعی', 'اولویت دریافت اعلان‌های وب'], badge: 'محبوب‌ترین' },
      { id: 3, slug: 'gold', title: 'پلن طلایی (VIP و نامحدود)', price: 490000, days: 180, duration_days: 180, features: ['دسترسی نامحدود VIP به تمام بازارها', 'چت زنده و نامحدود با تحلیلگر هوش مصنوعی', 'هشدارهای فوری پیامکی و تلگرام', 'پشتیبانی اختصاصی مدیر'], badge: 'ویژه سرمایه‌گذاران' }
    ] },
    '/api/admin/plans': { ok: true, plans: [
      { id: 1, slug: 'bronze', title: 'پلن برنزی (پایه)', price: 0, days: 30, duration_days: 30, features: ['مشاهده سیگنال‌های عمومی بازار', 'مدیریت سبد دارایی پایه', 'تحلیل تکنیکال سطح ۱'], badge: 'رایگان' },
      { id: 2, slug: 'silver', title: 'پلن نقره‌ای (حرفه‌ای)', price: 190000, days: 60, duration_days: 60, features: ['دسترسی کامل به ۶۰+ سیگنال ایران و جهان', 'محاسبه هوشمند ورود پله‌ای و حد ضرر', 'تحلیل اختصاصی هوش مصنوعی', 'اولویت دریافت اعلان‌های وب'], badge: 'محبوب‌ترین' },
      { id: 3, slug: 'gold', title: 'پلن طلایی (VIP و نامحدود)', price: 490000, days: 180, duration_days: 180, features: ['دسترسی نامحدود VIP به تمام بازارها', 'چت زنده و نامحدود با تحلیلگر هوش مصنوعی', 'هشدارهای فوری پیامکی و تلگرام', 'پشتیبانی اختصاصی مدیر'], badge: 'ویژه سرمایه‌گذاران' }
    ] },
    '/api/wallet/transactions': { ok: true, balance: 350000, transactions: [
      { id: 2, amount: 150000, balance_after: 350000, description: 'شارژ آنلاین کیف‌پول (درگاه زرین‌پال)', ref_id: 'TX-948271', created_at: Date.now() - 3600000 * 4 },
      { id: 1, amount: 200000, balance_after: 200000, description: 'شارژ اولیه حساب کاربری', ref_id: 'TX-102938', created_at: Date.now() - 86400000 * 2 }
    ] },
    '/api/notifications': { ok: true, notifications: [
      { id: 1, title: 'فرصت ورود پله‌ای به طلای ۱۸ عیار', body: 'قیمت در کف حمایتی قرار دارد. پله اول خرید توصیه می‌شود.', category: 'signal_buy', is_read: 0, created_at: Date.now() - 1800000 },
      { id: 2, title: 'به‌روزرسانی داده‌های بازار جهانی', body: 'شاخص S&P 500 و انس طلا به‌روزرسانی شدند.', category: 'system', is_read: 1, created_at: Date.now() - 7200000 }
    ] },
    '/api/admin/settings': { settings: { siteName: 'سرمایه‌یار', siteTagline: 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان',
        allowRegister: true, requireApproval: false, requireLogin: true, defaultTheme: 'dark', signalCount: 8, tickerItemCount: 12 },
      defaults: { siteName: 'سرمایه‌یار', siteTagline: '', allowRegister: true, requireApproval: false, requireLogin: true, allowGuest: false, defaultTheme: 'dark', signalCount: 8, tickerItemCount: 12 } },
    '/api/admin/audit': { log: [
      { id: 3, user_id: 1, action: 'login', detail: 'ورود موفق: demo@sarmayeyar.ir', ip: '127.0.0.1', created_at: Date.now() - 60000 },
      { id: 2, user_id: 0, action: 'register', detail: 'ثبت‌نام: ali@example.com', ip: '127.0.0.1', created_at: Date.now() - 86400000 },
      { id: 1, user_id: 1, action: 'install', detail: 'نصب کامل شد', ip: '127.0.0.1', created_at: Date.now() - 86400000 * 20 } ] },
    '/api/admin/ai-usage': { usage: [
      { id: 2, user_id: 1, email: 'demo@sarmayeyar.ir', model: 'gpt-4o-mini', status: 'ok', ms: 3100, created_at: Date.now() - 120000 },
      { id: 1, user_id: 1, email: 'demo@sarmayeyar.ir', model: 'gpt-4o-mini', status: 'ok', ms: 3300, created_at: Date.now() - 3600000 } ] },
    '/api/admin/tools': { ok: true, message: 'نسخهٔ پیش‌نمایش: ابزارها فقط روی سرور اجرا می‌شوند.' },
    '/api/admin/user/reset-password': { ok: true, tempPassword: 'sy-demo01' },
    '/api/auto-invest/positions': { ok: true, positions: [] },
    '/api/auto-invest': { ok: true, message: 'معامله خودکار با موفقیت در پرتفوی ثبت و اجرا شد 🎉' },
    '/api/auto-invest/close': { ok: true, message: 'معامله خودکار با موفقیت بسته شد و مبلغ به کیف‌پول واریز گردید 🎉', balance: 350000 },
    '/api/wallet/crypto-invoice': { ok: true, invoiceId: 'INV-CRYPTO-9482', amountToman: 100000, usdtAmount: 1.05, tetherRate: 95000, currency: 'USDT', network: 'TRC20', address: 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF', instructions: 'مبلغ ۱.۰۵ تتر به آدرس فوق واریز شود.' },
    '/api/wallet/crypto-deposit': { ok: true, message: 'درخواست واریز رمزارزی با موفقیت ثبت شد و پس از بررسی ادمین شارژ خواهد شد ⏳' },
    '/api/wallet/withdraw': { ok: true, message: 'درخواست تسویه با موفقیت ثبت شد و در سیکل پایا واریز خواهد شد 💳', balance: 300000 },
    '/api/wallet/financial-history': { ok: true, crypto_deposits: [
      { id: 1, amount_toman: 150000, amount_usdt: 1.58, network: 'TRC20', txid: '8b7f3a9e2c1d045829aefb2319047218392182049182301928310', status: 'pending', created_at: Date.now() - 3600000 * 2 }
    ], withdrawals: [
      { id: 1, amount: 50000, account_holder: 'کاربر نمایشی', bank_name: 'بانک سامان', card_number: '6219861012345678', sheba: 'IR120120000000001234567890', tracking_code: null, status: 'pending', created_at: Date.now() - 3600000 * 3 }
    ] },
    '/api/admin/financial/requests': { ok: true, crypto_deposits: [
      { id: 1, user_id: 2, user_name: 'علی رضایی', email: 'ali@example.com', amount_toman: 150000, amount_usdt: 1.58, network: 'TRC20', txid: '8b7f3a9e2c1d045829aefb2319047218392182049182301928310', status: 'pending', created_at: Date.now() - 3600000 * 2 }
    ], withdrawals: [
      { id: 1, user_id: 2, user_name: 'علی رضایی', email: 'ali@example.com', amount: 50000, account_holder: 'علی رضایی', bank_name: 'بانک ملت', card_number: '6104337890123456', sheba: 'IR120120000000001234567890', tracking_code: null, status: 'pending', created_at: Date.now() - 3600000 * 3 }
    ] },
    '/api/admin/financial/crypto-approve': { ok: true, message: 'واریز تأیید و کیف‌پول کاربر شارژ شد ✓' },
    '/api/admin/financial/crypto-reject': { ok: true, message: 'درخواست واریز رد شد ✕' },
    '/api/admin/financial/withdraw-complete': { ok: true, message: 'درخواست تسویه با موفقیت ثبت شد ✓' },
    '/api/admin/financial/withdraw-reject': { ok: true, message: 'درخواست تسویه رد و مبلغ به کیف‌پول کاربر استرداد شد ✕' },
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
    const q = (search || '').replace(/^\\?/, '');
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

  const snapshotResponse = (path, search, method, init) => {
    if (path === '/api/auto-invest' && method === 'POST') {
      let b = {};
      try { b = JSON.parse((init && init.body) || '{}'); } catch (e) {}
      const amt = Number(b.amount || 100000);
      const step1Amt = Math.round(amt * 0.5);
      const step2Amt = amt - step1Amt;
      const ref = 'AI-' + (b.assetId || 'ASSET').toUpperCase().replace(/[^A-Z0-9]/g, '') + Math.floor(1000 + Math.random() * 9000);
      const pos = {
        id: Date.now(),
        ref_id: ref,
        asset_id: b.assetId || 'c_btc',
        asset_name: b.name || 'دارایی انتخابی',
        asset_cls: b.cls || 'crypto',
        total_amount: amt,
        step1_amount: step1Amt,
        step1_price: b.step1Price || 1000,
        step1_status: 'executed',
        step1_time: Date.now(),
        step2_amount: step2Amt,
        step2_price: b.step2Price || (b.step1Price * 0.96),
        step2_status: 'pending_limit',
        stop_loss: b.stopLoss || (b.step1Price * 0.935),
        target1: b.target1 || (b.step1Price * 1.08),
        target2: b.target2 || (b.step1Price * 1.15),
        current_price: b.step1Price || 1000,
        pnl_percent: 0,
        pnl_amount: 0,
        status: 'active',
        created_at: Date.now(),
        actions_log: [
          { time: Date.now(), type: 'start', icon: '🚀', title: 'راه‌اندازی ربات معامله‌گر و تخصیص سرمایه', text: `تخصیص ${amt.toLocaleString('fa-IR')} تومان به معامله خودکار روی ${b.name || 'دارایی'} (شناسه: ${ref})` },
          { time: Date.now(), type: 'step1_buy', icon: '🟢', title: 'اجرای خرید فوری پله اول (۵۰٪)', text: `خرید فوری ${step1Amt.toLocaleString('fa-IR')} تومان در قیمت جاری ${(b.step1Price||0).toLocaleString('fa-IR')}` },
          { time: Date.now(), type: 'step2_limit', icon: '⏳', title: 'ثبت سفارش لیمیت پله دوم در کف حمایتی (۵۰٪)', text: `ثبت سفارش شرطی خرید ${step2Amt.toLocaleString('fa-IR')} تومان در نقطه حمایتی ${(b.step2Price||0).toLocaleString('fa-IR')}` },
          { time: Date.now(), type: 'risk_setup', icon: '🛡️', title: 'تنظیم خودکار حد ضرر و تارگت‌ها', text: `حد ضرر فعال روی ${(b.stopLoss||0).toLocaleString('fa-IR')} | تارگت اول: ${(b.target1||0).toLocaleString('fa-IR')} | تارگت دوم: ${(b.target2||0).toLocaleString('fa-IR')}` }
        ]
      };
      if (!DEMO['/api/auto-invest/positions']) DEMO['/api/auto-invest/positions'] = { ok: true, positions: [] };
      DEMO['/api/auto-invest/positions'].positions.unshift(pos);
      DEMO_USER.wallet_balance = Math.max(0, (DEMO_USER.wallet_balance || 350000) - amt);
      return new Response(JSON.stringify({ ok: true, message: `معامله خودکار روی ${b.name || 'دارایی'} با موفقیت در پرتفوی ثبت و اجرا شد 🎉`, balance: DEMO_USER.wallet_balance, position: pos }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/auto-invest/close' && method === 'POST') {
      let b = {};
      try { b = JSON.parse((init && init.body) || '{}'); } catch (e) {}
      if (DEMO['/api/auto-invest/positions'] && DEMO['/api/auto-invest/positions'].positions) {
        const found = DEMO['/api/auto-invest/positions'].positions.find(p => String(p.id) === String(b.id) || String(p.ref_id) === String(b.refId));
        if (found) {
          found.status = 'closed';
          DEMO_USER.wallet_balance = (DEMO_USER.wallet_balance || 0) + (found.total_amount || 100000) + (found.pnl_amount || 0);
        }
      }
      return new Response(JSON.stringify({ ok: true, message: 'معامله با موفقیت بسته شد و مبلغ به کیف‌پول واریز گردید 🎉', balance: DEMO_USER.wallet_balance }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/admin/roles') {
      let currentRoles = DEMO['/api/admin/roles'].roles;
      try {
        const saved = localStorage.getItem('sy_custom_roles');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length) currentRoles = parsed;
        }
      } catch (e) {}
      if (method === 'GET') {
        return new Response(JSON.stringify({ ok: true, roles: currentRoles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'POST') {
        let b = {};
        try { b = JSON.parse((init && init.body) || '{}'); } catch (e) {}
        if (b.is_default) currentRoles.forEach(r => { r.is_default = false; });
        const idx = currentRoles.findIndex(r => (b.id && Number(r.id) === Number(b.id)) || r.slug === b.slug);
        if (idx >= 0) {
          currentRoles[idx] = Object.assign(currentRoles[idx], {
            slug: b.slug,
            title: b.title,
            description: b.description || '',
            is_default: !!b.is_default,
            permissions: b.permissions || {}
          });
        } else {
          const newId = Math.max(0, ...currentRoles.map(r => Number(r.id) || 0)) + 1;
          currentRoles.push({
            id: newId,
            slug: b.slug,
            title: b.title,
            description: b.description || '',
            is_default: !!b.is_default,
            users_count: 0,
            permissions: b.permissions || {}
          });
        }
        DEMO['/api/admin/roles'].roles = currentRoles;
        try { localStorage.setItem('sy_custom_roles', JSON.stringify(currentRoles)); } catch (e) {}
        return new Response(JSON.stringify({ ok: true, roles: currentRoles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'DELETE') {
        const idMatch = (search || '').match(/id=(\\d+)/);
        const delId = idMatch ? Number(idMatch[1]) : 0;
        currentRoles = currentRoles.filter(r => Number(r.id) !== delId);
        DEMO['/api/admin/roles'].roles = currentRoles;
        try { localStorage.setItem('sy_custom_roles', JSON.stringify(currentRoles)); } catch (e) {}
        return new Response(JSON.stringify({ ok: true, roles: currentRoles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (path === '/api/admin/ui-settings' && method === 'POST') {
      let b = {};
      try { b = JSON.parse((init && init.body) || '{}'); } catch (e) {}
      return new Response(JSON.stringify({ ok: true, message: 'تنظیمات ظاهر، منوها، دکمه‌ها و دسترسی‌ها با موفقیت ذخیره و اعمال شد ✨', data: b }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (path === '/api/admin/ui-settings/reset' && method === 'POST') {
      return new Response(JSON.stringify({ ok: true, message: 'تمامی تنظیمات ظاهر، منوها و دکمه‌ها به حالت اولیه کارخانه بازگردانده شد 🔄' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

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

    if (isFile || !orig) { return Promise.resolve(snapshotResponse(parsed.path, parsed.search, method, init)); }

    return orig(input, init).then((res) => {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok && ct.indexOf('application/json') < 0) {
        return snapshotResponse(parsed.path, parsed.search, method, init);
      }
      return res;
    }, () => snapshotResponse(parsed.path, parsed.search, method, init));
  };

  window.addEventListener('DOMContentLoaded', function () {
    const r = document.getElementById('demoRibbon');
    if (r) { r.style.display = (isFile || window.__SNAPSHOT_MODE__) ? 'block' : 'none'; }
  });
})();
"""
shim = shim.replace('__DEMO_DATA__', demo)

html = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', html)
html = re.sub(r'<link href="https://fonts\.googleapis\.com[^>]*>\s*', '', html)
html = html.replace('<link rel="stylesheet" href="styles.css" />', f"<style>\n{font_css}\n{css}\n</style>")
html = html.replace('<script src="app.js"></script>', f"<script>{shim}</script>\n<script>{js}</script>")
html = html.replace('<div id="toast"', '<div id="demoRibbon" style="display:none;position:fixed;bottom:10px;inset-inline-start:10px;z-index:9999;background:rgba(124,58,237,.9);color:#fff;font:12px Vazirmatn,Tahoma,sans-serif;padding:6px 11px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.35)">نسخهٔ خودکفا — نمایش با اسنپ‌شات دادهٔ واقعی</div><div id="toast"')

targets = [
    os.path.join(BASE, 'public/index.html'),
    os.path.join(BASE, 'preview/sarmayeyar-preview.html')
]

for t in targets:
    os.makedirs(os.path.dirname(t), exist_ok=True)
    with open(t, 'w', encoding='utf-8') as f:
        f.write(html)
    size_kb = round(os.path.getsize(t) / 1024)
    print(f"✅ {t}  ({size_kb} کیلوبایت)")

print("   این فایل هم با دابل‌کلیک (بدون سرور) و هم روی هاست (داده زنده) کار می‌کند.")
