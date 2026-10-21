<?php
/**
 * ماژول هوش مصنوعی (فانکشنال): پرووایدرها، انتخاب خودکار مدل، تحلیل خودکار، چت
 */
if (!defined('SARMAYEYAR')) exit;

function ai_providers(): array {
    return [
        'openai'     => ['label' => 'OpenAI', 'type' => 'openai', 'baseUrl' => 'https://api.openai.com/v1', 'keysUrl' => 'https://platform.openai.com/api-keys'],
        'openrouter' => ['label' => 'OpenRouter (چند مدل)', 'type' => 'openai', 'baseUrl' => 'https://openrouter.ai/api/v1', 'keysUrl' => 'https://openrouter.ai/keys',
                         'extraHeaders' => ['HTTP-Referer: https://sarmayeyar.local', 'X-Title: Sarmayeyar']],
        'gemini'     => ['label' => 'Google Gemini', 'type' => 'openai', 'baseUrl' => 'https://generativelanguage.googleapis.com/v1beta/openai', 'keysUrl' => 'https://aistudio.google.com/apikey'],
        'groq'       => ['label' => 'Groq', 'type' => 'openai', 'baseUrl' => 'https://api.groq.com/openai/v1', 'keysUrl' => 'https://console.groq.com/keys'],
        'deepseek'   => ['label' => 'DeepSeek', 'type' => 'openai', 'baseUrl' => 'https://api.deepseek.com/v1', 'keysUrl' => 'https://platform.deepseek.com/api_keys'],
        'xai'        => ['label' => 'xAI Grok', 'type' => 'openai', 'baseUrl' => 'https://api.x.ai/v1', 'keysUrl' => 'https://console.x.ai'],
        'mistral'    => ['label' => 'Mistral', 'type' => 'openai', 'baseUrl' => 'https://api.mistral.ai/v1', 'keysUrl' => 'https://console.mistral.ai/api-keys'],
        'anthropic'  => ['label' => 'Anthropic Claude', 'type' => 'anthropic', 'baseUrl' => 'https://api.anthropic.com/v1', 'keysUrl' => 'https://console.anthropic.com/settings/keys'],
        'avalai'     => ['label' => 'AvalAI (ایران / بدون تحریم)', 'type' => 'openai', 'baseUrl' => 'https://api.avalai.ir/v1', 'keysUrl' => 'https://avalai.ir'],
        'metis'      => ['label' => 'Metis AI (ایران)', 'type' => 'openai', 'baseUrl' => 'https://api.metisai.ir/openai/v1', 'keysUrl' => 'https://metisai.ir'],
        'ollama'     => ['label' => 'Ollama (لوکال)', 'type' => 'openai', 'baseUrl' => 'http://localhost:11434/v1', 'noKey' => true],
        'custom'     => ['label' => 'سفارشی (سازگار با OpenAI)', 'type' => 'openai', 'baseUrl' => '', 'keysUrl' => ''],
    ];
}

function ai_cfg(array $s): array {
    $providers = ai_providers();
    $a = $s['ai'] ?? [];
    $key = $a['provider'] ?? 'openai';
    $prov = $providers[$key] ?? $providers['openai'];
    return [
        'provider' => $key, 'type' => $prov['type'],
        'baseUrl' => trim((string) ($a['baseUrl'] ?? '')) !== '' ? trim($a['baseUrl']) : $prov['baseUrl'],
        'label' => $prov['label'], 'keysUrl' => $prov['keysUrl'] ?? '',
        'apiKey' => (string) ($a['apiKey'] ?? ''),
        'model' => $a['model'] ?? 'auto',
        'temperature' => (float) ($a['temperature'] ?? 0.3),
        'autoMode' => !empty($a['autoMode']),
        'autoIntervalMin' => (int) ($a['autoIntervalMin'] ?? 60),
        'extraHeaders' => $prov['extraHeaders'] ?? [],
        'noKey' => !empty($prov['noKey']),
        'lastModels' => $a['lastModels'] ?? [],
    ];
}

/* -------------------------------------------------- رتبه‌بندی مدل‌ها */

function ai_noise_pattern(): string {
    return '/(embedding|embed|tts|whisper|audio|image|dall-e|moderation|rerank|guard|ocr|stable-diffusion|sora|video|veo|imagen|aqa|babbage|davinci|curie|ada-|text-similarity|codex-mini-latest|computer-use)/i';
}

