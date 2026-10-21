<?php
/* فهرست کامل دارایی‌های بازار داخلی ایران (نقره، طلا، سکه، سهام بورس، صندوق‌ها، ارز) و همه بازارهای مالی خارجی */
if (!defined("SARMAYEYAR")) exit;

function universe_classes(){ return [
  'fx'=>['fa'=>'ارز و فارکس','color'=>'#38bdf8', 'colorLight'=>'#0369a1'],
  'gold'=>['fa'=>'طلا، سکه و نقره','color'=>'#f59e0b', 'colorLight'=>'#b45309'],
  'crypto'=>['fa'=>'رمزارز و کریپتو','color'=>'#a78bfa', 'colorLight'=>'#6d28d9'],
  'iranEq'=>['fa'=>'بورس و سهام ایران','color'=>'#34d399', 'colorLight'=>'#047857'],
  'globalEq'=>['fa'=>'سهام و شاخص جهانی','color'=>'#60a5fa', 'colorLight'=>'#1d4ed8'],
  'commodity'=>['fa'=>'انرژی و کالای جهانی','color'=>'#fb923c', 'colorLight'=>'#c2410c'],
  'fixedInc'=>['fa'=>'اوراق و درآمد ثابت','color'=>'#94a3b8', 'colorLight'=>'#475569'],
  'fund'=>['fa'=>'صندوق سرمایه‌گذاری','color'=>'#22d3ee', 'colorLight'=>'#0e7490'],
  'realEstate'=>['fa'=>'ملک و املاک','color'=>'#e879f9', 'colorLight'=>'#a21caf'],
  'cash'=>['fa'=>'نقد و سپرده','color'=>'#cbd5e1', 'colorLight'=>'#64748b'],
]; }

