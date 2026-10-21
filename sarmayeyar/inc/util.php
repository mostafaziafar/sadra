<?php
/**
 * توابع کمکی خالص (Pure Helpers)
 * همه‌ی توابع این فایل بدون عوارض جانبی‌اند: ورودی می‌گیرند و مقدار برمی‌گردانند.
 */
if (!defined('SARMAYEYAR')) exit;

function u_now_ms(): int { return (int) round(microtime(true) * 1000); }

function u_clamp01($x): float { return max(0.0, min(1.0, (float) $x)); }
function u_clamp($x, $min, $max): float { return max($min, min($max, (float) $x)); }

function to_clean_number($v): float {
    if ($v === null || $v === false || $v === '') return 0.0;
    if (is_int($v) || is_float($v)) return (float) $v;
    $str = strip_tags((string) $v);
    $persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '،'];
    $arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '،'];
    $en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ''];
    $str = str_replace($persian, $en, $str);
    $str = str_replace($arabic, $en, $str);
    $str = str_replace([',', '٬', ' '], '', $str);
    $str = preg_replace('/[^0-9.\-]/', '', $str);
    return is_numeric($str) ? (float) $str : 0.0;
}

/** تبدیل مقدار متنی/عددی بازار به عدد (حذف جداکننده‌ها و تگ‌های HTML) */
function u_num($v) {
    if ($v === null || $v === false || $v === '') return null;
    if (is_int($v) || is_float($v)) return (float) $v;
    $s = strip_tags((string) $v);
    $s = str_replace([',', '٬', ' ', "\u{200f}", "\u{200e}"], '', $s);
    $s = preg_replace('/[^0-9.\-]/u', '', $s);
    if ($s === '' || $s === '-' || $s === '.') return null;
    return (float) $s;
}

function u_strip_tags($v): string { return $v === null ? '' : trim(strip_tags((string) $v)); }

function u_mean(array $a): float {
    $n = count($a);
    if ($n === 0) return 0.0;
    $s = 0.0; foreach ($a as $x) $s += (float) $x;
    return $s / $n;
}

function u_stdev(array $a): float {
    $n = count($a);
    if ($n < 2) return 0.0;
    $m = u_mean($a); $s = 0.0;
    foreach ($a as $x) $s += ((float) $x - $m) ** 2;
    return sqrt($s / ($n - 1));
}

function u_median(array $a) {
    $a = array_values(array_filter($a, fn($x) => $x !== null && is_finite((float) $x)));
    if (!$a) return null;
    sort($a, SORT_NUMERIC);
    return $a[(int) floor(count($a) / 2)];
}

function u_sma(array $a, int $n) {
    if (count($a) < $n) return null;
    return u_mean(array_slice($a, -$n));
}

function u_slice_last(array $a, int $n): array { return array_slice($a, -$n); }

function u_json($data, int $flags = 0): string {
    return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | $flags);
}

function u_uuid(): string {
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

/** ادغام عمیق دو آرایه (برای patch کردن تنظیمات) — آرایه‌ی بازگشتی جدید است (بدون تغییر ورودی) */
function u_deep_merge($base, $patch) {
    if (!is_array($base) || !is_array($patch)) return $patch;
    if (array_is_list($base) || array_is_list($patch)) return $patch;
    $out = $base;
    foreach ($patch as $k => $v) {
        $out[$k] = array_key_exists($k, $base) ? u_deep_merge($base[$k], $v) : $v;
    }
    return $out;
}

function u_log(string $msg): void {
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
    @file_put_contents((store_paths()['dir'] ?? sys_get_temp_dir()) . '/sarmayeyar.log', $line, FILE_APPEND | LOCK_EX);
}

/** برچسب فارسی درصد — برای متن‌های سمت سرور (پرامپت هوش مصنوعی و دلایل) */
function u_pct_fa($x): string {
    if ($x === null || !is_finite((float) $x)) return '—';
    return number_format((float) $x * 100, 1, '.', '') . '%';
}

function u_num_fmt($v): string {
    if ($v === null || !is_finite((float) $v)) return '—';
    $n = (float) $v;
    $d = abs($n) >= 1000 ? 0 : (abs($n) >= 1 ? 2 : 4);
    return number_format($n, $d, '.', ',');
}
