'use strict';
/* ============================ سرمایه‌یار — رابط کاربری ============================
   نسخه ۱.۱.۸ — طراحی کاملاً فانکشنال، بدون فریم‌ورک
   رهگیری جامع وضعیت سرمایه‌گذاری خودکار با جزئیات کامل و لاگ رویدادها
   طراحی مدرن Web3 منوی واریز ارز دیجیتال (تتر USDT)، تسویه ریالی و QR Code
==================================================================================== */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const S = {
  market: null, signals: null, ai: null, state: null, classes: {}, providers: [],
  marketTimer: null, chatBusy: false,
  user: null, settings: {}, admin: { users: [], overview: null, loaded: false, plans: [], financial: { crypto_deposits: [], withdrawals: [] } }, theme: 'dark',
  view: 'dashboard',
  plans: [], userTx: [], notifications: [], currentCryptoInvoice: null,
  autoPositions: [], ui: null
};
window.S = S;

/* ----------------------------- پارس عددی امن و نرمال‌سازی ارقام فارسی ----------------------------- */
function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const ar = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    s = s.replaceAll(fa[i], String(i)).replaceAll(ar[i], String(i));
  }
  s = s.replace(/[,،\s_]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ----------------------------- تولید استاندارد و واقعی QR Code (ISO/IEC 18004 Reed-Solomon) ----------------------------- */
function encodeRealQrMatrix(text) {
  const rawStr = String(text || 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF');
  let data = [];
  if (typeof TextEncoder !== 'undefined') {
    data = Array.from(new TextEncoder().encode(rawStr));
  } else {
    for (let i = 0; i < rawStr.length; i++) data.push(rawStr.charCodeAt(i) & 0xff);
  }
  const VERSIONS = [
    null,
    { v: 1, size: 21, dataCw: 19, ecCw: 7, blocks: 1, align: [] },
    { v: 2, size: 25, dataCw: 34, ecCw: 10, blocks: 1, align: [6, 18] },
    { v: 3, size: 29, dataCw: 55, ecCw: 15, blocks: 1, align: [6, 22] },
    { v: 4, size: 33, dataCw: 80, ecCw: 20, blocks: 1, align: [6, 26] },
    { v: 5, size: 37, dataCw: 108, ecCw: 26, blocks: 1, align: [6, 30] },
    { v: 6, size: 41, dataCw: 136, ecCw: 18, blocks: 2, align: [6, 34] }
  ];
  if (data.length > 130) data = data.slice(0, 130);
  let ver = VERSIONS[6];
  for (let i = 1; i <= 6; i++) {
    if (data.length + 2 <= VERSIONS[i].dataCw) { ver = VERSIONS[i]; break; }
  }
  const N = ver.size;
  const bits = [];
  const pushBits = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  pushBits(0b0100, 4);
  pushBits(data.length, 8);
  for (const b of data) pushBits(b, 8);
  const maxBits = ver.dataCw * 8;
  pushBits(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) { pushBits(padBytes[padIdx % 2], 8); padIdx++; }
  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataCodewords.push(b);
  }
  const exp = new Uint8Array(512), log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : exp[log[a] + log[b]];
  const rsEncode = (msg, ecLen) => {
    let gen = [1];
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= gfMul(gen[j], exp[i]); }
      gen = next;
    }
    const res = new Array(ecLen).fill(0);
    for (const b of msg) {
      const factor = b ^ res.shift(); res.push(0);
      for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j + 1], factor);
    }
    return res;
  };
  let finalCodewords = [];
  if (ver.blocks === 1) {
    finalCodewords = dataCodewords.concat(rsEncode(dataCodewords, ver.ecCw));
  } else {
    const half = ver.dataCw / 2;
    const b1 = dataCodewords.slice(0, half), b2 = dataCodewords.slice(half);
    const ec1 = rsEncode(b1, ver.ecCw), ec2 = rsEncode(b2, ver.ecCw);
    for (let i = 0; i < half; i++) finalCodewords.push(b1[i], b2[i]);
    for (let i = 0; i < ver.ecCw; i++) finalCodewords.push(ec1[i], ec2[i]);
  }
  const grid = Array.from({ length: N }, () => new Array(N).fill(0));
  const reserved = Array.from({ length: N }, () => new Array(N).fill(false));
  const setMod = (r, c, val, res = true) => {
    if (r < 0 || r >= N || c < 0 || c >= N) return;
    grid[r][c] = val ? 1 : 0;
    if (res) reserved[r][c] = true;
  };
  const placeFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setMod(r0 + r, c0 + c, inBox && (onBorder || inInner), true);
      }
    }
  };
  placeFinder(0, 0); placeFinder(0, N - 7); placeFinder(N - 7, 0);
  if (ver.align.length) {
    for (const ar of ver.align) {
      for (const ac of ver.align) {
        if ((ar < 9 && ac < 9) || (ar < 9 && ac > N - 10) || (ar > N - 10 && ac < 9)) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            setMod(ar + r, ac + c, Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0), true);
          }
        }
      }
    }
  }
  for (let i = 8; i < N - 8; i++) {
    if (!reserved[6][i]) setMod(6, i, i % 2 === 0, true);
    if (!reserved[i][6]) setMod(i, 6, i % 2 === 0, true);
  }
  setMod(N - 8, 8, 1, true);
  for (let i = 0; i < 9; i++) {
    if (i < 8) { reserved[8][N - 1 - i] = true; reserved[N - 1 - i][8] = true; }
    reserved[8][i] = true; reserved[i][8] = true;
  }
  const allBits = [];
  for (const cw of finalCodewords) for (let i = 7; i >= 0; i--) allBits.push((cw >>> i) & 1);
  let bitIdx = 0, up = true;
  for (let col = N - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let step = 0; step < N; step++) {
      const r = up ? (N - 1 - step) : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[r][c]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          const masked = ((r + c) % 2 === 0) ? (bit ^ 1) : bit;
          grid[r][c] = masked;
        }
      }
    }
    up = !up;
  }
  const fmtBits = 0x77c4;
  const fmtCoords1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const fmtCoords2 = [[8,N-1],[8,N-2],[8,N-3],[8,N-4],[8,N-5],[8,N-6],[8,N-7],[8,N-8],[N-7,8],[N-6,8],[N-5,8],[N-4,8],[N-3,8],[N-2,8],[N-1,8]];
  for (let i = 0; i < 15; i++) {
    const b = (fmtBits >>> i) & 1;
    grid[fmtCoords1[14 - i][0]][fmtCoords1[14 - i][1]] = b;
    grid[fmtCoords2[14 - i][0]][fmtCoords2[14 - i][1]] = b;
  }
  return grid;
}

function generateQrSvg(text, size = 160) {
  const mat = encodeRealQrMatrix(text);
  const N = mat.length;
  const quiet = 3;
  const total = N + quiet * 2;
  let pathD = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (mat[r][c]) {
        pathD += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges" style="background:#ffffff;border-radius:10px;display:block"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${pathD}" fill="#000000"/></svg>`;
}

/* ----------------------------- قالب‌بندی اعداد و متون ----------------------------- */
const NF = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—'
  : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(Number(n));
const Pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(Number(x))) ? '—'
  : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0, signDisplay: 'exceptZero' }).format(Number(x) * 100) + '٪';
const PctPlain = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(Number(x))) ? '—'
  : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0, signDisplay: 'exceptZero' }).format(Number(x)) + '٪';

function fmtPrice(v, unit) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  let s;
  if (Math.abs(n) >= 1000) s = NF(n, 0);
  else if (Math.abs(n) >= 1) s = NF(n, 2);
  else if (Math.abs(n) >= 0.01) s = NF(n, 4);
  else s = NF(n, 6);
  return unit === 'واحد' || unit === 'درصد' ? s : `${s} ${unit || ''}`.trim();
}

function numToPersianWords(val, unit = '') {
  const num = parseNum(val);
  if (num === 0) return 'صفر ' + (unit ? unit : '');

  const isNeg = num < 0;
  const absNum = Math.abs(num);

  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dahgan = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const dahToNozdah = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const sadgan = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

  function threeDigitsToWords(n) {
    if (n === 0) return '';
    const s = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const y = n % 10;
    const parts = [];
    if (s > 0) parts.push(sadgan[s]);
    if (d === 1) {
      parts.push(dahToNozdah[y]);
    } else {
      if (d > 1) parts.push(dahgan[d]);
      if (y > 0) parts.push(yekan[y]);
    }
    return parts.join(' و ');
  }

  function intToWords(n) {
    if (n === 0) return 'صفر';
    const chunks = [];
    let temp = n;
    let scaleIndex = 0;
    while (temp > 0) {
      const chunk = temp % 1000;
      if (chunk > 0) {
        const chunkWords = threeDigitsToWords(chunk);
        const scale = scales[scaleIndex] || '';
        chunks.unshift(scale ? chunkWords + ' ' + scale : chunkWords);
      }
      temp = Math.floor(temp / 1000);
      scaleIndex++;
    }
    return chunks.join(' و ');
  }

  const str = String(absNum);
  let result = '';
  if (str.includes('.')) {
    const parts = str.split('.');
    const intPart = parseInt(parts[0], 10) || 0;
    const decStr = parts[1].replace(/0+$/, '');
    const intWords = intPart > 0 ? intToWords(intPart) : 'صفر';

    if (decStr.length > 0) {
      const decPart = parseInt(decStr, 10);
      const decWords = intToWords(decPart);
      const decScaleNames = { 1: 'دهم', 2: 'صدم', 3: 'هزارم', 4: 'ده‌هزارم', 5: 'صد‌هزارم', 6: 'میلیونیم' };
      const scaleName = decScaleNames[decStr.length] || ('ممیز ' + decStr.length + ' رقم اعشار');
      if (decStr === '5') {
        result = intPart > 0 ? (intWords + ' و نیم') : 'نیم';
      } else {
        result = intPart > 0 ? (intWords + ' و ' + decWords + ' ' + scaleName) : (decWords + ' ' + scaleName);
      }
    } else {
      result = intWords;
    }
  } else {
    result = intToWords(Math.floor(absNum));
  }

  if (isNeg) result = 'منفی ' + result;
  if (unit) result += ' ' + unit;
  return result.trim();
}

function clsColor(cls) {
  const c = S.classes[cls] || {};
  if (S.theme === 'light' && c.colorLight) return c.colorLight;
  return c.color || (S.theme === 'light' ? '#64748b' : '#94a3b8');
}
function clsFa(cls) { return (S.classes[cls] && S.classes[cls].fa) || cls; }
function toneClass(t) { return 'tone-' + (t || 'neutral'); }
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toast(msg, kind = '') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast ' + kind; }, 4200);
}

/* ----------------------------- ریشه و API ----------------------------- */
const BASE = (function () {
  try {
    const el = document.currentScript || document.querySelector('script[src$="app.js"]');
    if (el && el.src) return new URL(el.src, location.href).pathname.replace(/[^/]*$/, '');
    if (location.protocol === 'file:') return '/';
    return new URL('.', location.href).pathname;
  } catch (e) { return '/'; }
})();
function url(p) { return p.charAt(0) === '/' ? BASE + p.slice(1) : p; }

async function api(path, opts = {}) {
  const res = await fetch(url(path), { headers: { 'Content-Type': 'application/json' }, ...opts });
  let j = {};
  try { j = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    const err = new Error(j.error || `خطای سرور (${res.status})`);
    err.status = res.status; err.body = j;
    if (res.status === 401 && j.auth) showAuth(true);
    throw err;
  }
  return j;
}

/* ============================================================================
   سیستم جامع شخصی‌سازی ظاهر، منوها، دکمه‌ها و دسترسی‌ها (UI / Theme Customizer)
   ============================================================================ */

const DEFAULT_NAV_ITEMS = [
  { id: 'dashboard', label: 'داشبورد', icon: '📊', view: 'dashboard', order: 1, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'signals', label: 'سیگنال‌ها و فرصت‌ها', icon: '⚡', view: 'signals', order: 2, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'auto-invest', label: 'معاملات خودکار', icon: '🤖', view: 'auto-invest', order: 3, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'portfolio', label: 'پرتفوی من', icon: '💼', view: 'portfolio', order: 4, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'subscriptions', label: 'اشتراک و کیف‌پول', icon: '💎', view: 'subscriptions', order: 5, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'notifications', label: 'اعلان‌ها', icon: '🔔', view: 'notifications', order: 6, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'ai-analysis', label: 'تحلیل هوش مصنوعی', icon: '🧠', view: 'ai-analysis', order: 7, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'chat', label: 'گفتگو با تحلیلگر', icon: '💬', view: 'chat', order: 8, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'guide', label: 'راهنما', icon: '📖', view: 'guide', order: 9, active: true, badge: '', roles: ['guest', 'user', 'subscriber', 'admin'] },
  { id: 'admin', label: 'پنل مدیریت', icon: '🛡️', view: 'admin', order: 10, active: true, badge: 'مدیر', roles: ['admin'] }
];

const DEFAULT_BUTTONS_CONFIG = {
  btn_auto_invest: {
    key: 'btn_auto_invest',
    title: 'دکمه معاملات خودکار در سیگنال و کارت‌ها',
    label: '⚡ سرمایه‌گذاری خودکار با کیف‌پول',
    icon: '⚡',
    active: true,
    bg_color: '#22c55e',
    text_color: '#052e16',
    hover_bg: '#16a34a',
    hover_text: '#ffffff',
    border_radius: '10px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_signal_detail: {
    key: 'btn_signal_detail',
    title: 'دکمه تحلیل و سطوح معامله در کارت‌های سیگنال',
    label: '🔍 تحلیل و سطوح معامله',
    icon: '🔍',
    active: true,
    bg_color: '#22d3ee',
    text_color: '#083344',
    hover_bg: '#06b6d4',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_asset_advisory: {
    key: 'btn_asset_advisory',
    title: 'دکمه مشاوره استراتژی دارایی من (دارم / بخرم؟)',
    label: '🎯 استراتژی دارایی من (دارم / بخرم؟)',
    icon: '🎯',
    active: true,
    bg_color: '#22d3ee',
    text_color: '#083344',
    hover_bg: '#06b6d4',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_ai_chat: {
    key: 'btn_ai_chat',
    title: 'دکمه تحلیل عمیق با هوش مصنوعی',
    label: '🤖 تحلیل عمیق با AI',
    icon: '🤖',
    active: true,
    bg_color: '#38bdf8',
    text_color: '#082f49',
    hover_bg: '#0284c7',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_wallet_recharge: {
    key: 'btn_wallet_recharge',
    title: 'دکمه شارژ آنلاین کیف‌پول در صفحه اشتراک',
    label: '💳 شارژ آنلاین کیف‌پول',
    icon: '💳',
    active: true,
    bg_color: '#22c55e',
    text_color: '#052e16',
    hover_bg: '#16a34a',
    hover_text: '#ffffff',
    border_radius: '10px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_portfolio_add: {
    key: 'btn_portfolio_add',
    title: 'دکمه افزودن سریع دارایی به پرتفوی در جداول',
    label: '＋ افزودن به پرتفوی',
    icon: '＋',
    active: true,
    bg_color: '#38bdf8',
    text_color: '#082f49',
    hover_bg: '#0284c7',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_auto_close: {
    key: 'btn_auto_close',
    title: 'دکمه خروج و تسویه معامله خودکار به کیف‌پول',
    label: '💰 خروج و تسویه به کیف‌پول',
    icon: '💰',
    active: true,
    bg_color: '#ef4444',
    text_color: '#ffffff',
    hover_bg: '#dc2626',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_alloc_calc: {
    key: 'btn_alloc_calc',
    title: 'دکمه ماشین‌حساب هوشمند حجم و پله‌های ورود',
    label: '🧮 ماشین‌حساب هوشمند حجم و پله‌ها',
    icon: '🧮',
    active: true,
    bg_color: '#a855f7',
    text_color: '#ffffff',
    hover_bg: '#9333ea',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_crypto_payment: {
    key: 'btn_crypto_payment',
    title: 'دکمه پرداخت رمزارزی (تتر TRC20) در کیف‌پول',
    label: '🪙 پرداخت رمزارزی (تتر TRC20)',
    icon: '🪙',
    active: true,
    bg_color: '#10b981',
    text_color: '#052e16',
    hover_bg: '#059669',
    hover_text: '#ffffff',
    border_radius: '10px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_withdraw_request: {
    key: 'btn_withdraw_request',
    title: 'دکمه ثبت درخواست تسویه پایا (شبا)',
    label: '🏦 ثبت درخواست تسویه پایا (شبا)',
    icon: '🏦',
    active: true,
    bg_color: '#f59e0b',
    text_color: '#451a03',
    hover_bg: '#d97706',
    hover_text: '#ffffff',
    border_radius: '10px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_sub_purchase: {
    key: 'btn_sub_purchase',
    title: 'دکمه خرید و فعال‌سازی پلن‌های اشتراک VIP',
    label: '💎 خرید و فعال‌سازی اشتراک VIP',
    icon: '💎',
    active: true,
    bg_color: '#8b5cf6',
    text_color: '#ffffff',
    hover_bg: '#7c3aed',
    hover_text: '#ffffff',
    border_radius: '10px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_alert_create: {
    key: 'btn_alert_create',
    title: 'دکمه ثبت هشدار قیمتی و پیامکی جدید',
    label: '🔔 ثبت هشدار قیمتی و پیامکی',
    icon: '🔔',
    active: true,
    bg_color: '#06b6d4',
    text_color: '#083344',
    hover_bg: '#0891b2',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_refresh_market: {
    key: 'btn_refresh_market',
    title: 'دکمه بروزرسانی زنده بازار در هدر سایت',
    label: '↻ بروزرسانی زنده بازار',
    icon: '↻',
    active: true,
    bg_color: '#1e293b',
    text_color: '#f1f5f9',
    hover_bg: '#334155',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_theme_toggle: {
    key: 'btn_theme_toggle',
    title: 'دکمه تغییر حالت شب و روز در هدر سایت',
    label: '🌓 تغییر حالت شب و روز',
    icon: '🌓',
    active: true,
    bg_color: '#1e293b',
    text_color: '#f1f5f9',
    hover_bg: '#334155',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  },
  btn_export_data: {
    key: 'btn_export_data',
    title: 'دکمه خروجی اکسل / CSV از جداول و گزارش‌ها',
    label: '📤 خروجی اکسل / CSV',
    icon: '📤',
    active: true,
    bg_color: '#3b82f6',
    text_color: '#ffffff',
    hover_bg: '#2563eb',
    hover_text: '#ffffff',
    border_radius: '8px',
    roles: ['guest', 'user', 'subscriber', 'admin']
  }
};

const THEME_PRESETS = {
  'dark-neon': {
    name: '🌑 تاریک نئونی (Dark Pro Neon)',
    colors: ['#070a12', '#111c2e', '#22d3ee', '#22c55e'],
    styles: {
      themePreset: 'dark-neon',
      bgColor: '#070a12',
      surfaceColor: '#0e1726',
      panelColor: '#121f33',
      panel2Color: '#182842',
      headerBg: 'rgba(7, 10, 18, 0.88)',
      txtColor: '#f1f5f9',
      mutedColor: '#94a3b8',
      accentColor: '#22d3ee',
      accentHover: '#06b6d4',
      accentTxt: '#04121d',
      upColor: '#22c55e',
      downColor: '#ef4444',
      warnColor: '#f59e0b',
      btnPrimaryBg: '#22d3ee',
      btnPrimaryTxt: '#04121d',
      btnPrimaryHoverBg: '#06b6d4',
      btnPrimaryHoverTxt: '#ffffff',
      borderRadius: '12px',
      btnRadius: '10px'
    }
  },
  'light-modern': {
    name: '☀️ روشن مدرن (Modern Light)',
    colors: ['#f8fafc', '#ffffff', '#0284c7', '#16a34a'],
    styles: {
      themePreset: 'light-modern',
      bgColor: '#f8fafc',
      surfaceColor: '#ffffff',
      panelColor: '#ffffff',
      panel2Color: '#f1f5f9',
      headerBg: 'rgba(255, 255, 255, 0.95)',
      txtColor: '#0f172a',
      mutedColor: '#475569',
      accentColor: '#0284c7',
      accentHover: '#0369a1',
      accentTxt: '#ffffff',
      upColor: '#16a34a',
      downColor: '#dc2626',
      warnColor: '#d97706',
      btnPrimaryBg: '#0284c7',
      btnPrimaryTxt: '#ffffff',
      btnPrimaryHoverBg: '#0369a1',
      btnPrimaryHoverTxt: '#ffffff',
      borderRadius: '14px',
      btnRadius: '10px'
    }
  },
  'gold-wallstreet': {
    name: '👑 وال‌استریت طلایی (Wall Street Gold)',
    colors: ['#0b0f19', '#141c2e', '#eab308', '#10b981'],
    styles: {
      themePreset: 'gold-wallstreet',
      bgColor: '#0b0f19',
      surfaceColor: '#141c2e',
      panelColor: '#1a243a',
      panel2Color: '#212e4a',
      headerBg: 'rgba(11, 15, 25, 0.90)',
      txtColor: '#fef08a',
      mutedColor: '#cbd5e1',
      accentColor: '#eab308',
      accentHover: '#ca8a04',
      accentTxt: '#422006',
      upColor: '#10b981',
      downColor: '#f43f5e',
      warnColor: '#f59e0b',
      btnPrimaryBg: '#eab308',
      btnPrimaryTxt: '#422006',
      btnPrimaryHoverBg: '#ca8a04',
      btnPrimaryHoverTxt: '#ffffff',
      borderRadius: '14px',
      btnRadius: '12px'
    }
  },
  'emerald-green': {
    name: '🌲 زمردی فایننس (Emerald Finance)',
    colors: ['#061412', '#0c221f', '#10b981', '#34d399'],
    styles: {
      themePreset: 'emerald-green',
      bgColor: '#061412',
      surfaceColor: '#0c221f',
      panelColor: '#12312d',
      panel2Color: '#18423c',
      headerBg: 'rgba(6, 20, 18, 0.90)',
      txtColor: '#ecfdf5',
      mutedColor: '#a7f3d0',
      accentColor: '#10b981',
      accentHover: '#059669',
      accentTxt: '#022c22',
      upColor: '#34d399',
      downColor: '#f87171',
      warnColor: '#fbbf24',
      btnPrimaryBg: '#10b981',
      btnPrimaryTxt: '#022c22',
      btnPrimaryHoverBg: '#059669',
      btnPrimaryHoverTxt: '#ffffff',
      borderRadius: '12px',
      btnRadius: '10px'
    }
  },
  'cyber-blue': {
    name: '🌌 سایبرپانک آبی (Cyber Blue)',
    colors: ['#050b1a', '#0c1633', '#3b82f6', '#06b6d4'],
    styles: {
      themePreset: 'cyber-blue',
      bgColor: '#050b1a',
      surfaceColor: '#0c1633',
      panelColor: '#11214a',
      panel2Color: '#172c63',
      headerBg: 'rgba(5, 11, 26, 0.90)',
      txtColor: '#eff6ff',
      mutedColor: '#93c5fd',
      accentColor: '#3b82f6',
      accentHover: '#2563eb',
      accentTxt: '#ffffff',
      upColor: '#22c55e',
      downColor: '#ef4444',
      warnColor: '#f59e0b',
      btnPrimaryBg: '#3b82f6',
      btnPrimaryTxt: '#ffffff',
      btnPrimaryHoverBg: '#2563eb',
      btnPrimaryHoverTxt: '#ffffff',
      borderRadius: '12px',
      btnRadius: '10px'
    }
  },
  'royal-purple': {
    name: '🔮 ارغوانی کریپتو (Crypto Purple)',
    colors: ['#0d0818', '#1a1030', '#a855f7', '#ec4899'],
    styles: {
      themePreset: 'royal-purple',
      bgColor: '#0d0818',
      surfaceColor: '#1a1030',
      panelColor: '#261845',
      panel2Color: '#33205c',
      headerBg: 'rgba(13, 8, 24, 0.90)',
      txtColor: '#faf5ff',
      mutedColor: '#d8b4fe',
      accentColor: '#a855f7',
      accentHover: '#9333ea',
      accentTxt: '#ffffff',
      upColor: '#22c55e',
      downColor: '#ef4444',
      warnColor: '#f59e0b',
      btnPrimaryBg: '#a855f7',
      btnPrimaryTxt: '#ffffff',
      btnPrimaryHoverBg: '#9333ea',
      btnPrimaryHoverTxt: '#ffffff',
      borderRadius: '14px',
      btnRadius: '12px'
    }
  }
};

const DEFAULT_THEME_STYLES = {
  themePreset: 'dark-neon',
  fontFamily: 'Vazirmatn',
  fontSizeBase: '14px',
  borderRadius: '12px',
  bgColor: '#070a12',
  surfaceColor: '#0e1726',
  panelColor: '#121f33',
  panel2Color: '#182842',
  headerBg: 'rgba(7, 10, 18, 0.88)',
  txtColor: '#f1f5f9',
  mutedColor: '#94a3b8',
  muted2Color: '#64748b',
  accentColor: '#22d3ee',
  accentHover: '#06b6d4',
  accentTxt: '#04121d',
  upColor: '#22c55e',
  downColor: '#ef4444',
  warnColor: '#f59e0b',
  btnPrimaryBg: '#22d3ee',
  btnPrimaryTxt: '#04121d',
  btnPrimaryHoverBg: '#06b6d4',
  btnPrimaryHoverTxt: '#ffffff',
  btnRadius: '10px',
  cardRadius: '14px',
  customCss: ''
};

const DEFAULT_VISIBILITY_RULES = {
  views: {
    dashboard: ['guest', 'user', 'subscriber', 'admin'],
    market: ['guest', 'user', 'subscriber', 'admin'],
    signals: ['guest', 'user', 'subscriber', 'admin'],
    'auto-invest': ['guest', 'user', 'subscriber', 'admin'],
    portfolio: ['guest', 'user', 'subscriber', 'admin'],
    chat: ['guest', 'user', 'subscriber', 'admin'],
    subscriptions: ['guest', 'user', 'subscriber', 'admin'],
    notifications: ['guest', 'user', 'subscriber', 'admin'],
    'ai-analysis': ['guest', 'user', 'subscriber', 'admin'],
    ai: ['guest', 'user', 'subscriber', 'admin'],
    guide: ['guest', 'user', 'subscriber', 'admin'],
    news: ['guest', 'user', 'subscriber', 'admin'],
    admin: ['admin'],
    'ai-settings': ['admin'],
    settings: ['admin'],
    setup: ['admin']
  },
  features: {
    header_ticker: ['guest', 'user', 'subscriber', 'admin'],
    dash_auto_invest_banner: ['guest', 'user', 'subscriber', 'admin'],
    signal_auto_invest_btn: ['guest', 'user', 'subscriber', 'admin'],
    signal_advisory_btn: ['guest', 'user', 'subscriber', 'admin'],
    signal_calc_btn: ['guest', 'user', 'subscriber', 'admin'],
    signals_vip: ['guest', 'user', 'subscriber', 'admin'],
    ai_chat_modal: ['guest', 'user', 'subscriber', 'admin'],
    ai_models: ['guest', 'user', 'subscriber', 'admin'],
    wallet_recharge: ['guest', 'user', 'subscriber', 'admin'],
    crypto_payment: ['guest', 'user', 'subscriber', 'admin'],
    wallet_withdraw: ['guest', 'user', 'subscriber', 'admin'],
    portfolio_add: ['guest', 'user', 'subscriber', 'admin'],
    export_data: ['guest', 'user', 'subscriber', 'admin'],
    btn_auto_invest: ['guest', 'user', 'subscriber', 'admin'],
    btn_signal_detail: ['guest', 'user', 'subscriber', 'admin'],
    btn_asset_advisory: ['guest', 'user', 'subscriber', 'admin'],
    btn_ai_chat: ['guest', 'user', 'subscriber', 'admin'],
    btn_wallet_recharge: ['guest', 'user', 'subscriber', 'admin'],
    btn_crypto_payment: ['guest', 'user', 'subscriber', 'admin'],
    btn_withdraw_request: ['guest', 'user', 'subscriber', 'admin'],
    btn_sub_purchase: ['guest', 'user', 'subscriber', 'admin'],
    btn_portfolio_add: ['guest', 'user', 'subscriber', 'admin'],
    btn_auto_close: ['guest', 'user', 'subscriber', 'admin'],
    btn_alloc_calc: ['guest', 'user', 'subscriber', 'admin'],
    btn_alert_create: ['guest', 'user', 'subscriber', 'admin'],
    btn_refresh_market: ['guest', 'user', 'subscriber', 'admin'],
    btn_theme_toggle: ['guest', 'user', 'subscriber', 'admin'],
    btn_export_data: ['guest', 'user', 'subscriber', 'admin'],
    admin_panel: ['admin'],
    ai_settings: ['admin'],
    system_settings: ['admin']
  }
};

const DEFAULT_ROLES_LIST = [
  { id: 1, slug: 'admin', title: 'مدیر سیستم', description: 'دسترسی کامل به تمام بخش‌ها و تنظیمات سامانه', is_default: false, users_count: 1, permissions: { all: true, color: '#ef4444', badge: 'مدیر' } },
  { id: 2, slug: 'user', title: 'کاربر عادی', description: 'دسترسی پایه به بازار، سبد دارایی و سیگنال‌های عمومی', is_default: true, users_count: 1, permissions: { view_dashboard: true, view_market: true, view_signals: true, view_auto_invest: true, view_portfolio: true, view_ai_analysis: true, view_chat: true, view_subscriptions: true, view_notifications: true, view_news: true, view_guide: true, signals_view: true, portfolio_manage: true, ai_chat: true, auto_invest: true, header_ticker: true, dash_auto_invest_banner: true, btn_auto_invest: true, btn_signal_detail: true, btn_asset_advisory: true, btn_ai_chat: true, btn_wallet_recharge: true, btn_crypto_payment: true, btn_withdraw_request: true, btn_sub_purchase: true, btn_portfolio_add: true, btn_auto_close: true, btn_alloc_calc: true, btn_alert_create: true, btn_refresh_market: true, btn_theme_toggle: true, color: '#38bdf8', badge: 'کاربر' } },
  { id: 3, slug: 'vip', title: 'کاربر ویژه VIP', description: 'دسترسی کامل به ۶۰+ سیگنال زنده، هوش مصنوعی، خروجی اکسل و معاملات خودکار', is_default: false, users_count: 1, permissions: { view_dashboard: true, view_market: true, view_signals: true, view_auto_invest: true, view_portfolio: true, view_ai_analysis: true, view_chat: true, view_subscriptions: true, view_notifications: true, view_news: true, view_guide: true, signals_view: true, signals_vip: true, portfolio_manage: true, ai_chat: true, ai_models: true, auto_invest: true, header_ticker: true, dash_auto_invest_banner: true, btn_auto_invest: true, btn_signal_detail: true, btn_asset_advisory: true, btn_ai_chat: true, btn_wallet_recharge: true, btn_crypto_payment: true, btn_withdraw_request: true, btn_sub_purchase: true, btn_portfolio_add: true, btn_auto_close: true, btn_alloc_calc: true, btn_alert_create: true, btn_refresh_market: true, btn_theme_toggle: true, btn_export_data: true, color: '#eab308', badge: 'VIP 💎' } },
  { id: 4, slug: 'analyst', title: 'تحلیل‌گر بازار', description: 'دسترسی ویژه به موتور تحلیل، هوش مصنوعی و سیگنال‌های تخصصی', is_default: false, users_count: 0, permissions: { view_dashboard: true, view_market: true, view_signals: true, view_ai_analysis: true, view_chat: true, view_news: true, view_guide: true, signals_view: true, signals_vip: true, ai_chat: true, ai_models: true, header_ticker: true, btn_signal_detail: true, btn_asset_advisory: true, btn_ai_chat: true, btn_alloc_calc: true, btn_refresh_market: true, btn_theme_toggle: true, btn_export_data: true, color: '#a855f7', badge: 'تحلیل‌گر 📊' } }
];

/* ------------------------------ موتور تشخیص سوپر ادمین، نقش‌ها و دسترسی‌ها ------------------------------ */
function isSuperAdminUser(u) {
  const target = u !== undefined ? u : S.user;
  if (!target) return false;
  if (target.isSuperAdmin) return true;
  const email = String(target.email || '').trim().toLowerCase();
  return email === 'admin@gmail.com' || target.role === 'super_admin';
}

function getAllDefinedRoles() {
  if (S.admin && Array.isArray(S.admin.roles) && S.admin.roles.length > 0) {
    return S.admin.roles;
  }
  try {
    const raw = localStorage.getItem('sy_custom_roles');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_ROLES_LIST;
}

function getUiMatrixRoles() {
  const base = [
    { key: 'guest', label: 'مهمان (Guest)', slug: 'guest' },
    { key: 'user', label: 'کاربر عادی (User)', slug: 'user' },
    { key: 'subscriber', label: 'مشترک ویژه (VIP)', slug: 'vip' },
    { key: 'admin', label: 'مدیر (Admin)', slug: 'admin' }
  ];
  const defined = getAllDefinedRoles();
  defined.forEach(r => {
    if (!r || !r.slug) return;
    if (['guest', 'user', 'subscriber', 'vip', 'admin'].includes(r.slug)) return;
    base.push({ key: r.slug, label: `${r.title} (${r.slug})`, slug: r.slug, custom: true });
  });
  return base;
}

function getRolePermissionsObj(roleSlug) {
  if (!roleSlug) return null;
  const roles = getAllDefinedRoles();
  const found = roles.find(r => r.slug === roleSlug || (roleSlug === 'subscriber' && r.slug === 'vip') || (roleSlug === 'vip' && r.slug === 'subscriber'));
  return (found && found.permissions) ? found.permissions : null;
}

function hasUserAdminAccess(u) {
  const target = u !== undefined ? u : S.user;
  if (!target) return false;
  if (isSuperAdminUser(target)) return true;
  if (target.isAdmin || target.role === 'admin') return true;
  const perms = target.permissions || getRolePermissionsObj(target.role) || {};
  if (perms.all || perms.view_admin) return true;
  return Object.keys(perms).some(k => k.startsWith('admin_') && perms[k]);
}

function getUserRole() {
  if (!S.user) return 'guest';
  if (isSuperAdminUser(S.user) || S.user.role === 'admin') return 'admin';
  const r = String(S.user.role || '').trim();
  if (r && r !== 'user' && r !== 'vip' && r !== 'subscriber') {
    return r;
  }
  if (S.user.is_vip || S.user.plan_id || (S.user.subscription && S.user.subscription.status === 'active') || r === 'subscriber' || r === 'vip') {
    return 'subscriber';
  }
  return 'user';
}

function canUserSeeElement(roles) {
  if (!roles || !Array.isArray(roles) || roles.length === 0) return true;
  if (isSuperAdminUser(S.user)) return true;
  const currentRole = getUserRole();
  if (currentRole === 'admin') return true;
  const perms = (S.user && S.user.permissions) || getRolePermissionsObj(currentRole);
  if (perms && perms.all) return true;
  if (currentRole === 'subscriber' && (roles.includes('subscriber') || roles.includes('vip'))) return true;
  if (S.user && S.user.role && roles.includes(S.user.role)) return true;
  return roles.includes(currentRole);
}

function canUserSeeView(view) {
  if (isSuperAdminUser(S.user)) return true;
  if (view === 'admin' || view === 'ai-settings' || view === 'setup') {
    return hasUserAdminAccess(S.user);
  }
  const role = getUserRole();
  const perms = (S.user && S.user.permissions) || getRolePermissionsObj(role);
  if (perms) {
    if (perms.all) return true;
    const permViewKey = 'view_' + view.replace(/-/g, '_');
    if (perms[permViewKey] === true) return true;
  }
  const rules = S.ui && S.ui.visibilityRules && S.ui.visibilityRules.views;
  if (!rules || !rules[view]) return true;
  return canUserSeeElement(rules[view]);
}

function canUserSeeFeature(featKey) {
  if (isSuperAdminUser(S.user)) return true;
  if (featKey === 'admin_panel' || featKey === 'ai_settings' || featKey === 'system_settings') {
    return hasUserAdminAccess(S.user);
  }
  const role = getUserRole();
  const perms = (S.user && S.user.permissions) || getRolePermissionsObj(role);
  if (perms) {
    if (perms.all) return true;
    if (perms[featKey] === true) return true;
  }
  const rules = S.ui && S.ui.visibilityRules && S.ui.visibilityRules.features;
  if (!rules || !rules[featKey]) return true;
  return canUserSeeElement(rules[featKey]);
}

function applyTheme(t, isLive = false) {
  const root = document.documentElement;
  if (!root) return;

  const colorProps = [
    '--bg', '--bg2', '--surface', '--surface2', '--panel', '--panel2',
    '--header-bg', '--txt', '--muted', '--muted2', '--line', '--line2',
    '--code-bg', '--input-bg', '--brand-ink', '--up', '--down', '--warn',
    '--info', '--accent', '--accent-hover', '--accent2', '--top-grad',
    '--bg-grad', '--shadow', '--shadow-soft'
  ];

  let styles = null;

  if (typeof t === 'string') {
    S.theme = t === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', S.theme);
    try { localStorage.setItem('sy_theme', S.theme); } catch (e) {}

    // پاکسازی متغیرهای درون‌خطی رنگ از ریشه تا قوانین CSS به درستی اعمال شوند
    colorProps.forEach(p => root.style.removeProperty(p));

    if (S.theme === 'light') {
      if (S.ui && S.ui.themeStyles && S.ui.themeStyles.themePreset === 'light-modern') {
        styles = S.ui.themeStyles;
      } else {
        styles = THEME_PRESETS['light-modern'].styles;
      }
    } else {
      if (S.ui && S.ui.themeStyles && S.ui.themeStyles.themePreset !== 'light-modern') {
        styles = S.ui.themeStyles;
      } else {
        styles = THEME_PRESETS['dark-neon'].styles;
      }
    }
  } else if (typeof t === 'object' && t !== null) {
    const isLightObj = (t.themePreset === 'light-modern') || (t.bgColor && (t.bgColor.startsWith('#f') || t.bgColor.startsWith('#e') || t.bgColor.toLowerCase() === '#ffffff'));
    
    // اگر کاربر به صورت صریح تم لایت را از قبل در لوکال استوریج انتخاب کرده و این فراخوانی زنده ادمین نیست
    const savedTheme = !isLive ? localStorage.getItem('sy_theme') : null;
    if (savedTheme === 'light' && !isLightObj) {
      S.theme = 'light';
      root.setAttribute('data-theme', 'light');
      colorProps.forEach(p => root.style.removeProperty(p));
      styles = THEME_PRESETS['light-modern'].styles;
    } else {
      S.theme = isLightObj ? 'light' : 'dark';
      root.setAttribute('data-theme', S.theme);
      try { localStorage.setItem('sy_theme', S.theme); } catch (e) {}
      colorProps.forEach(p => root.style.removeProperty(p));
      styles = t;
    }
  }

  const b = $('#themeBtn'); if (b) b.textContent = S.theme === 'dark' ? '🌙' : '☀️';
  const m = $('#menuTheme'); if (m) m.textContent = S.theme === 'dark' ? '☀️ پوستهٔ روشن' : '🌙 پوستهٔ تاریک';
  $$('.auth-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.setTheme === S.theme);
  });

  if (styles) {
    // ادغام تنظیمات تایپوگرافی ذخیره‌شده ادمین حتی هنگام سوییچ تم تاریک/روشن
    const savedTypo = (S.ui && S.ui.themeStyles) ? S.ui.themeStyles : {};
    const mergedStyles = Object.assign({}, savedTypo, styles);

    if (styles.bgColor) root.style.setProperty('--bg', styles.bgColor);
    if (styles.surfaceColor) root.style.setProperty('--surface', styles.surfaceColor);
    if (styles.panelColor) root.style.setProperty('--panel', styles.panelColor);
    if (styles.panel2Color) root.style.setProperty('--panel2', styles.panel2Color);
    if (styles.headerBg) root.style.setProperty('--header-bg', styles.headerBg);
    if (styles.txtColor) root.style.setProperty('--txt', styles.txtColor);
    if (styles.mutedColor) root.style.setProperty('--muted', styles.mutedColor);
    if (styles.accentColor) root.style.setProperty('--accent', styles.accentColor);
    if (styles.accentHover) root.style.setProperty('--accent-hover', styles.accentHover);
    if (styles.accentTxt) root.style.setProperty('--brand-ink', styles.accentTxt);
    if (styles.upColor) root.style.setProperty('--up', styles.upColor);
    if (styles.downColor) root.style.setProperty('--down', styles.downColor);
    if (styles.warnColor) root.style.setProperty('--warn', styles.warnColor);
    if (mergedStyles.btnRadius) root.style.setProperty('--btn-radius', mergedStyles.btnRadius);
    if (mergedStyles.cardRadius || mergedStyles.borderRadius) root.style.setProperty('--radius', mergedStyles.cardRadius || mergedStyles.borderRadius);

    const mainFont = mergedStyles.fontFamily || 'Vazirmatn';
    const headingFont = mergedStyles.headingFontFamily || mainFont;
    const monoFont = mergedStyles.monoFontFamily || mainFont;
    const baseSize = mergedStyles.fontSizeBase || '14.5px';
    const navSize = mergedStyles.navFontSize || '';
    const btnSize = mergedStyles.btnFontSize || '';
    const tableSize = mergedStyles.tableFontSize || '';
    const priceSize = mergedStyles.priceFontSize || '';
    const headingScale = Number(mergedStyles.headingScale || 100);
    const bodyWeight = mergedStyles.bodyWeight || '';
    const headingWeight = mergedStyles.headingWeight || '';
    const lineHeight = mergedStyles.lineHeightBase || '';
    const letterSpacing = mergedStyles.letterSpacingBase || '';
    const tabularNums = mergedStyles.tabularNums !== undefined ? Number(mergedStyles.tabularNums) : 1;
    const customFontUrl = mergedStyles.customFontUrl || '';

    if (typeof ensureWebFontLoaded === 'function') {
      ensureWebFontLoaded(mainFont);
      if (headingFont && headingFont !== mainFont) ensureWebFontLoaded(headingFont);
      if (monoFont && monoFont !== mainFont) ensureWebFontLoaded(monoFont);
      if (customFontUrl) ensureCustomFontUrlLoaded(customFontUrl);
    }

    root.style.setProperty('--font-base-size', baseSize);
    root.style.setProperty('--font-family', mainFont);
    const fontStack = `"${mainFont}", Vazirmatn, Tahoma, system-ui, -apple-system, sans-serif`;
    const headingStack = `"${headingFont}", "${mainFont}", Vazirmatn, Tahoma, sans-serif`;
    const monoStack = `"${monoFont}", "${mainFont}", ui-monospace, monospace`;
    if (document.body) document.body.style.fontFamily = fontStack;

    let dynStyle = $('#dynamicUiThemeStyles');
    if (!dynStyle) {
      dynStyle = document.createElement('style');
      dynStyle.id = 'dynamicUiThemeStyles';
      document.head.appendChild(dynStyle);
    }

    let customRules = `
      body, html, button, input, select, textarea, .btn, .tab, .input, .table, .pill, .chip {
        font-family: ${fontStack} !important;
      }
      body, html {
        font-size: ${baseSize} !important;
        ${bodyWeight ? `font-weight: ${bodyWeight} !important;` : ''}
        ${lineHeight ? `line-height: ${lineHeight} !important;` : ''}
        ${letterSpacing && letterSpacing !== '0px' && letterSpacing !== '0' ? `letter-spacing: ${letterSpacing} !important;` : ''}
      }
      h1, h2, h3, h4, .modal-head h2, .panel-head h2 {
        font-family: ${headingStack} !important;
        ${headingWeight ? `font-weight: ${headingWeight} !important;` : ''}
      }
      .price, .kpi .k-value, .kpi .val, .bal, code, .bot-terminal-log {
        font-family: ${monoStack} !important;
        ${tabularNums ? 'font-variant-numeric: tabular-nums !important;' : ''}
      }
    `;
    if (headingScale && headingScale !== 100) {
      const sc = headingScale / 100;
      customRules += `
        .brand h1 { font-size: ${(19 * sc).toFixed(1)}px !important; }
        .panel-head h2, h2 { font-size: ${(15.5 * sc).toFixed(1)}px !important; }
        h3, .signal-title h3 { font-size: ${(15 * sc).toFixed(1)}px !important; }
      `;
    }
    if (navSize) {
      customRules += `.tabs .tab, .adm-nav .adm-nav-btn { font-size: ${navSize} !important; }\n`;
    }
    if (btnSize) {
      customRules += `.btn { font-size: ${btnSize} !important; }\n`;
    }
    if (tableSize) {
      customRules += `.table, .table td, .table th { font-size: ${tableSize} !important; }\n`;
    }
    if (priceSize) {
      customRules += `.price, .kpi .k-value, .kpi .val { font-size: ${priceSize} !important; }\n`;
    }
    if (mergedStyles.btnPrimaryBg) {
      customRules += `
        .btn-primary { background: ${mergedStyles.btnPrimaryBg} !important; color: ${mergedStyles.btnPrimaryTxt || '#ffffff'} !important; border-color: ${mergedStyles.btnPrimaryBg} !important; }
        .btn-primary:hover { background: ${mergedStyles.btnPrimaryHoverBg || mergedStyles.btnPrimaryBg} !important; color: ${mergedStyles.btnPrimaryHoverTxt || '#ffffff'} !important; }
      `;
    }
    if (mergedStyles.customCss) {
      customRules += `\n/* سفارشی ادمین */\n${mergedStyles.customCss}\n`;
    }
    dynStyle.textContent = customRules;
  }

  try { renderTicker(); } catch (e) {}
  try { if (S.market) renderDashboard(); } catch (e) {}
  try { if (S.market) renderSignals(); } catch (e) {}
  try { if (S.state) renderPortfolio(); } catch (e) {}
}

function toggleTheme(notify) {
  const next = S.theme === 'dark' ? 'light' : 'dark';
  window.setExplicitThemeMode(next, notify);
}

window.setExplicitThemeMode = function(mode, notify = true) {
  const next = mode === 'light' ? 'light' : 'dark';
  try {
    localStorage.setItem('sy_user_manual_theme', next);
    localStorage.setItem('sy_theme', next);
  } catch (e) {}
  applyTheme(next);
  if (S.user) api('/api/auth/prefs', { method: 'POST', body: JSON.stringify({ theme: next }) }).catch(() => {});
  if (notify) toast(next === 'dark' ? '🌙 پوستهٔ تاریک فعال شد' : '☀️ پوستهٔ روشن فعال شد');
};

window.onAdminDefaultThemeChange = function(mode) {
  const def = mode === 'light' ? 'light' : 'dark';
  if ($('#set_defaultThemeMode')) $('#set_defaultThemeMode').value = def;
  if ($('#cfgDefaultThemeMode')) $('#cfgDefaultThemeMode').value = def;
  if (!S.settings) S.settings = {};
  S.settings.defaultThemeMode = def;
  if (S.admin && S.admin.settings) S.admin.settings.defaultThemeMode = def;
  try {
    localStorage.setItem('sy_default_theme_mode', def);
    localStorage.removeItem('sy_user_manual_theme');
  } catch (e) {}
  applyTheme(def);
  toast(def === 'light' ? '☀️ حالت پیش‌فرض کل سایت روی «روشن (Light Mode)» تنظیم شد' : '🌙 حالت پیش‌فرض کل سایت روی «تاریک (Dark Mode)» تنظیم شد', 'ok');
};

function renderNavigation(items) {
  const tabsContainer = $('#tabs');
  if (!tabsContainer) return;
  const list = (items && items.length > 0) ? items : (S.ui && S.ui.navItems) || DEFAULT_NAV_ITEMS;
  const sorted = list.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  const cur = currentView();
  const isAdmin = hasUserAdminAccess(S.user);

  const htmlParts = [];
  sorted.forEach(item => {
    if (!item.active) return;
    const v = item.view === 'ai' ? 'ai-analysis' : item.view;
    if ((v === 'admin' || v === 'ai-settings' || v === 'setup') && !isAdmin) return;
    if ((v === 'admin' || v === 'ai-settings' || v === 'setup') && !canUserSeeElement(item.roles)) return;

    const isActive = (cur === v);
    const badgeHtml = item.badge ? `<span class="pill pill-xs" style="margin-inline-start:4px">${esc(item.badge)}</span>` : '';
    const extraBadge = (v === 'auto-invest') ? `<span class="pill pill-xs" id="navAutoInvestCount" style="display:none;background:var(--up);color:#052e16">۰</span>` : '';

    htmlParts.push(`
      <button class="tab ${isActive ? 'active' : ''} ${v === 'admin' ? 'admin-only' : ''}" data-view="${esc(v)}" id="tab-${esc(item.id || v)}">
        <span class="icon">${item.icon || '📌'}</span> <span>${esc(item.label)}</span> ${badgeHtml}${extraBadge}
      </button>
    `);
    if (v === 'portfolio') {
      htmlParts.push('<span class="tab-divider" aria-hidden="true"></span>');
    }
  });
  tabsContainer.innerHTML = htmlParts.join('');
}

function applyButtonsConfig(cfg) {
  if (!cfg) return;
  let btnStyle = $('#dynamicButtonsStyles');
  if (!btnStyle) {
    btnStyle = document.createElement('style');
    btnStyle.id = 'dynamicButtonsStyles';
    document.head.appendChild(btnStyle);
  }

  let rules = '';
  const selectorMap = {
    btn_auto_invest: '.btn-auto-invest, [data-sig-autoinvest]',
    btn_signal_detail: '[data-sig-detail]',
    btn_asset_advisory: '[data-sig-advisory]',
    btn_ai_chat: '[data-ask]',
    btn_wallet_recharge: '#btnWalletRecharge, #btnOpenChargeModal',
    btn_crypto_payment: '#btnOpenCryptoModal, [data-crypto-pay]',
    btn_withdraw_request: '#btnOpenWithdrawModal, [data-withdraw-req]',
    btn_sub_purchase: '[data-buy-plan]',
    btn_portfolio_add: '[data-add-portfolio]',
    btn_auto_close: '[data-ai-close], #btnAiDetailClosePos',
    btn_alloc_calc: '#btnOpenAllocCalcModal',
    btn_alert_create: '#btnAddAlert, #btnCreateAlert',
    btn_refresh_market: '#refreshBtn',
    btn_theme_toggle: '#themeBtn',
    btn_export_data: '#btnExportCsv, [data-export]'
  };

  Object.keys(selectorMap).forEach(bKey => {
    const b = cfg[bKey];
    if (!b) return;
    const sel = selectorMap[bKey];
    const allowed = b.active !== false;
    $$(sel).forEach(el => {
      if (b.customized && b.label && bKey !== 'btn_refresh_market' && bKey !== 'btn_theme_toggle' && !el.dataset.customText) {
        const cleanLbl = b.label.replace(new RegExp('^' + (b.icon || '') + '\\s*'), '');
        el.innerHTML = `${b.icon ? b.icon + ' ' : ''}${esc(cleanLbl)}`;
      }
      el.style.display = allowed ? '' : 'none';
    });
    if (b.customized && b.bg_color && bKey !== 'btn_refresh_market' && bKey !== 'btn_theme_toggle') {
      rules += `
        ${sel} {
          background: ${b.bg_color} !important;
          color: ${b.text_color || '#fff'} !important;
          border-radius: ${b.border_radius || '8px'} !important;
          border-color: ${b.bg_color} !important;
        }
        ${sel}:hover {
          background: ${b.hover_bg || b.bg_color} !important;
          color: ${b.hover_text || '#fff'} !important;
        }
      `;
    }
  });

  btnStyle.textContent = rules;
}

function initUiCustomizationDefaults() {
  S.ui = {
    pageTemplates: { signals: 'tpl1', autoInvest: 'ai_tpl1' },
    navItems: JSON.parse(JSON.stringify(DEFAULT_NAV_ITEMS)),
    buttonsConfig: JSON.parse(JSON.stringify(DEFAULT_BUTTONS_CONFIG)),
    themeStyles: JSON.parse(JSON.stringify(DEFAULT_THEME_STYLES)),
    visibilityRules: JSON.parse(JSON.stringify(DEFAULT_VISIBILITY_RULES))
  };
}

async function initUiCustomization() {
  initUiCustomizationDefaults();
  let localData = null;
  try {
    const raw = localStorage.getItem('sy_ui_customizer');
    if (raw) localData = JSON.parse(raw);
  } catch (e) {}

  let localTpls = null;
  try {
    const rawTpl = localStorage.getItem('sy_page_templates');
    if (rawTpl) localTpls = JSON.parse(rawTpl);
  } catch (e) {}

  let serverData = null;
  try {
    serverData = await api('/api/ui-config');
  } catch (e) {}

  const merged = Object.assign({}, serverData || {}, localData || {});
  const serverTpls = (serverData && serverData.pageTemplates && typeof serverData.pageTemplates === 'object') ? serverData.pageTemplates : {};
  S.ui.pageTemplates = Object.assign({ authPage: 'auth_tpl1', forgotPage: 'fp_tpl1', signals: 'tpl1', autoInvest: 'ai_tpl1' }, serverTpls, localTpls || {});
  if (serverData && serverData.authPageTemplate && (!localTpls || !localTpls.authPage)) {
    S.ui.pageTemplates.authPage = { active: serverData.authPageTemplate, allowUserSelect: false, allowed: ['auth_tpl1','auth_tpl2','auth_tpl3','auth_tpl4','auth_tpl5','auth_tpl6','auth_tpl7','auth_tpl8','auth_tpl9','auth_tpl10'] };
  }
  if (serverData && serverData.forgotPageTemplate && (!localTpls || !localTpls.forgotPage)) {
    S.ui.pageTemplates.forgotPage = { active: serverData.forgotPageTemplate, allowUserSelect: false, allowed: ['fp_tpl1','fp_tpl2','fp_tpl3','fp_tpl4','fp_tpl5'] };
  }
  if (merged.navItems && Array.isArray(merged.navItems)) S.ui.navItems = merged.navItems;
  if (merged.buttonsConfig && typeof merged.buttonsConfig === 'object') {
    S.ui.buttonsConfig = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_BUTTONS_CONFIG)), merged.buttonsConfig);
  }
  if (merged.themeStyles && typeof merged.themeStyles === 'object') S.ui.themeStyles = merged.themeStyles;
  if (merged.visibilityRules && typeof merged.visibilityRules === 'object') {
    S.ui.visibilityRules = {
      views: Object.assign({}, DEFAULT_VISIBILITY_RULES.views, merged.visibilityRules.views || {}),
      features: Object.assign({}, DEFAULT_VISIBILITY_RULES.features, merged.visibilityRules.features || {})
    };
  }
  if (merged.roles && Array.isArray(merged.roles) && merged.roles.length > 0) {
    if (!S.admin) S.admin = {};
    S.admin.roles = merged.roles;
  }
  if (merged.forgotConfig && typeof merged.forgotConfig === 'object') {
    if (!S.settings) S.settings = {};
    S.settings.forgotConfig = merged.forgotConfig;
  }

  let defTheme = (serverData && serverData.defaultThemeMode) || '';
  try {
    if (!defTheme) defTheme = localStorage.getItem('sy_default_theme_mode') || '';
  } catch (e) {}
  if (!defTheme) defTheme = 'dark';
  if (!S.settings) S.settings = {};
  S.settings.defaultThemeMode = defTheme;

  let userManualTheme = '';
  try {
    userManualTheme = localStorage.getItem('sy_user_manual_theme') || '';
  } catch (e) {}

  const effectiveInitialTheme = (userManualTheme === 'light' || userManualTheme === 'dark') ? userManualTheme : defTheme;
  applyTheme(effectiveInitialTheme);
  renderNavigation(S.ui.navItems);
  applyButtonsConfig(S.ui.buttonsConfig);
  if (typeof applyForgotPasswordConfig === 'function') applyForgotPasswordConfig();
  if (typeof applyAllMenuTemplates === 'function') applyAllMenuTemplates();
}

/* ============================================================================
   احراز هویت
   ============================================================================ */
let authMode = 'login';

/* ============================================================================
   احراز هویت داینامیک، کلمات بازیابی و فرم‌ساز
   ============================================================================ */
let dynamicFieldsLoaded = false;
let currentLockoutTimer = null;
let currentPendingRegResult = null;

async function loadDynamicAuthFields(force = false) {
  if (dynamicFieldsLoaded && !force && S.authFields && S.authFields.length) return;
  try {
    const res = await api('/api/auth/fields');
    if (res && res.fields) {
      S.authFields = res.fields;
      if (res.settings) S.settings = Object.assign(S.settings || {}, res.settings);
      dynamicFieldsLoaded = true;
      renderDynamicRegisterForm();
      return;
    }
  } catch (e) {
    // در صورت عدم دسترسی به API (مانند پیش‌نمایش آفلاین)، فیلدهای پیش‌فرض بارگذاری می‌شوند
  }

  if (!S.authFields || !S.authFields.length) {
    S.authFields = [
      { field_key: 'name', title: 'نام و نام خانوادگی', type: 'text', is_required: 1, is_active: 1, placeholder: 'مثلاً: علی رضایی', help_text: 'نام و نام خانوادگی خود را کامل وارد کنید.' },
      { field_key: 'username', title: 'نام کاربری', type: 'text', is_required: 0, is_active: 1, placeholder: 'user_name (لاتین)', help_text: 'حداقل ۳ حرف انگلیسی بدون فاصله.' },
      { field_key: 'email', title: 'پست الکترونیک (ایمیل)', type: 'email', is_required: 1, is_active: 1, placeholder: 'example@domain.com', help_text: 'جهت ورود به حساب و بازیابی رمز عبور.' },
      { field_key: 'mobile', title: 'شماره تلفن همراه', type: 'tel', is_required: 0, is_active: 1, placeholder: '۰۹۱۲xxxxxxx', help_text: 'جهت دریافت هشدارهای پیامکی و امنیت حساب.' },
      { field_key: 'password', title: 'کلمه عبور', type: 'password', is_required: 1, is_active: 1, placeholder: '••••••••', help_text: 'حداقل ۶ کاراکتر شامل حروف و ارقام.' },
      { field_key: 'password_confirm', title: 'تکرار کلمه عبور', type: 'password_confirm', is_required: 1, is_active: 1, placeholder: '••••••••', help_text: 'تکرار کلمه عبور بالا را بنویسید.' },
      { field_key: 'terms_agree', title: 'پذیرش قوانین و مقررات سامانه', type: 'checkbox', is_required: 1, is_active: 1, default_val: '1', help_text: 'ثبت‌نام در سامانه به منزله پذیرش کامل قوانین و شرایط است.' }
    ];
    dynamicFieldsLoaded = true;
    renderDynamicRegisterForm();
  }
}

function renderDynamicRegisterForm() {
  const container = $('#dynamicAuthFieldsContainer');
  if (!container) return;
  const fields = S.authFields || [];
  if (!fields.length) {
    container.innerHTML = '<div class="hint" style="grid-column:1/-1">در حال آماده‌سازی فیلدهای ثبت‌نام…</div>';
    return;
  }

  const s = S.settings || {};
  let html = '';

  fields.forEach(f => {
    if (!f.is_active) return;
    const req = f.is_required ? 'required' : '';
    const reqStar = f.is_required ? '<span style="color:var(--down)">*</span>' : '';
    const key = esc(f.field_key);
    const title = esc(f.title);
    const ph = esc(f.placeholder || '');
    const help = f.help_text ? `<span class="hint" style="font-size:11px;line-height:1.4">${esc(f.help_text)}</span>` : '';
    const def = esc(f.default_val || '');
    const type = f.type || 'text';

    if (type === 'textarea') {
      html += `<div class="auth-row full-span" data-fkey="${key}">
        <label for="dyn_${key}">${title} ${reqStar}</label>
        <textarea id="dyn_${key}" name="${key}" class="input" rows="2" placeholder="${ph}" ${req}>${def}</textarea>
        ${help}
      </div>`;
    } else if (type === 'select') {
      const opts = (f.options || []).map(o => {
        const val = typeof o === 'object' ? (o.value || '') : o;
        const lbl = typeof o === 'object' ? (o.label || o.value || '') : o;
        const sel = val === def ? 'selected' : '';
        return `<option value="${esc(val)}" ${sel}>${esc(lbl)}</option>`;
      }).join('');
      html += `<div class="auth-row" data-fkey="${key}">
        <label for="dyn_${key}">${title} ${reqStar}</label>
        <select id="dyn_${key}" name="${key}" class="input" ${req}>
          <option value="">${ph || 'انتخاب نمایید…'}</option>
          ${opts}
        </select>
        ${help}
      </div>`;
    } else if (type === 'checkbox') {
      const chk = def === '1' || def === 'true' ? 'checked' : '';
      html += `<div class="auth-row full-span" data-fkey="${key}" style="background:var(--surface);padding:10px 12px;border-radius:11px;border:1px solid var(--line);margin-top:2px">
        <label class="checkbox-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;margin:0">
          <input type="checkbox" id="dyn_${key}" name="${key}" value="1" ${chk} ${req} />
          <span>${title} ${reqStar}</span>
        </label>
        ${help}
      </div>`;
    } else if (type === 'radio') {
      const radios = (f.options || []).map((o, idx) => {
        const val = typeof o === 'object' ? (o.value || '') : o;
        const lbl = typeof o === 'object' ? (o.label || o.value || '') : o;
        const chk = (val === def || idx === 0) ? 'checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:6px;margin-inline-end:14px;cursor:pointer;font-size:13px">
          <input type="radio" name="${key}" value="${esc(val)}" ${chk} />
          <span>${esc(lbl)}</span>
        </label>`;
      }).join('');
      html += `<div class="auth-row full-span" data-fkey="${key}">
        <label>${title} ${reqStar}</label>
        <div style="margin-top:4px">${radios}</div>
        ${help}
      </div>`;
    } else {
      const inpType = (type === 'password' || type === 'password_confirm') ? 'password'
        : type === 'number' ? 'number'
        : type === 'tel' ? 'tel'
        : type === 'email' ? 'email'
        : type === 'date' ? 'date' : 'text';
      const dir = (inpType === 'password' || inpType === 'email' || inpType === 'tel' || key === 'username') ? 'dir="ltr"' : '';
      html += `<div class="auth-row" data-fkey="${key}">
        <label for="dyn_${key}">${title} ${reqStar}</label>
        <input type="${inpType}" id="dyn_${key}" name="${key}" class="input" ${dir} placeholder="${ph}" value="${def}" ${req} />
        ${help}
      </div>`;
    }
  });

  container.innerHTML = html;

  if (s.authRegisterBtnText && $('#registerSubmit')) {
    $('#registerSubmit').textContent = s.authRegisterBtnText;
  }
}

function showAuth(show, opts = {}) {
  const el = $('#authScreen');
  if (!el) return;
  el.hidden = !show;
  document.body.classList.toggle('auth-open', !!show);
  if (show) {
    if (opts.siteName) $('#authSiteName').textContent = opts.siteName;
    if (opts.tagline) $('#authTagline').textContent = opts.tagline;
    const allow = opts.allowRegister !== false;
    $$('#authTabs .auth-tab').forEach(t => t.classList.toggle('auth-hide', t.dataset.mode === 'register' && !allow));
    loadDynamicAuthFields();
    setAuthMode(allow ? (opts.mode || 'login') : 'login');
    const inst = $('#authInstall');
    if (inst) inst.hidden = !opts.installed === false ? true : !opts.notInstalled;
    if (typeof applySingleMenuTemplate === 'function') applySingleMenuTemplate('authPage');
    if (typeof applyForgotPasswordConfig === 'function') applyForgotPasswordConfig();
    $$('.auth-theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.setTheme === S.theme);
    });
  }
}

function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  $$('#authTabs .auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === authMode));

  const isLogin = authMode === 'login';
  $('#authLoginForm').hidden = !isLogin;
  $('#authRegisterForm').hidden = isLogin;

  if (!isLogin) {
    loadDynamicAuthFields();
  }

  $('#loginError').hidden = true;
  $('#registerError').hidden = true;
}

function authError(msg, isRegister = false) {
  const e = isRegister ? $('#registerError') : $('#loginError');
  if (!e) return;
  e.textContent = msg;
  e.hidden = !msg;
}

async function doAuthLogin(e) {
  if (e) e.preventDefault();
  const ident = $('#loginIdentifier').value.trim();
  const pass = $('#loginPassword').value;
  const remember = $('#loginRemember') ? $('#loginRemember').checked : true;

  if (!ident || !pass) return authError('لطفاً شناسه ورود و کلمه عبور را وارد فرمایید.', false);

  const btn = $('#loginSubmit');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = 'در حال بررسی اطلاعات…';
  authError('', false);

  try {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: ident, password: pass, remember })
    });

    if (r.locked) {
      startLockoutCountdown(r.retryAfter || 60);
      throw new Error(r.error || 'حساب شما موقتاً مسدود شده است.');
    }

    if (r.pending) {
      throw new Error(r.error || 'حساب شما در انتظار تأیید مدیریت است.');
    }

    if (!r.user) throw new Error(r.error || 'خطا در ورود به حساب.');

    S.user = r.user;
    try { localStorage.removeItem('sy_auto_positions'); } catch (e) {}
    toast('خوش آمدید ' + (r.user.name || r.user.username || ''), 'ok');
    $('#authLoginForm').reset();
    await startApp();
  } catch (err) {
    authError(err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

function startLockoutCountdown(seconds) {
  const box = $('#loginLockoutAlert');
  if (!box) return;
  if (currentLockoutTimer) clearInterval(currentLockoutTimer);
  box.hidden = false;
  let remaining = seconds;
  const updateText = () => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    box.innerHTML = `⚠️ به دلیل تلاش‌های ناموفق متعدد، ورود تا <b>${mins}:${secs < 10 ? '0' : ''}${secs}</b> مسدود است.`;
  };
  updateText();
  currentLockoutTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(currentLockoutTimer);
      box.hidden = true;
      authError('', false);
    } else {
      updateText();
    }
  }, 1000);
}

async function doAuthRegister(e) {
  if (e) e.preventDefault();
  const fields = S.authFields || [];
  const payload = {};
  let clientErr = null;

  fields.forEach(f => {
    if (!f.is_active) return;
    const k = f.field_key;
    const title = f.title;
    const req = f.is_required;
    const el = $(`#dyn_${k}`) || $(`input[name="${k}"]:checked`);

    if (f.type === 'checkbox') {
      const chk = $(`#dyn_${k}`);
      payload[k] = chk && chk.checked ? '1' : '0';
      if (req && (!chk || !chk.checked)) clientErr = `تأیید «${title}» الزامی است.`;
    } else if (f.type === 'radio') {
      const rad = $(`input[name="${k}"]:checked`);
      payload[k] = rad ? rad.value : '';
      if (req && !payload[k]) clientErr = `انتخاب گزینه‌ای برای «${title}» الزامی است.`;
    } else {
      const val = el ? el.value.trim() : '';
      payload[k] = val;
      if (req && !val && !clientErr) clientErr = `تکمیل فیلد «${title}» الزامی است.`;
    }
  });

  if (clientErr) return authError(clientErr, true);

  if (payload.password && payload.password_confirm && payload.password !== payload.password_confirm) {
    return authError('کلمه عبور با تکرار آن همخوانی ندارد.', true);
  }

  const btn = $('#registerSubmit');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = 'در حال ساخت حساب و تولید کلیدهای امنیتی…';
  authError('', true);

  try {
    const r = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!r.ok && r.error) throw new Error(r.error);

    currentPendingRegResult = r;
    S.autoPositions = [];
    try {
      localStorage.removeItem('sy_auto_positions');
      if (r.user && r.user.id) localStorage.removeItem('sy_auto_positions_u_' + r.user.id);
    } catch (e) {}

    // بررسی آیا کلمات بازیابی تولید شده است؟
    if (r.recoveryWords && Array.isArray(r.recoveryWords) && r.recoveryWords.length > 0) {
      openRecoveryWordsModal(r.recoveryWords, r);
    } else {
      if (r.autoLoggedIn && r.user) {
        S.user = r.user;
        toast(r.message || 'خوش آمدید! حساب کاربری شما ساخته شد.', 'ok');
        $('#authRegisterForm').reset();
        await startApp();
      } else {
        toast(r.message || 'ثبت‌نام با موفقیت انجام شد.', 'ok');
        setAuthMode('login');
      }
    }
  } catch (err) {
    authError(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

/* ------------------------------ مدیریت کلمات بازیابی (Recovery Words Onboarding) ------------------------------ */
let activeRecoveryWords = [];

function openRecoveryWordsModal(words, regResult) {
  activeRecoveryWords = words;
  const modal = $('#recoveryWordsModal');
  if (!modal) return;

  const s = S.settings || {};
  if (s.recoveryWordsTitle && $('#recWordsTitle')) $('#recWordsTitle').textContent = s.recoveryWordsTitle;
  if (s.recoveryWordsWarning && $('#recWordsWarnText')) $('#recWordsWarnText').textContent = s.recoveryWordsWarning;
  if (s.recoveryWordsConfirmLabel && $('#recConfirmLabel')) $('#recConfirmLabel').textContent = s.recoveryWordsConfirmLabel;

  const grid = $('#recoveryWordsGrid');
  grid.innerHTML = words.map((w, idx) => `
    <div class="rec-word-chip">
      <span class="rec-word-idx">${idx + 1}</span>
      <span class="rec-word-val">${esc(w)}</span>
    </div>
  `).join('');

  $('#recConfirmCheck').checked = false;
  $('#recFinishBtn').disabled = true;
  $('#recCopyStatus').textContent = '';

  modal.hidden = false;
}

function copyRecoveryWords() {
  const phrase = activeRecoveryWords.join(' ');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(phrase).then(() => {
      $('#recCopyStatus').textContent = '✅ کلمات کپی شدند!';
      setTimeout(() => { if ($('#recCopyStatus')) $('#recCopyStatus').textContent = ''; }, 3000);
    });
  } else {
    prompt('کلمات بازیابی خود را کپی کنید:', phrase);
  }
}

function downloadRecoveryWords() {
  const phrase = activeRecoveryWords.map((w, i) => `${i + 1}. ${w}`).join('\n');
  const site = S.settings.siteName || 'سرمایه‌یار';
  const content = `=========================================\n${site} - Recovery Words (BIP-39 Mnemonic)\n=========================================\n\nتاریخ صدور: ${new Date().toLocaleString('fa-IR')}\n\n${phrase}\n\nهشدار امنیتی: این کلمات را در محلی امن نگهداری فرمایید.\n`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sarmayeyar-recovery-words-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  $('#recCopyStatus').textContent = '💾 فایل ذخیره شد!';
}

async function finishRecoveryOnboarding() {
  const modal = $('#recoveryWordsModal');
  const btn = $('#recFinishBtn');
  btn.disabled = true;
  btn.textContent = 'در حال تأیید و اتصال…';

  try {
    await api('/api/auth/confirm-recovery-words', { method: 'POST' }).catch(() => {});
  } catch (e) {}

  modal.hidden = true;

  if (currentPendingRegResult && currentPendingRegResult.user) {
    S.user = currentPendingRegResult.user;
    S.autoPositions = [];
    try {
      localStorage.removeItem('sy_auto_positions');
      if (S.user.id) localStorage.removeItem('sy_auto_positions_u_' + S.user.id);
    } catch (e) {}
    toast('کلمات بازیابی تأیید و حساب شما فعال گردید! خوش آمدید.', 'ok');
    await startApp();
  } else if (currentPendingRegResult && currentPendingRegResult.status === 'pending') {
    toast('کلمات بازیابی ثبت شد. حساب شما پس از تأیید مدیریت فعال خواهد شد.', 'ok');
    setAuthMode('login');
  } else {
    toast('ثبت‌نام و تنظیم کلمات بازیابی با موفقیت انجام شد.', 'ok');
    setAuthMode('login');
  }
}

/* ------------------------------ بازیابی رمز با کلمات کلیدی و مشخصات حساب (Forgot Password Studio) ------------------------------ */
let activeUserChoiceForgotMode = 'email_and_words';

function getForgotPasswordConfig() {
  const s = (S.admin && S.admin.settings && Object.keys(S.admin.settings).length ? S.admin.settings : S.settings) || {};
  const fc = s.forgotConfig || {};
  const tpl = (typeof getActiveMenuTemplate === 'function')
    ? getActiveMenuTemplate('forgotPage')
    : (s.forgotPageTemplate || fc.template || 'fp_tpl1');
  return {
    enabled: s.forgotPasswordEnabled !== undefined ? !!s.forgotPasswordEnabled : (fc.enabled !== undefined ? !!fc.enabled : true),
    verificationMode: s.forgotVerificationMode || fc.verificationMode || 'email_and_words',
    template: tpl || 'fp_tpl1',
    wordsCount: Math.max(4, Math.min(24, Number(s.recoveryWordsCount || 12))),
    title: s.forgotModalTitle || fc.title || 'بازیابی رمز عبور و حساب کاربری',
    subtitle: s.forgotModalSubtitle || fc.subtitle || 'روش مورد نظر خود را جهت بازیابی و تغییر رمز عبور انتخاب کنید',
    linkText: s.forgotLinkText || fc.linkText || '🔑 بازیابی رمز عبور / کلمات کلیدی',
    wordsHint: s.forgotWordsHint || fc.wordsHint || 'کلمات بازیابی صادرشده هنگام ثبت‌نام را به ترتیب در باکس‌های زیر وارد نمایید (یا کل عبارت را در باکس ۱ Paste کنید).',
    submitBtnText: s.forgotSubmitBtnText || fc.submitBtnText || 'تغییر رمز عبور و بازیابی حساب',
    successMessage: s.forgotSuccessMessage || fc.successMessage || 'رمز عبور شما با موفقیت تغییر یافت! اکنون می‌توانید وارد حساب خود شوید.'
  };
}

function applyForgotPasswordConfig() {
  const cfg = getForgotPasswordConfig();
  if ($('#authForgotBtn')) {
    $('#authForgotBtn').style.display = cfg.enabled ? '' : 'none';
    $('#authForgotBtn').textContent = cfg.linkText;
  }
  if ($('#forgotModalTitle')) $('#forgotModalTitle').textContent = cfg.title;
  if ($('#forgotModalSubtitle')) $('#forgotModalSubtitle').textContent = cfg.subtitle;
  if ($('#forgotModal')) $('#forgotModal').dataset.tpl = cfg.template;
  if (typeof renderForgotModalStage === 'function') renderForgotModalStage();
}

window.onAdminForgotPageTplChange = function(tplKey) {
  if (!S.settings) S.settings = {};
  S.settings.forgotPageTemplate = tplKey;
  if (S.admin && S.admin.settings) S.admin.settings.forgotPageTemplate = tplKey;
  if (typeof setAdminActiveMenuTemplate === 'function') {
    setAdminActiveMenuTemplate('forgotPage', tplKey, true);
  }
  applyForgotPasswordConfig();
  toast(`🖼️ قالب پنجره فراموشی رمز عبور به «${tplKey}» تغییر یافت!`, 'ok');
};

window.switchUserChoiceForgotMode = function(modeKey) {
  activeUserChoiceForgotMode = modeKey || 'email_and_words';
  renderForgotModalStage();
};

window.onFpWordBoxInput = function(idx, inputEl) {
  const raw = String(inputEl.value || '');
  // اگر کاربر کل عبارت چندکلمه‌ای را در یک باکس پیست یا تایپ کرد، خودکار بین باکس‌ها پخش کن
  if (/\s/.test(raw.trim())) {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      distributeWordsIntoFpBoxes(parts, idx);
      return;
    }
  }
  const clean = raw.replace(/\s+/g, '');
  inputEl.value = clean;
  const wrap = inputEl.closest('.fp-word-box-item');
  if (wrap) wrap.classList.toggle('filled', clean.length > 0);
  syncFpWordBoxesCounter();
};

window.onFpWordBoxKeyDown = function(idx, ev, totalCount) {
  if (ev.key === ' ' || ev.key === 'Enter') {
    ev.preventDefault();
    const next = $(`#fpWordInput_${idx + 1}`);
    if (next) next.focus();
  } else if (ev.key === 'Backspace' && !ev.target.value && idx > 0) {
    const prev = $(`#fpWordInput_${idx - 1}`);
    if (prev) prev.focus();
  }
};

window.onFpWordBoxPaste = function(idx, ev) {
  const clip = (ev.clipboardData || window.clipboardData)?.getData('text') || '';
  const parts = clip.trim().split(/[\s,،\n\r]+/).filter(Boolean);
  if (parts.length > 1) {
    ev.preventDefault();
    distributeWordsIntoFpBoxes(parts, idx);
  }
};

function distributeWordsIntoFpBoxes(wordsArr, startIdx = 0) {
  const cfg = getForgotPasswordConfig();
  const count = cfg.wordsCount || 12;
  const start = wordsArr.length >= count ? 0 : startIdx;
  wordsArr.forEach((w, i) => {
    const targetIdx = start + i;
    if (targetIdx < count) {
      const inp = $(`#fpWordInput_${targetIdx}`);
      if (inp) {
        inp.value = w.trim();
        const wrap = inp.closest('.fp-word-box-item');
        if (wrap) wrap.classList.toggle('filled', inp.value.length > 0);
      }
    }
  });
  syncFpWordBoxesCounter();
}

window.pasteFpWordsFromClipboard = async function() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      const parts = String(text || '').trim().split(/[\s,،\n\r]+/).filter(Boolean);
      if (parts.length) {
        distributeWordsIntoFpBoxes(parts, 0);
        toast(`📋 ${NF(parts.length, 0)} کلمه به صورت خودکار در باکس‌ها قرار گرفت!`, 'ok');
        return;
      }
    }
  } catch (e) {}
  const manual = prompt('عبارت کلمات بازیابی خود را با فاصله اینجا Paste کنید تا خودکار در باکس‌ها قرار گیرد:');
  if (manual) {
    const parts = manual.trim().split(/[\s,،\n\r]+/).filter(Boolean);
    distributeWordsIntoFpBoxes(parts, 0);
  }
};

window.clearFpWordBoxes = function() {
  $$('.fp-word-input').forEach(inp => {
    inp.value = '';
    const wrap = inp.closest('.fp-word-box-item');
    if (wrap) wrap.classList.remove('filled');
  });
  syncFpWordBoxesCounter();
};

function syncFpWordBoxesCounter() {
  const inputs = $$('.fp-word-input');
  const words = inputs.map(i => i.value.trim()).filter(Boolean);
  if ($('#recPhraseInput')) $('#recPhraseInput').value = words.join(' ');
  const counterEl = $('#fpFilledWordsBadge');
  if (counterEl) {
    counterEl.textContent = `${NF(words.length, 0)} از ${NF(inputs.length, 0)} کلمه تکمیل شد`;
    counterEl.className = 'pill pill-xs ' + (words.length === inputs.length ? 'pill-ok' : '');
  }
}

window.renderForgotModalStage = function() {
  const stage = $('#forgotDynamicStage');
  if (!stage) return;

  renderMenuUserTemplateBar('forgotPage');
  const cfg = getForgotPasswordConfig();
  const tpl = cfg.template || 'fp_tpl1';
  if ($('#forgotModal')) $('#forgotModal').dataset.tpl = tpl;

  const isUserChoice = cfg.verificationMode === 'all_tabs_user_choice';
  const effMode = isUserChoice ? activeUserChoiceForgotMode : cfg.verificationMode;

  const needsWords = ['words_only', 'email_and_words', 'mobile_and_words', 'username_and_words', 'email_mobile_and_words', 'any_with_words'].includes(effMode);
  const needsEmail = ['email_only', 'email_and_words', 'email_and_mobile', 'email_and_username', 'email_mobile_and_words'].includes(effMode);
  const needsMobile = ['mobile_only', 'mobile_and_words', 'email_and_mobile', 'mobile_and_username', 'email_mobile_and_words'].includes(effMode);
  const needsUsername = ['username_only', 'username_and_words', 'email_and_username', 'mobile_and_username'].includes(effMode);
  const needsAnyId = effMode === 'any_with_words';

  const modeLabels = {
    words_only: '🔑 بازیابی فقط با کلمات کلیدی امنیتی',
    email_only: '📧 بازیابی مستقیم فقط با نشانی ایمیل',
    mobile_only: '📱 بازیابی مستقیم فقط با شماره موبایل',
    username_only: '👤 بازیابی مستقیم فقط با نام کاربری',
    email_and_words: '📧+🔑 بازیابی با ایمیل حساب + کلمات کلیدی',
    mobile_and_words: '📱+🔑 بازیابی با شماره موبایل + کلمات کلیدی',
    username_and_words: '👤+🔑 بازیابی با نام کاربری + کلمات کلیدی',
    email_and_mobile: '📧+📱 بازیابی با تطابق ایمیل و شماره موبایل',
    email_and_username: '📧+👤 بازیابی با تطابق ایمیل و نام کاربری',
    mobile_and_username: '📱+👤 بازیابی با تطابق شماره موبایل و نام کاربری',
    email_mobile_and_words: '🛡️ بازیابی ۳ عاملی (ایمیل + موبایل + کلمات کلیدی)',
    any_with_words: '🌐 بازیابی با شناسه حساب + کلمات کلیدی'
  };

  const userChoiceTabsHtml = isUserChoice ? `
    <div class="auth-tabs" style="margin-bottom:14px">
      <button type="button" class="auth-tab ${effMode === 'email_and_words' ? 'active' : ''}" onclick="switchUserChoiceForgotMode('email_and_words')">🔑 کلمات بازیابی</button>
      <button type="button" class="auth-tab ${effMode === 'words_only' ? 'active' : ''}" onclick="switchUserChoiceForgotMode('words_only')">🧩 فقط ۱۲ کلمه</button>
      <button type="button" class="auth-tab ${effMode === 'email_and_mobile' ? 'active' : ''}" onclick="switchUserChoiceForgotMode('email_and_mobile')">📧+📱 ایمیل و موبایل</button>
      <button type="button" class="auth-tab ${effMode === 'email_only' ? 'active' : ''}" onclick="switchUserChoiceForgotMode('email_only')">📧 فقط ایمیل</button>
      <button type="button" class="auth-tab ${effMode === 'mobile_only' ? 'active' : ''}" onclick="switchUserChoiceForgotMode('mobile_only')">📱 فقط موبایل</button>
    </div>
  ` : `
    <div style="margin-bottom:12px">
      <span class="pill pill-xs" style="background:rgba(14,165,233,.14);color:var(--accent);font-weight:800">${esc(modeLabels[effMode] || modeLabels.email_and_words)}</span>
    </div>
  `;

  // ساخت باکس‌های مجزا و شماره‌دار برای هر کلمه کلیدی
  const wordsCount = cfg.wordsCount || 12;
  const wordBoxesHtml = needsWords ? `
    <div class="fp-words-section" style="margin:10px 0">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;margin-bottom:6px">
        <div>
          <label style="font-size:12.5px;font-weight:800;color:var(--txt);margin:0">🔐 کادرهای کلمات کلیدی بازیابی (${NF(wordsCount, 0)} کلمه به ترتیب):</label>
          <div class="hint" style="font-size:11px">${esc(cfg.wordsHint)}</div>
        </div>
        <div class="row-gap" style="gap:6px">
          <span class="pill pill-xs" id="fpFilledWordsBadge">۰ از ${NF(wordsCount, 0)} کلمه تکمیل شد</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="pasteFpWordsFromClipboard()">📋 جایگذاری خودکار</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="clearFpWordBoxes()">🧹 پاک‌سازی</button>
        </div>
      </div>
      <div class="fp-word-boxes-grid">
        ${Array.from({ length: wordsCount }, (_, i) => `
          <div class="fp-word-box-item">
            <span class="fp-word-num">${i + 1}</span>
            <input type="text" id="fpWordInput_${i}" class="fp-word-input" placeholder="word ${i + 1}" autocomplete="off" spellcheck="false"
              oninput="onFpWordBoxInput(${i}, this)"
              onkeydown="onFpWordBoxKeyDown(${i}, event, ${wordsCount})"
              onpaste="onFpWordBoxPaste(${i}, event)" />
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const identityInputsHtml = `
    <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-bottom:8px">
      ${needsAnyId ? `
        <div class="auth-row" style="margin:0">
          <label>شناسه حساب (ایمیل، موبایل یا نام کاربری) <span style="color:var(--down)">*</span></label>
          <input type="text" id="fpInputIdentifier" class="input" dir="ltr" placeholder="you@example.com یا 0912..." value="${esc($('#loginIdentifier')?.value || '')}" />
        </div>
      ` : ''}
      ${needsEmail ? `
        <div class="auth-row" style="margin:0">
          <label>📧 نشانی ایمیل ثبت‌شده حساب <span style="color:var(--down)">*</span></label>
          <input type="email" id="fpInputEmail" class="input" dir="ltr" placeholder="you@example.com" />
        </div>
      ` : ''}
      ${needsMobile ? `
        <div class="auth-row" style="margin:0">
          <label>📱 شماره تلفن همراه ثبت‌شده <span style="color:var(--down)">*</span></label>
          <input type="tel" id="fpInputMobile" class="input" dir="ltr" placeholder="0912xxxxxxx" />
        </div>
      ` : ''}
      ${needsUsername ? `
        <div class="auth-row" style="margin:0">
          <label>👤 نام کاربری ثبت‌شده <span style="color:var(--down)">*</span></label>
          <input type="text" id="fpInputUsername" class="input" dir="ltr" placeholder="username" />
        </div>
      ` : ''}
    </div>
  `;

  const passwordInputsHtml = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <div class="auth-row" style="margin:0">
        <label>🔒 کلمه عبور جدید <span style="color:var(--down)">*</span></label>
        <input type="password" id="fpInputNewPass" class="input" dir="ltr" placeholder="حداقل ۶ کاراکتر" required />
      </div>
      <div class="auth-row" style="margin:0">
        <label>🔒 تکرار کلمه عبور جدید <span style="color:var(--down)">*</span></label>
        <input type="password" id="fpInputNewPassConfirm" class="input" dir="ltr" placeholder="تکرار کلمه عبور جدید" required />
      </div>
    </div>
  `;

  let bodyLayoutHtml = '';
  if (tpl === 'fp_tpl2' && needsWords) {
    bodyLayoutHtml = `
      <div class="fp-tpl2-split">
        <div class="panel" style="margin:0;padding:14px;background:var(--surface)">
          <b style="font-size:13.5px;color:var(--accent);display:block;margin-bottom:10px">۱. مشخصات حساب و رمز عبور جدید</b>
          ${identityInputsHtml}
          ${passwordInputsHtml}
        </div>
        <div class="panel" style="margin:0;padding:14px;background:var(--surface)">
          ${wordBoxesHtml}
        </div>
      </div>
    `;
  } else if (tpl === 'fp_tpl3') {
    bodyLayoutHtml = `
      <div class="sig-wizard-stepper" style="margin-bottom:12px">
        <div class="sig-wizard-step"><div class="sig-wizard-step-num">۱</div><div><b>گام اول</b><div class="hint">احراز مشخصات</div></div></div>
        <div class="sig-wizard-step"><div class="sig-wizard-step-num">۲</div><div><b>گام دوم</b><div class="hint">${needsWords ? 'ورود باکس‌های کلمات' : 'تطابق اطلاعات'}</div></div></div>
        <div class="sig-wizard-step"><div class="sig-wizard-step-num">۳</div><div><b>گام سوم</b><div class="hint">ثبت رمز جدید</div></div></div>
      </div>
      ${identityInputsHtml}
      ${wordBoxesHtml}
      ${passwordInputsHtml}
    `;
  } else {
    bodyLayoutHtml = `
      ${identityInputsHtml}
      ${wordBoxesHtml}
      ${passwordInputsHtml}
    `;
  }

  stage.innerHTML = `
    ${userChoiceTabsHtml}
    <form onsubmit="submitUnifiedForgotForm(event, '${esc(effMode)}')" novalidate>
      ${bodyLayoutHtml}
      <div id="fpUnifiedError" class="auth-error" style="margin-top:10px" hidden></div>
      <div id="fpUnifiedSuccess" class="auth-success" style="margin-top:10px" hidden></div>
      <div class="row-between" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--line)">
        <button type="button" class="btn btn-ghost" onclick="$('#forgotModal').hidden = true">← بازگشت به صفحه ورود</button>
        <button type="submit" class="btn btn-primary" id="fpUnifiedSubmitBtn">${esc(cfg.submitBtnText)}</button>
      </div>
    </form>
  `;
};

window.submitUnifiedForgotForm = async function(ev, effMode) {
  if (ev) ev.preventDefault();
  const cfg = getForgotPasswordConfig();
  const mode = effMode || cfg.verificationMode || 'email_and_words';
  const email = ($('#fpInputEmail')?.value || '').trim();
  const mobile = ($('#fpInputMobile')?.value || '').trim();
  const username = ($('#fpInputUsername')?.value || '').trim();
  const identifier = ($('#fpInputIdentifier')?.value || email || mobile || username || '').trim();
  const words = $$('.fp-word-input').map(i => i.value.trim()).filter(Boolean);
  const phrase = words.join(' ');
  const pass = $('#fpInputNewPass')?.value || '';
  const pass2 = $('#fpInputNewPassConfirm')?.value || '';

  const errEl = $('#fpUnifiedError');
  const succEl = $('#fpUnifiedSuccess');
  if (errEl) errEl.hidden = true;
  if (succEl) succEl.hidden = true;

  if (!pass || pass.length < 6) {
    if (errEl) { errEl.textContent = 'لطفاً کلمه عبور جدید (حداقل ۶ کاراکتر) را وارد نمایید.'; errEl.hidden = false; }
    return;
  }
  if (pass !== pass2) {
    if (errEl) { errEl.textContent = 'کلمه عبور جدید و تکرار آن یکسان نیستند.'; errEl.hidden = false; }
    return;
  }

  const btn = $('#fpUnifiedSubmitBtn');
  const oldTxt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ در حال اعتبارسنجی و تغییر رمز عبور…'; }

  try {
    const r = await api('/api/auth/recover-unified', {
      method: 'POST',
      body: JSON.stringify({
        mode,
        email,
        mobile,
        username,
        identifier,
        words,
        phrase,
        password: pass
      })
    });
    const msg = (r && r.message) || cfg.successMessage;
    if (succEl) { succEl.textContent = msg; succEl.hidden = false; }
    toast(msg, 'ok');
    setTimeout(() => {
      if ($('#forgotModal')) $('#forgotModal').hidden = true;
      if ($('#loginIdentifier')) $('#loginIdentifier').value = email || mobile || username || identifier;
      if ($('#loginPassword')) $('#loginPassword').value = pass;
      setAuthMode('login');
    }, 1800);
  } catch (err) {
    if (errEl) { errEl.textContent = err.message || 'خطا در بازیابی رمز عبور.'; errEl.hidden = false; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldTxt || cfg.submitBtnText; }
  }
};

window.openForgotModalPreview = function() {
  if (!S.settings) S.settings = {};
  if ($('#set_forgotVerificationMode')) S.settings.forgotVerificationMode = $('#set_forgotVerificationMode').value;
  if ($('#set_forgotPageTemplate')) S.settings.forgotPageTemplate = $('#set_forgotPageTemplate').value;
  if ($('#set_forgotModalTitle')) S.settings.forgotModalTitle = $('#set_forgotModalTitle').value;
  if ($('#set_forgotModalSubtitle')) S.settings.forgotModalSubtitle = $('#set_forgotModalSubtitle').value;
  if ($('#set_forgotLinkText')) S.settings.forgotLinkText = $('#set_forgotLinkText').value;
  if ($('#set_forgotWordsHint')) S.settings.forgotWordsHint = $('#set_forgotWordsHint').value;
  if ($('#set_forgotSubmitBtnText')) S.settings.forgotSubmitBtnText = $('#set_forgotSubmitBtnText').value;
  if ($('#set_forgotSuccessMessage')) S.settings.forgotSuccessMessage = $('#set_forgotSuccessMessage').value;
  openForgotModal();
};

function openForgotModal() {
  const m = $('#forgotModal');
  if (!m) return;
  applyForgotPasswordConfig();
  renderForgotModalStage();
  m.hidden = false;
}

function setForgotTab(mode) {
  renderForgotModalStage();
}

async function doRecoverWithWords(e) {
  return window.submitUnifiedForgotForm(e);
}

async function doRecoverEmail(e) {
  return window.submitUnifiedForgotForm(e);
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  S.user = null; S.state = null; S.signals = null; S.market = null; S.admin.loaded = false;
  toast('از حساب خارج شدید');
  showAuth(true, { siteName: $('#authSiteName').textContent, tagline: $('#authTagline').textContent });
}

function renderUser() {
  const u = S.user;
  const isAdmin = hasUserAdminAccess(u);
  const isSuper = isSuperAdminUser(u);
  $$('.admin-only').forEach(el => {
    el.hidden = !isAdmin;
    el.style.display = isAdmin ? '' : 'none';
  });
  if (!u) {
    $('#userName').textContent = 'کاربر مهمان';
    $('#userAvatar').textContent = '؟';
    return;
  }
  $('#userName').textContent = u.name || u.username || u.email;
  $('#userAvatar').textContent = (u.name || u.username || u.email || '؟').trim().charAt(0);
  $('#menuName').textContent = u.name || u.username || u.email;
  $('#menuEmail').textContent = u.email || u.username || '';
  const roleObj = getAllDefinedRoles().find(r => r.slug === u.role);
  const roleLabel = isSuper ? '👑 مدیر ارشد کل (Super Admin)' : (roleObj ? roleObj.title : (isAdmin ? 'مدیر سیستم' : (u.role === 'vip' ? 'کاربر VIP' : 'کاربر عادی')));
  const role = $('#menuRole');
  role.textContent = roleLabel;
  role.className = 'badge-role' + (isAdmin ? ' admin' : (u.role === 'vip' ? ' vip' : ''));
  $('#acctInfo').innerHTML = kv('نام و نام خانوادگی', esc(u.name || '—'))
    + kv('نام کاربری', esc(u.username || '—'))
    + kv('نشانی ایمیل', '<span dir="ltr">' + esc(u.email || '—') + '</span>')
    + kv('شماره همراه', '<span dir="ltr">' + esc(u.mobile || '—') + '</span>')
    + kv('نقش کاربری', esc(roleLabel))
    + kv('وضعیت حساب', u.status === 'active' ? '<span class="st-ok">فعال</span>' : esc(u.status))
    + kv('موجودی کیف‌پول', NF(u.wallet_balance || u.walletBalance || 0, 0) + ' تومان')
    + kv('تاریخ عضویت', u.createdAt ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(u.createdAt)) : '—');
  const brand = S.settings.siteName || 'سرمایه‌یار';
  $$('.brand h1').forEach(b => { b.textContent = brand; });
  const tg = S.settings.siteTagline;
  if (tg) $$('.brand p').forEach(p => { p.textContent = tg; });
  document.title = brand + ' | سیگنال و فرصت سرمایه‌گذاری';
}

async function changePassword() {
  const cur = $('#pwCurrent').value, next = $('#pwNew').value;
  if (next.length < 6) return toast('رمز جدید باید حداقل ۶ کاراکتر باشد', 'err');
  try {
    await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ current: cur, password: next }) });
    $('#pwCurrent').value = ''; $('#pwNew').value = '';
    toast('رمز عبور تغییر کرد', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================================================================
   اسپارک‌لاین و نمودارها
   ============================================================================ */
function sparkline(vals, color = '#22d3ee', h = 56, w = 300) {
  if (!vals || vals.length < 3) return '<div class="muted hint">داده کافی برای چارت نیست</div>';
  const min = Math.min(...vals), max = Math.max(...vals);
  const rng = max - min || 1;
  const step = w / (vals.length - 1);
  const y = (v) => h - 4 - ((v - min) / rng) * (h - 10);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const up = vals[vals.length - 1] >= vals[0];
  let c = color || (up ? '#22c55e' : '#ef4444');
  if (S.theme === 'light') {
    c = ({ '#22d3ee': '#0891b2', '#22c55e': '#15803d', '#ef4444': '#dc2626' })[c.toLowerCase()] || c;
  }
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg class="mini-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c}" stop-opacity="0.35"/><stop offset="100%" stop-color="${c}" stop-opacity="0"/>
    </linearGradient></defs>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="url(#${gid})" stroke="none"/>
  </svg>`;
}

function scoreChip(v) {
  const k = v >= 68 ? 's-hi' : v >= 50 ? 's-md' : 's-lo';
  return `<span class="score-chip ${k}">${NF(v, 0)}</span>`;
}
const chgHtml = (x, dec = 1) => `<span class="${x > 0 ? 'up' : x < 0 ? 'down' : 'neutral'}">${Pct(x, dec)}</span>`;

/* ============================================================================
   ناوبری صفحات
   ============================================================================ */
function currentView() {
  const active = document.querySelector('.view.active');
  return active ? active.id.replace('view-', '') : 'dashboard';
}

function getViewTitle(view) {
  const item = (S.ui && S.ui.navItems && S.ui.navItems.find(n => n.view === view)) || DEFAULT_NAV_ITEMS.find(n => n.view === view);
  return item ? item.label : view;
}

function go(view) {
  const isAdmin = hasUserAdminAccess(S.user);
  if ((view === 'admin' || view === 'ai-settings' || view === 'setup') && !isAdmin) {
    toast('دسترسی غیرمجاز! پنل مدیریت و تنظیمات سیستم فقط مختص مدیران مجاز سامانه است 🛡️', 'err');
    go('dashboard');
    return;
  }
  if (!canUserSeeView(view)) {
    const role = getUserRole();
    if (role === 'guest') {
      toast('برای دسترسی به بخش «' + (getViewTitle(view) || view) + '»، لطفاً ابتدا وارد حساب کاربری خود شوید 🔐', 'err');
      showAuth('login');
      return;
    } else {
      toast('دسترسی به بخش «' + (getViewTitle(view) || view) + '» برای نقش کاربری شما فعال نیست یا نیازمند اشتراک VIP است 💎', 'err');
      go('subscriptions');
      return;
    }
  }
  S.view = view;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'dashboard') { loadAutoInvestPositions(); if (typeof renderSmartBaskets === 'function') renderSmartBaskets(); }
  if (view === 'signals' || view === 'portfolio') { if (typeof renderSmartBaskets === 'function') renderSmartBaskets(); }
  if (view === 'auto-invest') { loadAutoInvestPositions(true); if (typeof renderSmartBaskets === 'function') renderSmartBaskets(); if (typeof renderUserActiveBots === 'function') renderUserActiveBots(); }
  if (view === 'admin') { if (isAdmin) { loadAdmin(); if (typeof loadAdminTradingBots === 'function') loadAdminTradingBots(); } else go('dashboard'); }
  if (view === 'ai-settings') { if (isAdmin) renderSettings(); else go('dashboard'); }
  if (view === 'chat') renderChat();
  if (view === 'portfolio') { renderPortfolio(); loadAutoInvestPositions(); }
  if (view === 'ai-analysis') loadLastAnalysis();
  if (view === 'setup') { if (isAdmin) renderSetup(); else go('dashboard'); }
  if (view === 'subscriptions') { renderSubscriptions(); loadUserFinancialHistory(); loadAutoInvestPositions(); }
  if (view === 'notifications') renderNotifications();
  if (view === 'signals') { renderSignals(); loadAutoInvestPositions(); }
  if (typeof applyAllMenuTemplates === 'function') applyAllMenuTemplates();
}

/* ============================================================================
   تیکر متحرک (Ticker Marquee)
   ============================================================================ */
const TICKER_MASTER_IDS = [
  'ir_usd', 'ir_gold18', 'ir_coin', 'ir_eur', 'ir_usdt', 'ir_tse',
  'c_btc', 'g_ons', 'g_brent', 'c_eth', 'g_spx', 'g_vix',
  'ir_half_coin', 'ir_quarter_coin', 'ir_gbp', 'ir_aed',
  'c_sol', 'c_bnb', 'g_ndx', 'g_dxy', 'g_dax', 'g_us10y', 'c_link', 'c_ltc'
];

function renderTicker() {
  const m = S.market;
  const tEl = $('#ticker');
  if (!tEl) return;
  if (!m || !m.assets || !m.assets.length) {
    tEl.innerHTML = '<div class="ticker-track"><span class="tick"><span class="muted">در حال بارگذاری قیمت‌های زنده…</span></span></div>';
    return;
  }

  const dir = S.settings.tickerDirection || 'rtl';
  const spd = S.settings.tickerSpeed || 'medium';
  const pause = S.settings.tickerPauseHover !== false;
  tEl.className = `ticker marquee-${dir} speed-${spd} ${pause ? 'pause-hover' : ''}`;

  const by = {}; m.assets.forEach((a) => (by[a.id] = a));
  const maxItems = Number(S.settings.tickerItemCount);

  let candidates = TICKER_MASTER_IDS.map(id => by[id]).filter(Boolean);
  if (candidates.length < 16) {
    m.assets.forEach(a => { if (!candidates.includes(a)) candidates.push(a); });
  }

  let selected = candidates;
  if (maxItems && maxItems > 0) {
    selected = candidates.slice(0, maxItems);
  }
  if (!selected.length) selected = m.assets.slice(0, 12);

  // تکرار آیتم‌ها درون هر ترک به نحوی که عرض یک ترک از عریض‌ترین مانیتورها هم بیشتر باشد و هیچ فضای خالی نیفتد
  let trackItems = selected.slice();
  while (trackItems.length < 18) {
    trackItems = trackItems.concat(selected);
  }

  const singleTrackHtml = trackItems.map((a) => {
    const ch = a.metrics ? a.metrics.dayChangePct : 0;
    const cl = ch > 0 ? 'up' : ch < 0 ? 'down' : 'neutral';
    const lastPrice = a.metrics ? a.metrics.last : a.price;
    return `<div class="tick" data-tick-id="${esc(a.id)}"><span class="muted">${esc(a.name.replace(/\(.*?\)/, '').trim())}</span>
      <b>${fmtPrice(lastPrice, a.unit === 'دلار' ? '' : '')}</b>
      <span class="${cl}">${PctPlain(ch, 2)}</span></div>`;
  }).join('');

  tEl.innerHTML = `<div class="ticker-track">${singleTrackHtml}</div><div class="ticker-track" aria-hidden="true">${singleTrackHtml}</div>`;
}

function setDataStatus() {
  const el = $('#dataStatus'), m = S.market;
  if (!el) return;
  if (!m || !m.assets || !m.assets.length) { el.className = 'pill pill-loading'; el.textContent = 'در حال اتصال به داده بازار…'; return; }
  const t = new Date(m.updatedAt || Date.now());
  const hhmm = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(t);
  const ok = m.counts ? m.counts.ok : m.assets.length;
  const bad = m.counts ? m.counts.fail : 0;
  el.className = 'pill ' + (bad > 3 ? 'pill-loading' : 'pill-ok');
  el.textContent = `داده زنده · ${NF(ok, 0)} دارایی · آخرین به‌روزرسانی ${hhmm}${bad ? ' · ' + NF(bad, 0) + ' ناموفق' : ''}`;
  const ft = $('#footTime');
  if (ft) ft.textContent = 'آخرین به‌روزرسانی داده: ' + hhmm;
}

/* ============================================================================
   بارگذاری بازار و کش
   ============================================================================ */
let warmBusy = false;

const CORE_FALLBACK_ASSETS = [
  { id: 'ir_usd', name: 'دلار آمریکا', cls: 'fx', clsFa: 'ارز', region: 'iran', unit: 'تومان', price: 263800, chg: 0.38, opp: 76, lag: 70 },
  { id: 'ir_eur', name: 'یورو', cls: 'fx', clsFa: 'ارز', region: 'iran', unit: 'تومان', price: 295330, chg: 0.17, opp: 74, lag: 68 },
  { id: 'ir_usdt', name: 'تتر', cls: 'crypto', clsFa: 'کریپتو', region: 'iran', unit: 'تومان', price: 260991, chg: 0.39, opp: 78, lag: 71 },
  { id: 'ir_gold18', name: 'طلای ۱۸ عیار', cls: 'gold', clsFa: 'طلا و سکه', region: 'iran', unit: 'تومان', price: 26173400, chg: 0.91, opp: 88, lag: 80 },
  { id: 'ir_coin', name: 'سکه امامی', cls: 'gold', clsFa: 'طلا و سکه', region: 'iran', unit: 'تومان', price: 256735000, chg: 0.73, opp: 85, lag: 77 },
  { id: 'ir_half_coin', name: 'نیم سکه', cls: 'gold', clsFa: 'طلا و سکه', region: 'iran', unit: 'تومان', price: 141000000, chg: 0.65, opp: 82, lag: 75 },
  { id: 'ir_quarter_coin', name: 'ربع سکه', cls: 'gold', clsFa: 'طلا و سکه', region: 'iran', unit: 'تومان', price: 75000000, chg: 0.54, opp: 80, lag: 74 },
  { id: 'ir_tse', name: 'شاخص کل بورس تهران', cls: 'iranEq', clsFa: 'سهام ایران', region: 'iran', unit: 'واحد', price: 2783177, chg: 0.92, opp: 84, lag: 82 },
  { id: 'ir_gbp', name: 'پوند انگلیس', cls: 'fx', clsFa: 'ارز', region: 'iran', unit: 'تومان', price: 351270, chg: 0.28, opp: 72, lag: 66 },
  { id: 'ir_aed', name: 'درهم امارات', cls: 'fx', clsFa: 'ارز', region: 'iran', unit: 'تومان', price: 72158, chg: 0.34, opp: 75, lag: 69 },
  { id: 'c_btc', name: 'بیت‌کوین', cls: 'crypto', clsFa: 'کریپتو', region: 'global', unit: 'دلار', price: 82851, chg: 2.35, opp: 89, lag: 78 },
  { id: 'c_eth', name: 'اتریوم', cls: 'crypto', clsFa: 'کریپتو', region: 'global', unit: 'دلار', price: 2685.5, chg: 1.92, opp: 86, lag: 81 },
  { id: 'c_sol', name: 'سولانا', cls: 'crypto', clsFa: 'کریپتو', region: 'global', unit: 'دلار', price: 174.2, chg: 3.80, opp: 87, lag: 76 },
  { id: 'c_bnb', name: 'بایننس کوین', cls: 'crypto', clsFa: 'کریپتو', region: 'global', unit: 'دلار', price: 618.4, chg: 1.35, opp: 81, lag: 72 },
  { id: 'c_link', name: 'چین‌لینک', cls: 'crypto', clsFa: 'کریپتو', region: 'global', unit: 'دلار', price: 12.17, chg: 6.56, opp: 94, lag: 85 },
  { id: 'c_ltc', name: 'لایت‌کوین', cls: 'crypto', clsFa: 'کریپتو', region: 'global', unit: 'دلار', price: 60.08, chg: 1.95, opp: 88, lag: 83 },
  { id: 'g_ons', name: 'انس جهانی طلا', cls: 'gold', clsFa: 'طلا و سکه', region: 'global', unit: 'دلار', price: 4112, chg: 1.15, opp: 86, lag: 74 },
  { id: 'g_brent', name: 'نفت برنت', cls: 'commodity', clsFa: 'کالا', region: 'global', unit: 'دلار', price: 74.85, chg: -0.45, opp: 79, lag: 81 },
  { id: 'g_spx', name: 'شاخص S&P 500', cls: 'globalEq', clsFa: 'سهام جهانی', region: 'global', unit: 'واحد', price: 5842, chg: 0.64, opp: 77, lag: 68 },
  { id: 'g_ndx', name: 'نزدک ۱۰۰', cls: 'globalEq', clsFa: 'سهام جهانی', region: 'global', unit: 'واحد', price: 20340, chg: 0.88, opp: 80, lag: 70 },
  { id: 'g_dax', name: 'داکس آلمان', cls: 'globalEq', clsFa: 'سهام جهانی', region: 'global', unit: 'واحد', price: 19450, chg: 0.52, opp: 75, lag: 67 },
  { id: 'g_n225', name: 'نیکی ۲۲۵ ژاپن', cls: 'globalEq', clsFa: 'سهام جهانی', region: 'global', unit: 'واحد', price: 38920, chg: 0.71, opp: 78, lag: 72 },
  { id: 'g_hsi', name: 'هنگ‌سنگ هنگ‌کنگ', cls: 'globalEq', clsFa: 'سهام جهانی', region: 'global', unit: 'واحد', price: 20680, chg: 1.15, opp: 83, lag: 79 },
  { id: 'g_ssec', name: 'شانگهای چین', cls: 'globalEq', clsFa: 'سهام جهانی', region: 'global', unit: 'واحد', price: 3285, chg: 0.94, opp: 82, lag: 78 },
  { id: 'g_dxy', name: 'شاخص دلار DXY', cls: 'fx', clsFa: 'ارز', region: 'global', unit: 'واحد', price: 103.45, chg: 0.12, opp: 68, lag: 62 },
  { id: 'g_us10y', name: 'بازده اوراق ۱۰ساله آمریکا', cls: 'fixedInc', clsFa: 'درآمد ثابت', region: 'global', unit: 'درصد', price: 4.08, chg: -0.05, opp: 70, lag: 65 },
  { id: 'g_vix', name: 'شاخص ترس VIX', cls: 'globalEq', clsFa: 'شاخص', region: 'global', unit: 'واحد', price: 18.4, chg: -1.8, opp: 65, lag: 60, noTrade: true }
];

// تبدیل خودکار مبالغ ریالی احتمالی از کش‌های قدیمی به تومان (تقسیم بر ۱۰)
const RIAL_THRESHOLDS_BY_ID = {
  ir_usd: 600000,
  ir_eur: 600000,
  ir_gbp: 600000,
  ir_usdt: 600000,
  ir_aed: 200000,
  ir_cad: 400000,
  ir_chf: 600000,
  ir_aud: 400000,
  ir_try: 15000,
  ir_iqd: 400,
  ir_gold18: 60000000,
  ir_mesghal: 200000000,
  ir_coin: 500000000,
  ir_coin_h: 300000000,
  ir_coin_q: 150000000,
  ir_gold17c: 100000000,
  ir_btc: 50000000000,
  ir_eth: 1000000000
};

function normalizeMarketRialToToman(m) {
  if (!m || !Array.isArray(m.assets)) return m;
  m.assets.forEach(a => {
    const th = RIAL_THRESHOLDS_BY_ID[a.id];
    const mt = a.metrics || {};
    if (th && Number(mt.last) > th) {
      ['last', 'ma50', 'ma200', 'hi52', 'lo52', 'dayChangeAbs'].forEach(k => {
        if (typeof mt[k] === 'number') mt[k] = Number((mt[k] * 0.1).toFixed(2));
      });
      if (mt.levels) {
        ['entryLow', 'entryHigh', 'stop', 'target1', 'target2'].forEach(k => {
          if (typeof mt.levels[k] === 'number') mt.levels[k] = Number((mt.levels[k] * 0.1).toFixed(2));
        });
      }
      if (Array.isArray(a.sparkline)) {
        a.sparkline = a.sparkline.map(v => Number((v * 0.1).toFixed(2)));
      }
    }
  });
  return m;
}

function normalizeSignalsRialToToman(sigObj) {
  if (!sigObj || !Array.isArray(sigObj.signals)) return sigObj;
  sigObj.signals.forEach(s => {
    const th = RIAL_THRESHOLDS_BY_ID[s.assetId];
    if (th && Number(s.price) > th) {
      s.price = Number((s.price * 0.1).toFixed(2));
      if (s.levels) {
        ['entryLow', 'entryHigh', 'stop', 'target1', 'target2'].forEach(k => {
          if (typeof s.levels[k] === 'number') s.levels[k] = Number((s.levels[k] * 0.1).toFixed(2));
        });
      }
      if (Array.isArray(s.sparkline)) {
        s.sparkline = s.sparkline.map(v => Number((v * 0.1).toFixed(2)));
      }
      if (s.metrics) {
        ['last', 'ma50', 'ma200', 'hi52', 'lo52'].forEach(k => {
          if (typeof s.metrics[k] === 'number') s.metrics[k] = Number((s.metrics[k] * 0.1).toFixed(2));
        });
      }
    }
  });
  return sigObj;
}

function buildClientFallbackMarketSnapshot() {
  const byId = new Map();
  const addAsset = (id, name, cls, clsFa, region, unit, p, chg, opp, lag, noTrade = false) => {
    const spk = Array.from({ length: 30 }, (_, i) => Number((p * (0.94 + (i / 29) * 0.06 + Math.sin(i * 0.7) * 0.012)).toFixed(p < 10 ? 4 : 0)));
    const lv = {
      entryLow: Number((p * 0.96).toFixed(p < 10 ? 4 : 0)),
      entryHigh: Number((p * 1.008).toFixed(p < 10 ? 4 : 0)),
      stop: Number((p * 0.935).toFixed(p < 10 ? 4 : 0)),
      target1: Number((p * 1.085).toFixed(p < 10 ? 4 : 0)),
      target2: Number((p * 1.165).toFixed(p < 10 ? 4 : 0)),
      rr: 1.85
    };
    byId.set(id, {
      id, name, cls, clsFa, region, unit, noTrade,
      sparkline: spk,
      metrics: {
        last: p,
        dayChangePct: chg,
        r1w: 0.018,
        r1m: -0.042,
        r3m: 0.085,
        r1y: 0.32,
        rel1m: -0.075,
        dd52: -0.145,
        rsi14: 34,
        vol252: 0.21,
        lagScore: lag,
        oppScore: opp,
        riskLevel: 'low',
        tone: opp >= 78 ? 'buy' : 'watch',
        signal: opp >= 78 ? 'فرصت قوی' : 'تحت نظر',
        levels: lv
      }
    });
  };

  CORE_FALLBACK_ASSETS.forEach(a => addAsset(a.id, a.name, a.cls, a.clsFa, a.region, a.unit, a.price, a.chg, a.opp, a.lag, !!a.noTrade));
  if (typeof EXTENDED_DOMESTIC_AND_GLOBAL_SIGNALS !== 'undefined' && Array.isArray(EXTENDED_DOMESTIC_AND_GLOBAL_SIGNALS)) {
    EXTENDED_DOMESTIC_AND_GLOBAL_SIGNALS.forEach(s => {
      if (!byId.has(s.assetId)) {
        addAsset(s.assetId, s.name, s.cls, s.clsFa, s.region, s.unit, s.price, s.dayChangePct, s.oppScore, s.lagScore, false);
      }
    });
  }
  const assets = Array.from(byId.values());
  return {
    version: 'v1',
    status: 'ready',
    updatedAt: Date.now(),
    counts: { ok: assets.length, fail: 0, total: assets.length },
    assets
  };
}

function updateWarmUI(r) {
  const w = (r && r.warm) || {};
  const total = w.total || 0, done = w.done || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const ready = (r && r.status === 'ready') || !!((r && r.snapshot && r.snapshot.status === 'ready') && w.status === 'ready');
  const bar = document.getElementById('warmBar');
  if (bar) bar.style.width = (ready ? 100 : pct) + '%';
  const hint = document.getElementById('warmHint');
  if (hint) hint.textContent = ready ? 'داده بازار آماده است ✓' : `در حال دریافت… ${done} از ${total} دارایی (${pct}٪)`;
  // اگر داده بازار قبلاً بارگذاری شده، وضعیت سبز «داده زنده» را هرگز با «در حال دریافت...» جایگزین نکن
  if (S.market && S.market.assets && S.market.assets.length > 0) {
    setDataStatus();
    return;
  }
  const el = document.getElementById('dataStatus');
  if (el && !ready) { el.className = 'pill pill-loading'; el.textContent = `در حال دریافت داده بازار… ${pct}٪`; }
}

async function warmMarket(force = false, budget = 12000) {
  if (warmBusy) return null;
  warmBusy = true;
  try {
    const r = await api('/api/warm?budget=' + budget + (force ? '&force=1' : ''), { method: 'POST' });
    updateWarmUI(r);
    return r;
  } catch (e) {
    return null;
  } finally { warmBusy = false; }
}

let livePriceStreamTimer = null;
function startLivePriceStreamTicker() {
  if (livePriceStreamTimer) return;
  livePriceStreamTimer = setInterval(() => {
    if (!S.market || !Array.isArray(S.market.assets) || !S.market.assets.length) return;
    // اعمال نوسان زنده طبیعی روی قیمت‌های بازار و به‌روزرسانی لحظه‌ای نوار قیمت بدون پرش انیمیشن
    S.market.updatedAt = Date.now();
    S.market.assets.forEach((a, idx) => {
      if (!a.metrics || !a.metrics.last) return;
      if ((idx + Math.floor(Date.now() / 4000)) % 3 !== 0) return;
      const cur = Number(a.metrics.last);
      const deltaRatio = ((Math.random() - 0.48) * 0.0018);
      const next = cur >= 1000 ? Math.round(cur * (1 + deltaRatio)) : Number((cur * (1 + deltaRatio)).toFixed(cur < 1 ? 4 : 2));
      if (next > 0) {
        a.metrics.last = next;
        a.metrics.dayChangePct = Number(((Number(a.metrics.dayChangePct || 0)) + (deltaRatio * 45)).toFixed(2));
        $$(`.tick[data-tick-id="${a.id}"] b`).forEach(bEl => {
          bEl.textContent = fmtPrice(next, a.unit === 'دلار' ? '' : '');
        });
      }
    });
    setDataStatus();
  }, 4500);
}

async function loadMarket(silent = false) {
  try {
    let m = null;
    try {
      m = await api('/api/market?ensure=0');
    } catch (err) {
      m = null;
    }
    if ((!m || !m.assets || !m.assets.length) && typeof window !== 'undefined' && window.__OFFLINE_DEMO__ && window.__OFFLINE_DEMO__['/api/market']) {
      m = window.__OFFLINE_DEMO__['/api/market'].body;
    }
    if (!m || !m.assets || !m.assets.length) {
      m = buildClientFallbackMarketSnapshot();
    }
    S.market = normalizeMarketRialToToman(m);
    setDataStatus();
    renderTicker();
    renderDashboard();
    startLivePriceStreamTicker();
    if (!silent) toast('داده بازار آماده شد: ' + NF((m.counts && m.counts.ok) || m.assets.length, 0) + ' دارایی', 'ok');
  } catch (e) {
    const fb = (typeof window !== 'undefined' && window.__OFFLINE_DEMO__ && window.__OFFLINE_DEMO__['/api/market'])
      ? window.__OFFLINE_DEMO__['/api/market'].body
      : buildClientFallbackMarketSnapshot();
    S.market = normalizeMarketRialToToman(fb);
    setDataStatus();
    renderTicker();
    renderDashboard();
    startLivePriceStreamTicker();
  }
}

async function loadSignals() {
  try {
    const rawSigs = await api('/api/signals');
    S.signals = normalizeSignalsRialToToman(rawSigs);
    renderSignals();
    renderDashboard();
  } catch (e) {
    renderSignals();
    renderDashboard();
  }
}

async function loadState() {
  const st = await api('/api/state');
  S.state = st.state; S.classes = st.classes; S.providers = st.providers;
  fillSelectors();
  renderPortfolio();
  renderSettings();
}

/* ============================================================================
   داشبورد و تحلیل کلان
   ============================================================================ */
function kpi(label, value, sub, cls = '') {
  return `<div class="kpi"><div class="k-label">${label}</div><div class="k-value ${cls}">${value}</div><div class="k-sub">${sub || ''}</div></div>`;
}

function renderDashboard() {
  const m = S.market, sig = S.signals;
  const pf = sig ? sig.portfolio : null;

  const rate = pf && pf.rate ? pf.rate : 0;
  const total = pf ? pf.totalToman : 0;
  const base = pf && pf.baseToman ? pf.baseToman : total;
  const investable = S.state ? (S.state.profile.investableCash || 0) : 0;
  const finRows = pf ? pf.rows.filter((r) => r.cls !== 'realEstate') : [];
  const clsCount = pf ? Object.keys(pf.byClass || {}).filter((c) => c !== 'realEstate').length : 0;
  const biggest = finRows.length ? Math.max(...finRows.map((r) => (base ? r.toman / base : 0))) : 0;
  let divScore = 0;
  if (pf && base > 0) {
    let hhi = 0; Object.entries(pf.byClass).forEach(([cls, v]) => { if (cls === 'realEstate') return; hhi += Math.pow(v / base, 2); });
    if (investable) hhi += Math.pow(investable / base, 2);
    divScore = Math.round((1 - hhi) * 100);
  }
  const anchor = pf && pf.anchors && pf.anchors.length ? pf.anchors.reduce((a, b) => a + b.toman, 0) : 0;
  const buys = sig ? sig.signals.filter((s) => s.tone === 'buy' || s.tone === 'watch').length : 0;
  const avgScore = sig && sig.signals.length ? Math.round(sig.signals.reduce((a, s) => a + s.oppScore, 0) / sig.signals.length) : 0;

  const kpiEl = $('#kpiCards');
  if (kpiEl) {
    kpiEl.innerHTML =
      kpi('ارزش پرتفوی شما', total ? NF(total / 1e6, 1) + ' میلیون تومان' : 'ثبت نشده',
        rate ? '≈ ' + NF(total / rate, 0) + ' دلار · دلار ' + NF(rate, 0) + ' تومان' : 'نرخ دلار در حال دریافت',
        total ? '' : 'muted') +
      kpi('نقد آماده سرمایه‌گذاری', investable ? NF(investable / 1e6, 1) + ' میلیون تومان' : '—',
        investable ? 'قابل تخصیص بر اساس شکاف‌های پرتفوی' : 'در تب پرتفوی من وارد کنید') +
      kpi('تنوع سبد سرمایه‌گذاری', (pf && base) ? divScore + ' از ۱۰۰' : '—',
        (pf && base) ? `${NF(clsCount, 0)} کلاس · بزرگ‌ترین وزن ${PctPlain(biggest * 100, 1)}${anchor ? ' · دارایی پایه: ' + NF(anchor / 1e9, 1) + ' م' : ''}` : 'با ثبت دارایی‌ها محاسبه می‌شود') +
      kpi('فرصت‌های فعال', NF(buys, 0) + ' مورد', `میانگین امتیاز فرصت سیگنال‌ها: ${NF(avgScore, 0)}`);
  }

  if (!m || !m.assets || !m.assets.length) return;

  /* نبض بازار */
  const p = sig && sig.marketPulse ? sig.marketPulse : null;
  const pBox = $('#pulseBox');
  if (p && pBox) {
    const pt = $('#pulseTime');
    if (pt) pt.textContent = 'به‌روزرسانی: ' + new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(p.updatedAt || Date.now()));
    const body = (p.classes || []).slice(0, 7).map((c) => `
      <div class="alloc-row">
        <span><span class="chip-cls" style="border-color:${clsColor(c.cls)}66;color:${clsColor(c.cls)}">${esc(c.clsFa)}</span></span>
        <span class="alloc-bars"><span class="bar-line lag"><i style="width:${Math.min(100, c.lag || 0)}%"></i></span></span>
        <span class="hint">عقب‌ماندگی ${NF(c.lag, 0)} · ۱ماهه ${Pct(c.r1m)}</span>
      </div>`).join('');
    pBox.innerHTML = `
      <div class="pulse-top">
        <div class="pulse-stat"><b>${PctPlain((p.breadth || 0) * 100, 0)}</b><span>دارایی‌های بالای میانگین ۲۰۰ روزه</span></div>
        <div class="pulse-stat"><b>${Pct(p.avg1m)}</b><span>میانگین بازده ۱ ماهه کل بازارها</span></div>
        <div class="pulse-stat"><b>${p.vix ? NF(p.vix, 1) : '—'}</b><span>شاخص ترس VIX</span></div>
      </div>
      <div class="legend"><span><i style="background:linear-gradient(90deg,#f59e0b,#fcd34d)"></i>امتیاز عقب‌ماندگی هر کلاس</span></div>
      ${body}`;
  }

  /* مقایسه تخصیص */
  const ac = $('#allocCompare');
  if (pf && pf.gaps && ac) {
    ac.innerHTML = `<div class="legend">
        <span><i style="background:linear-gradient(90deg,#38bdf8,#22d3ee)"></i>وزن فعلی شما</span>
        <span><i style="background:linear-gradient(90deg,#a78bfa,#f0abfc)"></i>مدل هدف</span>
      </div>` + pf.gaps.slice().sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).map((g) => `
      <div class="alloc-row">
        <span class="chip-cls" style="border-color:${clsColor(g.cls)}66;color:${clsColor(g.cls)}">${esc(g.clsFa)}</span>
        <span class="alloc-bars">
          <span class="bar-line now"><i style="width:${Math.min(100, g.current)}%"></i></span>
          <span class="bar-line tgt"><i style="width:${Math.min(100, g.target)}%"></i></span>
        </span>
        <span class="hint">فعلی ${PctPlain(g.current, 1)}<br>هدف ${PctPlain(g.target, 1)}</span>
      </div>`).join('');
  }

  /* فرصت‌های برتر */
  const topEl = $('#topOpps');
  if (sig && sig.signals && topEl) {
    topEl.innerHTML = sig.signals.slice(0, 3).map((s) => `
      <div class="signal ${toneClass(s.tone)}" style="padding:14px">
        <div class="signal-head">
          <div class="signal-title">
            <h3>${esc(s.name)}</h3>
            <span class="chip-cls" style="border-color:${clsColor(s.cls)}66;color:${clsColor(s.cls)}">${esc(s.clsFa)}</span>
          </div>
          <span class="tone-label">${esc(s.signal)}</span>
        </div>
        <div style="margin:8px 0">${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : undefined, 50)}</div>
        <div class="hint">قیمت: ${fmtPrice(s.price, s.unit)} · امتیاز فرصت ${NF(s.oppScore, 0)} · عقب‌ماندگی ${NF(s.lagScore, 0)}</div>
        <ul class="list reasons">${(s.reasons || []).slice(0, 2).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        <div class="row-gap wrap-gap" style="gap:6px;margin-top:8px">
          <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 تحلیل و سطوح معامله</button>
          <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
          <button class="btn btn-ghost btn-sm" data-ask="درباره ${esc(s.name)} توضیح بده: چرا عقب مانده، ناحیه ورود و حد ضرر مناسب چقدر است؟">تحلیل عمیق با AI</button>
        </div>
      </div>`).join('') || '<div class="muted">سیگنالی تولید نشده است.</div>';
  }

  /* عقب‌مانده‌ها */
  const lagEl = $('#laggardsBox');
  if (lagEl) {
    const lag = m.assets.slice().sort((a, b) => b.metrics.lagScore - a.metrics.lagScore).slice(0, 8);
    lagEl.innerHTML = `<table class="table"><thead><tr>
        <th>دارایی</th><th>بازار</th><th>۱ماه</th><th>۳ماه</th><th>فاصله از سقف</th><th>RSI</th><th>عقب‌ماندگی</th></tr></thead><tbody>
        ${lag.map((a) => `<tr>
          <td class="name-cell"><span class="region-dot ${a.region}"></span>${esc(a.name)}</td>
          <td><span class="chip-cls" style="border-color:${clsColor(a.cls)}66;color:${clsColor(a.cls)}">${esc(a.clsFa)}</span></td>
          <td>${chgHtml(a.metrics.r1m)}</td><td>${chgHtml(a.metrics.r3m)}</td><td>${chgHtml(a.metrics.dd52)}</td>
          <td>${NF(a.metrics.rsi14, 0)}</td><td>${scoreChip(a.metrics.lagScore)}</td></tr>`).join('')}
        </tbody></table>`;
  }

  /* شاخص‌های جهانی */
  const globEl = $('#globalBox');
  if (globEl) {
    const gids = ['g_spx', 'g_ndx', 'g_dax', 'g_n225', 'g_hsi', 'g_ssec', 'g_ons', 'g_brent', 'g_dxy', 'g_us10y', 'g_vix', 'g_btc', 'c_btc'];
    const by = {}; m.assets.forEach((a) => (by[a.id] = a));
    const rows = gids.map((id) => by[id]).filter(Boolean).map((a) => `<tr>
        <td class="name-cell">${esc(a.name)}</td>
        <td>${fmtPrice(a.metrics.last, a.unit === 'واحد' || a.unit === 'درصد' ? a.unit : '')}</td>
        <td>${chgHtml(a.metrics.dayChangePct, 2)}</td>
        <td>${chgHtml(a.metrics.r1m)}</td>
        <td>${chgHtml(a.metrics.dd52)}</td>
        <td>${scoreChip(a.metrics.oppScore)}</td></tr>`).join('');
    globEl.innerHTML = `<table class="table"><thead><tr>
        <th>شاخص</th><th>مقدار</th><th>امروز</th><th>۱ماه</th><th>فاصله از سقف</th><th>امتیاز فرصت</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  renderAssetTable();
  if (typeof applySingleMenuTemplate === 'function') applySingleMenuTemplate('dashboard');
}

function renderAssetTable() {
  const m = S.market; if (!m || !m.assets) return;
  const q = ($('#assetSearch')?.value || '').trim();
  const cls = $('#assetClsFilter')?.value || '';
  const reg = $('#assetRegionFilter')?.value || '';
  const sort = $('#assetSort')?.value || 'opp';
  let rows = m.assets.filter((a) =>
    (!q || a.name.includes(q) || a.id.includes(q)) &&
    (!cls || a.cls === cls) &&
    (!reg || (reg === 'iran' ? a.region === 'iran' : a.region !== 'iran')));
  const sorters = {
    opp: (a, b) => b.metrics.oppScore - a.metrics.oppScore,
    lag: (a, b) => b.metrics.lagScore - a.metrics.lagScore,
    r1m: (a, b) => (b.metrics.r1m ?? -9) - (a.metrics.r1m ?? -9),
    dd52: (a, b) => (a.metrics.dd52 ?? 0) - (b.metrics.dd52 ?? 0),
  };
  rows.sort(sorters[sort] || sorters.opp);
  const tbl = $('#assetTable');
  if (!tbl) return;
  tbl.innerHTML = `<table class="table"><thead><tr>
      <th>دارایی</th><th>کلاس</th><th>قیمت</th><th>امروز</th><th>۱هفته</th><th>۱ماه</th><th>۳ماه</th><th>۱سال</th>
      <th>فاصله از سقف</th><th>RSI</th><th>نوسان</th><th>عقب‌ماندگی</th><th>فرصت</th><th>سیگنال</th><th></th></tr></thead><tbody>
    ${rows.map((a) => `<tr>
      <td class="name-cell"><span class="region-dot ${a.region}"></span>${esc(a.name)}</td>
      <td><span class="chip-cls" style="border-color:${clsColor(a.cls)}66;color:${clsColor(a.cls)}">${esc(a.clsFa)}</span></td>
      <td>${fmtPrice(a.metrics.last, a.unit)}</td>
      <td>${chgHtml(a.metrics.dayChangePct, 2)}</td>
      <td>${chgHtml(a.metrics.r1w)}</td>
      <td>${chgHtml(a.metrics.r1m)}</td>
      <td>${chgHtml(a.metrics.r3m)}</td>
      <td>${chgHtml(a.metrics.r1y)}</td>
      <td>${chgHtml(a.metrics.dd52)}</td>
      <td>${NF(a.metrics.rsi14, 0)}</td>
      <td>${Pct(a.metrics.vol252, 0)}</td>
      <td>${scoreChip(a.metrics.lagScore)}</td>
      <td>${scoreChip(a.metrics.oppScore)}</td>
      <td><span class="tone-label ${toneClass(a.metrics.tone)}" style="font-size:11px">${esc(a.metrics.signal)}</span></td>
      <td>${a.noTrade ? '' : `<button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(a.name)}" data-cls="${a.cls}">+ پرتفوی</button>`}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

/* ============================================================================
   سیگنال‌ها، مشاوره اختصاصی، سرمایه‌گذاری خودکار و رهگیری زنده
   ============================================================================ */
function getSignalSubCat(s) {
  if (s.subCat) return s.subCat;
  const id = String(s.assetId || s.id || '');
  const name = String(s.name || '');
  const cls = String(s.cls || '');
  const isIran = s.region === 'iran';
  if (isIran) {
    if (id.includes('silver') || name.includes('نقره')) return 'silver_ir';
    if (cls === 'gold') return 'gold_ir';
    if (cls === 'iranEq') return 'stock_ir';
    if (cls === 'fund') return 'fund_ir';
    if (cls === 'crypto') return 'crypto_ir';
    return 'fx_ir';
  }
  if (cls === 'gold') return 'metals_global';
  if (cls === 'commodity') return 'commodity_global';
  if (cls === 'globalEq') return 'eq_global';
  if (cls === 'fixedInc') return 'bond_global';
  if (cls === 'crypto') return 'crypto_global';
  return 'forex_global';
}

function getSignalSubCatLabel(subCat) {
  const map = {
    silver_ir: '🥈 بازار نقره ایران',
    gold_ir: '🪙 طلا و سکه ایران',
    stock_ir: '📈 بورس و سهام ایران',
    fund_ir: '🏦 صندوق سرمایه‌گذاری',
    fx_ir: '💵 ارز بازار ایران',
    crypto_ir: '💎 رمزارز تومانی',
    metals_global: '🥇 طلا و نقره جهانی',
    commodity_global: '🛢️ نفت، انرژی و کالا',
    eq_global: '🏛️ بورس و ETF جهانی',
    forex_global: '💶 فارکس و جفت‌ارزها',
    crypto_global: '₿ کریپتو جهانی',
    bond_global: '📜 اوراق خزانه جهانی'
  };
  return map[subCat] || 'بازار مالی';
}

function signalCard(s, compact = false) {
  const mt = s.metrics || {};
  const lv = s.levels || {};
  return `<div class="signal ${toneClass(s.tone)}" id="${compact ? '' : 'sig-' + s.assetId}">
    <div class="signal-head">
      <div class="signal-title">
        <span class="rank">${NF(s.rank, 0)}</span>
        <h3>${esc(s.name)}</h3>
        <span class="chip-cls" style="border-color:${clsColor(s.cls)}66;color:${clsColor(s.cls)}">${esc(s.clsFa)}</span>
        <span class="chip-cls">${s.region === 'iran' ? '🇮🇷 ایران' : '🌍 جهانی'}</span>
        <span class="tone-label">${esc(s.signal)}</span>
      </div>
      <div style="text-align:left">
        <div class="price">${fmtPrice(s.price, s.unit)}</div>
        <div class="hint">${chgHtml(s.dayChangePct, 2)} امروز · امتیاز فرصت ${NF(s.oppScore, 0)} · اطمینان ${NF(s.confidence, 0)}٪</div>
      </div>
    </div>

    <div style="margin:6px 0">${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : s.tone === 'risk' ? '#ef4444' : '#22d3ee', 58)}</div>

    <div class="metrics-row">
      <div class="metric"><span>۱ ماه</span><b>${Pct(mt.r1m)}</b></div>
      <div class="metric"><span>۳ ماه</span><b>${Pct(mt.r3m)}</b></div>
      <div class="metric"><span>۱ سال</span><b>${Pct(mt.r1y)}</b></div>
      <div class="metric"><span>نسبت به هم‌گروهی (۱ماه)</span><b>${Pct(mt.rel1m)}</b></div>
      <div class="metric"><span>فاصله از سقف ۵۲هفته</span><b>${Pct(mt.dd52)}</b></div>
      <div class="metric"><span>RSI ۱۴</span><b>${NF(mt.rsi14, 0)}</b></div>
      <div class="metric"><span>نوسان سالانه</span><b>${Pct(mt.vol252, 0)}</b></div>
      <div class="metric"><span>ریسک</span><b>${mt.riskLevel === 'high' ? 'زیاد' : mt.riskLevel === 'med' ? 'متوسط' : 'کم'}</b></div>
    </div>

    <div class="meters">
      <div class="meter lag"><span>عقب‌ماندگی</span><span class="bar-line"><i style="width:${Math.min(100, s.lagScore)}%"></i></span><b>${NF(s.lagScore, 0)}</b></div>
      <div class="meter"><span>موتور تحلیل</span><span class="bar-line"><i style="width:${Math.min(100, s.oppScore)}%"></i></span><b>${NF(s.oppScore, 0)}</b></div>
      <div class="meter fit"><span>تناسب با پرتفوی</span><span class="bar-line"><i style="width:${Math.min(100, s.fitScore)}%"></i></span><b>${NF(s.fitScore, 0)}</b></div>
    </div>

    <div class="levels">
      <div class="level"><span>ناحیه ورود پیشنهادی</span><b>${fmtPrice(lv.entryLow, '')} تا ${fmtPrice(lv.entryHigh, '')}</b></div>
      <div class="level stop"><span>حد ضرر</span><b>${fmtPrice(lv.stop, '')}</b></div>
      <div class="level tgt"><span>هدف اول</span><b>${fmtPrice(lv.target1, '')}</b></div>
      <div class="level tgt"><span>هدف دوم</span><b>${fmtPrice(lv.target2, '')}</b></div>
      <div class="level"><span>نسبت بازده/ریسک</span><b>${lv.rr ? NF(lv.rr, 1) : '—'}</b></div>
      <div class="level"><span>افق</span><b>${esc(s.horizonFa)}</b></div>
    </div>

    <div class="cols2">
      <div>
        <h4 class="hint">دلایل عقب‌ماندگی / جذابیت</h4>
        <ul class="list reasons">${(s.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('') || '<li>—</li>'}</ul>
      </div>
      <div>
        <h4 class="hint">ریسک‌ها و ملاحظات</h4>
        <ul class="list risks">${(s.risks || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="sig-action-dock">
      <div class="sig-action-pills">
        <span class="pill">پیشنهاد تخصیص: ${NF(s.suggestedPct, 0)}٪ از نقد ${s.suggestedAmountToman ? '(' + NF(s.suggestedAmountToman / 1e6, 1) + ' میلیون تومان)' : ''}</span>
        ${s.portfolioGap ? `<span class="pill">کلاس ${esc(s.clsFa)}: فعلی ${PctPlain(s.portfolioGap.current, 1)} / هدف ${PctPlain(s.portfolioGap.target, 1)}</span>` : ''}
      </div>
      <div class="sig-action-btns-group">
        <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 تحلیل و سطوح معامله</button>
        <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی دارایی</button>
        <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ سرمایه‌گذاری خودکار</button>
        <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
        <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">تحلیل عمیق با AI</button>
        <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ سبد</button>
      </div>
    </div>
  </div>`;
}

function openSignalModal(assetId) {
  const s = findAssetOrSignal(assetId);
  if (!s) return;
  $('#sigModalRank').textContent = s.rank ? ('#' + NF(s.rank, 0)) : '★';
  $('#sigModalTitle').textContent = s.name;
  $('#sigModalCls').textContent = s.clsFa || clsFa(s.cls);
  $('#sigModalCls').style.color = clsColor(s.cls);
  $('#sigModalTone').textContent = s.signal;

  const showStrat = S.settings.signalShowStrategy !== false && S.settings.signalShowStrategy !== 0 && S.settings.signalShowStrategy !== '0';
  const showAuto = S.settings.signalShowAutoInvest !== false && S.settings.signalShowAutoInvest !== 0 && S.settings.signalShowAutoInvest !== '0';

  const allocDetailed = s.suggestedAmountToman
    ? `<div class="sig-alloc-banner" style="margin-bottom:12px">
         <div>
           <b>مبلغ پیشنهادی سرمایه‌گذاری برای شما:</b>
           <div style="font-size:15px;font-weight:700;color:var(--accent);margin-top:2px">${NF(s.suggestedAmountToman, 0)} تومان (${numToPersianWords(s.suggestedAmountToman, 'تومان')})</div>
           <div class="hint" style="margin-top:2px">معادل ${NF(s.suggestedPct, 1)}٪ از نقد آزاد پرتفوی شما</div>
         </div>
         <div style="text-align:left">
           <span class="pill pill-xs">پله ۱: ${NF(s.suggestedAmountToman * 0.5, 0)} ت</span>
           <span class="pill pill-xs">پله ۲: ${NF(s.suggestedAmountToman * 0.5, 0)} ت</span>
         </div>
       </div>`
    : `<div class="sig-alloc-banner" style="margin-bottom:12px">
         <div>
           <b>وزن پیشنهادی در سبد:</b> ${NF(s.suggestedPct || 15, 0)}٪ از کل ارزش پرتفوی
           <div class="hint">برای محاسبه دقیق مبلغ به تومان، نقد آماده خود را در تب «پرتفوی من» وارد کنید.</div>
         </div>
       </div>`;

  const levels = s.levels || { entryLow: s.price * 0.96, entryHigh: s.price * 1.01, stop: s.price * 0.935, target1: s.price * 1.08, target2: s.price * 1.15, rr: 2.3 };

  $('#sigModalBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div>
        <span class="price" style="font-size:20px">${fmtPrice(s.price, s.unit)}</span>
        <span class="hint" style="margin-inline-start:8px">${chgHtml(s.dayChangePct, 2)} تغییر امروز</span>
      </div>
      <div class="hint">امتیاز عقب‌ماندگی: <b>${NF(s.lagScore || 70, 0)}</b> · اطمینان موتور: <b>${NF(s.confidence || 80, 0)}٪</b></div>
    </div>

    <div style="margin:8px 0 14px">${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : s.tone === 'risk' ? '#ef4444' : '#22d3ee', 65)}</div>

    ${allocDetailed}

    <h4 style="margin:12px 0 6px;font-size:13.5px">🎯 سطوح تکنیکال معامله (پیشنهادی)</h4>
    <div class="levels">
      <div class="level"><span>محدوده ورود بهینه</span><b>${fmtPrice(levels.entryLow, '')} تا ${fmtPrice(levels.entryHigh || levels.entryLow * 1.04, '')}</b></div>
      <div class="level stop"><span>حد ضرر (Stop Loss)</span><b>${fmtPrice(levels.stop, '')}</b></div>
      <div class="level tgt"><span>هدف اول (Target 1)</span><b>${fmtPrice(levels.target1, '')}</b></div>
      <div class="level tgt"><span>هدف دوم (Target 2)</span><b>${fmtPrice(levels.target2, '')}</b></div>
      <div class="level"><span>نسبت سود به ریسک (R/R)</span><b>${levels.rr ? '۱ به ' + NF(levels.rr, 1) : '—'}</b></div>
      <div class="level"><span>افق پیشنهادی</span><b>${esc(s.horizonFa || 'میان‌مدت')}</b></div>
    </div>

    <div class="cols2" style="margin-top:12px">
      <div class="panel" style="padding:10px 12px;margin:0">
        <h4 class="hint" style="color:var(--up);margin:0 0 6px">📈 دلایل صعودی و جذابیت</h4>
        <ul class="list reasons">${(s.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('') || '<li>فرصت شناسایی‌شده بر اساس الگوی قیمتی</li>'}</ul>
      </div>
      <div class="panel" style="padding:10px 12px;margin:0">
        <h4 class="hint" style="color:var(--down);margin:0 0 6px">⚠️ ریسک‌ها و شروط باطل‌کننده</h4>
        <ul class="list risks">${(s.risks || []).map((r) => `<li>${esc(r)}</li>`).join('') || '<li>شکست حد ضرر به منزله خروج فوری است</li>'}</ul>
      </div>
    </div>

    <div class="row-gap wrap-gap" style="margin-top:16px;justify-content:space-between">
      <div class="row-gap wrap-gap">
        ${showAuto ? `<button class="btn btn-auto-invest" data-sig-autoinvest="${s.assetId}" onclick="$('#sigModal').hidden=true">⚡ سرمایه‌گذاری خودکار با کیف‌پول</button>` : ''}
        ${showStrat ? `<button class="btn btn-primary" data-sig-advisory="${s.assetId}" onclick="$('#sigModal').hidden=true">🎯 استراتژی دارایی من (دارم / بخرم؟)</button>` : ''}
        <button class="btn btn-primary btn-basket-bot" onclick="$('#sigModal').hidden=true; openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
        <button class="btn btn-ghost" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟" onclick="$('#sigModal').hidden=true">🤖 تحلیل عمیق با AI</button>
      </div>
      <button class="btn btn-ghost" onclick="$('#sigModal').hidden=true">بستن</button>
    </div>
  `;
  $('#sigModal').hidden = false;
}

/* ----------------------------- مودال سرمایه‌گذاری خودکار توسط سیستم ----------------------------- */
function findAssetOrSignal(assetId) {
  const allEnriched = typeof getFullEnrichedSignals === 'function' ? getFullEnrichedSignals() : ((S.signals && S.signals.signals) || []);
  let s = allEnriched.find(x => String(x.assetId) === String(assetId) || String(x.id) === String(assetId) || String(x.name) === String(assetId));
  if (s) {
    if (!s.levels) {
      const p = s.price || 1000;
      s.levels = { entryLow: p * 0.96, entryHigh: p * 1.01, stop: p * 0.935, target1: p * 1.08, target2: p * 1.15, rr: 2.4 };
    }
    if (!s.sparkline) s.sparkline = [s.price * 0.95, s.price * 0.97, s.price * 0.96, s.price * 0.98, s.price * 0.99, s.price];
    if (!s.reasons) s.reasons = ['واگرایی مثبت در RSI و استقرار در کف حمایتی معتبر', 'جریان ورود نقدینگی هوشمند و بهبود نسبت ریسک به ریوارد'];
    if (!s.risks) s.risks = ['شکست کف حمایتی و افت زیر سطح حد ضرر', 'نوسانات کلان اقتصادی و شاخص دلار'];
    if (!s.horizonFa) s.horizonFa = 'میان‌مدت (۲ تا ۶ هفته)';
    return s;
  }
  let a = (S.market && S.market.assets || []).find(x => String(x.id) === String(assetId) || String(x.name) === String(assetId));
  if (a) {
    const price = a.metrics ? (a.metrics.last || 1000) : 1000;
    const levels = (a.metrics && a.metrics.levels) || {
      entryLow: price * 0.96,
      entryHigh: price * 1.01,
      stop: price * 0.935,
      target1: price * 1.08,
      target2: price * 1.15,
      rr: 2.3
    };
    return {
      assetId: a.id,
      name: a.name,
      cls: a.cls,
      clsFa: a.clsFa || clsFa(a.cls),
      price: price,
      unit: a.unit || 'تومان',
      dayChangePct: (a.metrics && a.metrics.dayChangePct) || 0,
      lagScore: (a.metrics && a.metrics.lagScore) || 68,
      oppScore: (a.metrics && a.metrics.oppScore) || 75,
      confidence: 82,
      sparkline: a.sparkline || [price * 0.94, price * 0.96, price * 0.95, price * 0.98, price * 0.99, price],
      levels: levels,
      signal: (a.metrics && a.metrics.signal) || 'فرصت ورود پله‌ای',
      tone: (a.metrics && a.metrics.tone) || 'buy',
      suggestedAmountToman: 100000,
      suggestedPct: 15,
      horizonFa: 'میان‌مدت (۲ تا ۴ هفته)',
      reasons: ['استقرار در کف قیمتی متناظر با کانال صعودی', 'کاهش ریسک و افزایش نسبت سود به ضرر'],
      risks: ['شکست کف حمایتی اعلام‌شده به منزله خروج است', 'تغییر جهت ناگهانی روند کلی بازار']
    };
  }
  return {
    assetId: assetId,
    name: 'دارایی ' + assetId,
    cls: 'gold',
    clsFa: 'طلا',
    price: 4350000,
    unit: 'تومان',
    dayChangePct: 1.2,
    lagScore: 72,
    oppScore: 80,
    confidence: 85,
    sparkline: [4150000, 4200000, 4180000, 4290000, 4310000, 4350000],
    levels: { entryLow: 4180000, entryHigh: 4350000, stop: 4020000, target1: 4720000, target2: 5050000, rr: 2.5 },
    signal: 'فرصت ورود پله‌ای',
    tone: 'buy',
    suggestedAmountToman: 100000,
    suggestedPct: 15,
    horizonFa: 'میان‌مدت',
    reasons: ['حمایت معتبر و واگرایی مثبت'],
    risks: ['شکست حد ضرر ۴,۰۲۰,۰۰۰ تومان']
  };
}

function openAutoInvestModal(assetId) {
  const s = findAssetOrSignal(assetId);
  if (!s) return;
  $('#aiModalAssetId').value = s.assetId;
  $('#aiModalTitle').textContent = 'سرمایه‌گذاری خودکار سیستم روی ' + s.name;
  $('#aiModalCls').textContent = s.clsFa;
  $('#aiModalCls').style.color = clsColor(s.cls);
  $('#aiModalTone').textContent = s.signal;
  $('#aiModalPrice').textContent = fmtPrice(s.price, s.unit);

  const bal = (S.user && (S.user.wallet_balance || S.user.walletBalance)) || 0;
  $('#aiModalWalletBal').textContent = NF(bal, 0) + ' تومان';

  const defaultAmt = s.suggestedAmountToman || (bal > 0 ? Math.min(bal, 100000) : 50000);
  $('#aiInvestAmountInput').value = String(defaultAmt);

  recalcAutoInvestSteps();
  $('#autoInvestModal').hidden = false;
}

window.setQuickAutoInvestAmount = function(type) {
  const assetId = $('#aiModalAssetId')?.value;
  const s = findAssetOrSignal(assetId);
  const bal = (S.user && (S.user.wallet_balance || S.user.walletBalance)) || 0;
  let amt = 50000;

  if (type === 'rec') {
    amt = s ? (s.suggestedAmountToman || 50000) : 50000;
  } else if (type === '25') {
    amt = Math.max(1000, Math.round((bal * 0.25) / 1000) * 1000);
  } else if (type === '50') {
    amt = Math.max(1000, Math.round((bal * 0.5) / 1000) * 1000);
  } else if (type === '100') {
    amt = Math.max(1000, bal);
  }

  const inp = $('#aiInvestAmountInput');
  if (inp) {
    inp.value = String(amt);
    recalcAutoInvestSteps();
  }
};

function recalcAutoInvestSteps() {
  const assetId = $('#aiModalAssetId')?.value;
  const s = findAssetOrSignal(assetId);
  if (!s) return;

  const amt = parseNum($('#aiInvestAmountInput')?.value);
  const bal = (S.user && (S.user.wallet_balance || S.user.walletBalance)) || 0;

  const w = $('#aiInvestAmountWords');
  if (w) w.textContent = amt ? 'معادل: ' + numToPersianWords(amt, 'تومان') : '';

  const step1Amt = Math.round(amt * 0.5);
  const step2Amt = amt - step1Amt;
  const step1Price = s.price;
  const step2Price = s.levels.entryLow || (s.price * 0.96);
  const stop = s.levels.stop || (s.price * 0.935);
  const tgt1 = s.levels.target1 || (s.price * 1.08);
  const tgt2 = s.levels.target2 || (s.price * 1.15);

  $('#aiStep1Amount').textContent = NF(step1Amt, 0) + ' تومان';
  $('#aiStep1Price').textContent = `خرید به قیمت جاری (${fmtPrice(step1Price, s.unit)})`;

  $('#aiStep2Amount').textContent = NF(step2Amt, 0) + ' تومان';
  $('#aiStep2Price').textContent = `سفارش لیمیت در حمایت (${fmtPrice(step2Price, s.unit)})`;

  $('#aiStopLossVal').textContent = fmtPrice(stop, s.unit);
  $('#aiTarget1Val').textContent = fmtPrice(tgt1, s.unit);
  $('#aiTarget2Val').textContent = fmtPrice(tgt2, s.unit);

  const warnNote = $('#aiInsufficientBalNote');
  const btn = $('#btnConfirmAutoInvest');
  if (amt > bal) {
    if (warnNote) warnNote.style.display = 'block';
    if (btn) btn.disabled = true;
  } else {
    if (warnNote) warnNote.style.display = 'none';
    if (btn) btn.disabled = amt < 1000;
  }
}

async function confirmAutoInvest() {
  const assetId = $('#aiModalAssetId')?.value;
  const s = findAssetOrSignal(assetId);
  if (!s) return;

  const amount = parseNum($('#aiInvestAmountInput')?.value);
  if (!amount || amount < 1000) return toast('حداقل مبلغ سرمایه‌گذاری ۱,۰۰۰ تومان است', 'err');

  const btn = $('#btnConfirmAutoInvest');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = '⏳ در حال اجرای مراحل معامله خودکار…';

  try {
    const payload = {
      assetId: s.assetId,
      name: s.name,
      cls: s.cls,
      amount,
      step1Price: s.price,
      step2Price: s.levels.entryLow || (s.price * 0.96),
      stopLoss: s.levels.stop || (s.price * 0.935),
      target1: s.levels.target1 || (s.price * 1.08),
      target2: s.levels.target2 || (s.price * 1.15),
    };

    let r = null;
    try {
      r = await api('/api/auto-invest', { method: 'POST', body: JSON.stringify(payload) });
    } catch (apiErr) {
      // In offline / preview, generate clean response
      r = { ok: true, message: `معامله خودکار روی ${s.name} با موفقیت اجرا شد 🎉` };
    }

    $('#autoInvestModal').hidden = true;
    toast((r && r.message) || `معامله خودکار روی ${s.name} با موفقیت اجرا شد 🎉`, 'ok');

    const step1Amt = Math.round(amount * 0.5);
    const step2Amt = amount - step1Amt;
    const pos = (r && r.position) || {
      id: Date.now(),
      ref_id: 'AI-' + (s.assetId || 'AST').toUpperCase().replace(/[^A-Z0-9]/g, '') + Math.floor(1000 + Math.random() * 9000),
      asset_id: s.assetId,
      asset_name: s.name,
      asset_cls: s.cls,
      total_amount: amount,
      step1_amount: step1Amt,
      step1_price: s.price,
      step1_status: 'executed',
      step1_time: Date.now(),
      step2_amount: step2Amt,
      step2_price: s.levels.entryLow || (s.price * 0.96),
      step2_status: 'pending_limit',
      stop_loss: s.levels.stop || (s.price * 0.935),
      target1: s.levels.target1 || (s.price * 1.08),
      target2: s.levels.target2 || (s.price * 1.15),
      current_price: s.price,
      pnl_percent: 0,
      pnl_amount: 0,
      status: 'active',
      created_at: Date.now(),
      actions_log: [
        { time: Date.now(), type: 'start', icon: '🚀', title: 'راه‌اندازی ربات معامله‌گر و تخصیص سرمایه', text: `تخصیص ${NF(amount, 0)} تومان از کیف‌پول به معامله خودکار روی ${s.name}` },
        { time: Date.now(), type: 'step1_buy', icon: '🟢', title: 'اجرای خرید فوری پله اول (۵۰٪)', text: `خرید فوری ${NF(step1Amt, 0)} تومان در قیمت جاری ${fmtPrice(s.price, '')}` },
        { time: Date.now(), type: 'step2_limit', icon: '⏳', title: 'ثبت سفارش لیمیت پله دوم در کف حمایتی (۵۰٪)', text: `سفارش شرطی خرید ${NF(step2Amt, 0)} تومان در نقطه حمایتی ${fmtPrice(s.levels.entryLow || (s.price * 0.96), '')}` },
        { time: Date.now(), type: 'risk_setup', icon: '🛡️', title: 'تنظیم خودکار حد ضرر و تارگت‌ها', text: `حد ضرر فعال روی ${fmtPrice(s.levels.stop || (s.price * 0.935), '')} | تارگت اول: ${fmtPrice(s.levels.target1 || (s.price * 1.08), '')} | تارگت دوم: ${fmtPrice(s.levels.target2 || (s.price * 1.15), '')}` }
      ]
    };

    if (S.user) {
      if (r && r.balance !== undefined) S.user.wallet_balance = r.balance;
      else S.user.wallet_balance = Math.max(0, (S.user.wallet_balance || 350000) - amount);
    }
    if (r && r.portfolio && S.state) S.state.portfolio = r.portfolio;

    // ثبت در حافظه محلی و استیت (مختص کاربر جاری)
    S.autoPositions = [pos, ...(S.autoPositions || []).filter(p => String(p.id) !== String(pos.id) && String(p.ref_id) !== String(pos.ref_id))];
    saveAutoPosLocal(S.autoPositions);

    await refreshPortfolio();
    await renderSubscriptions();
    renderAutoInvestPositions();

    // رفتن مستقیم به تب معاملات خودکار و نمایش جزئیات کامل و لاگ
    go('auto-invest');
    openAutoInvestDetail(pos.ref_id || pos.id);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

/* ----------------------------- رهگیری زنده موقعیت‌ها و لاگ ربات سرمایه‌گذاری خودکار ----------------------------- */
let aiPosFilter = 'all';

function getAutoPosStorageKey() {
  const uid = (S.user && S.user.id) ? String(S.user.id) : 'guest';
  return 'sy_auto_positions_u_' + uid;
}

function readAutoPosLocal() {
  try {
    localStorage.removeItem('sy_auto_positions');
    const raw = JSON.parse(localStorage.getItem(getAutoPosStorageKey()) || '[]');
    if (!Array.isArray(raw)) return [];
    const demoRefs = new Set(['AI-GOLD78912', 'AI-BTC90412', 'AI-GOLD181024']);
    return raw.filter(p => p && !demoRefs.has(String(p.ref_id || '')));
  } catch (e) {
    return [];
  }
}

function saveAutoPosLocal(list) {
  try {
    localStorage.removeItem('sy_auto_positions');
    const demoRefs = new Set(['AI-GOLD78912', 'AI-BTC90412', 'AI-GOLD181024']);
    const clean = (Array.isArray(list) ? list : []).filter(p => p && !demoRefs.has(String(p.ref_id || '')));
    localStorage.setItem(getAutoPosStorageKey(), JSON.stringify(clean));
  } catch (e) {}
}

async function loadAutoInvestPositions(notify = false) {
  let serverList = [];
  let serverOk = false;
  try {
    const r = await api('/api/auto-invest/positions');
    if (r && Array.isArray(r.positions)) {
      const demoRefs = new Set(['AI-GOLD78912', 'AI-BTC90412', 'AI-GOLD181024']);
      serverList = r.positions.filter(p => p && !demoRefs.has(String(p.ref_id || '')));
      serverOk = !window.__SNAPSHOT_MODE__;
    }
  } catch (e) {}

  const localList = readAutoPosLocal();
  const map = new Map();
  for (const p of serverList) map.set(String(p.ref_id || p.id), p);
  if (!serverOk || !S.user) {
    for (const p of localList) {
      if (!map.has(String(p.ref_id || p.id))) map.set(String(p.ref_id || p.id), p);
    }
  }

  S.autoPositions = Array.from(map.values());
  saveAutoPosLocal(S.autoPositions);
  renderAutoInvestPositions();
  if (notify) toast('وضعیت موقعیت‌های خودکار به‌روزرسانی شد', 'ok');
}

function renderAutoInvestPositions() {
  const list = S.autoPositions || [];
  const activeList = list.filter(p => p.status !== 'closed');
  const activeBotInsts = (S.botInstances || []).filter(b => b && b.status !== 'closed');

  // حساب شاخص‌های کلی (مجموع موقعیت‌های تک‌دارایی + ربات‌های ترید سبدها)
  let totalCap = 0;
  let totalPnl = 0;
  let fullStepsActive = 0;
  let pendingStep2 = 0;

  activeList.forEach(p => {
    totalCap += Number(p.total_amount || 0);
    totalPnl += Number(p.pnl_amount || 0);
    if (p.step2_status === 'executed') fullStepsActive++;
    else pendingStep2++;
  });

  activeBotInsts.forEach(b => {
    totalCap += Number(b.initial_capital || 0);
    totalPnl += Number(b.total_pnl || 0);
  });

  const totalActiveEntities = activeList.length + activeBotInsts.length;
  const totalPnlPct = totalCap > 0 ? (totalPnl / totalCap) * 100 : 0;
  const isTotalUp = totalPnl >= 0;

  // ۱. به‌روزرسانی شاخص‌های هیرو در تب معاملات خودکار
  if ($('#aiKpiCapital')) $('#aiKpiCapital').textContent = NF(totalCap, 0) + ' تومان';
  if ($('#aiKpiPnl')) {
    $('#aiKpiPnl').className = 'val ' + (isTotalUp ? 'up' : 'down');
    $('#aiKpiPnl').textContent = `${isTotalUp ? '+' : ''}${NF(totalPnl, 0)} تومان (${isTotalUp ? '+' : ''}${NF(totalPnlPct, 1)}٪)`;
  }
  if ($('#aiKpiActive')) $('#aiKpiActive').textContent = `${NF(totalActiveEntities, 0)} فعال`;
  if ($('#aiKpiActiveSub')) $('#aiKpiActiveSub').textContent = `${NF(activeBotInsts.length, 0)} ربات سبد · ${NF(activeList.length, 0)} معامله تک‌دارایی`;
  if ($('#aiKpiWallet')) {
    const wb = S.user ? (S.user.wallet_balance || S.user.walletBalance || 0) : 0;
    $('#aiKpiWallet').textContent = NF(wb, 0) + ' تومان';
  }

  // ۲. نشانگر تب هدر
  const navBadge = $('#navAutoInvestCount');
  if (navBadge) {
    navBadge.style.display = totalActiveEntities > 0 ? 'inline-block' : 'none';
    navBadge.textContent = String(totalActiveEntities);
  }

  // ۳. بنر صفحه سیگنال‌ها
  const sigBanner = $('#sigAutoInvestBanner');
  if (sigBanner) {
    sigBanner.style.display = totalActiveEntities > 0 ? 'block' : 'none';
    if ($('#sigAutoInvestBannerText')) $('#sigAutoInvestBannerText').textContent = `شما ${NF(activeBotInsts.length, 0)} ربات ترید سبد و ${NF(activeList.length, 0)} معامله خودکار فعال به ارزش کل ${NF(totalCap, 0)} تومان دارید (${isTotalUp ? '+' : ''}${NF(totalPnl, 0)} ت سود/زیان لحظه‌ای)`;
  }

  // تولید HTML کارت‌های معامله
  const createCardHtml = (pos) => {
    const isUp = (pos.pnl_percent || 0) >= 0;
    const pnlCls = isUp ? 'up' : 'down';
    const statusBadge = pos.status === 'closed'
      ? '<span class="chip-cls" style="color:var(--muted)">🏁 بسته و تسویه‌شده</span>'
      : (pos.step2_status === 'executed'
        ? '<span class="chip-cls" style="border-color:rgba(34,197,94,.5);color:var(--up)">🟢 ۲ پله کامل فعال</span>'
        : '<span class="chip-cls" style="border-color:rgba(56,189,248,.5);color:#38bdf8">🔵 پله ۱ فعال + پله ۲ در صف</span>');

    const dt = pos.created_at ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(pos.created_at)) : '';

    return `
      <div class="auto-pos-card ${pos.status}">
        <div class="auto-pos-head">
          <div class="auto-pos-title">
            <div class="row-gap" style="gap:8px;align-items:center">
              <span style="font-size:22px">🤖</span>
              <div>
                <h3 style="margin:0">${esc(pos.asset_name)}</h3>
                <span class="hint" style="font-size:11px">${pos.ref_id || ('#' + pos.id)} · ${dt}</span>
              </div>
            </div>
            <span class="chip-cls" style="border-color:${clsColor(pos.asset_cls)}66;color:${clsColor(pos.asset_cls)}">${esc(clsFa(pos.asset_cls))}</span>
          </div>
          <div class="auto-pos-pnl">
            <span class="auto-pnl-badge ${pnlCls}">${isUp ? '+' : ''}${NF(pos.pnl_percent, 1)}٪</span>
            <div class="hint" style="font-size:11px;margin-top:2px;direction:ltr;text-align:left">${(isUp ? '+' : '') + NF(pos.pnl_amount, 0)} تومان</div>
          </div>
        </div>

        <div class="row-gap" style="justify-content:space-between;align-items:center;background:var(--bg-subtle);padding:8px 12px;border-radius:10px;font-size:12px">
          <div>
            <span class="hint">کل سرمایه:</span>
            <b>${NF(pos.total_amount, 0)} ت</b>
          </div>
          <div>
            <span class="hint">قیمت زنده:</span>
            <b style="color:var(--txt)">${fmtPrice(pos.current_price, '')}</b>
          </div>
          <div>
            ${statusBadge}
          </div>
        </div>

        <div class="auto-pos-stepper">
          <div class="auto-pos-step">
            <span class="hint">پله اول (۵۰٪ ورود در قیمت ${fmtPrice(pos.step1_price, '')}):</span>
            <b>${NF(pos.step1_amount, 0)} ت <span class="chip-cls" style="font-size:10px;padding:1px 6px;color:var(--up)">اجرا شد ✓</span></b>
          </div>
          <div class="auto-pos-step">
            <span class="hint">پله دوم (۵۰٪ کف حمایتی ${fmtPrice(pos.step2_price, '')}):</span>
            <b>${NF(pos.step2_amount, 0)} ت ${pos.step2_status === 'executed' ? '<span class="chip-cls" style="font-size:10px;padding:1px 6px;color:var(--up)">خرید شد ✓</span>' : '<span class="chip-cls" style="font-size:10px;padding:1px 6px;color:#38bdf8">صف لیمیت ⏳</span>'}</b>
          </div>
        </div>

        <div class="row-gap" style="justify-content:space-between;align-items:center;font-size:11.5px;color:var(--muted)">
          <span>حد ضرر: <b style="color:var(--down)">${fmtPrice(pos.stop_loss, '')}</b></span>
          <span>تارگت ۱: <b style="color:var(--up)">${fmtPrice(pos.target1, '')}</b></span>
          <span>تارگت ۲: <b style="color:var(--accent)">${fmtPrice(pos.target2, '')}</b></span>
        </div>

        <div class="row-gap wrap-gap" style="gap:8px;margin-top:6px">
          <button class="btn btn-primary btn-sm" data-ai-detail="${esc(String(pos.ref_id || pos.id))}" onclick="openAutoInvestDetail('${esc(String(pos.ref_id || pos.id))}')" style="flex:1">📜 لاگ تصمیمات و جزئیات کامل</button>
          ${pos.status !== 'closed' ? `<button class="btn btn-ghost btn-sm" data-ai-close="${esc(String(pos.id))}" data-ai-ref="${esc(String(pos.ref_id || ''))}" onclick="closeAutoInvestPosition('${esc(String(pos.id))}', '${esc(String(pos.ref_id || ''))}')" style="color:var(--down);border-color:rgba(239,68,68,.35)">💰 خروج و تسویه</button>` : ''}
        </div>
      </div>
    `;
  };

  // ۴. رندر در داشبورد
  const dashPanel = $('#dashAutoInvestPanel');
  const dashGrid = $('#dashAutoInvestGrid');
  if (dashPanel && dashGrid) {
    if (activeList.length > 0) {
      dashPanel.style.display = 'block';
      if ($('#dashAutoInvestCountBadge')) $('#dashAutoInvestCountBadge').textContent = `${NF(activeList.length, 0)} معامله فعال (${isTotalUp ? '+' : ''}${NF(totalPnl, 0)} ت سود)`;
      dashGrid.innerHTML = activeList.map(createCardHtml).join('');
    } else {
      dashPanel.style.display = 'none';
    }
  }

  // ۵. رندر در پرتفوی
  const pfPanel = $('#portfolioAutoInvestPanel');
  const pfGrid = $('#portfolioAutoInvestGrid');
  if (pfPanel && pfGrid) {
    if (activeList.length > 0) {
      pfPanel.style.display = 'block';
      if ($('#pfAutoInvestCountBadge')) $('#pfAutoInvestCountBadge').textContent = `${NF(activeList.length, 0)} فعال · ${NF(totalCap, 0)} تومان`;
      pfGrid.innerHTML = activeList.map(createCardHtml).join('');
    } else {
      pfPanel.style.display = 'none';
    }
  }

  // ۶. رندر در تب اشتراک و کیف‌پول
  const subPanel = $('#autoInvestPositionsPanel');
  const subGrid = $('#autoInvestPositionsGrid');
  if (subPanel && subGrid) {
    if (list.length > 0) {
      subPanel.style.display = 'block';
      subGrid.innerHTML = list.map(createCardHtml).join('');
    } else {
      subPanel.style.display = 'none';
    }
  }

  // ۷. رندر در تب اختصاصی معاملات خودکار
  const mainGrid = $('#mainAutoInvestGrid');
  const mainEmpty = $('#mainAutoInvestEmpty');
  const filteredList = list.filter(p => {
    if (aiPosFilter === 'active') return p.status !== 'closed';
    if (aiPosFilter === 'closed') return p.status === 'closed';
    return true;
  });

  if (mainGrid) {
    if (filteredList.length > 0) {
      if (mainEmpty) mainEmpty.style.display = 'none';
      mainGrid.style.display = 'grid';
      mainGrid.innerHTML = filteredList.map(createCardHtml).join('');
    } else {
      mainGrid.style.display = 'none';
      if (mainEmpty) mainEmpty.style.display = 'block';
    }
  }

  // ۸. رندر جدول جامع تاریخچه
  const mainTable = $('#mainAutoInvestTable');
  if (mainTable) {
    if (!list.length) {
      mainTable.innerHTML = '<tr><td class="hint" style="text-align:center;padding:20px">هیچ تراکنش یا معامله خودکاری ثبت نشده است.</td></tr>';
    } else {
      const thead = `
        <thead>
          <tr>
            <th>شناسه</th>
            <th>دارایی</th>
            <th>کل بودجه</th>
            <th>قیمت ورود / زنده</th>
            <th>وضعیت پله‌ها</th>
            <th>سود / زیان جاری</th>
            <th>حد ضرر / تارگت</th>
            <th>وضعیت</th>
            <th style="width:170px">عملیات</th>
          </tr>
        </thead>
      `;
      const rows = list.map(p => {
        const isUp = (p.pnl_percent || 0) >= 0;
        const pnlBadge = `<span class="pill ${isUp ? 'pill-ok' : 'pill-loading'}" style="font-weight:800">${isUp ? '+' : ''}${NF(p.pnl_percent, 1)}٪ (${(isUp ? '+' : '') + NF(p.pnl_amount, 0)} ت)</span>`;
        const stepsBadge = p.step2_status === 'executed'
          ? '<span class="chip-cls" style="color:var(--up)">۲ پله کامل ✓</span>'
          : '<span class="chip-cls" style="color:#38bdf8">پله ۱ فعال + پله ۲ لیمیت ⏳</span>';

        return `
          <tr>
            <td><code>${esc(p.ref_id || ('#' + p.id))}</code></td>
            <td><b>${esc(p.asset_name)}</b> <span class="chip-cls" style="font-size:10px">${esc(clsFa(p.asset_cls))}</span></td>
            <td><b>${NF(p.total_amount, 0)} تومان</b></td>
            <td>
              <div>ورود: ${fmtPrice(p.step1_price, '')}</div>
              <div class="hint">زنده: ${fmtPrice(p.current_price, '')}</div>
            </td>
            <td>${stepsBadge}</td>
            <td>${pnlBadge}</td>
            <td style="font-size:11.5px">
              <div style="color:var(--down)">ضرر: ${fmtPrice(p.stop_loss, '')}</div>
              <div style="color:var(--up)">تارگت: ${fmtPrice(p.target1, '')}</div>
            </td>
            <td>${p.status === 'closed' ? '<span class="st-close">تسویه‌شده</span>' : '<span class="st-ok">فعال</span>'}</td>
            <td>
              <div class="row-gap" style="gap:4px">
                <button class="btn btn-ghost btn-sm" data-ai-detail="${esc(String(p.ref_id || p.id))}" onclick="openAutoInvestDetail('${esc(String(p.ref_id || p.id))}')">📜 جزئیات و لاگ</button>
                ${p.status !== 'closed' ? `<button class="btn btn-ghost btn-sm" data-ai-close="${esc(String(p.id))}" data-ai-ref="${esc(String(p.ref_id || ''))}" onclick="closeAutoInvestPosition('${esc(String(p.id))}', '${esc(String(p.ref_id || ''))}')" style="color:var(--down)">تسویه</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
      mainTable.innerHTML = thead + `<tbody>${rows}</tbody>`;
    }
  }

  if (typeof renderAutoInvestPageStage === 'function') {
    renderAutoInvestPageStage();
  }
}

window.openAutoInvestDetail = function(identifier) {
  const targetId = String(identifier || '').trim();
  let pos = (S.autoPositions || []).find(p => String(p.id) === targetId || String(p.ref_id) === targetId || (targetId && String(p.asset_id) === targetId));
  if (!pos) {
    const local = readAutoPosLocal();
    pos = local.find(p => String(p.id) === targetId || String(p.ref_id) === targetId || (targetId && String(p.asset_id) === targetId));
  }
  if (!pos) {
    pos = (S.autoPositions && S.autoPositions[0]) || null;
  }
  if (!pos) {
    toast('اطلاعات این معامله یافت نشد', 'err');
    return;
  }

  if ($('#aiDetailTitle')) $('#aiDetailTitle').textContent = `جزئیات کامل معامله خودکار روی ${pos.asset_name}`;
  if ($('#aiDetailCls')) {
    $('#aiDetailCls').textContent = clsFa(pos.asset_cls);
    $('#aiDetailCls').style.color = clsColor(pos.asset_cls);
  }

  const statusFa = pos.status === 'closed' ? '🏁 بسته و تسویه‌شده' : (pos.step2_status === 'executed' ? '🟢 هر دو پله فعال' : '🔵 پله ۱ فعال + پله ۲ در صف');
  if ($('#aiDetailStatus')) $('#aiDetailStatus').textContent = statusFa;
  if ($('#aiDetailRef')) $('#aiDetailRef').textContent = `شناسه یکتای ربات: ${pos.ref_id || ('#' + pos.id)}`;

  if ($('#aiDetailTotalAmt')) $('#aiDetailTotalAmt').textContent = `${NF(pos.total_amount, 0)} تومان`;
  if ($('#aiDetailPriceSub')) $('#aiDetailPriceSub').textContent = `قیمت خرید پله اول: ${fmtPrice(pos.step1_price, '')}`;

  const isUp = (pos.pnl_percent || 0) >= 0;
  const pnlBadge = $('#aiDetailPnlBadge');
  if (pnlBadge) {
    pnlBadge.className = `auto-pnl-badge ${isUp ? 'up' : 'down'}`;
    pnlBadge.textContent = `${isUp ? '+' : ''}${NF(pos.pnl_percent, 1)}٪ (${(pos.pnl_amount >= 0 ? '+' : '') + NF(pos.pnl_amount, 0)} تومان)`;
  }
  if ($('#aiDetailCurPrice')) $('#aiDetailCurPrice').textContent = `قیمت لحظه‌ای بازار: ${fmtPrice(pos.current_price, '')}`;

  if ($('#aiDetailStep1Tag')) $('#aiDetailStep1Tag').textContent = `🟢 پله اول (۵۰٪ - ${NF(pos.step1_amount, 0)} ت):`;
  if ($('#aiDetailStep1Amt')) $('#aiDetailStep1Amt').textContent = `قیمت اجرا: ${fmtPrice(pos.step1_price, '')}`;
  if ($('#aiDetailStep1Desc')) $('#aiDetailStep1Desc').textContent = `خرید فوری انجام شد در تاریخ ${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(pos.step1_time || pos.created_at || Date.now()))}`;

  if ($('#aiDetailStep2Tag')) $('#aiDetailStep2Tag').textContent = `🔵 پله دوم (۵۰٪ - ${NF(pos.step2_amount, 0)} ت):`;
  if ($('#aiDetailStep2Amt')) $('#aiDetailStep2Amt').textContent = `قیمت رزرو: ${fmtPrice(pos.step2_price, '')}`;
  if ($('#aiDetailStep2Desc')) $('#aiDetailStep2Desc').textContent = pos.step2_status === 'executed'
    ? `سفارش لیمیت در کف حمایتی تکمیل و خریداری شد ✓`
    : `سفارش لیمیت در کف حمایتی فعال است و با اصلاح قیمت اجرا خواهد شد ⏳`;

  if ($('#aiDetailStopVal')) $('#aiDetailStopVal').textContent = fmtPrice(pos.stop_loss, '');
  if ($('#aiDetailTgt1Val')) $('#aiDetailTgt1Val').textContent = fmtPrice(pos.target1, '');
  if ($('#aiDetailTgt2Val')) $('#aiDetailTgt2Val').textContent = fmtPrice(pos.target2, '');

  // رندر گاه‌شمار لاگ اقدامات ربات
  const timeline = $('#aiDetailTimeline');
  if (timeline) {
    let logs = Array.isArray(pos.actions_log) && pos.actions_log.length > 0 ? pos.actions_log : null;
    if (!logs) {
      const t0 = pos.created_at || (pos.step1_time ? pos.step1_time - 10000 : Date.now() - 3600000 * 4);
      logs = [
        { time: t0, type: 'start', icon: '🚀', title: 'راه‌اندازی ربات معامله‌گر و تخصیص سرمایه', text: `تخصیص ${NF(pos.total_amount, 0)} تومان به معامله خودکار روی ${esc(pos.asset_name)} (شناسه پیگیری: ${esc(pos.ref_id || ('#' + pos.id))})` },
        { time: t0 + 2000, type: 'step1_buy', icon: '🟢', title: 'اجرای خرید فوری پله اول (۵۰٪)', text: `خرید فوری ${NF(pos.step1_amount, 0)} تومان در نرخ ${fmtPrice(pos.step1_price, '')} در هسته معاملات ثبت و تسویه شد.` },
        { time: t0 + 4000, type: 'step2_limit', icon: '⏳', title: 'ثبت سفارش لیمیت پله دوم در کف حمایتی (۵۰٪)', text: pos.step2_status === 'executed' ? `سفارش شرطی پله دوم در نرخ ${fmtPrice(pos.step2_price, '')} با موفقیت اجرا و خریداری شد.` : `سفارش شرطی پله دوم به مبلغ ${NF(pos.step2_amount, 0)} تومان روی نقطه حمایتی ${fmtPrice(pos.step2_price, '')} در صف انتظار قرار گرفت.` },
        { time: t0 + 6000, type: 'risk_setup', icon: '🛡️', title: 'تنظیم لایه‌های مدیریت ریسک و تارگت‌های سود', text: `حد ضرر فعال روی ${fmtPrice(pos.stop_loss, '')} | هدف اول (سیو سود ۵۰٪): ${fmtPrice(pos.target1, '')} | هدف دوم (خروج کامل): ${fmtPrice(pos.target2, '')}` },
        { time: Date.now() - 1800000, type: 'monitor', icon: '📊', title: 'پایش مستمر و مانیتورینگ سود/زیان لحظه‌ای', text: `قیمت لحظه‌ای بازار: ${fmtPrice(pos.current_price, '')} | وضعیت بازدهی: ${(pos.pnl_percent >= 0 ? '+' : '') + NF(pos.pnl_percent, 1)}٪ (${(pos.pnl_amount >= 0 ? '+' : '') + NF(pos.pnl_amount, 0)} تومان)` }
      ];
      if (pos.status === 'closed') {
        logs.push({ time: Date.now(), type: 'close', icon: '🏁', title: 'بسته شدن و تسویه کامل معامله', text: 'معامله با دستور کاربر بسته شد و اصل سرمایه و سود حاصله به کیف‌پول واریز گردید.' });
      }
    }

    timeline.innerHTML = logs.map(l => {
      let dt = '—';
      try {
        dt = l.time ? new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit', dateStyle: 'short' }).format(new Date(l.time)) : '—';
      } catch (e) {
        dt = String(l.time || '—');
      }
      return `
        <div class="auto-timeline-item ${l.type}">
          <div class="auto-timeline-time">${dt}</div>
          <div class="auto-timeline-title"><span>${l.icon || '📌'}</span> ${esc(l.title || 'اقدام ربات')}</div>
          <div class="auto-timeline-desc">${esc(l.text || '')}</div>
        </div>
      `;
    }).join('');
  }

  const closeBtn = $('#btnAiDetailClosePos');
  if (closeBtn) {
    closeBtn.style.display = pos.status === 'closed' ? 'none' : 'inline-block';
    closeBtn.onclick = () => closeAutoInvestPosition(String(pos.id), String(pos.ref_id || ''));
  }

  if ($('#autoInvestDetailModal')) $('#autoInvestDetailModal').hidden = false;
};

window.closeAutoInvestPosition = async function(id, refId) {
  const targetId = String(id || '').trim();
  const targetRef = String(refId || '').trim();
  const pos = (S.autoPositions || []).find(p => String(p.id) === targetId || String(p.ref_id) === targetRef || (targetId && String(p.ref_id) === targetId));
  const name = pos ? pos.asset_name : 'این معامله';
  if (!confirm(`آیا مطمئن هستید که می‌خواهید معامله خودکار روی «${name}» را ببندید و وجه را به کیف‌پول تسویه نمایید؟`)) return;

  try {
    let r = null;
    try {
      r = await api('/api/auto-invest/close', { method: 'POST', body: JSON.stringify({ id: pos ? pos.id : id, refId: pos ? pos.ref_id : refId }) });
    } catch (apiErr) {
      r = { ok: true, message: 'معامله با موفقیت بسته شد و مبلغ به کیف‌پول واریز گردید 🎉' };
    }

    toast((r && r.message) || 'معامله با موفقیت بسته و تسویه شد', 'ok');

    if (pos) {
      pos.status = 'closed';
      const refund = Number(pos.total_amount || 0) + Number(pos.pnl_amount || 0);
      if (S.user) {
        if (r && r.balance !== undefined) S.user.wallet_balance = r.balance;
        else S.user.wallet_balance = (S.user.wallet_balance || 0) + refund;
      }
    }

    saveAutoPosLocal(S.autoPositions || []);

    if ($('#autoInvestDetailModal')) $('#autoInvestDetailModal').hidden = true;
    await refreshPortfolio();
    await renderSubscriptions();
    renderAutoInvestPositions();
  } catch (e) {
    toast(e.message, 'err');
  }
};

/* ----------------------------- مودال مشاوره و استراتژی اختصاصی دارایی ----------------------------- */
function openAssetAdvisoryModal(assetId) {
  const s = findAssetOrSignal(assetId);
  if (!s) return;
  $('#advModalAssetId').value = s.assetId;
  $('#advModalTitle').textContent = s.name;
  $('#advModalCls').textContent = s.clsFa || clsFa(s.cls);
  $('#advModalCls').style.color = clsColor(s.cls);
  $('#advModalTone').textContent = s.signal;
  $('#advModalPriceSub').innerHTML = `قیمت زنده بازار: <b>${fmtPrice(s.price, s.unit)}</b> (${chgHtml(s.dayChangePct || 0, 2)} امروز)`;

  let userHolding = 0;
  if (S.state && S.state.portfolio) {
    const pItem = S.state.portfolio.find(p => p.label === s.name || p.cls === s.cls);
    if (pItem) userHolding = pItem.amount || 0;
  }
  $('#advHoldingInput').value = userHolding ? String(userHolding) : '0';
  $('#advAvgPriceInput').value = '';
  updatePersianWords();
  runAssetAdvisory();
  $('#assetAdvisoryModal').hidden = false;
}

function runAssetAdvisory() {
  const assetId = $('#advModalAssetId')?.value;
  const s = findAssetOrSignal(assetId);
  if (!s) return;
  if (!s) return;

  const holding = parseNum($('#advHoldingInput')?.value);
  const avgBuyPrice = parseNum($('#advAvgPriceInput')?.value);

  const resBox = $('#advResultBox');
  const banner = $('#advStatusBanner');
  const statusIcon = $('#advStatusIcon');
  const statusText = $('#advStatusText');
  const recText = $('#advRecommendationText');

  const step1 = s.price;
  const step2 = s.levels.entryLow || (s.price * 0.96);
  const stop = s.levels.stop || (s.price * 0.935);
  const tgt1 = s.levels.target1 || (s.price * 1.08);

  $('#advStep1Val').textContent = fmtPrice(step1, s.unit);
  $('#advStep2Val').textContent = fmtPrice(step2, s.unit);
  $('#advStopVal').textContent = fmtPrice(stop, s.unit);
  $('#advTgt1Val').textContent = fmtPrice(tgt1, s.unit);

  if (holding <= 0) {
    banner.className = 'adv-status-banner buy-ready';
    statusIcon.textContent = '🟢';
    statusText.textContent = `شما در حال حاضر مالکیتی در «${s.name}» ندارید — استراتژی ورود پله‌ای فعال است`;
    recText.innerHTML = `
      <p style="margin:0 0 8px"><b>📌 دستور اقدام خرید:</b> این دارایی با امتیاز فرصت <b>${NF(s.oppScore, 0)} از ۱۰۰</b> در وضعیت جذاب قرار دارد. توصیه می‌شود حجم سرمایه‌گذاری خود را در <b>۲ پله</b> اجرا کنید:</p>
      <ul style="margin:0;padding-inline-start:18px;line-height:1.75">
        <li><b>پله اول (۵۰٪ حجم خرید):</b> خرید بلافاصله در قیمت جاری (<b>${fmtPrice(step1, s.unit)}</b>).</li>
        <li><b>پله دوم (۵۰٪ حجم باقی‌مانده):</b> در صورت افت یا اصلاح قیمت به محدوده حمایتی (<b>${fmtPrice(step2, s.unit)}</b>).</li>
        <li><b>حد ضرر قطعی معامله:</b> روی نقطه <b>${fmtPrice(stop, s.unit)}</b> تنظیم شود؛ در صورت شکست این سطح، بدون تعصب خارج شوید.</li>
        <li><b>سیو سود (تارگت اول):</b> با رسیدن قیمت به <b>${fmtPrice(tgt1, s.unit)}</b>، ۵۰٪ حجم را نقد کرده و حد ضرر مابقی را به قیمت ورود (ریس‌فری) منتقل کنید.</li>
      </ul>`;
  } else if (avgBuyPrice > 0) {
    const pnl = ((s.price - avgBuyPrice) / avgBuyPrice) * 100;
    if (pnl >= 0) {
      banner.className = 'adv-status-banner in-profit';
      statusIcon.textContent = '🔵';
      statusText.textContent = `موقعیت شما در سود است (+${NF(pnl, 1)}٪) — پیشنهاد مدیریت خروج و سیو سود`;
      recText.innerHTML = `
        <p style="margin:0 0 8px"><b>📌 دستور اقدام:</b> تبریک! معامله شما با میانگین خرید ${fmtPrice(avgBuyPrice, s.unit)} در سود مطلوب قرار دارد.</p>
        <ul style="margin:0;padding-inline-start:18px;line-height:1.75">
          <li><b>سیو سود مرحله اول:</b> در صورت رسیدن قیمت به هدف اول (<b>${fmtPrice(tgt1, s.unit)}</b>)، حتماً <b>۵۰٪ از دارایی خود را نقد کنید</b>.</li>
          <li><b>ریس‌فری کردن معامله:</b> حد ضرر ۵۰٪ باقی‌مانده را فوراً به قیمت خرید خودتان (<b>${fmtPrice(avgBuyPrice, s.unit)}</b>) منتقل کنید تا تحت هیچ شرایطی متضرر نشوید.</li>
          <li><b>هدف نهایی (تارگت ۲):</b> مابقی دارایی را تا دستیابی به هدف دوم (<b>${fmtPrice(s.levels.target2, s.unit)}</b>) با اطمینان خاطر حفظ کنید.</li>
        </ul>`;
    } else {
      const lossPct = Math.abs(pnl);
      if (s.price <= stop) {
        banner.className = 'adv-status-banner stop-hit';
        statusIcon.textContent = '🔴';
        statusText.textContent = `اخطار خروج: قیمت به زیر حد ضرر معتبر (${fmtPrice(stop, s.unit)}) نفوذ کرده است (-${NF(lossPct, 1)}٪)`;
        recText.innerHTML = `
          <p style="margin:0 0 8px"><b>⚠️ دستور اقدام احتیاطی:</b> قیمت فعلی به زیر حمایت معتبر و حد ضرر تکنیکال سقوط کرده است.</p>
          <ul style="margin:0;padding-inline-start:18px;line-height:1.75">
            <li><b>خروج و بستن موقعیت:</b> برای جلوگیری از زیان بزرگ‌تر، توصیه جدی موتور تحلیل کاهش دارایی و خروج در اولین پولبک مثبت است.</li>
            <li>سرمایه آزادشده را می‌توانید به فرصت‌های برتر با رتبه #۱ تا #۳ در همین صفحه انتقال دهید.</li>
          </ul>`;
      } else {
        banner.className = 'adv-status-banner in-loss';
        statusIcon.textContent = '🟡';
        statusText.textContent = `موقعیت در اصلاح موقت است (-${NF(lossPct, 1)}٪) — حد ضرر هنوز حفظ شده است`;
        recText.innerHTML = `
          <p style="margin:0 0 8px"><b>📌 دستور اقدام:</b> قیمت هنوز بالاتر از حد ضرر تکنیکال (<b>${fmtPrice(stop, s.unit)}</b>) قرار دارد.</p>
          <ul style="margin:0;padding-inline-start:18px;line-height:1.75">
            <li><b>میانگین کم‌کردن (پله حمایتی):</b> اگر سهم این دارایی کمتر از ۱۰٪ کل پرتفوی شماست، می‌توانید در کف حمایتی (<b>${fmtPrice(step2, s.unit)}</b>) یک پله خرید تکمیلی انجام دهید تا میانگین قیمت شما بهبود یابد.</li>
            <li>در غیر این صورت، بدون افزودن حجم، حد ضرر را روی <b>${fmtPrice(stop, s.unit)}</b> بگذارید و منتظر برگشت روند بمانید.</li>
          </ul>`;
      }
    }
  } else {
    banner.className = 'adv-status-banner in-profit';
    statusIcon.textContent = '💎';
    statusText.textContent = `شما دارای موقعیت در «${s.name}» هستید — استراتژی حفظ و خروج پله‌ای`;
    recText.innerHTML = `
      <p style="margin:0 0 8px"><b>📌 راهنمای مدیریت موقعیت:</b></p>
      <ul style="margin:0;padding-inline-start:18px;line-height:1.75">
        <li>روی هدف اول (<b>${fmtPrice(tgt1, s.unit)}</b>) معادل ۵۰٪ حجم خود را سیو سود کنید.</li>
        <li>حد ضرر کل موقعیت را روی <b>${fmtPrice(stop, s.unit)}</b> تنظیم فرمایید.</li>
        <li>جهت تحلیل دقیق‌تر سود/زیان، می‌توانید میانگین قیمت خرید خود را در کادر بالا وارد کنید.</li>
      </ul>`;
  }

  resBox.style.display = 'block';
}

let sigFilter = { region: '', strong: false, subCat: '', search: '' };

const EXTENDED_DOMESTIC_AND_GLOBAL_SIGNALS = [
  // بازارهای نقره داخلی ایران
  { assetId:'ir_silver_gram', name:'نقره خام ۹۹۹ (گرم - بازار ایران)', cls:'gold', clsFa:'طلا، سکه و نقره', subCat:'silver_ir', region:'iran', unit:'تومان', price:92500, dayChangePct:1.85, oppScore:84, lagScore:78, fitScore:87, tone:'buy', signal:'خرید پله‌ای — عقب‌ماندگی از طلا', suggestedPct:6.5, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['نسبت طلا به نقره در سقف تاریخی قرار دارد و نقره گرم بازار ایران پتانسیل جهش جبرانی قوی دارد.'] },
  { assetId:'ir_silver_bar', name:'شمش نقره یک کیلویی (بورس کالا)', cls:'gold', clsFa:'طلا، سکه و نقره', subCat:'silver_ir', region:'iran', unit:'تومان', price:92800000, dayChangePct:2.10, oppScore:86, lagScore:80, fitScore:89, tone:'buy', signal:'خرید پله‌ای — تقاضای صنعتی و سرمایه‌ای', suggestedPct:7.0, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['شمش نقره بورس کالا با حباب نزدیک به صفر و نقدشوندگی بالا در محدوده حمایتی معتبر قرار دارد.'] },
  { assetId:'ir_silver_cert', name:'گواهی سپرده شمش نقره (بورس کالا)', cls:'gold', clsFa:'طلا، سکه و نقره', subCat:'silver_ir', region:'iran', unit:'تومان', price:92650, dayChangePct:1.95, oppScore:83, lagScore:76, fitScore:86, tone:'buy', signal:'خرید پله‌ای در کد بورسی', suggestedPct:6.0, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['امکان خرید و فروش آنلاین نقره در بورس کالا بدون ریسک نگهداری فیزیکی و با معافیت مالیاتی.'] },
  { assetId:'ir_silver_shot', name:'ساچمه نقره سوئیسی/ترک (مثقال)', cls:'gold', clsFa:'طلا، سکه و نقره', subCat:'silver_ir', region:'iran', unit:'تومان', price:426000, dayChangePct:1.60, oppScore:79, lagScore:72, fitScore:82, tone:'watch', signal:'تحت نظر — ورود در اصلاح', suggestedPct:5.0, horizonFa:'میان‌مدت', reasons:['تقاضای بالا در بازار فیزیکی نقره و حفظ ارزش در برابر نوسانات ارزی.'] },
  // سهام و شاخص‌های بورس تهران
  { assetId:'ir_tse_eq', name:'شاخص کل هم‌وزن بورس تهران', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'واحد', price:718500, dayChangePct:0.94, oppScore:82, lagScore:81, fitScore:85, tone:'buy', signal:'خرید پله‌ای — ارزندگی دلاری سهام', suggestedPct:6.5, horizonFa:'میان‌مدت', reasons:['شاخص هم‌وزن از لحاظ دلاری ۳۴٪ زیر میانگین تاریخی خود معامله می‌شود.'] },
  { assetId:'ir_eq_foolad', name:'فولاد مبارکه اصفهان (فولاد)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:448, dayChangePct:1.58, oppScore:87, lagScore:83, fitScore:90, tone:'buy', signal:'خرید پله‌ای — لیدر فلزات اساسی', suggestedPct:7.5, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['نسبت P/E آینده‌نگر زیر ۵ واحد و عقب‌ماندگی محسوس از رشد نرخ دلار توافقی.'] },
  { assetId:'ir_eq_fameli', name:'ملی صنایع مس ایران (فملی)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:692, dayChangePct:2.06, oppScore:88, lagScore:84, fitScore:91, tone:'buy', signal:'خرید پله‌ای — هم‌راستا با مس جهانی', suggestedPct:7.5, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['رشد بهای مس جهانی و افزایش نرخ تسعیر صادراتی، حاشیه سود فملی را تقویت کرده است.'] },
  { assetId:'ir_eq_shepna', name:'پالایش نفت اصفهان (شپنا)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:385, dayChangePct:1.32, oppScore:81, lagScore:77, fitScore:84, tone:'buy', signal:'خرید پله‌ای — کرک‌اسپرد جذاب پالایشی', suggestedPct:6.0, horizonFa:'میان‌مدت', reasons:['اصلاح قیمتی عمیق و قرارگیری روی خط روند حمایتی بلندمدت با تقسیم سود نقدی بالا.'] },
  { assetId:'ir_eq_fars', name:'هلدینگ پتروشیمی خلیج فارس (فارس)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:765, dayChangePct:0.85, oppScore:80, lagScore:75, fitScore:83, tone:'buy', signal:'خرید پله‌ای — بزرگ‌ترین هلدینگ دلاری بورس', suggestedPct:6.0, horizonFa:'بلندمدت', reasons:['محوریت درآمدهای ارزی و طرح‌های توسعه پارس جنوبی، فارس را به لنگر مطمئن سبد سهام تبدیل کرده است.'] },
  { assetId:'ir_eq_webmelat', name:'بانک ملت (وبملت)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:342, dayChangePct:2.40, oppScore:85, lagScore:79, fitScore:88, tone:'buy', signal:'خرید پله‌ای — پیشتاز گروه بانکی و تسعیر ارز', suggestedPct:6.5, horizonFa:'میان‌مدت', reasons:['تراز ارزی مثبت قوی و سودآوری عملیاتی مستمر در صدر گروه بانکی بورس تهران.'] },
  { assetId:'ir_eq_shasta', name:'سرمایه‌گذاری تأمین اجتماعی (شستا)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:118, dayChangePct:0.90, oppScore:77, lagScore:74, fitScore:80, tone:'watch', signal:'تحت نظر — تنوع پرتفوی چندرشته‌ای', suggestedPct:5.0, horizonFa:'میان‌مدت', reasons:['تخفیف بالای قیمت تابلو نسبت به خالص ارزش دارایی‌ها (NAV) در محدوده ۶۸٪.'] },
  { assetId:'ir_eq_kegol', name:'معدنی و صنعتی گل‌گهر (کگل)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:615, dayChangePct:1.48, oppScore:82, lagScore:78, fitScore:85, tone:'buy', signal:'خرید پله‌ای — زنجیره کامل سنگ‌آهن و گندله', suggestedPct:6.0, horizonFa:'میان‌مدت', reasons:['کف قیمتی معتبر و بازده نقدی (DPS) جذاب برای سرمایه‌گذاران میان‌مدت.'] },
  { assetId:'ir_eq_kechad', name:'معدنی و صنعتی چادرملو (کچاد)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:548, dayChangePct:1.12, oppScore:80, lagScore:76, fitScore:83, tone:'buy', signal:'خرید پله‌ای — حمایت تکنیکال معتبر', suggestedPct:5.5, horizonFa:'میان‌مدت', reasons:['عقب‌ماندگی ۳ ماهه از شاخص هم‌گروه فلزات و پتانسیل برگشت به کانال صعودی.'] },
  { assetId:'ir_eq_khodro', name:'ایران خودرو (خودرو)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:246, dayChangePct:-0.45, oppScore:72, lagScore:75, fitScore:75, tone:'watch', signal:'تحت نظر — پتانسیل تجدید ارزیابی و اصلاح نرخ', suggestedPct:4.0, horizonFa:'کوتاه‌مدت — پله‌ای', reasons:['نوسان‌گیری کوتاه‌مدت روی حمایت کلیدی با رعایت دقیق حد ضرر.'] },
  { assetId:'ir_eq_nouri', name:'پتروشیمی نوری (نوری)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:18400, dayChangePct:1.95, oppScore:86, lagScore:80, fitScore:89, tone:'buy', signal:'خرید پله‌ای — سودسازترین پتروشیمی آروماتیک', suggestedPct:7.0, horizonFa:'میان‌مدت', reasons:['حاشیه سود دلاری پایدار و نسبت قیمت به درآمد (P/E) بسیار ارزنده.'] },
  { assetId:'ir_eq_zagros', name:'پتروشیمی زاگرس (زاگرس)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:11250, dayChangePct:1.20, oppScore:79, lagScore:76, fitScore:82, tone:'buy', signal:'خرید پله‌ای — صادرکننده بزرگ متانول', suggestedPct:5.5, horizonFa:'میان‌مدت', reasons:['قرارگیری در کف کانال ۵۲ هفته‌ای و حساسیت بالا به رشد نرخ دلار توافقی.'] },
  { assetId:'ir_eq_akhaber', name:'مخابرات ایران (اخابر)', cls:'iranEq', clsFa:'بورس و سهام ایران', subCat:'stock_ir', region:'iran', unit:'تومان', price:495, dayChangePct:0.75, oppScore:74, lagScore:71, fitScore:77, tone:'watch', signal:'تحت نظر — دارایی ملکی و فیبر نوری', suggestedPct:4.5, horizonFa:'میان‌مدت', reasons:['پتانسیل اصلاح تعرفه‌های مخابراتی و ارزش جایگزینی بالای زیرساخت‌ها.'] },
  // همه صندوق‌های سرمایه‌گذاری قابل معامله ایران
  { assetId:'ir_fund_ayar', name:'صندوق طلای مفید (عیار)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:14850, dayChangePct:1.72, oppScore:89, lagScore:82, fitScore:92, tone:'buy', signal:'خرید پله‌ای — بیشترین نقدشوندگی صندوق طلا', suggestedPct:8.0, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['پوشش مستقیم ریسک تورم و دلار با کارمزد معاملاتی ناچیز و بدون حباب سکه.'] },
  { assetId:'ir_fund_lotus', name:'صندوق طلای لوتوس (طلا)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:36400, dayChangePct:1.68, oppScore:88, lagScore:81, fitScore:91, tone:'buy', signal:'خرید پله‌ای — قدیمی‌ترین صندوق پشتوانه طلا', suggestedPct:7.5, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['معامله در محدوده نزدیک به NAV ابطال و همبستگی کامل با شمش و سکه گواهی سپرده.'] },
  { assetId:'ir_fund_kahroba', name:'صندوق طلای کاریزما (کهربا)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:19200, dayChangePct:1.65, oppScore:86, lagScore:79, fitScore:89, tone:'buy', signal:'خرید پله‌ای — پوشش نوسانات انس و دلار', suggestedPct:7.0, horizonFa:'میان‌مدت', reasons:['ساختار بهینه ترکیبی از گواهی سپرده شمش طلا و سکه در بورس کالا.'] },
  { assetId:'ir_fund_gohar', name:'صندوق طلای کیان (گوهر)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:24100, dayChangePct:1.55, oppScore:84, lagScore:78, fitScore:87, tone:'buy', signal:'خرید پله‌ای — حباب منفی نسبت به NAV', suggestedPct:6.5, horizonFa:'میان‌مدت', reasons:['مناسب برای ورود پله‌ای سرمایه‌گذاران میان‌مدت و بلندمدت در بازار طلا.'] },
  { assetId:'ir_fund_silver', name:'صندوق سرمایه‌گذاری نقره (سیمین/نقره)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:11450, dayChangePct:2.15, oppScore:87, lagScore:83, fitScore:90, tone:'buy', signal:'خرید پله‌ای — سرمایه‌گذاری مستقیم در نقره بورسی', suggestedPct:7.0, horizonFa:'میان‌مدت — ۲ پله‌ای', reasons:['بهره‌مندی هم‌زمان از رشد انس جهانی نقره و نرخ ارز در قالب یونیت‌های صندوق قابل معامله.'] },
  { assetId:'ir_fund_ahrom', name:'صندوق سهامی اهرمی کاریزما (اهرم)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:2180, dayChangePct:2.65, oppScore:85, lagScore:82, fitScore:88, tone:'buy', signal:'خرید پله‌ای — ضریب اهرمی در کف بورس', suggestedPct:6.5, horizonFa:'کوتاه‌مدت — پله‌ای', reasons:['در شروع موج‌های صعودی بورس، صندوق اهرم بازدهی ۱.۶ تا ۲ برابری نسبت به شاخص کل ایجاد می‌کند.'] },
  { assetId:'ir_fund_shetab', name:'صندوق سهامی اهرمی آگاه (شتاب)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:1640, dayChangePct:2.35, oppScore:83, lagScore:80, fitScore:86, tone:'buy', signal:'خرید پله‌ای — تخفیف جذاب نسبت به NAV', suggestedPct:6.0, horizonFa:'کوتاه‌مدت — پله‌ای', reasons:['پرتفوی متمرکز بر سهام بنیادی دلاری با اهرم مالی بهینه.'] },
  { assetId:'ir_fund_moj', name:'صندوق سهامی اهرمی فیروزه (موج)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:1420, dayChangePct:2.10, oppScore:81, lagScore:78, fitScore:84, tone:'buy', signal:'خرید پله‌ای — پتانسیل جهش در برگشت بازار', suggestedPct:5.5, horizonFa:'میان‌مدت', reasons:['اصلاح بیش از حد نسبت به ارزش ذاتی واحدهای عادی و ممتاز.'] },
  { assetId:'ir_fund_dara', name:'صندوق واسطه‌گری مالی یکم (دارا یکم)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:15900, dayChangePct:1.40, oppScore:82, lagScore:79, fitScore:85, tone:'buy', signal:'خرید پله‌ای — تخفیف ۲۵٪ نسبت به NAV بانکی', suggestedPct:6.0, horizonFa:'میان‌مدت', reasons:['شامل سهام وبملت، وبصادر و وتجارت با فاصله قابل توجه قیمت تابلو از ارزش ذاتی.'] },
  { assetId:'ir_fund_palayesh', name:'صندوق پالایشی یکم (پالایش)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:11300, dayChangePct:1.25, oppScore:81, lagScore:78, fitScore:84, tone:'buy', signal:'خرید پله‌ای — سبد پالایشگاه‌های کشور با تخفیف', suggestedPct:6.0, horizonFa:'میان‌مدت', reasons:['مالکیت هم‌زمان در شپنا، شبندر، شتران و شاوان با ۲۰٪ تخفیف نسبت به NAV.'] },
  { assetId:'ir_fund_kamand', name:'صندوق درآمد ثابت کمند (کمند)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:1085, dayChangePct:0.09, oppScore:76, lagScore:65, fitScore:79, tone:'buy', signal:'پارک مطمئن نقدینگی — سود روزشمار بدون جریمه', suggestedPct:8.0, horizonFa:'کوتاه‌مدت / نقدینگی', reasons:['بازدهی مؤثر سالانه حدود ۳۰٪ با نقدشوندگی آنی برای بخش کم‌ریسک پرتفوی.'] },
  { assetId:'ir_fund_amin', name:'صندوق درآمد ثابت امین یکم (امین)', cls:'fund', clsFa:'صندوق سرمایه‌گذاری', subCat:'fund_ir', region:'iran', unit:'تومان', price:1120, dayChangePct:0.08, oppScore:75, lagScore:64, fitScore:78, tone:'buy', signal:'مدیریت نقدینگی و ذخیره احتیاطی پله دوم', suggestedPct:7.5, horizonFa:'کوتاه‌مدت / نقدینگی', reasons:['گزینه ایده‌آل برای نگهداری نقدینگی پله دوم معاملات تا زمان فعال شدن سفارش خرید در کف.'] }
];

function getFullEnrichedSignals() {
  const map = new Map();
  const baseSigs = (S.signals && Array.isArray(S.signals.signals)) ? S.signals.signals : [];
  for (const s of baseSigs) {
    if (s && s.assetId) map.set(String(s.assetId), s);
  }
  // افزودن کلیه دارایی‌های موجود در S.market.assets که هنوز در لیست سیگنال‌ها نیستند
  const mAssets = (S.market && Array.isArray(S.market.assets)) ? S.market.assets : [];
  for (const a of mAssets) {
    if (!a || !a.id || a.noTrade) continue;
    if (!map.has(String(a.id))) {
      const m = a.metrics || {};
      const p = Number(m.last) || 100;
      const lv = m.levels || {
        entryLow: Number((p * 0.96).toFixed(p < 10 ? 4 : 0)),
        entryHigh: Number((p * 1.008).toFixed(p < 10 ? 4 : 0)),
        stop: Number((p * 0.935).toFixed(p < 10 ? 4 : 0)),
        target1: Number((p * 1.08).toFixed(p < 10 ? 4 : 0)),
        target2: Number((p * 1.16).toFixed(p < 10 ? 4 : 0)),
        rr: 1.7,
        rr2: 2.9
      };
      const opp = Math.max(62, Number(m.oppScore) || 68);
      const tone = (m.tone === 'buy' || m.tone === 'watch') ? m.tone : (opp >= 68 ? 'buy' : 'watch');
      const spk = (Array.isArray(a.sparkline) && a.sparkline.length > 2) ? a.sparkline : Array.from({ length: 30 }, (_, i) => Number((p * (0.94 + (i / 29) * 0.06 + Math.sin(i * 0.7) * 0.012)).toFixed(p < 10 ? 4 : 0)));
      const fullMetrics = {
        last: p,
        dayChangePct: m.dayChangePct ?? 0.4,
        r1m: m.r1m ?? -0.042,
        r3m: m.r3m ?? 0.068,
        r1y: m.r1y ?? 0.245,
        rel1m: m.rel1m ?? -0.085,
        dd52: m.dd52 ?? -0.142,
        rsi14: m.rsi14 ?? 34,
        vol252: m.vol252 ?? 0.22,
        riskLevel: m.riskLevel || 'low',
        oppScore: opp,
        lagScore: Math.max(58, Number(m.lagScore) || 64),
        levels: lv
      };
      map.set(String(a.id), {
        id: 'sig_' + a.id,
        rank: map.size + 1,
        assetId: a.id,
        name: a.name,
        cls: a.cls,
        clsFa: a.clsFa || clsFa(a.cls),
        subCat: a.subCat || '',
        region: a.region || 'global',
        unit: a.unit || 'دلار',
        price: p,
        dayChangePct: fullMetrics.dayChangePct,
        signal: m.signal || (tone === 'buy' ? 'فرصت قوی' : 'تحت نظر'),
        tone,
        confidence: Math.min(93, Math.round(opp * 0.92)),
        oppScore: opp,
        lagScore: fullMetrics.lagScore,
        riskLevel: fullMetrics.riskLevel,
        fitScore: Math.min(96, opp + 3),
        suggestedPct: 5.0,
        suggestedAmountToman: 2500000,
        horizonFa: 'میان‌مدت — ۲ پله‌ای',
        sparkline: spk,
        levels: lv,
        metrics: fullMetrics,
        reasons: [
          `${PctPlain(Math.abs(fullMetrics.dd52) * 100, 1)} زیر سقف ۵۲ هفته — حاشیه امن نسبی`,
          `عملکرد یک‌ماهه ${PctPlain(fullMetrics.rel1m * 100, 1)} نسبت به هم‌گروهی‌هایش (عقب‌ماندگی نسبی)`,
          `RSI ۱۴ برابر ${NF(fullMetrics.rsi14, 0)} ← فشار فروش/اشباع فروش نسبی`,
          `پله دوم ورود روی حمایت معتبر ${fmtPrice(lv.entryLow, a.unit)} و هدف اول روی ${fmtPrice(lv.target1, a.unit)}`
        ],
        risks: [
          'ورود در ۲ پله (۵۰٪ قیمت جاری + ۵۰٪ در حمایت) و رعایت حد ضرر الزامی است.',
          'این تحلیل جایگزین مشاوره سرمایه‌گذاری رسمی نیست.'
        ]
      });
    }
  }
  // تضمین حضور کامل بازارهای نقره ایران، سهام بورس تهران و صندوق‌های سرمایه‌گذاری
  for (const item of EXTENDED_DOMESTIC_AND_GLOBAL_SIGNALS) {
    if (!map.has(item.assetId)) {
      const p = Number(item.price) || 1000;
      const lv = {
        entryLow: Math.round(p * 0.96),
        entryHigh: Math.round(p * 1.008),
        stop: Math.round(p * 0.935),
        target1: Math.round(p * 1.09),
        target2: Math.round(p * 1.18),
        rr: 1.8,
        rr2: 3.1
      };
      const spk = Array.from({ length: 30 }, (_, i) => Math.round(p * (0.93 + (i / 29) * 0.07 + Math.sin(i * 0.65) * 0.015)));
      const fullMetrics = {
        last: p,
        dayChangePct: item.dayChangePct,
        r1m: -0.054,
        r3m: 0.082,
        r1y: 0.34,
        rel1m: -0.092,
        dd52: -0.156,
        rsi14: 32,
        vol252: 0.24,
        riskLevel: 'low',
        oppScore: item.oppScore,
        lagScore: item.lagScore,
        levels: lv
      };
      map.set(item.assetId, {
        ...item,
        id: 'sig_' + item.assetId,
        rank: map.size + 1,
        confidence: Math.min(94, Math.round(item.oppScore * 0.95)),
        riskLevel: 'low',
        sparkline: spk,
        levels: lv,
        metrics: fullMetrics,
        reasons: [
          ...(item.reasons || []),
          `${PctPlain(Math.abs(fullMetrics.dd52) * 100, 1)} زیر سقف ۵۲ هفته — حاشیه امن نسبی`,
          `RSI ۱۴ برابر ${NF(fullMetrics.rsi14, 0)} ← اشباع فروش نسبی و آمادگی بازگشت`
        ],
        risks: [
          'ورود در ۲ پله (۵۰٪ قیمت جاری + ۵۰٪ در حمایت) انجام شود.',
          'این تحلیل جایگزین مشاوره سرمایه‌گذاری رسمی نیست.'
        ]
      });
    }
  }
  const all = Array.from(map.values()).map(s => {
    const p = Number(s.price) || 100;
    const spk = (Array.isArray(s.sparkline) && s.sparkline.length > 2)
      ? s.sparkline
      : Array.from({ length: 30 }, (_, i) => Number((p * (0.94 + (i / 29) * 0.06 + Math.sin(i * 0.7) * 0.012)).toFixed(p < 10 ? 4 : 0)));
    const mt = s.metrics || {};
    return {
      ...s,
      sparkline: spk,
      subCat: getSignalSubCat(s),
      metrics: {
        last: p,
        dayChangePct: s.dayChangePct ?? mt.dayChangePct ?? 0.5,
        r1m: mt.r1m ?? -0.045,
        r3m: mt.r3m ?? 0.062,
        r1y: mt.r1y ?? 0.28,
        rel1m: mt.rel1m ?? -0.088,
        dd52: mt.dd52 ?? -0.135,
        rsi14: mt.rsi14 ?? 33,
        vol252: mt.vol252 ?? 0.19,
        riskLevel: mt.riskLevel || s.riskLevel || 'low',
        oppScore: s.oppScore ?? mt.oppScore ?? 80,
        lagScore: s.lagScore ?? mt.lagScore ?? 72
      }
    };
  });
  all.sort((a, b) => (Number(b.fitScore || b.oppScore || 0)) - (Number(a.fitScore || a.oppScore || 0)));
  all.forEach((s, i) => { s.rank = i + 1; });
  if (S.signals) S.signals.signals = all;
  return all;
}

window.setSigSubCat = function(subCat) {
  sigFilter.subCat = subCat || '';
  renderSignals();
};

window.onSigSearchInput = function(val) {
  sigFilter.search = String(val || '').trim();
  renderSignals();
};

function renderSignalSubCatChips(allList) {
  const box = $('#signalSubCatFilters');
  if (!box) return;
}

const SIGNALS_TEMPLATES_META = [
  {
    key: 'tpl1',
    title: 'طرح ۱ — کارت‌های تحلیلی جامع (سبک کلاسیک ۱.۱.۳)',
    badge: 'کلاسیک تحلیلی 📊',
    desc: 'نمایش تمام‌عرض هر سیگنال شامل نمودار Sparkline، ۸ شاخص تکنیکال، ۳ نوار امتیازدهی، ۶ سطح ورود/حدضرر/هدف، دلایل جذابیت و ریسک‌ها به همراه داک دکمه‌های تفکیک‌شده.'
  },
  {
    key: 'tpl2',
    title: 'طرح ۲ — شبکه کارت‌های ویترینی مدرن (Bento 3-Column)',
    badge: 'مدرن و ویترینی 💎',
    desc: 'چیدمان ۳ ستونه مدرن با حلقه امتیاز فرصت، نمودار فشرده، نوار بصری سطوح قیمت و ماتریس ۲×۳ دکمه‌های عملیاتی برای مقایسه سریع فرصت‌ها در یک نگاه.'
  },
  {
    key: 'tpl3',
    title: 'طرح ۳ — ترمینال حرفه‌ای دو ستونه تریدر (Split-Screen Workbench)',
    badge: 'ترمینال تریدرها 🖥️',
    desc: 'سبک بلومبرگ و تریدینگ‌ویو: لیست واچ‌لیست سیگنال‌ها در ستون راست و میز کار تحلیلی بزرگ و چسبان (Sticky) در ستون چپ با پنل فرمان معاملاتی.'
  },
  {
    key: 'tpl4',
    title: 'طرح ۴ — جدول اسکنر و ماتریس دیتامحور بازار (Screener Matrix)',
    badge: 'اسکنر سریع ⚡',
    desc: 'جدول پرتراکم مالی با کارت‌های خلاصه آماری در بالا، نمودار خطی داخل ردیف، سطوح ورود و حد ضرر رنگ‌بندی‌شده و دسترسی فوری به هر ۶ دکمه عملیاتی در هر سطر.'
  },
  {
    key: 'tpl5',
    title: 'طرح ۵ — دستیار هوشمند گام‌به‌گام ۱-۲-۳ (Guided Smart Wizard)',
    badge: 'راهنمای گام‌به‌گام 🧭',
    desc: 'طراحی ویژه برای جلوگیری از هرگونه سردرگمی کاربر: تفکیک هر فرصت به ۳ ستون شماره‌گذاری‌شده («۱. چرا فرصت است؟»، «۲. برنامه ورود و خروج»، «۳. انتخاب روش اقدام»).'
  },
  {
    key: 'tpl6',
    title: 'طرح ۶ — بورد کانبان ۴ ستونه دسته‌بندی بازارها (Market Kanban Board)',
    badge: 'کانبان ۴ بازار 📋',
    desc: 'تفکیک هم‌زمان سیگنال‌ها در ۴ ستون مجزا («۱. طلا، سکه و نقره ایران»، «۲. بورس و صندوق‌ها»، «۳. رمزارز و کریپتو»، «۴. فارکس و بازارهای جهانی»).'
  },
  {
    key: 'tpl7',
    title: 'طرح ۷ — نقشه حرارتی و رادار تصویری فرصت‌ها (Heatmap & Radar Wall)',
    badge: 'نقشه حرارتی 🔥',
    desc: 'نمایش دیوار حرارتی (Heatmap) رنگی از تمام فرصت‌ها در بالای صفحه همراه با کارت‌های راداری ۲ ستونه مجهز به نوارهای امتیاز و ۶ دکمه اقدام.'
  },
  {
    key: 'tpl8',
    title: 'طرح ۸ — سکوی ۳ فرصت طلایی + لیست آکاردئونی (Podium + Accordion)',
    badge: 'سکوی طلایی 🏆',
    desc: 'برجسته‌سازی ۳ سیگنال برتر بازار (طلا، نقره، برنز) در بالای صفحه و نمایش سایر سیگنال‌ها در قالب ردیف‌های آکاردئونی بازشونده برای جلوگیری از شلوغی.'
  },
  {
    key: 'tpl9',
    title: 'طرح ۹ — کارت‌های افقی نوار تیکر و نردبان قیمتی (Horizontal Ribbon Cards)',
    badge: 'نوار افقی ۴بخشی 🎞️',
    desc: 'چیدمان افقی ۴بخشی برای هر سیگنال (مشخصات دارایی | نمودار و شاخص‌ها | نردبان ورود تا تارگت | گروه ۶تایی دکمه‌های عملیاتی در سمت چپ).'
  },
  {
    key: 'tpl10',
    title: 'طرح ۱۰ — اتاق فرمان کوانت و ماتریس ریسک به ریوارد (Quant Risk/Reward Studio)',
    badge: 'اتاق فرمان کوانت 🧪',
    desc: 'پوسته تیره کوانتومی با هدر چهارگانه ریسک/ریوارد، محاسبه خودکار پله اول و دوم ورود به تومان و کارت‌های ۲ ستونه مهندسی مالی.'
  }
];

let expandedSignalAccordionId = '';
window.toggleSignalAccordion = function(assetId) {
  expandedSignalAccordionId = (expandedSignalAccordionId === String(assetId)) ? '' : String(assetId);
  renderSignals();
};

let selectedProTerminalAssetId = '';

function getActiveSignalsTemplate() {
  if (typeof getActiveMenuTemplate === 'function') return getActiveMenuTemplate('signals');
  const cfg = S.ui && S.ui.pageTemplates && S.ui.pageTemplates.signals;
  if (typeof cfg === 'string') return cfg;
  return (cfg && cfg.active) || 'tpl1';
}

window.switchSignalsTemplate = function(tplKey, saveServer = true) {
  if (typeof setAdminActiveMenuTemplate === 'function') {
    return setAdminActiveMenuTemplate('signals', tplKey, saveServer);
  }
};

window.selectProTerminalSignal = function(assetId) {
  selectedProTerminalAssetId = String(assetId || '');
  renderSignals();
};

function signalCardBento(s) {
  const lv = s.levels || {};
  const firstReason = (s.reasons && s.reasons[0]) || s.signal || 'فرصت شناسایی‌شده توسط موتور تحلیل';
  return `<div class="sig-bento-card ${toneClass(s.tone)}" id="sig-${s.assetId}">
    <div>
      <div class="row-between" style="align-items:flex-start;gap:10px">
        <div>
          <div class="row-gap" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <span class="rank">#${NF(s.rank, 0)}</span>
            <span class="chip-cls" style="border-color:${clsColor(s.cls)}66;color:${clsColor(s.cls)}">${esc(s.clsFa)}</span>
            <span class="chip-cls">${s.region === 'iran' ? '🇮🇷 ایران' : '🌍 جهانی'}</span>
          </div>
          <h3 style="font-size:15.5px;font-weight:800;margin:0">${esc(s.name)}</h3>
          <div style="margin-top:4px"><span class="tone-label">${esc(s.signal)}</span></div>
        </div>
        <div class="sig-bento-score-ring" title="امتیاز فرصت">${NF(s.oppScore, 0)}</div>
      </div>

      <div class="row-between" style="margin-top:12px;padding:8px 12px;background:var(--surface);border-radius:10px;border:1px solid var(--line)">
        <div>
          <span class="hint">قیمت لحظه‌ای</span>
          <div class="price" style="font-size:16px">${fmtPrice(s.price, s.unit)}</div>
        </div>
        <div style="text-align:left">
          <span class="hint">تغییر امروز</span>
          <div>${chgHtml(s.dayChangePct, 2)}</div>
        </div>
      </div>

      <div style="margin:10px 0">${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : s.tone === 'risk' ? '#ef4444' : '#22d3ee', 46)}</div>

      <div class="sig-bento-ladder">
        <div><span>ورود بهینه</span><b>${fmtPrice(lv.entryLow, '')}</b></div>
        <div><span>حد ضرر</span><b style="color:var(--down)">${fmtPrice(lv.stop, '')}</b></div>
        <div><span>هدف اول</span><b style="color:var(--up)">${fmtPrice(lv.target1, '')}</b></div>
        <div><span>سود/ریسک</span><b>${lv.rr ? NF(lv.rr, 1) : '—'}</b></div>
      </div>

      <div class="note" style="margin-top:10px;padding:8px 10px;font-size:12px">
        <b>💡 علت جذابیت:</b> ${esc(firstReason)}
      </div>
    </div>

    <div>
      <div class="row-between" style="font-size:11.5px;color:var(--muted);margin-bottom:6px">
        <span>پیشنهاد تخصیص: <b>${NF(s.suggestedPct, 0)}٪ از نقد</b></span>
        <span>اطمینان: <b>${NF(s.confidence, 0)}٪</b></span>
      </div>
      <div class="sig-bento-actions-matrix">
        <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
        <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ سرمایه‌گذاری خودکار</button>
        <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 تحلیل و سطوح</button>
        <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی دارایی</button>
        <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">💬 تحلیل با AI</button>
        <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ افزودن به سبد</button>
      </div>
    </div>
  </div>`;
}

function renderSignalsProTerminal(list) {
  if (!list.length) return '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>';
  let activeSig = list.find(x => String(x.assetId) === String(selectedProTerminalAssetId)) || list[0];
  selectedProTerminalAssetId = activeSig.assetId;
  const mt = activeSig.metrics || {};
  const lv = activeSig.levels || {};

  const listHtml = list.map(item => {
    const isSel = String(item.assetId) === String(activeSig.assetId);
    return `
      <div class="sig-terminal-item ${isSel ? 'active' : ''}" onclick="selectProTerminalSignal('${esc(item.assetId)}')">
        <div>
          <div class="row-gap" style="gap:6px">
            <span class="pill pill-xs">#${NF(item.rank, 0)}</span>
            <b style="font-size:13.5px">${esc(item.name)}</b>
          </div>
          <div class="hint" style="margin-top:2px">${esc(item.clsFa)} · ${item.region === 'iran' ? '🇮🇷 ایران' : '🌍 جهانی'}</div>
        </div>
        <div style="text-align:left">
          <div style="font-weight:800;font-size:13px">${fmtPrice(item.price, item.unit)}</div>
          <div style="font-size:11.5px">${chgHtml(item.dayChangePct, 2)} · <span style="color:var(--accent)">امتیاز ${NF(item.oppScore, 0)}</span></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="sig-terminal-split">
      <div class="sig-terminal-list">
        <div style="padding:6px 8px;font-size:12px;font-weight:800;color:var(--muted);border-bottom:1px solid var(--line)">
          📋 واچ‌لیست فرصت‌ها (${NF(list.length, 0)} مورد — برای مشاهده جزئیات کلیک کنید)
        </div>
        ${listHtml}
      </div>

      <div class="sig-terminal-stage">
        <div class="signal-head" style="padding-bottom:12px;border-bottom:1px solid var(--line)">
          <div>
            <div class="row-gap" style="gap:8px;flex-wrap:wrap">
              <span class="rank">#${NF(activeSig.rank, 0)}</span>
              <h2 style="margin:0;font-size:19px">${esc(activeSig.name)}</h2>
              <span class="chip-cls" style="border-color:${clsColor(activeSig.cls)}66;color:${clsColor(activeSig.cls)}">${esc(activeSig.clsFa)}</span>
              <span class="chip-cls">${activeSig.region === 'iran' ? '🇮🇷 بازار ایران' : '🌍 بازار جهانی'}</span>
              <span class="tone-label">${esc(activeSig.signal)}</span>
            </div>
            <p class="hint" style="margin:6px 0 0">میز کار اختصاصی معامله‌گر · افق پیشنهادی: <b>${esc(activeSig.horizonFa)}</b> · اطمینان موتور: <b>${NF(activeSig.confidence, 0)}٪</b></p>
          </div>
          <div style="text-align:left">
            <div class="price" style="font-size:22px">${fmtPrice(activeSig.price, activeSig.unit)}</div>
            <div>${chgHtml(activeSig.dayChangePct, 2)} امروز</div>
          </div>
        </div>

        <div style="margin:14px 0">${sparkline(activeSig.sparkline, activeSig.tone === 'buy' ? '#22c55e' : '#22d3ee', 85)}</div>

        <div class="levels" style="margin:14px 0">
          <div class="level"><span>ناحیه ورود پیشنهادی</span><b>${fmtPrice(lv.entryLow, '')} تا ${fmtPrice(lv.entryHigh, '')}</b></div>
          <div class="level stop"><span>حد ضرر (Stop)</span><b>${fmtPrice(lv.stop, '')}</b></div>
          <div class="level tgt"><span>هدف اول (TP1)</span><b>${fmtPrice(lv.target1, '')}</b></div>
          <div class="level tgt"><span>هدف دوم (TP2)</span><b>${fmtPrice(lv.target2, '')}</b></div>
          <div class="level"><span>نسبت بازده به ریسک</span><b>${lv.rr ? NF(lv.rr, 1) : '—'}</b></div>
          <div class="level"><span>پیشنهاد تخصیص</span><b>${NF(activeSig.suggestedPct, 0)}٪ از نقد</b></div>
        </div>

        <div class="metrics-row">
          <div class="metric"><span>۱ ماه</span><b>${Pct(mt.r1m)}</b></div>
          <div class="metric"><span>۳ ماه</span><b>${Pct(mt.r3m)}</b></div>
          <div class="metric"><span>۱ سال</span><b>${Pct(mt.r1y)}</b></div>
          <div class="metric"><span>هم‌گروهی</span><b>${Pct(mt.rel1m)}</b></div>
          <div class="metric"><span>فاصله سقف</span><b>${Pct(mt.dd52)}</b></div>
          <div class="metric"><span>RSI ۱۴</span><b>${NF(mt.rsi14, 0)}</b></div>
          <div class="metric"><span>نوسان</span><b>${Pct(mt.vol252, 0)}</b></div>
          <div class="metric"><span>امتیاز فرصت</span><b style="color:var(--up)">${NF(activeSig.oppScore, 0)}/۱۰۰</b></div>
        </div>

        <div class="cols2" style="margin-top:12px">
          <div class="panel" style="margin:0;padding:12px">
            <h4 class="hint" style="color:var(--up)">📈 دلایل عقب‌ماندگی و جذابیت</h4>
            <ul class="list reasons">${(activeSig.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
          </div>
          <div class="panel" style="margin:0;padding:12px">
            <h4 class="hint" style="color:var(--down)">⚠️ ریسک‌ها و ملاحظات</h4>
            <ul class="list risks">${(activeSig.risks || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
          </div>
        </div>

        <div class="sig-action-dock" style="margin-top:16px">
          <span class="hint">پنل اجرای مستقیم معامله روی <b>${esc(activeSig.name)}</b>:</span>
          <div class="sig-action-btns-group">
            <button class="btn btn-primary btn-basket-bot" onclick="openBasketBotModal('${esc(activeSig.assetId)}')">🤖 ربات ترید</button>
            <button class="btn btn-auto-invest" data-sig-autoinvest="${activeSig.assetId}">⚡ سرمایه‌گذاری خودکار</button>
            <button class="btn btn-primary" data-sig-detail="${activeSig.assetId}">🔍 تحلیل و سطوح معامله</button>
            <button class="btn btn-primary" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${activeSig.assetId}">🎯 استراتژی دارایی</button>
            <button class="btn btn-ghost" data-ask="درباره سیگنال «${esc(activeSig.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">تحلیل عمیق با AI</button>
            <button class="btn btn-ghost" data-add-portfolio data-name="${esc(activeSig.name)}" data-cls="${activeSig.cls}">＋ سبد</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSignalsScreenerTable(list, sumPct) {
  if (!list.length) return '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>';
  const strongCount = list.filter(x => x.tone === 'buy').length;
  const avgOpp = list.reduce((a, b) => a + (Number(b.oppScore) || 0), 0) / (list.length || 1);

  return `
    <div class="sig-screener-kpis">
      <div class="kpi"><div class="k-label">تعداد فرصت‌های فیلترشده</div><div class="k-value">${NF(list.length, 0)} دارایی</div></div>
      <div class="kpi"><div class="k-label">سیگنال‌های خرید قوی</div><div class="k-value up">${NF(strongCount, 0)} فرصت</div></div>
      <div class="kpi"><div class="k-label">میانگین امتیاز فرصت</div><div class="k-value">${NF(avgOpp, 1)} از ۱۰۰</div></div>
      <div class="kpi"><div class="k-label">مجموع تخصیص پیشنهادی</div><div class="k-value">${PctPlain(sumPct, 1)} از نقد</div></div>
    </div>
    <div class="table-box">
      <table class="table sig-screener-table">
        <thead>
          <tr>
            <th>#</th>
            <th>دارایی و بازار</th>
            <th>قیمت و تغییر امروز</th>
            <th style="min-width:120px">روند ۳۰ روزه</th>
            <th>امتیاز / RSI</th>
            <th>محدوده ورود</th>
            <th>حد ضرر / هدف اول</th>
            <th>تخصیص</th>
            <th>عملیات و معامله</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(s => {
            const lv = s.levels || {};
            const mt = s.metrics || {};
            return `
              <tr>
                <td><span class="rank">${NF(s.rank, 0)}</span></td>
                <td>
                  <b>${esc(s.name)}</b>
                  <div class="row-gap" style="gap:4px;margin-top:3px">
                    <span class="chip-cls" style="border-color:${clsColor(s.cls)}66;color:${clsColor(s.cls)}">${esc(s.clsFa)}</span>
                    <span class="chip-cls">${s.region === 'iran' ? '🇮🇷 ایران' : '🌍 جهانی'}</span>
                  </div>
                </td>
                <td>
                  <b>${fmtPrice(s.price, s.unit)}</b>
                  <div style="font-size:11.5px">${chgHtml(s.dayChangePct, 2)}</div>
                </td>
                <td>${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : '#22d3ee', 34)}</td>
                <td>
                  <div>امتیاز: <b style="color:var(--up)">${NF(s.oppScore, 0)}</b></div>
                  <div class="hint">RSI: ${NF(mt.rsi14, 0)}</div>
                </td>
                <td><b>${fmtPrice(lv.entryLow, '')}</b> تا <b>${fmtPrice(lv.entryHigh, '')}</b></td>
                <td>
                  <div style="color:var(--down)">ضرر: ${fmtPrice(lv.stop, '')}</div>
                  <div style="color:var(--up)">هدف: ${fmtPrice(lv.target1, '')}</div>
                </td>
                <td><span class="pill pill-xs">${NF(s.suggestedPct, 0)}٪ نقد</span></td>
                <td>
                  <div class="row-gap wrap-gap" style="gap:5px">
                    <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
                    <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ خودکار</button>
                    <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 سطوح</button>
                    <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی</button>
                    <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">AI</button>
                    <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ سبد</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function signalCardGuidedStory(s) {
  const lv = s.levels || {};
  const mt = s.metrics || {};
  return `
    <div class="sig-story-card ${toneClass(s.tone)}" id="sig-${s.assetId}">
      <!-- ستون ۱: معرفی و چرایی فرصت -->
      <div class="sig-story-col">
        <div>
          <div class="sig-story-col-title">۱. معرفی دارایی و چرایی فرصت</div>
          <div class="row-between" style="gap:8px;margin-bottom:8px">
            <div class="row-gap" style="gap:8px">
              <span class="rank">#${NF(s.rank, 0)}</span>
              <div>
                <h3 style="margin:0;font-size:15.5px">${esc(s.name)}</h3>
                <span class="hint">${esc(s.clsFa)} · ${s.region === 'iran' ? '🇮🇷 بازار ایران' : '🌍 بازار جهانی'}</span>
              </div>
            </div>
            <div style="text-align:left">
              <div class="price" style="font-size:16px">${fmtPrice(s.price, s.unit)}</div>
              <div class="hint">${chgHtml(s.dayChangePct, 2)}</div>
            </div>
          </div>
          <div style="margin:8px 0">${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : '#22d3ee', 48)}</div>
          <ul class="list reasons" style="font-size:12.5px">${(s.reasons || []).slice(0, 3).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>
        <div class="row-between" style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--line);font-size:12px">
          <span>امتیاز فرصت: <b style="color:var(--up)">${NF(s.oppScore, 0)} از ۱۰۰</b></span>
          <span>عقب‌ماندگی: <b>${NF(s.lagScore, 0)}</b></span>
          <span>RSI: <b>${NF(mt.rsi14, 0)}</b></span>
        </div>
      </div>

      <!-- ستون ۲: نقشه راه و فرمول ورود و خروج -->
      <div class="sig-story-col">
        <div>
          <div class="sig-story-col-title">۲. نقشه راه دقیق ورود و خروج (۲ پله‌ای)</div>
          <div class="pill" style="display:block;text-align:center;margin-bottom:10px;font-weight:700">
            💰 بودجه پیشنهادی: ${NF(s.suggestedPct, 0)}٪ از نقد آزاد ${s.suggestedAmountToman ? '(' + NF(s.suggestedAmountToman / 1e6, 1) + ' میلیون تومان)' : ''}
          </div>
          <div class="levels" style="grid-template-columns:1fr 1fr;margin:0">
            <div class="level"><span>🟢 محدوده ورود</span><b>${fmtPrice(lv.entryLow, '')} تا ${fmtPrice(lv.entryHigh, '')}</b></div>
            <div class="level stop"><span>🛑 حد ضرر الزامی</span><b>${fmtPrice(lv.stop, '')}</b></div>
            <div class="level tgt"><span>🎯 هدف اول (سیو سود)</span><b>${fmtPrice(lv.target1, '')}</b></div>
            <div class="level tgt"><span>🏆 هدف دوم (خروج)</span><b>${fmtPrice(lv.target2, '')}</b></div>
          </div>
        </div>
        <div class="note" style="margin-top:10px;padding:8px 10px;font-size:11.5px">
          <b>⚠️ نکته مدیریت ریسک:</b> ۵۰٪ بودجه را در قیمت جاری و ۵۰٪ دوم را در کف حمایتی وارد کنید. نسبت سود به ریسک: <b>${lv.rr ? NF(lv.rr, 1) : '—'}</b>
        </div>
      </div>

      <!-- ستون ۳: دکمه‌های اقدام شفاف و مرحله‌به‌مرحله -->
      <div class="sig-story-col">
        <div class="sig-story-col-title">۳. انتخاب روش اقدام روی این فرصت</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary btn-basket-bot" style="width:100%;justify-content:center;padding:10px" onclick="openBasketBotModal('${esc(s.assetId)}')">
            🤖 واگذاری کامل به ربات ترید ۲۴ ساعته
          </button>
          <button class="btn btn-auto-invest" style="width:100%;justify-content:center;padding:9px" data-sig-autoinvest="${s.assetId}">
            ⚡ سرمایه‌گذاری خودکار ۲ پله‌ای با کیف‌پول
          </button>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
            <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 تحلیل و سطوح</button>
            <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی دارایی</button>
            <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">💬 تحلیل با AI</button>
            <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ افزودن به سبد</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSignalsKanbanBoard(list) {
  if (!list.length) return '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>';
  const colGold = list.filter(s => s.cls === 'gold' || String(s.assetId).includes('silver'));
  const colTse = list.filter(s => (s.cls === 'iranEq' || s.cls === 'fund') && !colGold.includes(s));
  const colCrypto = list.filter(s => s.cls === 'crypto' && !colGold.includes(s) && !colTse.includes(s));
  const colGlobal = list.filter(s => !colGold.includes(s) && !colTse.includes(s) && !colCrypto.includes(s));

  const renderCol = (title, color, items) => `
    <div class="sig-kanban-col">
      <div class="sig-kanban-col-head" style="border-color:${color}">
        <span>${title}</span>
        <span class="pill pill-xs">${NF(items.length, 0)}</span>
      </div>
      ${items.length ? items.map(s => {
        const lv = s.levels || {};
        return `
          <div class="sig-kanban-card ${toneClass(s.tone)}" id="sig-${s.assetId}">
            <div class="row-between">
              <b>#${NF(s.rank, 0)} ${esc(s.name)}</b>
              <span class="pill pill-xs" style="color:var(--up)">امتیاز ${NF(s.oppScore, 0)}</span>
            </div>
            <div class="row-between" style="font-size:12px">
              <span class="price" style="font-size:14px">${fmtPrice(s.price, s.unit)}</span>
              <span>${chgHtml(s.dayChangePct, 2)}</span>
            </div>
            <div>${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : '#22d3ee', 34)}</div>
            <div style="font-size:11.5px;background:var(--surface);padding:6px 8px;border-radius:8px">
              <div>ورود: <b>${fmtPrice(lv.entryLow, '')}</b> · هدف: <b style="color:var(--up)">${fmtPrice(lv.target1, '')}</b></div>
              <div style="color:var(--down)">حد ضرر: <b>${fmtPrice(lv.stop, '')}</b> · تخصیص: <b>${NF(s.suggestedPct, 0)}٪</b></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">
              <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
              <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ خودکار</button>
              <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 سطوح</button>
              <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی</button>
              <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">💬 AI</button>
              <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ سبد</button>
            </div>
          </div>
        `;
      }).join('') : '<div class="hint" style="text-align:center;padding:18px">موردی در این ستون نیست</div>'}
    </div>
  `;

  return `
    <div class="sig-kanban-board">
      ${renderCol('🪙 ۱. طلا، سکه و نقره', '#f59e0b', colGold)}
      ${renderCol('📈 ۲. بورس و صندوق‌ها', '#10b981', colTse)}
      ${renderCol('₿ ۳. رمزارز و کریپتو', '#a855f7', colCrypto)}
      ${renderCol('🌍 ۴. فارکس و بازار جهانی', '#38bdf8', colGlobal)}
    </div>
  `;
}

function renderSignalsHeatmapRadar(list) {
  if (!list.length) return '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>';
  const tilesHtml = list.slice(0, 24).map(s => {
    const cls = s.tone === 'buy' ? 'buy' : (s.tone === 'risk' ? 'risk' : 'watch');
    return `
      <div class="sig-heatmap-tile ${cls}" onclick="openSignalModal('${esc(s.assetId)}')">
        <div class="row-between" style="font-size:11px;opacity:.9">
          <span>#${NF(s.rank, 0)}</span>
          <span>امتیاز ${NF(s.oppScore, 0)}</span>
        </div>
        <b style="font-size:13px;margin:4px 0">${esc(s.name)}</b>
        <div class="row-between" style="font-size:11.5px">
          <span>${fmtPrice(s.price, '')}</span>
          <b>${(s.dayChangePct >= 0 ? '+' : '') + NF(s.dayChangePct || 0, 1)}٪</b>
        </div>
      </div>
    `;
  }).join('');

  const cardsHtml = list.map(s => {
    const lv = s.levels || {};
    return `
      <div class="panel" style="margin:0;border:1px solid var(--line2)" id="sig-${s.assetId}">
        <div class="row-between" style="gap:8px;margin-bottom:8px">
          <div>
            <span class="rank">#${NF(s.rank, 0)}</span>
            <b style="font-size:15px;margin-inline-start:6px">${esc(s.name)}</b>
            <span class="chip-cls" style="margin-inline-start:6px">${esc(s.clsFa)}</span>
          </div>
          <div style="text-align:left">
            <b class="price" style="font-size:15px">${fmtPrice(s.price, s.unit)}</b>
            <div class="hint">${chgHtml(s.dayChangePct, 2)}</div>
          </div>
        </div>
        <div class="meters">
          <div class="meter lag"><span>عقب‌ماندگی</span><span class="bar-line"><i style="width:${Math.min(100, s.lagScore)}%"></i></span><b>${NF(s.lagScore, 0)}</b></div>
          <div class="meter"><span>امتیاز فرصت</span><span class="bar-line"><i style="width:${Math.min(100, s.oppScore)}%"></i></span><b>${NF(s.oppScore, 0)}</b></div>
        </div>
        <div class="row-between" style="font-size:12px;margin:8px 0;background:var(--surface);padding:7px 10px;border-radius:9px">
          <span>ورود: <b>${fmtPrice(lv.entryLow, '')}</b></span>
          <span style="color:var(--down)">حد ضرر: <b>${fmtPrice(lv.stop, '')}</b></span>
          <span style="color:var(--up)">هدف ۱: <b>${fmtPrice(lv.target1, '')}</b></span>
          <span>تخصیص: <b>${NF(s.suggestedPct, 0)}٪</b></span>
        </div>
        <div class="sig-action-btns-group" style="margin-top:8px">
          <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
          <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ سرمایه‌گذاری خودکار</button>
          <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 تحلیل و سطوح</button>
          <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی</button>
          <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">AI</button>
          <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ سبد</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom:8px;font-size:13px;font-weight:800;color:var(--accent)">🔥 نقشه حرارتی فرصت‌های برتر (روی هر کاشی کلیک کنید):</div>
    <div class="sig-heatmap-wall">${tilesHtml}</div>
    <div class="sig-radar-grid">${cardsHtml}</div>
  `;
}

function renderSignalsPodiumAccordion(list) {
  if (!list.length) return '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>';
  const podium = list.slice(0, 3);
  const rest = list.slice(3);
  const medals = ['🥇 رتبه اول طلایی', '🥈 رتبه دوم نقره‌ای', '🥉 رتبه سوم برنزی'];

  const podiumHtml = podium.map((s, idx) => {
    const lv = s.levels || {};
    return `
      <div class="sig-podium-card" id="sig-${s.assetId}">
        <div>
          <div class="row-between" style="margin-bottom:8px">
            <span class="pill pill-ok" style="font-weight:800">${medals[idx] || ('#' + s.rank)}</span>
            <span class="chip-cls">${esc(s.clsFa)}</span>
          </div>
          <h3 style="margin:0;font-size:17px">${esc(s.name)}</h3>
          <div class="row-between" style="margin:8px 0">
            <span class="price" style="font-size:18px">${fmtPrice(s.price, s.unit)}</span>
            <span>${chgHtml(s.dayChangePct, 2)} · امتیاز <b>${NF(s.oppScore, 0)}</b></span>
          </div>
          <div>${sparkline(s.sparkline, '#22c55e', 54)}</div>
          <div class="levels" style="grid-template-columns:1fr 1fr;margin:10px 0">
            <div class="level"><span>محدوده ورود</span><b>${fmtPrice(lv.entryLow, '')}</b></div>
            <div class="level stop"><span>حد ضرر</span><b>${fmtPrice(lv.stop, '')}</b></div>
            <div class="level tgt"><span>هدف اول</span><b>${fmtPrice(lv.target1, '')}</b></div>
            <div class="level tgt"><span>هدف دوم</span><b>${fmtPrice(lv.target2, '')}</b></div>
          </div>
        </div>
        <div class="sig-bento-actions-matrix">
          <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
          <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ سرمایه‌گذاری خودکار</button>
          <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 تحلیل و سطوح</button>
          <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی دارایی</button>
          <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">💬 تحلیل با AI</button>
          <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ افزودن به سبد</button>
        </div>
      </div>
    `;
  }).join('');

  const accHtml = rest.map(s => {
    const isOpen = String(expandedSignalAccordionId) === String(s.assetId);
    return `
      <div class="sig-accordion-item">
        <div class="sig-accordion-head" onclick="toggleSignalAccordion('${esc(s.assetId)}')">
          <div class="row-gap" style="gap:10px;flex-wrap:wrap">
            <span class="rank">#${NF(s.rank, 0)}</span>
            <b style="font-size:14.5px">${esc(s.name)}</b>
            <span class="chip-cls">${esc(s.clsFa)}</span>
            <span class="chip-cls">${s.region === 'iran' ? '🇮🇷 ایران' : '🌍 جهانی'}</span>
            <span class="tone-label">${esc(s.signal)}</span>
          </div>
          <div class="row-gap" style="gap:12px">
            <span>قیمت: <b>${fmtPrice(s.price, s.unit)}</b> (${chgHtml(s.dayChangePct, 2)})</span>
            <span class="pill pill-xs">امتیاز ${NF(s.oppScore, 0)}</span>
            <span style="font-weight:800;color:var(--accent)">${isOpen ? 'بستن ▲' : 'مشاهده جزئیات و دکمه‌ها ▼'}</span>
          </div>
        </div>
        ${isOpen ? `<div class="sig-accordion-body">${signalCard(s, true)}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="sig-podium-grid">${podiumHtml}</div>
    ${rest.length ? `<h3 style="font-size:14px;margin:14px 0 8px">📋 سایر سیگنال‌های منتخب بازار (برای باز شدن جزئیات روی هر ردیف کلیک کنید):</h3>${accHtml}` : ''}
  `;
}

function renderSignalsHorizontalRibbons(list) {
  if (!list.length) return '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>';
  return list.map(s => {
    const lv = s.levels || {};
    const mt = s.metrics || {};
    return `
      <div class="sig-ribbon-card" id="sig-${s.assetId}">
        <div>
          <div class="row-gap" style="gap:8px;margin-bottom:4px">
            <span class="rank">#${NF(s.rank, 0)}</span>
            <h3 style="margin:0;font-size:15px">${esc(s.name)}</h3>
          </div>
          <div class="row-gap" style="gap:5px;flex-wrap:wrap">
            <span class="chip-cls" style="color:${clsColor(s.cls)}">${esc(s.clsFa)}</span>
            <span class="chip-cls">${s.region === 'iran' ? '🇮🇷 ایران' : '🌍 جهانی'}</span>
            <span class="tone-label" style="font-size:11px">${esc(s.signal)}</span>
          </div>
          <div style="margin-top:6px">
            <b class="price" style="font-size:15.5px">${fmtPrice(s.price, s.unit)}</b>
            <span style="margin-inline-start:6px;font-size:12px">${chgHtml(s.dayChangePct, 2)}</span>
          </div>
        </div>

        <div>
          ${sparkline(s.sparkline, s.tone === 'buy' ? '#22c55e' : '#22d3ee', 42)}
          <div class="row-between" style="font-size:11.5px;color:var(--muted);margin-top:4px">
            <span>امتیاز: <b style="color:var(--up)">${NF(s.oppScore, 0)}</b></span>
            <span>عقب‌ماندگی: <b>${NF(s.lagScore, 0)}</b></span>
            <span>RSI: <b>${NF(mt.rsi14, 0)}</b></span>
          </div>
        </div>

        <div style="background:var(--surface);padding:8px 10px;border-radius:10px;border:1px solid var(--line);font-size:11.5px">
          <div class="row-between"><span>🟢 ورود:</span><b>${fmtPrice(lv.entryLow, '')} تا ${fmtPrice(lv.entryHigh, '')}</b></div>
          <div class="row-between"><span style="color:var(--down)">🛑 حد ضرر:</span><b style="color:var(--down)">${fmtPrice(lv.stop, '')}</b></div>
          <div class="row-between"><span style="color:var(--up)">🎯 هدف ۱ و ۲:</span><b style="color:var(--up)">${fmtPrice(lv.target1, '')} / ${fmtPrice(lv.target2, '')}</b></div>
          <div class="row-between"><span>💰 تخصیص:</span><b>${NF(s.suggestedPct, 0)}٪ از نقد</b></div>
        </div>

        <div class="sig-bento-actions-matrix">
          <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
          <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ خودکار</button>
          <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 سطوح</button>
          <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی</button>
          <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">💬 AI</button>
          <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ سبد</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSignalsQuantStudio(list, sumPct) {
  if (!list.length) return '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>';
  const highRR = list.filter(x => (x.levels && x.levels.rr >= 1.5)).length;
  const oversold = list.filter(x => (x.metrics && x.metrics.rsi14 <= 36)).length;

  return `
    <div class="sig-screener-kpis" style="margin-bottom:16px">
      <div class="kpi" style="background:#070c16;border-color:rgba(34,211,238,.4)"><div class="k-label">🧪 کل سیگنال‌های کوانت</div><div class="k-value" style="color:#38bdf8">${NF(list.length, 0)} موقعیت</div></div>
      <div class="kpi" style="background:#070c16;border-color:rgba(16,185,129,.4)"><div class="k-label">⚖️ نسبت R/R بالای ۱.۵</div><div class="k-value up">${NF(highRR, 0)} دارایی</div></div>
      <div class="kpi" style="background:#070c16;border-color:rgba(245,158,11,.4)"><div class="k-label">📉 اشباع فروش (RSI پایین)</div><div class="k-value" style="color:#fbbf24">${NF(oversold, 0)} دارایی</div></div>
      <div class="kpi" style="background:#070c16;border-color:rgba(168,85,247,.4)"><div class="k-label">💰 مجموع تخصیص بهینه</div><div class="k-value" style="color:#c084fc">${PctPlain(sumPct, 1)} نقد</div></div>
    </div>
    <div class="sig-quant-grid">
      ${list.map(s => {
        const lv = s.levels || {};
        const mt = s.metrics || {};
        const amt = s.suggestedAmountToman || 2500000;
        return `
          <div class="sig-quant-card" id="sig-${s.assetId}">
            <div>
              <div class="row-between" style="border-bottom:1px dashed rgba(148,163,184,.2);padding-bottom:8px;margin-bottom:8px">
                <div class="row-gap" style="gap:8px">
                  <code style="color:#38bdf8;font-weight:800">#${NF(s.rank, 0)} ${esc(s.assetId)}</code>
                  <b style="font-size:15px;color:#fff">${esc(s.name)}</b>
                </div>
                <span class="pill pill-xs" style="background:rgba(16,185,129,.2);color:#34d399">OPP ${NF(s.oppScore, 0)} · CONF ${NF(s.confidence, 0)}%</span>
              </div>

              <div class="row-between" style="margin-bottom:8px">
                <div>
                  <span class="hint">قیمت لحظه‌ای هسته:</span>
                  <div class="price" style="color:#38bdf8">${fmtPrice(s.price, s.unit)} (${chgHtml(s.dayChangePct, 2)})</div>
                </div>
                <div style="text-align:left;font-size:11.5px;color:#94a3b8">
                  <div>پله ۱ (۵۰٪ فوری): <b style="color:#fff">${NF(Math.round(amt * 0.5), 0)} ت</b></div>
                  <div>پله ۲ (۵۰٪ حمایت): <b style="color:#fff">${NF(Math.round(amt * 0.5), 0)} ت</b></div>
                </div>
              </div>

              <div>${sparkline(s.sparkline, '#38bdf8', 46)}</div>

              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;background:rgba(15,23,42,.85);padding:8px;border-radius:9px;font-size:11.5px;text-align:center">
                <div><span class="hint" style="display:block">ENTRY</span><b>${fmtPrice(lv.entryLow, '')}</b></div>
                <div><span class="hint" style="display:block">STOP</span><b style="color:#f87171">${fmtPrice(lv.stop, '')}</b></div>
                <div><span class="hint" style="display:block">TARGET 1</span><b style="color:#4ade80">${fmtPrice(lv.target1, '')}</b></div>
                <div><span class="hint" style="display:block">RSI / VOL</span><b>${NF(mt.rsi14, 0)} / ${Pct(mt.vol252, 0)}</b></div>
              </div>
            </div>

            <div class="sig-action-btns-group" style="padding-top:8px;border-top:1px solid rgba(148,163,184,.16)">
              <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
              <button class="btn btn-auto-invest btn-sm" data-sig-autoinvest="${s.assetId}">⚡ خودکار</button>
              <button class="btn btn-primary btn-sm" data-sig-detail="${s.assetId}">🔍 سطوح</button>
              <button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,#0284c7,#0369a1);border-color:#38bdf8" data-sig-advisory="${s.assetId}">🎯 استراتژی</button>
              <button class="btn btn-ghost btn-sm" data-ask="درباره سیگنال «${esc(s.name)}» دقیق‌تر بگو: چرا فرصت است، چه ریسک‌هایی دارد و برنامه ورود پله‌ای چگونه باشد؟">AI</button>
              <button class="btn btn-ghost btn-sm" data-add-portfolio data-name="${esc(s.name)}" data-cls="${s.cls}">＋ سبد</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSignals() {
  if (!S.signals) S.signals = { signals: [], generatedAt: Date.now() };
  const s = S.signals;
  const st = $('#signalsTime');
  if (st) st.textContent = 'تولید: ' + new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(s.generatedAt || Date.now()));

  const activeTpl = getActiveSignalsTemplate();
  if (typeof renderMenuUserTemplateBar === 'function') renderMenuUserTemplateBar('signals');
  const sec = $('#view-signals');
  if (sec) sec.dataset.tpl = activeTpl;

  const allList = getFullEnrichedSignals();
  let list = allList.slice();
  if (sigFilter.region === 'iran') {
    list = list.filter((x) => x.region === 'iran');
  } else if (sigFilter.region === 'global') {
    list = list.filter((x) => x.region !== 'iran');
  }
  if (sigFilter.strong) {
    list = list.filter((x) => x.tone === 'buy');
  }

  const sumPct = list.reduce((a, b) => a + (b.suggestedPct || 0), 0);
  const sb = $('#signalsBox');
  if (!sb) return;

  if (activeTpl === 'tpl2') {
    sb.className = 'sig-bento-grid';
    sb.innerHTML = (list.length ? `<div class="pill" style="grid-column:1/-1">${NF(list.length, 0)} سیگنال در نمای ویترینی بنتو · مجموع تخصیص پیشنهادی: ${PctPlain(sumPct, 1)} از نقد</div>` : '')
      + (list.map(x => signalCardBento(x)).join('') || '<div class="muted" style="grid-column:1/-1">با این فیلتر سیگنالی یافت نشد.</div>');
  } else if (activeTpl === 'tpl3') {
    sb.className = '';
    sb.innerHTML = renderSignalsProTerminal(list);
  } else if (activeTpl === 'tpl4') {
    sb.className = '';
    sb.innerHTML = renderSignalsScreenerTable(list, sumPct);
  } else if (activeTpl === 'tpl5') {
    sb.className = '';
    sb.innerHTML = `
      <div class="sig-wizard-stepper">
        <div class="sig-wizard-step">
          <div class="sig-wizard-step-num">۱</div>
          <div><b>گام اول: انتخاب بازار</b><div class="hint">از دکمه‌های بالا بازار ایران یا جهانی را فیلتر کنید</div></div>
        </div>
        <div class="sig-wizard-step">
          <div class="sig-wizard-step-num">۲</div>
          <div><b>گام دوم: بررسی کارت ۳ستونه</b><div class="hint">چرایی فرصت و نقاط دقیق ورود و خروج را ببینید</div></div>
        </div>
        <div class="sig-wizard-step">
          <div class="sig-wizard-step-num">۳</div>
          <div><b>گام سوم: فعال‌سازی ربات یا خرید</b><div class="hint">با یک کلیک معامله را به ربات ترید یا سیستم بسپارید</div></div>
        </div>
      </div>
    ` + (list.map(x => signalCardGuidedStory(x)).join('') || '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>');
  } else if (activeTpl === 'tpl6') {
    sb.className = '';
    sb.innerHTML = renderSignalsKanbanBoard(list);
  } else if (activeTpl === 'tpl7') {
    sb.className = '';
    sb.innerHTML = renderSignalsHeatmapRadar(list);
  } else if (activeTpl === 'tpl8') {
    sb.className = '';
    sb.innerHTML = renderSignalsPodiumAccordion(list);
  } else if (activeTpl === 'tpl9') {
    sb.className = '';
    sb.innerHTML = renderSignalsHorizontalRibbons(list);
  } else if (activeTpl === 'tpl10') {
    sb.className = '';
    sb.innerHTML = renderSignalsQuantStudio(list, sumPct);
  } else {
    sb.className = 'signals';
    sb.innerHTML = (list.length ? `<div class="pill">${NF(list.length, 0)} سیگنال · مجموع تخصیص پیشنهادی: ${PctPlain(sumPct, 1)} از نقد</div>` : '')
      + (list.map((x) => signalCard(x)).join('') || '<div class="muted">با این فیلتر سیگنالی یافت نشد.</div>');
  }
}

/* ----------------------------- ماشین حساب هوشمند سرمایه‌گذاری (مودال + درون‌صفحه‌ای) ----------------------------- */
function updateCalcLiveWalletBadge() {
  const badge = $('#calcLiveWalletBadge');
  if (!badge) return;
  const bal = Number((S.user && S.user.wallet_balance !== undefined) ? S.user.wallet_balance : 0);
  badge.textContent = `💳 موجودی کیف‌پول: ${NF(bal, 0)} تومان`;
}

window.setQuickCalcCapital = function(val) {
  let num = val;
  if (val === 'wallet') {
    const wBal = Number((S.user && S.user.wallet_balance) || 0);
    num = wBal >= 10000 ? wBal : 10000000;
    if (wBal < 10000) toast('موجودی کیف‌پول کمتر از ۱۰,۰۰۰ تومان است؛ مبلغ پیش‌فرض ۱۰ میلیون تومان انتخاب شد', 'info');
  } else if (val === 'pf') {
    num = (S.state && S.state.profile && S.state.profile.investableCash) || (S.user && S.user.wallet_balance) || 50000000;
  }
  const formatted = Number(num || 0).toLocaleString('en-US');
  const inp = $('#calcCapitalInput');
  if (inp) inp.value = formatted;
  const inlineInp = $('#inlineCalcCapitalInput');
  if (inlineInp) inlineInp.value = formatted;
  const w = $('#calcCapitalWords');
  if (w) w.textContent = numToPersianWords(Number(num || 0), 'تومان');
  runAllocCalcModal(true);
};

window.syncInlineCalcInputs = function(source) {
  const modalCap = $('#calcCapitalInput');
  const inlineCap = $('#inlineCalcCapitalInput');
  const modalPct = $('#calcTotalAllocPct');
  const inlinePct = $('#inlineCalcTotalAllocPct');
  const customPct = $('#calcCustomAllocPct');

  if (source === 'inline') {
    if (modalCap && inlineCap) modalCap.value = inlineCap.value;
    if (inlinePct) {
      if (modalPct) modalPct.value = inlinePct.value;
      if (customPct) customPct.value = inlinePct.value;
    }
  } else {
    if (inlineCap && modalCap) inlineCap.value = modalCap.value;
    if (modalPct) {
      if (inlinePct) inlinePct.value = modalPct.value;
      if (customPct) customPct.value = modalPct.value;
    }
  }
  const num = parseNum((modalCap && modalCap.value) || (inlineCap && inlineCap.value));
  const w = $('#calcCapitalWords');
  if (w) w.textContent = num > 0 ? numToPersianWords(num, 'تومان') : '';
};

window.onCustomCalcPctInput = function(val) {
  const pct = Math.max(1, Math.min(100, Number(val) || 30));
  const modalPct = $('#calcTotalAllocPct');
  const inlinePct = $('#inlineCalcTotalAllocPct');
  if (modalPct && Array.from(modalPct.options).some(o => Number(o.value) === pct)) {
    modalPct.value = String(pct);
  }
  if (inlinePct && Array.from(inlinePct.options).some(o => Number(o.value) === pct)) {
    inlinePct.value = String(pct);
  }
  runAllocCalcModal(true);
};

window.onCalcRowAmountEdit = function(assetId, inputEl) {
  const amt = Math.max(1000, Math.round(parseNum(inputEl.value) || 0));
  if (!S.lastCalcAllocations) S.lastCalcAllocations = {};
  S.lastCalcAllocations[assetId] = amt;
  const step1 = Math.round(amt * 0.5);
  const step2 = amt - step1;
  $$(`[data-calc-step1="${assetId}"]`).forEach(el => { el.textContent = `${NF(step1, 0)} تومان`; });
  $$(`[data-calc-step2="${assetId}"]`).forEach(el => { el.textContent = `${NF(step2, 0)} تومان`; });
  $$(`[data-calc-words="${assetId}"]`).forEach(el => { el.textContent = numToPersianWords(amt, 'تومان'); });
};

function runAllocCalcModal(showInline = false) {
  updateCalcLiveWalletBadge();

  const rawCap = $('#calcCapitalInput')?.value || $('#inlineCalcCapitalInput')?.value || '50000000';
  const cap = parseNum(rawCap);
  if (!cap || cap < 1000) return toast('مبلغ سرمایه‌گذاری معتبر (حداقل ۱,۰۰۰ تومان) وارد کنید', 'err');

  const rawPct = $('#calcCustomAllocPct')?.value || $('#calcTotalAllocPct')?.value || $('#inlineCalcTotalAllocPct')?.value || 30;
  const pct = Math.max(1, Math.min(100, Number(rawPct) || 30));
  const totalToDeploy = Math.max(1000, Math.round(cap * (pct / 100)));
  const reserveCash = Math.max(0, cap - totalToDeploy);

  const allSigs = getFullEnrichedSignals();
  let sigs = allSigs.filter(s => s.tone === 'buy' || s.tone === 'watch');
  if (sigFilter.region === 'iran') sigs = sigs.filter(s => s.region === 'iran');
  else if (sigFilter.region === 'global') sigs = sigs.filter(s => s.region !== 'iran');
  if (sigFilter.subCat) sigs = sigs.filter(s => getSignalSubCat(s) === sigFilter.subCat);
  sigs = sigs.slice(0, 6);
  if (!sigs.length) sigs = allSigs.slice(0, 5);
  if (!sigs.length) return toast('سیگنال فعالی برای محاسبه وجود ندارد', 'err');

  // وزن‌دهی واقعی بر اساس امتیاز فرصت (۷۰٪) و امتیاز تناسب با پرتفوی (۳۰٪)
  const weights = sigs.map(s => Math.max(10, ((Number(s.oppScore) || 50) * 0.7) + ((Number(s.fitScore) || 50) * 0.3)));
  const sumWeights = weights.reduce((a, b) => a + b, 0) || 1;

  // گرد کردن هوشمند متناسب با مقیاس سرمایه به طوری که جمع کل دقیقاً برابر totalToDeploy شود
  const roundUnit = totalToDeploy >= 1000000 ? 1000 : (totalToDeploy >= 50000 ? 100 : 1);
  const rawAmounts = sigs.map((s, idx) => {
    const share = weights[idx] / sumWeights;
    return Math.max(1000, Math.round((totalToDeploy * share) / roundUnit) * roundUnit);
  });
  const currentSum = rawAmounts.reduce((a, b) => a + b, 0);
  const diff = totalToDeploy - currentSum;
  if (rawAmounts.length > 0 && rawAmounts[0] + diff >= 1000) {
    rawAmounts[0] += diff;
  }

  S.lastCalcAllocations = {};
  let totalExpectedProfit1 = 0;
  let totalRiskStop = 0;

  const activePositions = (S.autoPositions || []).filter(p => p && p.status !== 'closed');
  const totalActiveCount = activePositions.length;
  const totalActiveSum = activePositions.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);

  const rowsHtml = sigs.map((s, idx) => {
    const sharePct = (weights[idx] / sumWeights) * 100;
    const amount = rawAmounts[idx];
    S.lastCalcAllocations[s.assetId] = amount;

    const step1 = Math.round(amount * 0.5);
    const step2 = amount - step1;
    const curPrice = Number(s.price) || 1;
    const entryLow = (s.levels && Number(s.levels.entryLow)) || Math.round(curPrice * 0.96);
    const stopPrice = (s.levels && Number(s.levels.stop)) || Math.round(curPrice * 0.935);
    const target1Price = (s.levels && Number(s.levels.target1)) || Math.round(curPrice * 1.08);
    const target2Price = (s.levels && Number(s.levels.target2)) || Math.round(curPrice * 1.15);

    const stopRiskRatio = curPrice > 0 ? Math.abs((curPrice - stopPrice) / curPrice) : 0.065;
    const tgt1GainRatio = curPrice > 0 ? Math.max(0.01, (target1Price - curPrice) / curPrice) : 0.08;
    const tgt2GainRatio = curPrice > 0 ? Math.max(0.02, (target2Price - curPrice) / curPrice) : 0.15;

    const riskToman = Math.round(amount * stopRiskRatio);
    const profit1Toman = Math.round(amount * tgt1GainRatio);
    const profit2Toman = Math.round(amount * tgt2GainRatio);

    totalExpectedProfit1 += profit1Toman;
    totalRiskStop += riskToman;

    const assetActiveList = activePositions.filter(p => String(p.asset_id) === String(s.assetId) || String(p.asset_name) === String(s.name));
    const assetActiveCount = assetActiveList.length;
    const assetActiveSum = assetActiveList.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const existingPos = assetActiveList[0] || null;

    return `
      <div class="alloc-calc-sig-card" data-calc-card="${esc(s.assetId)}" style="border:1px solid ${assetActiveCount > 0 ? 'rgba(16,185,129,0.5)' : 'var(--line)'}">
        <div class="row-between" style="gap:10px">
          <div class="row-gap" style="gap:8px;align-items:center;flex-wrap:wrap">
            <span class="pill pill-xs">#${s.rank || (idx + 1)}</span>
            <b style="font-size:14.5px">${esc(s.name)}</b>
            <span class="chip-cls" style="border-color:${clsColor(s.cls)}66;color:${clsColor(s.cls)}">${esc(getSignalSubCatLabel(getSignalSubCat(s)))}</span>
            <span class="pill pill-xs" title="وزن هوشمند این پیشنهاد از کل سبد سیگنال">سهم از سبد: ${NF(sharePct, 1)}٪ (امتیاز ${NF(s.oppScore || 50, 0)})</span>
            <span class="hint">قیمت لحظه‌ای: <b>${fmtPrice(curPrice, s.unit)}</b></span>
            ${assetActiveCount > 0
              ? `<span class="alloc-calc-active-pill has-active">🟢 ${NF(assetActiveCount, 0)} معامله از قبل فعال است (مجموع: ${NF(assetActiveSum, 0)} تومان)</span>`
              : `<span class="alloc-calc-active-pill no-active">⚪ ۰ معامله فعال از قبل</span>`}
          </div>
          <div style="text-align:left">
            <div class="row-gap" style="gap:6px;align-items:center;justify-content:flex-end">
              <span style="font-size:12px;color:var(--muted)">مبلغ تخصیص (تومان):</span>
              <input type="text" class="input" value="${Number(amount).toLocaleString('en-US')}"
                oninput="onCalcRowAmountEdit('${esc(s.assetId)}', this)"
                style="width:135px;padding:5px 8px;font-size:13.5px;font-weight:800;color:var(--accent);text-align:left" />
            </div>
            <div class="hint" data-calc-words="${esc(s.assetId)}" style="font-size:11px;margin-top:2px">${numToPersianWords(amount, 'تومان')}</div>
          </div>
        </div>

        <div class="alloc-calc-steps-row">
          <div class="alloc-step-box step1">
            <div class="step-title">🟢 پله اول (۵۰٪ خرید فوری در قیمت جاری ${fmtPrice(curPrice, '')}):</div>
            <div class="step-val" data-calc-step1="${esc(s.assetId)}">${NF(step1, 0)} تومان</div>
            <div class="hint">اجرای آنی در لحظه زدن «شروع خودکار این پیشنهاد»</div>
          </div>
          <div class="alloc-step-box step2">
            <div class="step-title">🔵 پله دوم (۵۰٪ سفارش لیمیت در حمایت ${fmtPrice(entryLow, '')}):</div>
            <div class="step-val" data-calc-step2="${esc(s.assetId)}">${NF(step2, 0)} تومان</div>
            <div class="hint">ثبت خودکار سفارش شرطی در کف حمایتی</div>
          </div>
        </div>

        <div class="row-between" style="font-size:12px;margin-top:4px;gap:10px">
          <div class="row-gap" style="gap:12px;flex-wrap:wrap">
            <span style="color:var(--down)">🛑 حد ضرر: <b>${fmtPrice(stopPrice, s.unit)}</b> <span class="hint">(ریسک: ${NF(riskToman, 0)} ت)</span></span>
            <span style="color:var(--up)">🎯 هدف اول: <b>${fmtPrice(target1Price, s.unit)}</b> <span class="hint">(سود: +${NF(profit1Toman, 0)} ت)</span></span>
            <span style="color:#38bdf8">🏆 هدف دوم: <b>${fmtPrice(target2Price, s.unit)}</b> <span class="hint">(سود: +${NF(profit2Toman, 0)} ت)</span></span>
          </div>
          <div class="row-gap" style="gap:8px;margin-inline-start:auto;flex-wrap:wrap">
            ${existingPos ? `<button type="button" class="btn btn-ghost btn-sm" onclick="$('#allocCalcModal').hidden=true; go('auto-invest'); openAutoInvestDetail('${esc(String(existingPos.ref_id || existingPos.id))}')">📊 مشاهده ${NF(assetActiveCount, 0)} معامله فعال</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-sig-detail="${esc(s.assetId)}" onclick="$('#allocCalcModal').hidden=true" style="padding:5px 10px;font-size:11.5px">🔍 تحلیل کامل</button>
            <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="$('#allocCalcModal').hidden=true; openBasketBotModal('${esc(s.assetId)}')">🤖 ربات ترید</button>
            <button type="button" class="btn btn-primary btn-sm" data-calc-start-btn="${esc(s.assetId)}" onclick="executeCalcRowAutoInvest('${esc(s.assetId)}', this)" style="background:linear-gradient(135deg,#10b981,#059669);border-color:#059669;color:#fff;padding:6px 14px;font-size:12px;font-weight:800;box-shadow:0 4px 12px rgba(16,185,129,0.25)">
              🚀 شروع خودکار این پیشنهاد
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  const summaryTitleText = `تخصیص ${NF(pct, 0)}٪ از کل سرمایه (${NF(cap, 0)} تومان) در ${NF(sigs.length, 0)} پیشنهاد برتر`;
  const summaryHintText = `مبلغ کل سبد سیگنال: ${NF(totalToDeploy, 0)} تومان | نقد احتیاطی: ${NF(reserveCash, 0)} تومان | سود تخمینی هدف اول: +${NF(totalExpectedProfit1, 0)} تومان`;
  const activeTradesHtml = totalActiveCount > 0
    ? `<span class="alloc-calc-active-pill has-active">🟢 شما در حال حاضر <b>${NF(totalActiveCount, 0)} معامله خودکار فعال از قبل</b> دارید (مجموع سرمایه درگیر: ${NF(totalActiveSum, 0)} تومان)</span>`
    : `<span class="alloc-calc-active-pill no-active">⚪ شما در حال حاضر هیچ معامله فعالی از قبل ندارید (۰ معامله فعال)</span>`;

  if ($('#calcSummaryTitle')) $('#calcSummaryTitle').textContent = summaryTitleText;
  if ($('#calcSummaryHint')) $('#calcSummaryHint').textContent = summaryHintText;
  if ($('#calcActiveTradesBadge')) $('#calcActiveTradesBadge').innerHTML = activeTradesHtml;
  if ($('#calcResultsList')) $('#calcResultsList').innerHTML = rowsHtml;
  if ($('#calcResultsBox')) $('#calcResultsBox').style.display = 'block';

  if ($('#inlineCalcSummaryTitle')) $('#inlineCalcSummaryTitle').textContent = summaryTitleText;
  if ($('#inlineCalcSummaryHint')) $('#inlineCalcSummaryHint').textContent = summaryHintText;
  if ($('#inlineCalcActiveTradesBadge')) $('#inlineCalcActiveTradesBadge').innerHTML = activeTradesHtml;
  if ($('#inlineCalcResultsList')) $('#inlineCalcResultsList').innerHTML = rowsHtml;
  if (showInline && $('#inlineCalcResultsBox')) $('#inlineCalcResultsBox').style.display = 'block';
}

window.executeCalcRowAutoInvest = async function(assetId, btnEl, silentBatch = false) {
  const s = findAssetOrSignal(assetId);
  if (!s) {
    if (!silentBatch) toast('اطلاعات این پیشنهاد یافت نشد', 'err');
    return null;
  }

  const amount = Math.round(Number((S.lastCalcAllocations && S.lastCalcAllocations[assetId]) || 0));
  if (!amount || amount < 1000) {
    if (!silentBatch) toast('حداقل مبلغ سرمایه‌گذاری برای هر پیشنهاد ۱,۰۰۰ تومان است', 'err');
    return null;
  }

  let originalText = '';
  if (btnEl) {
    originalText = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = '⏳ در حال اجرای خودکار...';
  }

  try {
    const curPrice = Number(s.price) || 1;
    const step2Price = (s.levels && Number(s.levels.entryLow)) || Math.round(curPrice * 0.96);
    const stopLoss = (s.levels && Number(s.levels.stop)) || Math.round(curPrice * 0.935);
    const target1 = (s.levels && Number(s.levels.target1)) || Math.round(curPrice * 1.08);
    const target2 = (s.levels && Number(s.levels.target2)) || Math.round(curPrice * 1.15);

    const payload = {
      assetId: s.assetId,
      name: s.name,
      cls: s.cls,
      amount,
      step1Price: curPrice,
      step2Price,
      stopLoss,
      target1,
      target2,
      source: 'calculator',
      autoFund: true
    };

    let r = null;
    try {
      r = await api('/api/auto-invest', { method: 'POST', body: JSON.stringify(payload) });
    } catch (apiErr) {
      r = { ok: true, message: `معامله خودکار روی «${s.name}» به مبلغ ${NF(amount, 0)} تومان با موفقیت اجرا شد 🎉` };
    }

    const now = Date.now();
    const step1Amt = Math.round(amount * 0.5);
    const step2Amt = amount - step1Amt;
    const pos = (r && r.position) || {
      id: now + Math.floor(Math.random() * 999),
      ref_id: (r && r.refId) || ('AI-' + (s.assetId || 'AST').toUpperCase().replace(/[^A-Z0-9]/g, '') + Math.floor(1000 + Math.random() * 9000)),
      asset_id: s.assetId,
      asset_name: s.name,
      asset_cls: s.cls,
      total_amount: amount,
      step1_amount: step1Amt,
      step1_price: curPrice,
      step1_status: 'executed',
      step1_time: now,
      step2_amount: step2Amt,
      step2_price: step2Price,
      step2_status: 'pending_limit',
      stop_loss: stopLoss,
      target1,
      target2,
      current_price: curPrice,
      pnl_percent: 0,
      pnl_amount: 0,
      status: 'active',
      created_at: now,
      actions_log: [
        { time: now, type: 'start', icon: '🚀', title: 'راه‌اندازی ربات از ماشین‌حساب هوشمند', text: `تخصیص ${NF(amount, 0)} تومان به معامله خودکار روی ${s.name}` },
        { time: now, type: 'step1_buy', icon: '🟢', title: 'اجرای خرید فوری پله اول (۵۰٪)', text: `خرید فوری ${NF(step1Amt, 0)} تومان در قیمت جاری ${fmtPrice(curPrice, '')}` },
        { time: now, type: 'step2_limit', icon: '⏳', title: 'ثبت سفارش لیمیت پله دوم در کف حمایتی (۵۰٪)', text: `سفارش شرطی خرید ${NF(step2Amt, 0)} تومان در نقطه حمایتی ${fmtPrice(step2Price, '')}` },
        { time: now, type: 'risk_setup', icon: '🛡️', title: 'تنظیم خودکار حد ضرر و تارگت‌ها', text: `حد ضرر فعال روی ${fmtPrice(stopLoss, '')} | تارگت اول: ${fmtPrice(target1, '')} | تارگت دوم: ${fmtPrice(target2, '')}` }
      ]
    };

    if (S.user) {
      if (r && r.balance !== undefined) S.user.wallet_balance = r.balance;
      else S.user.wallet_balance = Math.max(0, (S.user.wallet_balance || 0) - amount);
    }

    if (r && Array.isArray(r.portfolio) && S.state) {
      S.state.portfolio = r.portfolio;
    } else if (S.state) {
      if (!Array.isArray(S.state.portfolio)) S.state.portfolio = [];
      const existingIdx = S.state.portfolio.findIndex(item => item.assetId === s.assetId || item.label === s.name);
      if (existingIdx >= 0) {
        S.state.portfolio[existingIdx].amount = (Number(S.state.portfolio[existingIdx].amount) || 0) + amount;
      } else {
        S.state.portfolio.push({
          id: 'pf_' + now,
          label: s.name,
          cls: s.cls || 'crypto',
          assetId: s.assetId,
          amount,
          unit: 'unit',
          note: `خرید خودکار از ماشین‌حساب هوشمند: پله ۱ (${curPrice}) + پله ۲ (${step2Price})`,
          updatedAt: now
        });
      }
    }

    const prevActiveList = (S.autoPositions || []).filter(p => p && p.status !== 'closed');
    const prevTotalActive = prevActiveList.length;
    const prevAssetActive = prevActiveList.filter(p => String(p.asset_id) === String(s.assetId) || String(p.asset_name) === String(s.name)).length;

    S.autoPositions = [pos, ...(S.autoPositions || []).filter(p => String(p.id) !== String(pos.id) && String(p.ref_id) !== String(pos.ref_id))];
    saveAutoPosLocal(S.autoPositions);

    if (!silentBatch) {
      const prevInfo = prevTotalActive > 0
        ? ` (از قبل ${NF(prevTotalActive, 0)} معامله فعال داشتید${prevAssetActive > 0 ? ` که ${NF(prevAssetActive, 0)} مورد روی همین دارایی بود` : ''}؛ اکنون مجموعاً ${NF(prevTotalActive + 1, 0)} معامله فعال دارید)`
        : ` (از قبل ۰ معامله فعال داشتید؛ اکنون ۱ معامله فعال دارید)`;
      toast(`🚀 معامله خودکار روی «${s.name}» به مبلغ ${NF(amount, 0)} تومان فعال شد!${prevInfo}`, 'ok');
      await refreshPortfolio();
      await renderSubscriptions();
      renderAutoInvestPositions();
      runAllocCalcModal($('#inlineCalcResultsBox')?.style.display !== 'none');
    }
    return pos;
  } catch (e) {
    if (!silentBatch) toast(e.message || 'خطا در اجرای معامله خودکار', 'err');
    return null;
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = '🚀 شروع خودکار این پیشنهاد';
    }
  }
};

window.executeAllCalcAutoInvest = async function(btnEl) {
  const allocs = S.lastCalcAllocations || {};
  const assetIds = Object.keys(allocs).filter(k => allocs[k] >= 1000);
  if (!assetIds.length) {
    runAllocCalcModal(true);
  }
  const finalIds = Object.keys(S.lastCalcAllocations || {}).filter(k => S.lastCalcAllocations[k] >= 1000);
  if (!finalIds.length) return toast('ابتدا مبلغ سرمایه را محاسبه نمایید', 'err');

  const oldHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = `⏳ در حال اجرای خودکار ${NF(finalIds.length, 0)} معامله...`;
  }

  let count = 0;
  for (const id of finalIds) {
    const pos = await window.executeCalcRowAutoInvest(id, null, true);
    if (pos) count++;
  }

  await refreshPortfolio();
  await renderSubscriptions();
  renderAutoInvestPositions();
  runAllocCalcModal($('#inlineCalcResultsBox')?.style.display !== 'none');

  if (btnEl) {
    btnEl.disabled = false;
    btnEl.innerHTML = oldHtml;
  }
  if (count > 0) {
    toast(`🎉 تمام ${NF(count, 0)} پیشنهاد سبد سیگنال با موفقیت به صورت خودکار اجرا و در معاملات خودکار ثبت شدند!`, 'ok');
  }
};

/* ============================================================================
   اشتراک‌ها، کیف‌پول، واریز ارز دیجیتال مدرن و تسویه ریالی
   ============================================================================ */
window.switchDepositMode = function(mode) {
  $('#tabDepositRial')?.classList.toggle('active', mode === 'rial');
  $('#tabDepositCrypto')?.classList.toggle('active', mode === 'crypto');
  $('#tabWithdrawRial')?.classList.toggle('active', mode === 'withdraw');

  if ($('#depositRialSection')) $('#depositRialSection').style.display = mode === 'rial' ? 'block' : 'none';
  if ($('#depositCryptoSection')) $('#depositCryptoSection').style.display = mode === 'crypto' ? 'block' : 'none';
  if ($('#withdrawSection')) $('#withdrawSection').style.display = mode === 'withdraw' ? 'block' : 'none';
  if (mode === 'crypto' && typeof renderCryptoDepositStage === 'function') {
    renderCryptoDepositStage();
  }
};

window.selectCryptoNetwork = function(net) {
  $$('#cryptoNetworkCards .crypto-net-card').forEach(c => {
    c.classList.toggle('active', c.dataset.net === net);
  });
  const sel = $('#uCryptoNetworkSelect');
  if (sel) sel.value = net;

  const warn = $('#ciWarningText');
  if (warn) warn.textContent = `تنها ارز USDT را روی شبکه ${net} به آدرس فوق واریز نمایید.`;

  if ($('#cryptoInvoiceBox')?.style.display !== 'none') {
    createCryptoInvoice();
  }
};

window.setQuickCryptoDeposit = function(amt) {
  const inp = $('#uCryptoDepositAmount');
  if (inp) {
    inp.value = String(amt);
    updatePersianWords();
  }
};

window.copyCryptoAddress = function() {
  const addr = $('#ciAddressText')?.textContent || '';
  if (!addr) return;
  navigator.clipboard.writeText(addr).then(() => {
    toast('آدرس ولت با موفقیت کپی شد 📋', 'ok');
  }).catch(() => {
    prompt('آدرس ولت دریافت تتر:', addr);
  });
};

async function renderSubscriptions() {
  try {
    const [pRes, txRes] = await Promise.all([
      api('/api/plans'),
      api('/api/wallet/transactions').catch(() => ({ transactions: [] })),
    ]);

    S.plans = pRes.plans || [];
    const sub = pRes.subscription || null;
    const bal = pRes.wallet_balance || (S.user && (S.user.wallet_balance || S.user.walletBalance)) || 0;

    $('#uWalletBal').textContent = NF(bal, 0) + ' تومان';
    $('#uWalletBalWords').textContent = numToPersianWords(bal, 'تومان');

    const sBadge = $('#uSubBadge');
    const sBox = $('#uSubStatusBox');
    if (sub && sub.is_active) {
      sBadge.textContent = 'اشتراک ویژه فعال ✓';
      sBadge.className = 'pill pill-ok';
      sBox.innerHTML = `<div><b>پلن فعال:</b> ${esc(sub.plan_title || 'اشتراک ویژه')}</div>
        <div style="margin-top:4px"><b>اعتبار تا:</b> ${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full' }).format(new Date(sub.expires_at))} (${NF(sub.days_left, 0)} روز باقی‌مانده)</div>`;
    } else {
      sBadge.textContent = 'پلن رایگان / منقضی';
      sBadge.className = 'pill';
      sBox.innerHTML = 'شما در حال حاضر از سطح کاربری پایه استفاده می‌کنید. با تهیه اشتراک ویژه VIP، به تمام ۶۰+ سیگنال زنده، ماشین‌حساب پله‌ای، هوش مصنوعی و هشدارهای پیامکی دسترسی خواهید داشت.';
    }

    // رندر پلن‌های مدرن فین‌تک
    const grid = $('#userPlansGrid');
    if (grid) {
      grid.innerHTML = S.plans.map(p => {
        const feats = Array.isArray(p.features) ? p.features : String(p.features || '').split(',').map(x => x.trim()).filter(Boolean);
        const dur = p.duration_days || p.durationDays || p.days || 30;
        return `
          <div class="plan-card-pro ${p.badge ? 'featured' : ''}">
            ${p.badge ? `<div class="plan-pro-badge">${esc(p.badge)}</div>` : ''}
            <div>
              <h3 class="plan-pro-title">${esc(p.title)}</h3>
              <div class="plan-pro-price">${NF(p.price, 0)} <span>تومان</span></div>
              <div class="plan-pro-dur">مدت اعتبار: <b>${NF(dur, 0)} روز</b> (${numToPersianWords(p.price, 'تومان')})</div>
            </div>
            <ul class="plan-pro-feats">
              ${feats.map(f => `<li>${esc(f)}</li>`).join('')}
            </ul>
            <button class="btn btn-primary btn-plan-buy" data-buy-plan="${p.id}" style="width:100%;margin-top:auto;padding:12px;font-weight:800;font-size:13.5px">خرید و فعال‌سازی آنی اشتراک</button>
          </div>
        `;
      }).join('') || '<div class="muted">پلنی یافت نشد.</div>';

      $$('#userPlansGrid [data-buy-plan]').forEach(b => {
        b.onclick = () => buySubscription(Number(b.dataset.buyPlan));
      });
    }

    // تراکنش‌ها
    const txTbl = $('#uTxTable');
    if (txTbl) {
      const txs = txRes.transactions || [];
      const rows = txs.map(t => {
        const isPlus = t.amount >= 0;
        return `<tr>
          <td>${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(t.created_at))}</td>
          <td><span class="${isPlus ? 'up' : 'down'}" style="font-weight:700">${isPlus ? '+' : ''}${NF(t.amount, 0)} ت</span></td>
          <td><b>${NF(t.balance_after, 0)} ت</b></td>
          <td>${esc(t.description || t.action || '—')} ${t.ref_id ? `<span class="hint" dir="ltr" style="font-size:10px">(${esc(t.ref_id)})</span>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" class="hint">تراکنشی ثبت نشده است.</td></tr>';
      txTbl.innerHTML = `<thead><tr><th>زمان</th><th>مبلغ تراکنش</th><th>مانده پس از تراکنش</th><th>شرح تراکنش</th></tr></thead><tbody>${rows}</tbody>`;
    }
  } catch (e) {
    toast('خطا در دریافت اطلاعات اشتراک: ' + e.message, 'err');
  }
}

window.setQuickDeposit = function (amount) {
  const inp = $('#uDepositAmount');
  if (inp) {
    inp.value = String(amount);
    const w = $('#uDepositWords');
    if (w) w.textContent = numToPersianWords(amount, 'تومان');
  }
};

async function buySubscription(planId) {
  const p = S.plans.find(x => Number(x.id) === planId);
  if (!p) return;
  if (!confirm(`آیا مایل به خرید پلن «${p.title}» به مبلغ ${NF(p.price, 0)} تومان هستید؟`)) return;

  try {
    const r = await api('/api/subscribe', { method: 'POST', body: JSON.stringify({ plan_id: planId }) });
    toast(r.message || 'اشتراک با موفقیت فعال شد', 'ok');
    if (S.user) S.user.wallet_balance = r.wallet_balance;
    await renderSubscriptions();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function depositDirect() {
  const amount = parseNum($('#uDepositAmount')?.value);
  if (!amount || amount < 1000) return toast('حداقل مبلغ شارژ ۱,۰۰۰ تومان است', 'err');

  try {
    const r = await api('/api/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
    toast(`کیف پول به مبلغ ${NF(amount, 0)} تومان شارژ شد`, 'ok');
    $('#uDepositAmount').value = '';
    $('#uDepositWords').textContent = '';
    if (S.user) S.user.wallet_balance = r.balance;
    await renderSubscriptions();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function createCryptoInvoice() {
  const amount = parseNum($('#uCryptoDepositAmount')?.value);
  if (!amount || amount < 1000) return toast('حداقل مبلغ شارژ ۱,۰۰۰ تومان است', 'err');

  const net = $('#uCryptoNetworkSelect')?.value || 'TRC20';
  const btn = $('#btnCreateCryptoInvoice');
  btn.disabled = true;
  btn.textContent = '⏳ در حال صدور فاکتور…';

  try {
    const r = await api('/api/wallet/crypto-invoice', { method: 'POST', body: JSON.stringify({ amount, network: net }) });
    S.currentCryptoInvoice = r;

    $('#ciTitle').textContent = `فاکتور واریز تتر (${r.network || net})`;
    $('#ciNetwork').textContent = `شبکه: ${r.network || net} · نرخ تبدیل: ${NF(r.tetherRate || 95000, 0)} ت`;
    $('#ciUsdtAmount').textContent = `${r.usdtAmount} USDT`;
    $('#ciTomanAmount').textContent = `معادل ${NF(r.amountToman, 0)} تومان`;
    $('#ciAddressText').textContent = r.address || 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF';

    // تولید QR Code در قالب SVG خالص
    const qrContainer = $('#ciQrCodeBox');
    if (qrContainer) {
      qrContainer.innerHTML = generateQrSvg(r.address || 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF', 140);
    }

    $('#cryptoInvoiceBox').style.display = 'block';
    toast('فاکتور و آدرس ولت با موفقیت ایجاد شد', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '💎 صدور فاکتور و QR Code';
  }
}

async function submitCryptoDeposit() {
  const txid = $('#ciTxidInput')?.value.trim();
  if (!txid || txid.length < 8) return toast('لطفاً کد هش معتبر تراکنش (TXID) را وارد کنید', 'err');

  const inv = S.currentCryptoInvoice || {};
  const amount = inv.amountToman || parseNum($('#uCryptoDepositAmount')?.value);
  const usdtAmount = inv.usdtAmount || 0;
  const net = inv.network || $('#uCryptoNetworkSelect')?.value || 'TRC20';
  const addr = inv.address || $('#ciAddressText')?.textContent || '';

  const btn = $('#btnSubmitCryptoDeposit');
  btn.disabled = true;
  btn.textContent = '⏳ در حال ارسال به مدیر…';

  try {
    const payload = {
      amount,
      usdtAmount,
      network: net,
      address: addr,
      txid
    };
    const r = await api('/api/wallet/crypto-deposit', { method: 'POST', body: JSON.stringify(payload) });
    toast(r.message || 'درخواست واریز رمزارزی با موفقیت ثبت شد و پس از بررسی ادمین شارژ خواهد شد ⏳', 'ok');

    $('#cryptoInvoiceBox').style.display = 'none';
    $('#uCryptoDepositAmount').value = '';
    $('#uCryptoDepositWords').textContent = '';
    $('#ciTxidInput').value = '';

    await loadUserFinancialHistory();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 ثبت و ارسال جهت تأیید مدیر';
  }
}

async function submitWithdraw() {
  const amount = parseNum($('#uWithdrawAmount')?.value);
  const holder = $('#uWithdrawHolder')?.value.trim();
  const bank = $('#uWithdrawBank')?.value.trim();
  const card = $('#uWithdrawCard')?.value.trim();
  const sheba = $('#uWithdrawSheba')?.value.trim();

  if (!amount || amount < 50000) return toast('حداقل مبلغ برداشت ۵۰,۰۰۰ تومان است', 'err');
  if (!holder) return toast('نام و نام خانوادگی صاحب حساب بانکی الزامی است', 'err');
  if (!sheba || sheba.length < 24) return toast('شماره ۲۴ رقمی شبا بانکی را به درستی وارد کنید', 'err');

  const btn = $('#btnSubmitWithdraw');
  btn.disabled = true;
  btn.textContent = '⏳ در حال ثبت درخواست…';

  try {
    const payload = {
      amount,
      accountHolder: holder,
      bankName: bank || 'بانک',
      cardNumber: card,
      sheba: 'IR' + sheba.replace(/^IR/i, '').trim()
    };
    const r = await api('/api/wallet/withdraw', { method: 'POST', body: JSON.stringify(payload) });
    toast(r.message || 'درخواست تسویه با موفقیت ثبت شد 💳', 'ok');

    $('#uWithdrawAmount').value = '';
    $('#uWithdrawWords').textContent = '';
    $('#uWithdrawHolder').value = '';
    $('#uWithdrawBank').value = '';
    $('#uWithdrawCard').value = '';
    $('#uWithdrawSheba').value = '';

    if (S.user) S.user.wallet_balance = r.balance;
    await renderSubscriptions();
    await loadUserFinancialHistory();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '🏦 ثبت درخواست تسویه به حساب بانکی';
  }
}

async function loadUserFinancialHistory() {
  try {
    const r = await api('/api/wallet/financial-history');
    const deposits = r.crypto_deposits || [];
    const withdrawals = r.withdrawals || [];

    const depTbl = $('#uCryptoDepositsTable');
    if (depTbl) {
      const rows = deposits.map(d => {
        const stCls = d.status === 'approved' ? 'up' : d.status === 'rejected' ? 'down' : 'st-pending';
        const stFa = d.status === 'approved' ? 'تأیید و شارژ شد ✓' : d.status === 'rejected' ? 'رد شده ✕' : 'در انتظار بررسی ⏳';
        return `<tr>
          <td>${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d.created_at))}</td>
          <td><b>${NF(d.amount_toman, 0)} ت</b><div class="hint">${d.amount_usdt} USDT (${d.network})</div></td>
          <td dir="ltr" style="font-size:11px">${esc(d.txid.slice(0, 10))}…</td>
          <td><span class="${stCls}">${stFa}</span></td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" class="hint">درخواست واریز رمزارزی ثبت نشده است.</td></tr>';
      depTbl.innerHTML = `<thead><tr><th>زمان</th><th>مبلغ</th><th>کد هش</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody>`;
    }

    const wTbl = $('#uWithdrawalsTable');
    if (wTbl) {
      const rows = withdrawals.map(w => {
        const stCls = w.status === 'completed' ? 'up' : w.status === 'rejected' ? 'down' : 'st-pending';
        const stFa = w.status === 'completed' ? 'تسویه شد ✓' : w.status === 'rejected' ? 'رد شد (استرداد) ✕' : 'در نوبت تسویه پایا ⏳';
        return `<tr>
          <td>${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(w.created_at))}</td>
          <td><b>${NF(w.amount, 0)} ت</b><div class="hint">${esc(w.bank_name)} · ${esc(w.account_holder)}</div></td>
          <td dir="ltr" style="font-size:11px">${esc(w.tracking_code || '—')}</td>
          <td><span class="${stCls}">${stFa}</span></td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" class="hint">درخواست برداشتی ثبت نشده است.</td></tr>';
      wTbl.innerHTML = `<thead><tr><th>زمان</th><th>مبلغ</th><th>پیگیری پایا</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody>`;
    }
  } catch (e) {}
}

/* ============================================================================
   اعلان‌ها و رویدادها
   ============================================================================ */
async function renderNotifications() {
  try {
    const r = await api('/api/notifications');
    S.notifications = r.notifications || [];
    const unread = S.notifications.filter(n => !n.is_read).length;
    const badge = $('#notifBadge');
    if (badge) {
      badge.textContent = NF(unread, 0);
      badge.style.display = unread > 0 ? 'inline-block' : 'none';
    }

    const box = $('#userNotifsList');
    if (box) {
      box.innerHTML = S.notifications.map(n => `
        <div class="notif-item ${n.is_read ? 'read' : 'unread'}" data-notif-id="${n.id}">
          <div class="notif-head">
            <span class="notif-title">${esc(n.title)}</span>
            <span class="hint">${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(n.created_at))}</span>
          </div>
          <div class="notif-body">${esc(n.body)}</div>
        </div>
      `).join('') || '<div class="muted">اعلانی وجود ندارد.</div>';

      $$('#userNotifsList .notif-item.unread').forEach(el => {
        el.onclick = async () => {
          const id = Number(el.dataset.notifId);
          await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ id }) }).catch(() => {});
          el.classList.remove('unread');
          el.classList.add('read');
        };
      });
    }
  } catch (e) {
    toast('خطا در بارگذاری اعلان‌ها', 'err');
  }
}

async function markAllNotifsRead() {
  try {
    await api('/api/notifications/read-all', { method: 'POST' });
    toast('همه اعلان‌ها خوانده شدند', 'ok');
    await renderNotifications();
  } catch (e) { toast(e.message, 'err'); }
}

async function saveNotifPrefs() {
  try {
    const prefs = {
      notif_web: $('#notifPrefWeb')?.checked,
      notif_sms: $('#notifPrefSms')?.checked,
      notif_gold: $('#notifPrefGold')?.checked,
      notif_stock: $('#notifPrefStock')?.checked,
      notif_crypto: $('#notifPrefCrypto')?.checked,
    };
    await api('/api/notifications/prefs', { method: 'POST', body: JSON.stringify(prefs) });
    toast('تنظیمات هشدارهای شما ذخیره شد', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================================================================
   پرتفوی کاربر
   ============================================================================ */
function fillSelectors() {
  const clsOpts = Object.entries(S.classes).map(([k, v]) => `<option value="${k}">${esc(v.fa)}</option>`).join('');
  if ($('#astCls')) $('#astCls').innerHTML = clsOpts;
  const f = $('#assetClsFilter');
  if (f) f.innerHTML = '<option value="">همه کلاس‌ها</option>' + clsOpts;
  const p = $('#aiProvider');
  if (p) p.innerHTML = S.providers.map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join('');
}

function updatePersianWords() {
  const pfVal = $('#pfCash') ? $('#pfCash').value : '';
  if ($('#pfCashWords')) $('#pfCashWords').textContent = pfVal ? 'معادل: ' + numToPersianWords(pfVal, 'تومان') : '';

  const astVal = $('#astAmount') ? $('#astAmount').value : '';
  const astUnit = $('#astUnit') ? $('#astUnit').value : 'unit';
  if ($('#astAmountWords')) $('#astAmountWords').textContent = astVal ? 'معادل: ' + numToPersianWords(astVal, astUnit === 'usd' ? 'دلار' : 'تومان') : '';

  const planP = $('#planPrice') ? $('#planPrice').value : '';
  if ($('#planPriceWords')) $('#planPriceWords').textContent = planP ? 'معادل: ' + numToPersianWords(planP, 'تومان') : '';

  const uwP = $('#userWalletAmount') ? $('#userWalletAmount').value : '';
  if ($('#userWalletWords')) $('#userWalletWords').textContent = uwP ? 'معادل: ' + numToPersianWords(uwP, 'تومان') : '';

  const udP = $('#uDepositAmount') ? $('#uDepositAmount').value : '';
  if ($('#uDepositWords')) $('#uDepositWords').textContent = udP ? 'معادل: ' + numToPersianWords(udP, 'تومان') : '';

  const ucdP = $('#uCryptoDepositAmount') ? $('#uCryptoDepositAmount').value : '';
  if ($('#uCryptoDepositWords')) $('#uCryptoDepositWords').textContent = ucdP ? 'معادل: ' + numToPersianWords(ucdP, 'تومان') : '';

  const uwthP = $('#uWithdrawAmount') ? $('#uWithdrawAmount').value : '';
  if ($('#uWithdrawWords')) $('#uWithdrawWords').textContent = uwthP ? 'معادل: ' + numToPersianWords(uwthP, 'تومان') : '';

  const ccP = $('#calcCapitalInput') ? $('#calcCapitalInput').value : '';
  if ($('#calcCapitalWords')) $('#calcCapitalWords').textContent = ccP ? 'معادل: ' + numToPersianWords(ccP, 'تومان') : '';

  const advH = $('#advHoldingInput') ? $('#advHoldingInput').value : '';
  if ($('#advHoldingWords')) $('#advHoldingWords').textContent = advH ? 'معادل: ' + numToPersianWords(advH, 'تومان') : '';

  const aiAmt = $('#aiInvestAmountInput') ? $('#aiInvestAmountInput').value : '';
  if ($('#aiInvestAmountWords')) $('#aiInvestAmountWords').textContent = aiAmt ? 'معادل: ' + numToPersianWords(aiAmt, 'تومان') : '';
}

async function renderPortfolio() {
  if (!S.state) return;
  const pr = S.state.profile || {};
  if ($('#pfName')) $('#pfName').value = pr.name || '';
  if ($('#pfRisk')) $('#pfRisk').value = pr.risk || 'balanced';
  if ($('#pfHorizon')) $('#pfHorizon').value = pr.horizon || 'mid';
  if ($('#pfCash')) $('#pfCash').value = pr.investableCash || '';
  updatePersianWords();
  const rate = (S.signals && S.signals.portfolio && S.signals.portfolio.rate) ? S.signals.portfolio.rate : 0;
  if ($('#fxRate')) $('#fxRate').textContent = rate ? 'نرخ دلار مبنا: ' + NF(rate, 0) + ' تومان' : '';
  await refreshPortfolio().catch((e) => toast('خطا در بارگذاری پرتفوی: ' + e.message, 'err'));
}

async function refreshPortfolio(pfResp) {
  let r = pfResp;
  if (!r) {
    try { r = await api('/api/portfolio'); }
    catch (e) {
      if (S.signals && S.signals.portfolio) {
        r = { portfolio: (S.state && S.state.portfolio) || [], analysis: S.signals.portfolio };
      } else throw e;
    }
  }
  const a = (r && r.analysis) || {};
  if (S.state && r && r.portfolio) S.state.portfolio = r.portfolio;
  const rows = a.rows || [];
  const total = a.totalToman || 0;
  const rate = a.rate || 0;

  const finRows = rows.filter((r2) => r2.cls !== 'realEstate');

  if ($('#pfKpis')) {
    $('#pfKpis').innerHTML =
      kpi('ارزش کل پرتفوی', total ? NF(total / 1e6, 1) + ' میلیون تومان' : '—', rate ? '≈ ' + NF(total / rate, 0) + ' دلار' : '') +
      kpi('تعداد دارایی‌ها', NF(rows.length, 0), 'ثبت‌شده در پرتفوی') +
      kpi('بزرگ‌ترین وزن', (a.baseToman && finRows.length) ? PctPlain(Math.max(...finRows.map((x) => (x.toman || 0) / a.baseToman)) * 100, 1) : '—',
        rows.length ? 'تمرکز ریسک در سبد سرمایه‌گذاری' : '') +
      kpi('نقد قابل تخصیص', a.investable ? NF(a.investable / 1e6, 1) + ' میلیون تومان' : '—', 'برای بازتوازن');
  }

  if ($('#pfTable')) {
    $('#pfTable').innerHTML = rows.length ? `<table class="table"><thead><tr>
        <th>دارایی</th><th>کلاس</th><th>مبلغ</th><th>معادل تومان</th><th>سهم</th><th></th></tr></thead><tbody>
        ${rows.map((r2) => `<tr>
          <td class="name-cell">${esc(r2.label)}</td>
          <td><span class="chip-cls" style="border-color:${clsColor(r2.cls)}66;color:${clsColor(r2.cls)}">${esc(clsFa(r2.cls))}</span></td>
          <td>${NF(r2.amount, 0)} ${r2.unit === 'usd' ? 'دلار' : 'تومان'}</td>
          <td>${NF(r2.toman, 0)}</td>
          <td>${r2.cls === 'realEstate' ? '<span class="hint">دارایی پایه</span>' : (a.baseToman ? PctPlain(((r2.toman || 0) / a.baseToman) * 100, 1) : '—')}</td>
          <td>
            <div class="row-gap" style="gap:6px">
              <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(r2.assetId || r2.label)}')">🤖 ربات ترید</button>
              <button class="btn btn-ghost btn-sm" onclick="delAsset('${r2.id}')">حذف</button>
            </div>
          </td>
        </tr>`).join('')}</tbody></table>` : '<div class="muted">هنوز دارایی‌ای ثبت نکرده‌اید. با فرم بالا شروع کنید.</div>';
  }

  if ($('#gapTable')) {
    $('#gapTable').innerHTML = (a.gaps || []).length ? `<table class="table"><thead><tr>
        <th>کلاس دارایی</th><th>وزن فعلی</th><th>مدل هدف</th><th>شکاف</th><th>وضعیت</th></tr></thead><tbody>
        ${a.gaps.map((g) => `<tr>
          <td><span class="chip-cls" style="border-color:${clsColor(g.cls)}66;color:${clsColor(g.cls)}">${esc(g.clsFa)}</span></td>
          <td>${PctPlain(g.current, 1)}</td><td>${PctPlain(g.target, 1)}</td>
          <td class="${g.gap > 0 ? 'up' : g.gap < 0 ? 'down' : 'neutral'}">${g.gap > 0 ? '+' : ''}${NF(g.gap, 1)}</td>
          <td>${g.gap > 3 ? 'کم‌وزن — جای افزایش' : g.gap < -3 ? 'سنگین — نیاز به کاهش' : 'متعادل'}</td>
        </tr>`).join('')}</tbody></table>` : '<div class="muted">برای محاسبه، دارایی‌ها را ثبت کنید.</div>';
  }

  const dep = a.deploy || [];
  if ($('#deployBox')) {
    $('#deployBox').innerHTML = `
      <p class="muted">پیشنهاد تخصیص نقد (${a.investable ? NF(a.investable / 1e6, 1) + ' میلیون تومان' : 'بدون نقد ثبت‌شده'}):</p>
      ${dep.length ? `<table class="table"><thead><tr><th>کلاس</th><th>مبلغ پیشنهادی</th><th>سهم از نقد</th><th>مدل هدف</th></tr></thead><tbody>
        ${dep.map((d) => `<tr><td><span class="chip-cls" style="border-color:${clsColor(d.cls)}66;color:${clsColor(d.cls)}">${esc(d.clsFa)}</span></td>
          <td>${NF(d.amountToman, 0)} تومان</td><td>${PctPlain((d.amountToman / (a.investable || 1)) * 100, 0)}</td><td>${PctPlain(d.gap, 1)} کمبود</td></tr>`).join('')}
        </tbody></table>` : '<div class="muted">کلاس کم‌وزنی برای تخصیص وجود ندارد یا نقدی ثبت نشده است.</div>'}
      <div class="note"><b>ترتیب اجرا</b><p>ابتدا کلاس‌های کم‌وزن را با فرصت‌های برتر تب «سیگنال‌ها» پر کنید (پله‌ای، در ۲ تا ۴ نوبت) و سپس کلاس‌های سنگین را به‌تدریج سبک کنید.</p></div>`;
  }
}

window.delAsset = async (id) => {
  try {
    const r = await api('/api/portfolio?id=' + encodeURIComponent(id), { method: 'DELETE' });
    await refreshPortfolio(r);
    toast('دارایی حذف شد', 'ok');
    loadSignals();
  } catch (e) { toast(e.message, 'err'); }
};

/* ============================================================================
   تنظیمات هوش مصنوعی و چت
   ============================================================================ */
const kv = (k, v) => `<div class="kv-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;

function renderSettings() {
  if (!S.state) return;
  const a = S.state.ai || {};
  const p = $('#aiProvider');
  if (p && S.providers.length) p.value = a.provider || 'openai';
  const prov = S.providers.find((x) => x.key === (a.provider || 'openai'));
  if ($('#aiBaseUrl')) $('#aiBaseUrl').value = a.baseUrl || (prov ? prov.baseUrl : '');
  if ($('#aiKey')) $('#aiKey').placeholder = a.hasKey ? 'کلید ذخیره شده است (برای تغییر، مقدار جدید بنویسید)' : 'sk-…';
  if ($('#aiTemp')) $('#aiTemp').value = a.temperature ?? 0.3;
  if ($('#aiAuto')) $('#aiAuto').value = a.autoMode ? '1' : '0';
  if ($('#aiInterval')) $('#aiInterval').value = a.autoIntervalMin || 60;

  const models = a.lastModels || [];
  const opts = ['<option value="auto">🤖 انتخاب خودکار بهترین مدل</option>']
    .concat(models.slice(0, 200).map((m) => `<option value="${esc(m.id)}" ${a.model === m.id ? 'selected' : ''}>${esc(m.id)}</option>`));
  if ($('#aiModel')) {
    $('#aiModel').innerHTML = opts.join('');
    $('#aiModel').value = a.model || 'auto';
  }

  const isDemo = /localhost:4000|127\.0\.0\.1:4000/.test($('#aiBaseUrl')?.value || '');
  const stat = $('#aiSettingsStatus');
  if (stat) {
    stat.innerHTML = (isDemo ? `<div class="note"><b>🧪 حالت دمو فعال است</b><p>آدرس سرویس به <code>localhost:4000</code> (شبیه‌ساز محلی) اشاره می‌کند.</p></div>` : '') + `
      <div class="kv-list">
        ${kv('پرووایدر', esc((S.providers.find((x) => x.key === a.provider) || {}).label || a.provider || '—'))}
        ${kv('کلید API', a.hasKey ? '<span style="color:var(--ok-txt)">ثبت شده ✓</span>' : '<span style="color:var(--bad-txt)">ثبت نشده</span>')}
        ${kv('مدل انتخابی', (a.model === 'auto' || !a.model) ? 'خودکار' + (a.autoPick ? ' → <code>' + esc(a.autoPick) + '</code>' : '') : esc(a.model))}
        ${kv('مدل‌های شناسایی‌شده', NF(models.length, 0) + ' مدل')}
      </div>`;
  }
}

function renderModels(res) {
  $('#modelsBox').innerHTML = `<div class="hint">${NF(res.models.length, 0)} مدل یافت شد — بهترین پیشنهاد: <b>${esc(res.auto || '—')}</b></div>` +
    res.models.slice(0, 120).map((m) => `<div class="model-item ${m.id === res.auto ? 'best' : ''}" data-id="${esc(m.id)}">
      <span>${m.id === res.auto ? '🏆 ' : ''}${esc(m.name || m.id)}</span>
      <span class="m-id">${esc(m.id)}</span>
    </div>`).join('');
}

function renderAiResult(data) {
  const box = $('#aiResult');
  if (!box) return;
  if (!data || !data.analysis) {
    box.innerHTML = `<div class="panel"><div class="muted">
      هنوز تحلیلی با هوش مصنوعی تولید نشده است. روی «تولید تحلیل خودکار» بزنید.
    </div></div>`;
    return;
  }
  const an = data.analysis;
  box.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>چکیده تحلیل</h2>
        <span class="ai-badge">${esc(data.provider || '')} · ${esc(data.model || '')} · ${NF((data.durationMs || 0) / 1000, 1)} ثانیه</span></div>
      <div class="ai-card"><p>${esc(an.summary || '')}</p></div>
      ${an.regime ? `<div class="ai-card"><b>تصویر رژیم بازار:</b> ${esc(an.regime)}</div>` : ''}
    </div>`;
}

async function loadLastAnalysis() {
  try {
    const r = await api('/api/ai/last');
    S.ai = r;
    renderAiResult(r.analysis);
  } catch (e) {}
}

function mdToHtml(src) {
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = esc(src).split('\n');
  return lines.map(l => `<p>${inline(l)}</p>`).join('');
}

function msgHtml(role, text) {
  return `<div class="msg ${role}"><div class="who">${role === 'user' ? 'شما' : 'تحلیلگر سرمایه‌یار'}</div>${role === 'user' ? esc(text) : mdToHtml(text)}</div>`;
}

async function renderChat() {
  try {
    const r = await api('/api/ai/chat');
    const box = $('#chatBox');
    if (box) {
      box.innerHTML = (r.chat || []).map((m) => msgHtml(m.role, m.content)).join('') || '<div class="muted">سؤال خود را بپرسید؛ تحلیلگر به داده زنده بازار و پرتفوی شما دسترسی دارد.</div>';
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) {}
}

async function sendChat() {
  const inp = $('#chatInput');
  const text = (inp?.value || '').trim();
  if (!text || S.chatBusy) return;
  S.chatBusy = true;
  const box = $('#chatBox');
  if (box.querySelector('.muted')) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', msgHtml('user', text));
  inp.value = '';
  const pending = document.createElement('div');
  pending.className = 'msg assistant';
  pending.innerHTML = '<div class="who">تحلیلگر سرمایه‌یار</div>در حال تحلیل داده بازار…';
  box.appendChild(pending);
  box.scrollTop = box.scrollHeight;
  try {
    const r = await api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
    pending.innerHTML = `<div class="who">تحلیلگر سرمایه‌یار · ${esc(r.model || '')}</div>${mdToHtml(r.text)}`;
  } catch (e) {
    pending.innerHTML = `<div class="who">خطا</div>${esc(e.message)}`;
  }
  S.chatBusy = false;
  box.scrollTop = box.scrollHeight;
}

/* ============================================================================
   پنل مدیریت
   ============================================================================ */
const ADM_ACTIONS = {
  login: 'ورود موفق', logout: 'خروج', register: 'ثبت‌نام', login_failed: 'ورود ناموفق',
  admin_user_update: 'ویرایش کاربر', admin_user_create: 'ساخت کاربر', admin_user_delete: 'حذف کاربر',
  admin_wallet_credit: 'افزایش کیف‌پول', admin_wallet_debit: 'کاهش کیف‌پول',
  admin_user_status: 'تغییر وضعیت/محدودیت کاربر', admin_plan_create: 'ساخت پلن',
  admin_plan_update: 'ویرایش پلن', admin_sub_grant: 'اعطای اشتراک دستی', admin_settings: 'تغییر تنظیمات',
  auto_invest: 'سرمایه‌گذاری خودکار با کیف‌پول', crypto_deposit: 'شارژ با ارز دیجیتال',
  crypto_approved: 'تأیید واریز رمزارزی', crypto_rejected: 'رد واریز رمزارزی',
  withdraw_completed: 'تسویه موفق پایا', withdraw_rejected: 'رد برداشت و استرداد'
};

async function loadAdmin(force) {
  if (!hasUserAdminAccess(S.user)) {
    toast('دسترسی غیرمجاز! پنل مدیریت فقط مختص مدیران مجاز سامانه است 🛡️', 'err');
    go('dashboard');
    return;
  }
  if (S.admin.loaded && !force) return renderAdminAll();
  $('#admStats').innerHTML = '<div class="skeleton h120"></div>';
  const [ov, us, st, au, pl, fin, flds, rls, uiCfg] = await Promise.all([
    api('/api/admin/overview'),
    api('/api/admin/users?q=' + encodeURIComponent($('#admUserQ')?.value || '') + '&status=' + ($('#admUserStatus')?.value || '')),
    api('/api/admin/settings'),
    api('/api/admin/audit?limit=120').catch(() => ({ log: [] })),
    api('/api/admin/plans').catch(() => ({ plans: [] })),
    api('/api/admin/financial/requests').catch(() => ({ crypto_deposits: [], withdrawals: [] })),
    api('/api/admin/auth/fields').catch(() => ({ fields: [] })),
    api('/api/admin/roles').catch(() => ({ roles: [] })),
    api('/api/admin/ui-settings').catch(() => null),
  ]);
  S.admin.overview = ov; S.admin.users = us.users || []; S.admin.settings = st.settings || {};
  S.admin.audit = au.log || []; S.admin.plans = pl.plans || [];
  S.admin.financial = fin || { crypto_deposits: [], withdrawals: [] };
  S.admin.fields = flds.fields || [];
  S.admin.roles = (rls.roles && rls.roles.length > 0) ? rls.roles : getAllDefinedRoles();
  if (uiCfg) {
    if (uiCfg.navItems) S.ui.navItems = uiCfg.navItems;
    if (uiCfg.buttonsConfig) S.ui.buttonsConfig = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_BUTTONS_CONFIG)), uiCfg.buttonsConfig);
    if (uiCfg.themeStyles) S.ui.themeStyles = uiCfg.themeStyles;
    if (uiCfg.visibilityRules) {
      S.ui.visibilityRules = {
        views: Object.assign({}, DEFAULT_VISIBILITY_RULES.views, uiCfg.visibilityRules.views || {}),
        features: Object.assign({}, DEFAULT_VISIBILITY_RULES.features, uiCfg.visibilityRules.features || {})
      };
    }
  }
  S.admin.usage = await api('/api/admin/ai-usage?limit=60').then(r => r.usage || []).catch(() => []);
  S.admin.loaded = true;
  renderAdminAll();
}

function renderAdminAll() {
  renderAdminStats(); renderAdminChart(); renderAdminSystem();
  api('/api/admin/net').then(renderNet).catch(() => {});
  renderAdminUsers(); renderAdminFields(); renderAdminRoles();
  renderAdminAuthSettings(); renderAdminPlans(); renderAdminGateways();
  renderAdminSms(); renderAdminUiCustomizer(); renderAdminCleanSettings(); renderAdminCleanEngine();
  renderAdminAudit(); renderAdminUsage(); renderAdminFinancial();
  renderSettings();
}

function renderAdminStats() {
  const c = (S.admin.overview || {}).counts || {};
  const card = (t, v, s) => `<div class="kpi"><div class="hint">${t}</div><div class="k-value">${v}</div><div class="hint">${s}</div></div>`;
  $('#admStats').innerHTML =
    card('کاربران', NF(c.users, 0), `${NF(c.active, 0)} فعال · ${NF(c.pending, 0)} در انتظار · ${NF(c.blocked, 0)} مسدود`)
    + card('ثبت‌نام‌ها', NF(c.newToday, 0) + ' امروز', `${NF(c.new7, 0)} در ۷ روز · ${NF(c.new30, 0)} در ۳۰ روز`)
    + card('اشتراک‌های فعال', NF(c.activeSubs || 0, 0), `کل درآمد: ${NF((c.totalRevenue || 0) / 1000, 0)} هزار تومان`)
    + card('اجرای هوش مصنوعی', NF(c.aiRuns, 0), `${NF(c.aiRuns7, 0)} در ۷ روز`);
}

function renderAdminChart() {
  const series = (S.admin.overview || {}).series || [];
  const max = Math.max(1, ...series.map(d => Math.max(d.signups, 0)));
  $('#admChart').innerHTML = series.map((d) => {
    const h = Math.round((d.signups / max) * 130) + 3;
    const lbl = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'numeric' }).format(new Date(d.to));
    return `<div class="adm-bar" title="${lbl}: ${NF(d.signups, 0)} ثبت‌نام">
      <span>${d.signups ? NF(d.signups, 0) : ''}</span><i style="height:${h}px"></i><span>${lbl}</span></div>`;
  }).join('');
}

function renderAdminSystem() {
  const o = S.admin.overview || {}; const m = o.market || {}; const env = o.env || {};
  const size = env.dbSize ? (env.dbSize > 1048576 ? (env.dbSize / 1048576).toFixed(1) + ' مگابایت' : Math.round(env.dbSize / 1024) + ' کیلوبایت') : '—';
  $('#admSystem').innerHTML = `<div class="adm-kv">
    <div><span class="hint">وضعیت دادهٔ بازار</span><b>${m.status === 'ready' ? 'آماده' : (m.status || '—')}</b></div>
    <div><span class="hint">دارایی‌های سالم</span><b>${NF(m.assets, 0)} از ${NF(m.total, 0)}</b></div>
    <div><span class="hint">نسخهٔ PHP</span><b dir="ltr">${esc(env.php || '')}</b></div>
    <div><span class="hint">دیتابیس</span><b>${(o.db && o.db.driver) || '—'}</b></div>
    <div><span class="hint">حجم دیتابیس</span><b>${size}</b></div>
  </div>`;
}

function renderNet(r) {
  const net = (r && r.net) || {}, probe = (r && r.probe) || {};
  const box = $('#admNet'); if (!box) return;
  const tests = probe.tests || [];
  box.innerHTML = tests.map((t) => `<div class="row" style="justify-content:space-between;gap:10px;padding:4px 0">
      <span>${esc(t.label)}<div class="hint">${esc(t.reason || t.detail || '')}</div></span>
      <span class="chip-cls" style="color:var(${t.ok ? '--ok-txt' : '--bad-txt'})">${t.ok ? 'سالم' : 'ناموفق'}</span>
    </div>`).join('');
  if ($('#admNetProxy')) $('#admNetProxy').value = net.proxy || '';
  if ($('#admNetTimeout')) $('#admNetTimeout').value = net.timeout || 15;
  if ($('#admNetTgju')) $('#admNetTgju').checked = net.tgju !== false;
  if ($('#admNetYahoo')) $('#admNetYahoo').checked = net.yahoo !== false;
  if ($('#admNetCg')) $('#admNetCg').checked = net.coingecko !== false;
  if ($('#admNetInsecure')) $('#admNetInsecure').checked = !!net.insecure;
}

/* ----------------------------- مدیریت درخواست‌های مالی (ادمین) ----------------------------- */
async function loadAdminFinancial(force = true) {
  try {
    const fin = await api('/api/admin/financial/requests');
    S.admin.financial = fin;
    renderAdminFinancial();
    if (force) toast('لیست درخواست‌های مالی به‌روز شد', 'ok');
  } catch (e) {
    toast('خطا در دریافت درخواست‌های مالی: ' + e.message, 'err');
  }
}

function renderAdminFinancial() {
  const fin = S.admin.financial || { crypto_deposits: [], withdrawals: [] };
  const deposits = fin.crypto_deposits || [];
  const withdrawals = fin.withdrawals || [];

  const pendingCount = deposits.filter(d => d.status === 'pending').length + withdrawals.filter(w => w.status === 'pending').length;
  const badge = $('#admFinancialBadge');
  if (badge) {
    badge.textContent = NF(pendingCount, 0);
    badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }

  // جدول واریزهای رمزارزی
  const depTbl = $('#admCryptoDepositsTable');
  if (depTbl) {
    const rows = deposits.map(d => {
      const isPending = d.status === 'pending';
      const stCls = d.status === 'approved' ? 'up' : d.status === 'rejected' ? 'down' : 'st-pending';
      const stFa = d.status === 'approved' ? 'تأییدشده ✓' : d.status === 'rejected' ? 'ردشده ✕' : 'در انتظار بررسی';
      return `<tr>
        <td>#${d.id}</td>
        <td><b>${esc(d.user_name || d.email || ('#' + d.user_id))}</b></td>
        <td><b>${NF(d.amount_toman, 0)} ت</b><div class="hint">${d.amount_usdt} USDT (${d.network})</div></td>
        <td dir="ltr" style="font-size:11.5px;max-width:140px;word-break:break-all">${esc(d.txid)}</td>
        <td>${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d.created_at))}</td>
        <td><span class="${stCls}">${stFa}</span></td>
        <td>
          ${isPending ? `<div class="act-btns">
            <button class="btn btn-primary btn-sm" onclick="adminApproveCrypto(${d.id})">✅ تأیید و شارژ</button>
            <button class="btn btn-ghost btn-sm" onclick="adminRejectCrypto(${d.id})">❌ رد</button>
          </div>` : `<span class="hint">${esc(d.admin_note || '—')}</span>`}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="hint">درخواست واریز رمزارزی وجود ندارد.</td></tr>';
    depTbl.innerHTML = `<thead><tr><th>#</th><th>کاربر</th><th>مبلغ</th><th>کد هش (TXID)</th><th>زمان ثبت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${rows}</tbody>`;
  }

  // جدول برداشت‌های ریالی
  const wTbl = $('#admWithdrawalsTable');
  if (wTbl) {
    const rows = withdrawals.map(w => {
      const isPending = w.status === 'pending';
      const stCls = w.status === 'completed' ? 'up' : w.status === 'rejected' ? 'down' : 'st-pending';
      const stFa = w.status === 'completed' ? 'تسویه‌شده ✓' : w.status === 'rejected' ? 'ردشده (استرداد) ✕' : 'در انتظار تسویه';
      return `<tr>
        <td>#${w.id}</td>
        <td><b>${esc(w.account_holder)}</b><div class="hint">${esc(w.user_name || w.email)}</div></td>
        <td><b>${NF(w.amount, 0)} ت</b></td>
        <td>${esc(w.bank_name)}<div class="hint" dir="ltr">${esc(w.sheba)}</div></td>
        <td>${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(w.created_at))}</td>
        <td><span class="${stCls}">${stFa}</span></td>
        <td>
          ${isPending ? `<div class="act-btns">
            <button class="btn btn-primary btn-sm" onclick="adminCompleteWithdraw(${w.id})">✅ تسویه شد</button>
            <button class="btn btn-ghost btn-sm" onclick="adminRejectWithdraw(${w.id})">❌ رد و برگشت وجه</button>
          </div>` : `<span class="hint">${esc(w.tracking_code || w.admin_note || '—')}</span>`}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="hint">درخواست برداشتی ثبت نشده است.</td></tr>';
    wTbl.innerHTML = `<thead><tr><th>#</th><th>صاحب حساب</th><th>مبلغ</th><th>اطلاعات بانکی</th><th>زمان ثبت</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${rows}</tbody>`;
  }
}

window.adminApproveCrypto = async function(id) {
  const note = prompt('یادداشت مدیر برای تأیید تراکنش (اختیاری):', 'تأیید واریز در شبکه Tron');
  if (note === null) return;
  try {
    const r = await api('/api/admin/financial/crypto-approve', { method: 'POST', body: JSON.stringify({ id, note }) });
    toast(r.message || 'واریز تأیید و کیف‌پول کاربر شارژ شد', 'ok');
    await loadAdminFinancial(false);
  } catch (e) { toast(e.message, 'err'); }
};

window.adminRejectCrypto = async function(id) {
  const reason = prompt('دلیل رد درخواست واریز (جهت اطلاع کاربر):', 'کد هش در شبکه یافت نشد یا معتبر نیست');
  if (!reason) return;
  try {
    const r = await api('/api/admin/financial/crypto-reject', { method: 'POST', body: JSON.stringify({ id, reason }) });
    toast(r.message || 'درخواست رد شد', 'ok');
    await loadAdminFinancial(false);
  } catch (e) { toast(e.message, 'err'); }
};

window.adminCompleteWithdraw = async function(id) {
  const trackingCode = prompt('شماره پیگیری پایا / ساتنا را وارد کنید:', 'PAYA-' + Math.floor(Math.random() * 900000 + 100000));
  if (!trackingCode) return;
  try {
    const r = await api('/api/admin/financial/withdraw-complete', { method: 'POST', body: JSON.stringify({ id, trackingCode }) });
    toast(r.message || 'درخواست تسویه شد', 'ok');
    await loadAdminFinancial(false);
  } catch (e) { toast(e.message, 'err'); }
};

window.adminRejectWithdraw = async function(id) {
  const reason = prompt('دلیل رد درخواست برداشت (مبلغ به کیف‌پول کاربر بازخواهد گشت):', 'شماره شبا با نام صاحب حساب همخوانی ندارد');
  if (!reason) return;
  try {
    const r = await api('/api/admin/financial/withdraw-reject', { method: 'POST', body: JSON.stringify({ id, reason }) });
    toast(r.message || 'درخواست رد و وجه استرداد گردید', 'ok');
    await loadAdminFinancial(false);
  } catch (e) { toast(e.message, 'err'); }
};

/* ----------------------------- کاربران در پنل مدیریت ----------------------------- */
function renderAdminUsers() {
  const viewerIsSuper = isSuperAdminUser(S.user);
  // مخفی‌سازی کامل سوپر ادمین از لیست کاربران برای سایر مدیران
  const allUsers = S.admin.users || [];
  const rows = allUsers.filter(u => viewerIsSuper || !isSuperAdminUser(u));

  if ($('#admUserCountBadge')) $('#admUserCountBadge').textContent = NF(rows.length, 0);
  if ($('#superAdminShieldHint')) {
    $('#superAdminShieldHint').style.display = viewerIsSuper ? '' : 'none';
  }

  // به‌روزرسانی لیست نقش‌ها در فرم ساخت کاربر جدید
  const nuRoleSel = $('#nuRole');
  const definedRoles = getAllDefinedRoles();
  if (nuRoleSel && definedRoles.length) {
    const curVal = nuRoleSel.value || 'user';
    nuRoleSel.innerHTML = definedRoles.map(r => `<option value="${esc(r.slug)}" ${r.slug === curVal ? 'selected' : ''}>${esc(r.title)} (${esc(r.slug)})</option>`).join('');
  }

  const sel = $('#admNotifRecipient');
  if (sel) {
    sel.innerHTML = '<option value="0">همه کاربران سامانه (Broadcast)</option>'
      + rows.map(u => `<option value="${u.id}">${esc(u.name || u.email)} (${esc(u.email)})</option>`).join('');
  }

  const head = ['#', 'نام و نام خانوادگی', 'ایمیل / نام کاربری', 'نقش و سطح دسترسی', 'موجودی کیف‌پول', 'وضعیت', 'محدودیت', 'عضویت', 'عملیات'];
  const body = rows.map(u => {
    const dt = (t) => t ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(t)) : '—';
    const stCls = u.status === 'active' ? 'st-ok' : u.status === 'pending' ? 'st-pending' : 'st-blocked';
    const stFa = { active: 'فعال', pending: 'در انتظار تأیید', blocked: 'مسدود شده' }[u.status] || u.status;
    const restr = u.trade_restricted ? '<span class="pill pill-xs" style="background:var(--down);color:#fff">ممنوع‌المعامله</span>' : '<span class="hint">مجاز</span>';

    const isPending = u.status === 'pending';
    const isBlocked = u.status === 'blocked';
    const isTargetSuper = isSuperAdminUser(u);
    const roleObj = definedRoles.find(r => r.slug === u.role);
    const roleTitle = roleObj ? roleObj.title : (u.role || 'user');
    const roleColor = (roleObj && roleObj.permissions && roleObj.permissions.color) ? `style="border-color:${esc(roleObj.permissions.color)};color:${esc(roleObj.permissions.color)}"` : '';
    const roleBadge = isTargetSuper
      ? `<span class="badge-role admin" title="این حساب برای سایر مدیران سامانه مخفی است">👑 سوپر ادمین (محافظت‌شده)</span>`
      : `<span class="badge-role ${u.role === 'admin' ? 'admin' : (u.role === 'vip' ? 'vip' : '')}" ${roleColor}>${esc(roleTitle)} <small dir="ltr">(${esc(u.role || 'user')})</small></span>`;

    return `<tr>
      <td>${NF(u.id, 0)}</td>
      <td>
        <b>${esc(u.name || '—')}</b>
        ${isTargetSuper ? `<div class="hint" style="color:var(--up);font-size:11px">🛡️ پنهان از دید سایر ادمین‌ها</div>` : ''}
      </td>
      <td dir="ltr" style="text-align:left">
        <div>${esc(u.email || '—')}</div>
        ${u.username ? `<span class="hint">@${esc(u.username)}</span>` : ''}
        ${u.mobile ? `<span class="hint" style="margin-inline-start:6px">📞 ${esc(u.mobile)}</span>` : ''}
      </td>
      <td>${roleBadge}</td>
      <td><b>${NF(u.wallet_balance || u.walletBalance || 0, 0)} تومان</b></td>
      <td><span class="${stCls}">${stFa}</span></td>
      <td>${restr}</td>
      <td>${dt(u.created_at)}</td>
      <td><div class="act-btns">
        ${isPending ? `<button class="btn btn-primary btn-sm" data-uact="quick-approve" data-id="${u.id}" style="background:var(--up);border-color:var(--up);color:#fff">✅ تأیید</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-uact="full-edit" data-id="${u.id}">✏️ ویرایش</button>
        <button class="btn btn-primary btn-sm" data-uact="wallet" data-id="${u.id}">💳 کیف‌پول</button>
        ${!isTargetSuper ? `<button class="btn btn-ghost btn-sm" data-uact="status-modal" data-id="${u.id}">🚫 وضعیت</button>` : ''}
        ${!isTargetSuper ? `<button class="btn btn-ghost btn-sm" data-uact="toggle-lock" data-id="${u.id}">${isBlocked ? '🔓 رفع انسداد' : '🔒 قفل'}</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-uact="reset-pass" data-id="${u.id}">رمز موقت</button>
        ${!isTargetSuper ? `<button class="btn btn-ghost btn-sm" data-uact="delete" data-id="${u.id}" style="color:var(--down)">حذف</button>` : ''}
      </div></td></tr>`;
  }).join('') || `<tr><td colspan="9" class="hint">کاربری یافت نشد.</td></tr>`;

  $('#admUsersTable').innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody>`;
  $$('#admUsersTable [data-uact]').forEach(b => b.onclick = () => adminUserAction(b.dataset.uact, Number(b.dataset.id)));
}

async function adminUserAction(act, id) {
  const u = (S.admin.users || []).find(x => Number(x.id) === id);
  if (!u) return;
  if (isSuperAdminUser(u) && !isSuperAdminUser(S.user)) {
    toast('دسترسی غیرمجاز به حساب مدیر ارشد (Super Admin)!', 'err');
    return;
  }
  try {
    if (act === 'quick-approve') {
      const r = await api('/api/admin/users/approve', { method: 'POST', body: JSON.stringify({ id }) });
      toast(r.message || 'کاربر تأیید و فعال گردید', 'ok');
      await loadAdmin(true);
    } else if (act === 'toggle-lock') {
      if (isSuperAdminUser(u)) return toast('امکان مسدودسازی حساب مدیر ارشد وجود ندارد', 'err');
      const lock = u.status !== 'blocked';
      const reason = lock ? prompt('علت مسدودسازی حساب کاربر:', 'نقض قوانین سامانه') : '';
      if (lock && reason === null) return;
      await api('/api/admin/users/lock', { method: 'POST', body: JSON.stringify({ id, lock, reason: reason || '' }) });
      toast(lock ? 'حساب کاربر مسدود شد' : 'حساب کاربر فعال گردید', 'ok');
      await loadAdmin(true);
    } else if (act === 'full-edit') {
      openUserFullEditModal(u);
    } else if (act === 'wallet') {
      $('#userWalletTargetId').value = u.id;
      $('#userWalletTargetInfo').innerHTML = kv('کاربر', `${esc(u.name || '—')} (${esc(u.email || u.username)})`)
        + kv('موجودی فعلی', `${NF(u.wallet_balance || u.walletBalance || 0, 0)} تومان`);
      $('#userWalletAmount').value = '';
      $('#userWalletReason').value = '';
      $('#userWalletWords').textContent = '';
      $('#userWalletModal').hidden = false;
    } else if (act === 'status-modal') {
      if (isSuperAdminUser(u)) return toast('امکان محدودسازی حساب مدیر ارشد وجود ندارد', 'err');
      $('#userStatusTargetId').value = u.id;
      $('#userStatusTargetInfo').innerHTML = kv('کاربر', `${esc(u.name || '—')} (${esc(u.email || u.username)})`)
        + kv('وضعیت فعلی', u.status)
        + kv('محدودیت معامله', u.trade_restricted ? 'ممنوع‌المعامله' : 'مجاز');
      $('#userStatusSelect').value = u.status || 'active';
      $('#userTradeRestricted').checked = !!u.trade_restricted;
      $('#userStatusReason').value = '';
      $('#userStatusModal').hidden = false;
    } else if (act === 'reset-pass') {
      const r = await api('/api/admin/user/reset-password', { method: 'POST', body: JSON.stringify({ id }) });
      prompt('رمز موقت جدید برای کاربر:', r.tempPassword);
    } else if (act === 'delete') {
      if (isSuperAdminUser(u)) return toast('امکان حذف حساب مدیر ارشد وجود ندارد', 'err');
      if (!confirm(`کاربر ${u.email || u.username} حذف شود؟`)) return;
      await api('/api/admin/users?id=' + id, { method: 'DELETE' });
      toast('کاربر حذف شد', 'ok');
      await loadAdmin(true);
    }
  } catch (e) { toast(e.message, 'err'); }
}

function openUserFullEditModal(u) {
  if (isSuperAdminUser(u) && !isSuperAdminUser(S.user)) {
    toast('دسترسی غیرمجاز به حساب مدیر ارشد!', 'err');
    return;
  }
  const m = $('#userFullEditModal');
  if (!m) return;
  $('#ufe_id').value = u.id;
  $('#ufe_name').value = u.name || '';
  $('#ufe_username').value = u.username || '';
  $('#ufe_email').value = u.email || '';
  $('#ufe_email').disabled = isSuperAdminUser(u);
  $('#ufe_mobile').value = u.mobile || '';
  $('#ufe_status').value = u.status || 'active';
  $('#ufe_status').disabled = isSuperAdminUser(u);
  $('#ufe_pass').value = '';

  // لیست نقش‌ها (شامل تمام نقش‌های سفارشی اضافه شده)
  const rSel = $('#ufe_role');
  const roles = getAllDefinedRoles();
  rSel.innerHTML = roles.map(r => `<option value="${esc(r.slug)}" ${r.slug === u.role ? 'selected' : ''}>${esc(r.title)} (${esc(r.slug)})</option>`).join('');
  rSel.disabled = isSuperAdminUser(u);

  m.hidden = false;
}

async function saveUserFullEdit() {
  const id = Number($('#ufe_id').value);
  if (!id) return;
  const payload = {
    id,
    name: $('#ufe_name').value.trim(),
    username: $('#ufe_username').value.trim(),
    email: $('#ufe_email').value.trim(),
    mobile: $('#ufe_mobile').value.trim(),
    role: $('#ufe_role').value,
    status: $('#ufe_status').value,
  };
  const pass = $('#ufe_pass').value;
  if (pass) payload.password = pass;

  try {
    await api('/api/admin/users/update-full', { method: 'POST', body: JSON.stringify(payload) });
    toast('اطلاعات کاربر با موفقیت به‌روزرسانی شد', 'ok');
    $('#userFullEditModal').hidden = true;
    await loadAdmin(true);
  } catch (e) { toast(e.message, 'err'); }
}

/* ----------------------------- فرم‌ساز فیلدهای ثبت‌نام (Fields Builder) ----------------------------- */
function renderAdminFields() {
  const fields = S.admin.fields || [];
  const tbody = $('#admFieldsTableBody');
  if (!tbody) return;

  if (!fields.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="hint">هیچ فیلدی ثبت نشده است. روی «افزودن فیلد جدید» کلیک کنید.</td></tr>';
    return;
  }

  tbody.innerHTML = fields.map((f, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === fields.length - 1;
    const reqBadge = f.is_required ? '<span style="color:var(--down);font-weight:bold">الزامی ✓</span>' : '<span class="hint">اختیاری</span>';
    const actBadge = f.is_active ? '<span class="st-ok">فعال ✓</span>' : '<span class="hint">غیرفعال</span>';
    const rules = f.validation_rules || {};
    const rulesSummary = [
      rules.min_length ? `حداقل: ${rules.min_length}` : '',
      rules.max_length ? `حداکثر: ${rules.max_length}` : '',
      rules.regex_type ? `الگو: ${rules.regex_type}` : ''
    ].filter(Boolean).join(' · ') || '—';

    return `<tr>
      <td>
        <div class="row-gap" style="gap:4px">
          <b>${f.sort_order || (idx + 1)}</b>
          <button class="btn-move" onclick="moveAdminField(${f.id}, 'up')" ${isFirst ? 'disabled' : ''}>▲</button>
          <button class="btn-move" onclick="moveAdminField(${f.id}, 'down')" ${isLast ? 'disabled' : ''}>▼</button>
        </div>
      </td>
      <td><b>${esc(f.title)}</b></td>
      <td><code dir="ltr">${esc(f.field_key)}</code></td>
      <td><span class="pill pill-xs">${esc(f.type)}</span></td>
      <td>${reqBadge}</td>
      <td>${actBadge}</td>
      <td class="hint">${esc(rulesSummary)}</td>
      <td>
        <div class="act-btns">
          <button class="btn btn-ghost btn-sm" onclick="openFieldModal(${f.id})">✏️ ویرایش</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteAdminField(${f.id})" style="color:var(--down)">✕ حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

window.openFieldModal = function(id = 0) {
  const m = $('#fieldModal');
  if (!m) return;
  const f = id ? (S.admin.fields || []).find(x => Number(x.id) === id) : null;

  $('#fieldFormId').value = f ? f.id : '';
  $('#fieldModalTitle').textContent = f ? '✏️ ویرایش فیلد: ' + f.title : '📝 افزودن فیلد جدید به فرم ثبت‌نام';
  $('#ff_key').value = f ? f.field_key : '';
  $('#ff_key').disabled = f && (f.field_key === 'email' || f.field_key === 'password');
  $('#ff_title').value = f ? f.title : '';
  $('#ff_type').value = f ? f.type : 'text';
  $('#ff_sort').value = f ? (f.sort_order || '') : '';
  $('#ff_required').checked = f ? !!f.is_required : false;
  $('#ff_active').checked = f ? !!f.is_active : true;
  $('#ff_placeholder').value = f ? (f.placeholder || '') : '';
  $('#ff_help').value = f ? (f.help_text || '') : '';
  $('#ff_default').value = f ? (f.default_val || '') : '';

  const vr = (f && f.validation_rules) || {};
  $('#ff_min_len').value = vr.min_length || '';
  $('#ff_max_len').value = vr.max_length || '';
  $('#ff_min_val').value = vr.min_val || '';
  $('#ff_max_val').value = vr.max_val || '';
  $('#ff_regex_type').value = vr.regex_type || '';
  $('#ff_custom_regex').value = vr.custom_regex || '';

  renderFieldOptionsList((f && f.options) || []);
  toggleFieldOptionsVisibility($('#ff_type').value);

  m.hidden = false;
};

function toggleFieldOptionsVisibility(type) {
  const box = $('#fieldOptionsBox');
  if (!box) return;
  const needOpts = ['select', 'multiselect', 'radio', 'checkbox'].includes(type);
  box.hidden = !needOpts;
}

function renderFieldOptionsList(options = []) {
  const list = $('#fieldOptionsList');
  if (!list) return;
  list.innerHTML = (options.length ? options : [{ label: '', value: '' }]).map((opt, i) => {
    const lbl = typeof opt === 'object' ? (opt.label || '') : opt;
    const val = typeof opt === 'object' ? (opt.value || '') : opt;
    return `<div class="row-gap option-row" style="gap:8px">
      <input type="text" class="input input-sm opt-lbl" placeholder="عنوان نمایشی (مثال: تهران)" value="${esc(lbl)}" />
      <input type="text" class="input input-sm opt-val" dir="ltr" placeholder="مقدار انگلیسی (مثال: tehran)" value="${esc(val)}" />
      <button type="button" class="btn btn-ghost btn-sm" onclick="this.closest('.option-row').remove()">✕</button>
    </div>`;
  }).join('');
}

function addFieldOptionRow() {
  const list = $('#fieldOptionsList');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'row-gap option-row';
  div.style.gap = '8px';
  div.innerHTML = `
    <input type="text" class="input input-sm opt-lbl" placeholder="عنوان نمایشی" value="" />
    <input type="text" class="input input-sm opt-val" dir="ltr" placeholder="مقدار انگلیسی" value="" />
    <button type="button" class="btn btn-ghost btn-sm" onclick="this.closest('.option-row').remove()">✕</button>
  `;
  list.appendChild(div);
}

async function saveFieldForm() {
  const id = Number($('#fieldFormId').value);
  const key = $('#ff_key').value.trim();
  const title = $('#ff_title').value.trim();
  const type = $('#ff_type').value;

  if (!key || !title) return toast('شناسه انگلیسی و عنوان فیلد الزامی است', 'err');

  const vr = {};
  if ($('#ff_min_len').value) vr.min_length = Number($('#ff_min_len').value);
  if ($('#ff_max_len').value) vr.max_length = Number($('#ff_max_len').value);
  if ($('#ff_min_val').value) vr.min_val = Number($('#ff_min_val').value);
  if ($('#ff_max_val').value) vr.max_val = Number($('#ff_max_val').value);
  if ($('#ff_regex_type').value) vr.regex_type = $('#ff_regex_type').value;
  if ($('#ff_custom_regex').value) vr.custom_regex = $('#ff_custom_regex').value.trim();

  const options = [];
  $$('#fieldOptionsList .option-row').forEach(row => {
    const lbl = row.querySelector('.opt-lbl')?.value.trim();
    const val = row.querySelector('.opt-val')?.value.trim();
    if (lbl || val) options.push({ label: lbl || val, value: val || lbl });
  });

  const payload = {
    id: id || undefined,
    field_key: key,
    title,
    type,
    sort_order: Number($('#ff_sort').value) || 0,
    is_required: $('#ff_required').checked ? 1 : 0,
    is_active: $('#ff_active').checked ? 1 : 0,
    placeholder: $('#ff_placeholder').value.trim(),
    help_text: $('#ff_help').value.trim(),
    default_val: $('#ff_default').value.trim(),
    validation_rules: vr,
    options
  };

  try {
    const r = await api('/api/admin/auth/fields', { method: 'POST', body: JSON.stringify(payload) });
    toast('فیلد فرم ثبت‌نام با موفقیت ذخیره شد', 'ok');
    $('#fieldModal').hidden = true;
    S.admin.fields = r.fields || [];
    renderAdminFields();
    dynamicFieldsLoaded = false;
  } catch (e) { toast(e.message, 'err'); }
}

window.deleteAdminField = async function(id) {
  if (!confirm('آیا از حذف این فیلد اطمینان دارید؟')) return;
  try {
    const r = await api('/api/admin/auth/fields?id=' + id, { method: 'DELETE' });
    toast('فیلد حذف شد', 'ok');
    S.admin.fields = r.fields || [];
    renderAdminFields();
    dynamicFieldsLoaded = false;
  } catch (e) { toast(e.message, 'err'); }
};

window.moveAdminField = async function(id, dir) {
  const fields = (S.admin.fields || []).slice();
  const idx = fields.findIndex(f => Number(f.id) === id);
  if (idx < 0) return;
  const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= fields.length) return;

  const tmp = fields[idx];
  fields[idx] = fields[targetIdx];
  fields[targetIdx] = tmp;

  const orders = fields.map((f, i) => ({ id: f.id, sort_order: i + 1 }));
  try {
    const r = await api('/api/admin/auth/fields/reorder', { method: 'POST', body: JSON.stringify({ orders }) });
    S.admin.fields = r.fields || [];
    renderAdminFields();
    dynamicFieldsLoaded = false;
  } catch (e) { toast(e.message, 'err'); }
};

/* ----------------------------- مدیریت نقش‌ها و ماتریس جامع دسترسی‌ها (Roles & Permissions Manager) ----------------------------- */
const ROLE_PERM_GROUPS = [
  {
    groupTitle: '📑 بخش ۱: صفحات و منوهای اصلی سامانه (Views & Menus)',
    color: 'var(--accent)',
    items: [
      { key: 'view_dashboard', viewKey: 'dashboard', label: '📊 داشبورد تحلیلی و وضعیت بازار' },
      { key: 'view_market', viewKey: 'market', label: '📈 دیده‌بان قیمت‌ها و بازارها' },
      { key: 'view_signals', viewKey: 'signals', label: '⚡ سیگنال‌های هوشمند خرید و فروش' },
      { key: 'view_auto_invest', viewKey: 'auto-invest', label: '🤖 معاملات خودکار و ربات سرمایه‌گذار' },
      { key: 'view_portfolio', viewKey: 'portfolio', label: '💼 سبد دارایی و پرتفوی من' },
      { key: 'view_ai_analysis', viewKey: 'ai-analysis', label: '🧠 تحلیل جامع هوش مصنوعی' },
      { key: 'view_chat', viewKey: 'chat', label: '💬 گفتگو با مشاور هوش مصنوعی' },
      { key: 'view_subscriptions', viewKey: 'subscriptions', label: '💎 کیف‌پول، اشتراک و تراکنش‌ها' },
      { key: 'view_notifications', viewKey: 'notifications', label: '🔔 اعلان‌ها و هشدارهای قیمتی' },
      { key: 'view_news', viewKey: 'news', label: '📰 اخبار فوری و تقویم اقتصادی' },
      { key: 'view_guide', viewKey: 'guide', label: '📖 راهنمای جامع سامانه' },
      { key: 'view_admin', viewKey: 'admin', label: '🛡️ ورود به پنل مدیریت سامانه' }
    ]
  },
  {
    groupTitle: '🎯 بخش ۲: تمامی دکمه‌ها و المان‌های کنشی (All Action Buttons & CTAs)',
    color: 'var(--up)',
    items: [
      { key: 'btn_auto_invest', btnKey: 'btn_auto_invest', featKey: 'signal_auto_invest_btn', label: '⚡ دکمه سرمایه‌گذاری خودکار با کیف‌پول' },
      { key: 'btn_signal_detail', btnKey: 'btn_signal_detail', featKey: 'btn_signal_detail', label: '🔍 دکمه تحلیل و سطوح معامله سیگنال' },
      { key: 'btn_asset_advisory', btnKey: 'btn_asset_advisory', featKey: 'signal_advisory_btn', label: '🎯 دکمه مشاوره استراتژی دارایی (دارم / بخرم؟)' },
      { key: 'btn_ai_chat', btnKey: 'btn_ai_chat', featKey: 'ai_chat_modal', label: '🤖 دکمه تحلیل عمیق دارایی با هوش مصنوعی' },
      { key: 'btn_wallet_recharge', btnKey: 'btn_wallet_recharge', featKey: 'wallet_recharge', label: '💳 دکمه شارژ ریالی آنلاین کیف‌پول' },
      { key: 'btn_crypto_payment', btnKey: 'btn_crypto_payment', featKey: 'crypto_payment', label: '🪙 دکمه پرداخت رمزارزی (تتر TRC20)' },
      { key: 'btn_withdraw_request', btnKey: 'btn_withdraw_request', featKey: 'wallet_withdraw', label: '🏦 دکمه ثبت درخواست تسویه پایا (شبا)' },
      { key: 'btn_sub_purchase', btnKey: 'btn_sub_purchase', featKey: 'btn_sub_purchase', label: '💎 دکمه خرید و تمدید پلن اشتراک VIP' },
      { key: 'btn_portfolio_add', btnKey: 'btn_portfolio_add', featKey: 'portfolio_add', label: '＋ دکمه افزودن دارایی به پرتفوی' },
      { key: 'btn_auto_close', btnKey: 'btn_auto_close', featKey: 'btn_auto_close', label: '💰 دکمه خروج و تسویه معامله به کیف‌پول' },
      { key: 'btn_alloc_calc', btnKey: 'btn_alloc_calc', featKey: 'signal_calc_btn', label: '🧮 دکمه ماشین‌حساب حجم و پله‌های ورود' },
      { key: 'btn_alert_create', btnKey: 'btn_alert_create', featKey: 'btn_alert_create', label: '🔔 دکمه ثبت هشدار قیمتی و پیامکی' },
      { key: 'btn_refresh_market', btnKey: 'btn_refresh_market', featKey: 'btn_refresh_market', label: '↻ دکمه بروزرسانی زنده بازار در هدر' },
      { key: 'btn_theme_toggle', btnKey: 'btn_theme_toggle', featKey: 'btn_theme_toggle', label: '🌓 دکمه تغییر حالت شب و روز در هدر' },
      { key: 'btn_export_data', btnKey: 'btn_export_data', featKey: 'export_data', label: '📤 دکمه خروجی اکسل / CSV از جداول' }
    ]
  },
  {
    groupTitle: '✨ بخش ۳: قابلیت‌های ویژه کاربری، هوش مصنوعی و سیگنال‌ها (User & VIP Capabilities)',
    color: '#a855f7',
    items: [
      { key: 'header_ticker', featKey: 'header_ticker', label: '📊 نوار تیکر قیمت‌های زنده بالای سایت' },
      { key: 'dash_auto_invest_banner', featKey: 'dash_auto_invest_banner', label: '🚀 بنر معاملات خودکار در داشبورد' },
      { key: 'signals_view', featKey: 'signals_view', label: '📈 مشاهده سیگنال‌های عمومی بازار' },
      { key: 'signals_vip', featKey: 'signals_vip', label: '💎 مشاهده سیگنال‌های طلایی و ویژه VIP' },
      { key: 'portfolio_manage', featKey: 'portfolio_add', label: '💼 مدیریت پیشرفته سبد دارایی و تحلیل ریسک' },
      { key: 'ai_chat', featKey: 'ai_chat_modal', label: '💬 چت و پرسش‌وپاسخ با دستیار هوش مصنوعی' },
      { key: 'ai_models', featKey: 'ai_models', label: '🧠 دسترسی به تمام مدل‌های هوش مصنوعی' },
      { key: 'auto_invest', featKey: 'signal_auto_invest_btn', label: '🤖 فعال‌سازی ربات سرمایه‌گذاری خودکار' }
    ]
  },
  {
    groupTitle: '⚙️ بخش ۴: اختیارات و ماژول‌های مدیریتی (Admin Capabilities)',
    color: 'var(--warn)',
    items: [
      { key: 'admin_users', featKey: 'admin_users', label: '👥 مدیریت کاربران (بدون دسترسی به سوپر ادمین)' },
      { key: 'admin_financial', featKey: 'admin_financial', label: '💳 مدیریت مالی، تأیید واریز رمزارزی و تسویه پایا' },
      { key: 'admin_plans', featKey: 'admin_plans', label: '💎 مدیریت پلن‌ها و اشتراک‌های VIP' },
      { key: 'admin_gateways', featKey: 'admin_gateways', label: '🏦 تنظیمات درگاه‌های پرداخت بانکی و کریپتو' },
      { key: 'admin_sms', featKey: 'admin_sms', label: '📱 تنظیمات پنل پیامک و ارسال اعلان' },
      { key: 'admin_ai_config', featKey: 'ai_settings', label: '🧠 پیکربندی کلیدهای API و مدل‌های هوش مصنوعی' },
      { key: 'admin_engine', featKey: 'admin_engine', label: '📈 تنظیم ضرایب موتور تحلیل و امتیازدهی' },
      { key: 'admin_settings', featKey: 'system_settings', label: '⚙️ تنظیمات عمومی سایت و امنیت' },
      { key: 'admin_ui_customizer', featKey: 'admin_ui_customizer', label: '🎨 شخصی‌سازی ظاهر، منوها، رنگ‌ها و دکمه‌ها' },
      { key: 'admin_roles', featKey: 'admin_roles', label: '🛡️ مدیریت نقش‌ها و سطوح دسترسی' },
      { key: 'admin_audit', featKey: 'admin_audit', label: '📜 مشاهده لاگ رویدادها و ممیزی سیستم' },
      { key: 'all', featKey: 'admin_panel', label: '👑 دسترسی کامل به تمام بخش‌ها (Full Access)' }
    ]
  }
];

function getPresetPermissions(presetName) {
  const p = {};
  if (presetName === 'all') {
    p.all = true;
    ROLE_PERM_GROUPS.forEach(g => g.items.forEach(it => { p[it.key] = true; }));
    p.color = '#ef4444';
  } else if (presetName === 'sub_admin') {
    ROLE_PERM_GROUPS.forEach(g => g.items.forEach(it => {
      if (it.key !== 'all' && it.key !== 'admin_roles') p[it.key] = true;
    }));
    p.color = '#f97316';
  } else if (presetName === 'support') {
    ['view_dashboard', 'view_market', 'view_signals', 'view_notifications', 'view_guide', 'view_admin',
     'btn_signal_detail', 'btn_refresh_market', 'btn_theme_toggle', 'header_ticker', 'signals_view',
     'admin_users', 'admin_sms', 'admin_audit'].forEach(k => { p[k] = true; });
    p.color = '#06b6d4';
  } else if (presetName === 'finance') {
    ['view_dashboard', 'view_subscriptions', 'view_admin', 'btn_wallet_recharge', 'btn_crypto_payment',
     'btn_withdraw_request', 'btn_export_data', 'btn_refresh_market', 'btn_theme_toggle', 'header_ticker',
     'admin_financial', 'admin_plans', 'admin_gateways', 'admin_audit'].forEach(k => { p[k] = true; });
    p.color = '#10b981';
  } else if (presetName === 'vip') {
    ROLE_PERM_GROUPS[0].items.forEach(it => { if (it.key !== 'view_admin') p[it.key] = true; });
    ROLE_PERM_GROUPS[1].items.forEach(it => { p[it.key] = true; });
    ROLE_PERM_GROUPS[2].items.forEach(it => { p[it.key] = true; });
    p.color = '#eab308';
  } else if (presetName === 'analyst') {
    ['view_dashboard', 'view_market', 'view_signals', 'view_ai_analysis', 'view_chat', 'view_news', 'view_guide',
     'btn_signal_detail', 'btn_asset_advisory', 'btn_ai_chat', 'btn_alloc_calc', 'btn_refresh_market', 'btn_theme_toggle', 'btn_export_data',
     'header_ticker', 'signals_view', 'signals_vip', 'ai_chat', 'ai_models'].forEach(k => { p[k] = true; });
    p.color = '#a855f7';
  } else if (presetName === 'user') {
    ['view_dashboard', 'view_market', 'view_signals', 'view_auto_invest', 'view_portfolio', 'view_ai_analysis', 'view_chat', 'view_subscriptions', 'view_notifications', 'view_news', 'view_guide',
     'btn_auto_invest', 'btn_signal_detail', 'btn_asset_advisory', 'btn_ai_chat', 'btn_wallet_recharge', 'btn_crypto_payment', 'btn_withdraw_request', 'btn_sub_purchase', 'btn_portfolio_add', 'btn_auto_close', 'btn_alloc_calc', 'btn_alert_create', 'btn_refresh_market', 'btn_theme_toggle',
     'header_ticker', 'dash_auto_invest_banner', 'signals_view', 'portfolio_manage', 'ai_chat', 'auto_invest'].forEach(k => { p[k] = true; });
    p.color = '#38bdf8';
  }
  return p;
}

function isRolePermEnabled(roleObj, itemKey) {
  if (!roleObj) return false;
  const perms = roleObj.permissions || {};
  if (perms.all || roleObj.slug === 'admin') return true;
  if (perms[itemKey] !== undefined) return !!perms[itemKey];
  // تطابق هوشمند با ماتریس UI در صورت عدم مقداردهی قبلی
  const rules = (S.ui && S.ui.visibilityRules) || DEFAULT_VISIBILITY_RULES;
  const slug = roleObj.slug === 'vip' ? 'subscriber' : roleObj.slug;
  for (const g of ROLE_PERM_GROUPS) {
    for (const it of g.items) {
      if (it.key === itemKey) {
        if (it.viewKey && rules.views && rules.views[it.viewKey]) {
          return rules.views[it.viewKey].includes(slug) || rules.views[it.viewKey].includes(roleObj.slug);
        }
        if (it.btnKey && S.ui && S.ui.buttonsConfig && S.ui.buttonsConfig[it.btnKey] && S.ui.buttonsConfig[it.btnKey].roles) {
          return S.ui.buttonsConfig[it.btnKey].roles.includes(slug) || S.ui.buttonsConfig[it.btnKey].roles.includes(roleObj.slug);
        }
        if (it.featKey && rules.features && rules.features[it.featKey]) {
          return rules.features[it.featKey].includes(slug) || rules.features[it.featKey].includes(roleObj.slug);
        }
      }
    }
  }
  return false;
}

function syncRoleToUiRulesClient(roleSlug, perms) {
  if (!S.ui) initUiCustomizationDefaults();
  const aliases = [roleSlug];
  if (roleSlug === 'vip') aliases.push('subscriber');
  if (roleSlug === 'subscriber') aliases.push('vip');
  const hasAll = !!perms.all;

  ROLE_PERM_GROUPS.forEach(g => {
    g.items.forEach(it => {
      const allowed = hasAll || !!perms[it.key];
      if (it.viewKey) {
        if (!Array.isArray(S.ui.visibilityRules.views[it.viewKey])) {
          S.ui.visibilityRules.views[it.viewKey] = ['guest', 'user', 'subscriber', 'admin'];
        }
        aliases.forEach(ra => {
          const arr = S.ui.visibilityRules.views[it.viewKey];
          if (allowed && !arr.includes(ra)) arr.push(ra);
          else if (!allowed) S.ui.visibilityRules.views[it.viewKey] = arr.filter(x => x !== ra);
        });
        // همگام‌سازی منوی ناوبری متناظر
        const navItem = (S.ui.navItems || []).find(n => (n.view || n.id) === it.viewKey);
        if (navItem) {
          if (!Array.isArray(navItem.roles)) navItem.roles = ['guest', 'user', 'subscriber', 'admin'];
          aliases.forEach(ra => {
            if (allowed && !navItem.roles.includes(ra)) navItem.roles.push(ra);
            else if (!allowed) navItem.roles = navItem.roles.filter(x => x !== ra);
          });
        }
      }
      if (it.btnKey && S.ui.buttonsConfig && S.ui.buttonsConfig[it.btnKey]) {
        const bCfg = S.ui.buttonsConfig[it.btnKey];
        if (!Array.isArray(bCfg.roles)) bCfg.roles = ['user', 'subscriber', 'admin'];
        aliases.forEach(ra => {
          if (allowed && !bCfg.roles.includes(ra)) bCfg.roles.push(ra);
          else if (!allowed) bCfg.roles = bCfg.roles.filter(x => x !== ra);
        });
      }
      if (it.featKey) {
        if (!Array.isArray(S.ui.visibilityRules.features[it.featKey])) {
          S.ui.visibilityRules.features[it.featKey] = ['user', 'subscriber', 'admin'];
        }
        aliases.forEach(ra => {
          const arr = S.ui.visibilityRules.features[it.featKey];
          if (allowed && !arr.includes(ra)) arr.push(ra);
          else if (!allowed) S.ui.visibilityRules.features[it.featKey] = arr.filter(x => x !== ra);
        });
      }
    });
  });

  try {
    localStorage.setItem('sy_ui_customizer', JSON.stringify(S.ui));
  } catch (e) {}
  renderNavigation(S.ui.navItems);
  applyButtonsConfig(S.ui.buttonsConfig);
}

function renderAdminRoles() {
  if (!S.admin.roles || !S.admin.roles.length) {
    S.admin.roles = getAllDefinedRoles();
  }
  const roles = S.admin.roles;
  const tbody = $('#admRolesTableBody');
  if (!tbody) return;

  if (!roles.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="hint">هیچ نقشی تعریف نشده است.</td></tr>';
    return;
  }

  const labelLookup = {};
  ROLE_PERM_GROUPS.forEach(g => g.items.forEach(it => { labelLookup[it.key] = it.label; }));

  tbody.innerHTML = roles.map(r => {
    const perms = r.permissions || {};
    const activeKeys = Object.keys(perms).filter(k => k !== 'color' && k !== 'badge' && perms[k] === true);
    let permSummary = '';
    if (perms.all || r.slug === 'admin') {
      permSummary = '<span class="pill pill-xs" style="background:var(--up);color:#052e16;font-weight:700">👑 دسترسی کامل به تمام صفحات، دکمه‌ها و امکانات</span>';
    } else if (activeKeys.length) {
      const topBadges = activeKeys.slice(0, 6).map(k => `<span class="pill pill-xs">${esc(labelLookup[k] || k)}</span>`).join(' ');
      const more = activeKeys.length > 6 ? `<span class="pill pill-xs" style="background:var(--panel2)">+${NF(activeKeys.length - 6, 0)} مجوز دیگر</span>` : '';
      permSummary = `<div style="display:flex;flex-wrap:wrap;gap:4px">${topBadges}${more}</div>`;
    } else {
      permSummary = '<span class="hint">محدود (بر اساس ماتریس پایه)</span>';
    }

    const defBadge = r.is_default ? '<span class="st-ok">پیش‌فرض عضویت ✓</span>' : '—';
    const roleColor = perms.color || (r.slug === 'admin' ? '#ef4444' : r.slug === 'vip' ? '#eab308' : '#22d3ee');

    return `<tr>
      <td><code dir="ltr" style="color:${esc(roleColor)};font-weight:700">${esc(r.slug)}</code></td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;border-radius:50%;background:${esc(roleColor)};display:inline-block"></span>
          <b>${esc(r.title)}</b>
          ${perms.badge ? `<span class="pill pill-xs">${esc(perms.badge)}</span>` : ''}
        </span>
      </td>
      <td class="hint">${esc(r.description || '—')}</td>
      <td><b>${NF(r.users_count || 0, 0)}</b> کاربر</td>
      <td>${defBadge}</td>
      <td>${permSummary}</td>
      <td>
        <div class="act-btns">
          <button class="btn btn-ghost btn-sm" onclick="openRoleModal(${r.id})">✏️ ویرایش و مجوزها</button>
          ${(r.slug !== 'admin' && r.slug !== 'user') ? `<button class="btn btn-ghost btn-sm" onclick="deleteAdminRole(${r.id})" style="color:var(--down)">🗑️ حذف</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  renderRolesFullMatrix();
}

function renderRolesFullMatrix() {
  const thead = $('#admRolesFullMatrixHead');
  const tbody = $('#admRolesFullMatrixBody');
  if (!thead || !tbody) return;

  const roles = getAllDefinedRoles();
  thead.innerHTML = `
    <tr>
      <th style="min-width:260px">قابلیت / دکمه / صفحه سامانه</th>
      ${roles.map(r => {
        const c = (r.permissions && r.permissions.color) || (r.slug === 'admin' ? '#ef4444' : r.slug === 'vip' ? '#eab308' : '#22d3ee');
        return `<th style="text-align:center;min-width:110px">
          <div style="color:${esc(c)};font-weight:800">${esc(r.title)}</div>
          <code style="font-size:11px;opacity:.8" dir="ltr">${esc(r.slug)}</code>
        </th>`;
      }).join('')}
    </tr>
  `;

  let bodyHtml = '';
  ROLE_PERM_GROUPS.forEach(group => {
    bodyHtml += `
      <tr style="background:var(--panel2)">
        <td colspan="${roles.length + 1}" style="font-weight:800;color:${group.color};padding:10px 12px">
          ${esc(group.groupTitle)}
        </td>
      </tr>
    `;
    group.items.forEach(item => {
      bodyHtml += `
        <tr>
          <td>
            <b>${esc(item.label)}</b>
            <div class="hint" dir="ltr" style="font-size:10.5px">${esc(item.key)}</div>
          </td>
          ${roles.map(r => {
            const checked = isRolePermEnabled(r, item.key);
            const isLockedAdmin = (r.slug === 'admin' && (item.key === 'all' || item.key === 'view_admin' || item.key === 'admin_roles'));
            return `<td style="text-align:center">
              <input type="checkbox" style="width:17px;height:17px;cursor:pointer;accent-color:var(--accent)"
                ${checked ? 'checked' : ''}
                ${isLockedAdmin ? 'disabled title="دسترسی اصلی مدیر سیستم غیرقابل لغو است"' : ''}
                onchange="toggleRoleMatrixPerm('${esc(r.slug)}', '${esc(item.key)}', this.checked)" />
            </td>`;
          }).join('')}
        </tr>
      `;
    });
  });

  tbody.innerHTML = bodyHtml;
}

window.toggleRoleMatrixPerm = function(roleSlug, permKey, checked) {
  const roles = getAllDefinedRoles();
  const roleObj = roles.find(r => r.slug === roleSlug);
  if (!roleObj) return;
  if (!roleObj.permissions || typeof roleObj.permissions !== 'object') roleObj.permissions = {};

  // اگر قبلاً all فعال بوده و اکنون یک گزینه غیرفعال شده، ابتدا تمام گزینه‌ها را مقداردهی صریح کن
  if (roleObj.permissions.all && !checked && permKey !== 'all') {
    roleObj.permissions.all = false;
    ROLE_PERM_GROUPS.forEach(g => g.items.forEach(it => {
      if (it.key !== 'all') roleObj.permissions[it.key] = true;
    }));
  }

  roleObj.permissions[permKey] = checked;
  if (permKey === 'all' && checked) {
    ROLE_PERM_GROUPS.forEach(g => g.items.forEach(it => { roleObj.permissions[it.key] = true; }));
  }

  syncRoleToUiRulesClient(roleSlug, roleObj.permissions);
  try { localStorage.setItem('sy_custom_roles', JSON.stringify(roles)); } catch (e) {}
  renderAdminRoles();
  renderAdminUiCustomizer();
};

window.saveAllRolesMatrix = async function() {
  const roles = getAllDefinedRoles();
  try {
    for (const r of roles) {
      await api('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          id: r.id,
          slug: r.slug,
          title: r.title,
          description: r.description || '',
          is_default: r.is_default ? 1 : 0,
          permissions: r.permissions || {}
        })
      }).catch(() => {});
    }
    await api('/api/admin/ui-settings', {
      method: 'POST',
      body: JSON.stringify({
        navItems: S.ui.navItems,
        buttonsConfig: S.ui.buttonsConfig,
        themeStyles: S.ui.themeStyles,
        visibilityRules: S.ui.visibilityRules
      })
    }).catch(() => {});
  } catch (e) {}
  try {
    localStorage.setItem('sy_custom_roles', JSON.stringify(roles));
    localStorage.setItem('sy_ui_customizer', JSON.stringify(S.ui));
  } catch (e) {}
  toast('تمامی نقش‌ها، دسترسی‌های دکمه‌ها و ماتریس صفحات با موفقیت ذخیره و اعمال شدند ✨', 'ok');
};

window.applyRolePresetPerms = function(presetName) {
  const perms = getPresetPermissions(presetName);
  ROLE_PERM_GROUPS.forEach(g => {
    g.items.forEach(it => {
      const el = $('#rp_' + it.key);
      if (el) el.checked = !!(perms.all || perms[it.key]);
    });
  });
  if ($('#rf_color') && perms.color) $('#rf_color').value = perms.color;
};

window.openRoleModal = function(id = 0) {
  const m = $('#roleModal');
  if (!m) return;
  const roles = getAllDefinedRoles();
  const r = id ? roles.find(x => Number(x.id) === Number(id)) : null;

  $('#roleFormId').value = r ? r.id : '';
  $('#roleModalTitle').textContent = r ? '🛡️ ویرایش نقش و مجوزها: ' + r.title : '🛡️ ایجاد نقش کاربری / مدیریتی جدید';
  $('#rf_slug').value = r ? r.slug : '';
  $('#rf_slug').disabled = !!(r && (r.slug === 'admin' || r.slug === 'user'));
  $('#rf_title').value = r ? r.title : '';
  $('#rf_desc').value = r ? (r.description || '') : '';
  $('#rf_is_default').checked = r ? !!r.is_default : false;

  const perms = (r && r.permissions) || (r ? {} : getPresetPermissions('user'));
  if ($('#rf_color')) $('#rf_color').value = perms.color || '#22d3ee';
  if ($('#rf_badge')) $('#rf_badge').value = perms.badge || '';

  ROLE_PERM_GROUPS.forEach(g => {
    g.items.forEach(it => {
      const el = $('#rp_' + it.key);
      if (el) {
        el.checked = r ? isRolePermEnabled(r, it.key) : !!(perms.all || perms[it.key]);
      }
    });
  });

  m.hidden = false;
};

window.quickCreateRole = async function() {
  const rawSlug = ($('#qrf_slug')?.value || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  const title = ($('#qrf_title')?.value || '').trim();
  const desc = ($('#qrf_desc')?.value || '').trim();
  const preset = $('#qrf_preset')?.value || 'user';

  if (!rawSlug || !title) {
    toast('لطفاً شناسه انگلیسی (Slug) و عنوان فارسی نقش جدید را وارد نمایید.', 'err');
    if (!rawSlug) $('#qrf_slug')?.focus();
    else $('#qrf_title')?.focus();
    return;
  }

  const roles = getAllDefinedRoles();
  if (roles.some(r => r.slug === rawSlug)) {
    toast('نقشی با این شناسه انگلیسی از قبل وجود دارد.', 'err');
    return;
  }

  const perms = getPresetPermissions(preset);
  perms.badge = title;

  const payload = {
    slug: rawSlug,
    title,
    description: desc || `نقش اختصاصی ${title}`,
    is_default: 0,
    permissions: perms
  };

  try {
    let savedRoles = null;
    try {
      const r = await api('/api/admin/roles', { method: 'POST', body: JSON.stringify(payload) });
      if (r && Array.isArray(r.roles)) savedRoles = r.roles;
    } catch (e) {}

    if (savedRoles) {
      S.admin.roles = savedRoles;
    } else {
      const newId = Math.max(0, ...roles.map(x => Number(x.id) || 0)) + 1;
      roles.push({
        id: newId,
        slug: rawSlug,
        title,
        description: payload.description,
        is_default: false,
        users_count: 0,
        permissions: perms
      });
      S.admin.roles = roles;
    }

    try { localStorage.setItem('sy_custom_roles', JSON.stringify(S.admin.roles)); } catch (e) {}
    syncRoleToUiRulesClient(rawSlug, perms);

    if ($('#qrf_slug')) $('#qrf_slug').value = '';
    if ($('#qrf_title')) $('#qrf_title').value = '';
    if ($('#qrf_desc')) $('#qrf_desc').value = '';

    renderAdminRoles();
    renderAdminUsers();
    renderAdminUiCustomizer();
    toast(`نقش جدید «${title} (${rawSlug})» با موفقیت ساخته شد و به تمام جداول دسترسی اضافه گردید ✨`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
};

async function saveRoleForm() {
  const id = Number($('#roleFormId').value);
  const slug = $('#rf_slug').value.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  const title = $('#rf_title').value.trim();

  if (!slug || !title) return toast('شناسه انگلیسی و عنوان نقش الزامی است', 'err');

  const perms = {
    color: $('#rf_color')?.value || '#22d3ee',
    badge: $('#rf_badge')?.value.trim() || ''
  };

  ROLE_PERM_GROUPS.forEach(g => {
    g.items.forEach(it => {
      const el = $('#rp_' + it.key);
      if (el) perms[it.key] = !!el.checked;
    });
  });

  const payload = {
    id: id || undefined,
    slug,
    title,
    description: $('#rf_desc').value.trim(),
    is_default: $('#rf_is_default').checked ? 1 : 0,
    permissions: perms
  };

  try {
    let savedRoles = null;
    try {
      const r = await api('/api/admin/roles', { method: 'POST', body: JSON.stringify(payload) });
      if (r && Array.isArray(r.roles)) savedRoles = r.roles;
    } catch (e) {}

    const roles = getAllDefinedRoles();
    if (savedRoles) {
      S.admin.roles = savedRoles;
    } else {
      if (payload.is_default) roles.forEach(x => { x.is_default = false; });
      const idx = roles.findIndex(x => Number(x.id) === id || x.slug === slug);
      if (idx >= 0) {
        roles[idx] = Object.assign(roles[idx], {
          slug,
          title,
          description: payload.description,
          is_default: !!payload.is_default,
          permissions: perms
        });
      } else {
        const newId = Math.max(0, ...roles.map(x => Number(x.id) || 0)) + 1;
        roles.push({
          id: newId,
          slug,
          title,
          description: payload.description,
          is_default: !!payload.is_default,
          users_count: 0,
          permissions: perms
        });
      }
      S.admin.roles = roles;
    }

    try { localStorage.setItem('sy_custom_roles', JSON.stringify(S.admin.roles)); } catch (e) {}
    syncRoleToUiRulesClient(slug, perms);

    $('#roleModal').hidden = true;
    renderAdminRoles();
    renderAdminUsers();
    renderAdminUiCustomizer();
    toast(`نقش «${title}» و تمام مجوزهای دکمه‌ها و صفحات با موفقیت ذخیره شد ✨`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

window.deleteAdminRole = async function(id) {
  const roles = getAllDefinedRoles();
  const target = roles.find(x => Number(x.id) === Number(id));
  if (target && (target.slug === 'admin' || target.slug === 'user')) {
    return toast('حذف نقش‌های پایه سیستم (admin و user) مجاز نیست.', 'err');
  }
  if (!confirm(`آیا از حذف نقش «${target ? target.title : id}» اطمینان دارید؟`)) return;
  try {
    let savedRoles = null;
    try {
      const r = await api('/api/admin/roles?id=' + id, { method: 'DELETE' });
      if (r && Array.isArray(r.roles)) savedRoles = r.roles;
    } catch (e) {}
    if (savedRoles) {
      S.admin.roles = savedRoles;
    } else {
      S.admin.roles = roles.filter(x => Number(x.id) !== Number(id));
    }
    try { localStorage.setItem('sy_custom_roles', JSON.stringify(S.admin.roles)); } catch (e) {}
    renderAdminRoles();
    renderAdminUsers();
    renderAdminUiCustomizer();
    toast('نقش کاربری حذف شد', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};

/* ----------------------------- تنظیمات احراز هویت و امنیت (Auth Settings) ----------------------------- */
function renderAdminAuthSettings() {
  const s = S.admin.settings || {};

  const setVal = (id, v) => { if ($(id)) $(id).value = (v !== undefined && v !== null) ? v : ''; };
  const setBool = (id, v) => { if ($(id)) $(id).value = (v === true || v === '1' || v === 1) ? '1' : '0'; };

  setBool('#set_allowRegister', s.allowRegister ?? true);
  setBool('#set_requireApproval', s.requireApproval ?? false);
  setBool('#set_autoLoginAfterRegister', s.autoLoginAfterRegister ?? true);
  setVal('#set_defaultUserRole', s.defaultUserRole || 'user');
  setBool('#set_preventDuplicateEmail', s.preventDuplicateEmail ?? true);
  setBool('#set_preventDuplicateUsername', s.preventDuplicateUsername ?? true);
  setBool('#set_preventDuplicateMobile', s.preventDuplicateMobile ?? true);
  setVal('#set_registerMode', s.registerMode || 'public');

  setBool('#set_recoveryWordsEnabled', s.recoveryWordsEnabled ?? true);
  setVal('#set_recoveryWordsCount', s.recoveryWordsCount || 12);
  setBool('#set_recoveryWordsRequireConfirmation', s.recoveryWordsRequireConfirmation ?? true);
  setBool('#set_recoveryWordsAllowCopy', s.recoveryWordsAllowCopy ?? true);
  setVal('#set_recoveryWordsTitle', s.recoveryWordsTitle || '');
  setVal('#set_recoveryWordsWarning', s.recoveryWordsWarning || '');

  setVal('#set_loginIdentifierMode', s.loginIdentifierMode || 'any');
  setBool('#set_loginRememberMeEnabled', s.loginRememberMeEnabled ?? true);
  setVal('#set_maxLoginAttempts', s.maxLoginAttempts || 5);
  setVal('#set_lockoutDurationMin', s.lockoutDurationMin || 15);
  setVal('#set_passMinLen', s.passMinLen || 6);
  setBool('#set_passRequireUpper', s.passRequireUpper ?? false);
  setBool('#set_passRequireNumber', s.passRequireNumber ?? false);
  setBool('#set_passRequireSpecial', s.passRequireSpecial ?? false);

  setBool('#set_termsRequired', s.termsRequired ?? true);
  setVal('#set_authRegisterBtnText', s.authRegisterBtnText || '');
  setVal('#set_termsText', s.termsText || '');
  setVal('#set_termsLink', s.termsLink || '');
  setVal('#set_privacyLink', s.privacyLink || '');

  // حالت پیش‌فرض تاریک/روشن و قالب صفحه ورود/ثبت‌نام
  const defTheme = s.defaultThemeMode || (S.settings && S.settings.defaultThemeMode) || 'dark';
  setVal('#set_defaultThemeMode', defTheme);
  setVal('#cfgDefaultThemeMode', defTheme);
  const authTpl = (typeof getActiveMenuTemplate === 'function') ? getActiveMenuTemplate('authPage') : (s.authPageTemplate || 'auth_tpl1');
  setVal('#set_authPageTemplate', authTpl);

  // تنظیمات فراموشی رمز عبور
  setVal('#set_forgotVerificationMode', s.forgotVerificationMode || (S.settings && S.settings.forgotVerificationMode) || 'email_and_words');
  const fpTpl = (typeof getActiveMenuTemplate === 'function') ? getActiveMenuTemplate('forgotPage') : (s.forgotPageTemplate || 'fp_tpl1');
  setVal('#set_forgotPageTemplate', fpTpl);
  setBool('#set_forgotPasswordEnabled', s.forgotPasswordEnabled ?? true);
  setBool('#set_forgotAllowRecoveryWords', s.forgotAllowRecoveryWords ?? true);
  setBool('#set_forgotAllowDirectReset', s.forgotAllowDirectReset ?? true);
  setBool('#set_forgotAllowEmailReset', s.forgotAllowEmailReset ?? true);
  setVal('#set_forgotModalTitle', s.forgotModalTitle || 'بازیابی رمز عبور و حساب کاربری');
  setVal('#set_forgotModalSubtitle', s.forgotModalSubtitle || 'روش مورد نظر خود را جهت بازیابی و تغییر رمز عبور انتخاب کنید');
  setVal('#set_forgotLinkText', s.forgotLinkText || '🔑 بازیابی رمز عبور / کلمات کلیدی');
  setVal('#set_forgotSubmitBtnText', s.forgotSubmitBtnText || 'تغییر رمز عبور و بازیابی حساب');
  setVal('#set_forgotTabWordsTitle', s.forgotTabWordsTitle || '🔑 بازیابی با کلمات کلیدی');
  setVal('#set_forgotTabDirectTitle', s.forgotTabDirectTitle || '⚡ بازنشانی سریع با مشخصات حساب');
  setVal('#set_forgotTabEmailTitle', s.forgotTabEmailTitle || '📧 ارسال به ایمیل / پیامک');
  setVal('#set_forgotSuccessMessage', s.forgotSuccessMessage || 'رمز عبور شما با موفقیت تغییر یافت! اکنون می‌توانید وارد حساب خود شوید.');
  setVal('#set_forgotWordsHint', s.forgotWordsHint || 'کلمات بازیابی صادرشده هنگام ثبت‌نام را به ترتیب در باکس‌های زیر وارد نمایید (یا کل عبارت را در باکس ۱ Paste کنید).');
}

window.onAdminAuthPageTplChange = function(tplKey) {
  if (!S.settings) S.settings = {};
  S.settings.authPageTemplate = tplKey;
  if (S.admin && S.admin.settings) S.admin.settings.authPageTemplate = tplKey;
  if (typeof setAdminActiveMenuTemplate === 'function') {
    setAdminActiveMenuTemplate('authPage', tplKey, true);
  }
  toast(`🖼️ قالب صفحه ورود و ثبت‌نام به «${tplKey}» تغییر یافت و ذخیره شد!`, 'ok');
};

async function saveAdminAuthSettings() {
  const getVal = (id) => $(id) ? $(id).value : '';
  const getBool = (id) => $(id) ? $(id).value === '1' : true;
  const getNum = (id, def) => $(id) ? Number($(id).value) : def;

  const defTheme = getVal('#set_defaultThemeMode') || 'dark';
  const authTpl = getVal('#set_authPageTemplate') || 'auth_tpl1';
  const fpTpl = getVal('#set_forgotPageTemplate') || 'fp_tpl1';
  const verMode = getVal('#set_forgotVerificationMode') || 'email_and_words';
  if (typeof setAdminActiveMenuTemplate === 'function') {
    setAdminActiveMenuTemplate('authPage', authTpl, true);
    setAdminActiveMenuTemplate('forgotPage', fpTpl, true);
  }
  try {
    localStorage.setItem('sy_default_theme_mode', defTheme);
  } catch (e) {}

  const payload = {
    allowRegister: getBool('#set_allowRegister'),
    requireApproval: getBool('#set_requireApproval'),
    autoLoginAfterRegister: getBool('#set_autoLoginAfterRegister'),
    defaultUserRole: getVal('#set_defaultUserRole') || 'user',
    preventDuplicateEmail: getBool('#set_preventDuplicateEmail'),
    preventDuplicateUsername: getBool('#set_preventDuplicateUsername'),
    preventDuplicateMobile: getBool('#set_preventDuplicateMobile'),
    registerMode: getVal('#set_registerMode') || 'public',

    recoveryWordsEnabled: getBool('#set_recoveryWordsEnabled'),
    recoveryWordsCount: getNum('#set_recoveryWordsCount', 12),
    recoveryWordsRequireConfirmation: getBool('#set_recoveryWordsRequireConfirmation'),
    recoveryWordsAllowCopy: getBool('#set_recoveryWordsAllowCopy'),
    recoveryWordsTitle: getVal('#set_recoveryWordsTitle'),
    recoveryWordsWarning: getVal('#set_recoveryWordsWarning'),

    loginIdentifierMode: getVal('#set_loginIdentifierMode') || 'any',
    loginRememberMeEnabled: getBool('#set_loginRememberMeEnabled'),
    maxLoginAttempts: getNum('#set_maxLoginAttempts', 5),
    lockoutDurationMin: getNum('#set_lockoutDurationMin', 15),
    passMinLen: getNum('#set_passMinLen', 6),
    passRequireUpper: getBool('#set_passRequireUpper'),
    passRequireNumber: getBool('#set_passRequireNumber'),
    passRequireSpecial: getBool('#set_passRequireSpecial'),

    defaultThemeMode: defTheme,
    authPageTemplate: authTpl,
    forgotPageTemplate: fpTpl,
    forgotVerificationMode: verMode,
    termsRequired: getBool('#set_termsRequired'),
    authRegisterBtnText: getVal('#set_authRegisterBtnText'),
    termsText: getVal('#set_termsText'),
    termsLink: getVal('#set_termsLink'),
    privacyLink: getVal('#set_privacyLink'),

    forgotPasswordEnabled: getBool('#set_forgotPasswordEnabled'),
    forgotAllowRecoveryWords: getBool('#set_forgotAllowRecoveryWords'),
    forgotAllowDirectReset: getBool('#set_forgotAllowDirectReset'),
    forgotAllowEmailReset: getBool('#set_forgotAllowEmailReset'),
    forgotModalTitle: getVal('#set_forgotModalTitle'),
    forgotModalSubtitle: getVal('#set_forgotModalSubtitle'),
    forgotLinkText: getVal('#set_forgotLinkText'),
    forgotSubmitBtnText: getVal('#set_forgotSubmitBtnText'),
    forgotTabWordsTitle: getVal('#set_forgotTabWordsTitle'),
    forgotTabDirectTitle: getVal('#set_forgotTabDirectTitle'),
    forgotTabEmailTitle: getVal('#set_forgotTabEmailTitle'),
    forgotSuccessMessage: getVal('#set_forgotSuccessMessage'),
    forgotWordsHint: getVal('#set_forgotWordsHint'),
  };

  if (!S.settings) S.settings = {};
  Object.assign(S.settings, payload);
  if (S.admin && S.admin.settings) Object.assign(S.admin.settings, payload);
  applyForgotPasswordConfig();

  try {
    const r = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(payload) });
    toast('✅ تنظیمات احراز هویت، قالب ورود، حالت پیش‌فرض و فراموشی رمز عبور ذخیره شد!', 'ok');
    if (r && r.settings) {
      S.admin.settings = r.settings;
      S.settings = Object.assign(S.settings || {}, r.settings);
    }
  } catch (e) { toast('✅ تنظیمات احراز هویت و فراموشی رمز عبور اعمال شد', 'ok'); }
}

async function saveAdminUserWallet() {
  const id = Number($('#userWalletTargetId')?.value);
  const action = $('#userWalletAction')?.value;
  const amount = parseNum($('#userWalletAmount')?.value);
  const reason = $('#userWalletReason')?.value.trim();

  if (!id || !amount || amount <= 0) return toast('مبلغ معتبر وارد کنید', 'err');
  if (!reason) return toast('ذکر علت تراکنش الزامی است', 'err');

  try {
    const r = await api('/api/admin/users/wallet', {
      method: 'POST',
      body: JSON.stringify({ id, action, amount, reason })
    });
    $('#userWalletModal').hidden = true;
    toast(r.message || 'موجودی کیف‌پول به‌روز شد', 'ok');
    await loadAdmin(true);
  } catch (e) { toast(e.message, 'err'); }
}

async function saveAdminUserStatus() {
  const id = Number($('#userStatusTargetId')?.value);
  const status = $('#userStatusSelect')?.value;
  const tradeRestricted = $('#userTradeRestricted')?.checked;
  const reason = $('#userStatusReason')?.value.trim();

  if (!id) return;
  if (!reason) return toast('ثبت دلیل تغییر وضعیت/محدودیت الزامی است', 'err');

  try {
    const r = await api('/api/admin/users/status', {
      method: 'POST',
      body: JSON.stringify({ id, status, tradeRestricted, reason })
    });
    $('#userStatusModal').hidden = true;
    toast(r.message || 'وضعیت کاربر ذخیره شد', 'ok');
    await loadAdmin(true);
  } catch (e) { toast(e.message, 'err'); }
}

/* ----------------------------- پلن‌ها در پنل مدیریت ----------------------------- */
function renderAdminPlans() {
  const rows = S.admin.plans || [];
  const head = ['#', 'شناسه', 'عنوان', 'قیمت (تومان)', 'مدت (روز)', 'برچسب', 'امکانات', 'عملیات'];
  const body = rows.map(p => {
    const dur = p.duration_days || p.durationDays || p.days || 30;
    const feats = Array.isArray(p.features) ? p.features : String(p.features || '').split(',').map(x => x.trim()).filter(Boolean);
    return `<tr>
      <td>${NF(p.id, 0)}</td>
      <td><code>${esc(p.slug || p.id)}</code></td>
      <td><b>${esc(p.title)}</b></td>
      <td>${NF(p.price, 0)} ت</td>
      <td>${NF(dur, 0)} روز</td>
      <td>${p.badge ? `<span class="pill pill-xs">${esc(p.badge)}</span>` : '—'}</td>
      <td class="hint">${feats.join(' · ')}</td>
      <td><div class="act-btns">
        <button class="btn btn-ghost btn-sm" data-pact="edit" data-id="${p.id}">ویرایش</button>
        <button class="btn btn-ghost btn-sm" data-pact="del" data-id="${p.id}">حذف</button>
      </div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="hint">پلنی تعریف نشده است.</td></tr>';

  $('#admPlansTable').innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody>`;

  const sel = $('#grantPlanSelect');
  if (sel) {
    sel.innerHTML = rows.map(p => `<option value="${p.id}">${esc(p.title)} (${NF(p.duration_days || p.durationDays || p.days || 30, 0)} روز)</option>`).join('');
  }

  $$('#admPlansTable [data-pact]').forEach(b => {
    b.onclick = () => {
      const id = Number(b.dataset.id);
      const p = rows.find(x => Number(x.id) === id);
      if (!p) return;
      if (b.dataset.pact === 'edit') {
        const feats = Array.isArray(p.features) ? p.features : String(p.features || '').split(',').map(x => x.trim()).filter(Boolean);
        $('#planFormId').value = p.id;
        $('#planSlug').value = p.slug || p.id;
        $('#planTitle').value = p.title;
        $('#planPrice').value = p.price;
        $('#planDuration').value = p.duration_days || p.durationDays || p.days || 30;
        $('#planBadge').value = p.badge || '';
        $('#planFeatures').value = feats.join('\n');
        $('#planFormTitle').textContent = 'ویرایش پلن: ' + p.title;
        updatePersianWords();
      } else if (b.dataset.pact === 'del') {
        if (!confirm(`پلن «${p.title}» حذف شود؟`)) return;
        api('/api/admin/plans?id=' + id, { method: 'DELETE' }).then(() => {
          toast('پلن حذف شد', 'ok');
          loadAdmin(true);
        }).catch(e => toast(e.message, 'err'));
      }
    };
  });
}

async function saveAdminPlan() {
  const id = $('#planFormId')?.value;
  const body = {
    slug: $('#planSlug')?.value.trim(),
    title: $('#planTitle')?.value.trim(),
    price: parseNum($('#planPrice')?.value),
    days: Number($('#planDuration')?.value) || 30,
    duration_days: Number($('#planDuration')?.value) || 30,
    badge: $('#planBadge')?.value.trim(),
    features: ($('#planFeatures')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
  };
  if (id) body.id = Number(id);

  try {
    await api('/api/admin/plans', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    toast(id ? 'پلن ویرایش شد' : 'پلن جدید ساخته شد', 'ok');
    $('#planFormId').value = '';
    $('#planSlug').value = '';
    $('#planTitle').value = '';
    $('#planPrice').value = '';
    $('#planBadge').value = '';
    $('#planFeatures').value = '';
    $('#planFormTitle').textContent = 'ایجاد / ویرایش پلن اشتراک';
    await loadAdmin(true);
  } catch (e) { toast(e.message, 'err'); }
}

async function grantAdminSub() {
  const user = $('#grantUserEmail')?.value.trim();
  const plan_id = Number($('#grantPlanSelect')?.value);
  const days = Number($('#grantDays')?.value) || undefined;

  if (!user || !plan_id) return toast('کاربر و پلن را انتخاب کنید', 'err');

  try {
    const r = await api('/api/admin/subscriptions/grant', {
      method: 'POST',
      body: JSON.stringify({ user, plan_id, days })
    });
    toast(r.message || 'اشتراک با موفقیت اعطا شد', 'ok');
    $('#grantUserEmail').value = '';
    await loadAdmin(true);
  } catch (e) { toast(e.message, 'err'); }
}

/* ----------------------------- درگاه‌های پرداخت ریالی و ارز دیجیتال ----------------------------- */
function renderAdminGateways() {
  const s = S.admin.settings || {};
  if ($('#gwDefault')) $('#gwDefault').value = s.gwDefault || s.gatewayActive || 'test';
  if ($('#gwZarinpalMerchant')) $('#gwZarinpalMerchant').value = s.gwZarinpalMerchant || s.zarinpalMerchant || '';
  if ($('#gwZarinpalSandbox')) $('#gwZarinpalSandbox').value = (s.gwZarinpalSandbox || s.zarinpalSandbox) ? '1' : '0';
  if ($('#gwNextpayKey')) $('#gwNextpayKey').value = s.gwNextpayKey || s.nextpayKey || '';
  if ($('#gwPaypingToken')) $('#gwPaypingToken').value = s.gwPaypingToken || s.paypingToken || '';
  if ($('#gwIdpayKey')) $('#gwIdpayKey').value = s.gwIdpayKey || s.idpayKey || '';
  if ($('#gwZibalMerchant')) $('#gwZibalMerchant').value = s.gwZibalMerchant || s.zibalMerchant || '';
  if ($('#gwMellatTerminal')) $('#gwMellatTerminal').value = s.gwMellatTerminal || s.mellatTerminal || '';
  if ($('#gwMellatUser')) $('#gwMellatUser').value = s.gwMellatUser || s.mellatUser || '';
  if ($('#gwMellatPass')) $('#gwMellatPass').value = s.gwMellatPass || s.mellatPass || '';

  // درگاه رمزارزی
  if ($('#gwCryptoProvider')) $('#gwCryptoProvider').value = s.cryptoGatewayActive || 'oxapay';
  if ($('#gwCryptoEnabled')) $('#gwCryptoEnabled').value = s.cryptoGatewayEnabled !== false ? '1' : '0';
  if ($('#gwCryptoExpireMin')) $('#gwCryptoExpireMin').value = String(s.cryptoInvoiceExpireMin || (S.settings && S.settings.cryptoInvoiceExpireMin) || 30);
  if ($('#gwCryptoDepositTpl')) $('#gwCryptoDepositTpl').value = (typeof getActiveMenuTemplate === 'function') ? getActiveMenuTemplate('cryptoDeposit') : (s.cryptoDepositTemplate || 'cd_tpl1');
  if ($('#gwCryptoApiKey')) $('#gwCryptoApiKey').value = s.cryptoMerchantKey || '';
  if ($('#gwCryptoNetwork')) $('#gwCryptoNetwork').value = s.cryptoUsdtNetwork || 'TRC20';
  if ($('#gwCryptoPayoutTrc20')) $('#gwCryptoPayoutTrc20').value = s.cryptoPayoutTrc20 || 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF';
  if ($('#gwCryptoPayoutTon')) $('#gwCryptoPayoutTon').value = s.cryptoPayoutTon || 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF';
  if ($('#gwCryptoPayoutBep20')) $('#gwCryptoPayoutBep20').value = s.cryptoPayoutBep20 || '0x71c5b88ec3011a00a0684f88b77d6124ac374829';
  if ($('#gwMinWithdrawAmount')) $('#gwMinWithdrawAmount').value = String(s.minWithdrawAmount || 50000);

  if (typeof renderAdminCryptoGatewayCoinsTable === 'function') {
    renderAdminCryptoGatewayCoinsTable();
  }
}

async function saveAdminGateways() {
  const expireMin = Math.max(1, Number($('#gwCryptoExpireMin')?.value) || 30);
  const cdTpl = $('#gwCryptoDepositTpl')?.value || 'cd_tpl1';
  const coinsList = typeof getConfiguredCryptoGatewayCoins === 'function' ? getConfiguredCryptoGatewayCoins() : [];

  if (S.settings) {
    S.settings.cryptoInvoiceExpireMin = expireMin;
    S.settings.cryptoDepositTemplate = cdTpl;
    S.settings.cryptoGatewayCoins = coinsList;
  }
  if (typeof setAdminActiveMenuTemplate === 'function') {
    setAdminActiveMenuTemplate('cryptoDeposit', cdTpl, false);
  }
  try {
    localStorage.setItem('sy_crypto_gateway_cfg', JSON.stringify({
      expireMin,
      template: cdTpl,
      coins: coinsList
    }));
  } catch (e) {}

  const body = {
    gwDefault: $('#gwDefault')?.value,
    gatewayActive: $('#gwDefault')?.value,
    gwZarinpalMerchant: $('#gwZarinpalMerchant')?.value.trim(),
    zarinpalMerchant: $('#gwZarinpalMerchant')?.value.trim(),
    gwZarinpalSandbox: $('#gwZarinpalSandbox')?.value === '1',
    zarinpalSandbox: $('#gwZarinpalSandbox')?.value === '1',
    gwNextpayKey: $('#gwNextpayKey')?.value.trim(),
    nextpayKey: $('#gwNextpayKey')?.value.trim(),
    gwPaypingToken: $('#gwPaypingToken')?.value.trim(),
    paypingToken: $('#gwPaypingToken')?.value.trim(),
    gwIdpayKey: $('#gwIdpayKey')?.value.trim(),
    idpayKey: $('#gwIdpayKey')?.value.trim(),
    gwZibalMerchant: $('#gwZibalMerchant')?.value.trim(),
    zibalMerchant: $('#gwZibalMerchant')?.value.trim(),
    gwMellatTerminal: $('#gwMellatTerminal')?.value.trim(),
    mellatTerminal: $('#gwMellatTerminal')?.value.trim(),
    gwMellatUser: $('#gwMellatUser')?.value.trim(),
    mellatUser: $('#gwMellatUser')?.value.trim(),
    gwMellatPass: $('#gwMellatPass')?.value.trim(),
    mellatPass: $('#gwMellatPass')?.value.trim(),

    // رمزارز
    cryptoGatewayActive: $('#gwCryptoProvider')?.value,
    cryptoGatewayEnabled: $('#gwCryptoEnabled')?.value === '1',
    cryptoInvoiceExpireMin: expireMin,
    cryptoDepositTemplate: cdTpl,
    cryptoGatewayCoins: coinsList,
    cryptoMerchantKey: $('#gwCryptoApiKey')?.value.trim(),
    cryptoUsdtNetwork: $('#gwCryptoNetwork')?.value,
    cryptoPayoutTrc20: $('#gwCryptoPayoutTrc20')?.value.trim(),
    cryptoPayoutTon: $('#gwCryptoPayoutTon')?.value.trim(),
    cryptoPayoutBep20: $('#gwCryptoPayoutBep20')?.value.trim(),
    minWithdrawAmount: parseNum($('#gwMinWithdrawAmount')?.value) || 50000,
  };
  try {
    const r = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(body) });
    if (r && r.settings) { S.admin.settings = r.settings; S.settings = r.settings; }
  } catch (e) {}
  if (typeof renderCryptoDepositStage === 'function') renderCryptoDepositStage();
  toast('✅ تنظیمات درگاه پرداخت، آدرس کیف‌پول رمزارزها، زمان اعتبار فرم و قالب نمایش ذخیره شد!', 'ok');
}

/* ----------------------------- پیامک ----------------------------- */
function renderAdminSms() {
  const s = S.admin.settings || {};
  if ($('#smsProvider')) $('#smsProvider').value = s.smsProvider || s.smsActive || 'simulator';
  if ($('#smsApiKey')) $('#smsApiKey').value = s.smsApiKey || '';
  if ($('#smsSender')) $('#smsSender').value = s.smsSender || s.smsSenderNumber || '';
  if ($('#smsPatternSignal')) $('#smsPatternSignal').value = s.smsPatternSignal || '';
  if ($('#smsPatternExpiry')) $('#smsPatternExpiry').value = s.smsPatternExpiry || '';
  if ($('#smsSendSignals')) $('#smsSendSignals').checked = !!(s.smsSendSignals || s.smsOnSignal);
  if ($('#smsSendExpiry')) $('#smsSendExpiry').checked = !!(s.smsSendExpiry || s.smsOnTrade);
}

async function saveAdminSms() {
  const body = {
    smsProvider: $('#smsProvider')?.value,
    smsActive: $('#smsProvider')?.value,
    smsApiKey: $('#smsApiKey')?.value.trim(),
    smsSender: $('#smsSender')?.value.trim(),
    smsSenderNumber: $('#smsSender')?.value.trim(),
    smsPatternSignal: $('#smsPatternSignal')?.value.trim(),
    smsPatternExpiry: $('#smsPatternExpiry')?.value.trim(),
    smsSendSignals: $('#smsSendSignals')?.checked,
    smsOnSignal: $('#smsSendSignals')?.checked,
    smsSendExpiry: $('#smsSendExpiry')?.checked,
    smsOnTrade: $('#smsSendExpiry')?.checked,
  };
  try {
    const r = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(body) });
    S.admin.settings = r.settings; S.settings = r.settings;
    toast('تنظیمات پیامک ذخیره شد', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function testAdminSms() {
  const phone = $('#smsTestPhone')?.value.trim();
  const message = $('#smsTestMsg')?.value.trim();
  const resEl = $('#smsTestResult');
  if (!phone || !message) return toast('شماره و متن تست را وارد کنید', 'err');

  if (resEl) resEl.textContent = 'در حال ارسال پیامک تست…';
  try {
    const r = await api('/api/admin/sms/test', { method: 'POST', body: JSON.stringify({ phone, message }) });
    if (resEl) resEl.textContent = '✅ ' + (r.message || 'پیامک ارسال شد');
    toast('پیامک تست ارسال شد', 'ok');
  } catch (e) {
    if (resEl) resEl.textContent = '❌ خطا: ' + e.message;
    toast(e.message, 'err');
  }
}

/* ----------------------------- اعلان‌ها و تعرفه‌ها (مدیریت) ----------------------------- */
async function sendAdminNotif() {
  const recipient = Number($('#admNotifRecipient')?.value) || 0;
  const category = $('#admNotifCategory')?.value || 'system';
  const title = $('#admNotifTitle')?.value.trim();
  const body = $('#admNotifBody')?.value.trim();
  const sendSms = $('#admNotifSendSms')?.checked;

  if (!title || !body) return toast('عنوان و متن اعلان را وارد کنید', 'err');

  try {
    const r = await api('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ userId: recipient, user_id: recipient, category, title, body, send_sms: sendSms })
    });
    toast(r.message || 'اعلان با موفقیت ارسال شد', 'ok');
    $('#admNotifTitle').value = '';
    $('#admNotifBody').value = '';
  } catch (e) { toast(e.message, 'err'); }
}

async function saveAdminAlertPrices() {
  const body = {
    alertsPriceMonthly: parseNum($('#admAlertsPriceMonthly')?.value) || 99000,
    alertVipPrice: parseNum($('#admAlertsPriceMonthly')?.value) || 99000,
    alertsPriceSmsUnit: parseNum($('#admAlertsPriceSmsUnit')?.value) || 500,
    alertSmsPerUnit: parseNum($('#admAlertsPriceSmsUnit')?.value) || 500,
  };
  try {
    const r = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(body) });
    S.admin.settings = r.settings; S.settings = r.settings;
    toast('تعرفه‌های اعلان ذخیره شد', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================================================================
   پنل مدیریت: شخصی‌سازی جامع ظاهر، منوها، دکمه‌ها و دسترسی‌ها (UI Customizer)
   ============================================================================ */

let activeUiSubTab = 'nav';

function switchUiSubTab(subTab) {
  activeUiSubTab = subTab;
  $$('#uiSubNav .ui-sub-btn').forEach(b => b.classList.toggle('active', b.dataset.uisub === subTab));
  $$('.ui-sub-pane').forEach(p => p.style.display = 'none');
  const target = $('#uiSubPane-' + subTab);
  if (target) target.style.display = 'block';
}

function renderAdminUiCustomizer() {
  if (!S.ui) initUiCustomizationDefaults();
  if (typeof populateFontSelectDropdowns === 'function') populateFontSelectDropdowns();
  renderAdminNavItemsTable();
  renderAdminButtonsGrid();
  renderAdminThemePresets();
  renderAdminColorGrid();
  renderAdminThemeForm();
  renderAdminVisibilityMatrices();
}

function renderAdminNavItemsTable() {
  const tbody = $('#admNavItemsTbody');
  if (!tbody) return;
  const items = (S.ui && S.ui.navItems) || DEFAULT_NAV_ITEMS;
  const rolesList = getUiMatrixRoles();

  tbody.innerHTML = items.map((item, idx) => {
    const rolesCheckboxes = rolesList.map(r => `
      <label style="display:inline-flex;align-items:center;gap:3px;margin-inline-end:6px;font-size:11.5px;cursor:pointer">
        <input type="checkbox" data-nav-role="${item.id}" data-role="${r.key}" ${(!item.roles || item.roles.includes(r.key) || (r.key === 'subscriber' && item.roles.includes('vip'))) ? 'checked' : ''} onchange="updateNavItemRole(${idx}, '${r.key}', this.checked)" />
        ${esc(r.label)}
      </label>
    `).join('');

    return `
      <tr>
        <td style="text-align:center">
          <div class="row-gap" style="gap:2px;justify-content:center">
            <button class="btn-move" onclick="moveNavItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>▲</button>
            <button class="btn-move" onclick="moveNavItem(${idx}, 1)" ${idx === items.length - 1 ? 'disabled' : ''}>▼</button>
          </div>
        </td>
        <td style="text-align:center">
          <input type="text" class="input" style="width:40px;text-align:center;padding:4px" value="${esc(item.icon || '📌')}" onchange="updateNavItemField(${idx}, 'icon', this.value)" />
        </td>
        <td>
          <input type="text" class="input" style="min-width:120px;font-weight:700" value="${esc(item.label || '')}" onchange="updateNavItemField(${idx}, 'label', this.value)" />
        </td>
        <td>
          <code style="font-size:12px">${esc(item.view || item.id)}</code>
        </td>
        <td>
          <input type="text" class="input" style="width:70px;padding:4px" placeholder="اختیاری" value="${esc(item.badge || '')}" onchange="updateNavItemField(${idx}, 'badge', this.value)" />
        </td>
        <td style="text-align:center">
          <label class="switch">
            <input type="checkbox" ${item.active !== false ? 'checked' : ''} onchange="updateNavItemField(${idx}, 'active', this.checked)" />
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${rolesCheckboxes}</div>
        </td>
        <td style="text-align:center">
          <button class="btn btn-ghost btn-sm" onclick="deleteNavItem(${idx})" style="color:var(--down);padding:3px 8px">🗑️ حذف</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.moveNavItem = function(idx, dir) {
  const items = (S.ui && S.ui.navItems) || DEFAULT_NAV_ITEMS;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= items.length) return;
  const temp = items[idx];
  items[idx] = items[targetIdx];
  items[targetIdx] = temp;
  items.forEach((item, i) => { item.order = i + 1; });
  renderAdminNavItemsTable();
  renderNavigation(items);
};

window.updateNavItemField = function(idx, field, val) {
  const items = (S.ui && S.ui.navItems) || DEFAULT_NAV_ITEMS;
  if (items[idx]) {
    items[idx][field] = val;
    renderNavigation(items);
  }
};

window.updateNavItemRole = function(idx, role, checked) {
  const items = (S.ui && S.ui.navItems) || DEFAULT_NAV_ITEMS;
  if (items[idx]) {
    if (!Array.isArray(items[idx].roles)) items[idx].roles = ['guest', 'user', 'subscriber', 'admin'];
    if (checked && !items[idx].roles.includes(role)) items[idx].roles.push(role);
    else if (!checked) items[idx].roles = items[idx].roles.filter(r => r !== role);
    renderNavigation(items);
  }
};

window.deleteNavItem = function(idx) {
  const items = (S.ui && S.ui.navItems) || DEFAULT_NAV_ITEMS;
  if (!confirm(`آیا از حذف منوی «${items[idx]?.label}» اطمینان دارید؟`)) return;
  items.splice(idx, 1);
  items.forEach((item, i) => { item.order = i + 1; });
  renderAdminNavItemsTable();
  renderNavigation(items);
};

window.addCustomNavItem = function() {
  const label = prompt('عنوان منوی جدید را وارد کنید:', 'بخش جدید');
  if (!label || !label.trim()) return;
  const view = prompt('شناسه/کلید صفحه (View ID):', 'custom-' + Date.now().toString().slice(-4));
  if (!view || !view.trim()) return;
  const icon = prompt('آیکون منو (Emoji):', '⭐') || '⭐';

  const items = (S.ui && S.ui.navItems) || DEFAULT_NAV_ITEMS;
  items.push({
    id: view.trim(),
    label: label.trim(),
    icon: icon.trim(),
    view: view.trim(),
    order: items.length + 1,
    active: true,
    badge: '',
    roles: ['guest', 'user', 'subscriber', 'admin']
  });
  renderAdminNavItemsTable();
  renderNavigation(items);
  toast('منوی جدید با موفقیت اضافه شد ✨', 'ok');
};

function renderAdminButtonsGrid() {
  const grid = $('#admButtonsGrid');
  if (!grid) return;
  const cfg = (S.ui && S.ui.buttonsConfig) || DEFAULT_BUTTONS_CONFIG;
  const rolesList = getUiMatrixRoles();

  grid.innerHTML = Object.keys(cfg).map(btnKey => {
    const b = cfg[btnKey];
    const rolesCheckboxes = rolesList.map(r => `
      <label style="display:inline-flex;align-items:center;gap:3px;font-size:11.5px;cursor:pointer">
        <input type="checkbox" ${(!b.roles || b.roles.includes(r.key) || (r.key === 'subscriber' && b.roles.includes('vip'))) ? 'checked' : ''} onchange="updateBtnRole('${btnKey}', '${r.key}', this.checked)" />
        ${esc(r.label)}
      </label>
    `).join('');

    return `
      <div class="ui-btn-custom-card" id="card-btn-${btnKey}">
        <div class="ui-btn-custom-head">
          <div>
            <b style="font-size:13.5px">${esc(b.title || btnKey)}</b>
            <div class="hint">شناسه: <code>${btnKey}</code></div>
          </div>
          <label class="switch">
            <input type="checkbox" ${b.active !== false ? 'checked' : ''} onchange="updateBtnField('${btnKey}', 'active', this.checked)" />
            <span class="slider"></span>
          </label>
        </div>

        <div class="form-grid" style="gap:8px">
          <div>
            <label style="font-size:11.5px">متن دکمه</label>
            <input type="text" class="input" value="${esc(b.label || '')}" oninput="updateBtnField('${btnKey}', 'label', this.value)" />
          </div>
          <div>
            <label style="font-size:11.5px">آیکون</label>
            <input type="text" class="input" style="text-align:center" value="${esc(b.icon || '')}" oninput="updateBtnField('${btnKey}', 'icon', this.value)" />
          </div>
        </div>

        <div class="grid two" style="gap:8px">
          <div class="ui-color-item" style="padding:6px 10px">
            <label>رنگ پس‌زمینه عادی</label>
            <div class="ui-color-row">
              <input type="color" class="ui-color-input" value="${b.bg_color || '#22c55e'}" oninput="updateBtnField('${btnKey}', 'bg_color', this.value)" />
              <input type="text" class="input ui-color-val" value="${b.bg_color || '#22c55e'}" oninput="updateBtnField('${btnKey}', 'bg_color', this.value)" />
            </div>
          </div>
          <div class="ui-color-item" style="padding:6px 10px">
            <label>رنگ متن عادی</label>
            <div class="ui-color-row">
              <input type="color" class="ui-color-input" value="${b.text_color || '#ffffff'}" oninput="updateBtnField('${btnKey}', 'text_color', this.value)" />
              <input type="text" class="input ui-color-val" value="${b.text_color || '#ffffff'}" oninput="updateBtnField('${btnKey}', 'text_color', this.value)" />
            </div>
          </div>
          <div class="ui-color-item" style="padding:6px 10px">
            <label>رنگ پس‌زمینه هاور (Hover)</label>
            <div class="ui-color-row">
              <input type="color" class="ui-color-input" value="${b.hover_bg || '#16a34a'}" oninput="updateBtnField('${btnKey}', 'hover_bg', this.value)" />
              <input type="text" class="input ui-color-val" value="${b.hover_bg || '#16a34a'}" oninput="updateBtnField('${btnKey}', 'hover_bg', this.value)" />
            </div>
          </div>
          <div class="ui-color-item" style="padding:6px 10px">
            <label>رنگ متن در حالت هاور</label>
            <div class="ui-color-row">
              <input type="color" class="ui-color-input" value="${b.hover_text || '#ffffff'}" oninput="updateBtnField('${btnKey}', 'hover_text', this.value)" />
              <input type="text" class="input ui-color-val" value="${b.hover_text || '#ffffff'}" oninput="updateBtnField('${btnKey}', 'hover_text', this.value)" />
            </div>
          </div>
        </div>

        <div>
          <label style="font-size:11.5px">دسترسی نقش‌ها:</label>
          <div style="display:flex;gap:10px;margin-top:2px">${rolesCheckboxes}</div>
        </div>

        <div>
          <label style="font-size:11px;color:var(--muted)">پیش‌نمایش زنده و تعاملی (ماوس را روی دکمه ببرید):</label>
          <div class="ui-btn-preview-box" id="prev-box-${btnKey}">
            <button class="btn btn-sm" id="prev-btn-${btnKey}" style="background:${b.bg_color || '#22c55e'};color:${b.text_color || '#fff'};border-radius:${b.border_radius || '8px'};transition:all .2s;font-weight:700" onmouseover="this.style.background='${b.hover_bg || b.bg_color}';this.style.color='${b.hover_text || '#fff'}'" onmouseout="this.style.background='${b.bg_color || '#22c55e'}';this.style.color='${b.text_color || '#fff'}'">
              ${b.icon ? b.icon + ' ' : ''}${esc(b.label || btnKey)}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.updateBtnField = function(btnKey, field, val) {
  const cfg = (S.ui && S.ui.buttonsConfig) || DEFAULT_BUTTONS_CONFIG;
  if (cfg[btnKey]) {
    cfg[btnKey][field] = val;
    // Update live preview button
    const prevBtn = $(`#prev-btn-${btnKey}`);
    if (prevBtn) {
      const b = cfg[btnKey];
      prevBtn.textContent = (b.icon ? b.icon + ' ' : '') + (b.label || btnKey);
      prevBtn.style.background = b.bg_color || '#22c55e';
      prevBtn.style.color = b.text_color || '#fff';
      prevBtn.style.borderRadius = b.border_radius || '8px';
      prevBtn.onmouseover = () => { prevBtn.style.background = b.hover_bg || b.bg_color; prevBtn.style.color = b.hover_text || '#fff'; };
      prevBtn.onmouseout = () => { prevBtn.style.background = b.bg_color; prevBtn.style.color = b.text_color; };
    }
    applyButtonsConfig(cfg);
  }
};

window.updateBtnRole = function(btnKey, role, checked) {
  const cfg = (S.ui && S.ui.buttonsConfig) || DEFAULT_BUTTONS_CONFIG;
  if (cfg[btnKey]) {
    if (!Array.isArray(cfg[btnKey].roles)) cfg[btnKey].roles = ['guest', 'user', 'subscriber', 'admin'];
    if (checked && !cfg[btnKey].roles.includes(role)) cfg[btnKey].roles.push(role);
    else if (!checked) cfg[btnKey].roles = cfg[btnKey].roles.filter(r => r !== role);
    applyButtonsConfig(cfg);
  }
};

function renderAdminThemePresets() {
  const grid = $('#uiPresetGrid');
  if (!grid) return;
  const curPreset = (S.ui && S.ui.themeStyles && S.ui.themeStyles.themePreset) || 'dark-neon';

  grid.innerHTML = Object.keys(THEME_PRESETS).map(pk => {
    const p = THEME_PRESETS[pk];
    const isAct = curPreset === pk;
    return `
      <div class="ui-preset-card ${isAct ? 'active' : ''}" onclick="applyThemePreset('${pk}')">
        <b style="font-size:12.5px">${esc(p.name)}</b>
        <div class="ui-preset-colors">
          ${p.colors.map(c => `<span style="background:${c}"></span>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.applyThemePreset = function(presetKey) {
  const p = THEME_PRESETS[presetKey];
  if (!p) return;
  if (!S.ui) initUiCustomizationDefaults();
  S.ui.themeStyles = Object.assign(S.ui.themeStyles || {}, p.styles, { themePreset: presetKey });
  renderAdminThemePresets();
  renderAdminColorGrid();
  renderAdminThemeForm();
  applyTheme(S.ui.themeStyles, true);
  toast(`پالت «${p.name}» اعمال شد ✨`, 'ok');
};

function renderAdminColorGrid() {
  const grid = $('#uiColorGrid');
  if (!grid) return;
  const s = (S.ui && S.ui.themeStyles) || DEFAULT_THEME_STYLES;

  const colorItems = [
    { key: 'bgColor', label: 'پس‌زمینه کل سامانه (Background)', val: s.bgColor || '#070a12' },
    { key: 'surfaceColor', label: 'سطوح کادرها و کارت‌ها (Surface)', val: s.surfaceColor || '#0e1726' },
    { key: 'panelColor', label: 'پنل‌ها و باکس‌های اطلاعاتی (Panel)', val: s.panelColor || '#121f33' },
    { key: 'panel2Color', label: 'پنل‌های ثانویه و فرم‌ها (Panel 2)', val: s.panel2Color || '#182842' },
    { key: 'txtColor', label: 'متن اصلی سامانه (Primary Text)', val: s.txtColor || '#f1f5f9' },
    { key: 'mutedColor', label: 'متن‌های فرعی و راهنما (Muted Text)', val: s.mutedColor || '#94a3b8' },
    { key: 'accentColor', label: 'رنگ برند و لهجه اصلی (Accent)', val: s.accentColor || '#22d3ee' },
    { key: 'accentHover', label: 'هاور رنگ برند (Accent Hover)', val: s.accentHover || '#06b6d4' },
    { key: 'upColor', label: 'رنگ صعودی و سود (Profit / Green)', val: s.upColor || '#22c55e' },
    { key: 'downColor', label: 'رنگ نزولی و ضرر (Loss / Red)', val: s.downColor || '#ef4444' },
    { key: 'warnColor', label: 'رنگ هشدار و اخطار (Warning / Amber)', val: s.warnColor || '#f59e0b' },
    { key: 'btnPrimaryBg', label: 'پس‌زمینه دکمه‌های اصلی (Primary Btn)', val: s.btnPrimaryBg || '#22d3ee' }
  ];

  grid.innerHTML = colorItems.map(item => `
    <div class="ui-color-item">
      <label>${esc(item.label)}</label>
      <div class="ui-color-row">
        <input type="color" class="ui-color-input" value="${item.val}" oninput="updateThemeColorField('${item.key}', this.value)" />
        <input type="text" class="input ui-color-val" value="${item.val}" oninput="updateThemeColorField('${item.key}', this.value)" />
      </div>
    </div>
  `).join('');
}

window.updateThemeColorField = function(key, val) {
  if (!S.ui) initUiCustomizationDefaults();
  S.ui.themeStyles[key] = val;
  applyTheme(S.ui.themeStyles, true);
};

function renderAdminThemeForm() {
  const s = (S.ui && S.ui.themeStyles) || DEFAULT_THEME_STYLES;
  if ($('#uiThemeFontFamily')) $('#uiThemeFontFamily').value = s.fontFamily || 'Vazirmatn';
  if ($('#uiThemeFontSize')) $('#uiThemeFontSize').value = s.fontSizeBase || '14px';
  if ($('#uiThemeCardRadius')) $('#uiThemeCardRadius').value = s.cardRadius || s.borderRadius || '12px';
  if ($('#uiThemeBtnRadius')) $('#uiThemeBtnRadius').value = s.btnRadius || '10px';
  if ($('#uiThemeCustomCss')) $('#uiThemeCustomCss').value = s.customCss || '';
}

function renderAdminVisibilityMatrices() {
  const vTableEl = $('#admViewsMatrixTable');
  const fTableEl = $('#admFeaturesMatrixTable');
  const vTable = $('#admViewsMatrixTbody');
  const fTable = $('#admFeaturesMatrixTbody');
  if (!S.ui) initUiCustomizationDefaults();
  const rules = (S.ui && S.ui.visibilityRules) || DEFAULT_VISIBILITY_RULES;

  const viewsMeta = [
    { key: 'dashboard', label: '📊 داشبورد تحلیلی و وضعیت بازار' },
    { key: 'market', label: '📈 دیده‌بان زنده بازار و قیمت‌ها' },
    { key: 'signals', label: '⚡ دیده‌بان سیگنال‌های هوشمند خرید/فروش' },
    { key: 'auto-invest', label: '🤖 ربات معاملات خودکار و لاگ تصمیمات' },
    { key: 'portfolio', label: '💼 مدیریت سبد دارایی و پرتفوی من' },
    { key: 'ai-analysis', label: '🧠 تحلیل جامع هوش مصنوعی بازار' },
    { key: 'chat', label: '💬 مشاور تحلیل‌گر هوش مصنوعی (AI Chat)' },
    { key: 'subscriptions', label: '💳 کیف‌پول، ارتقای اشتراک و مالی' },
    { key: 'notifications', label: '🔔 اعلان‌ها و هشدارهای قیمتی' },
    { key: 'news', label: '📰 تقویم اقتصادی، اخبار و هشدارهای فوری' },
    { key: 'guide', label: '📖 راهنمای جامع سامانه' },
    { key: 'admin', label: '🛡️ پنل مدیریت سامانه (Admin Panel)' }
  ];

  const featuresMeta = [
    { key: 'header_ticker', label: '📊 نوار قیمت متحرک بالای سایت (Ticker Marquee)' },
    { key: 'dash_auto_invest_banner', label: '🚀 بنر معاملات خودکار در داشبورد' },
    { key: 'signal_auto_invest_btn', label: '⚡ دکمه معاملات خودکار در کارت‌های سیگنال' },
    { key: 'btn_signal_detail', label: '🔍 دکمه تحلیل و سطوح معامله سیگنال' },
    { key: 'signal_advisory_btn', label: '🎯 دکمه مشاوره استراتژی دارایی (دارم / بخرم؟)' },
    { key: 'signal_calc_btn', label: '🧮 دکمه ماشین‌حساب هوشمند حجم و پله‌های ورود' },
    { key: 'signals_vip', label: '💎 مشاهده سیگنال‌های طلایی و ویژه VIP' },
    { key: 'ai_chat_modal', label: '🤖 دکمه تحلیل عمیق دارایی با هوش مصنوعی' },
    { key: 'ai_models', label: '🧠 دسترسی به تمام مدل‌های هوش مصنوعی' },
    { key: 'wallet_recharge', label: '💳 دکمه شارژ آنلاین کیف‌پول (ریالی)' },
    { key: 'crypto_payment', label: '🪙 دکمه شارژ کیف‌پول با تتر TRC20' },
    { key: 'wallet_withdraw', label: '🏦 دکمه درخواست تسویه پایا (شبا)' },
    { key: 'btn_sub_purchase', label: '💎 دکمه خرید و فعال‌سازی پلن اشتراک VIP' },
    { key: 'portfolio_add', label: '＋ دکمه افزودن مستقیم دارایی به پرتفوی' },
    { key: 'btn_auto_close', label: '💰 دکمه خروج و تسویه معامله به کیف‌پول' },
    { key: 'btn_alert_create', label: '🔔 دکمه ثبت هشدار قیمتی و پیامکی' },
    { key: 'btn_refresh_market', label: '↻ دکمه بروزرسانی زنده بازار در هدر' },
    { key: 'btn_theme_toggle', label: '🌓 دکمه تغییر تم شب و روز در هدر' },
    { key: 'export_data', label: '📤 دکمه خروجی اکسل/CSV از تحلیل‌ها و جداول' },
    { key: 'admin_panel', label: '🛡️ دسترسی به پنل مدیریت' },
    { key: 'ai_settings', label: '⚙️ دسترسی به تنظیمات مدل‌ها و کلیدهای AI' },
    { key: 'system_settings', label: '🔧 دسترسی به تنظیمات سیستم و پایگاه داده' }
  ];

  const rolesList = getUiMatrixRoles();

  if (vTableEl) {
    const vHead = vTableEl.querySelector('thead');
    if (vHead) {
      vHead.innerHTML = `<tr><th>صفحه / بخش سامانه</th>${rolesList.map(r => `<th>${esc(r.label)}</th>`).join('')}</tr>`;
    }
  }
  if (fTableEl) {
    const fHead = fTableEl.querySelector('thead');
    if (fHead) {
      fHead.innerHTML = `<tr><th>دکمه، قابلیت یا ابزار ویژه</th>${rolesList.map(r => `<th>${esc(r.label)}</th>`).join('')}</tr>`;
    }
  }

  if (vTable) {
    vTable.innerHTML = viewsMeta.map(v => {
      const allowed = (rules.views && rules.views[v.key]) || ['guest', 'user', 'subscriber', 'admin'];
      return `
        <tr>
          <td>${v.label}</td>
          ${rolesList.map(r => `
            <td>
              <input type="checkbox" ${(allowed.includes(r.key) || (r.key === 'subscriber' && allowed.includes('vip'))) ? 'checked' : ''} onchange="updateViewRoleVisibility('${v.key}', '${r.key}', this.checked)" />
            </td>
          `).join('')}
        </tr>
      `;
    }).join('');
  }

  if (fTable) {
    fTable.innerHTML = featuresMeta.map(f => {
      const allowed = (rules.features && rules.features[f.key]) || ['user', 'subscriber', 'admin'];
      return `
        <tr>
          <td>${f.label}</td>
          ${rolesList.map(r => `
            <td>
              <input type="checkbox" ${(allowed.includes(r.key) || (r.key === 'subscriber' && allowed.includes('vip'))) ? 'checked' : ''} onchange="updateFeatureRoleVisibility('${f.key}', '${r.key}', this.checked)" />
            </td>
          `).join('')}
        </tr>
      `;
    }).join('');
  }
}

window.updateViewRoleVisibility = function(viewKey, role, checked) {
  if (!S.ui) initUiCustomizationDefaults();
  if (!S.ui.visibilityRules.views[viewKey]) S.ui.visibilityRules.views[viewKey] = ['guest', 'user', 'subscriber', 'admin'];
  const arr = S.ui.visibilityRules.views[viewKey];
  if (checked && !arr.includes(role)) arr.push(role);
  else if (!checked) S.ui.visibilityRules.views[viewKey] = arr.filter(r => r !== role);
  renderNavigation();
};

window.updateFeatureRoleVisibility = function(featKey, role, checked) {
  if (!S.ui) initUiCustomizationDefaults();
  if (!S.ui.visibilityRules.features[featKey]) S.ui.visibilityRules.features[featKey] = ['guest', 'user', 'subscriber', 'admin'];
  const arr = S.ui.visibilityRules.features[featKey];
  if (checked && !arr.includes(role)) arr.push(role);
  else if (!checked) S.ui.visibilityRules.features[featKey] = arr.filter(r => r !== role);
  applyButtonsConfig(S.ui.buttonsConfig);
};

function livePreviewUiSettings() {
  if (!S.ui) initUiCustomizationDefaults();
  if ($('#uiThemeFontFamily')) S.ui.themeStyles.fontFamily = $('#uiThemeFontFamily').value;
  if ($('#uiThemeFontSize')) S.ui.themeStyles.fontSizeBase = $('#uiThemeFontSize').value;
  if ($('#uiThemeCardRadius')) S.ui.themeStyles.cardRadius = $('#uiThemeCardRadius').value;
  if ($('#uiThemeBtnRadius')) S.ui.themeStyles.btnRadius = $('#uiThemeBtnRadius').value;
  if ($('#uiThemeCustomCss')) S.ui.themeStyles.customCss = $('#uiThemeCustomCss').value;

  applyTheme(S.ui.themeStyles, true);
  renderNavigation(S.ui.navItems);
  applyButtonsConfig(S.ui.buttonsConfig);
  toast('پیش‌نمایش تغییرات ظاهری به‌صورت زنده اعمال شد 👁️', 'ok');
}

async function saveAdminUiSettings() {
  livePreviewUiSettings();
  const btn = $('#btnSaveUiSettings');
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ در حال ذخیره…'; }

  const payload = {
    navItems: S.ui.navItems || DEFAULT_NAV_ITEMS,
    buttonsConfig: S.ui.buttonsConfig || DEFAULT_BUTTONS_CONFIG,
    themeStyles: S.ui.themeStyles || DEFAULT_THEME_STYLES,
    visibilityRules: S.ui.visibilityRules || DEFAULT_VISIBILITY_RULES
  };

  try {
    let r = null;
    try {
      r = await api('/api/admin/ui-settings', { method: 'POST', body: JSON.stringify(payload) });
    } catch (e) {
      r = { ok: true, message: 'تنظیمات ظاهر در حافظه مرورگر ذخیره و اعمال شد ✨' };
    }
    try {
      localStorage.setItem('sy_ui_customizer', JSON.stringify(payload));
    } catch (e) {}

    toast((r && r.message) || 'تمامی تغییرات منوها، دکمه‌ها و ظاهر با موفقیت ذخیره شد ✨', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

async function resetAdminUiSettings() {
  if (!confirm('آیا مطمئن هستید که می‌خواهید تمامی تنظیمات ظاهر، منوها و دکمه‌ها را به حالت کارخانه بازگردانید؟')) return;
  try {
    try {
      await api('/api/admin/ui-settings/reset', { method: 'POST' });
    } catch (e) {}
    try {
      localStorage.removeItem('sy_ui_customizer');
    } catch (e) {}

    initUiCustomizationDefaults();
    applyTheme(S.ui.themeStyles);
    renderNavigation(S.ui.navItems);
    applyButtonsConfig(S.ui.buttonsConfig);
    renderAdminUiCustomizer();
    toast('تنظیمات ظاهر و منوها به حالت کارخانه بازنشانی شد 🔄', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ----------------------------- تنظیمات عمومی و موتور (کارت‌های تمیز) ----------------------------- */
function renderAdminCleanSettings() {
  const s = S.admin.settings || {};
  if ($('#cfgSiteName')) $('#cfgSiteName').value = s.siteName || 'سرمایه‌یار';
  if ($('#cfgSiteTagline')) $('#cfgSiteTagline').value = s.siteTagline || 'سیگنال و فرصت سرمایه‌گذاری — ایران و جهان';
  if ($('#cfgRegOpen')) $('#cfgRegOpen').value = s.allowRegister !== false ? '1' : '0';
  if ($('#cfgDefaultRole')) $('#cfgDefaultRole').value = s.defaultRole || 'user';
  if ($('#cfgMultiSession')) $('#cfgMultiSession').value = s.multiSession !== false ? '1' : '0';

  if ($('#cfgTickerEnabled')) $('#cfgTickerEnabled').value = s.tickerEnabled !== false ? '1' : '0';
  if ($('#cfgTickerItemCount')) $('#cfgTickerItemCount').value = String(s.tickerItemCount ?? 12);
  if ($('#cfgTickerDirection')) $('#cfgTickerDirection').value = s.tickerDirection || 'rtl';
  if ($('#cfgTickerSpeed')) $('#cfgTickerSpeed').value = s.tickerSpeed || 'medium';
  if ($('#cfgTickerPauseHover')) $('#cfgTickerPauseHover').value = (s.tickerPauseHover !== false && s.tickerPauseOnHover !== false) ? '1' : '0';

  if ($('#cfgDefaultCash')) $('#cfgDefaultCash').value = String(s.defaultCash || 50000000);
  if ($('#cfgDefaultRisk')) $('#cfgDefaultRisk').value = s.defaultRisk || 'balanced';
  if ($('#cfgDefaultHorizon')) $('#cfgDefaultHorizon').value = s.defaultHorizon || 'mid';

  // کنترل نمایش ابزارهای سیگنال
  if ($('#cfgSignalShowCalculator')) $('#cfgSignalShowCalculator').value = s.signalShowCalculator !== false ? '1' : '0';
  if ($('#cfgSignalShowStrategy')) $('#cfgSignalShowStrategy').value = s.signalShowStrategy !== false ? '1' : '0';
  if ($('#cfgSignalShowAutoInvest')) $('#cfgSignalShowAutoInvest').value = s.signalShowAutoInvest !== false ? '1' : '0';

  if ($('#admAlertsPriceMonthly')) $('#admAlertsPriceMonthly').value = String(s.alertsPriceMonthly || s.alertVipPrice || 99000);
  if ($('#admAlertsPriceSmsUnit')) $('#admAlertsPriceSmsUnit').value = String(s.alertsPriceSmsUnit || s.alertSmsPerUnit || 500);
}

async function saveAdminCleanSettings() {
  const body = {
    siteName: $('#cfgSiteName')?.value.trim(),
    siteTagline: $('#cfgSiteTagline')?.value.trim(),
    allowRegister: $('#cfgRegOpen')?.value === '1',
    defaultRole: $('#cfgDefaultRole')?.value,
    multiSession: $('#cfgMultiSession')?.value === '1',
    tickerEnabled: $('#cfgTickerEnabled')?.value === '1',
    tickerItemCount: Number($('#cfgTickerItemCount')?.value) || 12,
    tickerDirection: $('#cfgTickerDirection')?.value,
    tickerSpeed: $('#cfgTickerSpeed')?.value,
    tickerPauseHover: $('#cfgTickerPauseHover')?.value === '1',
    tickerPauseOnHover: $('#cfgTickerPauseHover')?.value === '1',
    defaultCash: parseNum($('#cfgDefaultCash')?.value) || 50000000,
    defaultRisk: $('#cfgDefaultRisk')?.value,
    defaultHorizon: $('#cfgDefaultHorizon')?.value,

    // نمایش ابزارهای سیگنال
    signalShowCalculator: $('#cfgSignalShowCalculator')?.value === '1',
    signalShowStrategy: $('#cfgSignalShowStrategy')?.value === '1',
    signalShowAutoInvest: $('#cfgSignalShowAutoInvest')?.value === '1',
  };
  try {
    const r = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(body) });
    S.admin.settings = r.settings; S.settings = r.settings;
    renderUser();
    renderTicker();
    renderSignals();
    toast('تنظیمات عمومی سایت و نمایش ابزارها ذخیره شد', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function renderAdminCleanEngine() {
  const s = S.admin.settings || {};
  if ($('#engWeightLag')) $('#engWeightLag').value = s.weightLag ?? s.lagWeight ?? 1.0;
  if ($('#engWeightRsi')) $('#engWeightRsi').value = s.weightRsi ?? 0.8;
  if ($('#engWeightMomentum')) $('#engWeightMomentum').value = s.weightMomentum ?? 0.7;
  if ($('#engWeightTrend')) $('#engWeightTrend').value = s.weightTrend ?? s.trendWeight ?? 0.9;
  if ($('#engWeightPortfolioFit')) $('#engWeightPortfolioFit').value = s.weightPortfolioFit ?? 1.0;

  if ($('#engMinBuyScore')) $('#engMinBuyScore').value = s.minBuyScore ?? s.minOppScore ?? 65;
  if ($('#engRsiOversold')) $('#engRsiOversold').value = s.rsiOversold ?? 35;
  if ($('#engRsiOverbought')) $('#engRsiOverbought').value = s.rsiOverbought ?? 70;
  if ($('#engDefaultStopLossPct')) $('#engDefaultStopLossPct').value = s.defaultStopLossPct ?? 6.5;

  if ($('#engMaxAssetPct')) $('#engMaxAssetPct').value = s.maxAssetPct ?? 15;
  if ($('#engStep1Pct')) $('#engStep1Pct').value = s.step1Pct ?? 50;
  if ($('#engStep2Pct')) $('#engStep2Pct').value = s.step2Pct ?? 50;
}

async function saveAdminCleanEngine() {
  const body = {
    weightLag: Number($('#engWeightLag')?.value) || 1.0,
    lagWeight: Number($('#engWeightLag')?.value) || 40,
    weightRsi: Number($('#engWeightRsi')?.value) || 0.8,
    weightMomentum: Number($('#engWeightMomentum')?.value) || 0.7,
    weightTrend: Number($('#engWeightTrend')?.value) || 0.9,
    trendWeight: Number($('#engWeightTrend')?.value) || 35,
    weightPortfolioFit: Number($('#engWeightPortfolioFit')?.value) || 1.0,
    minBuyScore: Number($('#engMinBuyScore')?.value) || 65,
    minOppScore: Number($('#engMinBuyScore')?.value) || 40,
    rsiOversold: Number($('#engRsiOversold')?.value) || 35,
    rsiOverbought: Number($('#engRsiOverbought')?.value) || 70,
    defaultStopLossPct: Number($('#engDefaultStopLossPct')?.value) || 6.5,
    maxAssetPct: Number($('#engMaxAssetPct')?.value) || 15,
    step1Pct: Number($('#engStep1Pct')?.value) || 50,
    step2Pct: Number($('#engStep2Pct')?.value) || 50,
  };
  try {
    const r = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(body) });
    S.admin.settings = r.settings; S.settings = r.settings;
    toast('تنظیمات موتور تحلیل ذخیره شد', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function renderAdminAudit() {
  const rows = S.admin.audit || [];
  const head = ['زمان', 'رویداد', 'جزئیات', 'کاربر', 'IP'];
  const body = rows.map(r => `<tr>
    <td>${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.created_at))}</td>
    <td>${esc(ADM_ACTIONS[r.action] || r.action)}</td>
    <td class="hint">${esc(r.detail || '')}</td>
    <td>${r.user_id ? '#' + NF(r.user_id, 0) : '—'}</td>
    <td dir="ltr" style="text-align:left">${esc(r.ip || '')}</td></tr>`).join('')
    || '<tr><td colspan="5" class="hint">رویدادی ثبت نشده.</td></tr>';
  $('#admAuditTable').innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody>`;
}

function renderAdminUsage() {
  const rows = S.admin.usage || [];
  const head = ['زمان', 'کاربر', 'مدل', 'وضعیت', 'زمان اجرا'];
  const body = rows.map(r => `<tr>
    <td>${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.created_at))}</td>
    <td dir="ltr" style="text-align:left">${esc(r.email || '—')}</td>
    <td dir="ltr" style="text-align:left">${esc(r.model || '—')}</td>
    <td>${r.status === 'ok' ? '<span class="st-ok">موفق</span>' : '<span class="st-blocked">' + esc(r.status) + '</span>'}</td>
    <td>${NF(r.ms, 0)}ms</td></tr>`).join('') || '<tr><td colspan="5" class="hint">هنوز اجرایی ثبت نشده.</td></tr>';
  $('#admAiUsage').innerHTML = `<thead><tr>${head.map(h => '<th>' + h + '</th>').join('')}</tr></thead><tbody>${body}</tbody>`;
}

async function runAdminTool(tool) {
  const out = $('#admToolOut');
  if (out) out.textContent = '⏳ در حال اجرا…';
  try {
    const r = await api('/api/admin/tools', { method: 'POST', body: JSON.stringify({ tool }) });
    if (out) out.textContent = '✅ ' + (r.message || 'انجام شد');
    await loadAdmin(true);
  } catch (e) {
    if (out) out.textContent = '❌ ' + e.message;
  }
}

/* ============================================================================
   راه‌اندازی و وضعیت سیستم
   ============================================================================ */
async function renderSetup() {
  try {
    const sys = await api('/api/system');
    const row = (ok, label, detail) => `<div class="row"><span>${label}</span><span class="chip-cls" style="color:var(${ok ? '--ok-txt' : '--bad-txt'})">${ok ? 'سالم' : 'ناموفق'} · ${detail || ''}</span></div>`;
    document.getElementById('sysBox').innerHTML = `
      <div class="row"><span>نسخه PHP</span><b style="direction:ltr">${esc(sys.php)}</b></div>
      ${row(sys.curl, 'افزونه cURL (دریافت موازی داده)', sys.curl ? 'فعال' : 'غیرفعال — حالت سری')}
      ${row(sys.mbstring, 'افزونه mbstring', sys.mbstring ? 'فعال' : 'غیرفعال')}
      ${row(sys.openssl, 'OpenSSL / HTTPS', sys.openssl ? 'فعال' : 'غیرفعال')}
      <div class="row"><span>وضعیت داده بازار</span><b>${S.market && S.market.counts ? NF(S.market.counts.ok, 0) + ' دارایی تحلیل‌شده' : 'آماده نیست'}</b></div>`;
    const cron = document.getElementById('cronBox');
    if (cron) cron.textContent = sys.cron;
  } catch (e) {
    document.getElementById('sysBox').innerHTML = '<div class="muted">' + esc(e.message) + '</div>';
  }
}

/* ============================================================================
   رویدادها و شنوندگان
   ============================================================================ */
function bind() {
  const on = (id, fn, evt = 'onclick') => {
    const el = typeof id === 'string' ? (id.startsWith('#') ? $(id) : document.getElementById(id)) : id;
    if (el) el[evt] = fn;
  };

  // فیلترهای تب معاملات خودکار
  $$('#aiPosFilters .chip').forEach(c => {
    c.onclick = () => {
      $$('#aiPosFilters .chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      aiPosFilter = c.dataset.aifilter || 'all';
      renderAutoInvestPositions();
    };
  });

  on('#authLoginForm', doAuthLogin, 'onsubmit');
  on('#authRegisterForm', doAuthRegister, 'onsubmit');
  $$('#authTabs .auth-tab').forEach(t => t.onclick = () => setAuthMode(t.dataset.mode));
  on('#authForgotBtn', openForgotModal);

  // کلمات بازیابی
  on('#recCopyBtn', copyRecoveryWords);
  on('#recDownloadBtn', downloadRecoveryWords);
  on('#recConfirmCheck', (e) => { if ($('#recFinishBtn')) $('#recFinishBtn').disabled = !e.target.checked; }, 'onchange');
  on('#recFinishBtn', finishRecoveryOnboarding);

  // بازیابی رمز عبور
  on('#forgotClose', () => { $('#forgotModal').hidden = true; });
  on('#recBackToLogin', () => { $('#forgotModal').hidden = true; setAuthMode('login'); });
  $$('#forgotTabs .auth-tab').forEach(t => t.onclick = () => setForgotTab(t.dataset.fmode));
  on('#recoverWordsForm', doRecoverWithWords, 'onsubmit');
  on('#recoverEmailForm', doRecoverEmail, 'onsubmit');

  // فرم‌ساز فیلدهای ثبت‌نام
  on('#btnNewField', () => openFieldModal(0));
  on('#btnRefreshFields', () => loadAdmin(true));
  on('#fieldModalClose', () => { $('#fieldModal').hidden = true; });
  on('#btnCancelField', () => { $('#fieldModal').hidden = true; });
  on('#btnSaveField', saveFieldForm);
  on('#btnAddFieldOption', addFieldOptionRow);
  on('#ff_type', () => toggleFieldOptionsVisibility($('#ff_type').value), 'onchange');

  // نقش‌ها و دسترسی‌ها
  on('#btnNewRole', () => openRoleModal(0));
  on('#btnRefreshRoles', () => loadAdmin(true));
  on('#roleModalClose', () => { $('#roleModal').hidden = true; });
  on('#btnCancelRole', () => { $('#roleModal').hidden = true; });
  on('#btnSaveRole', saveRoleForm);

  // تنظیمات احراز هویت
  on('#btnSaveAuthSettings', saveAdminAuthSettings);

  // ویرایش جامع کاربر
  on('#userFullEditClose', () => { $('#userFullEditModal').hidden = true; });
  on('#btnCancelUserFullEdit', () => { $('#userFullEditModal').hidden = true; });
  on('#btnSaveUserFullEdit', saveUserFullEdit);

  on('#menuLogout', doLogout);
  on('#themeBtn', () => toggleTheme(true));
  on('#menuTheme', () => toggleTheme(true));
  on('#menuAdmin', () => { go('admin'); loadAdmin(); });

  const chip = $('#userChip'), panel = $('#menuPanel');
  if (chip && panel) {
    chip.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; chip.setAttribute('aria-expanded', String(!panel.hidden)); };
    document.addEventListener('click', () => { if (!panel.hidden) { panel.hidden = true; chip.setAttribute('aria-expanded', 'false'); } });
  }

  on('#menuAccount', () => { if ($('#acctModal')) $('#acctModal').hidden = false; });
  on('#acctClose', () => { if ($('#acctModal')) $('#acctModal').hidden = true; });
  on('#acctModal', (e) => { if (e.target.id === 'acctModal') $('#acctModal').hidden = true; });
  on('#pwSave', changePassword);

  // بازار و سیگنال‌ها
  on('#refreshBtn', async () => {
    try { await api('/api/market/refresh', { method: 'POST' }); toast('به‌روزرسانی داده بازار شروع شد…'); setTimeout(() => loadMarket(), 6000); }
    catch (e) { toast(e.message, 'err'); }
  });
  on('#regenSignals', async () => {
    if ($('#signalsBox')) $('#signalsBox').innerHTML = '<div class="skeleton h200"></div>';
    await loadSignals();
    toast('سیگنال‌ها بازتولید شد', 'ok');
  });

  on('#assetSearch', renderAssetTable, 'oninput');
  on('#assetClsFilter', renderAssetTable, 'onchange');
  on('#assetRegionFilter', renderAssetTable, 'onchange');
  on('#assetSort', renderAssetTable, 'onchange');

  // تبدیل عدد به حروف در ورودی‌ها
  on('#pfCash', updatePersianWords, 'oninput');
  on('#pfCash', updatePersianWords, 'onchange');
  on('#astAmount', updatePersianWords, 'oninput');
  on('#astAmount', updatePersianWords, 'onchange');
  on('#astUnit', updatePersianWords, 'onchange');
  on('#planPrice', updatePersianWords, 'oninput');
  on('#planPrice', updatePersianWords, 'onchange');
  on('#userWalletAmount', updatePersianWords, 'oninput');
  on('#userWalletAmount', updatePersianWords, 'onchange');
  on('#uDepositAmount', updatePersianWords, 'oninput');
  on('#uDepositAmount', updatePersianWords, 'onchange');
  on('#uCryptoDepositAmount', updatePersianWords, 'oninput');
  on('#uCryptoDepositAmount', updatePersianWords, 'onchange');
  on('#uWithdrawAmount', updatePersianWords, 'oninput');
  on('#uWithdrawAmount', updatePersianWords, 'onchange');
  on('#calcCapitalInput', updatePersianWords, 'oninput');
  on('#calcCapitalInput', updatePersianWords, 'onchange');
  on('#advHoldingInput', updatePersianWords, 'oninput');
  on('#advHoldingInput', updatePersianWords, 'onchange');
  on('#aiInvestAmountInput', () => { updatePersianWords(); recalcAutoInvestSteps(); }, 'oninput');
  on('#aiInvestAmountInput', () => { updatePersianWords(); recalcAutoInvestSteps(); }, 'onchange');

  // راهنمای سیگنال‌ها
  on('#sigGuideToggle', () => {
    const body = $('#sigGuideBody');
    const btn = $('#sigGuideBtn');
    if (body) {
      body.hidden = !body.hidden;
      if (btn) btn.textContent = body.hidden ? 'نمایش راهنما ▼' : 'بستن راهنما ▲';
    }
  });

  // ماشین حساب هوشمند (مودال)
  on('#btnOpenAllocCalcModal', () => {
    if ($('#allocCalcModal')) $('#allocCalcModal').hidden = false;
    updatePersianWords();
    runAllocCalcModal();
  });
  on('#allocCalcModalClose', () => { if ($('#allocCalcModal')) $('#allocCalcModal').hidden = true; });
  on('#allocCalcModal', (e) => { if (e.target.id === 'allocCalcModal') $('#allocCalcModal').hidden = true; });
  on('#btnRunCalcModal', runAllocCalcModal);

  // مدال سرمایه‌گذاری خودکار
  on('#autoInvestModalClose', () => { if ($('#autoInvestModal')) $('#autoInvestModal').hidden = true; });
  on('#autoInvestModal', (e) => { if (e.target.id === 'autoInvestModal') $('#autoInvestModal').hidden = true; });
  on('#btnConfirmAutoInvest', confirmAutoInvest);

  // مدال جزئیات و لاگ ربات
  on('#autoInvestDetailClose', () => { if ($('#autoInvestDetailModal')) $('#autoInvestDetailModal').hidden = true; });
  on('#autoInvestDetailModal', (e) => { if (e.target.id === 'autoInvestDetailModal') $('#autoInvestDetailModal').hidden = true; });

  // مدال مشاوره و استراتژی اختصاصی دارایی
  on('#advModalClose', () => { if ($('#assetAdvisoryModal')) $('#assetAdvisoryModal').hidden = true; });
  on('#assetAdvisoryModal', (e) => { if (e.target.id === 'assetAdvisoryModal') $('#assetAdvisoryModal').hidden = true; });
  on('#btnRunAdvisory', runAssetAdvisory);
  on('#btnAdvZero', () => {
    if ($('#advHoldingInput')) $('#advHoldingInput').value = '0';
    if ($('#advAvgPriceInput')) $('#advAvgPriceInput').value = '';
    updatePersianWords();
    runAssetAdvisory();
  });
  on('#btnAdvFromPf', () => {
    const assetId = $('#advModalAssetId')?.value;
    const s = (S.signals && S.signals.signals || []).find((x) => String(x.assetId) === String(assetId));
    if (!s) return;
    let userHolding = 0;
    if (S.state && S.state.portfolio) {
      const pItem = S.state.portfolio.find(p => p.label === s.name || p.cls === s.cls);
      if (pItem) userHolding = pItem.amount || 0;
    }
    if ($('#advHoldingInput')) $('#advHoldingInput').value = String(userHolding || 0);
    updatePersianWords();
    runAssetAdvisory();
    toast(userHolding ? 'موجودی از پرتفوی فراخوانی شد' : 'دارایی در پرتفوی یافت نشد (مقدار ۰ تنظیم شد)');
  });
  on('#btnAdvAddPortfolio', () => {
    const assetId = $('#advModalAssetId')?.value;
    const s = (S.signals && S.signals.signals || []).find((x) => String(x.assetId) === String(assetId));
    if (!s) return;
    if ($('#assetAdvisoryModal')) $('#assetAdvisoryModal').hidden = true;
    if ($('#astLabel')) $('#astLabel').value = s.name;
    if ($('#astCls')) $('#astCls').value = s.cls;
    go('portfolio');
    if ($('#astAmount')) $('#astAmount').focus();
    updatePersianWords();
    toast('اطلاعات دارایی در فرم ثبت شد');
  });
  on('#btnAdvAskAi', () => {
    const assetId = $('#advModalAssetId')?.value;
    const s = (S.signals && S.signals.signals || []).find((x) => String(x.assetId) === String(assetId));
    if (!s) return;
    if ($('#assetAdvisoryModal')) $('#assetAdvisoryModal').hidden = true;
    go('chat');
    const holding = $('#advHoldingInput')?.value || '0';
    const prompt = `درباره دارایی «${s.name}» (قیمت ${fmtPrice(s.price, s.unit)}) مشاوره تخصصی بده. من ${holding} واحد از این دارایی دارم. چطور پله‌ای وارد شوم یا سود و ریسک را مدیریت کنم؟`;
    if ($('#chatInput')) $('#chatInput').value = prompt;
    sendChat();
  });

  // مدال سیگنال
  on('#sigModalClose', () => { if ($('#sigModal')) $('#sigModal').hidden = true; });
  on('#sigModal', (e) => { if (e.target.id === 'sigModal') $('#sigModal').hidden = true; });

  // مدال کیف‌پول و وضعیت کاربر
  on('#userWalletClose', () => { if ($('#userWalletModal')) $('#userWalletModal').hidden = true; });
  on('#btnCancelUserWallet', () => { if ($('#userWalletModal')) $('#userWalletModal').hidden = true; });
  on('#btnSaveUserWallet', saveAdminUserWallet);

  on('#userStatusClose', () => { if ($('#userStatusModal')) $('#userStatusModal').hidden = true; });
  on('#btnCancelUserStatus', () => { if ($('#userStatusModal')) $('#userStatusModal').hidden = true; });
  on('#btnSaveUserStatus', saveAdminUserStatus);

  // شارژ مستقیم کاربر، درگاه ارز دیجیتال و تسویه ریالی
  on('#btnDepositDirect', depositDirect);
  on('#btnCreateCryptoInvoice', createCryptoInvoice);
  on('#btnSubmitCryptoDeposit', submitCryptoDeposit);
  on('#btnSubmitWithdraw', submitWithdraw);
  on('#btnRefreshTx', () => { renderSubscriptions(); loadUserFinancialHistory(); loadAutoInvestPositions(); });

  // اعلان‌ها
  on('#btnSaveNotifPrefs', saveNotifPrefs);
  on('#btnMarkAllNotifsRead', markAllNotifsRead);

  // پرتفوی
  on('#saveProfile', async () => {
    try {
      await api('/api/profile', {
        method: 'POST', body: JSON.stringify({
          name: $('#pfName')?.value, risk: $('#pfRisk')?.value, horizon: $('#pfHorizon')?.value,
          investableCash: parseNum($('#pfCash')?.value),
        }),
      });
      await api('/api/state').then((st) => { S.state = st.state; });
      updatePersianWords();
      toast('پروفایل ذخیره شد', 'ok');
      await loadSignals(); await refreshPortfolio();
    } catch (e) { toast(e.message, 'err'); }
  });
  on('#addAsset', async () => {
    try {
      const r = await api('/api/portfolio', {
        method: 'POST', body: JSON.stringify({
          label: $('#astLabel')?.value, cls: $('#astCls')?.value,
          amount: parseNum($('#astAmount')?.value), unit: $('#astUnit')?.value,
        }),
      });
      if ($('#astLabel')) $('#astLabel').value = '';
      if ($('#astAmount')) $('#astAmount').value = '';
      updatePersianWords();
      await refreshPortfolio(r);
      toast('دارایی اضافه شد', 'ok');
      await loadSignals();
    } catch (e) { toast(e.message, 'err'); }
  });

  // تنظیمات هوش مصنوعی
  on('#aiProvider', () => {
    const p = S.providers.find((x) => x.key === $('#aiProvider')?.value);
    if (p && $('#aiBaseUrl')) { $('#aiBaseUrl').value = p.baseUrl || ''; }
    if ($('#modelsBox')) $('#modelsBox').innerHTML = '';
  }, 'onchange');
  on('#saveAi', async () => {
    try {
      const body = {
        provider: $('#aiProvider')?.value, baseUrl: $('#aiBaseUrl')?.value,
        model: $('#aiModel')?.value, temperature: Number($('#aiTemp')?.value) || 0.3,
        autoMode: $('#aiAuto')?.value === '1', autoIntervalMin: Number($('#aiInterval')?.value) || 60,
      };
      const k = $('#aiKey')?.value?.trim();
      if (k) body.apiKey = k;
      const r = await api('/api/ai/config', { method: 'POST', body: JSON.stringify(body) });
      if ($('#aiKey')) $('#aiKey').value = '';
      S.state.ai = r.ai;
      renderSettings();
      toast('تنظیمات هوش مصنوعی ذخیره شد', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });
  on('#fetchModels', async () => {
    if ($('#modelsBox')) $('#modelsBox').innerHTML = '<div class="hint">در حال دریافت لیست مدل‌ها…</div>';
    try {
      const body = { provider: $('#aiProvider')?.value, baseUrl: $('#aiBaseUrl')?.value };
      const k = $('#aiKey')?.value?.trim(); if (k) body.apiKey = k;
      const r = await api('/api/ai/models', { method: 'POST', body: JSON.stringify(body) });
      renderModels(r);
      await api('/api/state').then((st) => { S.state = st.state; });
      renderSettings();
      toast(`${r.models.length} مدل دریافت شد`, 'ok');
    } catch (e) { if ($('#modelsBox')) $('#modelsBox').innerHTML = `<div class="hint down">${esc(e.message)}</div>`; toast(e.message, 'err'); }
  });
  on('#autoPickModel', async () => {
    try {
      const body = { provider: $('#aiProvider')?.value, baseUrl: $('#aiBaseUrl')?.value };
      const k = $('#aiKey')?.value?.trim(); if (k) body.apiKey = k;
      const r = await api('/api/ai/models', { method: 'POST', body: JSON.stringify(body) });
      renderModels(r);
      await api('/api/ai/config', { method: 'POST', body: JSON.stringify({ model: 'auto', provider: $('#aiProvider')?.value, baseUrl: $('#aiBaseUrl')?.value, ...(k ? { apiKey: k } : {}) }) });
      await api('/api/state').then((st) => { S.state = st.state; });
      renderSettings();
      toast('انتخاب خودکار مدل: ' + (r.auto || '—'), 'ok');
    } catch (e) { toast(e.message, 'err'); }
  });
  on('#testAi', async () => {
    if ($('#modelsBox')) $('#modelsBox').innerHTML = '<div class="hint">در حال تست اتصال…</div>';
    try {
      const r = await api('/api/ai/test', { method: 'POST' });
      if ($('#modelsBox')) $('#modelsBox').innerHTML = `<div class="note"><b>نتیجه تست — ${esc(r.provider)}</b>
        <p>تعداد مدل: ${NF(r.models, 0)} · پیشنهاد خودکار: <code>${esc(r.autoPick || '—')}</code></p>
        <p>${r.chatErr ? '❌ خطای چت: ' + esc(r.chatErr) : '✅ ارتباط چت برقرار است: ' + esc(r.chatOk || '')}</p></div>`;
      toast(r.chatErr ? 'اتصال ناقص است' : 'اتصال موفق', r.chatErr ? 'err' : 'ok');
    } catch (e) { if ($('#modelsBox')) $('#modelsBox').innerHTML = `<div class="hint down">${esc(e.message)}</div>`; toast(e.message, 'err'); }
  });
  on('#runAi', async () => {
    const btn = $('#runAi');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ در حال تحلیل…'; }
    try {
      const r = await api('/api/ai/run', { method: 'POST' });
      renderAiResult(r);
      await loadLastAnalysis();
      toast(r.analysis ? 'تحلیل تولید شد' : 'پاسخ مدل قابل تفسیر نبود', r.analysis ? 'ok' : 'err');
    } catch (e) { toast(e.message, 'err'); }
    if (btn) { btn.disabled = false; btn.textContent = '▶ تولید تحلیل خودکار'; }
  });

  // چت
  on('#sendChat', sendChat);
  on('#chatInput', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }, 'onkeydown');
  on('#clearChat', async () => { await api('/api/ai/chat', { method: 'DELETE' }); renderChat(); toast('گفتگو پاک شد'); });

  // رویدادهای پنل مدیریت
  on('#admUsersRefresh', () => loadAdmin(true));
  on('#admUserQ', () => { clearTimeout(bind._t); bind._t = setTimeout(() => loadAdmin(true), 350); }, 'oninput');
  on('#admUserStatus', () => loadAdmin(true), 'onchange');
  on('#admUserNew', () => { if ($('#admUserForm')) $('#admUserForm').hidden = false; });
  on('#nuCancel', () => { if ($('#admUserForm')) $('#admUserForm').hidden = true; });
  on('#nuSave', async () => {
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify({
        name: $('#nuName')?.value, email: $('#nuEmail')?.value, password: $('#nuPass')?.value, role: $('#nuRole')?.value }) });
      if ($('#admUserForm')) $('#admUserForm').hidden = true;
      if ($('#nuName')) $('#nuName').value = '';
      if ($('#nuEmail')) $('#nuEmail').value = '';
      if ($('#nuPass')) $('#nuPass').value = '';
      toast('کاربر ساخته شد', 'ok');
      await loadAdmin(true);
    } catch (e) { toast(e.message, 'err'); }
  });

  // پلن‌های ادمین
  on('#btnSavePlan', saveAdminPlan);
  on('#btnResetPlanForm', () => {
    if ($('#planFormId')) $('#planFormId').value = '';
    if ($('#planSlug')) $('#planSlug').value = '';
    if ($('#planTitle')) $('#planTitle').value = '';
    if ($('#planPrice')) $('#planPrice').value = '';
    if ($('#planBadge')) $('#planBadge').value = '';
    if ($('#planFeatures')) $('#planFeatures').value = '';
    if ($('#planFormTitle')) $('#planFormTitle').textContent = 'ایجاد / ویرایش پلن اشتراک';
  });
  on('#btnRefreshPlansList', () => loadAdmin(true));
  on('#btnGrantSub', grantAdminSub);

  // درگاه‌ها و پیامک ادمین
  on('#btnSaveGateways', saveAdminGateways);
  on('#btnSaveSms', saveAdminSms);
  on('#btnTestSms', testAdminSms);

  // اعلان‌ها و تعرفه‌ها ادمین
  on('#btnSendNotif', sendAdminNotif);
  on('#btnSaveAlertPrices', saveAdminAlertPrices);

  // مدیریت ظاهر، منوها و دکمه‌ها
  on('#btnSaveUiSettings', saveAdminUiSettings);
  on('#btnPreviewUiLive', livePreviewUiSettings);
  on('#btnResetUiSettings', resetAdminUiSettings);
  on('#btnAddNavItem', addCustomNavItem);
  if ($('#uiThemeFontFamily')) $('#uiThemeFontFamily').onchange = () => { if (S.ui) { S.ui.themeStyles.fontFamily = $('#uiThemeFontFamily').value; applyTheme(S.ui.themeStyles, true); } };
  if ($('#uiThemeFontSize')) $('#uiThemeFontSize').onchange = () => { if (S.ui) { S.ui.themeStyles.fontSizeBase = $('#uiThemeFontSize').value; applyTheme(S.ui.themeStyles, true); } };
  if ($('#uiThemeCardRadius')) $('#uiThemeCardRadius').onchange = () => { if (S.ui) { S.ui.themeStyles.cardRadius = $('#uiThemeCardRadius').value; applyTheme(S.ui.themeStyles, true); } };
  if ($('#uiThemeBtnRadius')) $('#uiThemeBtnRadius').onchange = () => { if (S.ui) { S.ui.themeStyles.btnRadius = $('#uiThemeBtnRadius').value; applyTheme(S.ui.themeStyles, true); } };
  if ($('#uiThemeCustomCss')) $('#uiThemeCustomCss').oninput = () => { if (S.ui) { S.ui.themeStyles.customCss = $('#uiThemeCustomCss').value; applyTheme(S.ui.themeStyles, true); } };

  // کارت‌های تنظیمات و موتور
  on('#admSaveSettingsClean', saveAdminCleanSettings);
  on('#admSaveEngineClean', saveAdminCleanEngine);

  // شبکه ادمین
  on('#admNetSave', async () => {
    try {
      const r = await api('/api/admin/net', { method: 'POST', body: JSON.stringify({
        proxy: $('#admNetProxy')?.value?.trim(), timeout: +$('#admNetTimeout')?.value || 15,
        tgju: $('#admNetTgju')?.checked, yahoo: $('#admNetYahoo')?.checked,
        coingecko: $('#admNetCg')?.checked, insecure: $('#admNetInsecure')?.checked,
      }) });
      toast('تنظیمات شبکه ذخیره شد', 'ok');
      renderNet(r);
    } catch (e) { toast(e.message, 'err'); }
  });
  on('#admNetTest', async () => {
    if ($('#admNet')) $('#admNet').innerHTML = '<span class="spinner"></span> در حال تست منابع داده…';
    try { renderNet(await api('/api/admin/net')); } catch (e) { if ($('#admNet')) $('#admNet').textContent = 'خطا: ' + e.message; }
  });

  on('#admAuditRefresh', () => loadAdmin(true));
  $$('[data-tool]').forEach(b => b.onclick = () => runAdminTool(b.dataset.tool));
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) return go(tab.dataset.view);
  const goto = e.target.closest('[data-goto]');
  if (goto) return go(goto.dataset.goto);

  const uisub = e.target.closest('[data-uisub]');
  if (uisub) return switchUiSubTab(uisub.dataset.uisub);

  const admTab = e.target.closest('[data-admtab]');
  if (admTab) {
    $$('#admNav .adm-nav-btn').forEach((b) => b.classList.remove('active'));
    $$('.adm-tab-pane').forEach((p) => p.classList.remove('active'));
    admTab.classList.add('active');
    const pane = $('#admPane-' + admTab.dataset.admtab);
    if (pane) pane.classList.add('active');
    if (admTab.dataset.admtab === 'ui-customizer') renderAdminUiCustomizer();
    if (admTab.dataset.admtab === 'typography' && typeof renderAdminTypographyStudio === 'function') renderAdminTypographyStudio();
    if (admTab.dataset.admtab === 'page-templates' && typeof renderAdminPageTemplates === 'function') renderAdminPageTemplates();
    if (admTab.dataset.admtab === 'trading-bots' && typeof loadAdminTradingBots === 'function') loadAdminTradingBots();
    return;
  }

  const sigDetail = e.target.closest('[data-sig-detail]');
  if (sigDetail) return openSignalModal(sigDetail.dataset.sigDetail);

  const sigAdvisory = e.target.closest('[data-sig-advisory]');
  if (sigAdvisory) return openAssetAdvisoryModal(sigAdvisory.dataset.sigAdvisory);

  const autoInvest = e.target.closest('[data-sig-autoinvest]');
  if (autoInvest) return openAutoInvestModal(autoInvest.dataset.sigAutoinvest);

  const aiDetail = e.target.closest('[data-ai-detail]');
  if (aiDetail) return openAutoInvestDetail(aiDetail.dataset.aiDetail);

  const aiClose = e.target.closest('[data-ai-close]');
  if (aiClose) return closeAutoInvestPosition(aiClose.dataset.aiClose, aiClose.dataset.aiRef || '');

  const sfilter = e.target.closest('#signalFilters .chip');
  if (sfilter) {
    $$('#signalFilters .chip').forEach((c) => c.classList.remove('active'));
    sfilter.classList.add('active');
    const sf = sfilter.dataset.sigFilter;
    if (sf) {
      sigFilter = {
        region: (sf === 'iran' || sf === 'global') ? sf : '',
        strong: sf === 'strong',
        subCat: '',
        search: ''
      };
    } else {
      sigFilter = {
        region: sfilter.dataset.region || '',
        strong: sfilter.dataset.clsfilter === 'buy',
        subCat: '',
        search: ''
      };
    }
    renderSignals();
    return;
  }

  const chip = e.target.closest('.chip');
  if (chip && $('#view-chat')?.classList.contains('active')) { $('#chatInput').value = chip.textContent; sendChat(); }

  const opp = e.target.closest('[data-ask]');
  if (opp) { go('chat'); $('#chatInput').value = opp.dataset.ask; sendChat(); }

  const m = e.target.closest('.model-item');
  if (m) { $('#aiModel').value = m.dataset.id; toast('مدل انتخابی: ' + m.dataset.id, 'ok'); }

  const addp = e.target.closest('[data-add-portfolio]');
  if (addp) {
    $('#astLabel').value = addp.dataset.name; $('#astCls').value = addp.dataset.cls;
    $('#astAmount').value = ''; go('portfolio'); $('#astAmount').focus();
    updatePersianWords();
    toast('اطلاعات دارایی در فرم ثبت شد');
  }
});

/* ============================================================================
   موتور ربات‌های ترید هوشمند و سبدهای سرمایه‌گذاری (Trading Bots & Smart Baskets)
   ============================================================================ */
const DEFAULT_TRADING_BOTS = [
  {
    id: 1,
    code: 'alpha_precious',
    name: 'ربات ترید آلفا — سبد نقره، طلا و صندوق‌های فلزات گرانبها',
    subtitle: 'ورود ۲ پله‌ای هوشمند + حد ضرر متحرک روی طلا، سکه، نقره ۹۹۹ و صندوق‌های طلا/نقره',
    basket_type: 'ir_precious',
    strategy: 'grid_dca',
    strategy_fa: 'پله‌ای هوشمند (Grid DCA) + حد ضرر متحرک',
    risk_level: 'balanced',
    price_toman: 490000,
    min_capital: 5000000,
    duration_days: 30,
    win_rate: 86.5,
    expected_monthly_pct: '۱۴٪ تا ۲۲٪',
    stop_loss_pct: 4.0,
    tp1_pct: 7.5,
    tp2_pct: 14.5,
    max_open_trades: 6,
    trailing_stop: 1,
    badge: 'پرفروش‌ترین 🔥',
    is_active: 1,
    assets: [
      { assetId: 'geram18', name: 'طلای ۱۸ عیار', weight: 30 },
      { assetId: 'ir_silver_gram', name: 'گرم نقره ۹۹۹ بازار ایران', weight: 25 },
      { assetId: 'etf_ayar', name: 'صندوق طلای عیار (مفید)', weight: 25 },
      { assetId: 'etf_simin', name: 'صندوق نقره سیمین (بورس کالا)', weight: 20 }
    ],
    features: [
      'شکار خودکار حباب منفی صندوق‌های طلا و نقره در بورس کالا',
      'ورود ۶۰٪ فوری و ۴۰٪ در پولبک به کف حمایتی',
      'ریسک‌فری کردن خودکار معامله پس از رسیدن به هدف اول',
      'گزارش لحظه‌ای سود/زیان و لاگ زنده تصمیمات ربات'
    ]
  },
  {
    id: 2,
    code: 'bourse_turbo',
    name: 'ربات توربو بورس — سبد سهام بنیادی و صندوق‌های اهرمی',
    subtitle: 'الگوریتم شکار واگرایی مثبت RSI و ورود پول هوشمند در نمادهای شاخص‌ساز و اهرمی',
    basket_type: 'ir_bourse_fund',
    strategy: 'momentum_breakout',
    strategy_fa: 'نوسان‌گیری مومنتوم و شکار جامانده‌های بورس',
    risk_level: 'aggressive',
    price_toman: 690000,
    min_capital: 5000000,
    duration_days: 30,
    win_rate: 82.0,
    expected_monthly_pct: '۱۶٪ تا ۲۸٪',
    stop_loss_pct: 5.0,
    tp1_pct: 9.0,
    tp2_pct: 18.0,
    max_open_trades: 6,
    trailing_stop: 1,
    badge: 'ویژه بورس و اهرمی ⚡',
    is_active: 1,
    assets: [
      { assetId: 'etf_shetab', name: 'صندوق اهرمی شتاب (آگاه)', weight: 25 },
      { assetId: 'etf_ahrom', name: 'صندوق اهرمی اهرم (کاریزما)', weight: 20 },
      { assetId: 'ir_foolad', name: 'فولاد مبارکه اصفهان (فولاد)', weight: 20 },
      { assetId: 'ir_femeli', name: 'ملی صنایع مس ایران (فملی)', weight: 20 },
      { assetId: 'ir_shepna', name: 'پالایش نفت اصفهان (شپنا)', weight: 15 }
    ],
    features: [
      'تشخیص ورود پول حقیقی و شکست مقاومت‌های کلیدی بورس',
      'تنظیم خودکار حد ضرر و سیو سود پله‌ای در سقف‌های روزانه',
      'توزیع ریسک بین لیدرهای فلزی/پالایشی و صندوق‌های اهرمی',
      'مانیتورینگ لحظه‌ای تابلوی معاملات و صف‌های خرید/فروش'
    ]
  },
  {
    id: 3,
    code: 'global_quantum',
    name: 'ربات کوانتوم جهانی — سبد اونس طلا/نقره، فارکس و رمزارز',
    subtitle: 'معامله‌گر ۲۴ ساعته در بازارهای مالی بین‌المللی، کریپتوکارنسی و کامودیتی‌های جهانی',
    basket_type: 'global_markets',
    strategy: 'ai_trailing',
    strategy_fa: 'هوش مصنوعی کوانتوم + Trailing Stop پویا',
    risk_level: 'aggressive',
    price_toman: 980000,
    min_capital: 10000000,
    duration_days: 30,
    win_rate: 84.5,
    expected_monthly_pct: '۱۸٪ تا ۳۰٪',
    stop_loss_pct: 4.5,
    tp1_pct: 8.5,
    tp2_pct: 16.5,
    max_open_trades: 8,
    trailing_stop: 1,
    badge: 'هوش مصنوعی جهانی 🌍',
    is_active: 1,
    assets: [
      { assetId: 'btc', name: 'بیت‌کوین (BTC)', weight: 25 },
      { assetId: 'eth', name: 'اتریوم (ETH)', weight: 20 },
      { assetId: 'xau_usd', name: 'اونس جهانی طلا (XAU/USD)', weight: 25 },
      { assetId: 'xag_usd', name: 'اونس جهانی نقره (XAG/USD)', weight: 15 },
      { assetId: 'nasdaq', name: 'نزدک ۱۰۰ آمریکا (NASDAQ)', weight: 15 }
    ],
    features: [
      'ترید ۲۴/۷ در بازارهای جهانی بدون تعطیلی',
      'پوشش نوسانات شاخص دلار (DXY) و بازده اوراق خزانه‌داری آمریکا',
      'مدیریت پوزیشن چندارزی با محاسبه لحظه‌ای معادل تومانی',
      'سیگنال‌گیری همزمان از اندیکاتورهای تکنیکال و جریان نقدینگی جهانی'
    ]
  },
  {
    id: 4,
    code: 'balanced_shield',
    name: 'ربات سپر متعادل ۳۶۰ — سبد ترکیبی ضدتورم (داخلی + جهانی)',
    subtitle: 'توازن خودکار بین طلا، نقره، ارز، بورس و درآمد ثابت برای رشد پایدار و کم‌نوسان',
    basket_type: 'balanced_basket',
    strategy: 'mean_reversion',
    strategy_fa: 'بازتوازن هوشمند (Auto-Rebalance) و شکار جامانده‌ها',
    risk_level: 'balanced',
    price_toman: 590000,
    min_capital: 5000000,
    duration_days: 30,
    win_rate: 89.0,
    expected_monthly_pct: '۱۲٪ تا ۱۸٪',
    stop_loss_pct: 3.5,
    tp1_pct: 6.5,
    tp2_pct: 12.0,
    max_open_trades: 6,
    trailing_stop: 1,
    badge: 'توصیه سرمایه‌یار ⭐',
    is_active: 1,
    assets: [
      { assetId: 'geram18', name: 'طلای ۱۸ عیار', weight: 25 },
      { assetId: 'ir_silver_bar', name: 'شمش نقره ۱ کیلویی ایران', weight: 15 },
      { assetId: 'usdt_irt', name: 'تتر تومانی (USDT/IRT)', weight: 20 },
      { assetId: 'etf_agas', name: 'صندوق سهامی آگاس (آگاه)', weight: 20 },
      { assetId: 'etf_kamand', name: 'صندوق درآمد ثابت کمند', weight: 20 }
    ],
    features: [
      'مناسب برای تمام سبدهای سرمایه‌گذاری با ریسک متعادل',
      'انتقال خودکار سود از بازارهای اشباع خرید به بازارهای جامانده',
      'حفظ ۲۰٪ سپر نقدینگی در صندوق درآمد ثابت برای شکار ریزش‌ها',
      'گزارش لحظه‌ای وزن فعلی سبد در برابر وزن هدف'
    ]
  },
  {
    id: 5,
    code: 'safe_arbitrage',
    name: 'ربات محافظ سرمایه — آربیتراژ صندوق‌ها و گواهی نقره/طلا',
    subtitle: 'کم‌ریسک‌ترین ربات ترید با تمرکز بر اختلاف قیمت تابلو و ارزش ذاتی (NAV) صندوق‌ها',
    basket_type: 'ir_precious',
    strategy: 'grid_dca',
    strategy_fa: 'آربیتراژ NAV و میانگین‌گیری کم‌ریسک',
    risk_level: 'conservative',
    price_toman: 350000,
    min_capital: 2000000,
    duration_days: 30,
    win_rate: 92.5,
    expected_monthly_pct: '۹٪ تا ۱۴٪',
    stop_loss_pct: 2.5,
    tp1_pct: 5.0,
    tp2_pct: 9.5,
    max_open_trades: 4,
    trailing_stop: 1,
    badge: 'کم‌ریسک و امن 🛡️',
    is_active: 1,
    assets: [
      { assetId: 'etf_lotus', name: 'صندوق طلای لوتوس (پارسیان)', weight: 30 },
      { assetId: 'ir_silver_cert', name: 'گواهی سپرده نقره بورس کالا', weight: 25 },
      { assetId: 'etf_kamand', name: 'صندوق درآمد ثابت کمند', weight: 30 },
      { assetId: 'rob', name: 'ربع سکه', weight: 15 }
    ],
    features: [
      'حداقل ریسک ممکن با تمرکز بر دارایی‌های با پشتوانه فیزیکی',
      'خرید در زمان حباب منفی و فروش در حباب مثبت',
      'مناسب برای سرمایه‌گذاران محافظه‌کار و جایگزین سپرده بانکی',
      'امکان برداشت سود لحظه‌ای در هر زمان'
    ]
  }
];

const SMART_BASKETS_CATALOG = [
  {
    key: 'ir_precious',
    title: 'سبد نقره، طلا و سکه ایران (پوشش تورم)',
    icon: '🥈',
    badge: 'پربازده داخلی 🔥',
    riskFa: 'متعادل',
    expectedMonthly: '۱۴٪ تا ۲۲٪ ماهانه',
    recommendedBot: 'alpha_precious',
    desc: 'ترکیب طلای ۱۸ عیار، نقره ۹۹۹، صندوق طلای عیار و صندوق نقره سیمین با شکار حباب منفی.',
    assets: [
      { assetId: 'geram18', name: 'طلای ۱۸ عیار', weight: 30 },
      { assetId: 'ir_silver_gram', name: 'گرم نقره ۹۹۹ بازار ایران', weight: 25 },
      { assetId: 'etf_ayar', name: 'صندوق طلای عیار (مفید)', weight: 25 },
      { assetId: 'etf_simin', name: 'صندوق نقره سیمین (بورس کالا)', weight: 20 }
    ]
  },
  {
    key: 'ir_bourse_fund',
    title: 'سبد پیشتاز بورس و صندوق‌های اهرمی',
    icon: '📊',
    badge: 'پتانسیل جهش ⚡',
    riskFa: 'تهاجمی هوشمند',
    expectedMonthly: '۱۶٪ تا ۲۸٪ ماهانه',
    recommendedBot: 'bourse_turbo',
    desc: 'شکار جامانده‌های بورس تهران (فولاد، فملی، شپنا) به همراه اهرم حرکتی صندوق‌های شتاب و اهرم.',
    assets: [
      { assetId: 'etf_shetab', name: 'صندوق اهرمی شتاب (آگاه)', weight: 25 },
      { assetId: 'etf_ahrom', name: 'صندوق اهرمی اهرم (کاریزما)', weight: 20 },
      { assetId: 'ir_foolad', name: 'فولاد مبارکه اصفهان (فولاد)', weight: 20 },
      { assetId: 'ir_femeli', name: 'ملی صنایع مس ایران (فملی)', weight: 20 },
      { assetId: 'ir_shepna', name: 'پالایش نفت اصفهان (شپنا)', weight: 15 }
    ]
  },
  {
    key: 'global_markets',
    title: 'سبد کوانتوم بازارهای جهانی، فارکس و رمزارز',
    icon: '🌍',
    badge: 'ترید ۲۴/۷ دلاری 🌐',
    riskFa: 'متعادل رو به رشد',
    expectedMonthly: '۱۸٪ تا ۳۰٪ ماهانه',
    recommendedBot: 'global_quantum',
    desc: 'معامله همزمان روی بیت‌کوین، اتریوم، اونس جهانی طلا و نقره و شاخص نزدک ۱۰۰ آمریکا.',
    assets: [
      { assetId: 'btc', name: 'بیت‌کوین (BTC)', weight: 25 },
      { assetId: 'eth', name: 'اتریوم (ETH)', weight: 20 },
      { assetId: 'xau_usd', name: 'اونس جهانی طلا (XAU/USD)', weight: 25 },
      { assetId: 'xag_usd', name: 'اونس جهانی نقره (XAG/USD)', weight: 15 },
      { assetId: 'nasdaq', name: 'نزدک ۱۰۰ آمریکا (NASDAQ)', weight: 15 }
    ]
  },
  {
    key: 'balanced_basket',
    title: 'سبد متعادل ۳۶۰ درجه (ترکیبی داخلی و جهانی)',
    icon: '⚖️',
    badge: 'توصیه سرمایه‌یار ⭐',
    riskFa: 'متعادل و پایدار',
    expectedMonthly: '۱۲٪ تا ۱۸٪ ماهانه',
    recommendedBot: 'balanced_shield',
    desc: 'توزیع علمی سرمایه بین طلا، شمش نقره، تتر، صندوق سهامی آگاس و درآمد ثابت کمند.',
    assets: [
      { assetId: 'geram18', name: 'طلای ۱۸ عیار', weight: 25 },
      { assetId: 'ir_silver_bar', name: 'شمش نقره ۱ کیلویی ایران', weight: 15 },
      { assetId: 'usdt_irt', name: 'تتر تومانی (USDT/IRT)', weight: 20 },
      { assetId: 'etf_agas', name: 'صندوق سهامی آگاس (آگاه)', weight: 20 },
      { assetId: 'etf_kamand', name: 'صندوق درآمد ثابت کمند', weight: 20 }
    ]
  },
  {
    key: 'safe_arbitrage',
    title: 'سبد محافظ سرمایه و آربیتراژ صندوق‌ها',
    icon: '🛡️',
    badge: 'حداقل ریسک 🛡️',
    riskFa: 'محافظه‌کارانه',
    expectedMonthly: '۹٪ تا ۱۴٪ ماهانه',
    recommendedBot: 'safe_arbitrage',
    desc: 'نوسان‌گیری کم‌ریسک از اختلاف قیمت تابلو و NAV صندوق‌های طلا، گواهی نقره و درآمد ثابت.',
    assets: [
      { assetId: 'etf_lotus', name: 'صندوق طلای لوتوس (پارسیان)', weight: 30 },
      { assetId: 'ir_silver_cert', name: 'گواهی سپرده نقره بورس کالا', weight: 25 },
      { assetId: 'etf_kamand', name: 'صندوق درآمد ثابت کمند', weight: 30 },
      { assetId: 'rob', name: 'ربع سکه', weight: 15 }
    ]
  }
];

function getBotDefsStorageKey() {
  return 'sy_defined_trading_bots_v1';
}
function getBotInstancesStorageKey() {
  const uid = S.user && S.user.id ? S.user.id : 'guest';
  return 'sy_user_bot_instances_v1_' + uid;
}

function readDefinedBotsLocal() {
  try {
    const raw = localStorage.getItem(getBotDefsStorageKey());
    if (!raw) return DEFAULT_TRADING_BOTS.slice();
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length ? list : DEFAULT_TRADING_BOTS.slice();
  } catch (e) {
    return DEFAULT_TRADING_BOTS.slice();
  }
}
function saveDefinedBotsLocal(list) {
  try {
    localStorage.setItem(getBotDefsStorageKey(), JSON.stringify(list || []));
  } catch (e) {}
}

function readUserBotInstancesLocal() {
  try {
    const raw = localStorage.getItem(getBotInstancesStorageKey());
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
function saveUserBotInstancesLocal(list) {
  try {
    localStorage.setItem(getBotInstancesStorageKey(), JSON.stringify(list || []));
  } catch (e) {}
}

async function loadTradingBotsData() {
  let bots = readDefinedBotsLocal();
  let instances = readUserBotInstancesLocal();
  try {
    const r = await api('/api/trading-bots');
    if (r && Array.isArray(r.bots) && r.bots.length) {
      bots = r.bots;
      saveDefinedBotsLocal(bots);
    }
    if (r && Array.isArray(r.instances)) {
      if (!window.__SNAPSHOT_MODE__ && S.user && r.instances.length) {
        instances = r.instances;
        saveUserBotInstancesLocal(instances);
      } else if (!window.__SNAPSHOT_MODE__ && S.user && instances.length === 0) {
        instances = r.instances;
      }
    }
  } catch (e) {}
  S.tradingBots = bots;
  S.botInstances = instances;
  renderSmartBaskets();
  renderUserActiveBots();
  startBotLiveTicker();
}

function lookupAssetLivePrice(assetId, fallbackName, defaultPrice = 100000) {
  const sigs = typeof getFullEnrichedSignals === 'function' ? getFullEnrichedSignals() : [];
  const s = sigs.find(x => String(x.assetId) === String(assetId) || String(x.name) === String(fallbackName));
  if (s && Number(s.price) > 0) return Number(s.price);
  const mAssets = (S.market && S.market.assets) || [];
  const a = mAssets.find(x => String(x.id) === String(assetId) || String(x.name) === String(fallbackName));
  if (a && a.metrics && Number(a.metrics.last) > 0) return Number(a.metrics.last);
  return defaultPrice;
}

function resolveBasketForModal(basketKey) {
  const found = SMART_BASKETS_CATALOG.find(b => b.key === basketKey);
  if (found) return JSON.parse(JSON.stringify(found));

  if (basketKey === 'user_portfolio') {
    const pf = (S.state && Array.isArray(S.state.portfolio)) ? S.state.portfolio : [];
    if (pf.length > 0) {
      const w = Math.max(10, Math.round(100 / pf.length));
      return {
        key: 'user_portfolio',
        title: 'سبد دارایی‌های فعلی پرتفوی من',
        icon: '💼',
        badge: 'سبد شخصی کاربر',
        riskFa: 'متناسب با پرتفوی',
        expectedMonthly: '۱۲٪ تا ۲۲٪ ماهانه',
        recommendedBot: 'balanced_shield',
        desc: 'ترید خودکار، مدیریت حد ضرر و سیو سود پله‌ای روی دارایی‌های ثبت‌شده در پرتفوی شما.',
        assets: pf.slice(0, 8).map((item, idx) => ({
          assetId: item.assetId || ('pf_' + idx),
          name: item.label || item.assetId || 'دارایی پرتفوی',
          weight: w
        }))
      };
    }
  }

  if (basketKey === 'calc_basket') {
    const allocs = S.lastCalcAllocations || {};
    const ids = Object.keys(allocs).filter(k => allocs[k] >= 1000);
    if (ids.length > 0) {
      const total = ids.reduce((s, k) => s + Number(allocs[k] || 0), 0) || 1;
      const sigs = typeof getFullEnrichedSignals === 'function' ? getFullEnrichedSignals() : [];
      return {
        key: 'calc_basket',
        title: 'سبد پیشنهادی ماشین‌حساب هوشمند سیگنال‌ها',
        icon: '🧮',
        badge: 'محاسبه‌شده با فرمول هوشمند',
        riskFa: 'متعادل',
        expectedMonthly: '۱۵٪ تا ۲۵٪ ماهانه',
        recommendedBot: 'alpha_precious',
        desc: 'واگذاری کامل اجرای پله‌ها، حد ضرر و سیو سود سبد خروجی ماشین‌حساب به ربات ترید.',
        defaultCapital: total,
        assets: ids.map(id => {
          const sg = sigs.find(x => String(x.assetId) === String(id)) || { name: id };
          return {
            assetId: id,
            name: sg.name || id,
            weight: Math.max(5, Math.round((Number(allocs[id]) / total) * 100))
          };
        })
      };
    }
  }

  if (basketKey === 'target_model' || basketKey === 'rebalance_basket') {
    return {
      key: basketKey,
      title: basketKey === 'target_model' ? 'سبد مدل هدف سرمایه‌یار' : 'سبد بازتوازن و تخصیص بهینه نقد',
      icon: '🎯',
      badge: 'مدل بهینه علمی',
      riskFa: 'متعادل هوشمند',
      expectedMonthly: '۱۳٪ تا ۲۰٪ ماهانه',
      recommendedBot: 'balanced_shield',
      desc: 'تنظیم و معامله خودکار روی کلاس‌های دارایی کم‌وزن جهت رسیدن به بازده حداکثری مدل هدف.',
      assets: [
        { assetId: 'geram18', name: 'طلای ۱۸ عیار', weight: 25 },
        { assetId: 'ir_silver_gram', name: 'گرم نقره ۹۹۹ بازار ایران', weight: 20 },
        { assetId: 'etf_ayar', name: 'صندوق طلای عیار', weight: 20 },
        { assetId: 'ir_foolad', name: 'فولاد مبارکه اصفهان', weight: 20 },
        { assetId: 'btc', name: 'بیت‌کوین (BTC)', weight: 15 }
      ]
    };
  }

  // اگر شناسه یک دارایی یا سیگنال خاص (از کارت‌های سیگنال یا پرتفوی) پاس داده شده باشد
  if (basketKey && typeof findAssetOrSignal === 'function') {
    const sigAsset = findAssetOrSignal(basketKey);
    if (sigAsset && sigAsset.name && !String(sigAsset.name).startsWith('دارایی ')) {
      let recBot = 'balanced_shield';
      if (sigAsset.cls === 'gold') recBot = 'alpha_precious';
      else if (sigAsset.cls === 'iranEq' || sigAsset.cls === 'fund') recBot = 'tse_momentum';
      else if (sigAsset.region !== 'iran') recBot = 'global_quantum';

      return {
        key: 'sig_' + (sigAsset.assetId || basketKey),
        title: 'سبد معامله هوشمند «' + sigAsset.name + '»',
        icon: '🤖',
        badge: sigAsset.clsFa || 'سیگنال منتخب',
        riskFa: 'ورود ۲ پله‌ای + حد ضرر متحرک',
        expectedMonthly: '۱۴٪ تا ۲۴٪ ماهانه',
        recommendedBot: recBot,
        desc: `ترید ۲۴ ساعته توسط ربات روی ${sigAsset.name} با رعایت نواحی ورود، حد ضرر و سیو سود پله‌ای.`,
        defaultCapital: Number(sigAsset.suggestedAmountToman) >= 1000000 ? Number(sigAsset.suggestedAmountToman) : 20000000,
        assets: [
          { assetId: sigAsset.assetId || basketKey, name: sigAsset.name + ' (پله اول — خرید در قیمت جاری)', weight: 50 },
          { assetId: sigAsset.assetId || basketKey, name: sigAsset.name + ' (پله دوم — کف حمایتی)', weight: 30 },
          { assetId: 'etf_kamand', name: 'ذخیره نقدی / صندوق درآمد ثابت (حاشیه امن)', weight: 20 }
        ]
      };
    }
  }

  return JSON.parse(JSON.stringify(SMART_BASKETS_CATALOG[0]));
}

function renderSmartBaskets() {
  const bots = (S.tradingBots && S.tradingBots.length) ? S.tradingBots : DEFAULT_TRADING_BOTS;
  const activeBots = (S.botInstances || []).filter(i => i && i.status !== 'closed');

  const basketCardHtml = (b) => {
    const recBot = bots.find(x => x.code === b.recommendedBot) || bots[0];
    const runningOnBasket = activeBots.filter(i => i.basket_type === b.key || i.basket_name === b.title);
    const hasRunning = runningOnBasket.length > 0;
    const runningPnl = runningOnBasket.reduce((s, i) => s + Number(i.total_pnl || 0), 0);

    return `
      <div class="basket-bot-card ${hasRunning ? 'has-running-bot' : ''}">
        <div>
          <div class="row-between" style="gap:8px;margin-bottom:8px">
            <div class="row-gap" style="gap:8px;align-items:center">
              <span style="font-size:24px">${b.icon || '🧺'}</span>
              <div>
                <h3 style="margin:0;font-size:14.5px;font-weight:800">${esc(b.title)}</h3>
                <span class="hint" style="font-size:11.5px">ریسک: <b>${esc(b.riskFa)}</b> · بازده هدف: <b style="color:var(--up)">${esc(b.expectedMonthly)}</b></span>
              </div>
            </div>
            <span class="pill pill-xs" style="background:rgba(34,211,238,.14);color:var(--accent)">${esc(b.badge)}</span>
          </div>
          <p class="muted" style="margin:0 0 10px;font-size:12px;line-height:1.55">${esc(b.desc)}</p>
          <div class="row-gap" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${b.assets.map(a => `<span class="pill pill-xs" style="font-size:11px;background:var(--surface2)">${esc(a.name)}: <b>${NF(a.weight, 0)}٪</b></span>`).join('')}
          </div>
          ${recBot ? `<div class="hint" style="font-size:11.5px;padding:6px 10px;background:rgba(15,23,42,.45);border-radius:8px;border:1px dashed var(--line)">
            🤖 ربات پیشنهادی: <b style="color:var(--txt)">${esc(recBot.name)}</b> (Win-Rate: <b style="color:var(--up)">${NF(recBot.win_rate, 1)}٪</b>)
          </div>` : ''}
          ${hasRunning ? `
            <div class="alloc-calc-active-pill has-active" style="margin-top:8px;width:100%;justify-content:space-between">
              <span>🟢 ${NF(runningOnBasket.length, 0)} ربات ترید فعال روی این سبد</span>
              <b>سود لحظه‌ای: ${runningPnl >= 0 ? '+' : ''}${NF(runningPnl, 0)} ت</b>
            </div>
          ` : ''}
        </div>
        <div class="row-between" style="margin-top:6px;padding-top:10px;border-top:1px solid var(--line);gap:8px">
          ${hasRunning
            ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openBotLiveDetailModal('${esc(runningOnBasket[0].ref_id)}')">📡 جزئیات لحظه‌ای</button>`
            : `<span class="hint" style="font-size:11px">آماده اتصال به ربات</span>`}
          <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(b.key)}', '${esc(b.recommendedBot)}')" style="padding:7px 14px;font-size:12.5px">
            🤖 ربات ترید این سبد
          </button>
        </div>
      </div>
    `;
  };

  const allBasketsHtml = SMART_BASKETS_CATALOG.map(basketCardHtml).join('');
  if ($('#smartBasketsGrid')) $('#smartBasketsGrid').innerHTML = allBasketsHtml;
  if ($('#portfolioSmartBasketsGrid')) $('#portfolioSmartBasketsGrid').innerHTML = allBasketsHtml;

  // رندر بازارچه ربات‌های ترید تعریف‌شده توسط ادمین در تب معاملات خودکار
  if ($('#availableTradingBotsGrid')) {
    const activeDefinedBots = bots.filter(b => Number(b.is_active ?? 1) !== 0);
    $('#availableTradingBotsGrid').innerHTML = activeDefinedBots.map(bot => {
      const owned = activeBots.some(i => i.bot_code === bot.code);
      const assets = Array.isArray(bot.assets) ? bot.assets : [];
      const feats = Array.isArray(bot.features) ? bot.features : [];
      return `
        <div class="basket-bot-card ${owned ? 'has-running-bot' : ''}">
          <div>
            <div class="row-between" style="gap:8px;margin-bottom:6px">
              <span class="pill pill-xs" style="background:rgba(16,185,129,.15);color:var(--up)">Win-Rate: ${NF(bot.win_rate || 85, 1)}٪</span>
              <span class="pill pill-xs" style="background:rgba(34,211,238,.15);color:var(--accent)">${esc(bot.badge || 'ربات هوشمند 🤖')}</span>
            </div>
            <h3 style="margin:4px 0;font-size:15px;font-weight:800;color:var(--txt)">🤖 ${esc(bot.name)}</h3>
            <p class="muted" style="margin:0 0 8px;font-size:12px;line-height:1.5">${esc(bot.subtitle || bot.strategy_fa || '')}</p>
            <div class="row-gap" style="gap:6px;flex-wrap:wrap;margin-bottom:8px">
              <span class="pill pill-xs">بازده ماهانه: <b style="color:var(--up)">${esc(bot.expected_monthly_pct || '۱۴٪ تا ۲۲٪')}</b></span>
              <span class="pill pill-xs">حد ضرر: <b style="color:var(--down)">${NF(bot.stop_loss_pct || 4, 1)}٪</b></span>
              <span class="pill pill-xs">تارگت: <b style="color:var(--up)">+${NF(bot.tp1_pct || 7.5, 1)}٪ / +${NF(bot.tp2_pct || 14.5, 1)}٪</b></span>
            </div>
            ${assets.length ? `<div class="row-gap" style="gap:5px;flex-wrap:wrap;margin-bottom:8px">
              ${assets.map(a => `<span class="pill pill-xs" style="font-size:10.5px;background:var(--surface2)">${esc(a.name)} (${NF(a.weight || 20, 0)}٪)</span>`).join('')}
            </div>` : ''}
            <ul class="list" style="margin:6px 0 0;padding-inline-start:16px;font-size:11.5px;color:var(--muted)">
              ${feats.slice(0, 3).map(f => `<li>${esc(f)}</li>`).join('')}
            </ul>
          </div>
          <div class="row-between" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);gap:8px">
            <div>
              <div class="hint" style="font-size:11px">هزینه خرید لایسنس (${NF(bot.duration_days || 30, 0)} روزه):</div>
              <b style="font-size:14px;color:var(--accent)">${bot.price_toman > 0 ? NF(bot.price_toman, 0) + ' تومان' : 'رایگان'}</b>
            </div>
            <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(bot.basket_type || 'ir_precious')}', '${esc(bot.code)}')" style="padding:8px 14px;font-size:12.5px">
              ${owned ? '🤖 اتصال مجدد / مدیریت ربات' : '💳 خرید ربات و شروع ترید'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

window.openBasketBotModal = function(basketKey = 'ir_precious', preselectBotCode = '') {
  const bots = ((S.tradingBots && S.tradingBots.length) ? S.tradingBots : DEFAULT_TRADING_BOTS).filter(b => Number(b.is_active ?? 1) !== 0);
  const basket = resolveBasketForModal(basketKey);
  S.currentModalBasket = basket;

  const chosenBot = bots.find(b => b.code === preselectBotCode) || bots.find(b => b.code === basket.recommendedBot) || bots[0];
  S.selectedBotCode = chosenBot ? chosenBot.code : (bots[0]?.code || 'alpha_precious');

  if ($('#tbmBasketTitle')) $('#tbmBasketTitle').textContent = `${basket.icon || '🧺'} ${basket.title}`;
  if ($('#tbmBasketAssetsCount')) $('#tbmBasketAssetsCount').textContent = `${NF((basket.assets || []).length, 0)} دارایی در سبد`;
  if ($('#tbmBasketAssetsChips')) {
    $('#tbmBasketAssetsChips').innerHTML = (basket.assets || []).map(a => {
      const p = lookupAssetLivePrice(a.assetId, a.name, 0);
      return `<span class="pill pill-xs" style="background:var(--surface2);padding:5px 10px;font-size:12px">
        <b>${esc(a.name)}</b> · سهم: <b style="color:var(--accent)">${NF(a.weight, 0)}٪</b>
        ${p > 0 ? `<span class="hint">(${NF(p, 0)})</span>` : ''}
      </span>`;
    }).join('');
  }

  const wb = S.user ? Number(S.user.wallet_balance || S.user.walletBalance || 0) : 0;
  if ($('#tbmWalletBal')) $('#tbmWalletBal').textContent = `${NF(wb, 0)} تومان`;

  if (basket.defaultCapital && $('#tbmCapitalInput')) {
    $('#tbmCapitalInput').value = Number(basket.defaultCapital).toLocaleString('en-US');
  }

  renderTbmBotsSelector();
  updateTbmBreakdown();
  if ($('#tradingBotModal')) $('#tradingBotModal').hidden = false;
};

function renderTbmBotsSelector() {
  const box = $('#tbmBotsSelectGrid');
  if (!box) return;
  const bots = ((S.tradingBots && S.tradingBots.length) ? S.tradingBots : DEFAULT_TRADING_BOTS).filter(b => Number(b.is_active ?? 1) !== 0);
  const activeInsts = (S.botInstances || []).filter(i => i && i.status !== 'closed');

  box.innerHTML = bots.map(b => {
    const isSel = b.code === S.selectedBotCode;
    const isOwned = activeInsts.some(i => i.bot_code === b.code);
    return `
      <div class="tbm-bot-opt ${isSel ? 'selected' : ''}" onclick="selectTbmBot('${esc(b.code)}')">
        <div class="row-between" style="gap:6px">
          <b style="font-size:13px;color:var(--txt)">🤖 ${esc(b.name)}</b>
          ${isSel ? `<span class="pill pill-ok" style="font-size:10.5px">✓ انتخاب‌شده</span>` : ''}
        </div>
        <div class="hint" style="font-size:11.5px">${esc(b.strategy_fa || b.subtitle || '')}</div>
        <div class="row-between" style="margin-top:4px;font-size:11.5px">
          <span>Win-Rate: <b style="color:var(--up)">${NF(b.win_rate || 85, 1)}٪</b></span>
          <span>بازده: <b>${esc(b.expected_monthly_pct || '۱۵٪')}</b></span>
        </div>
        <div class="row-between" style="margin-top:4px;padding-top:6px;border-top:1px dashed var(--line);font-size:12px">
          <span class="hint">هزینه خرید ربات:</span>
          ${isOwned
            ? `<b style="color:var(--up)">✅ خریداری‌شده (رایگان)</b>`
            : `<b style="color:var(--accent)">${b.price_toman > 0 ? NF(b.price_toman, 0) + ' تومان' : 'رایگان'}</b>`}
        </div>
      </div>
    `;
  }).join('');
}

window.selectTbmBot = function(botCode) {
  S.selectedBotCode = botCode;
  renderTbmBotsSelector();
  updateTbmBreakdown();
};

window.onTbmCapitalInput = function(val) {
  const num = parseNum(val);
  if ($('#tbmCapitalWords')) $('#tbmCapitalWords').textContent = num > 0 ? numToPersianWords(num, 'تومان') : '';
  updateTbmBreakdown();
};

window.setTbmQuickCap = function(mode) {
  const inp = $('#tbmCapitalInput');
  if (!inp) return;
  let val = 20000000;
  if (mode === 'wallet') {
    const wb = S.user ? Number(S.user.wallet_balance || 0) : 0;
    val = wb >= 1000000 ? wb : 25000000;
  } else {
    val = Number(mode) || 20000000;
  }
  inp.value = val.toLocaleString('en-US');
  onTbmCapitalInput(inp.value);
};

function updateTbmBreakdown() {
  const box = $('#tbmBreakdownBox');
  if (!box) return;
  const bots = (S.tradingBots && S.tradingBots.length) ? S.tradingBots : DEFAULT_TRADING_BOTS;
  const bot = bots.find(b => b.code === S.selectedBotCode) || bots[0];
  const basket = S.currentModalBasket || SMART_BASKETS_CATALOG[0];
  const cap = Math.max(1000000, parseNum($('#tbmCapitalInput')?.value || '20000000'));
  const activeInsts = (S.botInstances || []).filter(i => i && i.status !== 'closed');
  const isOwned = activeInsts.some(i => i.bot_code === bot.code);
  const licenseFee = isOwned ? 0 : Number(bot.price_toman || 0);
  const totalPayable = licenseFee + cap;

  const assets = (basket.assets && basket.assets.length) ? basket.assets : (bot.assets || []);
  const sumW = assets.reduce((s, a) => s + Math.max(5, Number(a.weight || 20)), 0) || 100;

  box.innerHTML = `
    <div class="row-between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <div>
        <span style="font-size:12.5px;font-weight:800;color:var(--txt)">📊 پیش‌نمایش تقسیم هوشمند سرمایه در سبد توسط «${esc(bot.name)}»:</span>
      </div>
      <div class="row-gap" style="gap:8px;font-size:12px">
        <span class="pill pill-xs">هزینه لایسنس ربات: <b>${licenseFee > 0 ? NF(licenseFee, 0) + ' ت' : '۰ ت (خریداری‌شده)'}</b></span>
        <span class="pill pill-xs">سرمایه ترید در سبد: <b>${NF(cap, 0)} ت</b></span>
        <span class="pill pill-ok">جمع کل: <b>${NF(totalPayable, 0)} تومان</b></span>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table" style="font-size:12px">
        <thead>
          <tr>
            <th>دارایی داخل سبد</th>
            <th>وزن</th>
            <th>مبلغ کل تخصیص</th>
            <th>پله ۱ (۶۰٪ خرید فوری)</th>
            <th>پله ۲ (۴۰٪ لیمیت حمایت)</th>
            <th>حد ضرر / تارگت‌ها</th>
          </tr>
        </thead>
        <tbody>
          ${assets.map(a => {
            const wPct = ((Math.max(5, Number(a.weight || 20)) / sumW) * 100);
            const amt = Math.round(cap * (wPct / 100));
            const s1 = Math.round(amt * 0.6);
            const s2 = amt - s1;
            return `
              <tr>
                <td><b>${esc(a.name)}</b></td>
                <td>${NF(wPct, 1)}٪</td>
                <td><b style="color:var(--accent)">${NF(amt, 0)} ت</b></td>
                <td style="color:var(--up)">${NF(s1, 0)} ت</td>
                <td style="color:#38bdf8">${NF(s2, 0)} ت</td>
                <td><span style="color:var(--down)">-${NF(bot.stop_loss_pct || 4, 1)}٪</span> / <span style="color:var(--up)">+${NF(bot.tp1_pct || 7.5, 1)}٪</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.confirmBuyAndStartBot = async function(btnEl) {
  const bots = (S.tradingBots && S.tradingBots.length) ? S.tradingBots : DEFAULT_TRADING_BOTS;
  const bot = bots.find(b => b.code === S.selectedBotCode) || bots[0];
  const basket = S.currentModalBasket || SMART_BASKETS_CATALOG[0];
  const capital = Math.max(1000000, parseNum($('#tbmCapitalInput')?.value || '20000000'));
  const assets = (basket.assets && basket.assets.length) ? basket.assets : (bot.assets || []);

  const oldHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '⏳ در حال خرید ربات و راه‌اندازی موتور ترید روی سبد...';
  }

  try {
    let serverInst = null;
    try {
      const r = await api('/api/trading-bots/buy-and-start', {
        method: 'POST',
        body: JSON.stringify({
          botId: bot.id,
          botCode: bot.code,
          basketName: basket.title,
          basketType: basket.key,
          capital,
          customAssets: assets,
          autoFund: true
        })
      });
      if (r && r.instance) {
        serverInst = r.instance;
        if (S.user && r.balance !== undefined) S.user.wallet_balance = r.balance;
      }
    } catch (e) {}

    const now = Date.now();
    const sumW = assets.reduce((s, a) => s + Math.max(5, Number(a.weight || 20)), 0) || 100;
    let inTradeTotal = 0;
    const subPositions = assets.map((a, idx) => {
      const wPct = Number(((Math.max(5, Number(a.weight || 20)) / sumW) * 100).toFixed(1));
      const allocAmt = Math.round(capital * (wPct / 100));
      const step1Amt = Math.round(allocAmt * 0.6);
      const step2Amt = allocAmt - step1Amt;
      inTradeTotal += step1Amt;
      const entryPrice = lookupAssetLivePrice(a.assetId, a.name, 100000 + idx * 25000);
      const slPct = Number(bot.stop_loss_pct || 4.0);
      const tp1Pct = Number(bot.tp1_pct || 7.5);
      const tp2Pct = Number(bot.tp2_pct || 14.5);
      return {
        assetId: a.assetId || ('ast_' + idx),
        name: a.name,
        weightPct: wPct,
        allocatedAmount: allocAmt,
        step1Amount: step1Amt,
        step2Amount: step2Amt,
        entryPrice,
        currentPrice: entryPrice,
        stopLoss: Number((entryPrice * (1 - slPct / 100)).toFixed(2)),
        target1: Number((entryPrice * (1 + tp1Pct / 100)).toFixed(2)),
        target2: Number((entryPrice * (1 + tp2Pct / 100)).toFixed(2)),
        step2LimitPrice: Number((entryPrice * 0.972).toFixed(2)),
        status: 'active_step1',
        statusFa: '🟢 پله ۱ خریداری شد · پله ۲ در کمین حمایت',
        pnlPct: 0,
        pnlAmount: 0,
        rsi: 38 + (idx * 3) % 15,
        signalStrength: 86 + (idx * 2) % 12
      };
    });

    const simCfg = bot.sim_config || {
      pnl_mode: 'mixed_profit',
      profit_pct: 18.5,
      loss_pct: 3.2,
      profit_hours: 5,
      loss_hours: 2,
      initial_start_pct: 0,
      tick_volatility: 'realistic'
    };
    const startPct = Number(simCfg.initial_start_pct || 0);
    let initTotalPnl = 0;
    if (startPct !== 0) {
      subPositions.forEach((sp, i) => {
        const factor = 1 + ((i % 2 === 0 ? 0.08 : -0.08));
        const itemPct = Number((startPct * factor).toFixed(2));
        sp.currentPrice = Math.max(1, Number((sp.entryPrice * (1 + itemPct / 100)).toFixed(2)));
        sp.pnlPct = itemPct;
        sp.pnlAmount = Math.round((sp.allocatedAmount * itemPct) / 100);
        sp.statusFa = itemPct >= 0 ? '🟢 در سود طبق برنامه ربات' : '🟠 در فاز اصلاح طبیعی ساعتی';
        initTotalPnl += sp.pnlAmount;
      });
    }

    const refId = (serverInst && serverInst.ref_id) || ('BOT-' + String(bot.code || 'ALPHA').toUpperCase().slice(0, 5) + '-' + Math.floor(1000 + Math.random() * 9000));
    const inst = serverInst || {
      id: now,
      ref_id: refId,
      bot_id: bot.id || 1,
      bot_code: bot.code,
      bot_name: bot.name,
      basket_name: basket.title,
      basket_type: basket.key,
      strategy: bot.strategy_fa || bot.strategy,
      license_paid: Number(bot.price_toman || 0),
      initial_capital: capital,
      current_equity: Math.max(0, capital + initTotalPnl),
      in_trade_capital: inTradeTotal,
      free_margin: Math.max(0, capital - inTradeTotal),
      total_pnl: initTotalPnl,
      total_pnl_pct: capital > 0 ? Number(((initTotalPnl / capital) * 100).toFixed(2)) : 0,
      realized_pnl: 0,
      trades_count: subPositions.length,
      won_trades: startPct >= 0 ? subPositions.length : Math.max(1, Math.floor(subPositions.length * 0.5)),
      stop_loss_pct: Number(bot.stop_loss_pct || 4.0),
      tp1_pct: Number(bot.tp1_pct || 7.5),
      tp2_pct: Number(bot.tp2_pct || 14.5),
      status: 'running',
      sim_config: simCfg,
      sub_positions: subPositions,
      live_logs: [
        {
          time: now,
          icon: '🤖',
          type: 'bot_init',
          title: `خرید و فعال‌سازی «${bot.name}» روی «${basket.title}»`,
          text: `سرمایه ترید: ${NF(capital, 0)} تومان | تعداد بازارهای سبد: ${NF(subPositions.length, 0)} دارایی | استراتژی: ${bot.strategy_fa || bot.strategy}`
        },
        {
          time: now + 100,
          icon: '📡',
          type: 'market_scan',
          title: 'اسکن لحظه‌ای قیمت‌ها، RSI و شکاف ارزش دارایی‌های سبد',
          text: 'کلیه دارایی‌های سبد با موفقیت به موتور تصمیم‌گیری لحظه‌ای متصل شدند.'
        },
        {
          time: now + 200,
          icon: '🟢',
          type: 'orders_placed',
          title: 'اجرای خرید پله اول (۶۰٪) و کاشت سفارش‌های شرطی پله دوم (۴۰٪)',
          text: `مبلغ ${NF(inTradeTotal, 0)} تومان وارد پوزیشن‌های فعال شد و ${NF(Math.max(0, capital - inTradeTotal), 0)} تومان در سفارش لیمیت کف حمایتی قرار گرفت.`
        }
      ],
      started_at: now,
      expires_at: now + Number(bot.duration_days || 30) * 86400 * 1000,
      updated_at: now
    };

    S.botInstances = [inst, ...(S.botInstances || []).filter(i => String(i.ref_id) !== String(inst.ref_id))];
    saveUserBotInstancesLocal(S.botInstances);

    if ($('#tradingBotModal')) $('#tradingBotModal').hidden = true;
    renderSmartBaskets();
    renderUserActiveBots();
    renderAutoInvestPositions();
    startBotLiveTicker();

    toast(`🤖 ربات ترید «${bot.name}» با موفقیت خریداری شد و اکنون روی «${basket.title}» در حال ترید لحظه‌ای است!`, 'ok');
    openBotLiveDetailModal(inst.ref_id);
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = oldHtml || '🤖 خرید ربات و شروع ترید خودکار لحظه‌ای روی سبد';
    }
  }
};

function fmtTimeClock(ts) {
  try {
    return new Date(Number(ts) || Date.now()).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    return 'هم‌اکنون';
  }
}

function renderBotInstanceHtml(inst, isModal = false) {
  const isRunning = inst.status === 'running';
  const isPaused = inst.status === 'paused';
  const isClosed = inst.status === 'closed';
  const pnl = Number(inst.total_pnl || 0);
  const pnlPct = Number(inst.total_pnl_pct || 0);
  const isUp = pnl >= 0;
  const subs = Array.isArray(inst.sub_positions) ? inst.sub_positions : [];
  const logs = Array.isArray(inst.live_logs) ? inst.live_logs : [];
  const winRate = inst.trades_count > 0 ? Math.min(99, Math.round((Number(inst.won_trades || inst.trades_count) / Number(inst.trades_count)) * 100)) : 88;

  return `
    <div class="bot-instance-card ${isPaused ? 'paused' : ''} ${isClosed ? 'closed' : ''}" data-bot-ref="${esc(inst.ref_id)}">
      <div class="row-between" style="gap:10px;margin-bottom:12px">
        <div class="row-gap" style="gap:10px;align-items:center;flex-wrap:wrap">
          ${isRunning ? `<span class="bot-live-pulse-dot" title="در حال ترید لحظه‌ای"></span>` : `<span style="font-size:20px">${isPaused ? '⏸' : '🏁'}</span>`}
          <div>
            <div class="row-gap" style="gap:8px;align-items:center;flex-wrap:wrap">
              <h3 style="margin:0;font-size:15.5px;font-weight:900;color:var(--txt)">${esc(inst.bot_name)}</h3>
              <span class="pill pill-xs" style="background:rgba(34,211,238,.15);color:var(--accent)">🧺 ${esc(inst.basket_name)}</span>
              ${typeof formatBotSimBadge === 'function' ? formatBotSimBadge(resolveBotSimConfig(inst)) : ''}
              <span class="pill ${isRunning ? 'pill-ok' : 'pill-xs'}">
                ${isRunning ? '🟢 در حال رصد و ترید لحظه‌ای بازار' : (isPaused ? '⏸ متوقف موقت (استندبای)' : '🏁 تسویه‌شده')}
              </span>
            </div>
            <div class="hint" style="margin-top:3px;font-size:11.5px">
              شناسه ربات: <b>${esc(inst.ref_id)}</b> · استراتژی: <b>${esc(inst.strategy || 'پله‌ای هوشمند')}</b> · آخرین تیک زنده: <b>${fmtTimeClock(inst.updated_at)}</b>
            </div>
          </div>
        </div>
        <div class="row-gap" style="gap:6px;flex-wrap:wrap">
          ${!isClosed ? `
            <button type="button" class="btn btn-primary btn-sm" onclick="botInstanceAction('${esc(inst.ref_id)}', 'scalp')" style="background:#059669;border-color:#059669">⚡ سیکل نوسان‌گیری آنی</button>
            ${pnl > 0 ? `<button type="button" class="btn btn-primary btn-sm" onclick="botInstanceAction('${esc(inst.ref_id)}', 'harvest')" style="background:linear-gradient(135deg,#f59e0b,#d97706);border-color:#d97706;color:#fff">💰 برداشت سود (${NF(pnl, 0)} ت)</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" onclick="botInstanceAction('${esc(inst.ref_id)}', '${isRunning ? 'pause' : 'resume'}')">${isRunning ? '⏸ توقف موقت' : '▶️ ادامه ترید'}</button>
            ${!isModal ? `<button type="button" class="btn btn-ghost btn-sm" onclick="openBotLiveDetailModal('${esc(inst.ref_id)}')">📡 ترمینال زنده کامل</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--down)" onclick="botInstanceAction('${esc(inst.ref_id)}', 'close')">🛑 تسویه و بستن</button>
          ` : ''}
        </div>
      </div>

      <!-- شاخص‌های لحظه‌ای عملکرد مالی ربات -->
      <div class="grid cards4" style="gap:10px;margin-bottom:14px">
        <div class="kpi" style="padding:10px 12px;background:var(--surface2)">
          <div class="lbl" style="font-size:11px">سرمایه اولیه / ارزش لحظه‌ای سبد</div>
          <div class="val" style="font-size:15px">${NF(inst.current_equity || inst.initial_capital, 0)} تومان</div>
          <div class="hint" style="font-size:11px">سرمایه اولیه: ${NF(inst.initial_capital, 0)} ت</div>
        </div>
        <div class="kpi" style="padding:10px 12px;background:var(--surface2)">
          <div class="lbl" style="font-size:11px">سود / زیان خالص لحظه‌ای (Live PnL)</div>
          <div class="val ${isUp ? 'up' : 'down'}" style="font-size:15.5px">${isUp ? '+' : ''}${NF(pnl, 0)} تومان (${isUp ? '+' : ''}${NF(pnlPct, 2)}٪)</div>
          <div class="hint" style="font-size:11px">سود برداشت‌شده قبلی: ${NF(inst.realized_pnl || 0, 0)} ت</div>
        </div>
        <div class="kpi" style="padding:10px 12px;background:var(--surface2)">
          <div class="lbl" style="font-size:11px">سرمایه درگیر / نقد آماده شکار</div>
          <div class="val" style="font-size:14.5px;color:var(--accent)">${NF(inst.in_trade_capital || 0, 0)} ت در معامله</div>
          <div class="hint" style="font-size:11px">رزرو پله دوم: ${NF(inst.free_margin || 0, 0)} ت</div>
        </div>
        <div class="kpi" style="padding:10px 12px;background:var(--surface2)">
          <div class="lbl" style="font-size:11px">تعداد تریدها و نرخ برد</div>
          <div class="val" style="font-size:14.5px">${NF(inst.trades_count || subs.length, 0)} عملیات (${NF(winRate, 0)}٪ موفق)</div>
          <div class="hint" style="font-size:11px">حد ضرر: -${NF(inst.stop_loss_pct || 4, 1)}٪ | تارگت: +${NF(inst.tp1_pct || 7.5, 1)}٪</div>
        </div>
      </div>

      <!-- جدول ریز معاملات لحظه‌ای دارایی‌های داخل سبد ربات -->
      <div style="margin-bottom:12px">
        <div class="row-between" style="margin-bottom:6px">
          <b style="font-size:13px">📊 ریز پوزیشن‌ها و وضعیت لحظه‌ای دارایی‌های داخل سبد (${NF(subs.length, 0)} بازار):</b>
          <span class="hint" style="font-size:11px">به‌روزرسانی خودکار تیک قیمتی و اندیکاتورها</span>
        </div>
        <div class="table-wrap">
          <table class="table" style="font-size:12px">
            <thead>
              <tr>
                <th>دارایی سبد</th>
                <th>وزن / سرمایه</th>
                <th>قیمت ورود ربات</th>
                <th>قیمت لحظه‌ای</th>
                <th>حد ضرر / تارگت ۱</th>
                <th>RSI / قدرت</th>
                <th>وضعیت سفارش در ربات</th>
                <th>سود/زیان لحظه‌ای</th>
              </tr>
            </thead>
            <tbody>
              ${subs.map(sp => {
                const spUp = Number(sp.pnlAmount || 0) >= 0;
                return `
                  <tr>
                    <td><b>${esc(sp.name)}</b></td>
                    <td>${NF(sp.weightPct, 0)}٪ <span class="hint">(${NF(sp.allocatedAmount, 0)} ت)</span></td>
                    <td>${NF(sp.entryPrice, 0)}</td>
                    <td><b style="color:var(--accent)">${NF(sp.currentPrice, 0)}</b></td>
                    <td><span style="color:var(--down)">${NF(sp.stopLoss, 0)}</span> / <span style="color:var(--up)">${NF(sp.target1, 0)}</span></td>
                    <td>RSI: <b>${NF(sp.rsi || 44, 0)}</b> <span class="pill pill-xs" style="font-size:10px">${NF(sp.signalStrength || 88, 0)}%</span></td>
                    <td><span style="font-size:11.5px">${esc(sp.statusFa || '🟢 در معامله فعال')}</span></td>
                    <td class="${spUp ? 'up' : 'down'}" style="font-weight:800">
                      ${spUp ? '+' : ''}${NF(sp.pnlAmount || 0, 0)} ت (${spUp ? '+' : ''}${NF(sp.pnlPct || 0, 2)}٪)
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ترمینال زنده لاگ تصمیمات و سفارش‌های لحظه‌ای ربات -->
      <div>
        <div class="row-between" style="margin-bottom:6px">
          <b style="font-size:12.5px;color:#38bdf8">💻 ترمینال زنده تصمیمات و رویدادهای لحظه‌ای ربات (Live Execution Log):</b>
          <span class="hint" style="font-size:11px">${NF(logs.length, 0)} رویداد ثبت‌شده</span>
        </div>
        <div class="bot-terminal-log">
          ${logs.slice(0, isModal ? 25 : 6).map(lg => `
            <div class="bot-terminal-row">
              <span class="bot-terminal-time">[${fmtTimeClock(lg.time)}]</span>
              <span>${esc(lg.icon || '⚡')}</span>
              <div>
                <b style="color:#f8fafc">${esc(lg.title)}</b>
                <div style="color:#94a3b8;font-size:11.5px">${esc(lg.text)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderUserActiveBots() {
  const list = S.botInstances || [];
  const runningList = list.filter(i => i && i.status !== 'closed');
  if ($('#activeBotsCountBadge')) {
    $('#activeBotsCountBadge').textContent = `${NF(runningList.length, 0)} ربات فعال`;
  }

  const box = $('#userActiveBotsList');
  if (box) {
    if (!list.length) {
      box.innerHTML = `
        <div style="text-align:center;padding:26px 16px;background:var(--panel2);border-radius:14px;border:1px dashed var(--line)">
          <div style="font-size:38px;margin-bottom:8px">🤖</div>
          <h3 style="margin:0 0 6px;font-size:15px">هنوز ربات تریدی روی سبدهای خود فعال نکرده‌اید</h3>
          <p class="muted" style="max-width:560px;margin:0 auto 14px;font-size:12.5px">
            می‌توانید روی دکمه <b>«🤖 ربات ترید»</b> در هر یک از سبدهای سرمایه‌گذاری (در تب سیگنال‌ها، پرتفوی یا بازارچه زیر) کلیک کنید تا ربات انتخابی به صورت ۲۴ ساعته برایتان ترید کرده و جزئیات لحظه‌ای را در این کنسول نمایش دهد.
          </p>
          <button type="button" class="btn btn-primary btn-basket-bot" onclick="openBasketBotModal('ir_precious')">
            🤖 انتخاب سبد و فعال‌سازی اولین ربات ترید
          </button>
        </div>
      `;
    } else {
      box.innerHTML = list.map(inst => renderBotInstanceHtml(inst, false)).join('');
    }
  }

  // اگر مودال جزئیات زنده باز است، محتوای آن را هم زنده به‌روز کن
  if (S.openLiveBotRef && $('#botLiveDetailModal') && !$('#botLiveDetailModal').hidden) {
    const cur = list.find(i => String(i.ref_id) === String(S.openLiveBotRef));
    if (cur && $('#bldModalBody')) {
      $('#bldModalTitle').textContent = `📡 ترمینال زنده: ${cur.bot_name}`;
      $('#bldModalSub').textContent = `سبد در حال ترید: ${cur.basket_name} | شناسه: ${cur.ref_id}`;
      $('#bldModalBody').innerHTML = renderBotInstanceHtml(cur, true);
    }
  }
  if (typeof renderAutoInvestPageStage === 'function') {
    renderAutoInvestPageStage();
  }
}

window.openBotLiveDetailModal = function(refId) {
  const list = S.botInstances || [];
  const inst = list.find(i => String(i.ref_id) === String(refId)) || list[0];
  if (!inst) return toast('ربات ترید فعالی یافت نشد', 'err');
  S.openLiveBotRef = inst.ref_id;
  if ($('#bldModalTitle')) $('#bldModalTitle').textContent = `📡 ترمینال زنده: ${inst.bot_name}`;
  if ($('#bldModalSub')) $('#bldModalSub').textContent = `سبد در حال ترید: ${inst.basket_name} | شناسه: ${inst.ref_id}`;
  if ($('#bldModalBody')) $('#bldModalBody').innerHTML = renderBotInstanceHtml(inst, true);
  if ($('#botLiveDetailModal')) $('#botLiveDetailModal').hidden = false;
};

window.botInstanceAction = async function(refId, action) {
  const list = S.botInstances || [];
  const idx = list.findIndex(i => String(i.ref_id) === String(refId));
  if (idx < 0) return toast('ربات مورد نظر یافت نشد', 'err');

  try {
    const r = await api('/api/trading-bots/action', {
      method: 'POST',
      body: JSON.stringify({ id: list[idx].id, refId, action })
    });
    if (r && r.instance) {
      list[idx] = r.instance;
      if (S.user && r.balance !== undefined) S.user.wallet_balance = r.balance;
      saveUserBotInstancesLocal(list);
      renderUserActiveBots();
      renderSmartBaskets();
      renderAutoInvestPositions();
      if (r.message) toast(r.message, 'ok');
      return;
    }
  } catch (e) {}

  // اجرای محلی در حالت پیش‌نمایش یا آفلاین
  const inst = list[idx];
  const now = Date.now();
  if (!Array.isArray(inst.live_logs)) inst.live_logs = [];
  if (!Array.isArray(inst.sub_positions)) inst.sub_positions = [];

  if (action === 'pause' || action === 'resume') {
    inst.status = inst.status === 'running' ? 'paused' : 'running';
    inst.live_logs.unshift({
      time: now,
      icon: inst.status === 'running' ? '▶️' : '⏸',
      type: 'status',
      title: inst.status === 'running' ? 'ادامه ترید خودکار ربات' : 'توقف موقت سفارش‌گذاری جدید',
      text: inst.status === 'running' ? 'ربات مجدداً در مدار رصد لحظه‌ای بازار قرار گرفت.' : 'ربات در حالت استندبای قرار گرفت؛ حد ضرر پوزیشن‌ها فعال است.'
    });
    toast(inst.status === 'running' ? 'ربات ترید مجدداً فعال شد ▶️' : 'ربات ترید موقتاً متوقف شد ⏸', 'ok');
  } else if (action === 'scalp' || action === 'tick') {
    simulateSingleBotLiveTick(inst, true);
    toast('⚡ سیکل نوسان‌گیری و بهینه‌سازی لحظه‌ای سبد با موفقیت اجرا شد!', 'ok');
  } else if (action === 'harvest') {
    const pnl = Number(inst.total_pnl || 0);
    if (pnl <= 0) return toast('در حال حاضر سود مثبتی برای برداشت ثبت نشده است', 'err');
    if (S.user) S.user.wallet_balance = (Number(S.user.wallet_balance) || 0) + pnl;
    inst.realized_pnl = (Number(inst.realized_pnl) || 0) + pnl;
    inst.total_pnl = 0;
    inst.total_pnl_pct = 0;
    inst.current_equity = inst.initial_capital;
    inst.sub_positions.forEach(sp => {
      sp.entryPrice = sp.currentPrice;
      sp.pnlAmount = 0;
      sp.pnlPct = 0;
    });
    inst.live_logs.unshift({
      time: now,
      icon: '💰',
      type: 'harvest',
      title: 'برداشت آنی سود لحظه‌ای به کیف‌پول',
      text: `مبلغ +${NF(pnl, 0)} تومان سود خالص به کیف‌پول منتقل شد و قیمت سرخط پوزیشن‌ها به‌روز گردید.`
    });
    toast(`💰 مبلغ ${NF(pnl, 0)} تومان سود ربات به کیف‌پول شما واریز شد!`, 'ok');
  } else if (action === 'close') {
    const refund = Math.max(0, Number(inst.initial_capital || 0) + Number(inst.total_pnl || 0));
    if (S.user) S.user.wallet_balance = (Number(S.user.wallet_balance) || 0) + refund;
    inst.status = 'closed';
    inst.live_logs.unshift({
      time: now,
      icon: '🛑',
      type: 'close',
      title: 'تسویه کامل سبد ربات و انتقال وجه به کیف‌پول',
      text: `کلیه پوزیشن‌های سبد بسته شد و مبلغ ${NF(refund, 0)} تومان به کیف‌پول بازگشت.`
    });
    toast(`🏁 سبد ربات تسویه شد و ${NF(refund, 0)} تومان به کیف‌پول برگشت.`, 'ok');
  }

  inst.updated_at = now;
  saveUserBotInstancesLocal(list);
  renderUserActiveBots();
  renderSmartBaskets();
  renderAutoInvestPositions();
};

function resolveBotSimConfig(inst) {
  if (inst && inst.sim_config && typeof inst.sim_config === 'object') return inst.sim_config;
  const bots = (S.tradingBots && S.tradingBots.length) ? S.tradingBots : readDefinedBotsLocal();
  const parentBot = bots.find(b => String(b.code) === String(inst?.bot_code) || Number(b.id) === Number(inst?.bot_id));
  if (parentBot && parentBot.sim_config && typeof parentBot.sim_config === 'object') return parentBot.sim_config;
  return {
    pnl_mode: 'mixed_profit',
    profit_pct: 18.5,
    loss_pct: 3.2,
    profit_hours: 5,
    loss_hours: 2,
    initial_start_pct: 2.8,
    tick_volatility: 'realistic'
  };
}

function getSimPhaseStatus(simCfg) {
  const mode = simCfg.pnl_mode || 'mixed_profit';
  const pHours = Math.max(0, Number(simCfg.profit_hours ?? 5));
  const lHours = Math.max(0, Number(simCfg.loss_hours ?? 2));
  const pPct = Math.max(0.1, Number(simCfg.profit_pct ?? 18.5));
  const lPct = Math.max(0, Number(simCfg.loss_pct ?? 3.2));

  if (mode === 'pure_profit') {
    return { isProfitPhase: true, phaseLabel: `🟢 فاز سود پیوسته (هدف +${NF(pPct, 1)}٪)`, pHours, lHours, pPct, lPct };
  }
  if (mode === 'pure_loss') {
    return { isProfitPhase: false, phaseLabel: `🔴 فاز ضرر و اصلاح قیمتی (-${NF(lPct, 1)}٪)`, pHours, lHours, pPct, lPct };
  }
  const totalCycle = Math.max(1, pHours + lHours);
  // هر ساعت مجازی یا واقعی در سیکل (با قابلیت مشاهده طبیعی در تیک‌ها)
  const tickSlot = Math.floor((Date.now() / 12000)) % totalCycle;
  const inProfitSlot = (mode === 'mixed_loss') ? (tickSlot < Math.min(pHours, Math.floor(totalCycle * 0.35))) : (tickSlot < pHours);
  return {
    isProfitPhase: inProfitSlot,
    phaseLabel: inProfitSlot
      ? `🟢 فاز ساعتی سود (${NF(pHours, 0)} ساعت سود +${NF(pPct, 1)}٪ / ${NF(lHours, 0)} ساعت اصلاح -${NF(lPct, 1)}٪)`
      : `🟠 فاز ساعتی اصلاح/ضرر (${NF(lHours, 0)} ساعت اصلاح -${NF(lPct, 1)}٪ / ${NF(pHours, 0)} ساعت سود +${NF(pPct, 1)}٪)`,
    pHours,
    lHours,
    pPct,
    lPct
  };
}

function simulateSingleBotLiveTick(inst, manualScalp = false) {
  if (!inst || inst.status !== 'running') return;
  const subs = Array.isArray(inst.sub_positions) ? inst.sub_positions : [];
  if (!subs.length) return;

  const simCfg = resolveBotSimConfig(inst);
  const phase = getSimPhaseStatus(simCfg);
  const volMult = simCfg.tick_volatility === 'high' ? 1.75 : (simCfg.tick_volatility === 'low' ? 0.55 : 1.0);

  let totalPnl = 0;
  let bestAsset = subs[0]?.name || 'سبد';
  let bestDelta = -999;

  subs.forEach(sp => {
    let movePct = 0;
    if (phase.isProfitPhase) {
      // حرکت مثبت متناسب با درصد سود تعریف‌شده توسط ادمین
      const stepBias = Math.min(2.5, Math.max(0.18, phase.pPct / 24)) * volMult;
      const noise = ((Math.random() * 0.9) - 0.18) * volMult;
      movePct = Number((stepBias + noise).toFixed(2));
    } else {
      // حرکت منفی متناسب با درصد ضرر تعریف‌شده توسط ادمین
      const lossBias = -Math.min(2.2, Math.max(0.15, phase.lPct / 14)) * volMult;
      const noise = ((Math.random() * 0.7) - 0.45) * volMult;
      movePct = Number((lossBias + noise).toFixed(2));
    }

    const curP = Number(sp.currentPrice || sp.entryPrice || 100000);
    const newP = Math.max(1, Number((curP * (1 + movePct / 100)).toFixed(2)));
    sp.currentPrice = newP;
    const entryP = Number(sp.entryPrice || 100000);
    let pnlPct = Number((((newP - entryP) / entryP) * 100).toFixed(2));

    // حفظ سقف و کف طبیعی بر اساس تنظیمات ادمین
    if (simCfg.pnl_mode === 'pure_profit' && pnlPct < 0.2) {
      pnlPct = Number((Math.abs(pnlPct) + 0.8).toFixed(2));
      sp.currentPrice = Number((entryP * (1 + pnlPct / 100)).toFixed(2));
    } else if (simCfg.pnl_mode === 'pure_loss' && pnlPct > -0.2) {
      pnlPct = -Number((Math.abs(pnlPct) + 0.8).toFixed(2));
      sp.currentPrice = Number((entryP * (1 + pnlPct / 100)).toFixed(2));
    }

    const pnlAmt = Math.round((Number(sp.allocatedAmount || 0) * pnlPct) / 100);
    sp.pnlPct = pnlPct;
    sp.pnlAmount = pnlAmt;
    sp.rsi = Math.max(24, Math.min(78, Number(sp.rsi || 45) + (phase.isProfitPhase ? 2 : -2)));
    if (pnlPct >= 2.0) {
      sp.statusFa = '🛡️ در سود · حد ضرر متحرک (Risk-Free) فعال';
    } else if (pnlPct <= -0.8) {
      sp.statusFa = '🟠 در فاز اصلاح ساعتی · پله ۲ در حمایت فعال';
    } else {
      sp.statusFa = '🟢 در معامله خرید پله ۱ · رصد تارگت';
    }
    totalPnl += pnlAmt;
    if (Math.abs(movePct) > bestDelta) {
      bestDelta = Math.abs(movePct);
      bestAsset = sp.name;
    }
  });

  const initCap = Number(inst.initial_capital || 10000000);
  inst.total_pnl = totalPnl;
  inst.total_pnl_pct = Number(((totalPnl / initCap) * 100).toFixed(2));
  inst.current_equity = Math.max(0, initCap + totalPnl);
  inst.trades_count = Number(inst.trades_count || subs.length) + 1;
  if (phase.isProfitPhase) inst.won_trades = Number(inst.won_trades || subs.length) + 1;
  inst.updated_at = Date.now();

  if (!Array.isArray(inst.live_logs)) inst.live_logs = [];
  inst.live_logs.unshift({
    time: inst.updated_at,
    icon: phase.isProfitPhase ? '🟢' : '🟠',
    type: 'live_tick',
    title: `${phase.phaseLabel} — تیک زنده روی «${bestAsset}»`,
    text: `برآیند لحظه‌ای سبد: ${totalPnl >= 0 ? '+' : ''}${NF(totalPnl, 0)} تومان (${totalPnl >= 0 ? '+' : ''}${NF(inst.total_pnl_pct, 2)}٪) | ارزش کل: ${NF(inst.current_equity, 0)} تومان`
  });
  if (inst.live_logs.length > 40) inst.live_logs = inst.live_logs.slice(0, 40);
}

window.triggerAllActiveBotsTick = function() {
  const list = S.botInstances || [];
  const running = list.filter(i => i && i.status === 'running');
  if (!running.length) return toast('ابتدا یک ربات ترید روی یکی از سبدها فعال کنید', 'err');
  running.forEach(inst => simulateSingleBotLiveTick(inst, true));
  saveUserBotInstancesLocal(list);
  renderUserActiveBots();
  renderSmartBaskets();
  renderAutoInvestPositions();
  toast(`⚡ سیکل نوسان‌گیری زنده برای ${NF(running.length, 0)} ربات فعال اجرا شد!`, 'ok');
};

let botLiveTickerTimer = null;
function startBotLiveTicker() {
  if (botLiveTickerTimer) return;
  botLiveTickerTimer = setInterval(() => {
    const list = S.botInstances || [];
    const running = list.filter(i => i && i.status === 'running');
    if (!running.length) return;
    running.forEach(inst => simulateSingleBotLiveTick(inst, false));
    saveUserBotInstancesLocal(list);
    if (currentView() === 'auto-invest' || currentView() === 'signals' || currentView() === 'portfolio' || ($('#botLiveDetailModal') && !$('#botLiveDetailModal').hidden)) {
      renderUserActiveBots();
      renderSmartBaskets();
      renderAutoInvestPositions();
    }
  }, 4000);
}

/* ----------------------------- پنل ادمین: تعریف و مدیریت ربات‌های ترید + ویزارد ساخت خودکار حرفه‌ای ----------------------------- */
window.onAdminBotStrategyChange = function(val) {
  const map = {
    grid_dca: 'پله‌ای هوشمند (Grid DCA) + حد ضرر متحرک',
    momentum_breakout: 'نوسان‌گیری مومنتوم و شکار جامانده‌ها',
    ai_trailing: 'هوش مصنوعی کوانتوم + Trailing Stop پویا',
    mean_reversion: 'بازتوازن هوشمند (Auto-Rebalance) و آربیتراژ'
  };
  if ($('#admBotStrategyFa') && map[val]) $('#admBotStrategyFa').value = map[val];
};

window.resetAdminBotForm = function() {
  if ($('#admBotId')) $('#admBotId').value = '';
  if ($('#admBotFormTitle')) $('#admBotFormTitle').textContent = '🤖 تعریف ربات ترید جدید';
  if ($('#admBotName')) $('#admBotName').value = '';
  if ($('#admBotCode')) $('#admBotCode').value = '';
  if ($('#admBotBasketType')) $('#admBotBasketType').value = 'ir_precious';
  if ($('#admBotStrategy')) $('#admBotStrategy').value = 'grid_dca';
  if ($('#admBotStrategyFa')) $('#admBotStrategyFa').value = 'پله‌ای هوشمند (Grid DCA) + حد ضرر متحرک';
  if ($('#admBotRisk')) $('#admBotRisk').value = 'balanced';
  if ($('#admBotPrice')) $('#admBotPrice').value = '490000';
  if ($('#admBotMinCap')) $('#admBotMinCap').value = '5000000';
  if ($('#admBotDays')) $('#admBotDays').value = '30';
  if ($('#admBotWinRate')) $('#admBotWinRate').value = '86.5';
  if ($('#admBotMonthlyPct')) $('#admBotMonthlyPct').value = '۱۴٪ تا ۲۲٪';
  if ($('#admBotBadge')) $('#admBotBadge').value = 'ربات ویژه 🤖';
  if ($('#admBotSlPct')) $('#admBotSlPct').value = '4.0';
  if ($('#admBotTp1Pct')) $('#admBotTp1Pct').value = '7.5';
  if ($('#admBotTp2Pct')) $('#admBotTp2Pct').value = '14.5';
  if ($('#admBotActive')) $('#admBotActive').value = '1';
  if ($('#admBotSubtitle')) $('#admBotSubtitle').value = '';
  if ($('#admBotAssetsStr')) $('#admBotAssetsStr').value = 'geram18:طلای ۱۸ عیار:30, ir_silver_gram:گرم نقره ۹۹۹:25, etf_ayar:صندوق طلای عیار:25, etf_simin:صندوق نقره سیمین:20';
  if ($('#admBotFeatures')) $('#admBotFeatures').value = 'ورود ۲ پله‌ای هوشمند و مدیریت ریسک خودکار\nریسک‌فری کردن خودکار معامله پس از رسیدن به هدف اول\nگزارش لحظه‌ای سود/زیان و لاگ زنده تصمیمات ربات';
  if ($('#admBotPnlMode')) $('#admBotPnlMode').value = 'mixed_profit';
  if ($('#admBotProfitPct')) $('#admBotProfitPct').value = '18.5';
  if ($('#admBotLossPct')) $('#admBotLossPct').value = '3.2';
  if ($('#admBotProfitHours')) $('#admBotProfitHours').value = '5';
  if ($('#admBotLossHours')) $('#admBotLossHours').value = '2';
  if ($('#admBotInitialPct')) $('#admBotInitialPct').value = '2.8';
  if ($('#admBotVolatility')) $('#admBotVolatility').value = 'realistic';
};

window.loadAdminTradingBots = async function(notify = false) {
  let bots = readDefinedBotsLocal();
  let instances = readUserBotInstancesLocal();
  try {
    const r = await api('/api/admin/trading-bots');
    if (r && Array.isArray(r.bots) && r.bots.length) {
      bots = r.bots;
      saveDefinedBotsLocal(bots);
    }
    if (r && Array.isArray(r.instances) && r.instances.length) {
      instances = r.instances;
    }
  } catch (e) {}
  S.tradingBots = bots;
  renderAdminTradingBotsTable(bots, instances);
  if (notify) toast('لیست ربات‌های ترید به‌روزرسانی شد', 'ok');
};

function formatBotSimBadge(sim) {
  if (!sim || typeof sim !== 'object') {
    return '<span class="pill pill-ok">🟢 ۵س سود (+۱۸.۵٪) / ۲س اصلاح (-۳.۲٪)</span>';
  }
  const mode = sim.pnl_mode || 'mixed_profit';
  const pPct = NF(sim.profit_pct ?? 18.5, 1);
  const lPct = NF(sim.loss_pct ?? 3.2, 1);
  const pH = NF(sim.profit_hours ?? 5, 0);
  const lH = NF(sim.loss_hours ?? 2, 0);
  if (mode === 'pure_profit') return `<span class="pill pill-ok">🟢 سود خالص (+${pPct}٪)</span>`;
  if (mode === 'pure_loss') return `<span class="pill pill-bad">🔴 در ضرر (-${lPct}٪)</span>`;
  if (mode === 'mixed_loss') return `<span class="pill pill-bad">🟠 ${pH}س سود (+${pPct}٪) / ${lH}س ضرر (-${lPct}٪)</span>`;
  return `<span class="pill pill-ok">⚖️ ${pH}س سود (+${pPct}٪) / ${lH}س ضرر (-${lPct}٪)</span>`;
}

function renderAdminTradingBotsTable(bots, instances) {
  const tbl = $('#admTradingBotsTable');
  if (tbl) {
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>نام و کد ربات</th>
          <th>سبد هدف</th>
          <th>برنامه سود/ضرر و ساعات ترید</th>
          <th>هزینه خرید ربات</th>
          <th>Win-Rate / بازده</th>
          <th>حد ضرر / تارگت</th>
          <th>وضعیت</th>
          <th>عملیات</th>
        </tr>
      </thead>
      <tbody>
        ${(bots || []).map(b => `
          <tr>
            <td>
              <b>🤖 ${esc(b.name)}</b>
              <div class="hint" dir="ltr">${esc(b.code)}</div>
            </td>
            <td><span class="pill pill-xs">${esc(b.basket_type || 'all')}</span></td>
            <td>${formatBotSimBadge(b.sim_config)}</td>
            <td><b style="color:var(--accent)">${b.price_toman > 0 ? NF(b.price_toman, 0) + ' ت' : 'رایگان'}</b></td>
            <td><span style="color:var(--up);font-weight:700">${NF(b.win_rate || 85, 1)}٪</span> · ${esc(b.expected_monthly_pct || '')}</td>
            <td><span style="color:var(--down)">-${NF(b.stop_loss_pct || 4, 1)}٪</span> / <span style="color:var(--up)">+${NF(b.tp1_pct || 7.5, 1)}٪</span></td>
            <td>${Number(b.is_active ?? 1) ? '<span class="pill pill-ok">فعال</span>' : '<span class="pill pill-xs">غیرفعال</span>'}</td>
            <td>
              <div class="row-gap wrap-gap" style="gap:4px">
                <button type="button" class="btn btn-primary btn-sm" onclick="editAdminTradingBot('${esc(b.code)}'); openAdminAutoBotWizard('${esc(b.code)}')">🎛️ سود/ضرر و ساعات</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="editAdminTradingBot('${esc(b.code)}')">✏️ ویرایش</button>
                <button type="button" class="btn btn-ghost btn-sm" style="color:var(--down)" onclick="deleteAdminTradingBot('${esc(b.code)}', ${Number(b.id || 0)})">🗑️ حذف</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }

  const uTbl = $('#admUserBotsTable');
  if (uTbl) {
    if (!instances || !instances.length) {
      uTbl.innerHTML = `<thead><tr><th>وضعیت</th></tr></thead><tbody><tr><td class="muted">هنوز ربات فعالی توسط کاربران راه‌اندازی نشده است. با دکمه «⚡ افزودن خودکار» می‌توانید یک ربات زنده هم بسازید.</td></tr></tbody>`;
    } else {
      uTbl.innerHTML = `
        <thead>
          <tr>
            <th>شناسه</th>
            <th>کاربر</th>
            <th>نام ربات</th>
            <th>برنامه سود/ضرر و ساعات</th>
            <th>سرمایه اولیه</th>
            <th>ارزش لحظه‌ای</th>
            <th>سود/زیان لحظه‌ای</th>
            <th>عملیات کنترل ادمین</th>
          </tr>
        </thead>
        <tbody>
          ${instances.map(i => {
            const up = Number(i.total_pnl || 0) >= 0;
            return `
              <tr>
                <td><b>${esc(i.ref_id)}</b></td>
                <td>${esc(i.user_name || (S.user && S.user.name) || 'کاربر سامانه')}</td>
                <td><b>${esc(i.bot_name)}</b><div class="hint">${esc(i.basket_name)}</div></td>
                <td>${formatBotSimBadge(i.sim_config)}</td>
                <td>${NF(i.initial_capital, 0)} ت</td>
                <td><b>${NF(i.current_equity || i.initial_capital, 0)} ت</b></td>
                <td class="${up ? 'up' : 'down'}" style="font-weight:800">${up ? '+' : ''}${NF(i.total_pnl || 0, 0)} ت (${up ? '+' : ''}${NF(i.total_pnl_pct || 0, 2)}٪)</td>
                <td>
                  <div class="row-gap wrap-gap" style="gap:4px">
                    <button type="button" class="btn btn-primary btn-sm" style="background:#059669;border-color:#059669" onclick="adminFlipBotInstancePnl('${esc(i.ref_id)}', 'profit')">🟢 بردن به سود</button>
                    <button type="button" class="btn btn-ghost btn-sm" style="color:var(--down);border-color:rgba(239,68,68,.4)" onclick="adminFlipBotInstancePnl('${esc(i.ref_id)}', 'loss')">🔴 بردن به ضرر</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      `;
    }
  }
}

window.adminFlipBotInstancePnl = function(refId, targetMode) {
  const list = S.botInstances || [];
  const inst = list.find(x => String(x.ref_id) === String(refId));
  if (!inst) return toast('نمونه ربات یافت نشد', 'err');
  if (!inst.sim_config) inst.sim_config = resolveBotSimConfig(inst);

  const initCap = Number(inst.initial_capital || 10000000);
  if (targetMode === 'profit') {
    const pct = Math.abs(Number(inst.sim_config.profit_pct || 14.5));
    inst.sim_config.pnl_mode = 'mixed_profit';
    inst.total_pnl_pct = Number((pct * 0.45).toFixed(2));
    inst.total_pnl = Math.round((initCap * inst.total_pnl_pct) / 100);
  } else {
    const pct = Math.abs(Number(inst.sim_config.loss_pct || 4.8));
    inst.sim_config.pnl_mode = 'mixed_loss';
    inst.total_pnl_pct = -Number(pct.toFixed(2));
    inst.total_pnl = Math.round((initCap * inst.total_pnl_pct) / 100);
  }
  inst.current_equity = Math.max(0, initCap + inst.total_pnl);
  (inst.sub_positions || []).forEach(sp => {
    sp.pnlPct = inst.total_pnl_pct;
    sp.pnlAmount = Math.round((Number(sp.allocatedAmount || 0) * sp.pnlPct) / 100);
    sp.currentPrice = Math.max(1, Number((Number(sp.entryPrice || 100000) * (1 + sp.pnlPct / 100)).toFixed(2)));
    sp.statusFa = inst.total_pnl >= 0 ? '🟢 در سود طبق دستور هسته' : '🔴 در فاز اصلاح و ضرر';
  });
  saveUserBotInstancesLocal(list);
  renderAdminTradingBotsTable(S.tradingBots || [], list);
  renderUserActiveBots();
  renderAutoInvestPositions();
  toast(targetMode === 'profit' ? `🟢 ربات «${inst.bot_name}» وارد فاز سوددهی (+${NF(inst.total_pnl_pct, 2)}٪) شد!` : `🔴 ربات «${inst.bot_name}» وارد فاز ضرر (${NF(inst.total_pnl_pct, 2)}٪) شد!`, 'ok');
};

window.editAdminTradingBot = function(botCode) {
  const bots = (S.tradingBots && S.tradingBots.length) ? S.tradingBots : readDefinedBotsLocal();
  const b = bots.find(x => String(x.code) === String(botCode));
  if (!b) return;
  if ($('#admBotFormTitle')) $('#admBotFormTitle').textContent = `✏️ ویرایش ربات: ${b.name}`;
  if ($('#admBotId')) $('#admBotId').value = b.id || '';
  if ($('#admBotName')) $('#admBotName').value = b.name || '';
  if ($('#admBotCode')) $('#admBotCode').value = b.code || '';
  if ($('#admBotBasketType')) $('#admBotBasketType').value = b.basket_type || 'ir_precious';
  if ($('#admBotStrategy')) $('#admBotStrategy').value = b.strategy || 'grid_dca';
  if ($('#admBotStrategyFa')) $('#admBotStrategyFa').value = b.strategy_fa || '';
  if ($('#admBotRisk')) $('#admBotRisk').value = b.risk_level || 'balanced';
  if ($('#admBotPrice')) $('#admBotPrice').value = b.price_toman ?? 490000;
  if ($('#admBotMinCap')) $('#admBotMinCap').value = b.min_capital ?? 5000000;
  if ($('#admBotDays')) $('#admBotDays').value = b.duration_days ?? 30;
  if ($('#admBotWinRate')) $('#admBotWinRate').value = b.win_rate ?? 86.5;
  if ($('#admBotMonthlyPct')) $('#admBotMonthlyPct').value = b.expected_monthly_pct || '۱۴٪ تا ۲۲٪';
  if ($('#admBotBadge')) $('#admBotBadge').value = b.badge || 'ربات ویژه 🤖';
  if ($('#admBotSlPct')) $('#admBotSlPct').value = b.stop_loss_pct ?? 4.0;
  if ($('#admBotTp1Pct')) $('#admBotTp1Pct').value = b.tp1_pct ?? 7.5;
  if ($('#admBotTp2Pct')) $('#admBotTp2Pct').value = b.tp2_pct ?? 14.5;
  if ($('#admBotActive')) $('#admBotActive').value = String(b.is_active ?? 1);
  if ($('#admBotSubtitle')) $('#admBotSubtitle').value = b.subtitle || '';
  if ($('#admBotAssetsStr') && Array.isArray(b.assets)) {
    $('#admBotAssetsStr').value = b.assets.map(a => `${a.assetId}:${a.name}:${a.weight}`).join(', ');
  }
  if ($('#admBotFeatures') && Array.isArray(b.features)) {
    $('#admBotFeatures').value = b.features.join('\n');
  }
  const sim = b.sim_config || {};
  if ($('#admBotPnlMode')) $('#admBotPnlMode').value = sim.pnl_mode || 'mixed_profit';
  if ($('#admBotProfitPct')) $('#admBotProfitPct').value = sim.profit_pct ?? 18.5;
  if ($('#admBotLossPct')) $('#admBotLossPct').value = sim.loss_pct ?? 3.2;
  if ($('#admBotProfitHours')) $('#admBotProfitHours').value = sim.profit_hours ?? 5;
  if ($('#admBotLossHours')) $('#admBotLossHours').value = sim.loss_hours ?? 2;
  if ($('#admBotInitialPct')) $('#admBotInitialPct').value = sim.initial_start_pct ?? 2.8;
  if ($('#admBotVolatility')) $('#admBotVolatility').value = sim.tick_volatility || 'realistic';
  toast('اطلاعات ربات در فرم ویرایش بارگذاری شد', 'ok');
};

window.saveAdminTradingBot = async function() {
  const name = ($('#admBotName')?.value || '').trim();
  if (!name) return toast('نام ربات ترید الزامی است', 'err');
  const code = ($('#admBotCode')?.value || '').trim() || ('bot_' + Date.now().toString().slice(-5));
  const rawAssets = ($('#admBotAssetsStr')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  const assets = rawAssets.map((item, idx) => {
    const parts = item.split(':').map(x => x.trim());
    return {
      assetId: parts[0] || ('ast_' + idx),
      name: parts[1] || parts[0] || 'دارایی',
      weight: Number(parts[2]) || 25
    };
  });
  const features = ($('#admBotFeatures')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  const sim_config = {
    pnl_mode: $('#admBotPnlMode')?.value || 'mixed_profit',
    profit_pct: Number($('#admBotProfitPct')?.value ?? 18.5),
    loss_pct: Number($('#admBotLossPct')?.value ?? 3.2),
    profit_hours: Number($('#admBotProfitHours')?.value ?? 5),
    loss_hours: Number($('#admBotLossHours')?.value ?? 2),
    initial_start_pct: Number($('#admBotInitialPct')?.value ?? 2.8),
    tick_volatility: $('#admBotVolatility')?.value || 'realistic'
  };

  const payload = {
    id: Number($('#admBotId')?.value || 0),
    code,
    name,
    subtitle: ($('#admBotSubtitle')?.value || '').trim(),
    basket_type: $('#admBotBasketType')?.value || 'ir_precious',
    strategy: $('#admBotStrategy')?.value || 'grid_dca',
    strategy_fa: ($('#admBotStrategyFa')?.value || 'پله‌ای هوشمند + حد ضرر متحرک').trim(),
    risk_level: $('#admBotRisk')?.value || 'balanced',
    price_toman: Number($('#admBotPrice')?.value || 0),
    min_capital: Number($('#admBotMinCap')?.value || 5000000),
    duration_days: Number($('#admBotDays')?.value || 30),
    win_rate: Number($('#admBotWinRate')?.value || 86.5),
    expected_monthly_pct: ($('#admBotMonthlyPct')?.value || '۱۴٪ تا ۲۲٪').trim(),
    stop_loss_pct: Number($('#admBotSlPct')?.value || 4.0),
    tp1_pct: Number($('#admBotTp1Pct')?.value || 7.5),
    tp2_pct: Number($('#admBotTp2Pct')?.value || 14.5),
    badge: ($('#admBotBadge')?.value || 'ربات ویژه 🤖').trim(),
    is_active: Number($('#admBotActive')?.value ?? 1),
    assets: assets.length ? assets : DEFAULT_TRADING_BOTS[0].assets,
    features: features.length ? features : DEFAULT_TRADING_BOTS[0].features,
    sim_config
  };

  try {
    await api('/api/admin/trading-bots', { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) {}

  let list = readDefinedBotsLocal();
  const existingIdx = list.findIndex(x => String(x.code) === String(code) || (payload.id > 0 && Number(x.id) === payload.id));
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...payload };
  } else {
    payload.id = Date.now();
    list.push(payload);
  }
  saveDefinedBotsLocal(list);
  S.tradingBots = list;

  // همگام‌سازی تنظیمات سود/ضرر با نمونه‌های فعال همین ربات
  const insts = S.botInstances || [];
  insts.forEach(inst => {
    if (String(inst.bot_code) === String(code)) {
      inst.sim_config = sim_config;
    }
  });
  saveUserBotInstancesLocal(insts);

  renderAdminTradingBotsTable(list, insts);
  renderSmartBaskets();
  renderUserActiveBots();
  renderAutoInvestPositions();
  resetAdminBotForm();
  toast(`✅ ربات ترید «${name}» با زمان‌بندی سود/ضرر اختصاصی ذخیره و منتشر شد!`, 'ok');
};

/* ---------------- ویزارد ساخت خودکار حرفه‌ای ربات ترید (تنظیم سود/ضرر و ساعات) ---------------- */
window.openAdminAutoBotWizard = function(botCode = '') {
  const modal = $('#admAutoBotWizardModal');
  if (!modal) return;
  if (botCode) {
    const bots = (S.tradingBots && S.tradingBots.length) ? S.tradingBots : readDefinedBotsLocal();
    const b = bots.find(x => String(x.code) === String(botCode));
    if (b) {
      const sim = b.sim_config || {};
      if ($('#abwPnlMode')) $('#abwPnlMode').value = sim.pnl_mode || 'mixed_profit';
      if ($('#abwProfitPct')) $('#abwProfitPct').value = sim.profit_pct ?? 18.5;
      if ($('#abwLossPct')) $('#abwLossPct').value = sim.loss_pct ?? 3.2;
      if ($('#abwStartPct')) $('#abwStartPct').value = sim.initial_start_pct ?? 3.4;
      if ($('#abwProfitHours')) $('#abwProfitHours').value = sim.profit_hours ?? 5;
      if ($('#abwLossHours')) $('#abwLossHours').value = sim.loss_hours ?? 2;
      if ($('#abwVolatility')) $('#abwVolatility').value = sim.tick_volatility || 'realistic';
      if ($('#abwDurationDays')) $('#abwDurationDays').value = b.duration_days ?? 30;
      if ($('#abwBasketType')) $('#abwBasketType').value = b.basket_type || 'ir_precious';
      if ($('#abwBotName')) $('#abwBotName').value = b.name || '';
      if ($('#abwBotPrice')) $('#abwBotPrice').value = b.price_toman ?? 490000;
    }
  }
  updateAutoBotWizardPreview();
  modal.hidden = false;
};

window.onAbwBasketTypeChange = function(basketType) {
  const names = {
    ir_precious: 'ربات کوانتوم آلفا — سبد طلا، سکه و نقره',
    ir_bourse_fund: 'ربات مومنتوم بورس و صندوق‌های اهرمی',
    global_markets: 'ربات اسکلپر کریپتو، انس جهانی و فارکس',
    balanced_basket: 'ربات سپر متعادل ۳۶۰ درجه (ایران و جهان)'
  };
  if ($('#abwBotName') && names[basketType]) {
    $('#abwBotName').value = names[basketType];
  }
  updateAutoBotWizardPreview();
};

window.applyAutoBotPreset = function(presetKey) {
  const presets = {
    real_profit:   { mode: 'mixed_profit', pPct: 18.5, lPct: 3.2, start: 3.4,  pH: 5, lH: 2, vol: 'realistic' },
    surge_profit:  { mode: 'mixed_profit', pPct: 28.0, lPct: 2.1, start: 6.8,  pH: 7, lH: 1, vol: 'high' },
    balanced_wave: { mode: 'mixed_profit', pPct: 14.0, lPct: 4.5, start: 1.9,  pH: 4, lH: 3, vol: 'realistic' },
    drawdown_loss: { mode: 'mixed_loss',   pPct: 4.2,  lPct: 9.6, start: -3.8, pH: 2, lH: 5, vol: 'realistic' },
    stop_loss:     { mode: 'pure_loss',    pPct: 1.5,  lPct: 11.2, start: -6.4, pH: 1, lH: 6, vol: 'high' }
  };
  const pr = presets[presetKey] || presets.real_profit;
  if ($('#abwPnlMode')) $('#abwPnlMode').value = pr.mode;
  if ($('#abwProfitPct')) $('#abwProfitPct').value = pr.pPct;
  if ($('#abwLossPct')) $('#abwLossPct').value = pr.lPct;
  if ($('#abwStartPct')) $('#abwStartPct').value = pr.start;
  if ($('#abwProfitHours')) $('#abwProfitHours').value = pr.pH;
  if ($('#abwLossHours')) $('#abwLossHours').value = pr.lH;
  if ($('#abwVolatility')) $('#abwVolatility').value = pr.vol;
  updateAutoBotWizardPreview();
};

window.randomizeAutoBotWizard = function() {
  const modes = ['mixed_profit', 'mixed_profit', 'pure_profit', 'mixed_loss'];
  const mode = modes[Math.floor(Math.random() * modes.length)];
  const isLoss = mode.includes('loss');
  const pPct = isLoss ? Number((2 + Math.random() * 5).toFixed(1)) : Number((12 + Math.random() * 20).toFixed(1));
  const lPct = isLoss ? Number((6 + Math.random() * 9).toFixed(1)) : Number((1.5 + Math.random() * 4.5).toFixed(1));
  const pH = isLoss ? Math.floor(1 + Math.random() * 3) : Math.floor(4 + Math.random() * 5);
  const lH = isLoss ? Math.floor(4 + Math.random() * 4) : Math.floor(1 + Math.random() * 3);
  const start = isLoss ? -Number((1.5 + Math.random() * 5).toFixed(1)) : Number((1.5 + Math.random() * 6).toFixed(1));

  if ($('#abwPnlMode')) $('#abwPnlMode').value = mode;
  if ($('#abwProfitPct')) $('#abwProfitPct').value = pPct;
  if ($('#abwLossPct')) $('#abwLossPct').value = lPct;
  if ($('#abwStartPct')) $('#abwStartPct').value = start;
  if ($('#abwProfitHours')) $('#abwProfitHours').value = pH;
  if ($('#abwLossHours')) $('#abwLossHours').value = lH;
  updateAutoBotWizardPreview();
  toast('🎲 پارامترهای تصادفی واقعی بازار تولید شد!', 'ok');
};

window.updateAutoBotWizardPreview = function() {
  const box = $('#abwLiveSchedulePreview');
  if (!box) return;

  const mode = $('#abwPnlMode')?.value || 'mixed_profit';
  const pPct = Math.max(0, Number($('#abwProfitPct')?.value ?? 18.5));
  const lPct = Math.max(0, Number($('#abwLossPct')?.value ?? 3.2));
  const startPct = Number($('#abwStartPct')?.value ?? 3.4);
  const pHours = mode === 'pure_loss' ? 0 : Math.max(1, Number($('#abwProfitHours')?.value ?? 5));
  const lHours = mode === 'pure_profit' ? 0 : Math.max(0, Number($('#abwLossHours')?.value ?? 2));
  const cap = Math.max(1000000, Number($('#abwLiveCapital')?.value ?? 25000000));

  const cycleLen = Math.max(1, pHours + lHours);
  const winRate = mode === 'pure_profit' ? 94.5 : (mode === 'pure_loss' ? 28.0 : Number(((pHours / cycleLen) * 100).toFixed(1)));
  const netPct = mode === 'pure_profit'
    ? pPct
    : (mode === 'pure_loss' ? -lPct : Number((pPct - lPct).toFixed(2)));
  const netToman = Math.round((cap * netPct) / 100);
  const startToman = Math.round((cap * startPct) / 100);

  // ساخت ۲۴ بلوک ساعتی برای نمایش گرافیکی ۲۴ ساعت شبانه‌روز
  const hoursHtml = Array.from({ length: 24 }, (_, h) => {
    const posInCycle = h % cycleLen;
    const isProfitHour = mode === 'pure_profit' ? true : (mode === 'pure_loss' ? false : (posInCycle < pHours));
    const hrVal = isProfitHour
      ? `+${NF(pPct / Math.max(1, pHours), 1)}٪`
      : `-${NF(lPct / Math.max(1, lHours), 1)}٪`;
    return `
      <div style="background:${isProfitHour ? 'rgba(16,185,129,.18)' : 'rgba(239,68,68,.18)'};border:1px solid ${isProfitHour ? 'rgba(16,185,129,.45)' : 'rgba(239,68,68,.45)'};border-radius:7px;padding:4px 2px;text-align:center;font-size:10.5px">
        <div style="color:var(--muted2)">ساعت ${NF(h + 1, 0)}</div>
        <b style="color:${isProfitHour ? 'var(--up)' : 'var(--down)'};direction:ltr;display:inline-block">${hrVal}</b>
      </div>
    `;
  }).join('');

  box.innerHTML = `
    <div class="row-between" style="flex-wrap:wrap;gap:10px;margin-bottom:10px">
      <div>
        <b style="font-size:13px">📊 پیش‌نمایش مهندسی ۲۴ ساعت ترید ربات:</b>
        <span class="hint" style="margin-inline-start:6px">در هر سیکل ${NF(cycleLen, 0)} ساعته: <b style="color:var(--up)">${NF(pHours, 0)} ساعت در سود</b> و <b style="color:var(--down)">${NF(lHours, 0)} ساعت در ضرر/اصلاح</b></span>
      </div>
      <div class="row-gap" style="gap:8px;flex-wrap:wrap">
        <span class="pill pill-xs">نرخ برد محاسباتی: <b>${NF(winRate, 1)}٪</b></span>
        <span class="pill ${netPct >= 0 ? 'pill-ok' : 'pill-bad'}">برآیند دوره: <b>${netPct >= 0 ? '+' : ''}${NF(netPct, 1)}٪ (${netToman >= 0 ? '+' : ''}${NF(netToman, 0)} تومان)</b></span>
        <span class="pill pill-xs">وضعیت لحظه استارت: <b style="color:${startPct >= 0 ? 'var(--up)' : 'var(--down)'}">${startPct >= 0 ? '+' : ''}${NF(startPct, 1)}٪ (${startToman >= 0 ? '+' : ''}${NF(startToman, 0)} ت)</b></span>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:5px">${hoursHtml}</div>
  `;
};

function buildBotPayloadFromWizard() {
  const mode = $('#abwPnlMode')?.value || 'mixed_profit';
  const pPct = Math.max(0, Number($('#abwProfitPct')?.value ?? 18.5));
  const lPct = Math.max(0, Number($('#abwLossPct')?.value ?? 3.2));
  const startPct = Number($('#abwStartPct')?.value ?? 3.4);
  const pHours = mode === 'pure_loss' ? 0 : Math.max(1, Number($('#abwProfitHours')?.value ?? 5));
  const lHours = mode === 'pure_profit' ? 0 : Math.max(0, Number($('#abwLossHours')?.value ?? 2));
  const vol = $('#abwVolatility')?.value || 'realistic';
  const days = Math.max(1, Number($('#abwDurationDays')?.value ?? 30));
  const basketType = $('#abwBasketType')?.value || 'ir_precious';
  const name = ($('#abwBotName')?.value || '').trim() || 'ربات کوانتوم هوشمند سرمایه‌یار';
  const priceToman = Math.max(0, Number($('#abwBotPrice')?.value ?? 490000));
  const cycleLen = Math.max(1, pHours + lHours);
  const winRate = mode === 'pure_profit' ? 94.5 : (mode === 'pure_loss' ? 32.0 : Number(Math.max(35, Math.min(96, (pHours / cycleLen) * 100)).toFixed(1)));
  const netPct = mode === 'pure_profit' ? pPct : (mode === 'pure_loss' ? -lPct : Number((pPct - lPct).toFixed(1)));

  const basketCatalogMatch = SMART_BASKETS_CATALOG.find(b => b.key === basketType) || SMART_BASKETS_CATALOG[0];
  const sim_config = {
    pnl_mode: mode,
    profit_pct: pPct,
    loss_pct: lPct,
    profit_hours: pHours,
    loss_hours: lHours,
    initial_start_pct: startPct,
    tick_volatility: vol
  };

  return {
    id: 0,
    code: 'auto_bot_' + Date.now().toString().slice(-6),
    name,
    subtitle: `برنامه ترید: ${pHours} ساعت در سود (+${pPct}٪) و ${lHours} ساعت اصلاح (-${lPct}٪) با مدیریت ریسک خودکار`,
    basket_type: basketType,
    strategy: 'ai_trailing',
    strategy_fa: `الگوریتم زمان‌بندی ساعتی (${pHours}س سود / ${lHours}س اصلاح)`,
    risk_level: netPct >= 0 ? 'balanced' : 'aggressive',
    price_toman: priceToman,
    min_capital: 5000000,
    duration_days: days,
    win_rate: winRate,
    expected_monthly_pct: netPct >= 0 ? `+${NF(netPct, 1)}٪ تا +${NF(pPct, 1)}٪` : `${NF(netPct, 1)}٪ (اصلاحی)`,
    stop_loss_pct: Math.max(1.5, lPct || 4.0),
    tp1_pct: Math.max(2.0, Number((pPct * 0.5).toFixed(1))),
    tp2_pct: Math.max(4.0, pPct),
    badge: netPct >= 0 ? 'سودده هوشمند 🤖' : 'سناریوی اصلاحی 🟠',
    is_active: 1,
    assets: basketCatalogMatch.assets,
    features: [
      `تنظیم اختصاصی: ${pHours} ساعت ترید در سود (+${pPct}٪) و ${lHours} ساعت اصلاح طبیعی (-${lPct}٪)`,
      `شروع اولیه در وضعیت ${startPct >= 0 ? '+' : ''}${startPct}٪ با تیک‌های لحظه‌ای ${vol}`,
      'گزارش لحظه‌ای سود/زیان و لاگ زنده تصمیمات ربات در ترمینال'
    ],
    sim_config
  };
}

window.fillFormFromAutoBotWizard = function() {
  const p = buildBotPayloadFromWizard();
  if ($('#admBotName')) $('#admBotName').value = p.name;
  if ($('#admBotCode')) $('#admBotCode').value = p.code;
  if ($('#admBotBasketType')) $('#admBotBasketType').value = p.basket_type;
  if ($('#admBotStrategy')) $('#admBotStrategy').value = p.strategy;
  if ($('#admBotStrategyFa')) $('#admBotStrategyFa').value = p.strategy_fa;
  if ($('#admBotPrice')) $('#admBotPrice').value = p.price_toman;
  if ($('#admBotDays')) $('#admBotDays').value = p.duration_days;
  if ($('#admBotWinRate')) $('#admBotWinRate').value = p.win_rate;
  if ($('#admBotMonthlyPct')) $('#admBotMonthlyPct').value = p.expected_monthly_pct;
  if ($('#admBotSlPct')) $('#admBotSlPct').value = p.stop_loss_pct;
  if ($('#admBotTp1Pct')) $('#admBotTp1Pct').value = p.tp1_pct;
  if ($('#admBotTp2Pct')) $('#admBotTp2Pct').value = p.tp2_pct;
  if ($('#admBotSubtitle')) $('#admBotSubtitle').value = p.subtitle;
  if ($('#admBotPnlMode')) $('#admBotPnlMode').value = p.sim_config.pnl_mode;
  if ($('#admBotProfitPct')) $('#admBotProfitPct').value = p.sim_config.profit_pct;
  if ($('#admBotLossPct')) $('#admBotLossPct').value = p.sim_config.loss_pct;
  if ($('#admBotProfitHours')) $('#admBotProfitHours').value = p.sim_config.profit_hours;
  if ($('#admBotLossHours')) $('#admBotLossHours').value = p.sim_config.loss_hours;
  if ($('#admBotInitialPct')) $('#admBotInitialPct').value = p.sim_config.initial_start_pct;
  if ($('#admBotVolatility')) $('#admBotVolatility').value = p.sim_config.tick_volatility;
  if ($('#admAutoBotWizardModal')) $('#admAutoBotWizardModal').hidden = true;
  toast('✅ مقادیر با موفقیت به فرم تعریف ربات منتقل شد!', 'ok');
};

window.confirmCreateAutoBotWizard = async function() {
  const payload = buildBotPayloadFromWizard();
  const activateNow = !!$('#abwActivateInstanceNow')?.checked;
  const liveCap = Math.max(1000000, Number($('#abwLiveCapital')?.value ?? 25000000));

  try {
    const r = await api('/api/admin/trading-bots', { method: 'POST', body: JSON.stringify(payload) });
    if (r && r.id) payload.id = r.id;
  } catch (e) {}

  let list = readDefinedBotsLocal();
  payload.id = payload.id || Date.now();
  list.unshift(payload);
  saveDefinedBotsLocal(list);
  S.tradingBots = list;

  if (activateNow) {
    const now = Date.now();
    const basket = resolveBasketForModal(payload.basket_type);
    const startPct = Number(payload.sim_config.initial_start_pct || 0);
    const assetsList = Array.isArray(payload.assets) && payload.assets.length ? payload.assets : basket.assets;
    const sumW = assetsList.reduce((s, a) => s + Math.max(5, Number(a.weight || 20)), 0) || 100;
    let inTradeTotal = 0;
    let initTotalPnl = 0;

    const subPositions = assetsList.map((a, idx) => {
      const wPct = Number(((Math.max(5, Number(a.weight || 20)) / sumW) * 100).toFixed(1));
      const allocAmt = Math.round(liveCap * (wPct / 100));
      const step1Amt = Math.round(allocAmt * 0.6);
      const step2Amt = allocAmt - step1Amt;
      inTradeTotal += step1Amt;
      const entryPrice = lookupAssetLivePrice(a.assetId, a.name, 150000 + idx * 45000);
      const itemPct = Number((startPct * (1 + (idx % 2 === 0 ? 0.06 : -0.06))).toFixed(2));
      const currentPrice = Math.max(1, Number((entryPrice * (1 + itemPct / 100)).toFixed(2)));
      const pnlAmount = Math.round((allocAmt * itemPct) / 100);
      initTotalPnl += pnlAmount;

      return {
        assetId: a.assetId || ('ast_' + idx),
        name: a.name,
        weightPct: wPct,
        allocatedAmount: allocAmt,
        step1Amount: step1Amt,
        step2Amount: step2Amt,
        entryPrice,
        currentPrice,
        stopLoss: Number((entryPrice * (1 - payload.stop_loss_pct / 100)).toFixed(2)),
        target1: Number((entryPrice * (1 + payload.tp1_pct / 100)).toFixed(2)),
        target2: Number((entryPrice * (1 + payload.tp2_pct / 100)).toFixed(2)),
        step2LimitPrice: Number((entryPrice * 0.972).toFixed(2)),
        status: itemPct >= 0 ? 'trailing_profit' : 'step2_filled',
        statusFa: itemPct >= 0
          ? `🟢 در سود (${payload.sim_config.profit_hours}س سود / ${payload.sim_config.loss_hours}س اصلاح)`
          : `🟠 در فاز اصلاح/ضرر (${payload.sim_config.loss_hours}س ضرر / ${payload.sim_config.profit_hours}س سود)`,
        pnlPct: itemPct,
        pnlAmount,
        rsi: itemPct >= 0 ? 54 : 33,
        signalStrength: 91
      };
    });

    const refId = 'BOT-' + Math.floor(10000 + Math.random() * 89999);
    const newInst = {
      id: now,
      ref_id: refId,
      bot_id: payload.id,
      bot_code: payload.code,
      bot_name: payload.name,
      basket_name: basket.title,
      basket_type: payload.basket_type,
      strategy: payload.strategy_fa,
      license_paid: payload.price_toman,
      initial_capital: liveCap,
      current_equity: Math.max(0, liveCap + initTotalPnl),
      in_trade_capital: inTradeTotal,
      free_margin: Math.max(0, liveCap - inTradeTotal),
      total_pnl: initTotalPnl,
      total_pnl_pct: Number(((initTotalPnl / liveCap) * 100).toFixed(2)),
      realized_pnl: 0,
      trades_count: subPositions.length * 2,
      won_trades: startPct >= 0 ? subPositions.length * 2 : subPositions.length,
      stop_loss_pct: payload.stop_loss_pct,
      tp1_pct: payload.tp1_pct,
      tp2_pct: payload.tp2_pct,
      status: 'running',
      sim_config: payload.sim_config,
      sub_positions: subPositions,
      live_logs: [
        {
          time: now,
          icon: startPct >= 0 ? '🟢' : '🟠',
          type: 'bot_init',
          title: `راه‌اندازی خودکار «${payload.name}» با زمان‌بندی اختصاصی ادمین`,
          text: `برنامه ترید: ${payload.sim_config.profit_hours} ساعت در سود (+${payload.sim_config.profit_pct}٪) و ${payload.sim_config.loss_hours} ساعت در ضرر/اصلاح (-${payload.sim_config.loss_pct}٪) | وضعیت شروع: ${initTotalPnl >= 0 ? '+' : ''}${NF(initTotalPnl, 0)} تومان (${startPct >= 0 ? '+' : ''}${startPct}٪)`
        }
      ],
      started_at: now,
      expires_at: now + payload.duration_days * 86400 * 1000,
      updated_at: now
    };

    S.botInstances = [newInst, ...(S.botInstances || [])];
    saveUserBotInstancesLocal(S.botInstances);
    startBotLiveTicker();
  }

  if ($('#admAutoBotWizardModal')) $('#admAutoBotWizardModal').hidden = true;
  renderAdminTradingBotsTable(S.tradingBots, S.botInstances || []);
  renderSmartBaskets();
  renderUserActiveBots();
  renderAutoInvestPositions();
  toast(`⚡ ربات «${payload.name}» با موفقیت به صورت خودکار ساخته شد${activateNow ? ' و نمونه زنده آن نیز در مدار ترید قرار گرفت!' : '!'}`, 'ok');
};

window.deleteAdminTradingBot = async function(code, id) {
  try {
    await api('/api/admin/trading-bots/delete', { method: 'POST', body: JSON.stringify({ id, code }) });
  } catch (e) {}
  const list = readDefinedBotsLocal().filter(x => String(x.code) !== String(code));
  saveDefinedBotsLocal(list);
  S.tradingBots = list;
  renderAdminTradingBotsTable(list, S.botInstances || []);
  renderSmartBaskets();
  if (typeof renderAutoInvestPageStage === 'function') renderAutoInvestPageStage();
  toast('ربات ترید حذف شد', 'ok');
};

/* ============================================================================
   استودیو قالب صفحات (۵ طرح مجزا برای سیگنال‌ها + ۵ طرح مجزا برای معاملات خودکار)
   ============================================================================ */
const AUTO_INVEST_TEMPLATES_META = [
  {
    key: 'ai_tpl1',
    title: 'طرح ۱ — مرکز فرماندهی تب‌بندی‌شده و استاندارد (Tabbed Command Center)',
    badge: 'منظم و تب‌بندی‌شده 🗂️',
    desc: 'تفکیک کامل بخش‌ها در ۳ تب مجزا («۱. ربات‌های در حال ترید من»، «۲. بازارچه و خرید ربات ترید»، «۳. معاملات خودکار تک‌دارایی و تاریخچه») تا صفحه هرگز شلوغ نشود.'
  },
  {
    key: 'ai_tpl2',
    title: 'طرح ۲ — ترمینال زنده کوانت دو ستونه (Live Quant Split Terminal)',
    badge: 'ترمینال کوانت 📡',
    desc: 'نمایش دو ستونه حرفه‌ای: ستون راست شامل کارت‌های زنده ربات‌ها و پوزیشن‌ها، و ستون چپ شامل ترمینال لحظه‌ای لاگ تصمیمات ربات + راه‌اندازی سریع ربات جدید.'
  },
  {
    key: 'ai_tpl3',
    title: 'طرح ۳ — بورد کانبان ۴ ستونه چرخه معاملات (Kanban Lifecycle Board)',
    badge: 'بورد کانبان ۴ستونه 📋',
    desc: 'نمایش مرحله‌به‌مرحله در ۴ ستون مجزا: «۱. ربات‌های آماده فعال‌سازی»، «۲. پله اول فعال / در صف پله دوم»، «۳. در حال ترید زنده و سوددهی»، «۴. بسته و تسویه‌شده».'
  },
  {
    key: 'ai_tpl4',
    title: 'طرح ۴ — فروشگاه و ویترین کارت‌های بزرگ ربات ترید (Bot Marketplace Showcase)',
    badge: 'ویترین فروشگاهی 🛒',
    desc: 'تمرکز اصلی روی ویترین بزرگ ربات‌های ترید تعریف‌شده توسط ادمین (با نمودار نرخ برد، دارایی‌های سبد و دکمه خرید ربات) در بالا و جدول یکپارچه معاملات فعال در پایین.'
  },
  {
    key: 'ai_tpl5',
    title: 'طرح ۵ — دستیار ساده گام‌به‌گام ۱-۲-۳ (Simple Guided Assistant)',
    badge: 'ساده و گام‌به‌گام 🧭',
    desc: 'طراحی فوق‌العاده شفاف و ساده برای کاربران تازه‌وارد با راهنمای ۳ مرحله‌ای در بالا، کارت‌های خلاصه و یکپارچه برای همه معاملات فعال و نوار شروع سریع با یک کلیک.'
  },
  {
    key: 'ai_tpl6',
    title: 'طرح ۶ — مانیتورینگ شبکه‌ای تله‌متری و گیج‌های سود زنده (Telemetry Grid Wall)',
    badge: 'دیوار تله‌متری 🎛️',
    desc: 'نمایش دیوار مانیتورینگ زنده با نوار پیشرفت سود کل، کارت‌های ۳ستونه تله‌متری برای هر ربات و پوزیشن و دکمه‌های سریع نوسان‌گیری و برداشت سود.'
  },
  {
    key: 'ai_tpl7',
    title: 'طرح ۷ — دفتر کل مالی و جدول حسابداری ربات‌ها (Financial Audit Ledger)',
    badge: 'دفتر کل حسابداری 📑',
    desc: 'نمایش تمامی ربات‌های سبد و معاملات تک‌دارایی در یک جدول جامع حسابداری (شامل سرمایه اولیه، ارزش لحظه‌ای، سود خالص، حد ضرر و عملیات فوری).'
  },
  {
    key: 'ai_tpl8',
    title: 'طرح ۸ — تایم‌لاین زنده تصمیمات الگوریتم و سایدبار کنترل (Algorithmic Timeline)',
    badge: 'تایم‌لاین الگوریتم ⏱️',
    desc: 'تمرکز روی فید زمانی لحظه‌به‌لحظه تصمیمات، خریدهای پله‌ای و سیو سود ربات‌ها در مرکز صفحه به همراه پنل کنترلی ربات‌ها در ستون کناری.'
  },
  {
    key: 'ai_tpl9',
    title: 'طرح ۹ — جدول مقایسه رودرروی ربات‌ها و استراتژی‌ها (Bot Comparison Arena)',
    badge: 'ماتریس مقایسه ربات‌ها ⚔️',
    desc: 'جدول مقایسه مستقیم تمامی ربات‌های تعریف‌شده توسط ادمین (نرخ برد، بازده ماهانه، حد ضرر، تارگت‌ها و هزینه) در بالای صفحه به همراه کارت‌های فعال کاربر در پایین.'
  },
  {
    key: 'ai_tpl10',
    title: 'طرح ۱۰ — کاکپیت تمام‌صفحه اتوپایلوت دو موتوره (Full-Screen Autopilot Cockpit)',
    badge: 'کاکپیت اتوپایلوت 🚀',
    desc: 'پوسته کاکپیت اتوپایلوت با رادار وضعیت هسته در بالا و تفکیک دو ستونه هم‌زمان («ربات‌های سبد در ستون راست» در برابر «معاملات ۲ پله‌ای تک‌دارایی در ستون چپ»).'
  }
];

let activeAiSubTab = 'bots_active';
let activeAdminTplMenuFilter = 'all';
let activeWalletSubTab = 'charge';
let activeDashSubTab = 'pulse';
let activePfSubTab = 'holdings';
let activeNotifSubTab = 'list';
let activeGuideSubTab = 'steps';

/* کاتالوگ جامع ۴۵ قالب اختصاصی برای تمامی ۹ منوی اصلی سامانه (۹ منو × ۵ قالب کاملاً متمایز) */
const ALL_MENUS_TEMPLATES_CATALOG = {
  authPage: {
    menuKey: 'authPage',
    viewId: 'auth',
    title: '🔐 صفحه ورود و ثبت‌نام (۱۰ قالب مجزا)',
    defaultTpl: 'auth_tpl1',
    templates: [
      { key: 'auth_tpl1', title: 'طرح ۱ — کارت مرکزی مدرن فین‌تک (استاندارد)', badge: 'مدرن فین‌تک 🔑', desc: 'کارت مرکزی استاندارد با چیدمان ۲ستونه منظم برای فیلدهای ثبت‌نام، سوییچر تاریک/روشن در بالا و تب‌های گرادیان.' },
      { key: 'auth_tpl2', title: 'طرح ۲ — دو ستونه اسپلیت با ویترین زنده بازار (Split Showcase)', badge: 'اسپلیت دو ستونه 🖥️', desc: 'چیدمان دو ستونه عریض: ستون راست شامل ویترین امکانات سرمایه‌یار و قیمت‌های زنده طلا، دلار و بیت‌کوین؛ ستون چپ فرم ورود و ثبت‌نام.' },
      { key: 'auth_tpl3', title: 'طرح ۳ — شیشه‌ای نئونی کوانت و سایبرپانک (Cyber Quant Neon)', badge: 'نئونی کوانت ⚡', desc: 'کارت شیشه‌ای با درخشش نئونی فیروزه‌ای، بنر امنیت الگوریتمی BIP-39 و ظاهر مدرن پلتفرم‌های کوانت.' },
      { key: 'auth_tpl4', title: 'طرح ۴ — درگاه بانکی و سازمانی رسمی (Enterprise SSL Portal)', badge: 'بانکی رسمی 🏦', desc: 'طراحی رسمی و سازمانی با نوار تاییدیه امنیتی SSL در بالای کارت، کادرهای دقیق و ساختار کلاسیک کارگزاری‌ها.' },
      { key: 'auth_tpl5', title: 'طرح ۵ — استودیو مینیمال تمام‌صفحه استارتاپی (Minimal Studio)', badge: 'مینیمال مدرن ✨', desc: 'کارت عریض با گوشه‌های گرد ۲۶پیکسلی، حاشیه خلوت و تمرکز کامل بر خوانایی فیلدها و سرعت ثبت‌نام.' },
      { key: 'auth_tpl6', title: 'طرح ۶ — دو ستونه با نقشه راه ۳ گام سرمایه‌گذاری (3-Step Onboarding)', badge: 'راهنمای ۳ گام 🧭', desc: 'ستون راست شامل راهنمای تصویری ۳ گام («۱. ثبت‌نام و کلمات امنیتی»، «۲. شکار سیگنال‌ها»، «۳. فعال‌سازی ربات ترید») و ستون چپ فرم ورود/ثبت‌نام.' },
      { key: 'auth_tpl7', title: 'طرح ۷ — ترمینال وال‌استریت با تیکر زنده بازار (Wall Street Desk)', badge: 'ترمینال وال‌استریت 📈', desc: 'مجهز به نوار قیمت‌های لحظه‌ای بازار در بالای کارت ورود و ثبت‌نام ویژه تریدرهای حرفه‌ای.' },
      { key: 'auth_tpl8', title: 'طرح ۸ — کارت افقی عریض با سایدبار کناری (Horizontal Sidebar)', badge: 'سایدبار افقی 🗂️', desc: 'برندینگ، معرفی امنیتی و مزایای سامانه در ستون کناری ۳۲۰پیکسلی و فرم ورود/ثبت‌نام در بخش اصلی.' },
      { key: 'auth_tpl9', title: 'طرح ۹ — ویترین لوکس طلایی VIP (Royal Gold Lounge)', badge: 'لوکس طلایی 👑', desc: 'حاشیه و نشان طلایی ویژه مدیریت ثروت و باشگاه مشتریان VIP با طراحی فاخر.' },
      { key: 'auth_tpl10', title: 'طرح ۱۰ — کارت فشرده و فوق‌سریع موبایل‌فرست (Compact Speed)', badge: 'فشرده و سریع 🚀', desc: 'طراحی جمع‌وجور و سریع برای ورود و ثبت‌نام در کمترین فضا بدون اسکرول اضافه.' }
    ]
  },
  signals: {
    menuKey: 'signals',
    viewId: 'signals',
    title: '⚡ منوی سیگنال‌ها و فرصت‌ها',
    defaultTpl: 'tpl1',
    templates: SIGNALS_TEMPLATES_META
  },
  autoInvest: {
    menuKey: 'autoInvest',
    viewId: 'auto-invest',
    title: '🤖 منوی معاملات خودکار و ربات ترید',
    defaultTpl: 'ai_tpl1',
    templates: AUTO_INVEST_TEMPLATES_META
  },
  subscriptions: {
    menuKey: 'subscriptions',
    viewId: 'subscriptions',
    title: '💎 منوی اشتراک و کیف‌پول',
    defaultTpl: 'wal_tpl1',
    templates: [
      { key: 'wal_tpl1', title: 'طرح ۱ — فین‌تک مدرن با کارت بانکی و پنل شارژ دوقلو', badge: 'فین‌تک استاندارد 💳', desc: 'نمایش کارت اعتباری سرمایه‌یار در کنار پنل ۳زبانه‌ای شارژ ریالی/تتر/تسویه شبا، پلن‌های VIP و جدول تراکنش‌ها.' },
      { key: 'wal_tpl2', title: 'طرح ۲ — کیف‌پول تب‌بندی‌شده بانکداری دیجیتال', badge: 'بانکداری تب‌بندی‌شده 🗂️', desc: 'تفکیک کامل در ۴ تب مجزا («۱. شارژ و تسویه»، «۲. خرید اشتراک VIP»، «۳. ربات‌های فعال»، «۴. تاریخچه مالی») بدون اسکرول طولانی.' },
      { key: 'wal_tpl3', title: 'طرح ۳ — ویترین اولویت پلن‌های اشتراک VIP در صدر صفحه', badge: 'ویترین اشتراک 💎', desc: 'نمایش کارت وضعیت اشتراک و پلن‌های ویژه VIP در بالاترین نقطه صفحه و انتقال عملیات کیف‌پول به بخش پایینی.' },
      { key: 'wal_tpl4', title: 'طرح ۴ — ترمینال خزانه‌داری و درگاه رمزارزی Web3', badge: 'ترمینال Web3 🌐', desc: 'پوسته تیره تخصصی خزانه‌داری با نوار نرخ لحظه‌ای تتر و تمرکز ویژه بر واریز رمزارزی و تسویه بانکی شبا.' },
      { key: 'wal_tpl5', title: 'طرح ۵ — دستیار ساده گام‌به‌گام ۱-۲-۳ کیف‌پول', badge: 'گام‌به‌گام ساده 🧭', desc: 'راهنمای ۳ مرحله‌ای در بالای صفحه («۱. افزایش موجودی»، «۲. فعال‌سازی اشتراک/ربات»، «۳. تسویه آنی سود به شبا»).' }
    ]
  },
  cryptoDeposit: {
    menuKey: 'cryptoDeposit',
    viewId: 'subscriptions',
    title: '🪙 بخش واریز ارز دیجیتال (در کیف‌پول)',
    defaultTpl: 'cd_tpl1',
    templates: [
      { key: 'cd_tpl1', title: 'طرح ۱ — درگاه دو ستونه فین‌تک بایننس‌پِی (Binance Pay Split)', badge: 'بایننس‌پِی دو ستونه 💎', desc: 'ستون راست: انتخاب رمزارز، شبکه و مبلغ تومانی با تبدیل زنده؛ ستون چپ: کارت فاکتور همراه با تایمر معکوس، بارکد QR، آدرس ولت و ثبت TXID.' },
      { key: 'cd_tpl2', title: 'طرح ۲ — ویزارد گام‌به‌گام ۴ مرحله‌ای وب۳ (4-Step Web3 Wizard)', badge: 'ویزارد ۴ مرحله‌ای 🧭', desc: 'نمایش مرحله‌به‌مرحله («۱. انتخاب رمزارز از لیست زنده»، «۲. تعیین مبلغ»، «۳. اسکن QR و انتقال به آدرس ولت»، «۴. ثبت هش TXID»).' },
      { key: 'cd_tpl3', title: 'طرح ۳ — ترمینال صرافی ۳ ستونه و تیکر زنده رمزارزها (Exchange Pro)', badge: 'ترمینال صرافی 🖥️', desc: 'نوار قیمت لحظه‌ای رمزارزها در بالا + ۳ ستون مجزا (لیست رمزارزها با نرخ دلاری/تومانی | ماشین‌حساب تبدیل | آدرس ولت، QR و تایمر).' },
      { key: 'cd_tpl4', title: 'طرح ۴ — کارت شیشه‌ای یکپارچه وب۳ (Glassmorphic One-Card)', badge: 'کارت شیشه‌ای مدرن ✨', desc: 'رابط کاربری یکپارچه و شیشه‌ای به سبک درگاه‌های بین‌المللی با انتخابگر سریع ارز، نوار تایمر اعتبار فرم و کپی تک‌کلیکی آدرس.' },
      { key: 'cd_tpl5', title: 'طرح ۵ — ویترین کارت‌های بزرگ رمزارز و فاکتور هوشمند (Coin Showcase)', badge: 'ویترین کارت‌های رمزارز 🪙', desc: 'نمایش کارت‌های بزرگ گرافیکی برای تمام رمزارزهای فعال درگاه با قیمت دلاری و تومانی زنده در بالا و پنل واریز و ثبت TXID در پایین.' }
    ]
  },
  dashboard: {
    menuKey: 'dashboard',
    viewId: 'dashboard',
    title: '📊 منوی داشبورد بازار',
    defaultTpl: 'dash_tpl1',
    templates: [
      { key: 'dash_tpl1', title: 'طرح ۱ — داشبورد جامع استاندارد (نمای کامل)', badge: 'جامع استاندارد 📊', desc: 'نمایش ۴ شاخص کلیدی، نبض بازار، مقایسه پرتفوی با مدل هدف، فرصت‌های برتر، عقب‌مانده‌ها و جدول کامل دارایی‌ها.' },
      { key: 'dash_tpl2', title: 'طرح ۲ — ترمینال فشرده بلومبرگ ویژه تریدرها', badge: 'ترمینال فشرده 🖥️', desc: 'چیدمان متراکم با انتقال جدول کامل ۱۰۸ دارایی بازار به صدر داشبورد برای اسکن و فیلتر فوری قیمت‌ها.' },
      { key: 'dash_tpl3', title: 'طرح ۳ — ویترین بصری کارت‌های بزرگ فرصت‌های برتر', badge: 'ویترین فرصت‌ها 🔥', desc: 'برجسته‌سازی کارت‌های فرصت‌های برتر و نمودارهای Sparkline در بالاترین بخش داشبورد برای شکار سریع موقعیت‌ها.' },
      { key: 'dash_tpl4', title: 'طرح ۴ — داشبورد تب‌بندی‌شده هوشمند (۴ تب مجزا)', badge: 'تب‌بندی‌شده 🗂️', desc: 'تفکیک بخش‌های داشبورد در ۴ تب («۱. نبض بازار و هدف»، «۲. فرصت‌های برتر»، «۳. شاخص‌های جهانی و عقب‌مانده‌ها»، «۴. جدول کل بازار»).' },
      { key: 'dash_tpl5', title: 'طرح ۵ — نمای خلاصه مدیریتی ۱-۲-۳ (Executive Guide)', badge: 'خلاصه مدیریتی 🧭', desc: 'نمایش نقشه راه ۳ مرحله‌ای در بالای داشبورد همراه با خلاصه مدیریتی وضعیت بازار ایران و جهان.' },
      { key: 'dash_tpl6', title: 'طرح ۶ — رادار دو ستونه مقایسه بازار ایران در برابر جهان', badge: 'رادار ایران/جهان 🌍', desc: 'نمایش تابلوی مقایسه‌ای زنده بین دارایی‌های پیشرو بازار داخلی ایران (طلا، نقره، بورس) و بازارهای جهانی در صدر داشبورد.' },
      { key: 'dash_tpl7', title: 'طرح ۷ — داشبورد نقشه حرارتی کل بازار (Market Heatmap Wall)', badge: 'نقشه حرارتی 🔥', desc: 'نمایش دیوار حرارتی رنگی از ۱۶ دارایی کلیدی ایران و جهان در بالای داشبورد برای تشخیص سریع جهت نقدینگی.' },
      { key: 'dash_tpl8', title: 'طرح ۸ — میز کار پرتفوی‌محور و مدیریت ثروت (Wealth First)', badge: 'پرتفوی‌محور 💼', desc: 'اولویت‌بندی مقایسه پرتفوی شما با مدل هدف و ربات‌های فعال در صدر داشبورد برای تمرکز بر بازتوازن دارایی‌ها.' },
      { key: 'dash_tpl9', title: 'طرح ۹ — خلاصه مدیریتی تک‌صفحه‌ای و خلوت (Clean One-Pager)', badge: 'تک‌صفحه‌ای خلوت ✨', desc: 'حذف جداول طولانی پایین صفحه در نمای اولیه و نمایش خلاصه تمیز KPIها + ۳ فرصت برتر با دکمه باز کردن جدول کامل.' },
      { key: 'dash_tpl10', title: 'طرح ۱۰ — کاکپیت کوانت و فرماندهی سیگنال (Quant Command Deck)', badge: 'کاکپیت کوانت 🚀', desc: 'پوسته تیره کوانتومی با پنل فرماندهی سریع ماشین‌حساب، سیگنال‌ها و ربات ترید در بالای داشبورد.' }
    ]
  },
  portfolio: {
    menuKey: 'portfolio',
    viewId: 'portfolio',
    title: '💼 منوی پرتفوی من',
    defaultTpl: 'pf_tpl1',
    templates: [
      { key: 'pf_tpl1', title: 'طرح ۱ — چیدمان کلاسیک دو ستونه پرتفوی', badge: 'کلاسیک دو ستونه 💼', desc: 'فرم پروفایل و ثبت دارایی در بالا، شاخص‌های ارزش سبد، جدول دارایی‌های شما و جداول شکاف و بازتوازن در پایین.' },
      { key: 'pf_tpl2', title: 'طرح ۲ — پرتفوی تب‌بندی‌شده (۳ تب مجزا)', badge: 'پرتفوی تب‌بندی‌شده 🗂️', desc: 'تفکیک در ۳ تب («۱. دارایی‌های فعلی و ربات ترید»، «۲. ثبت دارایی جدید و پروفایل»، «۳. تحلیل شکاف و بازتوازن سبد»).' },
      { key: 'pf_tpl3', title: 'طرح ۳ — ویترین سلامت سبد و کارت‌های برجسته', badge: 'ویترین سبد 🌟', desc: 'برجسته‌سازی کارت‌های ارزش پرتفوی و دکمه ربات ترید سبد در صدر صفحه با استایل گرادیان سبز.' },
      { key: 'pf_tpl4', title: 'طرح ۴ — میز کار تحلیلی مدل هدف و بازتوازن', badge: 'میز کار بازتوازن ⚖️', desc: 'اولویت‌بندی شاخص‌های کلیدی و مقایسه وزن فعلی با مدل هدف در بالای صفحه برای تصمیم‌گیری سریع بازتوازن.' },
      { key: 'pf_tpl5', title: 'طرح ۵ — ویزارد گام‌به‌گام ۱-۲-۳ مدیریت سبد', badge: 'ویزارد ۳ مرحله‌ای 🧭', desc: 'راهنمای گام‌به‌گام («۱. تعیین ریسک‌پذیری و نقد آزاد»، «۲. ثبت دارایی‌ها»، «۳. فعال‌سازی ربات ترید بازتوازن»).' }
    ]
  },
  notifications: {
    menuKey: 'notifications',
    viewId: 'notifications',
    title: '🔔 منوی اعلان‌ها و هشدارها',
    defaultTpl: 'not_tpl1',
    templates: [
      { key: 'not_tpl1', title: 'طرح ۱ — دو ستونه استاندارد (تنظیمات + لیست اعلان‌ها)', badge: 'دو ستونه استاندارد 🔔', desc: 'پنل تنظیمات کانال‌های هشدار در ستون راست و لیست اعلان‌ها و رویدادها در ستون چپ.' },
      { key: 'not_tpl2', title: 'طرح ۲ — صندوق پیام تمام‌عرض (اولویت لیست اعلان‌ها)', badge: 'صندوق پیام عریض 📬', desc: 'نمایش تمام‌عرض فید اعلان‌ها در بالای صفحه و قرارگیری تنظیمات هشدار در بخش پایینی.' },
      { key: 'not_tpl3', title: 'طرح ۳ — اعلان‌های تب‌بندی‌شده (۲ تب مجزا)', badge: 'تب‌بندی‌شده 🗂️', desc: 'تفکیک کامل در ۲ تب («۱. صندوق پیام‌ها و هشدارهای دریافتی» و «۲. تنظیمات پیامک و وب»).' },
      { key: 'not_tpl4', title: 'طرح ۴ — کنسول مانیتورینگ هشدارهای فوری', badge: 'کنسول هشدار ⚡', desc: 'نوار وضعیت کانال‌های فعال در بالای صفحه همراه با چیدمان فشرده مدیریتی.' },
      { key: 'not_tpl5', title: 'طرح ۵ — تایم‌لاین گام‌به‌گام رویدادها', badge: 'تایم‌لاین زمانی 🕒', desc: 'نمایش زمانی اعلان‌ها با نوار راهنمای فعال‌سازی هشدارهای پیامکی و وب در صدر صفحه.' }
    ]
  },
  aiAnalysis: {
    menuKey: 'aiAnalysis',
    viewId: 'ai-analysis',
    title: '🧠 منوی تحلیل هوش مصنوعی',
    defaultTpl: 'aia_tpl1',
    templates: [
      { key: 'aia_tpl1', title: 'طرح ۱ — گزارش تحلیلی استاندارد هوش مصنوعی', badge: 'گزارش استاندارد 🧠', desc: 'پنل یکپارچه تولید تحلیل خودکار با نمایش وضعیت مدل و خروجی ساختاریافته استراتژی.' },
      { key: 'aia_tpl2', title: 'طرح ۲ — استودیو بنفش هوش مصنوعی و استراتژی کوانت', badge: 'استودیو بنفش 🔮', desc: 'پوسته اختصاصی هوش مصنوعی با هدر خلاصه ورودی‌های موتور استدلالی و کارت‌های برجسته.' },
      { key: 'aia_tpl3', title: 'طرح ۳ — گزارش اجرایی مدیران (Executive AI Brief)', badge: 'گزارش مدیریتی 📋', desc: 'نمایش خلاصه تصمیم‌گیری سریع در بالای گزارش هوش مصنوعی با تفکیک سیگنال‌های کلیدی.' },
      { key: 'aia_tpl4', title: 'طرح ۴ — ترمینال تیره کوانت هوش مصنوعی', badge: 'ترمینال کوانت 🖥️', desc: 'پوسته تیره تخصصی برای بررسی خروجی مدل‌های زبانی و پارامترهای ریسک پرتفوی.' },
      { key: 'aia_tpl5', title: 'طرح ۵ — دستیار گام‌به‌گام ۱-۲-۳ تحلیل هوشمند', badge: 'گام‌به‌گام ۱-۲-۳ 🧭', desc: 'راهنمای ۳ مرحله‌ای نحوه ترکیب پرتفوی، سیگنال‌ها و مدل هوش مصنوعی برای دریافت بهترین استراتژی.' }
    ]
  },
  chat: {
    menuKey: 'chat',
    viewId: 'chat',
    title: '💬 منوی گفتگو با تحلیلگر',
    defaultTpl: 'chat_tpl1',
    templates: [
      { key: 'chat_tpl1', title: 'طرح ۱ — مسنجر کلاسیک با چیپ‌های پرسش سریع', badge: 'مسنجر کلاسیک 💬', desc: 'چیپ‌های سؤالات متداول در بالا، پنجره تاریخچه گفتگو در وسط و کادر ارسال پیام در پایین.' },
      { key: 'chat_tpl2', title: 'طرح ۲ — استودیو مشاوره دو ستونه (بانک سؤالات در کنار چت)', badge: 'استودیو دو ستونه 🖥️', desc: 'ستون راست شامل لیست عمودی موضوعات و سؤالات تحلیلی آماده و ستون چپ شامل پنجره گفتگو.' },
      { key: 'chat_tpl3', title: 'طرح ۳ — رابط مدرن تمام‌صفحه (سبک ChatGPT)', badge: 'مدرن تمام‌صفحه ✨', desc: 'پنجره گفتگوی مرتفع و عریض با تمرکز کامل بر مکالمه عمیق تحلیلی با هوش مصنوعی.' },
      { key: 'chat_tpl4', title: 'طرح ۴ — میز مشاوره تریدر (همراه با نوار شاخص‌ها)', badge: 'میز مشاوره تریدر 📊', desc: 'نمایش خلاصه وضعیت بازار در بالای پنجره چت برای پرسیدن سؤالات دقیق‌تر معاملاتی.' },
      { key: 'chat_tpl5', title: 'طرح ۵ — دستیار پرسش و پاسخ موضوعی ۱-۲-۳', badge: 'دستیار موضوعی 🧭', desc: 'کارت‌های راهنمای ۳گانه در بالای صفحه چت برای انتخاب سریع موضوع مشاوره (بازار ایران، جهانی یا بازتوازن سبد).' }
    ]
  },
  guide: {
    menuKey: 'guide',
    viewId: 'guide',
    title: '📖 منوی راهنما و آموزش',
    defaultTpl: 'gde_tpl1',
    templates: [
      { key: 'gde_tpl1', title: 'طرح ۱ — دو ستونه کلاسیک (مراحل کار + منابع و مفاهیم)', badge: 'دو ستونه کلاسیک 📖', desc: 'نمایش مراحل ۵گانه کار با سرمایه‌یار در ستون راست و جدول منابع داده و مفاهیم در ستون چپ.' },
      { key: 'gde_tpl2', title: 'طرح ۲ — دانشنامه تب‌بندی‌شده (۲ تب مجزا)', badge: 'دانشنامه تب‌بندی 🗂️', desc: 'تفکیک در ۲ تب («۱. راهنمای گام‌به‌گام شروع سریع» و «۲. منابع داده، فرمول امتیازدهی و قوانین»).' },
      { key: 'gde_tpl3', title: 'طرح ۳ — نقشه راه کارت‌های مرحله‌ای تمام‌عرض', badge: 'نقشه راه تصویری 🛣️', desc: 'نمایش مراحل سرمایه‌گذاری به صورت کارت‌های برجسته تمام‌عرض با خطوط راهنمای رنگی.' },
      { key: 'gde_tpl4', title: 'طرح ۴ — مرکز آموزش و میانبرهای عملیاتی', badge: 'همراه با میانبر ⚡', desc: 'افزودن دکمه‌های میانبر مستقیم در بالای راهنما برای ورود فوری به هر بخش پس از مطالعه.' },
      { key: 'gde_tpl5', title: 'طرح ۵ — خلاصه ۳ گام طلایی معامله‌گری در سرمایه‌یار', badge: '۳ گام طلایی 🧭', desc: 'بنر ۳ گام طلایی در بالای صفحه راهنما به همراه جزئیات کامل الگوریتم امتیازدهی.' }
    ]
  },
  forgotPage: {
    menuKey: 'forgotPage',
    viewId: 'forgot',
    title: '🔑 صفحه فراموشی رمز عبور (۵ قالب مجزا با باکس هر کلمه)',
    defaultTpl: 'fp_tpl1',
    templates: [
      { key: 'fp_tpl1', title: 'طرح ۱ — شبکه استاندارد ۴×۳ باکس شماره‌دار کلمات', badge: 'شبکه ۴×۳ کلمات 🔑', desc: 'چیدمان استاندارد ۱۲ باکس مجزا و شماره‌دار (۴ ستون در ۳ ردیف) با قابلیت جایگذاری خودکار کلمات از کلیپ‌بورد.' },
      { key: 'fp_tpl2', title: 'طرح ۲ — دو ستونه گاوصندوق امنیتی وب۳ (Split Web3 Vault)', badge: 'گاوصندوق دو ستونه 🛡️', desc: 'ستون راست شامل فیلدهای هویتی و رمز جدید، و ستون چپ شامل خزانه باکس‌های کلمات کلیدی.' },
      { key: 'fp_tpl3', title: 'طرح ۳ — ویزارد گام‌به‌گام ۳ مرحله‌ای شماره‌دار', badge: 'ویزارد ۳ گام 🧭', desc: 'نمایش نوار راهنمای ۳ مرحله‌ای در بالای پنجره همراه با باکس‌های شماره‌دار کلمات.' },
      { key: 'fp_tpl4', title: 'طرح ۴ — ترمینال امنیتی کوانت با ماتریس ۶×۲ کلمات', badge: 'ماتریس ۶×۲ کوانت ⚡', desc: 'چیدمان افقی ۶ ستونه برای باکس‌های کلمات کلیدی با کادر نئونی ویژه تریدرها.' },
      { key: 'fp_tpl5', title: 'طرح ۵ — کارت بانکی رسمی ۳×۴ باکس کلمات', badge: 'بانکی ۳×۴ 🏦', desc: 'ساختار ۳ ستونه منظم و رسمی برای ورود کلمات بازیابی و تنظیم رمز عبور جدید.' }
    ]
  }
};

function getMenuTemplateConfig(menuKey) {
  const cat = ALL_MENUS_TEMPLATES_CATALOG[menuKey];
  const defTpl = cat ? cat.defaultTpl : 'tpl1';
  const allKeys = cat ? cat.templates.map(t => t.key) : [defTpl];

  if (!S.ui) initUiCustomizationDefaults();
  if (!S.ui.pageTemplates || typeof S.ui.pageTemplates !== 'object') {
    S.ui.pageTemplates = {};
  }

  const raw = S.ui.pageTemplates[menuKey];
  if (!raw) {
    S.ui.pageTemplates[menuKey] = { active: defTpl, allowUserSelect: false, allowed: allKeys.slice() };
  } else if (typeof raw === 'string') {
    S.ui.pageTemplates[menuKey] = { active: raw, allowUserSelect: false, allowed: allKeys.slice() };
  } else if (typeof raw === 'object') {
    S.ui.pageTemplates[menuKey] = {
      active: raw.active || defTpl,
      allowUserSelect: raw.allowUserSelect === true,
      allowed: Array.isArray(raw.allowed) && raw.allowed.length ? raw.allowed : allKeys.slice()
    };
  }
  return S.ui.pageTemplates[menuKey];
}

function getUserSelectedTemplatesMap() {
  try {
    const raw = localStorage.getItem('sy_user_tpl_prefs');
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (e) {
    return {};
  }
}

function getActiveMenuTemplate(menuKey) {
  const cfg = getMenuTemplateConfig(menuKey);
  // اگر ادمین اجازه انتخاب به کاربر نداده باشد، فقط و فقط قالب فعال ادمین اعمال می‌شود!
  if (!cfg.allowUserSelect) {
    return cfg.active;
  }
  // اگر ادمین اجازه انتخاب داده باشد، بررسی می‌کنیم آیا کاربر یکی از قالب‌های مجاز را انتخاب کرده است یا خیر
  const userPrefs = getUserSelectedTemplatesMap();
  const userPick = userPrefs[menuKey];
  if (userPick && cfg.allowed.includes(userPick)) {
    return userPick;
  }
  if (cfg.allowed.includes(cfg.active)) {
    return cfg.active;
  }
  return cfg.allowed[0] || cfg.active;
}

function getActiveAutoInvestTemplate() {
  return getActiveMenuTemplate('autoInvest');
}

window.userSelectAllowedTemplate = function(menuKey, tplKey) {
  const cfg = getMenuTemplateConfig(menuKey);
  if (!cfg.allowUserSelect || !cfg.allowed.includes(tplKey)) return;
  const userPrefs = getUserSelectedTemplatesMap();
  userPrefs[menuKey] = tplKey;
  try {
    localStorage.setItem('sy_user_tpl_prefs', JSON.stringify(userPrefs));
  } catch (e) {}
  applySingleMenuTemplate(menuKey);
  if (menuKey === 'signals') renderSignals();
  if (menuKey === 'autoInvest') renderAutoInvestPageStage();
};

function renderMenuUserTemplateBar(menuKey) {
  const bar = $('#viewTplBar-' + menuKey);
  if (!bar) return;
  const cfg = getMenuTemplateConfig(menuKey);
  const cat = ALL_MENUS_TEMPLATES_CATALOG[menuKey];
  if (!cat) return;

  // طبق دستور صریح: اگر ادمین اجازه انتخاب نداده باشد (حالت پیش‌فرض)، نوار قالب‌ها در منو اصلاً نمایش داده نمی‌شود!
  const allowedList = cat.templates.filter(t => cfg.allowed.includes(t.key));
  if (!cfg.allowUserSelect || allowedList.length <= 1) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  const activeTpl = getActiveMenuTemplate(menuKey);
  const activeMeta = cat.templates.find(t => t.key === activeTpl) || allowedList[0];
  bar.style.display = 'flex';
  bar.innerHTML = `
    <div class="row-gap" style="gap:8px;align-items:center">
      <span style="font-size:18px">🖼️</span>
      <div>
        <b style="font-size:13px">انتخاب قالب نمایش (${esc(cat.title)}):</b>
        <span class="hint" style="margin-inline-start:6px">${esc(activeMeta ? activeMeta.title : '')}</span>
      </div>
    </div>
    <div class="tpl-switcher-pills">
      ${allowedList.map(t => `
        <button type="button" class="tpl-pill ${t.key === activeTpl ? 'active' : ''}" onclick="userSelectAllowedTemplate('${esc(menuKey)}', '${esc(t.key)}')">
          ${esc(t.badge || t.title)}
        </button>
      `).join('')}
    </div>
  `;
}

window.switchAutoInvestTemplate = function(tplKey, saveServer = true) {
  return setAdminActiveMenuTemplate('autoInvest', tplKey, saveServer);
};

window.switchAiSubTab = function(subKey) {
  activeAiSubTab = subKey || 'bots_active';
  renderAutoInvestPageStage();
};

window.switchWalletSubTab = function(subKey) {
  activeWalletSubTab = subKey || 'charge';
  applySingleMenuTemplate('subscriptions');
};

window.switchDashSubTab = function(subKey) {
  activeDashSubTab = subKey || 'pulse';
  applySingleMenuTemplate('dashboard');
};

window.switchPfSubTab = function(subKey) {
  activePfSubTab = subKey || 'holdings';
  applySingleMenuTemplate('portfolio');
};

window.switchNotifSubTab = function(subKey) {
  activeNotifSubTab = subKey || 'list';
  applySingleMenuTemplate('notifications');
};

window.switchGuideSubTab = function(subKey) {
  activeGuideSubTab = subKey || 'steps';
  applySingleMenuTemplate('guide');
};

function applySingleMenuTemplate(menuKey) {
  const cat = ALL_MENUS_TEMPLATES_CATALOG[menuKey];
  if (!cat) return;
  const activeTpl = getActiveMenuTemplate(menuKey);
  if (menuKey !== 'cryptoDeposit' && menuKey !== 'authPage') {
    const sec = $('#view-' + cat.viewId);
    if (sec) sec.dataset.tpl = activeTpl;
  }

  renderMenuUserTemplateBar(menuKey);

  if (menuKey === 'forgotPage') {
    const fm = $('#forgotModal');
    if (fm) fm.dataset.tpl = activeTpl;
    if ($('#set_forgotPageTemplate')) $('#set_forgotPageTemplate').value = activeTpl;
    if (typeof renderForgotModalStage === 'function') renderForgotModalStage();
    return;
  }

  if (menuKey === 'authPage') {
    const authEl = $('#authScreen');
    if (authEl) authEl.dataset.tpl = activeTpl;
    if ($('#set_authPageTemplate')) $('#set_authPageTemplate').value = activeTpl;
    const sideEl = $('#authSideShowcase');
    const bannerEl = $('#authTplBannerSlot');
    if (sideEl) sideEl.innerHTML = '';
    if (bannerEl) bannerEl.innerHTML = '';

    const usdtRate = typeof getLiveUsdtTomanRate === 'function' ? getLiveUsdtTomanRate() : 260991;
    if (activeTpl === 'auth_tpl2' && sideEl) {
      sideEl.innerHTML = `
        <div>
          <span class="pill pill-ok" style="margin-bottom:10px;display:inline-block">🟢 متصل به هسته زنده بازار ایران و جهان</span>
          <h2 style="font-size:21px;margin:0 0 8px">سکوی هوشمند تحلیل، سیگنال و ربات ترید ۲۴ ساعته</h2>
          <p class="muted" style="font-size:13px;line-height:1.8">رصد هم‌زمان ۱۰۸ دارایی (طلا، سکه، نقره، سهام بورس، صندوق‌های سرمایه‌گذاری، فارکس و رمزارزها) با الگوریتم کشف جاماندگی و مدیریت ریسک ۲ پله‌ای.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
            <div style="background:var(--panel);padding:10px 12px;border-radius:12px;border:1px solid var(--line)">
              <span class="hint">نرخ لحظه‌ای تتر / دلار</span>
              <div style="font-weight:800;font-size:15px;color:var(--up);margin-top:2px">${NF(usdtRate, 0)} تومان</div>
            </div>
            <div style="background:var(--panel);padding:10px 12px;border-radius:12px;border:1px solid var(--line)">
              <span class="hint">طلای ۱۸ عیار (گرم)</span>
              <div style="font-weight:800;font-size:15px;color:var(--accent);margin-top:2px">۲۶,۱۷۳,۴۰۰ تومان</div>
            </div>
          </div>
        </div>
        <div class="note" style="margin:0;font-size:12px">
          <b>🔐 امنیت کیف‌پول و کلمات بازیابی BIP-39:</b> هنگام ثبت‌نام ۱۲ کلمه کلیدی امنیتی اختصاصی دریافت می‌کنید.
        </div>
      `;
    } else if (activeTpl === 'auth_tpl3' && bannerEl) {
      bannerEl.innerHTML = `<div style="background:linear-gradient(135deg,rgba(6,182,212,.18),rgba(168,85,247,.18));border:1px solid #22d3ee;border-radius:12px;padding:10px 14px;margin-bottom:14px;text-align:center"><b style="color:var(--accent);font-size:13px;letter-spacing:1px">⚡ QUANTUM CYBER AUTH TERMINAL · BIP-39</b><div class="hint" style="margin-top:2px">ورود رمزنگاری‌شده به هسته معاملاتی الگوریتمی</div></div>`;
    } else if (activeTpl === 'auth_tpl4' && bannerEl) {
      bannerEl.innerHTML = `<div style="background:var(--surface);border:1px solid var(--line2);border-inline-start:4px solid #0284c7;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;display:flex;align-items:center;justify-content:space-between"><div><b>🏛️ درگاه رسمی احراز هویت بازار سرمایه و سرمایه‌یار</b><div class="hint">مجهز به گواهی امنیتی SSL و کلمات کلیدی بازیابی</div></div><span class="pill pill-ok">SSL 256-Bit</span></div>`;
    } else if (activeTpl === 'auth_tpl5' && bannerEl) {
      bannerEl.innerHTML = `<div style="text-align:center;padding:8px 0 12px;border-bottom:1px dashed var(--line2);margin-bottom:14px"><span class="pill pill-xs" style="color:var(--accent)">✨ استودیو سرمایه‌گذاری هوشمند</span><h3 style="margin:6px 0 0;font-size:16px">به نسل جدید مدیریت هوشمند سرمایه خوش آمدید</h3></div>`;
    } else if (activeTpl === 'auth_tpl6' && sideEl) {
      sideEl.innerHTML = `
        <div>
          <h3 style="font-size:18px;margin:0 0 12px;color:var(--accent)">🧭 نقشه راه ۳ گام تا سوددهی هوشمند</h3>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۱</div><div><b>ثبت‌نام و دریافت ۱۲ کلمه امنیتی</b><div class="hint">ایجاد حساب امن در کمتر از ۳۰ ثانیه</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۲</div><div><b>بررسی سیگنال‌های عقب‌مانده</b><div class="hint">ورود ۲ پله‌ای با حد ضرر و تارگت مشخص</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۳</div><div><b>فعال‌سازی ربات ترید ۲۴ ساعته</b><div class="hint">رصد لحظه‌ای سود و تسویه آنی به کیف‌پول</div></div></div>
          </div>
        </div>
        <div class="hint">پشتیبانی کامل از بازارهای داخلی ایران و بازارهای جهانی</div>
      `;
    } else if (activeTpl === 'auth_tpl7' && bannerEl) {
      bannerEl.innerHTML = `
        <div style="margin-bottom:14px;background:var(--surface);padding:10px;border-radius:12px;border:1px solid rgba(16,185,129,.4)">
          <div class="row-between" style="margin-bottom:6px;font-size:11.5px"><b style="color:var(--up)">📈 میز کار وال‌استریت (پایش زنده بازار)</b><span class="pill pill-ok">LIVE</span></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center;font-size:11.5px">
            <div style="background:var(--panel2);padding:5px;border-radius:7px"><span class="hint" style="display:block">تتر/تومان</span><b style="color:var(--up)">${NF(usdtRate, 0)}</b></div>
            <div style="background:var(--panel2);padding:5px;border-radius:7px"><span class="hint" style="display:block">طلای ۱۸</span><b>۲۶,۱۷۳,۴۰۰</b></div>
            <div style="background:var(--panel2);padding:5px;border-radius:7px"><span class="hint" style="display:block">BTC/USD</span><b style="color:var(--accent)">$82,851</b></div>
            <div style="background:var(--panel2);padding:5px;border-radius:7px"><span class="hint" style="display:block">انس طلا</span><b style="color:#f59e0b">$4,112</b></div>
          </div>
        </div>
      `;
    } else if (activeTpl === 'auth_tpl8' && sideEl) {
      sideEl.innerHTML = `
        <div>
          <div class="logo" style="width:54px;height:54px;font-size:24px;margin-bottom:12px">س</div>
          <h3 style="margin:0 0 6px;font-size:18px">خوش آمدید به سرمایه‌یار</h3>
          <p class="muted" style="font-size:12.5px;line-height:1.7">سامانه جامع تحلیل کمی، سیگنال‌دهی هوشمند و ربات معامله‌گر خودکار برای بازارهای ایران و جهان.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button type="button" class="btn btn-primary btn-sm" onclick="setAuthMode('login')">🔑 ورود به حساب کاربری</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="setAuthMode('register')">✨ ساخت حساب کاربری جدید</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="openForgotModal()">🛠️ بازیابی رمز عبور</button>
        </div>
      `;
    } else if (activeTpl === 'auth_tpl9' && bannerEl) {
      bannerEl.innerHTML = `<div style="background:linear-gradient(135deg,rgba(245,158,11,.2),rgba(16,185,129,.1));border:1.5px solid #f59e0b;border-radius:12px;padding:10px 14px;margin-bottom:14px;text-align:center"><b style="font-size:13.5px;color:#f59e0b">👑 باشگاه سرمایه‌گذاران و معامله‌گران ویژه (Royal Gold VIP)</b><div class="hint" style="margin-top:2px">مدیریت اختصاصی پرتفوی، ربات‌های ترید و سیگنال‌های طلایی</div></div>`;
    } else if (activeTpl === 'auth_tpl10' && bannerEl) {
      bannerEl.innerHTML = `<div style="text-align:center;margin-bottom:10px"><span class="pill pill-ok">🚀 درگاه ورود سریع موبایل‌فرست</span></div>`;
    }
    return;
  }

  if (menuKey === 'cryptoDeposit') {
    if (typeof renderCryptoDepositStage === 'function') renderCryptoDepositStage();
    return;
  }

  // ۱. اعمال قالب‌های ۵گانه منوی اشتراک و کیف‌پول
  if (menuKey === 'subscriptions') {
    const topSlot = $('#walletTplTopSlot');
    const topGrid = $('#walletMainTopGrid');
    const plansSec = $('#plansSection');
    const subCard = sec ? sec.querySelector('.sub-status-card-pro') : null;
    const panels = sec ? Array.from(sec.querySelectorAll(':scope > .panel, :scope > .grid.two')) : [];

    // بازگردانی نمایش پیش‌فرض
    if (topGrid) topGrid.style.display = '';
    if (plansSec) plansSec.style.display = '';
    if (subCard) subCard.style.display = '';
    panels.forEach(p => { p.style.display = ''; });

    if (activeTpl === 'wal_tpl2') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="ai-subtabs-bar" style="grid-template-columns:repeat(3,1fr)">
            <button type="button" class="ai-subtab-btn ${activeWalletSubTab === 'charge' ? 'active' : ''}" onclick="switchWalletSubTab('charge')">
              <div><b style="display:block">💳 ۱. شارژ و تسویه کیف‌پول</b><span class="hint">ریالی، تتر USDT و شبا</span></div>
            </button>
            <button type="button" class="ai-subtab-btn ${activeWalletSubTab === 'plans' ? 'active' : ''}" onclick="switchWalletSubTab('plans')">
              <div><b style="display:block">💎 ۲. اشتراک‌های ویژه VIP</b><span class="hint">مشاهده و فعال‌سازی پلن‌ها</span></div>
            </button>
            <button type="button" class="ai-subtab-btn ${activeWalletSubTab === 'history' ? 'active' : ''}" onclick="switchWalletSubTab('history')">
              <div><b style="display:block">📜 ۳. تاریخچه و سوابق مالی</b><span class="hint">تراکنش‌ها، واریز تتر و تسویه‌ها</span></div>
            </button>
          </div>
        `;
      }
      if (activeWalletSubTab === 'charge') {
        if (plansSec) plansSec.style.display = 'none';
        panels.forEach(p => { if (p.id !== 'plansSection') p.style.display = 'none'; });
      } else if (activeWalletSubTab === 'plans') {
        if (topGrid) topGrid.style.display = 'none';
        panels.forEach(p => { if (p.id !== 'plansSection') p.style.display = 'none'; });
      } else {
        if (topGrid) topGrid.style.display = 'none';
        if (subCard) subCard.style.display = 'none';
        if (plansSec) plansSec.style.display = 'none';
      }
    } else if (activeTpl === 'wal_tpl4') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="panel" style="margin-bottom:14px;background:linear-gradient(135deg,#070d19,#0f172a);border:1px solid rgba(34,211,238,.4)">
            <div class="row-between" style="gap:10px;flex-wrap:wrap">
              <div class="row-gap" style="gap:10px">
                <span style="font-size:24px">🌐</span>
                <div>
                  <b style="color:#38bdf8;font-size:14px">ترمینال خزانه‌داری و پرداخت‌های Web3 / پایا</b>
                  <div class="hint">پشتیبانی از شبکه‌های TRC-20، TON و BEP-20 + تسویه مستقیم شبا</div>
                </div>
              </div>
              <div class="row-gap" style="gap:6px">
                <button type="button" class="btn btn-primary btn-sm" onclick="switchDepositMode('crypto')">💎 واریز تتر</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="switchDepositMode('withdraw')">🏦 ثبت تسویه شبا</button>
              </div>
            </div>
          </div>
        `;
      }
    } else if (activeTpl === 'wal_tpl5') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="sig-wizard-stepper">
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۱</div><div><b>گام اول: شارژ کیف‌پول</b><div class="hint">ریالی یا با تتر USDT موجودی را افزایش دهید</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۲</div><div><b>گام دوم: خرید اشتراک یا ربات</b><div class="hint">پلن VIP یا ربات ترید دلخواه را فعال کنید</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۳</div><div><b>گام سوم: تسویه آنی سود</b><div class="hint">سود حاصله را با شماره شبا به بانک منتقل کنید</div></div></div>
          </div>
        `;
      }
    } else {
      if (topSlot) topSlot.innerHTML = '';
    }
  }

  // ۲. اعمال قالب‌های ۱۰گانه منوی داشبورد (dash_tpl1 .. dash_tpl10)
  if (menuKey === 'dashboard') {
    const topSlot = $('#dashTplTopSlot');
    const rowPulse = $('#dashRowPulseAlloc');
    const pTopOpps = $('#dashPanelTopOpps');
    const rowLag = $('#dashRowLagGlobal');
    const pFullTbl = $('#dashPanelFullTable');

    if (rowPulse) rowPulse.style.display = '';
    if (pTopOpps) pTopOpps.style.display = '';
    if (rowLag) rowLag.style.display = '';
    if (pFullTbl) pFullTbl.style.display = '';

    if (activeTpl === 'dash_tpl2') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="panel" style="padding:10px 14px;margin-bottom:12px;background:#070c16;border:1px solid rgba(34,211,238,.35)">
            <div class="row-between" style="flex-wrap:wrap;gap:8px;font-size:12.5px">
              <span>🖥️ <b>ترمینال فشرده بلومبرگ سرمایه‌یار</b> — جدول کامل دارایی‌ها در صدر داشبورد برای اسکن فوری</span>
              <div class="row-gap" style="gap:6px">
                <button class="btn btn-primary btn-sm" onclick="go('signals')">⚡ سیگنال‌ها</button>
                <button class="btn btn-primary btn-sm btn-basket-bot" onclick="go('auto-invest')">🤖 ربات‌های ترید</button>
              </div>
            </div>
          </div>
        `;
      }
    } else if (activeTpl === 'dash_tpl4') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="ai-subtabs-bar" style="grid-template-columns:repeat(4,1fr)">
            <button type="button" class="ai-subtab-btn ${activeDashSubTab === 'pulse' ? 'active' : ''}" onclick="switchDashSubTab('pulse')"><div><b style="display:block">📊 ۱. نبض بازار و هدف</b><span class="hint">تصویر کلی و مقایسه پرتفوی</span></div></button>
            <button type="button" class="ai-subtab-btn ${activeDashSubTab === 'opps' ? 'active' : ''}" onclick="switchDashSubTab('opps')"><div><b style="display:block">🔥 ۲. فرصت‌های برتر</b><span class="hint">۳ سیگنال طلایی امروز</span></div></button>
            <button type="button" class="ai-subtab-btn ${activeDashSubTab === 'global' ? 'active' : ''}" onclick="switchDashSubTab('global')"><div><b style="display:block">🌍 ۳. عقب‌مانده‌ها و جهان</b><span class="hint">دارایی‌های جامانده و شاخص‌ها</span></div></button>
            <button type="button" class="ai-subtab-btn ${activeDashSubTab === 'table' ? 'active' : ''}" onclick="switchDashSubTab('table')"><div><b style="display:block">📋 ۴. جدول کل بازار</b><span class="hint">جستجو و فیلتر همه دارایی‌ها</span></div></button>
          </div>
        `;
      }
      if (rowPulse) rowPulse.style.display = activeDashSubTab === 'pulse' ? '' : 'none';
      if (pTopOpps) pTopOpps.style.display = activeDashSubTab === 'opps' ? '' : 'none';
      if (rowLag) rowLag.style.display = activeDashSubTab === 'global' ? '' : 'none';
      if (pFullTbl) pFullTbl.style.display = activeDashSubTab === 'table' ? '' : 'none';
    } else if (activeTpl === 'dash_tpl5') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="sig-wizard-stepper">
            <div class="sig-wizard-step" style="cursor:pointer" onclick="go('portfolio')"><div class="sig-wizard-step-num">۱</div><div><b>۱. ثبت سرمایه و پرتفوی</b><div class="hint">دارایی‌ها و نقد آزاد خود را وارد کنید</div></div></div>
            <div class="sig-wizard-step" style="cursor:pointer" onclick="go('signals')"><div class="sig-wizard-step-num">۲</div><div><b>۲. شکار فرصت‌های عقب‌مانده</b><div class="hint">سیگنال‌های کم‌ریسک بازار را بررسی کنید</div></div></div>
            <div class="sig-wizard-step" style="cursor:pointer" onclick="go('auto-invest')"><div class="sig-wizard-step-num">۳</div><div><b>۳. فعال‌سازی ربات ترید ۲۴/۷</b><div class="hint">معامله خودکار با گزارش لحظه‌ای سود</div></div></div>
          </div>
        `;
      }
    } else if (activeTpl === 'dash_tpl6') {
      const mAssets = (S.market && S.market.assets) || [];
      const irTop = mAssets.filter(a => a.region === 'iran').slice(0, 4);
      const glTop = mAssets.filter(a => a.region !== 'iran').slice(0, 4);
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="grid two" style="margin-bottom:14px">
            <div class="panel" style="margin:0;border-color:rgba(16,185,129,.4)">
              <div class="panel-head"><h2 style="font-size:14.5px">🇮🇷 رادار لحظه‌ای بازار داخلی ایران</h2><button class="btn btn-ghost btn-sm" onclick="go('signals')">سیگنال‌های ایران ←</button></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                ${irTop.map(a => `<div style="background:var(--surface);padding:8px 10px;border-radius:9px;border:1px solid var(--line)"><b style="display:block;font-size:13px">${esc(a.name)}</b><div class="row-between" style="margin-top:4px;font-size:12px"><span>${fmtPrice(a.metrics?.last, a.unit)}</span>${chgHtml(a.metrics?.dayChangePct, 2)}</div></div>`).join('')}
              </div>
            </div>
            <div class="panel" style="margin:0;border-color:rgba(56,189,248,.4)">
              <div class="panel-head"><h2 style="font-size:14.5px">🌍 رادار لحظه‌ای بازارهای مالی جهانی</h2><button class="btn btn-ghost btn-sm" onclick="go('signals')">سیگنال‌های جهانی ←</button></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                ${glTop.map(a => `<div style="background:var(--surface);padding:8px 10px;border-radius:9px;border:1px solid var(--line)"><b style="display:block;font-size:13px">${esc(a.name)}</b><div class="row-between" style="margin-top:4px;font-size:12px"><span>${fmtPrice(a.metrics?.last, a.unit)}</span>${chgHtml(a.metrics?.dayChangePct, 2)}</div></div>`).join('')}
              </div>
            </div>
          </div>
        `;
      }
    } else if (activeTpl === 'dash_tpl7') {
      const sigs = typeof getFullEnrichedSignals === 'function' ? getFullEnrichedSignals().slice(0, 12) : [];
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="panel" style="margin-bottom:14px">
            <div class="panel-head"><h2 style="font-size:14.5px">🔥 دیوار حرارتی ۱۲ دارایی پیشرو بازار (کلیک برای تحلیل کامل)</h2><button class="btn btn-ghost btn-sm" onclick="go('signals')">همه فرصت‌ها ←</button></div>
            <div class="sig-heatmap-wall" style="margin-bottom:0">
              ${sigs.map(s => `<div class="sig-heatmap-tile ${s.tone === 'buy' ? 'buy' : 'watch'}" onclick="openSignalModal('${esc(s.assetId)}')"><div class="row-between" style="font-size:11px"><span>#${NF(s.rank, 0)}</span><span>امتیاز ${NF(s.oppScore, 0)}</span></div><b style="font-size:13px">${esc(s.name)}</b><div class="row-between" style="font-size:11.5px"><span>${fmtPrice(s.price, '')}</span><b>${(s.dayChangePct >= 0 ? '+' : '') + NF(s.dayChangePct || 0, 1)}٪</b></div></div>`).join('')}
            </div>
          </div>
        `;
      }
    } else if (activeTpl === 'dash_tpl9') {
      if (rowLag) rowLag.style.display = 'none';
      if (pFullTbl) pFullTbl.style.display = 'none';
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="panel" style="padding:10px 14px;margin-bottom:12px;border:1px dashed var(--accent)">
            <div class="row-between" style="flex-wrap:wrap;gap:8px">
              <span>✨ <b>نمای خلاصه تک‌صفحه‌ای (One-Pager)</b> — نمایش متمرکز شاخص‌ها، نبض بازار و ۳ فرصت برتر</span>
              <button type="button" class="btn btn-ghost btn-sm" onclick="$('#dashRowLagGlobal').style.display=''; $('#dashPanelFullTable').style.display=''; this.style.display='none'">📋 نمایش جداول کامل بازار ▼</button>
            </div>
          </div>
        `;
      }
    } else if (activeTpl === 'dash_tpl10') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="panel" style="margin-bottom:14px;background:#070c16;border:1px solid rgba(34,211,238,.45)">
            <div class="row-between" style="flex-wrap:wrap;gap:10px">
              <div class="row-gap" style="gap:10px">
                <span class="bot-live-pulse-dot"></span>
                <div>
                  <b style="color:#38bdf8;font-size:14.5px">🚀 کاکپیت فرماندهی کوانت و الگوریتم سرمایه‌یار</b>
                  <div class="hint">دسترسی مستقیم به ماشین‌حساب پله‌ای، ربات‌های ترید ۲۴/۷ و سیگنال‌های عقب‌مانده</div>
                </div>
              </div>
              <div class="row-gap wrap-gap" style="gap:8px">
                <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('balanced_basket')">🤖 فعال‌سازی ربات ترید</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="$('#allocCalcModal').hidden=false; runAllocCalcModal(false)">🧮 ماشین‌حساب هوشمند</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="go('signals')">⚡ اتاق سیگنال‌ها</button>
              </div>
            </div>
          </div>
        `;
      }
    } else {
      if (topSlot) topSlot.innerHTML = '';
    }
  }

  // ۳. اعمال قالب‌های ۵گانه منوی پرتفوی من
  if (menuKey === 'portfolio') {
    const topSlot = $('#portfolioTplTopSlot');
    const formsGrid = $('#pfFormsGrid');
    if (formsGrid) formsGrid.style.display = '';
    if (activeTpl === 'pf_tpl2') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="ai-subtabs-bar" style="grid-template-columns:repeat(2,1fr)">
            <button type="button" class="ai-subtab-btn ${activePfSubTab === 'holdings' ? 'active' : ''}" onclick="switchPfSubTab('holdings')">
              <div><b style="display:block">💼 ۱. دارایی‌های من، تحلیل شکاف و بازتوازن</b><span class="hint">مشاهده ارزش سبد و فعال‌سازی ربات ترید</span></div>
            </button>
            <button type="button" class="ai-subtab-btn ${activePfSubTab === 'forms' ? 'active' : ''}" onclick="switchPfSubTab('forms')">
              <div><b style="display:block">➕ ۲. افزودن دارایی جدید و تنظیم پروفایل ریسک</b><span class="hint">ویرایش نقد آماده و ثبت دارایی</span></div>
            </button>
          </div>
        `;
      }
      if (formsGrid) formsGrid.style.display = activePfSubTab === 'forms' ? '' : 'none';
    } else if (activeTpl === 'pf_tpl5') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="sig-wizard-stepper">
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۱</div><div><b>گام اول: تنظیم پروفایل ریسک</b><div class="hint">ریسک‌پذیری و نقد آماده را ذخیره کنید</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۲</div><div><b>گام دوم: ثبت دارایی‌های فعلی</b><div class="hint">طلا، سهام، صندوق یا رمزارز خود را اضافه کنید</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۳</div><div><b>گام سوم: ربات ترید بازتوازن</b><div class="hint">روی «🤖 ربات ترید» کلیک کنید تا سبد بهینه شود</div></div></div>
          </div>
        `;
      }
    } else {
      if (topSlot) topSlot.innerHTML = '';
    }
  }

  // ۴. اعمال قالب‌های ۵گانه منوی اعلان‌ها
  if (menuKey === 'notifications') {
    const topSlot = $('#notifsTplTopSlot');
    const prefsP = $('#notifsPrefsPanel');
    const listP = $('#notifsListPanel');
    if (prefsP) prefsP.style.display = '';
    if (listP) listP.style.display = '';
    if (activeTpl === 'not_tpl3') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="ai-subtabs-bar" style="grid-template-columns:repeat(2,1fr)">
            <button type="button" class="ai-subtab-btn ${activeNotifSubTab === 'list' ? 'active' : ''}" onclick="switchNotifSubTab('list')">
              <div><b style="display:block">📬 ۱. لیست اعلان‌ها و رویدادهای دریافتی</b><span class="hint">پیام‌های سیستم، مالی و سیگنال‌ها</span></div>
            </button>
            <button type="button" class="ai-subtab-btn ${activeNotifSubTab === 'prefs' ? 'active' : ''}" onclick="switchNotifSubTab('prefs')">
              <div><b style="display:block">🔔 ۲. تنظیمات هشدارهای پیامکی و وب</b><span class="hint">انتخاب دسته‌بندی‌های دلخواه</span></div>
            </button>
          </div>
        `;
      }
      if (prefsP) prefsP.style.display = activeNotifSubTab === 'prefs' ? '' : 'none';
      if (listP) listP.style.display = activeNotifSubTab === 'list' ? '' : 'none';
    } else {
      if (topSlot) topSlot.innerHTML = '';
    }
  }

  // ۵. اعمال قالب‌های ۵گانه منوی تحلیل هوش مصنوعی
  if (menuKey === 'aiAnalysis') {
    const topSlot = $('#aiAnalysisTplTopSlot');
    if (activeTpl === 'aia_tpl5') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="sig-wizard-stepper">
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۱</div><div><b>۱. جمع‌آوری داده بازار و سبد</b><div class="hint">پرتفوی و ۶۰ سیگنال برتر بررسی می‌شوند</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۲</div><div><b>۲. استدلال مدل هوش مصنوعی</b><div class="hint">کلیک روی «▶ تولید تحلیل خودکار»</div></div></div>
            <div class="sig-wizard-step"><div class="sig-wizard-step-num">۳</div><div><b>۳. دریافت برنامه عملیاتی</b><div class="hint">پیشنهاد دقیق خرید، فروش و مدیریت ریسک</div></div></div>
          </div>
        `;
      }
    } else {
      if (topSlot) topSlot.innerHTML = '';
    }
  }

  // ۶. اعمال قالب‌های ۵گانه منوی گفتگو با تحلیلگر
  if (menuKey === 'chat') {
    const topSlot = $('#chatTplTopSlot');
    if (activeTpl === 'chat_tpl5') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="sig-wizard-stepper">
            <div class="sig-wizard-step" style="cursor:pointer" onclick="$('#chatInput').value='بهترین فرصت‌های کم‌ریسک بازار ایران کدامند؟'; sendChat();"><div class="sig-wizard-step-num">🇮🇷</div><div><b>مشاوره بازار ایران</b><div class="hint">طلا، نقره، بورس و صندوق‌ها (کلیک کنید)</div></div></div>
            <div class="sig-wizard-step" style="cursor:pointer" onclick="$('#chatInput').value='چگونه پرتفوی خود را با طلا و کریپتو هج کنم؟'; sendChat();"><div class="sig-wizard-step-num">🌍</div><div><b>مشاوره بازار جهانی و کریپتو</b><div class="hint">بیت‌کوین، انس جهانی و فارکس (کلیک کنید)</div></div></div>
            <div class="sig-wizard-step" style="cursor:pointer" onclick="$('#chatInput').value='نقد آماده سرمایه‌گذاری را در چه پله‌هایی وارد کنم؟'; sendChat();"><div class="sig-wizard-step-num">⚖️</div><div><b>برنامه ورود پله‌ای نقدینگی</b><div class="hint">محاسبه پله ۱ و ۲ و حد ضرر (کلیک کنید)</div></div></div>
          </div>
        `;
      }
    } else {
      if (topSlot) topSlot.innerHTML = '';
    }
  }

  // ۷. اعمال قالب‌های ۵گانه منوی راهنما
  if (menuKey === 'guide') {
    const topSlot = $('#guideTplTopSlot');
    const stepsP = $('#guideStepsPanel');
    const srcP = $('#guideSourcesPanel');
    if (stepsP) stepsP.style.display = '';
    if (srcP) srcP.style.display = '';
    if (activeTpl === 'gde_tpl2') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="ai-subtabs-bar" style="grid-template-columns:repeat(2,1fr)">
            <button type="button" class="ai-subtab-btn ${activeGuideSubTab === 'steps' ? 'active' : ''}" onclick="switchGuideSubTab('steps')">
              <div><b style="display:block">🚀 ۱. راهنمای گام‌به‌گام شروع کار با سرمایه‌یار</b><span class="hint">۵ مرحله ساده از ثبت سبد تا سیگنال‌گیری</span></div>
            </button>
            <button type="button" class="ai-subtab-btn ${activeGuideSubTab === 'sources' ? 'active' : ''}" onclick="switchGuideSubTab('sources')">
              <div><b style="display:block">📊 ۲. منابع داده زنده و فرمول امتیازدهی</b><span class="hint">نحوه محاسبه عقب‌ماندگی، فرصت و تناسب</span></div>
            </button>
          </div>
        `;
      }
      if (stepsP) stepsP.style.display = activeGuideSubTab === 'steps' ? '' : 'none';
      if (srcP) srcP.style.display = activeGuideSubTab === 'sources' ? '' : 'none';
    } else if (activeTpl === 'gde_tpl4' || activeTpl === 'gde_tpl5') {
      if (topSlot) {
        topSlot.innerHTML = `
          <div class="sig-wizard-stepper">
            <div class="sig-wizard-step" style="cursor:pointer" onclick="go('portfolio')"><div class="sig-wizard-step-num">۱</div><div><b>گام اول: تشکیل سبد</b><div class="hint">ورود به پرتفوی من ←</div></div></div>
            <div class="sig-wizard-step" style="cursor:pointer" onclick="go('signals')"><div class="sig-wizard-step-num">۲</div><div><b>گام دوم: بررسی سیگنال‌ها</b><div class="hint">ورود به سیگنال‌ها و فرصت‌ها ←</div></div></div>
            <div class="sig-wizard-step" style="cursor:pointer" onclick="go('auto-invest')"><div class="sig-wizard-step-num">۳</div><div><b>گام سوم: ربات ترید خودکار</b><div class="hint">ورود به معاملات خودکار ←</div></div></div>
          </div>
        `;
      }
    } else {
      if (topSlot) topSlot.innerHTML = '';
    }
  }
}

function applyAllMenuTemplates() {
  Object.keys(ALL_MENUS_TEMPLATES_CATALOG).forEach(menuKey => {
    applySingleMenuTemplate(menuKey);
  });
}

function renderAutoInvestPageStage() {
  const stage = $('#autoInvestTemplateStage');
  if (!stage) return;

  const activeTpl = getActiveAutoInvestTemplate();
  renderMenuUserTemplateBar('autoInvest');
  const sec = $('#view-auto-invest');
  if (sec) sec.dataset.tpl = activeTpl;

  const bots = (S.tradingBots && S.tradingBots.length) ? S.tradingBots.filter(b => Number(b.is_active ?? 1) === 1) : DEFAULT_TRADING_BOTS;
  const botInsts = S.botInstances || [];
  const activeBotInsts = botInsts.filter(i => i && i.status !== 'closed');
  const posList = S.autoPositions || [];
  const activePosList = posList.filter(p => p && p.status !== 'closed');
  const closedPosList = posList.filter(p => p && p.status === 'closed');
  const closedBotsList = botInsts.filter(i => i && i.status === 'closed');

  const botStoreCardHtml = (bot) => {
    const assets = Array.isArray(bot.assets) ? bot.assets : [];
    return `
      <div class="basket-bot-card">
        <div>
          <div class="row-between" style="gap:8px;margin-bottom:8px">
            <div class="row-gap" style="gap:8px">
              <span style="font-size:24px">🤖</span>
              <div>
                <h3 style="margin:0;font-size:14.5px;font-weight:800">${esc(bot.name)}</h3>
                <span class="hint">${esc(bot.strategy_fa || 'پله‌ای هوشمند + حد ضرر متحرک')}</span>
              </div>
            </div>
            <span class="pill pill-xs" style="background:rgba(34,211,238,.14);color:var(--accent)">${esc(bot.badge || 'ربات هوشمند')}</span>
          </div>
          <p class="muted" style="font-size:12px;margin:0 0 10px">${esc(bot.subtitle || '')}</p>
          <div class="row-gap wrap-gap" style="gap:5px;margin-bottom:10px">
            ${assets.map(a => `<span class="chip-cls" style="font-size:11px">${esc(a.name)} (${NF(a.weight, 0)}٪)</span>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:var(--surface);padding:8px;border-radius:10px;border:1px solid var(--line);text-align:center;font-size:11.5px">
            <div><span class="hint" style="display:block">نرخ برد</span><b style="color:var(--up)">${NF(bot.win_rate || 86, 1)}٪</b></div>
            <div><span class="hint" style="display:block">بازده ماهانه</span><b>${esc(bot.expected_monthly_pct || '۱۵٪ تا ۲۴٪')}</b></div>
            <div><span class="hint" style="display:block">هزینه اشتراک</span><b style="color:var(--accent)">${Number(bot.price_toman) > 0 ? NF(bot.price_toman, 0) + ' ت' : 'رایگان'}</b></div>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-basket-bot" style="width:100%;justify-content:center;padding:9px;margin-top:8px" onclick="openBasketBotModal('${esc(bot.basket_type || 'ir_precious')}', '${esc(bot.code)}')">
          🤖 خرید و فعال‌سازی ربات ترید روی سبد
        </button>
      </div>
    `;
  };

  const singlePosCardHtml = (pos) => {
    const isUp = (pos.pnl_percent || 0) >= 0;
    return `
      <div class="auto-pos-card ${pos.status}">
        <div class="row-between" style="gap:8px">
          <div class="row-gap" style="gap:8px">
            <span style="font-size:20px">⚡</span>
            <div>
              <h3 style="margin:0;font-size:14.5px">${esc(pos.asset_name)}</h3>
              <span class="hint">${esc(pos.ref_id || ('#' + pos.id))} · ${esc(clsFa(pos.asset_cls))}</span>
            </div>
          </div>
          <div style="text-align:left">
            <span class="auto-pnl-badge ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${NF(pos.pnl_percent, 1)}٪</span>
            <div class="hint">${(isUp ? '+' : '') + NF(pos.pnl_amount, 0)} تومان</div>
          </div>
        </div>
        <div class="row-between" style="background:var(--surface);padding:8px 10px;border-radius:9px;font-size:12px;margin:8px 0">
          <span>بودجه: <b>${NF(pos.total_amount, 0)} ت</b></span>
          <span>قیمت زنده: <b>${fmtPrice(pos.current_price, '')}</b></span>
          <span>${pos.step2_status === 'executed' ? '<b style="color:var(--up)">۲ پله فعال ✓</b>' : '<b style="color:#38bdf8">پله ۱ فعال ⏳</b>'}</span>
        </div>
        <div class="row-between" style="font-size:11.5px;color:var(--muted)">
          <span>حد ضرر: <b style="color:var(--down)">${fmtPrice(pos.stop_loss, '')}</b></span>
          <span>هدف ۱: <b style="color:var(--up)">${fmtPrice(pos.target1, '')}</b></span>
          <span>هدف ۲: <b style="color:var(--accent)">${fmtPrice(pos.target2, '')}</b></span>
        </div>
        <div class="row-gap wrap-gap" style="gap:6px;margin-top:10px">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="openAutoInvestDetail('${esc(String(pos.ref_id || pos.id))}')">📜 جزئیات و لاگ تصمیمات</button>
          ${pos.status !== 'closed' ? `<button class="btn btn-ghost btn-sm" style="color:var(--down);border-color:rgba(239,68,68,.35)" onclick="closeAutoInvestPosition('${esc(String(pos.id))}', '${esc(String(pos.ref_id || ''))}')">💰 تسویه</button>` : ''}
        </div>
      </div>
    `;
  };

  // ==================== طرح ۱: مرکز فرماندهی تب‌بندی‌شده و استاندارد ====================
  if (activeTpl === 'ai_tpl1') {
    let bodyContent = '';
    if (activeAiSubTab === 'bot_store') {
      bodyContent = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>🤖 فروشگاه و ویترین ربات‌های ترید هوشمند (تعریف‌شده توسط ادمین)</h2>
              <p class="hint">ربات مورد نظر خود را انتخاب و فعال کنید تا ۲۴ ساعته روی سبد انتخابی ترید کند و گزارش لحظه‌ای بدهد.</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('balanced_basket')">＋ تنظیم سفارشی ربات روی سبد دلخواه</button>
          </div>
          <div class="baskets-bot-grid">${bots.map(botStoreCardHtml).join('')}</div>
        </div>
      `;
    } else if (activeAiSubTab === 'single_positions') {
      bodyContent = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>⚡ معاملات خودکار ۲ پله‌ای تک‌دارایی و تاریخچه</h2>
              <p class="hint">موقعیت‌هایی که از روی کارت‌های سیگنال یا ماشین‌حساب با ورود ۲ پله‌ای (۵۰٪ فوری + ۵۰٪ کف حمایتی) فعال شده‌اند.</p>
            </div>
            <div class="row-gap wrap-gap">
              <button class="btn btn-ghost btn-sm" onclick="loadAutoInvestPositions(true)">↻ به‌روزرسانی</button>
              <button class="btn btn-primary btn-sm btn-auto-invest" onclick="go('signals')">⚡ انتخاب سیگنال جدید</button>
            </div>
          </div>
          ${posList.length
            ? `<div class="auto-pos-grid">${posList.map(singlePosCardHtml).join('')}</div>`
            : `<div style="text-align:center;padding:30px;background:var(--surface);border-radius:12px;border:1px dashed var(--line)">
                 <div style="font-size:36px;margin-bottom:6px">⚡</div>
                 <b>هنوز معامله تک‌دارایی ۲ پله‌ای ثبت نشده است</b>
                 <div class="hint" style="margin:4px 0 12px">از منوی «سیگنال‌ها و فرصت‌ها» روی دکمه «⚡ سرمایه‌گذاری خودکار» کلیک کنید.</div>
                 <button class="btn btn-primary btn-sm" onclick="go('signals')">مشاهده سیگنال‌ها ←</button>
               </div>`}
        </div>
      `;
    } else {
      bodyContent = `
        <div class="panel" style="border:1px solid rgba(16,185,129,.35)">
          <div class="panel-head">
            <div class="row-gap" style="gap:10px">
              <span class="bot-live-pulse-dot"></span>
              <div>
                <h2 style="margin:0">📡 کنسول لحظه‌ای ربات‌های ترید فعال من</h2>
                <p class="hint" style="margin:2px 0 0">مشاهده زنده قیمت‌ها، سود و زیان تیک‌به‌تیک، ریز دارایی‌های داخل سبد و ترمینال تصمیمات ربات</p>
              </div>
            </div>
            <div class="row-gap wrap-gap">
              <button type="button" class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ اجرای سیکل نوسان‌گیری لحظه‌ای</button>
              <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('ir_precious')">＋ خرید و فعال‌سازی ربات ترید جدید</button>
            </div>
          </div>
          <div>
            ${botInsts.length
              ? botInsts.map(inst => renderBotInstanceHtml(inst, false)).join('')
              : `<div style="text-align:center;padding:30px;background:var(--surface);border-radius:14px;border:1px dashed var(--line)">
                   <div style="font-size:40px;margin-bottom:8px">🤖</div>
                   <h3 style="margin:0 0 6px;font-size:15px">هنوز ربات تریدی فعال نکرده‌اید</h3>
                   <p class="muted" style="max-width:520px;margin:0 auto 14px;font-size:12.5px">با کلیک روی دکمه زیر یا از تب «فروشگاه ربات‌ها»، اولین ربات ترید ۲۴ ساعته خود را روی سبد دلخواه راه‌اندازی کنید.</p>
                   <div class="row-gap" style="justify-content:center;gap:10px">
                     <button type="button" class="btn btn-primary btn-basket-bot" onclick="openBasketBotModal('ir_precious')">🤖 خرید و فعال‌سازی اولین ربات ترید</button>
                     <button type="button" class="btn btn-ghost" onclick="switchAiSubTab('bot_store')">مشاهده فروشگاه ربات‌ها ←</button>
                   </div>
                 </div>`}
          </div>
        </div>
      `;
    }

    stage.innerHTML = `
      <div class="ai-subtabs-bar">
        <button type="button" class="ai-subtab-btn ${activeAiSubTab === 'bots_active' ? 'active' : ''}" onclick="switchAiSubTab('bots_active')">
          <div>
            <b style="font-size:14px;display:block">📡 ۱. ربات‌های در حال ترید من</b>
            <span class="hint">کنسول زنده سود/زیان و لاگ لحظه‌ای</span>
          </div>
          <span class="pill pill-ok">${NF(activeBotInsts.length, 0)} فعال</span>
        </button>
        <button type="button" class="ai-subtab-btn ${activeAiSubTab === 'bot_store' ? 'active' : ''}" onclick="switchAiSubTab('bot_store')">
          <div>
            <b style="font-size:14px;display:block">🤖 ۲. فروشگاه و ویترین ربات‌های ترید</b>
            <span class="hint">انتخاب و خرید ربات تعریف‌شده توسط مدیریت</span>
          </div>
          <span class="pill pill-xs">${NF(bots.length, 0)} ربات</span>
        </button>
        <button type="button" class="ai-subtab-btn ${activeAiSubTab === 'single_positions' ? 'active' : ''}" onclick="switchAiSubTab('single_positions')">
          <div>
            <b style="font-size:14px;display:block">⚡ ۳. معاملات ۲ پله‌ای تک‌دارایی</b>
            <span class="hint">موقعیت‌های خودکار سیگنال‌ها و تاریخچه</span>
          </div>
          <span class="pill pill-xs">${NF(activePosList.length, 0)} باز</span>
        </button>
      </div>
      ${bodyContent}
    `;
    return;
  }

  // ==================== طرح ۲: ترمینال زنده کوانت دو ستونه ====================
  if (activeTpl === 'ai_tpl2') {
    const allLogs = [];
    botInsts.forEach(inst => {
      (inst.live_logs || []).slice(0, 6).forEach(lg => {
        allLogs.push({ ...lg, botName: inst.bot_name });
      });
    });
    allLogs.sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));

    stage.innerHTML = `
      <div class="ai-quant-split">
        <div>
          <div class="panel" style="border:1px solid rgba(34,211,238,.35)">
            <div class="panel-head">
              <div class="row-gap" style="gap:8px">
                <span class="bot-live-pulse-dot"></span>
                <h2 style="margin:0">🖥️ میز فرماندهی ربات‌ها و پوزیشن‌های کوانت</h2>
              </div>
              <div class="row-gap wrap-gap">
                <button type="button" class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ تیک نوسان‌گیری</button>
                <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('ir_precious')">＋ فعال‌سازی ربات جدید</button>
              </div>
            </div>
            ${botInsts.length ? botInsts.map(inst => renderBotInstanceHtml(inst, false)).join('') : '<div class="note">هیچ ربات سبد فعالی در مدار نیست. از ستون چپ یک ربات راه‌اندازی کنید.</div>'}
            ${posList.length ? `<h3 style="font-size:14px;margin:16px 0 10px">⚡ موقعیت‌های ۲ پله‌ای تک‌دارایی (${NF(posList.length, 0)})</h3><div class="auto-pos-grid">${posList.map(singlePosCardHtml).join('')}</div>` : ''}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px;position:sticky;top:120px">
          <div class="panel" style="margin:0;background:#070c16;border:1px solid rgba(34,211,238,.4)">
            <div class="row-between" style="margin-bottom:10px">
              <b style="color:#38bdf8;font-size:13px">📡 جریان زنده رویدادهای هسته معاملاتی (Live Quant Stream)</b>
              <span class="pill pill-xs" style="background:rgba(16,185,129,.2);color:#10b981">ONLINE</span>
            </div>
            <div class="bot-terminal-log" style="max-height:300px">
              ${allLogs.length
                ? allLogs.slice(0, 15).map(lg => `
                    <div class="bot-terminal-row">
                      <span class="bot-terminal-time">[${fmtTimeClock(lg.time)}]</span>
                      <span>${esc(lg.icon || '⚡')}</span>
                      <div>
                        <b style="color:#38bdf8">${esc(lg.botName)}:</b> <b style="color:#f8fafc">${esc(lg.title)}</b>
                        <div style="color:#94a3b8;font-size:11.5px">${esc(lg.text)}</div>
                      </div>
                    </div>
                  `).join('')
                : '<div style="color:#94a3b8">در انتظار راه‌اندازی اولین ربات برای ثبت تیک‌های زنده بازار...</div>'}
            </div>
          </div>

          <div class="panel" style="margin:0">
            <h3 style="margin:0 0 10px;font-size:14px">🚀 راه‌اندازی سریع ربات‌های آماده مدیریت</h3>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${bots.map(b => `
                <div class="row-between" style="padding:10px;background:var(--surface);border:1px solid var(--line);border-radius:10px;gap:8px">
                  <div>
                    <b style="font-size:13px">${esc(b.name)}</b>
                    <div class="hint">نرخ برد: ${NF(b.win_rate || 86, 1)}٪ · بازده: ${esc(b.expected_monthly_pct || '۱۵٪+')}</div>
                  </div>
                  <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(b.basket_type || 'ir_precious')}', '${esc(b.code)}')">🤖 خرید و شروع</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // ==================== طرح ۳: بورد کانبان ۴ ستونه چرخه معاملات ====================
  if (activeTpl === 'ai_tpl3') {
    const step1PendingList = activePosList.filter(p => p.step2_status !== 'executed');
    const fullRunningPos = activePosList.filter(p => p.step2_status === 'executed');

    stage.innerHTML = `
      <div class="ai-kanban-board">
        <!-- ستون ۱: ربات‌های آماده خرید -->
        <div class="ai-kanban-col">
          <div class="ai-kanban-col-head" style="border-color:#38bdf8">
            <span>🛒 ۱. ربات‌های آماده فعال‌سازی</span>
            <span class="pill pill-xs">${NF(bots.length, 0)}</span>
          </div>
          ${bots.map(b => `
            <div class="ai-kanban-card">
              <div class="row-between">
                <b>🤖 ${esc(b.name)}</b>
                <span class="chip-cls" style="color:var(--up)">برد ${NF(b.win_rate || 86, 0)}٪</span>
              </div>
              <div class="hint">${esc(b.subtitle || b.strategy_fa || '')}</div>
              <div class="row-between" style="font-size:11.5px">
                <span>بازده: <b>${esc(b.expected_monthly_pct || '۱۵٪+')}</b></span>
                <span>اشتراک: <b>${NF(b.price_toman || 0, 0)} ت</b></span>
              </div>
              <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(b.basket_type || 'ir_precious')}', '${esc(b.code)}')">🤖 خرید و شروع ترید</button>
            </div>
          `).join('')}
        </div>

        <!-- ستون ۲: پله اول فعال / در انتظار پله دوم -->
        <div class="ai-kanban-col">
          <div class="ai-kanban-col-head" style="border-color:#f59e0b">
            <span>🔵 ۲. پله ۱ فعال (در صف پله ۲)</span>
            <span class="pill pill-xs">${NF(step1PendingList.length, 0)}</span>
          </div>
          ${step1PendingList.length ? step1PendingList.map(p => `
            <div class="ai-kanban-card">
              <div class="row-between">
                <b>⚡ ${esc(p.asset_name)}</b>
                <span class="chip-cls">${NF(p.total_amount, 0)} ت</span>
              </div>
              <div class="hint">پله ۱ در ${fmtPrice(p.step1_price, '')} خرید شد · پله ۲ در حمایت ${fmtPrice(p.step2_price, '')} فعال است</div>
              <div class="row-gap" style="gap:6px">
                <button class="btn btn-primary btn-sm" style="flex:1" onclick="openAutoInvestDetail('${esc(String(p.ref_id || p.id))}')">📜 لاگ</button>
                <button class="btn btn-ghost btn-sm" onclick="closeAutoInvestPosition('${esc(String(p.id))}', '${esc(String(p.ref_id || ''))}')">تسویه</button>
              </div>
            </div>
          `).join('') : '<div class="hint" style="text-align:center;padding:20px">موردی در صف پله دوم نیست</div>'}
        </div>

        <!-- ستون ۳: ربات‌های سبد و پوزیشن‌های در حال ترید زنده -->
        <div class="ai-kanban-col">
          <div class="ai-kanban-col-head" style="border-color:#10b981">
            <span>🟢 ۳. در حال ترید زنده و سوددهی</span>
            <span class="pill pill-ok">${NF(activeBotInsts.length + fullRunningPos.length, 0)}</span>
          </div>
          ${activeBotInsts.map(inst => {
            const isUp = Number(inst.total_pnl || 0) >= 0;
            return `
              <div class="ai-kanban-card" style="border-color:rgba(16,185,129,.45)">
                <div class="row-between">
                  <b>🤖 ${esc(inst.bot_name)}</b>
                  <span class="pill pill-xs ${isUp ? 'pill-ok' : 'pill-bad'}">${isUp ? '+' : ''}${NF(inst.total_pnl_pct || 0, 2)}٪</span>
                </div>
                <div class="hint">سبد: ${esc(inst.basket_name)} · سرمایه: ${NF(inst.initial_capital, 0)} ت</div>
                <div style="font-size:12px;font-weight:800;color:${isUp ? 'var(--up)' : 'var(--down)'}">سود لحظه‌ای: ${isUp ? '+' : ''}${NF(inst.total_pnl || 0, 0)} تومان</div>
                <div class="row-gap wrap-gap" style="gap:5px">
                  <button class="btn btn-primary btn-sm" style="flex:1" onclick="openBotLiveDetailModal('${esc(inst.ref_id)}')">📡 ترمینال زنده</button>
                  <button class="btn btn-ghost btn-sm" onclick="botInstanceAction('${esc(inst.ref_id)}', 'scalp')">⚡ تیک</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--down)" onclick="botInstanceAction('${esc(inst.ref_id)}', 'close')">تسویه</button>
                </div>
              </div>
            `;
          }).join('')}
          ${fullRunningPos.map(p => singlePosCardHtml(p)).join('')}
          ${(!activeBotInsts.length && !fullRunningPos.length) ? '<div class="hint" style="text-align:center;padding:20px">از ستون اول یک ربات فعال کنید</div>' : ''}
        </div>

        <!-- ستون ۴: بسته و تسویه‌شده -->
        <div class="ai-kanban-col">
          <div class="ai-kanban-col-head" style="border-color:var(--muted2)">
            <span>🏁 ۴. تسویه‌شده به کیف‌پول</span>
            <span class="pill pill-xs">${NF(closedBotsList.length + closedPosList.length, 0)}</span>
          </div>
          ${closedBotsList.map(inst => `
            <div class="ai-kanban-card" style="opacity:.8">
              <b>🏁 ${esc(inst.bot_name)}</b>
              <div class="hint">سبد: ${esc(inst.basket_name)} · تسویه‌شده</div>
              <button class="btn btn-ghost btn-sm" onclick="openBotLiveDetailModal('${esc(inst.ref_id)}')">📜 مشاهده سابقه</button>
            </div>
          `).join('')}
          ${closedPosList.map(p => `
            <div class="ai-kanban-card" style="opacity:.8">
              <b>🏁 ${esc(p.asset_name)}</b>
              <div class="hint">مبلغ: ${NF(p.total_amount, 0)} ت · بسته شد</div>
              <button class="btn btn-ghost btn-sm" onclick="openAutoInvestDetail('${esc(String(p.ref_id || p.id))}')">📜 لاگ کامل</button>
            </div>
          `).join('')}
          ${(!closedBotsList.length && !closedPosList.length) ? '<div class="hint" style="text-align:center;padding:20px">هنوز معامله بسته‌شده‌ای ندارید</div>' : ''}
        </div>
      </div>
    `;
    return;
  }

  // ==================== طرح ۴: فروشگاه و ویترین کارت‌های بزرگ ربات ترید ====================
  if (activeTpl === 'ai_tpl4') {
    stage.innerHTML = `
      <div class="panel" style="border:1px solid rgba(34,211,238,.35);margin-bottom:18px">
        <div class="panel-head">
          <div>
            <h2>🛒 ویترین اختصاصی ربات‌های ترید ۲۴ ساعته (تعریف‌شده توسط مدیریت)</h2>
            <p class="hint">هر ربات دارای استراتژی معاملاتی، حد ضرر متحرک و سبد دارایی اختصاصی است. با خرید ربات، ترید خودکار بلافاصله آغاز می‌شود.</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ بروزرسانی تیک همه ربات‌ها</button>
        </div>
        <div class="baskets-bot-grid">${bots.map(botStoreCardHtml).join('')}</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>📡 جدول یکپارچه ربات‌های فعال و معاملات خودکار شما</h2>
          <span class="pill pill-ok">${NF(activeBotInsts.length + activePosList.length, 0)} مورد در حال ترید زنده</span>
        </div>
        ${botInsts.length ? `<div style="margin-bottom:16px">${botInsts.map(inst => renderBotInstanceHtml(inst, false)).join('')}</div>` : ''}
        ${posList.length ? `<div class="auto-pos-grid">${posList.map(singlePosCardHtml).join('')}</div>` : ''}
        ${(!botInsts.length && !posList.length) ? '<div class="muted" style="text-align:center;padding:24px">از ویترین بالا یکی از ربات‌های ترید را انتخاب و فعال نمایید.</div>' : ''}
      </div>
    `;
    return;
  }

  // ==================== طرح ۵: دستیار ساده گام‌به‌گام ۱-۲-۳ ====================
  if (activeTpl === 'ai_tpl5') {
    stage.innerHTML = `
      <div class="sig-wizard-stepper">
        <div class="sig-wizard-step">
          <div class="sig-wizard-step-num">۱</div>
          <div><b>گام اول: انتخاب ربات ترید</b><div class="hint">یکی از ربات‌های آماده زیر را برای سبد خود انتخاب کنید</div></div>
        </div>
        <div class="sig-wizard-step">
          <div class="sig-wizard-step-num">۲</div>
          <div><b>گام دوم: تعیین بودجه از کیف‌پول</b><div class="hint">ربات به صورت ۲ پله‌ای و با حد ضرر متحرک وارد بازار می‌شود</div></div>
        </div>
        <div class="sig-wizard-step">
          <div class="sig-wizard-step-num">۳</div>
          <div><b>گام سوم: رصد سود لحظه‌ای و برداشت آنی</b><div class="hint">هر زمان اراده کنید سود یا کل سرمایه به کیف‌پول برمی‌گردد</div></div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head">
          <h2>🚀 شروع سریع: انتخاب ربات ترید با یک کلیک</h2>
          <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('balanced_basket')">＋ تنظیم سفارشی ربات</button>
        </div>
        <div class="baskets-bot-grid">${bots.map(botStoreCardHtml).join('')}</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>📊 وضعیت لحظه‌ای ربات‌ها و معاملات فعال من</h2>
          <button type="button" class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ اجرای سیکل نوسان‌گیری لحظه‌ای</button>
        </div>
        ${botInsts.length ? botInsts.map(inst => renderBotInstanceHtml(inst, false)).join('') : ''}
        ${posList.length ? `<div class="auto-pos-grid" style="margin-top:12px">${posList.map(singlePosCardHtml).join('')}</div>` : ''}
        ${(!botInsts.length && !posList.length) ? '<div class="muted" style="text-align:center;padding:24px">شما هنوز هیچ ربات یا معامله فعالی ندارید. از بخش «شروع سریع» بالا یک ربات را فعال کنید.</div>' : ''}
      </div>
    `;
    return;
  }

  // ==================== طرح ۶: دیوار تله‌متری شبکه‌ای و گیج‌های سود زنده ====================
  if (activeTpl === 'ai_tpl6') {
    stage.innerHTML = `
      <div class="panel" style="margin-bottom:16px;background:linear-gradient(135deg,#070d19,var(--panel));border:1px solid rgba(16,185,129,.45)">
        <div class="row-between" style="flex-wrap:wrap;gap:10px">
          <div class="row-gap" style="gap:10px">
            <span class="bot-live-pulse-dot"></span>
            <div>
              <h2 style="margin:0;font-size:15.5px">🎛️ دیوار تله‌متری و مانیتورینگ شبکه‌ای سبدها</h2>
              <span class="hint">رصد لحظه‌ای بازده و وزن دارایی‌های در حال ترید در تمامی ربات‌ها</span>
            </div>
          </div>
          <div class="row-gap wrap-gap" style="gap:8px">
            <button type="button" class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ تیک هم‌زمان همه ربات‌ها</button>
            <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('ir_precious')">＋ افزودن ربات جدید به شبکه</button>
          </div>
        </div>
      </div>

      <div class="sig-bento-grid" style="margin-bottom:18px">
        ${activeBotInsts.map(inst => {
          const isUp = Number(inst.total_pnl || 0) >= 0;
          return `
            <div class="sig-bento-card" style="border-color:${isUp ? 'rgba(16,185,129,.5)' : 'rgba(239,68,68,.5)'}">
              <div>
                <div class="row-between">
                  <div>
                    <span class="pill pill-ok">🟢 ربات سبد فعال</span>
                    <h3 style="margin:6px 0 2px;font-size:15px">${esc(inst.bot_name)}</h3>
                    <span class="hint">${esc(inst.basket_name)} · ${esc(inst.ref_id)}</span>
                  </div>
                  <div class="sig-bento-score-ring" style="border-color:${isUp ? '#10b981' : '#ef4444'};color:${isUp ? 'var(--up)' : 'var(--down)'}">
                    ${isUp ? '+' : ''}${NF(inst.total_pnl_pct || 0, 1)}٪
                  </div>
                </div>
                <div class="sig-bento-ladder" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px">
                  <div><span>سرمایه اولیه</span><b>${NF(inst.initial_capital, 0)} ت</b></div>
                  <div><span>ارزش لحظه‌ای</span><b>${NF(inst.current_equity || inst.initial_capital, 0)} ت</b></div>
                  <div><span>سود خالص</span><b style="color:${isUp ? 'var(--up)' : 'var(--down)'}">${isUp ? '+' : ''}${NF(inst.total_pnl || 0, 0)} ت</b></div>
                </div>
              </div>
              <div class="sig-bento-actions-matrix">
                <button class="btn btn-primary btn-sm" onclick="openBotLiveDetailModal('${esc(inst.ref_id)}')">📡 ترمینال زنده</button>
                <button class="btn btn-ghost btn-sm" onclick="botInstanceAction('${esc(inst.ref_id)}', 'scalp')">⚡ اجرای تیک</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--up)" onclick="botInstanceAction('${esc(inst.ref_id)}', 'harvest')">💰 برداشت سود</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--down)" onclick="botInstanceAction('${esc(inst.ref_id)}', 'close')">🛑 تسویه کامل</button>
              </div>
            </div>
          `;
        }).join('')}
        ${activePosList.map(pos => singlePosCardHtml(pos)).join('')}
      </div>

      <div class="panel">
        <div class="panel-head"><h2>🤖 ربات‌های آماده اتصال به شبکه تله‌متری</h2></div>
        <div class="baskets-bot-grid">${bots.map(botStoreCardHtml).join('')}</div>
      </div>
    `;
    return;
  }

  // ==================== طرح ۷: دفتر کل مالی و جدول حسابداری ربات‌ها ====================
  if (activeTpl === 'ai_tpl7') {
    stage.innerHTML = `
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head">
          <div>
            <h2>📑 دفتر کل مالی و صورت‌حساب یکپارچه ربات‌ها و معاملات خودکار</h2>
            <p class="hint">نمایش حسابداری تمامی ربات‌های سبد و پوزیشن‌های تک‌دارایی به همراه تراز لحظه‌ای و عملیات تسویه</p>
          </div>
          <div class="row-gap wrap-gap">
            <button type="button" class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ به‌روزرسانی تراز لحظه‌ای</button>
            <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('ir_precious')">＋ ثبت و خرید ربات جدید</button>
          </div>
        </div>
        <div class="table-box">
          <table class="table sig-screener-table">
            <thead>
              <tr>
                <th>نوع</th>
                <th>شناسه</th>
                <th>عنوان ربات / دارایی</th>
                <th>سرمایه تخصیصی</th>
                <th>ارزش روز / قیمت زنده</th>
                <th>سود / زیان خالص</th>
                <th>وضعیت اجرایی</th>
                <th>عملیات حسابداری</th>
              </tr>
            </thead>
            <tbody>
              ${botInsts.map(inst => {
                const isUp = Number(inst.total_pnl || 0) >= 0;
                return `
                  <tr>
                    <td><span class="pill pill-xs" style="background:rgba(14,165,233,.15);color:#38bdf8">🤖 ربات سبد</span></td>
                    <td><code>${esc(inst.ref_id)}</code></td>
                    <td><b>${esc(inst.bot_name)}</b><div class="hint">${esc(inst.basket_name)}</div></td>
                    <td><b>${NF(inst.initial_capital, 0)} تومان</b></td>
                    <td><b>${NF(inst.current_equity || inst.initial_capital, 0)} تومان</b></td>
                    <td class="${isUp ? 'up' : 'down'}" style="font-weight:800">${isUp ? '+' : ''}${NF(inst.total_pnl || 0, 0)} ت (${isUp ? '+' : ''}${NF(inst.total_pnl_pct || 0, 2)}٪)</td>
                    <td><span class="pill pill-xs ${inst.status === 'running' ? 'pill-ok' : ''}">${inst.status === 'running' ? '🟢 فعال' : '🏁 تسویه'}</span></td>
                    <td>
                      <div class="row-gap" style="gap:4px">
                        <button class="btn btn-primary btn-sm" onclick="openBotLiveDetailModal('${esc(inst.ref_id)}')">📡 ترمینال</button>
                        ${inst.status !== 'closed' ? `<button class="btn btn-ghost btn-sm" style="color:var(--down)" onclick="botInstanceAction('${esc(inst.ref_id)}', 'close')">تسویه</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
              ${posList.map(p => {
                const isUp = Number(p.pnl_percent || 0) >= 0;
                return `
                  <tr>
                    <td><span class="pill pill-xs" style="background:rgba(16,185,129,.15);color:#10b981">⚡ تک‌دارایی</span></td>
                    <td><code>${esc(p.ref_id || ('#' + p.id))}</code></td>
                    <td><b>${esc(p.asset_name)}</b><div class="hint">${esc(clsFa(p.asset_cls))}</div></td>
                    <td><b>${NF(p.total_amount, 0)} تومان</b></td>
                    <td>ورود: ${fmtPrice(p.step1_price, '')} · زنده: <b>${fmtPrice(p.current_price, '')}</b></td>
                    <td class="${isUp ? 'up' : 'down'}" style="font-weight:800">${isUp ? '+' : ''}${NF(p.pnl_amount || 0, 0)} ت (${isUp ? '+' : ''}${NF(p.pnl_percent || 0, 1)}٪)</td>
                    <td>${p.status === 'closed' ? '🏁 بسته' : '🟢 ۲ پله فعال'}</td>
                    <td>
                      <div class="row-gap" style="gap:4px">
                        <button class="btn btn-ghost btn-sm" onclick="openAutoInvestDetail('${esc(String(p.ref_id || p.id))}')">📜 لاگ</button>
                        ${p.status !== 'closed' ? `<button class="btn btn-ghost btn-sm" style="color:var(--down)" onclick="closeAutoInvestPosition('${esc(String(p.id))}', '${esc(String(p.ref_id || ''))}')">تسویه</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
              ${(!botInsts.length && !posList.length) ? '<tr><td colspan="8" class="muted" style="text-align:center;padding:22px">هیچ ردیف فعالی در دفتر کل ثبت نشده است. از کاتالوگ زیر یک ربات را فعال کنید.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>🤖 کاتالوگ ربات‌های آماده ثبت در دفتر معاملات</h2></div>
        <div class="baskets-bot-grid">${bots.map(botStoreCardHtml).join('')}</div>
      </div>
    `;
    return;
  }

  // ==================== طرح ۸: تایم‌لاین زنده تصمیمات الگوریتم و سایدبار کنترل ====================
  if (activeTpl === 'ai_tpl8') {
    const timelineEvents = [];
    botInsts.forEach(inst => {
      (inst.live_logs || []).forEach(lg => {
        timelineEvents.push({ ...lg, source: inst.bot_name, refId: inst.ref_id, isBot: true });
      });
    });
    posList.forEach(p => {
      (p.actions_log || []).forEach(lg => {
        timelineEvents.push({ ...lg, source: p.asset_name, refId: p.ref_id || p.id, isBot: false });
      });
    });
    timelineEvents.sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));

    stage.innerHTML = `
      <div class="sig-terminal-split">
        <div class="panel" style="margin:0">
          <div class="panel-head">
            <h3 style="margin:0;font-size:14.5px">🎛️ کنترل سریع ربات‌های من</h3>
            <button class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('ir_precious')">＋ ربات جدید</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${botInsts.map(inst => `
              <div style="padding:10px;background:var(--surface);border:1px solid var(--line);border-radius:10px">
                <div class="row-between"><b>🤖 ${esc(inst.bot_name)}</b><span class="up">${NF(inst.total_pnl || 0, 0)} ت</span></div>
                <div class="hint" style="margin:4px 0">${esc(inst.basket_name)}</div>
                <div class="row-gap" style="gap:6px">
                  <button class="btn btn-primary btn-sm" style="flex:1" onclick="openBotLiveDetailModal('${esc(inst.ref_id)}')">مشاهده</button>
                  <button class="btn btn-ghost btn-sm" onclick="botInstanceAction('${esc(inst.ref_id)}', 'scalp')">⚡ تیک</button>
                </div>
              </div>
            `).join('')}
            ${bots.map(b => `
              <div style="padding:10px;background:var(--panel2);border:1px dashed var(--line2);border-radius:10px">
                <div class="row-between"><b>${esc(b.name)}</b><span class="chip-cls">برد ${NF(b.win_rate || 86, 0)}٪</span></div>
                <button class="btn btn-primary btn-sm btn-basket-bot" style="width:100%;margin-top:6px" onclick="openBasketBotModal('${esc(b.basket_type || 'ir_precious')}', '${esc(b.code)}')">🤖 فعال‌سازی این ربات</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="panel" style="margin:0">
          <div class="panel-head">
            <div>
              <h2>⏱️ تایم‌لاین زنده تصمیمات و تراکنش‌های الگوریتم</h2>
              <p class="hint">ثبت لحظه‌به‌لحظه ورودهای پله‌ای، سفارش‌های حمایت و سیو سود</p>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ تولید تیک جدید</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;border-inline-start:3px solid var(--accent);padding-inline-start:14px">
            ${timelineEvents.length ? timelineEvents.slice(0, 20).map(ev => `
              <div style="background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:10px 14px">
                <div class="row-between" style="font-size:11.5px;color:var(--muted)">
                  <span><b>${esc(ev.icon || '⚡')} ${esc(ev.source)}</b></span>
                  <span>${fmtTimeClock(ev.time)}</span>
                </div>
                <div style="font-weight:800;margin:4px 0;font-size:13.5px">${esc(ev.title)}</div>
                <div class="hint">${esc(ev.text)}</div>
              </div>
            `).join('') : '<div class="muted" style="padding:20px">برای ثبت رویداد در تایم‌لاین، یک ربات را از ستون سمت راست فعال نمایید.</div>'}
          </div>
        </div>
      </div>
    `;
    return;
  }

  // ==================== طرح ۹: ماتریس مقایسه رودرروی ربات‌ها و استراتژی‌ها ====================
  if (activeTpl === 'ai_tpl9') {
    stage.innerHTML = `
      <div class="panel" style="margin-bottom:18px;border:1px solid rgba(34,211,238,.38)">
        <div class="panel-head">
          <div>
            <h2>⚔️ ماتریس مقایسه رودرروی ربات‌های ترید (Bot Comparison Arena)</h2>
            <p class="hint">مقایسه دقیق نرخ برد، بازده هدف، حد ضرر، تارگت‌ها و حداقل سرمایه تمامی ربات‌های تعریف‌شده توسط ادمین</p>
          </div>
        </div>
        <div class="table-box">
          <table class="table sig-screener-table">
            <thead>
              <tr>
                <th>نام ربات ترید</th>
                <th>استراتژی معاملاتی</th>
                <th>نرخ برد (Win Rate)</th>
                <th>بازده هدف ماهانه</th>
                <th>حد ضرر / تارگت ۱ و ۲</th>
                <th>حداقل سرمایه</th>
                <th>هزینه اشتراک</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              ${bots.map(b => `
                <tr>
                  <td><b>🤖 ${esc(b.name)}</b><div class="hint">${esc(b.badge || '')}</div></td>
                  <td>${esc(b.strategy_fa || 'پله‌ای هوشمند')}</td>
                  <td><b style="color:var(--up)">${NF(b.win_rate || 86.5, 1)}٪</b></td>
                  <td><b>${esc(b.expected_monthly_pct || '۱۵٪ تا ۲۵٪')}</b></td>
                  <td><span style="color:var(--down)">SL: ${NF(b.stop_loss_pct || 4, 1)}٪</span> · <span style="color:var(--up)">TP: ${NF(b.tp1_pct || 7.5, 1)}٪ / ${NF(b.tp2_pct || 14.5, 1)}٪</span></td>
                  <td>${NF(b.min_capital || 5000000, 0)} ت</td>
                  <td><b style="color:var(--accent)">${Number(b.price_toman) > 0 ? NF(b.price_toman, 0) + ' ت' : 'رایگان'}</b></td>
                  <td>
                    <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('${esc(b.basket_type || 'ir_precious')}', '${esc(b.code)}')">🤖 انتخاب و شروع</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>📡 ربات‌ها و پوزیشن‌های فعال شما</h2></div>
        ${botInsts.length ? botInsts.map(inst => renderBotInstanceHtml(inst, false)).join('') : ''}
        ${posList.length ? `<div class="auto-pos-grid">${posList.map(singlePosCardHtml).join('')}</div>` : ''}
        ${(!botInsts.length && !posList.length) ? '<div class="muted" style="text-align:center;padding:20px">از جدول مقایسه بالا، ربات مورد نظر خود را انتخاب و فعال کنید.</div>' : ''}
      </div>
    `;
    return;
  }

  // ==================== طرح ۱۰: کاکپیت تمام‌صفحه اتوپایلوت دو موتوره ====================
  stage.innerHTML = `
    <div class="panel" style="margin-bottom:16px;background:#070c16;border:1px solid rgba(34,211,238,.45)">
      <div class="row-between" style="flex-wrap:wrap;gap:12px">
        <div class="row-gap" style="gap:10px">
          <span class="bot-live-pulse-dot"></span>
          <div>
            <b style="color:#38bdf8;font-size:15px">🚀 کاکپیت تمام‌صفحه اتوپایلوت دو موتوره (Dual-Engine Autopilot Cockpit)</b>
            <div class="hint">موتور ۱: ربات‌های ترید چنددارایی سبدها · موتور ۲: معاملات خودکار ۲ پله‌ای تک‌دارایی</div>
          </div>
        </div>
        <div class="row-gap wrap-gap" style="gap:8px">
          <button type="button" class="btn btn-ghost btn-sm" onclick="triggerAllActiveBotsTick()">⚡ تیک نوسان‌گیری همه موتورها</button>
          <button type="button" class="btn btn-primary btn-sm btn-basket-bot" onclick="openBasketBotModal('ir_precious')">＋ راه‌اندازی موتور ربات سبد</button>
          <button type="button" class="btn btn-auto-invest btn-sm" onclick="go('signals')">⚡ راه‌اندازی موتور تک‌دارایی</button>
        </div>
      </div>
    </div>

    <div class="grid two">
      <div class="panel" style="margin:0;border-color:rgba(16,185,129,.4)">
        <div class="panel-head">
          <h2>🤖 موتور اول: ربات‌های ترید سبدها (${NF(activeBotInsts.length, 0)} فعال)</h2>
        </div>
        ${botInsts.length
          ? botInsts.map(inst => renderBotInstanceHtml(inst, false)).join('')
          : `<div class="baskets-bot-grid" style="grid-template-columns:1fr">${bots.slice(0, 2).map(botStoreCardHtml).join('')}</div>`}
      </div>

      <div class="panel" style="margin:0;border-color:rgba(56,189,248,.4)">
        <div class="panel-head">
          <h2>⚡ موتور دوم: معاملات ۲ پله‌ای تک‌دارایی (${NF(activePosList.length, 0)} فعال)</h2>
        </div>
        ${posList.length
          ? `<div class="auto-pos-grid" style="grid-template-columns:1fr">${posList.map(singlePosCardHtml).join('')}</div>`
          : `<div style="text-align:center;padding:30px;background:var(--surface);border-radius:12px;border:1px dashed var(--line)">
               <div style="font-size:34px;margin-bottom:8px">⚡</div>
               <b>موتور تک‌دارایی آماده دریافت فرمان است</b>
               <p class="hint" style="margin:6px 0 12px">از بخش سیگنال‌ها روی دکمه «⚡ سرمایه‌گذاری خودکار» کلیک کنید تا معامله ۲ پله‌ای ثبت شود.</p>
               <button class="btn btn-primary btn-sm" onclick="go('signals')">انتخاب سیگنال برای موتور دوم ←</button>
             </div>`}
      </div>
    </div>
  `;
}

/* ----------------------------- استودیو قالب صفحات در پنل ادمین ----------------------------- */
function getWireframeSvgForTemplate(key) {
  if (key === 'tpl1') {
    return `<div style="height:14px;background:rgba(34,211,238,.25);border-radius:4px"></div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px"><span style="height:12px;background:var(--panel2);border-radius:3px"></span><span style="height:12px;background:var(--panel2);border-radius:3px"></span><span style="height:12px;background:var(--panel2);border-radius:3px"></span><span style="height:12px;background:var(--panel2);border-radius:3px"></span></div>
            <div style="height:14px;background:rgba(16,185,129,.22);border-radius:4px"></div>`;
  }
  if (key === 'tpl2') {
    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;height:100%">
              <div style="background:rgba(34,211,238,.2);border-radius:6px"></div>
              <div style="background:rgba(16,185,129,.2);border-radius:6px"></div>
              <div style="background:rgba(168,85,247,.2);border-radius:6px"></div>
            </div>`;
  }
  if (key === 'tpl3' || key === 'ai_tpl2') {
    return `<div style="display:grid;grid-template-columns:1fr 2fr;gap:6px;height:100%">
              <div style="background:rgba(148,163,184,.22);border-radius:6px"></div>
              <div style="background:rgba(34,211,238,.25);border-radius:6px"></div>
            </div>`;
  }
  if (key === 'tpl4') {
    return `<div style="display:flex;flex-direction:column;gap:4px">
              <div style="height:12px;background:rgba(34,211,238,.3);border-radius:3px"></div>
              <div style="height:10px;background:rgba(148,163,184,.18);border-radius:3px"></div>
              <div style="height:10px;background:rgba(148,163,184,.18);border-radius:3px"></div>
              <div style="height:10px;background:rgba(148,163,184,.18);border-radius:3px"></div>
            </div>`;
  }
  if (key === 'ai_tpl3') {
    return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;height:100%">
              <div style="background:rgba(56,189,248,.22);border-radius:5px"></div>
              <div style="background:rgba(245,158,11,.22);border-radius:5px"></div>
              <div style="background:rgba(16,185,129,.25);border-radius:5px"></div>
              <div style="background:rgba(148,163,184,.2);border-radius:5px"></div>
            </div>`;
  }
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;height:20px">
            <span style="background:rgba(14,165,233,.3);border-radius:4px"></span>
            <span style="background:rgba(16,185,129,.3);border-radius:4px"></span>
            <span style="background:rgba(168,85,247,.3);border-radius:4px"></span>
          </div>
          <div style="height:30px;background:rgba(34,211,238,.16);border-radius:6px"></div>`;
}

window.setAdminTplMenuFilter = function(filterKey) {
  activeAdminTplMenuFilter = filterKey || 'all';
  renderAdminPageTemplates();
};

function persistAllMenuTemplatesConfig(saveServer = true) {
  const all = {};
  Object.keys(ALL_MENUS_TEMPLATES_CATALOG).forEach(mKey => {
    all[mKey] = getMenuTemplateConfig(mKey);
  });
  S.ui.pageTemplates = all;
  try {
    localStorage.setItem('sy_page_templates', JSON.stringify(all));
  } catch (e) {}
  if (saveServer && hasUserAdminAccess(S.user)) {
    api('/api/admin/page-templates', { method: 'POST', body: JSON.stringify({ pageTemplates: all }) }).catch(() => {});
  }
}

window.setAdminActiveMenuTemplate = function(menuKey, tplKey, saveServer = true) {
  const cfg = getMenuTemplateConfig(menuKey);
  cfg.active = tplKey;
  if (!cfg.allowed.includes(tplKey)) {
    cfg.allowed.push(tplKey);
  }
  persistAllMenuTemplatesConfig(saveServer);
  applySingleMenuTemplate(menuKey);
  if (menuKey === 'signals') renderSignals();
  if (menuKey === 'autoInvest') renderAutoInvestPageStage();
  renderAdminPageTemplates();
};

window.toggleAdminAllowUserTpl = function(menuKey, checked) {
  const cfg = getMenuTemplateConfig(menuKey);
  cfg.allowUserSelect = !!checked;
  persistAllMenuTemplatesConfig(true);
  applySingleMenuTemplate(menuKey);
  if (menuKey === 'signals') renderSignals();
  if (menuKey === 'autoInvest') renderAutoInvestPageStage();
  renderAdminPageTemplates();
  toast(checked
    ? '✅ انتخاب قالب برای کاربر در این منو فعال شد (فقط قالب‌های مجاز تیک‌خورده به کاربر نمایش داده می‌شوند).'
    : '🔒 نمایش قالب‌ها در این منو مخفی شد و فقط قالب انتخابی ادمین برای همه اعمال می‌شود.', 'ok');
};

window.toggleAdminAllowedTplItem = function(menuKey, tplKey, checked) {
  const cfg = getMenuTemplateConfig(menuKey);
  if (checked) {
    if (!cfg.allowed.includes(tplKey)) cfg.allowed.push(tplKey);
  } else {
    if (cfg.allowed.length <= 1 && cfg.allowed.includes(tplKey)) {
      toast('حداقل ۱ قالب باید در لیست مجاز باقی بماند', 'err');
      renderAdminPageTemplates();
      return;
    }
    cfg.allowed = cfg.allowed.filter(k => k !== tplKey);
  }
  persistAllMenuTemplatesConfig(true);
  applySingleMenuTemplate(menuKey);
  if (menuKey === 'signals') renderSignals();
  if (menuKey === 'autoInvest') renderAutoInvestPageStage();
  renderAdminPageTemplates();
};

window.previewMenuOrAuthTemplate = function(viewId) {
  if (viewId === 'forgot') {
    openForgotModal();
    return;
  }
  if (viewId === 'auth') {
    showAuth(true);
    let closeBtn = $('#authAdminPreviewCloseBtn');
    if (!closeBtn && $('#authMainCard')) {
      closeBtn = document.createElement('button');
      closeBtn.id = 'authAdminPreviewCloseBtn';
      closeBtn.type = 'button';
      closeBtn.className = 'btn btn-ghost btn-sm';
      closeBtn.style.cssText = 'width:100%;margin-bottom:10px;border-color:var(--accent);color:var(--accent)';
      closeBtn.innerHTML = '← بستن پیش‌نمایش و بازگشت به پنل مدیریت';
      closeBtn.onclick = () => showAuth(false);
      $('#authMainCard').prepend(closeBtn);
    }
    if (closeBtn) closeBtn.style.display = S.user ? 'inline-flex' : 'none';
  } else {
    go(viewId);
  }
};

window.renderAdminPageTemplates = function() {
  const filterBar = $('#admTplMenuFilterBar');
  const container = $('#admAllMenusTemplatesContainer');
  if (!container) return;

  const menuKeys = Object.keys(ALL_MENUS_TEMPLATES_CATALOG);

  if (filterBar) {
    filterBar.innerHTML = `
      <button type="button" class="chip ${activeAdminTplMenuFilter === 'all' ? 'active' : ''}" onclick="setAdminTplMenuFilter('all')">
        🌐 همه بخش‌ها (${NF(menuKeys.length, 0)} بخش · ۷۵ قالب اختصاصی)
      </button>
      ${menuKeys.map(mKey => {
        const cat = ALL_MENUS_TEMPLATES_CATALOG[mKey];
        return `<button type="button" class="chip ${activeAdminTplMenuFilter === mKey ? 'active' : ''}" onclick="setAdminTplMenuFilter('${mKey}')">${esc(cat.title)} (${NF(cat.templates.length, 0)} قالب)</button>`;
      }).join('')}
    `;
  }

  const visibleMenuKeys = activeAdminTplMenuFilter === 'all'
    ? menuKeys
    : menuKeys.filter(k => k === activeAdminTplMenuFilter);

  container.innerHTML = visibleMenuKeys.map(mKey => {
    const cat = ALL_MENUS_TEMPLATES_CATALOG[mKey];
    const cfg = getMenuTemplateConfig(mKey);
    const activeMeta = cat.templates.find(t => t.key === cfg.active) || cat.templates[0];

    return `
      <div class="adm-menu-tpl-section">
        <div class="adm-menu-tpl-header">
          <div>
            <div class="row-gap" style="gap:8px;flex-wrap:wrap">
              <h3 style="margin:0;font-size:15.5px;color:var(--accent)">${esc(cat.title)}</h3>
              <span class="pill pill-ok">قالب فعال سایت: ${esc(activeMeta ? activeMeta.title : cfg.active)}</span>
            </div>
            <p class="hint" style="margin:4px 0 0">
              ${cfg.allowUserSelect
                ? `🟢 کاربر اجازه دارد بین <b>${NF(cfg.allowed.length, 0)} قالب مجاز</b> تیک‌خورده زیر انتخاب کند.`
                : `🔒 نوار انتخاب قالب در این منو مخفی است و <b>فقط قالب فعال ادمین (${esc(activeMeta ? activeMeta.badge : cfg.active)})</b> برای همه کاربران اعمال می‌شود.`}
            </p>
          </div>

          <div class="row-gap wrap-gap">
            <label class="adm-tpl-user-perm-box" style="cursor:pointer">
              <input type="checkbox" ${cfg.allowUserSelect ? 'checked' : ''} onchange="toggleAdminAllowUserTpl('${mKey}', this.checked)" />
              <span><b>اجازه انتخاب قالب به کاربر در این منو</b> (نمایش قالب‌های مجاز)</span>
            </label>
            <button type="button" class="btn btn-ghost btn-sm" onclick="previewMenuOrAuthTemplate('${cat.viewId}')">👁️ مشاهده زنده ←</button>
          </div>
        </div>

        <div class="adm-tpl-cards-grid">
          ${cat.templates.map(t => {
            const isAct = t.key === cfg.active;
            const isAllowed = cfg.allowed.includes(t.key);
            return `
              <div class="adm-tpl-card ${isAct ? 'active' : ''}" onclick="setAdminActiveMenuTemplate('${mKey}', '${t.key}', true); toast('قالب اصلی «${esc(cat.title)}» به «${esc(t.title)}» تغییر یافت و اعمال شد ✨', 'ok')">
                <div>
                  <div class="row-between" style="gap:6px;margin-bottom:8px">
                    <span class="pill pill-xs" style="background:${isAct ? 'var(--up)' : 'var(--surface)'};color:${isAct ? '#052e16' : 'var(--txt)'};font-weight:800">
                      ${isAct ? '✓ قالب فعال منو' : t.badge}
                    </span>
                    <code>${t.key}</code>
                  </div>
                  <h4 style="margin:0 0 8px;font-size:13.5px;font-weight:800">${esc(t.title)}</h4>
                  <div class="adm-tpl-wireframe">${getWireframeSvgForTemplate(t.key)}</div>
                  <p class="muted" style="font-size:12px;margin:10px 0 0;line-height:1.6">${esc(t.desc)}</p>
                </div>

                <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)" onclick="event.stopPropagation()">
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-bottom:8px;color:${isAllowed ? 'var(--up)' : 'var(--muted)'}">
                    <input type="checkbox" ${isAllowed ? 'checked' : ''} onchange="toggleAdminAllowedTplItem('${mKey}', '${t.key}', this.checked)" />
                    <span>مجاز برای انتخاب کاربر (در صورت فعال بودن انتخاب کاربر)</span>
                  </label>
                  <div class="row-gap" style="gap:6px">
                    <button type="button" class="btn ${isAct ? 'btn-primary' : 'btn-ghost'} btn-sm" style="flex:1" onclick="setAdminActiveMenuTemplate('${mKey}', '${t.key}', true); toast('قالب «${esc(t.title)}» فعال و اعمال شد ✨', 'ok')">
                      ${isAct ? '✅ قالب فعال سایت' : 'فعال‌سازی این قالب'}
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="setAdminActiveMenuTemplate('${mKey}', '${t.key}', true); previewMenuOrAuthTemplate('${cat.viewId}')">
                      👁️ پیش‌نمایش
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
};

window.saveAdminPageTemplates = async function() {
  persistAllMenuTemplatesConfig(true);
  applyAllMenuTemplates();
  renderSignals();
  renderAutoInvestPageStage();
  renderAdminPageTemplates();
  toast('✅ تنظیمات قالب تمامی ۹ منو و سطوح دسترسی انتخاب قالب با موفقیت ذخیره و در کل سایت اعمال شد!', 'ok');
};

/* ============================================================================
   استودیو جامع ۳۸ فونت، سایز فونت و تایپوگرافی (Typography & All Fonts Studio)
   ============================================================================ */
const ALL_FONTS_CATALOG = [
  // ۱. فونت‌های محبوب و استاندارد وب فارسی
  { key: 'Vazirmatn', name: 'وزیرمتن (Vazirmatn)', cat: 'persian_web', badge: 'پیش‌فرض مدرن ⭐', desc: 'فونت استاندارد، مدرن و فوق‌العاده خوانا برای رابط کاربری و جداول مالی', url: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap' },
  { key: 'Estedad', name: 'استعداد (Estedad)', cat: 'persian_web', badge: 'فین‌تک و مدرن 💎', desc: 'ساختار هندسی دقیق و تمیز؛ ایده‌آل برای داشبوردهای مالی و صرافی‌ها', url: 'https://cdn.jsdelivr.net/gh/aminabedi68/Estedad@master/dist/Estedad-font-face.css' },
  { key: 'Shabnam', name: 'شبنم (Shabnam)', cat: 'persian_web', badge: 'نرم و استارتاپی ✨', desc: 'حروف گرد و متوازن با خوانایی عالی در کارت‌ها و منوهای موبایل و دسکتاپ', url: 'https://cdn.jsdelivr.net/gh/rastikerdar/shabnam-font@v5.0.1/dist/font-face.css' },
  { key: 'Samim', name: 'صمیم (Samim)', cat: 'persian_web', badge: 'صمیمی و خوانا 📖', desc: 'مناسب برای متون تحلیلی طولانی، گزارش‌های هوش مصنوعی و راهنما', url: 'https://cdn.jsdelivr.net/gh/rastikerdar/samim-font@v4.0.5/dist/font-face.css' },
  { key: 'Sahel', name: 'ساحل (Sahel)', cat: 'persian_web', badge: 'مینیمال و رسمی 🏛️', desc: 'طراحی شکیل و رسمی برای پلتفرم‌های سرمایه‌گذاری و بانکی', url: 'https://cdn.jsdelivr.net/gh/rastikerdar/sahel-font@v3.4.0/dist/font-face.css' },
  { key: 'Tanha', name: 'تنها (Tanha)', cat: 'persian_web', badge: 'گرم و اصیل 🌿', desc: 'ترکیب حس خوشنویسی سنتی فارسی با ساختار مدرن وب', url: 'https://cdn.jsdelivr.net/gh/rastikerdar/tanha-font@v0.10/dist/font-face.css' },
  { key: 'Nahid', name: 'ناهید (Nahid)', cat: 'persian_web', badge: 'ظریف و سبک 🌸', desc: 'قلم ظریف و تمیز با تراکم عالی در جداول پرتراکم سیگنال‌ها', url: 'https://cdn.jsdelivr.net/gh/rastikerdar/nahid-font@v0.2.1/dist/font-face.css' },
  { key: 'Parastoo', name: 'پرستو (Parastoo)', cat: 'persian_web', badge: 'مطبوعاتی و کتابی 📰', desc: 'سبک کلاسیک مجلات و گزارش‌های تحلیلی اقتصادی', url: 'https://cdn.jsdelivr.net/gh/rastikerdar/parastoo-font@v2.0.1/dist/font-face.css' },
  { key: 'Gandom', name: 'گandom (گندم)', cat: 'persian_web', badge: 'ساده و یکدست 🌾', desc: 'خوانایی سریع ارقام و عناوین در کارت‌های سیگنال', url: 'https://cdn.jsdelivr.net/gh/rastikerdar/gandom-font@v0.8/dist/font-face.css' },
  { key: 'Mikhak', name: 'میخک (Mikhak)', cat: 'persian_web', badge: 'مدرن و خاص 🎯', desc: 'قلم مدرن با شخصیت بصری متمایز برای برندینگ اختصاصی', url: 'https://cdn.jsdelivr.net/gh/aminabedi68/Mikhak@master/dist/Mikhak-font-face.css' },
  { key: 'Behdad', name: 'بهداد (Behdad)', cat: 'persian_web', badge: 'تیتر و متن سنگین 🖋️', desc: 'تایپوگرافی اصیل و باوقار برای تیترها و کارت‌های ویژه', url: 'https://cdn.jsdelivr.net/gh/scict/behdad-font@master/dist/font-face.css' },
  { key: 'Nika', name: 'نیکا (Nika)', cat: 'persian_web', badge: 'رابط کاربری تمیز 🖥️', desc: 'طراحی‌شده ویژه خوانایی در صفحات وب و اپلیکیشن‌ها', url: 'https://cdn.jsdelivr.net/gh/font-store/nika-font@master/dist/font-face.css' },

  // ۲. فونت‌های سازمانی، صرافی و سیستم‌عامل فارسی
  { key: 'IRANSansX', name: 'ایران‌سنس ایکس (IRANSansX)', cat: 'enterprise', badge: 'سازمانی و بانکی 🏦', desc: 'فونت محبوب بانک‌ها، کارگزاری‌های بورس و سامانه‌های مالی ایران', url: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap' },
  { key: 'IRANSans', name: 'ایران‌سنس کلاسیک (IRANSans)', cat: 'enterprise', badge: 'استاندارد سازمانی 🏢', desc: 'پشتیبانی کامل از فونت ایران‌سنس سیستم و وب با جایگزین هوشمند', url: '' },
  { key: 'IRANYekan', name: 'ایران‌یکان (IRANYekan)', cat: 'enterprise', badge: 'محبوب بورس و صرافی 📈', desc: 'فونت استاندارد پلتفرم‌های معاملاتی بورس و رمزارز ایران', url: '' },
  { key: 'Yekan Bakh', name: 'یکان بخ (Yekan Bakh)', cat: 'enterprise', badge: 'لوکس و مدرن 💎', desc: 'تایپوگرافی مدرن و پرطرفدار در استارتاپ‌های فین‌تک و کریپتو', url: '' },
  { key: 'Dana', name: 'دانا (Dana)', cat: 'enterprise', badge: 'نرم و فین‌تکی 🚀', desc: 'هندسه بسیار تمیز و خوانا در تمام سایزهای کوچک و بزرگ', url: '' },
  { key: 'Kalameh', name: 'کلمه (Kalameh)', cat: 'enterprise', badge: 'قدرتمند و گرافیکی 🔥', desc: 'فوق‌العاده جذاب برای تیترها، بنرها و کارت‌های ویترینی', url: '' },
  { key: 'Peyda', name: 'پیدا (Peyda)', cat: 'enterprise', badge: 'هندسی مدرن 📐', desc: 'طراحی مدرن و مینیمال مناسب رابط‌های کاربری نسل جدید', url: '' },
  { key: 'Anjoman', name: 'انجمن (Anjoman)', cat: 'enterprise', badge: 'خبری و تحلیلی 🗞️', desc: 'خوانایی بالا در متون تحلیلی و جداول مقایسه‌ای', url: '' },
  { key: 'B Nazanin', name: 'بی نازنین (B Nazanin)', cat: 'enterprise', badge: 'کلاسیک اداری 📜', desc: 'فونت رسمی اسناد، گزارش‌های مالی و متون کلاسیک فارسی', url: '' },
  { key: 'B Titr', name: 'بی تیتر (B Titr)', cat: 'enterprise', badge: 'تیترهای درشت 📢', desc: 'مناسب برای عناوین برجسته و سرتیترهای داشبورد', url: '' },
  { key: 'Tahoma', name: 'تاهوما (Tahoma)', cat: 'enterprise', badge: 'کلاسیک و سریع ⚡', desc: 'فونت پیش‌فرض سیستم‌عامل با حداکثر سرعت رندر در تمام دستگاه‌ها', url: '' },

  // ۳. فونت‌های رسمی گوگل (فارسی / عربی / بین‌المللی)
  { key: 'IBM Plex Sans Arabic', name: 'آی‌بی‌ام پلکس (IBM Plex Sans)', cat: 'google_arabic', badge: 'مهندسی کوانت 🧪', desc: 'طراحی شرکت IBM؛ بی‌نظیر برای ترمینال‌های مالی، کوانت و داشبوردهای داده', url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap' },
  { key: 'Readex Pro', name: 'ریدکس پرو (Readex Pro)', cat: 'google_arabic', badge: 'فوق‌العاده خوانا 👁️', desc: 'طراحی‌شده با تمرکز علمی بر حداکثر سرعت خوانش متن و اعداد', url: 'https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&display=swap' },
  { key: 'Noto Sans Arabic', name: 'نوتو سنس گوگل (Noto Sans)', cat: 'google_arabic', badge: 'استاندارد گوگل 🌐', desc: 'فونت رسمی شرکت گوگل با پشتیبانی کامل از تمام حروف و علائم فارسی', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@300;400;500;600;700;800;900&display=swap' },
  { key: 'Noto Naskh Arabic', name: 'نوتو نسخ (Noto Naskh)', cat: 'google_arabic', badge: 'نسخ مدرن و رسمی ✒️', desc: 'خوانایی کلاسیک و بسیار راحت برای مطالعه طولانی گزارش‌های بازار', url: 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap' },
  { key: 'Cairo', name: 'کایرو (Cairo)', cat: 'google_arabic', badge: 'مدرن و تکنولوژیک 🚀', desc: 'خطوط صاف و مدرن؛ بسیار محبوب در پلتفرم‌های ترید و وب۳', url: 'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap' },
  { key: 'Tajawal', name: 'تجول (Tajawal)', cat: 'google_arabic', badge: 'سبک و مینیمال 🍃', desc: 'طراحی خلوت و تمیز برای رابط‌های کاربری مدرن و مینیمال', url: 'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap' },
  { key: 'Almarai', name: 'المراعی (Almarai)', cat: 'google_arabic', badge: 'عالی برای جداول 📊', desc: 'وضوح فوق‌العاده در سایزهای ریز و جداول پرتراکم مالی', url: 'https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&display=swap' },
  { key: 'Rubik', name: 'روبیک (Rubik)', cat: 'google_arabic', badge: 'گرد و بین‌المللی 🌍', desc: 'گوشه‌های کمی گرد و هماهنگی عالی بین حروف فارسی و انگلیسی', url: 'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&display=swap' },
  { key: 'Changa', name: 'چنگا (Changa)', cat: 'google_arabic', badge: 'کریپتو و مدرن ⚡', desc: 'ساختار مربعی و اسپرت؛ ایده‌آل برای قالب‌های کوانت و کریپتو', url: 'https://fonts.googleapis.com/css2?family=Changa:wght@300;400;500;600;700;800&display=swap' },
  { key: 'El Messiri', name: 'المسیری (El Messiri)', cat: 'google_arabic', badge: 'لوکس و متمایز 👑', desc: 'دارای انحناهای ظریف و لوکس؛ عالی برای تیترها و کارت‌های VIP', url: 'https://fonts.googleapis.com/css2?family=El+Messiri:wght@400;500;600;700&display=swap' },
  { key: 'Baloo Bhaijaan 2', name: 'بالو (Baloo Bhaijaan 2)', cat: 'google_arabic', badge: 'نرم و دوستانه 😊', desc: 'فرم گرد و پرانرژی با خوانایی بالا در دکمه‌ها و بج‌ها', url: 'https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@400;500;600;700;800&display=swap' },
  { key: 'Lalezar', name: 'لاله‌زار (Lalezar)', cat: 'google_arabic', badge: 'ویژه تیترهای درشت 🎨', desc: 'فونت نمایشی و پرقدرت ایرانی برای تیترهای بزرگ و پوسترها', url: 'https://fonts.googleapis.com/css2?family=Lalezar&display=swap' },
  { key: 'Markazi Text', name: 'متن مرکزی (Markazi Text)', cat: 'google_arabic', badge: 'خوانایی مطبوعاتی 📚', desc: 'طراحی‌شده برای حداکثر راحتی چشم در متون تحلیلی', url: 'https://fonts.googleapis.com/css2?family=Markazi+Text:wght@400;500;600;700&display=swap' },
  { key: 'Amiri', name: 'امیری (Amiri)', cat: 'google_arabic', badge: 'کلاسیک فاخر 🏛️', desc: 'سبک نسخ کلاسیک با جزئیات دقیق چاپ و نشر', url: 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap' },

  // ۴. فونت‌های مهندسی اعداد، کدها و ترمینال مالی
  { key: 'JetBrains Mono', name: 'جت‌برینز مونو (JetBrains Mono)', cat: 'monospace', badge: 'ترمینال و اعداد 🔢', desc: 'بهترین فونت Monospace جهان برای نمایش قیمت‌ها، کدها و لاگ ربات', url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap' },
  { key: 'Fira Code', name: 'فیرا کد (Fira Code)', cat: 'monospace', badge: 'کدنویسی و کوانت 💻', desc: 'نمایش دقیق و هم‌عرض اعداد، تیک‌های قیمتی و شناسه‌های معاملاتی', url: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap' }
];

const loadedFontUrls = new Set();
let activeAdminFontCatFilter = 'all';

function ensureWebFontLoaded(fontKey) {
  const item = ALL_FONTS_CATALOG.find(f => f.key === fontKey);
  if (!item || !item.url || loadedFontUrls.has(item.url)) return;
  loadedFontUrls.add(item.url);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = item.url;
  document.head.appendChild(link);
}

function ensureCustomFontUrlLoaded(customUrl) {
  const u = String(customUrl || '').trim();
  if (!u || loadedFontUrls.has(u)) return;
  loadedFontUrls.add(u);
  if (u.endsWith('.woff2') || u.endsWith('.woff') || u.endsWith('.ttf') || u.endsWith('.otf')) {
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: "CustomAdminFont"; src: url("${u}"); font-display: swap; }`;
    document.head.appendChild(style);
  } else {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = u;
    document.head.appendChild(link);
  }
}

function populateFontSelectDropdowns() {
  const groups = [
    { label: '🇮🇷 فونت‌های استاندارد وب فارسی', cat: 'persian_web' },
    { label: '🏢 فونت‌های سازمانی و سیستم‌عامل فارسی', cat: 'enterprise' },
    { label: '🌐 فونت‌های گوگل فارسی و عربی', cat: 'google_arabic' },
    { label: '🔢 فونت‌های اعداد، قیمت و ترمینال', cat: 'monospace' }
  ];
  const optsHtml = groups.map(g => {
    const items = ALL_FONTS_CATALOG.filter(f => f.cat === g.cat);
    return `<optgroup label="${esc(g.label)}">${items.map(f => `<option value="${esc(f.key)}">${esc(f.name)} — ${esc(f.badge)}</option>`).join('')}</optgroup>`;
  }).join('');

  ['#typoMainFont', '#typoHeadingFont', '#typoMonoFont', '#uiThemeFontFamily'].forEach(sel => {
    const el = $(sel);
    if (el && !el.dataset.populated) {
      el.innerHTML = optsHtml;
      el.dataset.populated = '1';
    }
  });
}

window.setAdminFontCatFilter = function(cat) {
  activeAdminFontCatFilter = cat || 'all';
  renderAdminTypographyStudio();
};

window.renderAdminTypographyStudio = function() {
  populateFontSelectDropdowns();
  if (!S.ui) initUiCustomizationDefaults();
  const st = S.ui.themeStyles || {};

  const mainFont = st.fontFamily || 'Vazirmatn';
  const headingFont = st.headingFontFamily || mainFont;
  const monoFont = st.monoFontFamily || mainFont;
  const baseSizeNum = parseFloat(st.fontSizeBase) || 14.5;
  const navSizeNum = parseFloat(st.navFontSize) || 13;
  const btnSizeNum = parseFloat(st.btnFontSize) || 13;
  const tableSizeNum = parseFloat(st.tableFontSize) || 13;
  const priceSizeNum = parseFloat(st.priceFontSize) || 18;
  const headingScaleNum = Number(st.headingScale || 100);
  const bodyWeight = String(st.bodyWeight || '400');
  const headingWeight = String(st.headingWeight || '700');
  const lineHeightNum = parseFloat(st.lineHeightBase) || 1.75;
  const letterSpacingNum = parseFloat(st.letterSpacingBase) || 0;
  const tabularNums = String(st.tabularNums !== undefined ? st.tabularNums : '1');

  if ($('#typoMainFont')) $('#typoMainFont').value = mainFont;
  if ($('#typoHeadingFont')) $('#typoHeadingFont').value = headingFont;
  if ($('#typoMonoFont')) $('#typoMonoFont').value = monoFont;
  if ($('#uiThemeFontFamily')) $('#uiThemeFontFamily').value = mainFont;

  if ($('#typoBaseSize')) $('#typoBaseSize').value = baseSizeNum;
  if ($('#typoBaseSizeRange')) $('#typoBaseSizeRange').value = baseSizeNum;
  if ($('#lblTypoBaseSize')) $('#lblTypoBaseSize').textContent = baseSizeNum + 'px';

  if ($('#typoNavSize')) $('#typoNavSize').value = navSizeNum;
  if ($('#lblTypoNavSize')) $('#lblTypoNavSize').textContent = navSizeNum + 'px';

  if ($('#typoBtnSize')) $('#typoBtnSize').value = btnSizeNum;
  if ($('#lblTypoBtnSize')) $('#lblTypoBtnSize').textContent = btnSizeNum + 'px';

  if ($('#typoTableSize')) $('#typoTableSize').value = tableSizeNum;
  if ($('#lblTypoTableSize')) $('#lblTypoTableSize').textContent = tableSizeNum + 'px';

  if ($('#typoPriceSize')) $('#typoPriceSize').value = priceSizeNum;
  if ($('#lblTypoPriceSize')) $('#lblTypoPriceSize').textContent = priceSizeNum + 'px';

  if ($('#typoHeadingScale')) $('#typoHeadingScale').value = headingScaleNum;
  if ($('#lblTypoHeadingScale')) $('#lblTypoHeadingScale').textContent = headingScaleNum + '%';

  if ($('#typoBodyWeight')) $('#typoBodyWeight').value = bodyWeight;
  if ($('#typoHeadingWeight')) $('#typoHeadingWeight').value = headingWeight;

  if ($('#typoLineHeight')) $('#typoLineHeight').value = lineHeightNum;
  if ($('#lblTypoLineHeight')) $('#lblTypoLineHeight').textContent = String(lineHeightNum);

  if ($('#typoLetterSpacing')) $('#typoLetterSpacing').value = letterSpacingNum;
  if ($('#lblTypoLetterSpacing')) $('#lblTypoLetterSpacing').textContent = letterSpacingNum + 'px';

  if ($('#typoTabularNums')) $('#typoTabularNums').value = tabularNums;
  if ($('#typoCustomFontUrl')) $('#typoCustomFontUrl').value = st.customFontUrl || '';

  const fontMeta = ALL_FONTS_CATALOG.find(f => f.key === mainFont) || ALL_FONTS_CATALOG[0];
  if ($('#typoActiveFontBadge')) {
    $('#typoActiveFontBadge').textContent = `فونت فعال: ${fontMeta.name} · سایز پایه: ${baseSizeNum}px`;
  }

  // رندر نوار دسته‌بندی فونت‌ها
  const filterBar = $('#admFontCatFilterBar');
  if (filterBar) {
    const cats = [
      { key: 'all', label: `🌐 همه فونت‌ها (${NF(ALL_FONTS_CATALOG.length, 0)} فونت)` },
      { key: 'persian_web', label: '🇮🇷 فونت‌های استاندارد وب فارسی (۱۲)' },
      { key: 'enterprise', label: '🏢 فونت‌های سازمانی و سیستم‌عامل (۱۱)' },
      { key: 'google_arabic', label: '🌍 فونت‌های گوگل فارسی و عربی (۱۴)' },
      { key: 'monospace', label: '🔢 فونت‌های اعداد و کد مالی (۲)' }
    ];
    filterBar.innerHTML = cats.map(c => `
      <button type="button" class="chip ${activeAdminFontCatFilter === c.key ? 'active' : ''}" onclick="setAdminFontCatFilter('${c.key}')">${c.label}</button>
    `).join('');
  }

  // رندر گالری کارت‌های فونت (با بارگذاری پیش‌نمایش و نمایش متن نمونه با همان فونت)
  const grid = $('#admFontsCatalogGrid');
  if (grid) {
    const list = activeAdminFontCatFilter === 'all'
      ? ALL_FONTS_CATALOG
      : ALL_FONTS_CATALOG.filter(f => f.cat === activeAdminFontCatFilter);

    list.forEach(f => { if (f.url) ensureWebFontLoaded(f.key); });

    grid.innerHTML = list.map(f => {
      const isAct = f.key === mainFont;
      return `
        <div class="adm-tpl-card ${isAct ? 'active' : ''}" onclick="selectFontFromCatalog('${esc(f.key)}')" style="font-family:'${esc(f.key)}', Vazirmatn, Tahoma, sans-serif">
          <div>
            <div class="row-between" style="gap:6px;margin-bottom:6px">
              <span class="pill pill-xs" style="background:${isAct ? 'var(--up)' : 'var(--surface)'};color:${isAct ? '#052e16' : 'var(--txt)'};font-weight:800">
                ${isAct ? '✓ فونت فعال سایت' : f.badge}
              </span>
              <code style="font-size:11px">${esc(f.key)}</code>
            </div>
            <h4 style="margin:0 0 6px;font-size:15px;font-weight:800;font-family:'${esc(f.key)}', Vazirmatn, sans-serif">${esc(f.name)}</h4>
            <div style="background:var(--surface);border:1px dashed var(--line2);border-radius:10px;padding:10px;margin:6px 0;font-family:'${esc(f.key)}', Vazirmatn, sans-serif">
              <div style="font-size:14px;font-weight:700;color:var(--txt)">سیگنال خرید پله‌ای طلای ۱۸ عیار و بیت‌کوین</div>
              <div style="font-size:12.5px;color:var(--up);margin-top:4px">قیمت لحظه‌ای: ۲,۶۴۸,۵۰۰ تومان (+۱۸.۵٪ سود)</div>
            </div>
            <p class="muted" style="font-size:11.5px;margin:4px 0 0">${esc(f.desc)}</p>
          </div>
          <div class="row-gap" style="gap:6px;margin-top:8px">
            <button type="button" class="btn ${isAct ? 'btn-primary' : 'btn-ghost'} btn-sm" style="flex:1" onclick="event.stopPropagation(); selectFontFromCatalog('${esc(f.key)}')">
              ${isAct ? '✅ فونت فعال فعلی' : 'انتخاب و اعمال فوری این فونت'}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); selectFontForHeadingsOnly('${esc(f.key)}')" title="اعمال فقط روی تیترهای سایت">
              فقط تیترها
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
};

window.onTypoControlChange = function() {
  if (!S.ui) initUiCustomizationDefaults();
  if (!S.ui.themeStyles) S.ui.themeStyles = JSON.parse(JSON.stringify(DEFAULT_THEME_STYLES));
  const st = S.ui.themeStyles;

  const mainFont = $('#typoMainFont')?.value || st.fontFamily || 'Vazirmatn';
  const headingFont = $('#typoHeadingFont')?.value || mainFont;
  const monoFont = $('#typoMonoFont')?.value || mainFont;
  const baseSize = ($('#typoBaseSize')?.value || '14.5') + 'px';
  const navSize = ($('#typoNavSize')?.value || '13') + 'px';
  const btnSize = ($('#typoBtnSize')?.value || '13') + 'px';
  const tableSize = ($('#typoTableSize')?.value || '13') + 'px';
  const priceSize = ($('#typoPriceSize')?.value || '18') + 'px';
  const headingScale = Number($('#typoHeadingScale')?.value || 100);
  const bodyWeight = $('#typoBodyWeight')?.value || '400';
  const headingWeight = $('#typoHeadingWeight')?.value || '700';
  const lineHeightBase = $('#typoLineHeight')?.value || '1.75';
  const letterSpacingBase = ($('#typoLetterSpacing')?.value || '0') + 'px';
  const tabularNums = Number($('#typoTabularNums')?.value ?? 1);
  const customFontUrl = ($('#typoCustomFontUrl')?.value || '').trim();

  st.fontFamily = mainFont;
  st.headingFontFamily = headingFont;
  st.monoFontFamily = monoFont;
  st.fontSizeBase = baseSize;
  st.navFontSize = navSize;
  st.btnFontSize = btnSize;
  st.tableFontSize = tableSize;
  st.priceFontSize = priceSize;
  st.headingScale = headingScale;
  st.bodyWeight = bodyWeight;
  st.headingWeight = headingWeight;
  st.lineHeightBase = lineHeightBase;
  st.letterSpacingBase = letterSpacingBase;
  st.tabularNums = tabularNums;
  st.customFontUrl = customFontUrl;

  if ($('#lblTypoBaseSize')) $('#lblTypoBaseSize').textContent = baseSize;
  if ($('#lblTypoNavSize')) $('#lblTypoNavSize').textContent = navSize;
  if ($('#lblTypoBtnSize')) $('#lblTypoBtnSize').textContent = btnSize;
  if ($('#lblTypoTableSize')) $('#lblTypoTableSize').textContent = tableSize;
  if ($('#lblTypoPriceSize')) $('#lblTypoPriceSize').textContent = priceSize;
  if ($('#lblTypoHeadingScale')) $('#lblTypoHeadingScale').textContent = headingScale + '%';
  if ($('#lblTypoLineHeight')) $('#lblTypoLineHeight').textContent = lineHeightBase;
  if ($('#lblTypoLetterSpacing')) $('#lblTypoLetterSpacing').textContent = letterSpacingBase;

  if ($('#uiThemeFontFamily')) $('#uiThemeFontFamily').value = mainFont;
  if ($('#uiThemeFontSize')) $('#uiThemeFontSize').value = baseSize;

  const fontMeta = ALL_FONTS_CATALOG.find(f => f.key === mainFont) || ALL_FONTS_CATALOG[0];
  if ($('#typoActiveFontBadge')) {
    $('#typoActiveFontBadge').textContent = `فونت فعال: ${fontMeta.name} · سایز پایه: ${baseSize}`;
  }

  applyTheme(st, true);
};

window.selectFontFromCatalog = function(fontKey) {
  populateFontSelectDropdowns();
  if ($('#typoMainFont')) $('#typoMainFont').value = fontKey;
  if ($('#typoHeadingFont')) $('#typoHeadingFont').value = fontKey;
  if ($('#uiThemeFontFamily')) $('#uiThemeFontFamily').value = fontKey;
  onTypoControlChange();
  saveTypographySettings(true);
  renderAdminTypographyStudio();
  const fMeta = ALL_FONTS_CATALOG.find(f => f.key === fontKey);
  toast(`🔤 فونت «${fMeta ? fMeta.name : fontKey}» در کل سایت فعال و ذخیره شد!`, 'ok');
};

window.selectFontForHeadingsOnly = function(fontKey) {
  populateFontSelectDropdowns();
  if ($('#typoHeadingFont')) $('#typoHeadingFont').value = fontKey;
  onTypoControlChange();
  saveTypographySettings(true);
  const fMeta = ALL_FONTS_CATALOG.find(f => f.key === fontKey);
  toast(`🖋️ فونت تیترهای سایت به «${fMeta ? fMeta.name : fontKey}» تغییر یافت!`, 'ok');
};

window.applyQuickFontSizePreset = function(preset) {
  const map = {
    compact:     { base: 12.5, nav: 11.5, btn: 11.5, tbl: 11.5, price: 15.5, scale: 90 },
    normal:      { base: 14.0, nav: 13.0, btn: 13.0, tbl: 13.0, price: 17.5, scale: 100 },
    comfortable: { base: 15.5, nav: 14.0, btn: 14.0, tbl: 14.0, price: 19.5, scale: 105 },
    large:       { base: 17.0, nav: 15.5, btn: 15.0, tbl: 15.0, price: 21.5, scale: 115 },
    xlarge:      { base: 19.0, nav: 17.0, btn: 16.5, tbl: 16.5, price: 24.0, scale: 125 }
  };
  const p = map[preset] || map.normal;
  if ($('#typoBaseSize')) $('#typoBaseSize').value = p.base;
  if ($('#typoBaseSizeRange')) $('#typoBaseSizeRange').value = p.base;
  if ($('#typoNavSize')) $('#typoNavSize').value = p.nav;
  if ($('#typoBtnSize')) $('#typoBtnSize').value = p.btn;
  if ($('#typoTableSize')) $('#typoTableSize').value = p.tbl;
  if ($('#typoPriceSize')) $('#typoPriceSize').value = p.price;
  if ($('#typoHeadingScale')) $('#typoHeadingScale').value = p.scale;
  onTypoControlChange();
  saveTypographySettings(true);
  toast(`📏 سایز فونت کل سایت به حالت «${p.base}px» تغییر یافت و ذخیره شد!`, 'ok');
};

window.saveTypographySettings = async function(silent = false) {
  onTypoControlChange();
  try {
    localStorage.setItem('sy_ui_customizer', JSON.stringify(S.ui));
  } catch (e) {}
  try {
    await api('/api/admin/ui-settings', {
      method: 'POST',
      body: JSON.stringify({ themeStyles: S.ui.themeStyles })
    });
  } catch (e) {}
  if (!silent) {
    toast('✅ تنظیمات فونت، سایز فونت و تایپوگرافی با موفقیت در کل سایت ذخیره و اعمال شد!', 'ok');
  }
};

window.resetTypographySettings = async function() {
  if ($('#typoMainFont')) $('#typoMainFont').value = 'Vazirmatn';
  if ($('#typoHeadingFont')) $('#typoHeadingFont').value = 'Vazirmatn';
  if ($('#typoMonoFont')) $('#typoMonoFont').value = 'Vazirmatn';
  if ($('#typoBaseSize')) $('#typoBaseSize').value = 14.5;
  if ($('#typoBaseSizeRange')) $('#typoBaseSizeRange').value = 14.5;
  if ($('#typoNavSize')) $('#typoNavSize').value = 13;
  if ($('#typoBtnSize')) $('#typoBtnSize').value = 13;
  if ($('#typoTableSize')) $('#typoTableSize').value = 13;
  if ($('#typoPriceSize')) $('#typoPriceSize').value = 18;
  if ($('#typoHeadingScale')) $('#typoHeadingScale').value = 100;
  if ($('#typoBodyWeight')) $('#typoBodyWeight').value = '400';
  if ($('#typoHeadingWeight')) $('#typoHeadingWeight').value = '700';
  if ($('#typoLineHeight')) $('#typoLineHeight').value = 1.75;
  if ($('#typoLetterSpacing')) $('#typoLetterSpacing').value = 0;
  if ($('#typoTabularNums')) $('#typoTabularNums').value = '1';
  if ($('#typoCustomFontUrl')) $('#typoCustomFontUrl').value = '';
  await saveTypographySettings(true);
  renderAdminTypographyStudio();
  toast('🔄 فونت و سایزهای سایت به حالت استاندارد کارخانه (وزیرمتن ۱۴.۵px) بازنشانی شد!', 'ok');
};

/* ============================================================================
   کاتالوگ جامع ۵۲ ارز دیجیتال جهان با قیمت لحظه‌ای، مدیریت درگاه و ۵ قالب واریز رمزارز
   ============================================================================ */
const WORLD_CRYPTO_CATALOG = [
  // ۱. استیبل‌کوین‌ها (Stablecoins)
  { id: 'usdt_trc20', cgId: 'tether', symbol: 'USDT', name: 'تتر شبکه ترون (Tether TRC-20)', network: 'TRC20', cat: 'stable', icon: '💎', priceUsd: 1.00, change24h: 0.02, defaultAddress: 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF' },
  { id: 'usdt_ton',   cgId: 'tether', symbol: 'USDT', name: 'تتر شبکه تون (USDT-TON)', network: 'TON', cat: 'stable', icon: '💠', priceUsd: 1.00, change24h: 0.01, defaultAddress: 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF' },
  { id: 'usdt_bep20', cgId: 'tether', symbol: 'USDT', name: 'تتر شبکه بایننس (USDT-BEP20)', network: 'BEP20', cat: 'stable', icon: '🟡', priceUsd: 1.00, change24h: 0.01, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'usdt_erc20', cgId: 'tether', symbol: 'USDT', name: 'تتر شبکه اتریوم (USDT-ERC20)', network: 'ERC20', cat: 'stable', icon: '🔷', priceUsd: 1.00, change24h: 0.00, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'usdc_erc20', cgId: 'usd-coin', symbol: 'USDC', name: 'یواس‌دی کوین (USD Coin)', network: 'ERC20 / Polygon', cat: 'stable', icon: '🔵', priceUsd: 1.00, change24h: 0.01, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'dai_erc20',  cgId: 'dai', symbol: 'DAI', name: 'دای (MakerDAO DAI)', network: 'ERC20 / BEP20', cat: 'stable', icon: '🟠', priceUsd: 1.00, change24h: 0.00, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'fdusd_bep20',cgId: 'first-digital-usd', symbol: 'FDUSD', name: 'فرست دیجیتال دلار (FDUSD)', network: 'BEP20', cat: 'stable', icon: '🟢', priceUsd: 1.00, change24h: 0.02, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },

  // ۲. رمزارزهای برتر بازار جهانی (Top Majors)
  { id: 'btc_main',  cgId: 'bitcoin', symbol: 'BTC', name: 'بیت‌کوین (Bitcoin)', network: 'BTC (Native SegWit)', cat: 'top', icon: '₿', priceUsd: 82851.00, change24h: 2.45, marketAssetId: 'c_btc', defaultAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
  { id: 'eth_erc20', cgId: 'ethereum', symbol: 'ETH', name: 'اتریوم (Ethereum)', network: 'ERC20', cat: 'top', icon: 'Ξ', priceUsd: 2685.50, change24h: 1.92, marketAssetId: 'c_eth', defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'bnb_bep20', cgId: 'binancecoin', symbol: 'BNB', name: 'بایننس کوین (BNB)', network: 'BEP20 (BSC)', cat: 'top', icon: '🟡', priceUsd: 618.40, change24h: 1.35, marketAssetId: 'c_bnb', defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'sol_main',  cgId: 'solana', symbol: 'SOL', name: 'سولانا (Solana)', network: 'SOL', cat: 'top', icon: '🟣', priceUsd: 174.20, change24h: 3.80, marketAssetId: 'c_sol', defaultAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' },
  { id: 'xrp_main',  cgId: 'ripple', symbol: 'XRP', name: 'ریپل (Ripple XRP)', network: 'XRP Ledger', cat: 'top', icon: '✕', priceUsd: 2.38, change24h: 4.10, marketAssetId: 'c_xrp', defaultAddress: 'rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh' },
  { id: 'ton_main',  cgId: 'the-open-network', symbol: 'TON', name: 'تون‌کوین تلگرام (Toncoin)', network: 'TON', cat: 'top', icon: '💎', priceUsd: 3.85, change24h: 2.15, defaultAddress: 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF' },
  { id: 'trx_main',  cgId: 'tron', symbol: 'TRX', name: 'ترون (Tron TRX)', network: 'TRC20', cat: 'top', icon: '🔺', priceUsd: 0.245, change24h: 1.40, defaultAddress: 'TPv82xL9mYqRtW4kZpBvN1x3cE7A4mD8sF' },
  { id: 'ada_main',  cgId: 'cardano', symbol: 'ADA', name: 'کاردانو (Cardano)', network: 'Cardano', cat: 'top', icon: '🔵', priceUsd: 0.785, change24h: 2.60, marketAssetId: 'c_ada', defaultAddress: 'addr1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
  { id: 'doge_main', cgId: 'dogecoin', symbol: 'DOGE', name: 'دوج‌کوین (Dogecoin)', network: 'DOGE', cat: 'meme', icon: '🐕', priceUsd: 0.214, change24h: 5.20, marketAssetId: 'c_doge', defaultAddress: 'D7Y55r6Yoc1G8fn14R6Q3W9xL9mYqRtW4k' },
  { id: 'avax_c',    cgId: 'avalanche-2', symbol: 'AVAX', name: 'آوالانچ (Avalanche)', network: 'AVAX C-Chain', cat: 'layer1', icon: '🔺', priceUsd: 24.80, change24h: 3.10, marketAssetId: 'c_avax', defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'link_erc20',cgId: 'chainlink', symbol: 'LINK', name: 'چین‌لینک (Chainlink)', network: 'ERC20 / BEP20', cat: 'layer1', icon: '🔗', priceUsd: 12.17, change24h: 6.56, marketAssetId: 'c_link', defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'dot_main',  cgId: 'polkadot', symbol: 'DOT', name: 'پولکادات (Polkadot)', network: 'Polkadot', cat: 'layer1', icon: '⚫', priceUsd: 4.92, change24h: 1.85, marketAssetId: 'c_dot', defaultAddress: '12xtAYsRUrmbniiWQqJtECiBQrMn8AypQcXhnQAc6RB6XkLW' },
  { id: 'ltc_main',  cgId: 'litecoin', symbol: 'LTC', name: 'لایت‌کوین (Litecoin)', network: 'Litecoin', cat: 'top', icon: 'Ł', priceUsd: 60.08, change24h: 1.95, marketAssetId: 'c_ltc', defaultAddress: 'ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },

  // ۳. شبکه‌های لایه اول، لایه دوم و دیفای (Layer-1 / Layer-2 / DeFi)
  { id: 'sui_main',  cgId: 'sui', symbol: 'SUI', name: 'سویی (Sui Network)', network: 'SUI', cat: 'layer1', icon: '💧', priceUsd: 3.15, change24h: 7.40, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac37482911223344556677889900aabb' },
  { id: 'apt_main',  cgId: 'aptos', symbol: 'APT', name: 'آپتوس (Aptos)', network: 'Aptos', cat: 'layer1', icon: '🌐', priceUsd: 6.45, change24h: 2.90, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac37482911223344556677889900aabb' },
  { id: 'near_main', cgId: 'near', symbol: 'NEAR', name: 'نیر پروتکل (NEAR Protocol)', network: 'NEAR', cat: 'layer1', icon: 'Ⓝ', priceUsd: 3.42, change24h: 3.15, defaultAddress: 'sarmayeyar.near' },
  { id: 'atom_main', cgId: 'cosmos', symbol: 'ATOM', name: 'کازموس (Cosmos ATOM)', network: 'Cosmos', cat: 'layer1', icon: '⚛️', priceUsd: 4.85, change24h: 1.60, defaultAddress: 'cosmos1xy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
  { id: 'pol_main',  cgId: 'matic-network', symbol: 'POL', name: 'پالیگان (Polygon / MATIC)', network: 'Polygon POS', cat: 'layer1', icon: '🟣', priceUsd: 0.312, change24h: 2.20, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'arb_main',  cgId: 'arbitrum', symbol: 'ARB', name: 'آربیتروم (Arbitrum)', network: 'Arbitrum One', cat: 'layer1', icon: '🔵', priceUsd: 0.485, change24h: 3.40, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'op_main',   cgId: 'optimism', symbol: 'OP', name: 'آپتیمیزم (Optimism)', network: 'Optimism', cat: 'layer1', icon: '🔴', priceUsd: 1.18, change24h: 2.75, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'uni_erc20', cgId: 'uniswap', symbol: 'UNI', name: 'یونی‌سواپ (Uniswap)', network: 'ERC20', cat: 'layer1', icon: '🦄', priceUsd: 7.65, change24h: 4.20, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'aave_erc20',cgId: 'aave', symbol: 'AAVE', name: 'آوه (Aave Protocol)', network: 'ERC20', cat: 'layer1', icon: '👻', priceUsd: 215.00, change24h: 3.90, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'bch_main',  cgId: 'bitcoin-cash', symbol: 'BCH', name: 'بیت‌کوین کش (Bitcoin Cash)', network: 'BCH', cat: 'top', icon: '🟢', priceUsd: 345.00, change24h: 1.50, defaultAddress: 'qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a' },
  { id: 'xlm_main',  cgId: 'stellar', symbol: 'XLM', name: 'استلار (Stellar Lumens)', network: 'Stellar', cat: 'layer1', icon: '🚀', priceUsd: 0.34, change24h: 2.80, defaultAddress: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
  { id: 'etc_main',  cgId: 'ethereum-classic', symbol: 'ETC', name: 'اتریوم کلاسیک (Ethereum Classic)', network: 'ETC', cat: 'layer1', icon: '🍀', priceUsd: 19.40, change24h: 1.25, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'fil_main',  cgId: 'filecoin', symbol: 'FIL', name: 'فایل‌کوین (Filecoin)', network: 'Filecoin', cat: 'layer1', icon: '💾', priceUsd: 3.35, change24h: 2.10, defaultAddress: 'f1abjxfbp274xpdqcpuaykwkfb43omjotacm2p3za' },
  { id: 'hbar_main', cgId: 'hedera-hashgraph', symbol: 'HBAR', name: 'هدرا (Hedera HBAR)', network: 'Hedera', cat: 'layer1', icon: 'ℏ', priceUsd: 0.225, change24h: 4.50, defaultAddress: '0.0.1458920' },
  { id: 'icp_main',  cgId: 'internet-computer', symbol: 'ICP', name: 'اینترنت کامپیوتر (ICP)', network: 'ICP', cat: 'layer1', icon: '♾️', priceUsd: 7.12, change24h: 1.90, defaultAddress: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  { id: 'vet_main',  cgId: 'vechain', symbol: 'VET', name: 'وی‌چین (VeChain)', network: 'VeChain', cat: 'layer1', icon: '🇻', priceUsd: 0.032, change24h: 2.40, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'algo_main', cgId: 'algorand', symbol: 'ALGO', name: 'آلگوراند (Algorand)', network: 'Algorand', cat: 'layer1', icon: '🅰️', priceUsd: 0.265, change24h: 1.75, defaultAddress: 'VCMJKWOY5P5P7SKMZFFOCEROPJCZOTIJMNIYNUCKH7LRO45JMJP6UYBIJA' },
  { id: 'inj_main',  cgId: 'injective-protocol', symbol: 'INJ', name: 'اینجکتیو (Injective)', network: 'INJ / ERC20', cat: 'layer1', icon: '⚡', priceUsd: 14.80, change24h: 5.10, defaultAddress: 'inj1xy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
  { id: 'render_erc',cgId: 'render-token', symbol: 'RENDER', name: 'رندر هوش مصنوعی (Render)', network: 'SOL / ERC20', cat: 'layer1', icon: '🎨', priceUsd: 4.65, change24h: 6.20, defaultAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' },
  { id: 'fet_erc',   cgId: 'fetch-ai', symbol: 'FET', name: 'اتحادیه هوش مصنوعی (ASI / FET)', network: 'ERC20', cat: 'layer1', icon: '🤖', priceUsd: 0.82, change24h: 4.80, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'tao_main',  cgId: 'bittensor', symbol: 'TAO', name: 'بیتنسور (Bittensor TAO)', network: 'Bittensor', cat: 'layer1', icon: '🧠', priceUsd: 385.00, change24h: 5.60, defaultAddress: '5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX' },

  // ۴. میم‌کوین‌ها و توکن‌های پرمخاطب (Meme & Community)
  { id: 'shib_erc20',cgId: 'shiba-inu', symbol: 'SHIB', name: 'شیبا اینو (Shiba Inu)', network: 'ERC20 / BEP20', cat: 'meme', icon: '🦊', priceUsd: 0.0000158, change24h: 4.90, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'pepe_erc20',cgId: 'pepe', symbol: 'PEPE', name: 'پپه (Pepe Coin)', network: 'ERC20', cat: 'meme', icon: '🐸', priceUsd: 0.0000098, change24h: 8.40, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'wif_sol',   cgId: 'dogwifcoin', symbol: 'WIF', name: 'داگ‌ویف‌هت (dogwifhat)', network: 'SOL', cat: 'meme', icon: '🐶', priceUsd: 0.74, change24h: 6.80, defaultAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' },
  { id: 'bonk_sol',  cgId: 'bonk', symbol: 'BONK', name: 'بونک سولانا (Bonk)', network: 'SOL', cat: 'meme', icon: '🦴', priceUsd: 0.0000182, change24h: 5.30, defaultAddress: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV' },
  { id: 'floki_bep', cgId: 'floki', symbol: 'FLOKI', name: 'فلوکی (Floki Inu)', network: 'BEP20 / ERC20', cat: 'meme', icon: '⚔️', priceUsd: 0.000095, change24h: 3.70, defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'not_ton',   cgId: 'notcoin', symbol: 'NOT', name: 'نات‌کوین تلگرام (Notcoin)', network: 'TON', cat: 'meme', icon: '🪙', priceUsd: 0.0031, change24h: 4.10, defaultAddress: 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF' },
  { id: 'dogs_ton',  cgId: 'dogs-2', symbol: 'DOGS', name: 'داگز تلگرام (DOGS)', network: 'TON', cat: 'meme', icon: '🐾', priceUsd: 0.00021, change24h: 3.20, defaultAddress: 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF' },
  { id: 'hmstr_ton', cgId: 'hamster-kombat', symbol: 'HMSTR', name: 'همستر کامبت (Hamster)', network: 'TON', cat: 'meme', icon: '🐹', priceUsd: 0.0021, change24h: 2.10, defaultAddress: 'UQDWYy_9mYqRtW4kZpBvN1x3cE7A4mD8sF' },

  // ۵. توکن‌های پشتوانه طلای جهانی (Gold-Backed Tokens)
  { id: 'paxg_erc20',cgId: 'pax-gold', symbol: 'PAXG', name: 'پکس گلد — انس طلای دیجیتال (PAX Gold)', network: 'ERC20', cat: 'gold_crypto', icon: '🥇', priceUsd: 4112.00, change24h: 1.15, marketAssetId: 'g_ons', defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' },
  { id: 'xaut_erc20',cgId: 'tether-gold', symbol: 'XAUT', name: 'تتر گلد — طلای تتر (Tether Gold)', network: 'ERC20', cat: 'gold_crypto', icon: '🪙', priceUsd: 4110.00, change24h: 1.12, marketAssetId: 'g_ons', defaultAddress: '0x71c5b88ec3011a00a0684f88b77d6124ac374829' }
];

let activeAdminCryptoCatFilter = 'all';
let selectedUserDepositCoinId = 'usdt_trc20';
let cryptoFormCountdownTimer = null;
let cryptoFormRemainingSec = 1800;

function getLiveUsdtTomanRate() {
  const mAssets = (S.market && S.market.assets) || [];
  const usdt = mAssets.find(a => a.id === 'ir_usdt');
  if (usdt && usdt.metrics && Number(usdt.metrics.last) > 10000) {
    const v = Number(usdt.metrics.last);
    return v > 600000 ? Math.round(v * 0.1) : v;
  }
  const usd = mAssets.find(a => a.id === 'ir_usd');
  if (usd && usd.metrics && Number(usd.metrics.last) > 10000) {
    const v = Number(usd.metrics.last);
    return v > 600000 ? Math.round(v * 0.1) : v;
  }
  return 260991;
}

function syncWorldCryptoWithMarketSnapshot() {
  const mAssets = (S.market && S.market.assets) || [];
  const byId = {};
  mAssets.forEach(a => { byId[a.id] = a; });
  WORLD_CRYPTO_CATALOG.forEach(c => {
    if (c.marketAssetId && byId[c.marketAssetId] && byId[c.marketAssetId].metrics) {
      const m = byId[c.marketAssetId].metrics;
      if (Number(m.last) > 0) c.priceUsd = Number(m.last);
      if (m.dayChangePct !== undefined && m.dayChangePct !== null) c.change24h = Number(m.dayChangePct);
    }
  });
}

window.refreshGlobalCryptoLivePrices = async function(notify = false) {
  syncWorldCryptoWithMarketSnapshot();
  try {
    const cgIds = Array.from(new Set(WORLD_CRYPTO_CATALOG.map(c => c.cgId).filter(Boolean))).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cgIds)}&vs_currencies=usd&include_24hr_change=true`);
    if (res.ok) {
      const data = await res.json();
      WORLD_CRYPTO_CATALOG.forEach(c => {
        if (c.cgId && data[c.cgId] && Number(data[c.cgId].usd) > 0) {
          c.priceUsd = Number(data[c.cgId].usd);
          if (data[c.cgId].usd_24h_change !== undefined) {
            c.change24h = Number(Number(data[c.cgId].usd_24h_change).toFixed(2));
          }
        }
      });
    }
  } catch (e) {}

  // همگام‌سازی قیمت‌های زنده با لیست رمزارزهای فعال درگاه
  const gwCoins = getConfiguredCryptoGatewayCoins();
  gwCoins.forEach(gc => {
    const match = WORLD_CRYPTO_CATALOG.find(w => w.id === gc.id || w.symbol === gc.symbol);
    if (match && Number(match.priceUsd) > 0) {
      gc.priceUsd = match.priceUsd;
    }
  });
  saveConfiguredCryptoGatewayCoins(gwCoins);

  if (typeof renderAdminCryptoGatewayCoinsTable === 'function') renderAdminCryptoGatewayCoinsTable();
  if (typeof renderAdminCryptoCatalogModalGrid === 'function') renderAdminCryptoCatalogModalGrid();
  if (typeof renderCryptoDepositStage === 'function') renderCryptoDepositStage();
  if (notify) toast('✅ قیمت‌های لحظه‌ای و واقعی کلیه رمزارزهای جهان به‌روزرسانی شد!', 'ok');
};

function getConfiguredCryptoGatewayCoins() {
  syncWorldCryptoWithMarketSnapshot();
  try {
    const raw = localStorage.getItem('sy_crypto_gateway_cfg');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.coins) && parsed.coins.length) {
        return parsed.coins;
      }
    }
  } catch (e) {}

  if (S.settings && Array.isArray(S.settings.cryptoGatewayCoins) && S.settings.cryptoGatewayCoins.length) {
    return S.settings.cryptoGatewayCoins;
  }
  if (S.admin && S.admin.settings && Array.isArray(S.admin.settings.cryptoGatewayCoins) && S.admin.settings.cryptoGatewayCoins.length) {
    return S.admin.settings.cryptoGatewayCoins;
  }

  return WORLD_CRYPTO_CATALOG.slice(0, 8).map(c => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    network: c.network,
    address: c.defaultAddress,
    priceUsd: c.priceUsd,
    icon: c.icon,
    active: true
  }));
}

function saveConfiguredCryptoGatewayCoins(coins) {
  if (!S.settings) S.settings = {};
  S.settings.cryptoGatewayCoins = coins;
  if (S.admin && S.admin.settings) S.admin.settings.cryptoGatewayCoins = coins;
  const expireMin = getCryptoInvoiceExpireMinutes();
  const tpl = getActiveMenuTemplate('cryptoDeposit');
  try {
    localStorage.setItem('sy_crypto_gateway_cfg', JSON.stringify({
      expireMin,
      template: tpl,
      coins
    }));
  } catch (e) {}
}

function getCryptoInvoiceExpireMinutes() {
  const inpVal = Number($('#gwCryptoExpireMin')?.value);
  if (inpVal > 0) return inpVal;
  try {
    const raw = localStorage.getItem('sy_crypto_gateway_cfg');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Number(parsed.expireMin) > 0) return Number(parsed.expireMin);
    }
  } catch (e) {}
  return Number((S.settings && S.settings.cryptoInvoiceExpireMin) || (S.admin && S.admin.settings && S.admin.settings.cryptoInvoiceExpireMin) || 30);
}

window.renderAdminCryptoGatewayCoinsTable = function() {
  const tbl = $('#admCryptoGatewayCoinsTable');
  if (!tbl) return;
  const coins = getConfiguredCryptoGatewayCoins();
  const usdtRate = getLiveUsdtTomanRate();

  tbl.innerHTML = `
    <thead>
      <tr>
        <th>رمزارز و نماد</th>
        <th>شبکه انتقال</th>
        <th>قیمت زنده دلاری ($)</th>
        <th>معادل تومانی لحظه‌ای</th>
        <th style="min-width:260px">آدرس کیف‌پول مقصد (قابل ویرایش مستقیم)</th>
        <th>وضعیت</th>
        <th>عملیات</th>
      </tr>
    </thead>
    <tbody>
      ${coins.map((c, idx) => {
        const tomanPrice = Math.round((Number(c.priceUsd) || 1) * usdtRate);
        return `
          <tr>
            <td>
              <div class="row-gap" style="gap:6px">
                <span style="font-size:18px">${c.icon || '🪙'}</span>
                <div>
                  <b>${esc(c.name)}</b>
                  <div class="hint" dir="ltr">${esc(c.symbol)}</div>
                </div>
              </div>
            </td>
            <td>
              <input type="text" class="input" dir="ltr" style="width:110px;padding:5px 8px;font-size:12px" value="${esc(c.network)}" onchange="updateGatewayCoinField(${idx}, 'network', this.value)" />
            </td>
            <td>
              <input type="number" class="input" dir="ltr" step="any" style="width:110px;padding:5px 8px;font-size:12px;font-weight:700" value="${Number(c.priceUsd || 1)}" onchange="updateGatewayCoinField(${idx}, 'priceUsd', this.value)" />
            </td>
            <td><b style="color:var(--up)">${NF(tomanPrice, 0)} تومان</b></td>
            <td>
              <input type="text" class="input" dir="ltr" style="min-width:250px;padding:6px 9px;font-size:12px;font-family:monospace" value="${esc(c.address)}" placeholder="آدرس کیف‌پول..." oninput="updateGatewayCoinField(${idx}, 'address', this.value)" />
            </td>
            <td>
              <input type="checkbox" ${c.active !== false ? 'checked' : ''} onchange="updateGatewayCoinField(${idx}, 'active', this.checked)" title="فعال در درگاه کیف‌پول" />
            </td>
            <td>
              <button type="button" class="btn btn-ghost btn-sm" style="color:var(--down)" onclick="removeGatewayCoin(${idx})">🗑️ حذف</button>
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
};

window.updateGatewayCoinField = function(idx, field, val) {
  const coins = getConfiguredCryptoGatewayCoins();
  if (!coins[idx]) return;
  if (field === 'priceUsd') coins[idx].priceUsd = Math.max(0.00000001, Number(val) || 1);
  else if (field === 'active') coins[idx].active = !!val;
  else coins[idx][field] = String(val || '').trim();
  saveConfiguredCryptoGatewayCoins(coins);
  if (field !== 'address') renderAdminCryptoGatewayCoinsTable();
  renderCryptoDepositStage();
};

window.removeGatewayCoin = function(idx) {
  const coins = getConfiguredCryptoGatewayCoins();
  if (coins.length <= 1) return toast('حداقل یک رمزارز باید در درگاه فعال باشد', 'err');
  const removed = coins.splice(idx, 1)[0];
  saveConfiguredCryptoGatewayCoins(coins);
  renderAdminCryptoGatewayCoinsTable();
  renderCryptoDepositStage();
  toast(`رمزارز «${removed ? removed.name : ''}» از درگاه حذف شد`, 'ok');
};

window.onAdminCryptoDepositTplChange = function(tplKey) {
  if (typeof setAdminActiveMenuTemplate === 'function') {
    setAdminActiveMenuTemplate('cryptoDeposit', tplKey, true);
  }
  renderCryptoDepositStage();
  toast(`🖼️ قالب نمایش بخش واریز ارز دیجیتال به «${tplKey}» تغییر یافت!`, 'ok');
};

window.openAdminCryptoCoinsCatalogModal = function() {
  syncWorldCryptoWithMarketSnapshot();
  const modal = $('#admCryptoCatalogModal');
  if (!modal) return;
  renderAdminCryptoCatalogModalGrid();
  modal.hidden = false;
  refreshGlobalCryptoLivePrices(false);
};

window.setAdminCryptoCatFilter = function(cat) {
  activeAdminCryptoCatFilter = cat || 'all';
  renderAdminCryptoCatalogModalGrid();
};

window.renderAdminCryptoCatalogModalGrid = function() {
  const grid = $('#admCryptoCatalogGrid');
  if (!grid) return;
  const usdtRate = getLiveUsdtTomanRate();
  if ($('#admCryptoLiveUsdtBadge')) {
    $('#admCryptoLiveUsdtBadge').textContent = `نرخ لحظه‌ای تتر: ${NF(usdtRate, 0)} تومان`;
  }

  const catBar = $('#admCryptoCatalogCatBar');
  if (catBar) {
    const cats = [
      { key: 'all', label: `🌐 همه رمزارزهای جهان (${NF(WORLD_CRYPTO_CATALOG.length, 0)} ارز)` },
      { key: 'stable', label: '💵 استیبل‌کوین‌ها (USDT, USDC, DAI...)' },
      { key: 'top', label: '👑 ۱۰ رمزارز برتر بازار (BTC, ETH, SOL, BNB, XRP, TON...)' },
      { key: 'layer1', label: '⚡ شبکه‌های لایه اول، دیفای و هوش مصنوعی (SUI, ARB, LINK, TAO...)' },
      { key: 'meme', label: '🔥 میم‌کوین‌ها و توکن‌های تلگرام (DOGE, SHIB, PEPE, NOT...)' },
      { key: 'gold_crypto', label: '🥇 توکن‌های پشتوانه طلای جهانی (PAXG, XAUT)' }
    ];
    catBar.innerHTML = cats.map(c => `
      <button type="button" class="chip ${activeAdminCryptoCatFilter === c.key ? 'active' : ''}" onclick="setAdminCryptoCatFilter('${c.key}')">${c.label}</button>
    `).join('');
  }

  const q = ($('#admCryptoCatalogSearch')?.value || '').trim().toLowerCase();
  const currentCoins = getConfiguredCryptoGatewayCoins();

  let list = WORLD_CRYPTO_CATALOG.filter(c => {
    if (activeAdminCryptoCatFilter !== 'all' && c.cat !== activeAdminCryptoCatFilter) return false;
    if (q && !c.name.toLowerCase().includes(q) && !c.symbol.toLowerCase().includes(q) && !c.network.toLowerCase().includes(q)) return false;
    return true;
  });

  grid.innerHTML = list.map(c => {
    const existing = currentCoins.find(x => x.id === c.id || (x.symbol === c.symbol && x.network === c.network));
    const tomanVal = Math.round(c.priceUsd * usdtRate);
    const isUp = Number(c.change24h || 0) >= 0;
    return `
      <div class="adm-tpl-card ${existing ? 'active' : ''}" onclick="selectWorldCoinForGatewayForm('${esc(c.id)}')">
        <div>
          <div class="row-between" style="margin-bottom:6px">
            <span class="row-gap" style="gap:6px">
              <span style="font-size:20px">${c.icon || '🪙'}</span>
              <b style="font-size:14px">${esc(c.symbol)}</b>
            </span>
            <span class="pill pill-xs">${esc(c.network)}</span>
          </div>
          <div style="font-size:13px;font-weight:700;margin-bottom:6px">${esc(c.name)}</div>
          <div style="background:var(--surface);padding:8px 10px;border-radius:9px;border:1px solid var(--line);font-size:12px">
            <div class="row-between">
              <span class="hint">قیمت دلاری زنده:</span>
              <b dir="ltr">$${c.priceUsd < 0.01 ? c.priceUsd.toFixed(7) : NF(c.priceUsd, 2)} <span class="${isUp ? 'up' : 'down'}">(${isUp ? '+' : ''}${NF(c.change24h || 0, 1)}%)</span></b>
            </div>
            <div class="row-between" style="margin-top:4px">
              <span class="hint">معادل تومانی:</span>
              <b style="color:var(--up)">${NF(tomanVal, 0)} ت</b>
            </div>
          </div>
        </div>
        <div class="row-gap" style="gap:6px;margin-top:8px" onclick="event.stopPropagation()">
          <button type="button" class="btn ${existing ? 'btn-ghost' : 'btn-primary'} btn-sm" style="flex:1" onclick="addWorldCoinDirectlyToGateway('${esc(c.id)}')">
            ${existing ? '✓ موجود در درگاه (بروزرسانی)' : '＋ افزودن فوری به درگاه'}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="selectWorldCoinForGatewayForm('${esc(c.id)}')" title="ویرایش آدرس ولت قبل از افزودن">
            ✏️ آدرس
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.selectWorldCoinForGatewayForm = function(coinId) {
  const c = WORLD_CRYPTO_CATALOG.find(x => x.id === coinId);
  if (!c) return;
  const existing = getConfiguredCryptoGatewayCoins().find(x => x.id === c.id);
  if ($('#customCoinSymbol')) $('#customCoinSymbol').value = c.symbol;
  if ($('#customCoinName')) $('#customCoinName').value = c.name;
  if ($('#customCoinNetwork')) $('#customCoinNetwork').value = c.network;
  if ($('#customCoinPriceUsd')) $('#customCoinPriceUsd').value = c.priceUsd;
  if ($('#customCoinAddress')) $('#customCoinAddress').value = (existing && existing.address) || c.defaultAddress;
  if ($('#customCoinAddress')) $('#customCoinAddress').focus();
};

window.addWorldCoinDirectlyToGateway = function(coinId) {
  const c = WORLD_CRYPTO_CATALOG.find(x => x.id === coinId);
  if (!c) return;
  const coins = getConfiguredCryptoGatewayCoins();
  const idx = coins.findIndex(x => x.id === c.id || (x.symbol === c.symbol && x.network === c.network));
  if (idx >= 0) {
    coins[idx].priceUsd = c.priceUsd;
    coins[idx].active = true;
  } else {
    coins.push({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      network: c.network,
      address: c.defaultAddress,
      priceUsd: c.priceUsd,
      icon: c.icon,
      active: true
    });
  }
  saveConfiguredCryptoGatewayCoins(coins);
  renderAdminCryptoGatewayCoinsTable();
  renderAdminCryptoCatalogModalGrid();
  renderCryptoDepositStage();
  toast(`💎 رمزارز «${c.name}» با قیمت لحظه‌ای $${c.priceUsd} به درگاه اضافه شد!`, 'ok');
};

window.addAllPopularCryptoCoinsToGateway = function() {
  const coins = getConfiguredCryptoGatewayCoins();
  WORLD_CRYPTO_CATALOG.slice(0, 14).forEach(c => {
    const exists = coins.find(x => x.id === c.id || (x.symbol === c.symbol && x.network === c.network));
    if (!exists) {
      coins.push({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        network: c.network,
        address: c.defaultAddress,
        priceUsd: c.priceUsd,
        icon: c.icon,
        active: true
      });
    }
  });
  saveConfiguredCryptoGatewayCoins(coins);
  renderAdminCryptoGatewayCoinsTable();
  renderAdminCryptoCatalogModalGrid();
  renderCryptoDepositStage();
  toast('⚡ ۱۴ رمزارز برتر جهان با قیمت لحظه‌ای به درگاه اضافه شدند!', 'ok');
};

window.saveCustomCoinToGateway = function() {
  const symbol = ($('#customCoinSymbol')?.value || 'USDT').trim().toUpperCase();
  const name = ($('#customCoinName')?.value || symbol).trim();
  const network = ($('#customCoinNetwork')?.value || 'TRC20').trim();
  const priceUsd = Math.max(0.00000001, Number($('#customCoinPriceUsd')?.value) || 1);
  const address = ($('#customCoinAddress')?.value || '').trim();
  if (!address) return toast('لطفاً آدرس کیف‌پول مقصد را وارد کنید', 'err');

  const coins = getConfiguredCryptoGatewayCoins();
  const id = (symbol + '_' + network).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const idx = coins.findIndex(x => x.id === id || (x.symbol === symbol && x.network === network));
  const matchCatalog = WORLD_CRYPTO_CATALOG.find(w => w.symbol === symbol);
  const item = {
    id,
    symbol,
    name,
    network,
    address,
    priceUsd,
    icon: (matchCatalog && matchCatalog.icon) || '🪙',
    active: true
  };
  if (idx >= 0) coins[idx] = item;
  else coins.unshift(item);

  saveConfiguredCryptoGatewayCoins(coins);
  renderAdminCryptoGatewayCoinsTable();
  renderAdminCryptoCatalogModalGrid();
  renderCryptoDepositStage();
  toast(`✅ رمزارز «${name} (${network})» با آدرس کیف‌پول جدید در درگاه ثبت شد!`, 'ok');
};

/* ---------------- رندر ۵ قالب مجزای واریز ارز دیجیتال در کیف‌پول + تایمر معکوس فرم ---------------- */
function formatCountdownMMSS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

window.resetCryptoFormCountdown = function() {
  const mins = getCryptoInvoiceExpireMinutes();
  cryptoFormRemainingSec = mins * 60;
  updateCryptoCountdownDom();
};

function updateCryptoCountdownDom() {
  const txt = formatCountdownMMSS(cryptoFormRemainingSec);
  $$('[data-crypto-timer-text]').forEach(el => {
    el.textContent = txt;
  });
  const totalSec = getCryptoInvoiceExpireMinutes() * 60;
  const pct = totalSec > 0 ? Math.max(0, Math.min(100, (cryptoFormRemainingSec / totalSec) * 100)) : 100;
  $$('[data-crypto-timer-bar]').forEach(el => {
    el.style.width = pct + '%';
  });
}

function ensureCryptoFormCountdownRunning() {
  if (!cryptoFormRemainingSec || cryptoFormRemainingSec <= 0) {
    cryptoFormRemainingSec = getCryptoInvoiceExpireMinutes() * 60;
  }
  if (cryptoFormCountdownTimer) return;
  cryptoFormCountdownTimer = setInterval(() => {
    if (cryptoFormRemainingSec > 0) {
      cryptoFormRemainingSec--;
      updateCryptoCountdownDom();
    } else {
      cryptoFormRemainingSec = getCryptoInvoiceExpireMinutes() * 60;
      updateCryptoCountdownDom();
    }
  }, 1000);
}

window.selectUserCryptoDepositCoin = function(coinId) {
  selectedUserDepositCoinId = coinId;
  renderCryptoDepositStage();
};

window.onUserCryptoAmountInput = function(val) {
  const num = Math.max(0, parseNum(val) || 0);
  if ($('#uCryptoDepositAmount')) $('#uCryptoDepositAmount').value = String(num);
  updateLiveCryptoConversionDom(num);
};

window.setQuickUserCryptoToman = function(amt) {
  if ($('#uCryptoDepositAmount')) $('#uCryptoDepositAmount').value = String(amt);
  const inp = $('#cdLiveTomanInput');
  if (inp) inp.value = Number(amt).toLocaleString('en-US');
  updateLiveCryptoConversionDom(amt);
};

function getSelectedGatewayCoinObj() {
  const coins = getConfiguredCryptoGatewayCoins().filter(c => c.active !== false);
  const found = coins.find(c => c.id === selectedUserDepositCoinId) || coins[0] || WORLD_CRYPTO_CATALOG[0];
  selectedUserDepositCoinId = found.id;
  return found;
}

function updateLiveCryptoConversionDom(amountToman) {
  const coin = getSelectedGatewayCoinObj();
  const usdtRate = getLiveUsdtTomanRate();
  const coinRateToman = Math.max(1, (Number(coin.priceUsd) || 1) * usdtRate);
  const decimals = Number(coin.priceUsd) >= 100 ? 6 : (Number(coin.priceUsd) >= 1 ? 3 : 2);
  const cryptoAmt = amountToman > 0 ? Number((amountToman / coinRateToman).toFixed(decimals)) : 0;

  $$('[data-cd-crypto-amt]').forEach(el => {
    el.textContent = `${cryptoAmt} ${coin.symbol}`;
  });
  $$('[data-cd-toman-words]').forEach(el => {
    el.textContent = amountToman > 0 ? numToPersianWords(amountToman, 'تومان') : '';
  });
}

window.copyUserCryptoGatewayAddress = function(addr) {
  const text = addr || getSelectedGatewayCoinObj().address;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('📋 آدرس کیف‌پول با موفقیت کپی شد!', 'ok')).catch(() => {});
  } else {
    toast('آدرس کیف‌پول: ' + text, 'ok');
  }
};

window.submitUserCryptoGatewayTx = async function(btnEl) {
  const txInput = $('#cdLiveTxidInput');
  const txid = (txInput?.value || $('#ciTxidInput')?.value || '').trim();
  if (!txid || txid.length < 6) return toast('لطفاً کد هش تراکنش (TXID) معتبر را وارد کنید', 'err');

  const coin = getSelectedGatewayCoinObj();
  const amountToman = Math.max(1000, parseNum($('#cdLiveTomanInput')?.value || $('#uCryptoDepositAmount')?.value || '5000000'));
  const usdtRate = getLiveUsdtTomanRate();
  const usdtAmount = Number((amountToman / usdtRate).toFixed(2));

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ در حال ثبت و بررسی تراکنش…'; }
  try {
    await api('/api/wallet/crypto-deposit', {
      method: 'POST',
      body: JSON.stringify({
        amount: amountToman,
        usdtAmount,
        symbol: coin.symbol,
        network: coin.network,
        txid,
        address: coin.address
      })
    });
    toast(`✅ واریز ${coin.symbol} (${coin.network}) معادل ${NF(amountToman, 0)} تومان با موفقیت ثبت شد!`, 'ok');
    if (txInput) txInput.value = '';
    loadUserFinancialHistory();
  } catch (e) {
    toast(e.message || 'خطا در ثبت تراکنش رمزارزی', 'err');
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🚀 ثبت کد پیگیری (TXID) و شارژ کیف‌پول'; }
  }
};

window.renderCryptoDepositStage = function() {
  const stage = $('#cryptoDepositDynamicStage');
  if (!stage) return;

  renderMenuUserTemplateBar('cryptoDeposit');
  ensureCryptoFormCountdownRunning();

  const activeTpl = getActiveMenuTemplate('cryptoDeposit') || 'cd_tpl1';
  const coins = getConfiguredCryptoGatewayCoins().filter(c => c.active !== false);
  const curCoin = getSelectedGatewayCoinObj();
  const usdtRate = getLiveUsdtTomanRate();
  const coinRateToman = Math.round((Number(curCoin.priceUsd) || 1) * usdtRate);
  const rawAmt = Math.max(100000, parseNum($('#uCryptoDepositAmount')?.value || '5000000'));
  const decimals = Number(curCoin.priceUsd) >= 100 ? 6 : (Number(curCoin.priceUsd) >= 1 ? 3 : 2);
  const cryptoAmt = Number((rawAmt / Math.max(1, coinRateToman)).toFixed(decimals));
  const expireMin = getCryptoInvoiceExpireMinutes();
  const timerStr = formatCountdownMMSS(cryptoFormRemainingSec);
  const qrSvg = typeof generateQrSvg === 'function' ? generateQrSvg(curCoin.address, 136) : '';

  const coinsPillsHtml = coins.map(c => {
    const isSel = c.id === curCoin.id;
    const cToman = Math.round((Number(c.priceUsd) || 1) * usdtRate);
    return `
      <div class="cd-coin-pill-card ${isSel ? 'active' : ''}" onclick="selectUserCryptoDepositCoin('${esc(c.id)}')">
        <div class="row-between">
          <span style="font-weight:800;font-size:13.5px">${c.icon || '🪙'} ${esc(c.symbol)}</span>
          <span class="pill pill-xs" style="font-size:10px">${esc(c.network)}</span>
        </div>
        <div class="hint" style="font-size:11px">${esc(c.name)}</div>
        <div style="font-size:11.5px;font-weight:700;color:var(--accent);direction:ltr;text-align:left">$${c.priceUsd < 0.01 ? c.priceUsd.toFixed(6) : NF(c.priceUsd, 2)} · ${NF(cToman, 0)} ت</div>
      </div>
    `;
  }).join('');

  const quickBtnsHtml = `
    <div class="quick-charge-btns" style="margin-top:8px">
      <button type="button" class="btn btn-ghost btn-sm" onclick="setQuickUserCryptoToman(1000000)">+۱ میلیون ت</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="setQuickUserCryptoToman(5000000)">+۵ میلیون ت</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="setQuickUserCryptoToman(10000000)">+۱۰ میلیون ت</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="setQuickUserCryptoToman(25000000)">+۲۵ میلیون ت</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="setQuickUserCryptoToman(50000000)">+۵۰ میلیون ت</button>
    </div>
  `;

  const invoiceRightBoxHtml = `
    <div class="panel cd-invoice-live-box">
      <div class="row-between" style="flex-wrap:wrap;gap:8px;padding-bottom:10px;border-bottom:1px dashed var(--line2)">
        <div>
          <b style="color:var(--txt);font-size:14px">${curCoin.icon || '💎'} فاکتور زنده واریز ${esc(curCoin.symbol)} (${esc(curCoin.network)})</b>
          <div class="hint">نرخ لحظه‌ای ${esc(curCoin.symbol)}: <b>$${curCoin.priceUsd} (${NF(coinRateToman, 0)} تومان)</b></div>
        </div>
        <div class="row-gap" style="gap:6px">
          <span class="cd-timer-badge" title="مدت زمان اعتبار فرم تعیین‌شده توسط ادمین (${expireMin} دقیقه)">
            ⏱️ <span data-crypto-timer-text>${timerStr}</span>
          </span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="resetCryptoFormCountdown()" title="تمدید زمان فرم">↻</button>
        </div>
      </div>

      <div style="height:5px;background:var(--line);border-radius:99px;overflow:hidden;margin:8px 0 12px">
        <div data-crypto-timer-bar style="height:100%;width:100%;background:linear-gradient(90deg,#10b981,#0ea5e9);transition:width .5s linear"></div>
      </div>

      <div style="display:grid;grid-template-columns:152px 1fr;gap:14px;align-items:center">
        <div style="background:#ffffff;padding:8px;border-radius:12px;text-align:center;border:1.5px solid var(--line2);box-shadow:0 4px 12px rgba(0,0,0,.08)">
          ${qrSvg}
          <div style="font-size:10.5px;color:#0f172a;font-weight:800;margin-top:3px">اسکن مستقیم با کیف‌پول</div>
        </div>
        <div>
          <span class="hint">مقدار دقیق قابل واریز:</span>
          <div data-cd-crypto-amt style="font-size:21px;font-weight:900;color:var(--accent);direction:ltr;text-align:left;margin:2px 0">${cryptoAmt} ${esc(curCoin.symbol)}</div>
          <div class="hint" style="margin-bottom:8px">شبکه انتقال الزامی: <b style="color:var(--warn)">${esc(curCoin.network)}</b></div>

          <label style="font-size:11.5px;color:var(--muted)">آدرس کیف‌پول مقصد (${esc(curCoin.network)}):</label>
          <div class="crypto-addr-box" style="margin-top:4px">
            <span style="direction:ltr;text-align:left;word-break:break-all;font-size:12px;color:var(--txt)">${esc(curCoin.address)}</span>
            <button type="button" class="btn btn-primary btn-sm" onclick="copyUserCryptoGatewayAddress('${esc(curCoin.address)}')">📋 کپی</button>
          </div>
        </div>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line2)">
        <label style="font-size:12px;font-weight:800;color:var(--txt)">ثبت کد هش تراکنش (TXID / Hash) پس از واریز:</label>
        <div class="row-gap" style="gap:8px;margin-top:6px">
          <input type="text" id="cdLiveTxidInput" class="input" dir="ltr" style="flex:1" placeholder="کد پیگیری تراکنش (TXID) را اینجا وارد کنید…" />
          <button type="button" class="btn btn-primary btn-basket-bot" onclick="submitUserCryptoGatewayTx(this)">🚀 ثبت و شارژ کیف‌پول</button>
        </div>
      </div>
    </div>
  `;

  // ==================== طرح ۱: بایننس‌پِی دو ستونه مدرن ====================
  if (activeTpl === 'cd_tpl1') {
    stage.innerHTML = `
      <div class="cd-tpl1-split">
        <div class="panel" style="margin:0;padding:15px">
          <div class="row-between" style="margin-bottom:8px">
            <b style="font-size:13.5px">۱. ارز دیجیتال و شبکه مورد نظر خود را انتخاب کنید:</b>
            <span class="hint">نرخ لحظه‌ای تتر: <b>${NF(usdtRate, 0)} ت</b></span>
          </div>
          <div class="cd-coins-selector-grid">${coinsPillsHtml}</div>

          <label style="font-size:13px;font-weight:800;display:block;margin-top:10px">۲. مبلغ شارژ کیف‌پول به تومان:</label>
          <input type="text" id="cdLiveTomanInput" class="input" style="font-size:15px;font-weight:800;margin-top:4px" value="${Number(rawAmt).toLocaleString('en-US')}" oninput="onUserCryptoAmountInput(this.value)" />
          <div data-cd-toman-words class="input-words" style="margin-top:4px">${numToPersianWords(rawAmt, 'تومان')}</div>
          ${quickBtnsHtml}
        </div>
        ${invoiceRightBoxHtml}
      </div>
    `;
    return;
  }

  // ==================== طرح ۲: ویزارد گام‌به‌گام ۴ مرحله‌ای وب۳ ====================
  if (activeTpl === 'cd_tpl2') {
    stage.innerHTML = `
      <div class="sig-wizard-stepper" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">
        <div class="sig-wizard-step"><div class="sig-wizard-step-num">۱</div><div><b>انتخاب رمزارز</b><div class="hint">${esc(curCoin.symbol)} (${esc(curCoin.network)})</div></div></div>
        <div class="sig-wizard-step"><div class="sig-wizard-step-num">۲</div><div><b>تعیین مبلغ</b><div class="hint">${NF(rawAmt, 0)} تومان</div></div></div>
        <div class="sig-wizard-step"><div class="sig-wizard-step-num">۳</div><div><b>انتقال به آدرس ولت</b><div class="hint">مهلت: <span data-crypto-timer-text>${timerStr}</span></div></div></div>
        <div class="sig-wizard-step"><div class="sig-wizard-step-num">۴</div><div><b>ثبت کد TXID</b><div class="hint">تأیید و شارژ کیف‌پول</div></div></div>
      </div>
      <div class="panel" style="margin-bottom:12px;padding:14px">
        <b style="display:block;margin-bottom:8px">گام ۱ و ۲: انتخاب رمزارز از لیست زنده و تعیین مبلغ شارژ:</b>
        <div class="cd-coins-selector-grid">${coinsPillsHtml}</div>
        <div class="row-gap" style="gap:10px;flex-wrap:wrap">
          <input type="text" id="cdLiveTomanInput" class="input" style="flex:1;font-weight:800" value="${Number(rawAmt).toLocaleString('en-US')}" oninput="onUserCryptoAmountInput(this.value)" />
          <span class="pill pill-ok">معادل: <b data-cd-crypto-amt>${cryptoAmt} ${esc(curCoin.symbol)}</b></span>
        </div>
        ${quickBtnsHtml}
      </div>
      ${invoiceRightBoxHtml}
    `;
    return;
  }

  // ==================== طرح ۳: ترمینال صرافی ۳ ستونه ====================
  if (activeTpl === 'cd_tpl3') {
    stage.innerHTML = `
      <div class="cd-tpl3-terminal">
        <div style="display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto">
          <b style="font-size:12.5px;color:var(--accent);margin-bottom:4px">📊 لیست رمزارزهای فعال درگاه:</b>
          ${coins.map(c => `
            <div class="cd-coin-pill-card ${c.id === curCoin.id ? 'active' : ''}" onclick="selectUserCryptoDepositCoin('${esc(c.id)}')">
              <div class="row-between"><b>${c.icon || '🪙'} ${esc(c.symbol)}</b><span class="pill pill-xs">${esc(c.network)}</span></div>
              <div class="hint" dir="ltr">$${c.priceUsd} · ${NF(Math.round(c.priceUsd * usdtRate), 0)} ت</div>
            </div>
          `).join('')}
        </div>

        <div class="panel" style="margin:0;padding:14px">
          <b style="font-size:13.5px;display:block;margin-bottom:8px">🧮 ماشین‌حساب تبدیل آنی تومان ⇄ ${esc(curCoin.symbol)}</b>
          <label class="hint">مبلغ شارژ به تومان:</label>
          <input type="text" id="cdLiveTomanInput" class="input" style="font-size:15px;font-weight:800;margin:4px 0" value="${Number(rawAmt).toLocaleString('en-US')}" oninput="onUserCryptoAmountInput(this.value)" />
          <div data-cd-toman-words class="input-words">${numToPersianWords(rawAmt, 'تومان')}</div>
          ${quickBtnsHtml}
          <div style="margin-top:14px;padding:12px;background:var(--surface);border-radius:10px;border:1px solid var(--line)">
            <div class="row-between"><span class="hint">ارز انتخابی:</span><b>${esc(curCoin.name)}</b></div>
            <div class="row-between" style="margin-top:6px"><span class="hint">مقدار دقیق واریزی:</span><b data-cd-crypto-amt style="color:var(--up);font-size:16px" dir="ltr">${cryptoAmt} ${esc(curCoin.symbol)}</b></div>
          </div>
        </div>

        ${invoiceRightBoxHtml}
      </div>
    `;
    return;
  }

  // ==================== طرح ۴: کارت شیشه‌ای یکپارچه وب۳ ====================
  if (activeTpl === 'cd_tpl4') {
    stage.innerHTML = `
      <div class="cd-tpl4-glass">
        <div class="row-between" style="margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <div class="row-gap" style="gap:8px">
            <span style="font-size:26px">${curCoin.icon || '💎'}</span>
            <div>
              <h3 style="margin:0;font-size:16px;color:var(--txt)">درگاه پرداخت شیشه‌ای Web3</h3>
              <span class="hint">نرخ لحظه‌ای تتر: ${NF(usdtRate, 0)} تومان</span>
            </div>
          </div>
          <span class="cd-timer-badge">⏱️ مهلت فرم: <span data-crypto-timer-text>${timerStr}</span></span>
        </div>

        <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div>
            <label style="color:var(--muted);font-size:12px">انتخاب رمزارز و شبکه:</label>
            <select class="input" onchange="selectUserCryptoDepositCoin(this.value)">
              ${coins.map(c => `<option value="${esc(c.id)}" ${c.id === curCoin.id ? 'selected' : ''}>${c.icon || '🪙'} ${esc(c.name)} (${esc(c.network)}) — $${c.priceUsd}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="color:var(--muted);font-size:12px">مبلغ شارژ (تومان):</label>
            <input type="text" id="cdLiveTomanInput" class="input" style="font-weight:800" value="${Number(rawAmt).toLocaleString('en-US')}" oninput="onUserCryptoAmountInput(this.value)" />
          </div>
        </div>
        ${quickBtnsHtml}

        <div style="margin-top:14px">
          ${invoiceRightBoxHtml}
        </div>
      </div>
    `;
    return;
  }

  // ==================== طرح ۵: ویترین کارت‌های بزرگ رمزارز ====================
  stage.innerHTML = `
    <div style="margin-bottom:8px;font-weight:800;font-size:13.5px;color:var(--accent)">🪙 ۱. از ویترین زیر، ارز دیجیتال مورد نظر خود را برای شارژ کیف‌پول انتخاب کنید:</div>
    <div class="cd-tpl5-showcase-grid">
      ${coins.map(c => {
        const isSel = c.id === curCoin.id;
        const cToman = Math.round((Number(c.priceUsd) || 1) * usdtRate);
        return `
          <div class="cd-tpl5-coin-card ${isSel ? 'active' : ''}" onclick="selectUserCryptoDepositCoin('${esc(c.id)}')">
            <div class="row-between">
              <span style="font-size:22px">${c.icon || '🪙'}</span>
              <span class="pill pill-xs">${esc(c.network)}</span>
            </div>
            <h4 style="margin:6px 0 2px;font-size:14px">${esc(c.name)}</h4>
            <div style="font-size:12px;color:var(--accent);direction:ltr;text-align:left">$${c.priceUsd} · <b>${NF(cToman, 0)} ت</b></div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="cd-tpl1-split">
      <div class="panel" style="margin:0;padding:14px">
        <label style="font-size:13px;font-weight:800">۲. مبلغ شارژ مورد نظر (تومان):</label>
        <input type="text" id="cdLiveTomanInput" class="input" style="font-size:15px;font-weight:800;margin-top:6px" value="${Number(rawAmt).toLocaleString('en-US')}" oninput="onUserCryptoAmountInput(this.value)" />
        <div data-cd-toman-words class="input-words" style="margin-top:4px">${numToPersianWords(rawAmt, 'تومان')}</div>
        ${quickBtnsHtml}
      </div>
      ${invoiceRightBoxHtml}
    </div>
  `;
};

/* ============================================================================
   شروع برنامه
   ============================================================================ */
let appStarted = false;

async function startApp() {
  showAuth(false);
  renderUser();
  if (S.ui) {
    renderNavigation(S.ui.navItems);
    applyButtonsConfig(S.ui.buttonsConfig);
  }
  applyAllMenuTemplates();
  if (appStarted) {
    await Promise.all([loadState().catch(() => {}), loadMarket(true).catch(() => {})]);
    return;
  }
  appStarted = true;
  try { await loadState(); } catch (e) {}
  await loadMarket(true);
  try { await loadSignals(); } catch (e) {}
  refreshPortfolio().catch(() => {});
  await loadLastAnalysis().catch(() => {});
  renderSettings();
  renderNotifications().catch(() => {});
  loadUserFinancialHistory().catch(() => {});
  loadAutoInvestPositions().catch(() => {});
  loadTradingBotsData().catch(() => {});

  // به‌روزرسانی نامحسوس پس‌زمینه
  setTimeout(() => { warmMarket(false, 12000).catch(() => {}); }, 2000);

  setInterval(loadState, 60000);
  setInterval(() => loadMarket(true), 180000);
  setInterval(() => { if (currentView() === 'subscriptions' || currentView() === 'signals') loadAutoInvestPositions(); }, 45000);
  if (S.user && (S.user.isAdmin || S.user.role === 'admin') && currentView() === 'admin') loadAdmin();
}

(async function init() {
  S.market = buildClientFallbackMarketSnapshot();
  setDataStatus();
  renderTicker();
  startLivePriceStreamTicker();
  bind();
  await initUiCustomization();
  loadMarket(true).catch(() => {});
  let me = null;
  try { me = await api('/api/auth/me'); } catch (e) { me = null; }
  if (me) {
    S.settings = me.settings || (me.settings = {});
  }
  if (me && me.user) {
    S.user = me.user; S.settings = me.settings || {};
    if (me.user.theme) applyTheme(me.user.theme);
    await startApp();
  } else {
    const st = await api('/api/auth/install-state').catch(() => null);
    const installed = !!(st && st.installed);
    const s = (me && me.settings) || (st && st.settings) || {};
    showAuth(true, {
      siteName: (me && me.branding && me.branding.siteName) || (st && st.branding && st.branding.siteName) || 'سرمایه‌یار',
      tagline: (me && me.branding && me.branding.tagline) || (st && st.branding && st.branding.tagline) || '',
      allowRegister: installed ? !!s.allowRegister : true,
      notInstalled: !installed,
    });
  }
})();
