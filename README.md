# sadra

پروژهٔ **سرمایه‌یار** — پلتفرم سیگنال و فرصت سرمایه‌گذاری (بازار ایران و جهان) با PHP خالص + JS، بدون فریم‌ورک.

## ساختار

| مسیر | توضیح |
|---|---|
| `sarmayeyar/` | سورس کامل برنامه (نسخهٔ ۱.۳.۵) — نقطهٔ ورود `index.php` |
| `sarmayeyar/public/` | رابط کاربری (`index.html`, `styles.css`, `app.js`) |
| `sarmayeyar/inc/` | منطق بک‌اند (API، دیتابیس، موتور تحلیل، پنل مدیریت) |
| `sarmayeyar/data/` | دادهٔ بازار و دیتابیس SQLite (فایل‌های تولیدشده در `.gitignore`) |
| `dev/` | سرور پیش‌نمایش محلی بر پایهٔ php-wasm |
| `sarmayeyar-php-1.3.5.zip` | بستهٔ نصبی اصلی برای آپلود روی هاست |

## اجرای محلی

```bash
cd dev && npm install
node ../dev/preview-server.mjs      # → http://localhost:9000
```

راهنمای کامل: [`dev/README.md`](dev/README.md) — راهنمای نصب روی هاست: [`sarmayeyar/README.md`](sarmayeyar/README.md)