function ai_model_tiers(): array {
    return [
        ['/claude-opus-4/i', 99], ['/claude-sonnet-4|claude-4-sonnet/i', 96], ['/claude-3-7-sonnet/i', 92],
        ['/claude-3-5-sonnet/i', 87], ['/claude-3-5-haiku/i', 72], ['/claude-3-opus/i', 80],
        ['/gpt-5\.1/i', 100], ['/gpt-5/i', 98], ['/o4-mini/i', 88], ['/o3-mini/i', 84], ['/^o3|o3-2/i', 90],
        ['/gpt-4\.1-mini/i', 78], ['/gpt-4\.1/i', 88], ['/gpt-4o-mini/i', 74], ['/gpt-4o/i', 82], ['/gpt-4-turbo/i', 70],
        ['/gemini-2\.5-pro/i', 96], ['/gemini-2\.5-flash/i', 86], ['/gemini-2\.0-flash/i', 76], ['/gemini-1\.5-pro/i', 72],
        ['/deepseek-reasoner|deepseek-r1/i', 89], ['/deepseek-chat|deepseek-v3/i', 84],
        ['/grok-4/i', 94], ['/grok-3/i', 86], ['/grok-2/i', 74],
        ['/llama-4/i', 80], ['/llama-3\.3-70b/i', 74], ['/llama-3\.1-70b/i', 70], ['/llama-3\.1-8b|llama-3-8b/i', 45],
        ['/qwen3-max|qwen-max/i', 82], ['/qwen3/i', 78], ['/qwen2\.5-72b/i', 72],
        ['/glm-4/i', 70], ['/kimi|moonshot/i', 72], ['/mistral-large/i', 74], ['/mixtral-8x22b/i', 66],
        ['/phi-4/i', 60], ['/gemma-3/i', 62], ['/command-r-plus/i', 68], ['/sonar-pro|sonar-reasoning/i', 80],
    ];
}

function ai_score_model(string $id): int {
    $base = 50;
    foreach (ai_model_tiers() as [$re, $score]) {
        if (preg_match($re, $id)) $base = max($base, $score);
    }
    if (preg_match('/:free$/i', $id)) $base += 3;
    if (stripos($id, 'latest') !== false) $base += 1;
    if (strlen($id) > 60) $base -= 3;
    return $base;
}

function ai_rank_models(array $models): array {
    $noise = ai_noise_pattern();
    $out = [];
    foreach ($models as $m) {
        $id = $m['id'] ?? null;
        if (!$id || preg_match($noise, $id)) continue;
        $m['score'] = ai_score_model($id);
        $out[] = $m;
    }
    usort($out, fn($x, $y) => $y['score'] <=> $x['score']);
    return $out;
}

function ai_pick_auto(array $models): ?string {
    $ranked = ai_rank_models($models);
    return $ranked ? $ranked[0]['id'] : null;
}

/* -------------------------------------------------------- HTTP سرویس */

function ai_headers(array $c, bool $withJson = true): array {
    $h = [];
    if ($withJson) $h[] = 'Content-Type: application/json';
    foreach ($c['extraHeaders'] ?? [] as $x) $h[] = $x;
    if (!$c['noKey'] && $c['apiKey'] !== '') {
        if ($c['type'] === 'anthropic') { $h[] = 'x-api-key: ' . $c['apiKey']; $h[] = 'anthropic-version: 2023-06-01'; }
        else $h[] = 'Authorization: Bearer ' . $c['apiKey'];
    }
    return $h;
}

