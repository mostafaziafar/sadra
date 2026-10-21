#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
شبیه‌ساز مدل هوش مصنوعی (سازگار با OpenAI) — برای تست و دمو بدون کلید API

اجرا:  python3 tools/mock_ai_server.py            (پیش‌فرض پورت 4000)
سپس در «تنظیمات هوش مصنوعی» یا install.php:
    پرووایدر: سفارشی (سازگار با OpenAI) | Base URL: http://127.0.0.1:4000/v1 | کلید: هر مقدار

خروجی این سرور شبیه‌سازی است (بر پایه داده واقعی همین لحظهٔ پرامپت) و هوش مصنوعی واقعی نیست.
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
MODELS = ["mock-gpt-5-turbo", "mock-4.1-large", "mock-claude-4-sonnet",
          "mock-gemini-2.5-flash", "mock-embedding-3-small", "mock-whisper-1"]


def build_analysis(prompt: str) -> dict:
    ids = list(dict.fromkeys(re.findall(r'"id":"([a-z0-9_]+)"', prompt)))
    ids = [i for i in ids if re.match(r'^(ir_|g_|c_)', i)]
    names = dict(re.findall(r'"id":"([a-z0-9_]+)","name":"([^"]+)"', prompt))
    prices = {m[0]: float(m[1]) for m in
              re.findall(r'"id":"([a-z0-9_]+)","name":"[^"]+","cls":"[a-z]+","region":"[a-z]+","unit":"[^"]+","price":([\d.]+)', prompt)}

    def price(pid, factor):
        p = prices.get(pid)
        if not p:
            return None
        v = p * factor
        return round(v, 2) if v >= 100 else round(v, 4)

    chosen = [ids[i] for i in (0, 1, 3, 6, 9) if i < len(ids)]
    opps = []
    for i, pid in enumerate(chosen):
        opps.append({
            "assetId": pid,
            "title": f"فرصت {i + 1}: {names.get(pid, pid)} در ناحیه جذاب",
            "direction": "خرید پله‌ای" if i != 1 else "رصد",
            "horizon": "کوتاه‌مدت" if i == 2 else "میان‌مدت",
            "confidence": 70 - i * 4,
            "oppScore": 80 - i * 3,
            "entry": f"{price(pid, 0.975)} تا {price(pid, 1.005)}",
            "stop": f"{price(pid, 0.93)}",
            "targets": [f"{price(pid, 1.07)}", f"{price(pid, 1.16)}"],
            "allocationPct": max(2, 12 - i * 2),
            "whyLaggard": "عملکرد نسبی ضعیف‌تر از هم‌گروهی‌ها در یک ماه گذشته همراه با فاصله از سقف ۵۲ هفته.",
            "rationale": ["فاصله از سقف ۵۲ هفته و میانگین ۲۰۰ روزه",
                          "کشش بازگشتی بر پایه انحراف‌معیار بازده یک‌ماهه",
                          "حفظ ساختار روند بلندمدت"],
            "risks": ["نوسان بالای کوتاه‌مدت", "ریسک خبری/سیاستی"],
            "invalidation": "بسته‌شدن روزانه زیر حد ضرر همراه با افزایش نوسان.",
        })
    return {
        "summary": "این یک تحلیل نمونه (شبیه‌ساز) است که از داده زندهٔ همین لحظه ساخته شده؛ برای تحلیل واقعی، کلید API یکی از سرویس‌های هوش مصنوعی را در تنظیمات ثبت کنید. تصویر کلی: بازارها در روند صعودی با اصلاح‌های کوتاه‌مدت‌اند و ارزش نسبی در دارایی‌هایی است که از هم‌گروهی‌های خود عقب مانده‌اند.",
        "regime": "دارایی‌های تومانی در سقف تاریخی‌اند؛ اما بر حسب دلار بخشی از بازار (طلا، بورس تهران) ۲۰٪+ زیر سقف ۵۲ هفته است که نقطه اصلی عقب‌ماندگی واقعی است.",
        "allocation": [
            {"cls": "gold", "targetPct": 20, "action": "افزایش تدریجی", "reason": "پوشش تورم و عقب‌ماندگی دلاری"},
            {"cls": "iranEq", "targetPct": 15, "action": "افزایش", "reason": "بازده دلاری ضعیف بورس تهران"},
            {"cls": "crypto", "targetPct": 8, "action": "نگهداری", "reason": "نوسان بالا؛ سهم را در محدوده هدف نگه دارید"},
            {"cls": "fixedInc", "targetPct": 20, "action": "کاهش", "reason": "بازده واقعی منفی در برابر تورم"},
        ],
        "opportunities": opps,
        "rebalance": [{"from": "fixedInc", "to": "gold", "pct": 5, "note": "انتقال تدریجی از درآمد ثابت به دارایی سخت"}],
        "watchlist": [{"assetId": i, "why": "نزدیک ناحیه حمایت میانگین ۲۰۰ روزه؛ در صورت تثبیت، ورود پله‌ای."} for i in ids[20:23]],
        "marketRisks": ["ریسک جهش نرخ ارز و سیاست‌های جدید", "خطر اصلاح بازارهای جهانی در صورت افزایش VIX", "ریسک نقدشوندگی در بازارهای کوچک"],
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/v1/models"):
            self._send(200, {"object": "list", "data": [{"id": m, "object": "model", "owned_by": "demo"} for m in MODELS]})
        else:
            self._send(404, {"error": {"message": "not found"}})

    def do_POST(self):
        if not self.path.startswith("/v1/chat/completions"):
            return self._send(404, {"error": {"message": "not found"}})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            payload = {}
        text = "\n".join((m.get("content") or "") for m in payload.get("messages", []))
        model = payload.get("model") or MODELS[0]
        if "JSON معتبر" in text:
            content = "```json\n" + json.dumps(build_analysis(text), ensure_ascii=False, indent=2) + "\n```"
        else:
            content = ("## پاسخ نمونه شبیه‌ساز\nاین پاسخ از سرویس شبیه‌ساز تولید شده است (هوش مصنوعی واقعی نیست).\n\n"
                       "- داده بازار لحظه‌ای در دسترس این صفحه است.\n- برای پاسخ واقعی، کلید API سرویس خود را ثبت کنید.\n\n"
                       "| مورد | وضعیت |\n|---|---|\n| اتصال | ✅ برقرار |\n| داده | ✅ زنده |")
        self._send(200, {
            "id": "chatcmpl-demo", "object": "chat.completion", "model": model,
            "created": int(__import__("time").time()),
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": len(text) // 4, "completion_tokens": 800, "total_tokens": len(text) // 4 + 800},
        })


if __name__ == "__main__":
    print(f"شبیه‌ساز هوش مصنوعی روی http://0.0.0.0:{PORT}/v1 آماده است", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
