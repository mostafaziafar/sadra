#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سرمایه‌یار — کلاینت خط فرمان (پایتون)
  python3 tools/sarmayeyar.py --check                 بررسی سلامت نصب (بدون نیاز به سرور)
  python3 tools/sarmayeyar.py --url http://site/      گزارش بازار از سایت در حال اجرا
  python3 tools/sarmayeyar.py --signals --count 8     نمایش سیگنال‌های خودکار
  python3 tools/sarmayeyar.py --portfolio             وضعیت پرتفوی و شکاف‌ها
  python3 tools/sarmayeyar.py --watch 60              پایش دوره‌ای (هر ۶۰ ثانیه)

فقط با کتابخانه استاندارد پایتون کار می‌کند (بدون pip install).
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RESET, BOLD, DIM = "\033[0m", "\033[1m", "\033[2m"
GREEN, RED, YELLOW, CYAN = "\033[32m", "\033[31m", "\033[33m", "\033[36m"


def http_json(url: str, method: str = "GET", payload=None, timeout: int = 60):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fmt(n, d=0):
    if n is None:
        return "—"
    try:
        return f"{float(n):,.{d}f}"
    except (TypeError, ValueError):
        return str(n)


def pct(x, d=1):
    if x is None:
        return "—"
    try:
        v = float(x) * 100
    except (TypeError, ValueError):
        return str(x)
    color = GREEN if v > 0 else (RED if v < 0 else DIM)
    return f"{color}{v:+.{d}f}%{RESET}"


def line(char="-", n=74):
    print(DIM + char * n + RESET)


# --------------------------------------------------------------- --check
def run_check():
    print(f"{BOLD}بررسی سلامت نصب سرمایه‌یار (PHP){RESET}")
    line()
    ok = True
    required = [
        ("index.php", os.path.isfile(os.path.join(BASE, "index.php"))),
        ("install.php", os.path.isfile(os.path.join(BASE, "install.php"))),
        ("inc/universe_data.php", os.path.isfile(os.path.join(BASE, "inc/universe_data.php"))),
        ("public/index.html", os.path.isfile(os.path.join(BASE, "public", "index.html"))),
        ("public/app.js", os.path.isfile(os.path.join(BASE, "public", "app.js"))),
        ("tools/cron-warm.php", os.path.isfile(os.path.join(BASE, "tools", "cron-warm.php"))),
    ]
    for name, exists in required:
        print(f"  {'✅' if exists else '❌'} {name}")
        ok = ok and exists

    data_dir = os.path.join(BASE, "data")
    if os.path.isdir(data_dir):
        writable = os.access(data_dir, os.W_OK)
        files = [f for f in os.listdir(data_dir) if f.endswith(".json")]
        print(f"  {'✅' if writable else '❌'} پوشه data — قابل نوشتن: {'بله' if writable else 'خیر'} | فایل‌ها: {', '.join(files) or 'خالی'}")
        store = os.path.join(data_dir, "store.json")
        if os.path.isfile(store):
            try:
                with open(store, encoding="utf-8") as f:
                    s = json.load(f)
                ai = s.get("ai", {})
                prof = s.get("profile", {})
                print(f"    • کلید API: {'ثبت شده' if ai.get('apiKey') else 'ثبت نشده'} | پرووایدر: {ai.get('provider')} | مدل: {ai.get('model')}")
                print(f"    • پروفایل: ریسک {prof.get('risk')} | افق {prof.get('horizon')} | دارایی‌ها: {len(s.get('portfolio', []))}")
            except Exception as e:  # noqa
                print(f"    ❌ خواندن store.json ناموفق: {e}")
                ok = False
    else:
        print("  ℹ️  پوشه data وجود ندارد؛ با اولین اجرا ساخته می‌شود (یا install.php را اجرا کنید).")

    assets_dir = os.path.join(BASE, "assets")
    csv = [f for f in os.listdir(assets_dir)] if os.path.isdir(assets_dir) else []
    print(f"  {'✅' if csv else 'ℹ️ '} پوشه assets — {len(csv)} فایل CSV")

    cache = os.path.join(data_dir, "cache.json")
    if os.path.isfile(cache):
        try:
            with open(cache, encoding="utf-8") as f:
                c = json.load(f)
            snap = c.get("market:snapshot", {}).get("v")
            if snap:
                age = (time.time() * 1000 - c["market:snapshot"]["t"]) / 1000
                counts = snap.get("counts", {})
                print(f"  ✅ snapshot بازار: {counts.get('ok')} دارایی | عمر: {age:.0f} ثانیه | وضعیت: {snap.get('status')}")
            else:
                print("  ℹ️  snapshot بازار هنوز ساخته نشده (سایت را باز کنید یا cron را اجرا کنید).")
        except Exception as e:  # noqa
            print(f"  ❌ خواندن cache.json ناموفق: {e}")
            ok = False

    line()
    print(f"  نتیجه: {'✅ سالم' if ok else '❌ ناقص — به پیام‌های بالا نگاه کنید'}")
    print(f"  اجرای سرور تست: {CYAN}cd {BASE} && php -S 0.0.0.0:8000 index.php{RESET}")
    return 0 if ok else 1


# --------------------------------------------------------------- گزارش‌ها
def fetch(url, path):
    return http_json(url.rstrip("/") + path)