function ai_list_models(array $c, bool $save = true): array {
    if ($c['baseUrl'] === '') throw new RuntimeException('آدرس سرویس (Base URL) تنظیم نشده است.');
    if (!$c['noKey'] && $c['apiKey'] === '') throw new RuntimeException('کلید API ثبت نشده است.');
    $url = rtrim($c['baseUrl'], '/') . '/models';
    $r = http_request_one(['url' => $url, 'headers' => ai_headers($c, false)], 45);
    $j = http_json_decode($r['body']);
    if (!$r['ok']) {
        $msg = is_array($j) ? ($j['error']['message'] ?? $j['message'] ?? u_json($j)) : mb_substr($r['body'], 0, 300);
        throw new RuntimeException('خطای سرویس (' . $r['status'] . '): ' . $msg);
    }
    $models = [];
    if (isset($j['data']) && is_array($j['data'])) {
        foreach ($j['data'] as $m) {
            $id = $m['id'] ?? ($m['name'] ?? null);
            if (!$id) continue;
            $models[] = ['id' => $id, 'name' => $m['name'] ?? ($m['display_name'] ?? $id),
                'context' => $m['context_length'] ?? ($m['context_window'] ?? null),
                'free' => isset($m['pricing']['prompt']) && (float) $m['pricing']['prompt'] === 0.0];
        }
    } elseif (isset($j['models']) && is_array($j['models'])) {
        foreach ($j['models'] as $m) {
            $id = preg_replace('/^models\//', '', (string) ($m['name'] ?? ($m['id'] ?? '')));
            if (!$id) continue;
            $models[] = ['id' => $id, 'name' => $m['displayName'] ?? $id, 'context' => $m['inputTokenLimit'] ?? null];
        }
    }
    $ranked = ai_rank_models($models);
    $auto = $ranked ? $ranked[0]['id'] : null;
    if ($save) {
        $s = store_load();
        $s['ai']['lastModels'] = array_slice($ranked, 0, 300);
        $s['ai']['autoPick'] = $auto;
        $s['ai']['modelsFetchedAt'] = u_now_ms();
        store_save($s);
    }
    return ['models' => $ranked, 'auto' => $auto, 'provider' => $c['provider'], 'label' => $c['label']];
}

/** فراخوانی چت → متن. خروجی: ['text'=>..,'model'=>..] */
function ai_chat(array $c, array $messages, int $maxTokens = 3000, int $timeout = 120): array {
    $model = $c['model'];
    if (!$model || $model === 'auto') {
        $models = $c['lastModels'];
        if (!$models) { try { $models = ai_list_models($c)['models']; } catch (Throwable $e) { $models = []; } }
        $model = ai_pick_auto($models) ?: 'gpt-4o-mini';
    }
    if ($c['type'] === 'anthropic') {
        $sys = [];
        $rest = [];
        foreach ($messages as $m) {
            if (($m['role'] ?? '') === 'system') $sys[] = $m['content'];
            else $rest[] = ['role' => $m['role'], 'content' => $m['content']];
        }
        $payload = ['model' => $model, 'max_tokens' => $maxTokens, 'temperature' => $c['temperature'], 'messages' => $rest];
        if ($sys) $payload['system'] = implode("\n\n", $sys);
        $r = http_post_json(rtrim($c['baseUrl'], '/') . '/messages', ai_headers($c), $payload, $timeout);
        if (!$r['ok']) throw new RuntimeException($r['error']);
        $txt = '';
        foreach ($r['json']['content'] ?? [] as $p) $txt .= ($p['text'] ?? '') . "\n";
        return ['text' => trim($txt), 'model' => $model];
    }
    $payload = ['model' => $model, 'temperature' => $c['temperature'], 'stream' => false, 'messages' => $messages];
    if ($maxTokens && $maxTokens !== 3000) $payload['max_tokens'] = $maxTokens;
    $r = http_post_json(rtrim($c['baseUrl'], '/') . '/chat/completions', ai_headers($c), $payload, $timeout);
    if (!$r['ok']) throw new RuntimeException($r['error']);
    $txt = $r['json']['choices'][0]['message']['content'] ?? ($r['json']['choices'][0]['text'] ?? '');
    return ['text' => trim((string) $txt), 'model' => $model];
}

/** استخراج JSON از متن (مقاوم به ``` و توضیح اضافه) */
function ai_extract_json(?string $text) {
    if (!$text) return null;
    $t = trim($text);
    $t = preg_replace('/^```(?:json)?/i', '', $t);
    $t = preg_replace('/```$/', '', $t);
    $start = strpos($t, '{');
    if ($start === false) return null;
    $depth = 0; $inStr = false; $esc = false;
    for ($i = $start; $i < strlen($t); $i++) {
        $ch = $t[$i];
        if ($inStr) {
            if ($esc) $esc = false;
            elseif ($ch === '\\') $esc = true;
            elseif ($ch === '"') $inStr = false;
            continue;
        }
        if ($ch === '"') $inStr = true;
        elseif ($ch === '{') $depth++;
        elseif ($ch === '}') {
            $depth--;
            if ($depth === 0) {
                $j = json_decode(substr($t, $start, $i - $start + 1), true);
                return is_array($j) ? $j : null;
            }
        }
    }
    $j = json_decode(substr($t, $start), true);
    return is_array($j) ? $j : null;
}