function universe_assets(){ return [
  /* ==================== بازارهای داخلی ایران (region = iran) ==================== */
  // ۱. ارزهای بازار آزاد ایران
  ['id'=>'ir_usd','name'=>'دلار آمریکا (بازار آزاد)','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_dollar_rl'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>1,'group'=>'usd'],
  ['id'=>'ir_eur','name'=>'یورو (بازار آزاد)','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_eur'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.95],
  ['id'=>'ir_gbp','name'=>'پوند انگلیس (بازار آزاد)','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_gbp'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.9],
  ['id'=>'ir_aed','name'=>'درهم امارات (حواله)','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_aed'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.9],
  ['id'=>'ir_try','name'=>'لیر ترکیه','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_try'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.75],
  ['id'=>'ir_cad','name'=>'دلار کانادا','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_cad'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.85],
  ['id'=>'ir_chf','name'=>'فرانک سوئیس','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_chf'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.85],
  ['id'=>'ir_aud','name'=>'دلار استرالیا','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_aud'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.8],
  ['id'=>'ir_iqd','name'=>'دینار عراق','cls'=>'fx','subCat'=>'fx_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'price_iqd'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.6],

  // ۲. طلا و سکه بازار داخلی ایران
  ['id'=>'ir_gold18','name'=>'طلای ۱۸ عیار (گرم)','cls'=>'gold','subCat'=>'gold_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'geram18'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>1,'group'=>'gold'],
  ['id'=>'ir_mesghal','name'=>'مثقال طلای آب‌شده','cls'=>'gold','subCat'=>'gold_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'mesghal'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.92,'group'=>'gold'],
  ['id'=>'ir_coin','name'=>'سکه امامی (تمام بهار آزادی)','cls'=>'gold','subCat'=>'gold_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'sekeb'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.95,'group'=>'gold'],
  ['id'=>'ir_coin_h','name'=>'نیم سکه بهار آزادی','cls'=>'gold','subCat'=>'gold_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'nim'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.82,'group'=>'gold'],
  ['id'=>'ir_coin_q','name'=>'ربع سکه بهار آزادی','cls'=>'gold','subCat'=>'gold_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'rob'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.82,'group'=>'gold'],
  ['id'=>'ir_gold17c','name'=>'سکه یک‌گرمی بانک مرکزی','cls'=>'gold','subCat'=>'gold_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'gold_17_coin'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.75,'group'=>'gold'],

  // ۳. بازارهای نقره داخلی ایران
  ['id'=>'ir_silver_gram','name'=>'نقره خام ۹۹۹ (گرم - بازار ایران)','cls'=>'gold','subCat'=>'silver_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'silver_999'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.92,'group'=>'silver_ir'],
  ['id'=>'ir_silver_bar','name'=>'شمش نقره یک کیلویی (بورس کالا)','cls'=>'gold','subCat'=>'silver_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'silver'],'unit'=>'تومان','quality'=>0.9,'group'=>'silver_ir'],
  ['id'=>'ir_silver_cert','name'=>'گواهی سپرده شمش نقره (بورس کالا)','cls'=>'gold','subCat'=>'silver_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'silver'],'unit'=>'تومان','quality'=>0.88,'group'=>'silver_ir'],
  ['id'=>'ir_silver_shot','name'=>'ساچمه نقره سوئیسی/ترک (مثقال)','cls'=>'gold','subCat'=>'silver_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'silver'],'unit'=>'تومان','quality'=>0.85,'group'=>'silver_ir'],

  // ۴. شاخص‌ها و همه سهام‌های شاخص‌ساز بورس تهران
  ['id'=>'ir_tse','name'=>'شاخص کل بورس تهران (TEDPIX)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'واحد','quality'=>1],
  ['id'=>'ir_tse_eq','name'=>'شاخص کل هم‌وزن بورس تهران','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'واحد','quality'=>0.95],
  ['id'=>'ir_eq_foolad','name'=>'فولاد مبارکه اصفهان (فولاد)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.95],
  ['id'=>'ir_eq_fameli','name'=>'ملی صنایع مس ایران (فملی)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.95],
  ['id'=>'ir_eq_shepna','name'=>'پالایش نفت اصفهان (شپنا)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.93],
  ['id'=>'ir_eq_fars','name'=>'هلدینگ پتروشیمی خلیج فارس (فارس)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.94],
  ['id'=>'ir_eq_webmelat','name'=>'بانک ملت (وبملت)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.92],
  ['id'=>'ir_eq_shasta','name'=>'سرمایه‌گذاری تأمین اجتماعی (شستا)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.9],
  ['id'=>'ir_eq_kegol','name'=>'معدنی و صنعتی گل‌گهر (کگل)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.9],
  ['id'=>'ir_eq_kechad','name'=>'معدنی و صنعتی چادرملو (کچاد)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.9],
  ['id'=>'ir_eq_khodro','name'=>'ایران خودرو (خودرو)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.85],
  ['id'=>'ir_eq_nouri','name'=>'پتروشیمی نوری (نوری)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.91],
  ['id'=>'ir_eq_zagros','name'=>'پتروشیمی زاگرس (زاگرس)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.88],
  ['id'=>'ir_eq_akhaber','name'=>'مخابرات ایران (اخابر)','cls'=>'iranEq','subCat'=>'stock_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.86],

  // ۵. همه صندوق‌های سرمایه‌گذاری قابل معامله ایران (طلا، نقره، اهرمی، سهامی، درآمد ثابت)
  ['id'=>'ir_fund_ayar','name'=>'صندوق طلای مفید (عیار)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'ime_indices_sandogh_tala'],'unit'=>'تومان','quality'=>0.96],
  ['id'=>'ir_fund_lotus','name'=>'صندوق طلای لوتوس (طلا)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'ime_indices_sandogh_tala'],'unit'=>'تومان','quality'=>0.96],
  ['id'=>'ir_fund_kahroba','name'=>'صندوق طلای کاریزما (کهربا)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'ime_indices_sandogh_tala'],'unit'=>'تومان','quality'=>0.94],
  ['id'=>'ir_fund_gohar','name'=>'صندوق طلای کیان (گوهر)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'ime_indices_sandogh_tala'],'unit'=>'تومان','quality'=>0.92],
  ['id'=>'ir_fund_silver','name'=>'صندوق سرمایه‌گذاری نقره (سیمین/نقره)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'silver'],'unit'=>'تومان','quality'=>0.93],
  ['id'=>'ir_fund_ahrom','name'=>'صندوق سهامی اهرمی کاریزما (اهرم)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.94],
  ['id'=>'ir_fund_shetab','name'=>'صندوق سهامی اهرمی آگاه (شتاب)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.91],
  ['id'=>'ir_fund_moj','name'=>'صندوق سهامی اهرمی فیروزه (موج)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.9],
  ['id'=>'ir_fund_dara','name'=>'صندوق واسطه‌گری مالی یکم (دارا یکم)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.9],
  ['id'=>'ir_fund_palayesh','name'=>'صندوق پالایشی یکم (پالایش)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.89],
  ['id'=>'ir_fund_kamand','name'=>'صندوق درآمد ثابت کمند (کمند)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.95],
  ['id'=>'ir_fund_amin','name'=>'صندوق درآمد ثابت امین یکم (امین)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'bourse'],'unit'=>'تومان','quality'=>0.93],
  ['id'=>'ir_gold_fund','name'=>'صندوق طلا (شاخص هم‌وزن بورس کالا)','cls'=>'fund','subCat'=>'fund_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'ime_indices_sandogh_tala'],'unit'=>'واحد','quality'=>0.88],

  // ۶. رمزارزهای تومانی بازار داخلی ایران
  ['id'=>'ir_usdt','name'=>'تتر تومانی (USDT/IRT)','cls'=>'crypto','subCat'=>'crypto_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'crypto-tether-irr'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.95,'group'=>'usd'],
  ['id'=>'ir_btc','name'=>'بیت‌کوین تومانی (BTC/IRT)','cls'=>'crypto','subCat'=>'crypto_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'crypto-bitcoin-irr'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.9,'group'=>'btc'],
  ['id'=>'ir_eth','name'=>'اتریوم تومانی (ETH/IRT)','cls'=>'crypto','subCat'=>'crypto_ir','region'=>'iran','src'=>['type'=>'tgju','symbol'=>'crypto-ethereum-irr'],'unit'=>'تومان','unitScale'=>0.1,'quality'=>0.88,'group'=>'eth'],

  /* ==================== همه بازارهای مالی خارجی (region != iran) ==================== */
  // ۱. طلا، نقره و فلزات گران‌بها جهانی
  ['id'=>'g_ons','name'=>'انس جهانی طلا (XAU/USD)','cls'=>'gold','subCat'=>'metals_global','region'=>'global','src'=>['type'=>'tgju','symbol'=>'ons'],'unit'=>'دلار','quality'=>1,'group'=>'gold'],
  ['id'=>'g_silver','name'=>'انس جهانی نقره (XAG/USD)','cls'=>'gold','subCat'=>'metals_global','region'=>'global','src'=>['type'=>'tgju','symbol'=>'silver'],'unit'=>'دلار','quality'=>0.95,'group'=>'silver'],
  ['id'=>'g_goldf','name'=>'طلا آتی کامکس آمریکا (GC=F)','cls'=>'gold','subCat'=>'metals_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'GC=F'],'unit'=>'دلار','quality'=>0.95,'group'=>'gold'],
  ['id'=>'g_silverf','name'=>'نقره آتی کامکس آمریکا (SI=F)','cls'=>'gold','subCat'=>'metals_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'SI=F'],'unit'=>'دلار','quality'=>0.9,'group'=>'silver'],

  // ۲. نفت، انرژی و کالاهای پایه جهانی
  ['id'=>'g_brent','name'=>'نفت برنت دریای شمال (Brent)','cls'=>'commodity','subCat'=>'commodity_global','region'=>'global','src'=>['type'=>'tgju','symbol'=>'oil_brent'],'unit'=>'دلار','quality'=>1,'group'=>'oil'],
  ['id'=>'g_wti','name'=>'نفت سبک تگزاس آمریکا (WTI)','cls'=>'commodity','subCat'=>'commodity_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'CL=F'],'unit'=>'دلار','quality'=>0.95,'group'=>'oil'],
  ['id'=>'g_copper','name'=>'مس جهانی (Copper Futures)','cls'=>'commodity','subCat'=>'commodity_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'HG=F'],'unit'=>'دلار','quality'=>0.88],
  ['id'=>'g_gas','name'=>'گاز طبیعی جهانی (Natural Gas)','cls'=>'commodity','subCat'=>'commodity_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'NG=F'],'unit'=>'دلار','quality'=>0.82],
  ['id'=>'g_platinum','name'=>'انس جهانی پلاتین (XPT/USD)','cls'=>'commodity','subCat'=>'commodity_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'PL=F'],'unit'=>'دلار','quality'=>0.8],

  // ۳. شاخص‌های بورس، سهام و ETFهای جهانی
  ['id'=>'g_spx','name'=>'شاخص S&P 500 آمریکا','cls'=>'globalEq','subCat'=>'eq_global','region'=>'us','src'=>['type'=>'yahoo','symbol'=>'^GSPC'],'unit'=>'دلار','quality'=>1],
  ['id'=>'g_ndx','name'=>'شاخص نزدک کامپوزیت (NASDAQ)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'us','src'=>['type'=>'yahoo','symbol'=>'^IXIC'],'unit'=>'دلار','quality'=>1],
  ['id'=>'g_dji','name'=>'شاخص صنعتی داو جونز (Dow Jones)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'us','src'=>['type'=>'yahoo','symbol'=>'^DJI'],'unit'=>'دلار','quality'=>0.95],
  ['id'=>'g_rut','name'=>'شاخص راسل ۲۰۰۰ آمریکا','cls'=>'globalEq','subCat'=>'eq_global','region'=>'us','src'=>['type'=>'yahoo','symbol'=>'^RUT'],'unit'=>'دلار','quality'=>0.85],
  ['id'=>'g_dax','name'=>'شاخص دکس آلمان (DAX 40)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'eu','src'=>['type'=>'yahoo','symbol'=>'^GDAXI'],'unit'=>'یورو','quality'=>0.95],
  ['id'=>'g_cac','name'=>'شاخص کک ۴۰ فرانسه (CAC 40)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'eu','src'=>['type'=>'yahoo','symbol'=>'^FCHI'],'unit'=>'یورو','quality'=>0.85],
  ['id'=>'g_ftse','name'=>'شاخص فوتسی ۱۰۰ انگلیس (FTSE 100)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'eu','src'=>['type'=>'yahoo','symbol'=>'^FTSE'],'unit'=>'پوند','quality'=>0.9],
  ['id'=>'g_n225','name'=>'شاخص نیکی ۲۲۵ ژاپن (Nikkei 225)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'asia','src'=>['type'=>'yahoo','symbol'=>'^N225'],'unit'=>'ین','quality'=>0.9],
  ['id'=>'g_ssec','name'=>'شاخص بورس شانگهای چین','cls'=>'globalEq','subCat'=>'eq_global','region'=>'asia','src'=>['type'=>'yahoo','symbol'=>'000001.SS'],'unit'=>'یوان','quality'=>0.85],
  ['id'=>'g_hsi','name'=>'شاخص هنگ‌سنگ هنگ‌کنگ','cls'=>'globalEq','subCat'=>'eq_global','region'=>'asia','src'=>['type'=>'yahoo','symbol'=>'^HSI'],'unit'=>'دلار','quality'=>0.85],
  ['id'=>'g_nifty','name'=>'شاخص نیفتی ۵۰ هند','cls'=>'globalEq','subCat'=>'eq_global','region'=>'asia','src'=>['type'=>'yahoo','symbol'=>'^NSEI'],'unit'=>'روپیه','quality'=>0.9],
  ['id'=>'g_kospi','name'=>'شاخص کاسپی کره جنوبی','cls'=>'globalEq','subCat'=>'eq_global','region'=>'asia','src'=>['type'=>'yahoo','symbol'=>'^KS11'],'unit'=>'وون','quality'=>0.82],
  ['id'=>'g_twii','name'=>'شاخص بورس تایوان (TAIEX)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'asia','src'=>['type'=>'yahoo','symbol'=>'^TWII'],'unit'=>'دلار','quality'=>0.82],
  ['id'=>'g_bvsp','name'=>'شاخص بورس برزیل (Bovespa)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'^BVSP'],'unit'=>'دلار','quality'=>0.78],
  ['id'=>'g_eem','name'=>'ETF بازارهای نوظهور جهانی (EEM)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'EEM'],'unit'=>'دلار','quality'=>0.9],
  ['id'=>'g_fxi','name'=>'ETF سهام شرکت‌های بزرگ چین (FXI)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'FXI'],'unit'=>'دلار','quality'=>0.85],
  ['id'=>'g_inda','name'=>'ETF بازار سهام هند (INDA)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'INDA'],'unit'=>'دلار','quality'=>0.85],
  ['id'=>'g_ewz','name'=>'ETF بازار سهام برزیل (EWZ)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'EWZ'],'unit'=>'دلار','quality'=>0.78],
  ['id'=>'g_eww','name'=>'ETF بازار سهام مکزیک (EWW)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'EWW'],'unit'=>'دلار','quality'=>0.75],
  ['id'=>'g_tur','name'=>'ETF بازار سهام ترکیه (TUR)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'TUR'],'unit'=>'دلار','quality'=>0.72],
  ['id'=>'g_ksa','name'=>'ETF بازار سهام عربستان (KSA)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'mena','src'=>['type'=>'yahoo','symbol'=>'KSA'],'unit'=>'دلار','quality'=>0.78],
  ['id'=>'g_epi','name'=>'ETF سهام هند (WisdomTree EPI)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'em','src'=>['type'=>'yahoo','symbol'=>'EPI'],'unit'=>'دلار','quality'=>0.75],
  ['id'=>'g_gdx','name'=>'ETF شرکت‌های استخراج طلا (GDX)','cls'=>'globalEq','subCat'=>'eq_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'GDX'],'unit'=>'دلار','quality'=>0.85],

  // ۴. اوراق خزانه و درآمد ثابت جهانی
  ['id'=>'g_tlt','name'=>'ETF اوراق خزانه ۲۰ ساله آمریکا (TLT)','cls'=>'fixedInc','subCat'=>'bond_global','region'=>'us','src'=>['type'=>'yahoo','symbol'=>'TLT'],'unit'=>'دلار','quality'=>0.88],
  ['id'=>'g_us10y','name'=>'بازده اوراق ۱۰ ساله خزانه آمریکا (US10Y)','cls'=>'fixedInc','subCat'=>'bond_global','region'=>'us','src'=>['type'=>'yahoo','symbol'=>'^TNX'],'unit'=>'درصد','quality'=>0.9],

  // ۵. بازار فارکس و جفت‌ارزهای جهانی
  ['id'=>'g_dxy','name'=>'شاخص جهانی دلار آمریکا (DXY)','cls'=>'fx','subCat'=>'forex_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'DX-Y.NYB'],'unit'=>'واحد','quality'=>0.95],
  ['id'=>'g_eurusd','name'=>'جفت‌ارز یورو به دلار (EUR/USD)','cls'=>'fx','subCat'=>'forex_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'EURUSD=X'],'unit'=>'دلار','quality'=>0.95],
  ['id'=>'g_usdjpy','name'=>'جفت‌ارز دلار به ین ژاپن (USD/JPY)','cls'=>'fx','subCat'=>'forex_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'USDJPY=X'],'unit'=>'ین','quality'=>0.9],
  ['id'=>'g_usdcny','name'=>'جفت‌ارز دلار به یوان چین (USD/CNY)','cls'=>'fx','subCat'=>'forex_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'USDCNY=X'],'unit'=>'یوان','quality'=>0.85],
  ['id'=>'g_vix','name'=>'شاخص نوسان و ترس وال‌استریت (VIX)','cls'=>'fx','subCat'=>'forex_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'^VIX'],'unit'=>'واحد','quality'=>0.9,'inverse'=>true],

  // ۶. رمزارزهای بزرگ بازار جهانی (دلاری)
  ['id'=>'c_btc','name'=>'بیت‌کوین جهانی (BTC/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'BTC-USD'],'unit'=>'دلار','quality'=>1,'cg'=>'bitcoin','group'=>'btc'],
  ['id'=>'c_eth','name'=>'اتریوم جهانی (ETH/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'ETH-USD'],'unit'=>'دلار','quality'=>0.96,'cg'=>'ethereum','group'=>'eth'],
  ['id'=>'c_sol','name'=>'سولانا (SOL/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'SOL-USD'],'unit'=>'دلار','quality'=>0.9,'cg'=>'solana','group'=>'sol'],
  ['id'=>'c_bnb','name'=>'بایننس‌کوین (BNB/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'BNB-USD'],'unit'=>'دلار','quality'=>0.88,'cg'=>'binancecoin'],
  ['id'=>'c_xrp','name'=>'ریپل (XRP/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'XRP-USD'],'unit'=>'دلار','quality'=>0.88,'cg'=>'ripple'],
  ['id'=>'c_ada','name'=>'کاردانو (ADA/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'ADA-USD'],'unit'=>'دلار','quality'=>0.8,'cg'=>'cardano'],
  ['id'=>'c_doge','name'=>'دوج‌کوین (DOGE/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'DOGE-USD'],'unit'=>'دلار','quality'=>0.78,'cg'=>'dogecoin'],
  ['id'=>'c_link','name'=>'چین‌لینک (LINK/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'LINK-USD'],'unit'=>'دلار','quality'=>0.82,'cg'=>'chainlink'],
  ['id'=>'c_avax','name'=>'آوالانچ (AVAX/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'AVAX-USD'],'unit'=>'دلار','quality'=>0.78,'cg'=>'avalanche-2'],
  ['id'=>'c_dot','name'=>'پولکادات (DOT/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'DOT-USD'],'unit'=>'دلار','quality'=>0.76,'cg'=>'polkadot'],
  ['id'=>'c_ltc','name'=>'لایت‌کوین (LTC/USD)','cls'=>'crypto','subCat'=>'crypto_global','region'=>'global','src'=>['type'=>'yahoo','symbol'=>'LTC-USD'],'unit'=>'دلار','quality'=>0.8,'cg'=>'litecoin'],
]; }

function universe_manual_classes(){ return [
  ['cls'=>'realEstate','name'=>'ملک و املاک (مسکن)','hint'=>'ارزش روز تقریبی'],
  ['cls'=>'fixedInc','name'=>'سپرده بانکی / اوراق','hint'=>'اصل + سود تقریبی'],
  ['cls'=>'cash','name'=>'نقد / بدون سرمایه‌گذاری','hint'=>'موجودی آزاد'],
  ['cls'=>'fund','name'=>'صندوق سرمایه‌گذاری (سایر)','hint'=>'ارزش روز'],
  ['cls'=>'iranEq','name'=>'سهام/دارایی بورسی خاص','hint'=>'ارزش روز'],
]; }