def show_market(url, top=12):
    print(f"{BOLD}گزارش بازار — {url}{RESET}")
    m = fetch(url, "/api/health")
    snapped = m.get("market", {})
    print(f"  وضعیت: {snapped.get('status')} | به‌روزرسانی: {datetime.fromtimestamp((snapped.get('updatedAt') or 0) / 1000):%Y-%m-%d %H:%M}")
    line()
    data = fetch(url, "/api/market?ensure=0")
    for a in data.get("assets", [])[:top]:
        mt = a.get("metrics", {})
        print(f"  {a['name'][:34]:<34} {fmt(mt.get('last'), 2):>14}  {pct(mt.get('dayChangePct'), 2):>10}  "
              f"opp={mt.get('oppScore'):>3} lag={mt.get('lagScore'):>3}  {mt.get('signal')}")


def show_signals(url, count=8):
    d = fetch(url, f"/api/signals?count={count}")
    print(f"{BOLD}سیگنال‌های خودکار{RESET}  (تولید: {datetime.now():%H:%M:%S})")
    line()
    pf = d.get("portfolio", {})
    rate = pf.get("rate") or 0
    print(f"  پرتفوی: {fmt(pf.get('totalToman'), 0)} تومان | مبنای مدل: {fmt(pf.get('baseToman'), 0)} | دلار: {fmt(rate, 0)}")
    line()
    for s in d.get("signals", []):
        print(f"  #{s['rank']} {s['name'][:30]:<30} {s['signal']:<24} opp={s['oppScore']:>3} fit={s['fitScore']:>3} "
              f"تخصیص={s['suggestedPct']}%  ({'ایران' if s['region'] == 'iran' else 'جهانی'})")
        lv = s.get("levels", {})
        print(f"     ورود {fmt(lv.get('entryLow'), 2)} – {fmt(lv.get('entryHigh'), 2)} | حد ضرر {fmt(lv.get('stop'), 2)} | "
              f"هدف۱ {fmt(lv.get('target1'), 2)} | هدف۲ {fmt(lv.get('target2'), 2)}")
        for reason in s.get("reasons", [])[:2]:
            print(f"     • {reason}")
    if d.get("signals"):
        total = sum(x["suggestedPct"] for x in d["signals"])
        print(f"\n  جمع تخصیص پیشنهادی: {total:.1f}% از نقد قابل سرمایه‌گذاری")


def show_portfolio(url):
    d = fetch(url, "/api/portfolio")
    a = d.get("analysis", {})
    print(f"{BOLD}پرتفوی و شکاف تخصیص{RESET}")
    line()
    print(f"  ارزش کل: {fmt(a.get('totalToman'), 0)} تومان | دارایی پایه: {fmt(a.get('anchorToman'), 0)} | "
          f"مبنای مدل: {fmt(a.get('baseToman'), 0)} | نرخ دلار: {fmt(a.get('rate'), 0)}")
    line()
    for g in a.get("gaps", []):
        bar = "█" * max(0, min(28, int(abs(g["gap"]) * 1.4)))
        color = YELLOW if g["gap"] > 3 else (RED if g["gap"] < -3 else DIM)
        print(f"  {g['clsFa'][:22]:<22} فعلی {g['current']:>5}%  هدف {g['target']:>5}%  "
              f"{color}شکاف {g['gap']:>+6}{RESET} {bar}")
    dep = a.get("deploy", [])
    if dep:
        print(f"\n  تخصیص نقد ({fmt(a.get('investable'), 0)} تومان):")
        for d2 in dep:
            print(f"    → {d2['clsFa'][:24]:<24} {fmt(d2['amountToman'], 0):>16} تومان  ({d2['gap']:+.1f} کمبود)")


def watch_loop(url, seconds, count):
    try:
        while True:
            os.system("clear" if os.name != "nt" else "cls")
            show_signals(url, count)
            print(f"\n{DIM}پایش فعال — هر {seconds} ثانیه به‌روزرسانی می‌شود. Ctrl+C برای خروج.{RESET}")
            time.sleep(seconds)
    except KeyboardInterrupt:
        print("\nخروج.")


def main():
    ap = argparse.ArgumentParser(description="کلاینت خط فرمان سرمایه‌یار")
    ap.add_argument("--url", default=os.environ.get("SARMAYEYAR_URL", "http://localhost:8000"), help="آدرس سایت")
    ap.add_argument("--check", action="store_true", help="بررسی سلامت نصب (بدون سرور)")
    ap.add_argument("--market", action="store_true", help="گزارش بازار")
    ap.add_argument("--signals", action="store_true", help="سیگنال‌های خودکار")
    ap.add_argument("--portfolio", action="store_true", help="پرتفوی و شکاف‌ها")
    ap.add_argument("--watch", type=int, metavar="SEC", help="پایش دوره‌ای")
    ap.add_argument("--count", type=int, default=8, help="تعداد سیگنال")
    args = ap.parse_args()

    if args.check:
        return run_check()
    try:
        if args.watch:
            watch_loop(args.url, args.watch, args.count); return 0
        if args.market:
            show_market(args.url); return 0
        if args.signals:
            show_signals(args.url, args.count); return 0
        if args.portfolio:
            show_portfolio(args.url); return 0
        show_market(args.url)
        print()
        show_signals(args.url, args.count)
        return 0
    except urllib.error.URLError as e:
        print(f"{RED}اتصال به {args.url} ناموفق بود: {e.reason}{RESET}")
        print("اگر سرور اجرا نیست:  cd <پوشه پروژه> && php -S 0.0.0.0:8000 index.php")
        return 2


if __name__ == "__main__":
    sys.exit(main())