/* ------------------------------------------------------ پرامپت و متن */

function ai_round($x, int $d = 3) {
    return ($x === null || !is_finite((float) $x)) ? null : round((float) $x, $d);
}

function ai_build_context(array $s): array {
    $pf = engine_analyze_portfolio($s);
    $pulse = engine_market_pulse($s);
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_snapshot(false);
    }
    $assets = [];
    if (is_array($snap)) {
        foreach (array_slice($snap['assets'], 0, 90) as $a) {
            $m = $a['metrics'];
            $assets[] = [
                'id' => $a['id'], 'name' => $a['name'], 'cls' => $a['cls'], 'region' => $a['region'], 'unit' => $a['unit'],
                'price' => ai_round($m['last'], 4), 'day' => ai_round($m['dayChangePct'] ?? null, 2),
                'r1w' => ai_round(($m['r1w'] ?? 0) * 100, 1), 'r1m' => ai_round(($m['r1m'] ?? 0) * 100, 1),
                'r3m' => ai_round(($m['r3m'] ?? 0) * 100, 1), 'r6m' => ai_round(($m['r6m'] ?? 0) * 100, 1),
                'r1y' => ai_round(($m['r1y'] ?? 0) * 100, 1),
                'vol' => ai_round(($m['vol252'] ?? 0) * 100, 1), 'dd52' => ai_round(($m['dd52'] ?? 0) * 100, 1),
                'aboveMA200' => $m['distMA200'] === null ? null : ($m['distMA200'] > 0),
                'rsi' => ai_round($m['rsi14'] ?? null, 0), 'z1m' => ai_round($m['z1m'] ?? null, 1),
                'rel1m' => ai_round(($m['rel1m'] ?? 0) * 100, 1), 'lag' => $m['lagScore'], 'opp' => $m['oppScore'],
                'risk' => $m['riskLevel'],
                'usdDd52' => isset($m['usdDd52']) ? ai_round($m['usdDd52'] * 100, 1) : null,
                'usdR3m' => isset($m['usdR3m']) ? ai_round($m['usdR3m'] * 100, 1) : null,
            ];
        }
    }
    $classes = universe_classes();
    $lines = [];
    foreach ($s['portfolio'] ?? [] as $p) {
        $lines[] = '- ' . $p['label'] . ' (' . ($classes[$p['cls']]['fa'] ?? $p['cls']) . '): ' .
            number_format((float) $p['amount'], 0, '.', ',') . ' ' . (($p['unit'] ?? 'unit') === 'usd' ? 'دلار' : 'تومان');
    }
    return ['profile' => $s['profile'] ?? [], 'pf' => $pf, 'pulse' => $pulse, 'assets' => $assets,
        'portfolioText' => $lines ? implode("\n", $lines) : 'کاربر هنوز پرتفویی ثبت نکرده است (فقط نقد / بدون دارایی).'];
}

