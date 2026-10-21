# سرور پیش‌نمایش محلی (dev)

اجرای کامل برنامهٔ PHP «سرمایه‌یار» بدون نصب PHP روی سیستم، با استفاده از
[php-wasm](https://github.com/WordPress/wordpress-playground) — مناسب برای
دیدن و تست تغییرات در همین محیط.

## راه‌اندازی

```bash
cd dev
npm install
```

## اجرا

```bash
node dev/preview-server.mjs          # http://localhost:9000
PORT=9000 node dev/preview-server.mjs
DOCROOT=./sarmayeyar node dev/preview-server.mjs
```

سرور روی `0.0.0.0` گوش می‌دهد و مثل `.htaccess` پروژه رفتار می‌کند:

| درخواست | نتیجه |
|---|---|
| فایل واقعی (`.php` یا استاتیک) | همان فایل اجرا/سرو می‌شود |
| هر مسیر دیگر | به `index.php` (روتر برنامه) فرستاده می‌شود |

هدر `X-Frame-Options` حذف می‌شود تا صفحه داخل iframe پیش‌نمایش باز شود.

## نصب برنامه (بدون مرورگر)

```bash
cd sarmayeyar
php tools/install-cli.php --no-warm   # یا ویزارد /install.php
```

حساب پیش‌فرض مدیر: `admin@gmail.com` / `11111111admin`

> فایل‌های تولیدشده (`data/*.sqlite`، `config.php`) در `.gitignore` هستند.