function ai_system_prompt(array $ctx): string {
    $riskFa = ['conservative' => 'محافظه‌کار', 'balanced' => 'متعادل', 'aggressive' => 'پرخطر‌پذیر'][$ctx['profile']['risk'] ?? 'balanced'] ?? 'متعادل';
    $horizonFa = ['short' => 'کوتاه‌مدت (تا ۳ ماه)', 'mid' => 'میان‌مدت (۳ تا ۱۲ ماه)', 'long' => 'بلندمدت (بیش از ۱ سال)'][$ctx['profile']['horizon'] ?? 'mid'] ?? 'میان‌مدت';
    $cash = number_format((float) ($ctx['profile']['investableCash'] ?? 0), 0, '.', ',');
    return "تو «تحلیلگر ارشد سرمایه‌یار» هستی: یک استراتژیست سرمایه‌گذاری مسلط بر بازار ایران (بورس تهران، ارز، طلا و سکه، کریپتوی تومانی) و بازارهای جهانی (سهام، کالا، ارز، کریپتو، اوراق).\n" .
        "وظیفه: با تکیه *فقط* روی داده‌ای که در ادامه می‌آید، فرصت‌های سرمایه‌گذاری، بازارهای عقب‌مانده و سیگنال‌های عملی تولید کنی.\n" .
        "قواعد مهم:\n- هرگز قیمت یا عددی از خودت نساز؛ فقط از اعداد ورودی استفاده کن (اگر عددی نبود، «داده‌ای نیست» بگو).\n" .
        "- شناسه دارایی (assetId) را دقیقاً از فهرست ورودی بردار.\n" .
        "- لحن: حرفه‌ای، شفاف، فارسی روان. توصیه‌ی کلی («همه پولت را ببر») نده؛ همیشه پله‌ای، با حد ضرر و مدیریت ریسک.\n" .
        "- به شرایط ایران توجه کن: تورم، نرخ دلار، محدودیت دسترسی به بازار جهانی، ریسک نقدشوندگی و نرخ‌گذاری دستوری.\n" .
        "- تفاوت «عقب‌مانده» و «ضعیف» را لحاظ کن: دارایی‌ای که صرفاً ارزان نیست بلکه بنیان/روند قابل قبولی دارد، فرصت بهتری است.\n" .
        "- فیلدهای usdDd52 و usdR3m فقط برای دارایی‌های ایران و بر حسب دلار است: عقب‌ماندگی واقعی بازار ایران را با آن بسنج.\n" .
        "پروفایل کاربر: ریسک‌پذیری «{$riskFa}»، افق «{$horizonFa}»، نقد قابل سرمایه‌گذاری: {$cash} تومان.";
}

function ai_data_block(array $ctx): string {
    $w = [];
    foreach (($ctx['pf']['weights'] ?? []) as $k => $v) $w[$k] = round($v * 100, 1);
    $gaps = [];
    foreach ($ctx['pf']['gaps'] ?? [] as $g) $gaps[] = ['cls' => $g['cls'], 'gap' => $g['gap']];
    $pulse = $ctx['pulse'] ? [
        'breadthAboveMA200' => round(($ctx['pulse']['breadth'] ?? 0), 2),
        'avg1mAll' => ai_round(($ctx['pulse']['avg1m'] ?? 0) * 100, 2),
        'vix' => ai_round($ctx['pulse']['vix'], 2),
        'byClass' => array_map(fn($c) => ['cls' => $c['cls'], 'n' => $c['n'],
            'avg1m' => ai_round(($c['r1m'] ?? 0) * 100, 1), 'avg3m' => ai_round(($c['r3m'] ?? 0) * 100, 1),
            'lag' => ai_round($c['lag'], 0), 'breadth' => round($c['breadth'], 2)], $ctx['pulse']['classes'] ?? []),
    ] : null;

    return "## پرتفوی فعلی کاربر\n" . $ctx['portfolioText'] .
        "\nنرخ دلار بازار آزاد (تومان): " . number_format($ctx['pf']['rate'] ?? 0, 0, '.', ',') .
        "\nارزش کل پرتفوی: " . number_format($ctx['pf']['totalToman'] ?? 0, 0, '.', ',') . " تومان" .
        "\n(دارایی پایه مثل ملک: " . number_format($ctx['pf']['anchorToman'] ?? 0, 0, '.', ',') . " تومان — از مدل تخصیص بیرون است)" .
        "\nوزن فعلی کلاس‌ها (درصد): " . u_json($w) .
        "\nمدل تخصیص هدف: " . u_json($ctx['pf']['target'] ?? []) .
        "\nشکاف‌ها (هدف منهای فعلی): " . u_json($gaps) .
        "\n\n## وضعیت کلی بازار\n" . u_json($pulse) .
        "\n\n## داده بازار (JSON | درصدها عددی؛ lag/opp امتیاز ۰..۱۰۰)\n" . u_json($ctx['assets']) .
        "\n\n## راهنما\n- lag = امتیاز عقب‌ماندگی | opp = امتیاز فرصت | risk = low/med/high\n" .
        "- dd52 منفی = فاصله زیر سقف ۵۲ هفته | rel1m منفی = عقب‌تر از هم‌گروهی‌ها | z1m بسیار منفی = فشار فروش غیرعادی\n" .
        "- کلاس‌ها: fx ارز، gold طلا و فلزات، crypto کریپتو، iranEq بورس ایران، globalEq سهام/شاخص جهانی، commodity انرژی و کالا، fixedInc اوراق، fund صندوق، realEstate ملک، cash نقد";
}

function ai_output_schema(): string {
    return "فقط و فقط یک شیء JSON معتبر (بدون توضیح بیرون از JSON) با این ساختار بده:\n" . '{
  "summary": "چکیده ۳ تا ۵ جمله‌ای از وضعیت و استراتژی پیشنهادی",
  "regime": "تصویر رژیم بازار در ۲ جمله (تورم/دلار/ریسک جهانی)",
  "allocation": [{"cls":"gold","targetPct":20,"action":"افزایش","reason":"..."}],
  "opportunities": [{
     "assetId":"ir_gold18","title":"عنوان کوتاه فرصت","direction":"خرید پله‌ای | نگهداری | کاهش/خروج | رصد",
     "horizon":"کوتاه‌مدت | میان‌مدت | بلندمدت","confidence":0-100,"oppScore":0-100,
     "entry":"ناحیه ورود با عدد و واحد","stop":"حد ضرر با عدد و واحد","targets":["هدف ۱","هدف ۲"],
     "allocationPct":عدد,"whyLaggard":"چرا عقب مانده","rationale":["دلیل ۱","دلیل ۲"],
     "risks":["ریسک ۱"],"invalidation":"چه چیزی این تحلیل را باطل می‌کند"
  }],
  "rebalance": [{"from":"cls","to":"cls","pct":عدد,"note":"..."}],
  "watchlist": [{"assetId":"...","why":"..."}],
  "marketRisks": ["ریسک مهم بازار ۱"]
}
حداقل ۵ و حداکثر ۱۰ آیتم در opportunities بنویس. اعداد درصد را بدون علامت ٪ بده. همه اعداد قیمت باید از داده ورودی استخراج شوند.';
}

/* --------------------------------------------------- اجرای تحلیل خودکار */

function ai_run_auto(array $s, string $reason = 'manual'): array {
    $c = ai_cfg($s);
    if (!$c['apiKey'] && !$c['noKey']) throw new RuntimeException('ابتدا کلید API را در تب «هوش مصنوعی» ثبت کنید.');
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) {
        $snap = market_snapshot(false);
    }
    if (!is_array($snap) || empty($snap['assets'])) throw new RuntimeException('داده بازار هنوز آماده نیست؛ چند لحظه بعد دوباره تلاش کنید.');

    $ctx = ai_build_context($s);
    $messages = [
        ['role' => 'system', 'content' => ai_system_prompt($ctx)],
        ['role' => 'user', 'content' => ai_data_block($ctx) . "\n\n## خروجی مورد نیاز\n" . ai_output_schema()],
    ];
    $t0 = microtime(true);
    $out = ai_chat($c, $messages, 4000, 180);
    $parsed = ai_extract_json($out['text']);

    $result = ['ok' => true, 'model' => $out['model'], 'provider' => $c['label'],
        'durationMs' => (int) round((microtime(true) - $t0) * 1000),
        'raw' => $parsed ? null : mb_substr($out['text'], 0, 4000),
        'analysis' => $parsed,
        'engineSignals' => engine_generate_signals($s)['signals'],
        'marketUpdatedAt' => $snap['updatedAt'], 'reason' => $reason, 'at' => u_now_ms()];

    if ($parsed) {
        $byId = market_assets_index();
        $opps = [];
        foreach ($parsed['opportunities'] ?? [] as $o) {
            $id = $o['assetId'] ?? '';
            $a = $byId[$id] ?? null;
            $row = null;
            foreach ($snap['assets'] as $x) if ($x['id'] === $id) { $row = $x; break; }
            $o['name'] = $row['name'] ?? ($a['name'] ?? $id);
            $o['cls'] = $row['cls'] ?? ($a['cls'] ?? null);
            $o['clsFa'] = $row['clsFa'] ?? null;
            $o['region'] = $row['region'] ?? ($a['region'] ?? null);
            $o['unit'] = $row['unit'] ?? ($a['unit'] ?? null);
            $o['price'] = $row['metrics']['last'] ?? null;
            $o['metrics'] = $row ? [
                'r1m' => $row['metrics']['r1m'], 'r3m' => $row['metrics']['r3m'], 'r1y' => $row['metrics']['r1y'],
                'dd52' => $row['metrics']['dd52'], 'rsi14' => $row['metrics']['rsi14'], 'vol252' => $row['metrics']['vol252'],
                'lagScore' => $row['metrics']['lagScore'], 'oppScore' => $row['metrics']['oppScore'],
            ] : null;
            $o['sparkline'] = $row['sparkline'] ?? [];
            $o['valid'] = (bool) $row;
            $opps[] = $o;
        }
        $parsed['opportunities'] = $opps;
        $result['analysis'] = $parsed;

        $s = store_load();
        $s['ai']['lastRunAt'] = u_now_ms();
        $s['ai']['lastRunStatus'] = 'ok';
        $s['ai']['lastRunModel'] = $out['model'];
        $s['ai']['lastDurationMs'] = $result['durationMs'];
        store_save($s);
        cache_set(cache_user_key('lastAnalysis'), $result);
    } else {
        $s2 = store_load();
        $s2['ai']['lastRunAt'] = u_now_ms();
        $s2['ai']['lastRunStatus'] = 'parse-failed';
        store_save($s2);
        $result['analysis'] = null;
    }
    return $result;
}

function ai_last_analysis() { return cache_stale(cache_user_key('lastAnalysis')); }

function ai_chat_reply(array $s, string $message): array {
    $c = ai_cfg($s);
    if (!$c['apiKey'] && !$c['noKey']) throw new RuntimeException('ابتدا کلید API را در تب «هوش مصنوعی» ثبت کنید.');
    $ctx = ai_build_context($s);
    $messages = [['role' => 'system', 'content' => ai_system_prompt($ctx) .
        "\n\n## داده به‌روز بازار و پرتفوی\n" . ai_data_block($ctx) .
        "\n\nپاسخ‌ها را فارسی، کوتاه‌بند و با ذکر عدد بده. اگر لازم بود جدول مارک‌داون بزن."]];
    foreach (array_slice($s['chat'] ?? [], -8) as $h) {
        $messages[] = ['role' => ($h['role'] ?? 'user') === 'user' ? 'user' : 'assistant', 'content' => mb_substr((string) ($h['content'] ?? ''), 0, 4000)];
    }
    $messages[] = ['role' => 'user', 'content' => mb_substr($message, 0, 4000)];
    $out = ai_chat($c, $messages, 2000, 120);
    return ['text' => $out['text'], 'model' => $out['model'], 'at' => u_now_ms()];
}

function ai_test_connection(array $s): array {
    $c = ai_cfg($s);
    $r = ai_list_models($c);
    $chatOk = null; $chatErr = null;
    try {
        $out = ai_chat($c, [['role' => 'user', 'content' => 'فقط بنویس: آماده']], 20, 45);
        $chatOk = mb_substr($out['text'], 0, 120);
    } catch (Throwable $e) { $chatErr = $e->getMessage(); }
    $s2 = store_load();
    $s2['ai']['lastTestAt'] = u_now_ms();
    $s2['ai']['lastTestOk'] = !$chatErr;
    store_save($s2);
    return ['provider' => $c['label'], 'models' => count($r['models']), 'autoPick' => $r['auto'],
        'chatOk' => $chatOk, 'chatErr' => $chatErr, 'top' => array_slice($r['models'], 0, 12)];
}

/** حالت کاملاً خودکار: اگر زمانش رسیده باشد، تحلیل تازه می‌سازد (بدون cron) */
function ai_maybe_auto_run(array $s): ?array {
    if (empty($s['ai']['autoMode'])) return null;
    $c = ai_cfg($s);
    if (!$c['apiKey'] && !$c['noKey']) return null;
    $interval = max(5, (int) ($s['ai']['autoIntervalMin'] ?? 60)) * 60 * 1000;
    $last = (int) ($s['ai']['lastRunAt'] ?? 0);
    if ($last && (u_now_ms() - $last) < $interval) return null;
    $snap = cache_stale('market:snapshot');
    if (!is_array($snap) || empty($snap['assets'])) return null;
    // قفل ساده ضد اجرای همزمان
    $lockKey = cache_user_key('lock');
    $lock = cache_stale($lockKey);
    if ($lock && (u_now_ms() - (int) $lock) < 180000) return null;
    cache_set($lockKey, u_now_ms());
    try { return ai_run_auto($s, 'auto-schedule'); }
    catch (Throwable $e) {
        $s2 = store_load();
        $s2['ai']['lastRunStatus'] = 'error: ' . $e->getMessage();
        store_save($s2);
        return null;
    }
}
