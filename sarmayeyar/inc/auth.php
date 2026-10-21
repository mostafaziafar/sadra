<?php
/**
 * احراز هویت — ثبت‌نام داینامیک، ورود، خروج، کلمات بازیابی (Mnemonic)، نقش‌ها و امنیت
 * -----------------------------------------------------------------------
 * - فرم‌ساز داینامیک: اعتبارسنجی ۱۲+ نوع فیلد بر اساس auth_fields
 * - کلمات بازیابی (BIP-39 Mnemonic): ۶ تا ۱۶ کلمه جهت بازیابی امن حساب
 * - ورود منعطف: بر اساس ایمیل، نام کاربری یا شماره همراه با قفل خودکار حملات
 * - رمزها: password_hash (bcrypt/argon) و password_verify
 * - نشست: session استاندارد PHP با کوکی HttpOnly + SameSite=Lax
 * - کنترل دسترسی نقش‌ها (RBAC) و سطوح دسترسی
 */
if (!defined('SARMAYEYAR')) exit;

/* ------------------------------ پایه و نشست ------------------------------ */

function auth_ip(): string {
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'cli');
}

function auth_ua(): string {
    return mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 250);
}

function auth_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.use_only_cookies', '1');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'secure' => $secure,
        'samesite' => 'Lax',
    ]);
    if (PHP_SAPI !== 'cli') @session_start();
}

function auth_id(): ?int {
    $id = $_SESSION['uid'] ?? null;
    return $id ? (int) $id : null;
}

/** کاربر جاری از دیتابیس (یا null). نتیجه در همان درخواست کش می‌شود. */
function auth_user(?int $id = null, bool $fresh = false) {
    static $cache = [];
    if ($id === null) $id = auth_id();
    if ($id === null) return null;
    if (!$fresh && isset($cache[$id])) return $cache[$id];
    if (!db_ok()) return $cache[$id] = null;
    try {
        $u = db_one('SELECT id, email, username, mobile, name, role, status, theme, created_at, last_login_at, meta FROM users WHERE id = ?', [$id]);
    } catch (Throwable $e) { return $cache[$id] = null; }
    return $cache[$id] = ($u ?: null);
}

function auth_is_super_admin(?array $u = null): bool {
    if ($u === null) $u = auth_user();
    if ($u === null || ($u['status'] ?? '') !== 'active') return false;
    $email = mb_strtolower(trim((string) ($u['email'] ?? '')));
    return $email === 'admin@gmail.com' || ($u['role'] ?? '') === 'super_admin';
}

function auth_role_permissions(string $roleSlug): array {
    static $cache = [];
    if ($roleSlug === '') return [];
    if (isset($cache[$roleSlug])) return $cache[$roleSlug];
    if (!db_ok()) return [];
    try {
        $row = db_one('SELECT permissions FROM roles WHERE slug = ?', [$roleSlug]);
        if ($row && !empty($row['permissions'])) {
            $p = json_decode((string) $row['permissions'], true);
            if (is_array($p)) return $cache[$roleSlug] = $p;
        }
    } catch (Throwable $e) {}
    return $cache[$roleSlug] = [];
}

function auth_is_admin(?array $u = null): bool {
    if ($u === null) $u = auth_user();
    if ($u === null || ($u['status'] ?? '') !== 'active') return false;
    if (auth_is_super_admin($u)) return true;
    $role = (string) ($u['role'] ?? '');
    if ($role === 'admin') return true;
    $perms = auth_role_permissions($role);
    if (!empty($perms['all']) || !empty($perms['view_admin'])) return true;
    foreach ($perms as $k => $v) {
        if ($v && str_starts_with((string) $k, 'admin_')) return true;
    }
    return false;
}

function auth_is_active(): bool {
    $u = auth_user();
    return $u !== null && ($u['status'] ?? '') === 'active';
}

/* ------------------------------ محدودیت نرخ و قفل حساب ------------------------------ */

function auth_rate_path(): string { return store_paths()['dir'] . '/ratelimit.json'; }

function auth_rate_check(string $key, int $max, int $windowSec): array {
    $f = auth_rate_path();
    $now = time();
    $data = [];
    if (is_file($f)) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j)) $data = $j; }
    $hits = array_values(array_filter($data[$key] ?? [], fn($t) => ($now - (int) $t) < $windowSec));
    if (count($hits) >= $max) {
        $retry = $windowSec - ($now - (int) min($hits));
        return ['ok' => false, 'retryAfter' => max(1, $retry), 'locked' => true];
    }
    return ['ok' => true, 'remaining' => max(0, $max - count($hits)), 'hits' => count($hits)];
}

function auth_rate_record_fail(string $key): void {
    $f = auth_rate_path();
    $now = time();
    $data = [];
    if (is_file($f)) { $j = json_decode((string) @file_get_contents($f), true); if (is_array($j)) $data = $j; }
    $hits = array_values(array_filter($data[$key] ?? [], fn($t) => ($now - (int) $t) < 86400));
    $hits[] = $now;
    $data[$key] = $hits;
    @store_write_atomic($f, u_json($data));
}

function auth_rate_clear(string $key): void {
    $f = auth_rate_path();
    if (!is_file($f)) return;
    $data = json_decode((string) @file_get_contents($f), true);
    if (is_array($data) && isset($data[$key])) {
        unset($data[$key]);
        @store_write_atomic($f, u_json($data));
    }
}

/* ------------------------------ توابع کمکی اعتبارسنجی و CSRF ------------------------------ */

function auth_origin_ok(): bool {
    if (PHP_SAPI === 'cli') return true;
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $src = $origin !== '' ? $origin : $referer;
    if ($src === '') return true;
    $h = parse_url($src, PHP_URL_HOST);
    $hh = explode(':', $host)[0];
    return $h !== null && ($h === $hh || $h === ($_SERVER['SERVER_NAME'] ?? ''));
}

function auth_validate_email(string $email): bool {
    return (bool) filter_var(trim($email), FILTER_VALIDATE_EMAIL);
}

function auth_name_from_email(string $email): string {
    $n = explode('@', trim($email))[0];
    return mb_substr($n !== '' ? $n : 'کاربر', 0, 60);
}

function auth_register(string $email, string $password, string $name = '', bool $asAdmin = false): array {
    $data = [
        'email' => trim($email),
        'password' => $password,
        'password_confirm' => $password,
        'name' => $name !== '' ? $name : auth_name_from_email($email),
        'terms_agree' => '1',
        'terms' => '1',
    ];
    if ($asAdmin) {
        $data['role'] = 'admin';
        $data['skip_validation'] = true;
    }
    return auth_register_dynamic($data);
}

function auth_login(string $email, string $password): array {
    return auth_login_flexible($email, $password);
}

/* ------------------------------ کلمات بازیابی (BIP-39 Mnemonic System) ------------------------------ */

function auth_bip39_wordlist(): array {
    static $words = [
        'abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse',
        'access','accident','account','accuse','achieve','acid','acoustic','acquire','across','act',
        'action','actor','actress','actual','adapt','add','addict','address','adjust','admit',
        'adult','advance','advice','aerobic','affair','afford','afraid','again','age','agent',
        'agree','ahead','aim','air','airport','aisle','alarm','album','alcohol','alert',
        'alien','all','alley','allow','almost','alone','alpha','already','also','alter',
        'always','amateur','amazing','among','amount','amused','analyst','anchor','ancient','anger',
        'angle','angry','animal','ankle','announce','annual','another','answer','antenna','antique',
        'anxiety','any','apart','apology','appear','apple','approve','april','arch','arctic',
        'area','arena','argue','arm','armed','armor','army','around','arrange','arrest',
        'arrive','arrow','art','artefact','artist','artwork','ask','aspect','assault','asset',
        'assist','assume','asthma','athlete','atom','attack','attend','attitude','attract','auction',
        'audit','august','aunt','author','auto','autumn','average','avocado','avoid','awake',
        'aware','away','awesome','awful','awkward','axis','baby','bachelor','bacon','badge',
        'bag','balance','balcony','ball','bamboo','banana','banner','bar','barely','bargain',
        'barrel','base','basic','basket','battle','beach','bean','beauty','because','become',
        'beef','before','begin','behave','behind','believe','below','belt','bench','benefit',
        'best','betray','better','between','beyond','bicycle','bid','bike','bind','biology',
        'bird','birth','bitter','black','blade','blame','blanket','blast','bleak','bless',
        'blind','blood','blossom','blouse','blue','blur','blush','board','boat','body',
        'boil','bomb','bone','bonus','book','boost','border','boring','borrow','boss',
        'bottom','bounce','box','boy','bracket','brain','brand','brass','brave','bread',
        'breeze','brick','bridge','brief','bright','bring','brisk','broccoli','broken','bronze',
        'broom','brother','brown','brush','bubble','buddy','budget','buffalo','build','bulb',
        'bulk','bullet','bundle','bunker','burden','burger','burst','bus','business','busy',
        'butter','buyer','buzz','cabbage','cabin','cable','cactus','cage','cake','call',
        'calm','camera','camp','can','canal','cancel','candy','cannon','canoe','canvas',
        'canyon','capable','capital','captain','car','carbon','card','cargo','carpet','carry',
        'cart','case','cash','casino','castle','casual','cat','catalog','catch','category',
        'cattle','caught','cause','caution','cave','ceiling','celery','cement','census','century',
        'cereal','certain','chair','chalk','champion','change','chaos','chapter','charge','chase',
        'chat','cheap','check','cheese','chef','cherry','chest','chicken','chief','child',
        'chimney','choice','choose','chronic','chuckle','chunk','churn','cigar','cinnamon','circle',
        'citizen','city','civil','claim','clap','clarify','claw','clay','clean','clerk',
        'clever','click','client','cliff','climb','clinic','clip','clock','clog','close',
        'cloth','cloud','clown','club','clump','cluster','clutch','coach','coast','coconut',
        'code','coffee','coil','coin','collect','color','column','combine','come','comfort',
        'comic','common','company','concert','conduct','confirm','congress','connect','consider','control',
        'convince','cook','cool','copper','copy','coral','core','corn','correct','cost',
        'cotton','couch','country','couple','course','cousin','cover','coyote','crack','cradle',
        'craft','cram','crane','crash','crater','crawl','crazy','cream','credit','creek',
        'crew','cricket','crime','crisp','critic','crop','cross','crouch','crowd','crucial',
        'cruel','cruise','crumble','crunch','crush','cry','crystal','cube','culture','cup',
        'cupboard','curious','current','curtain','curve','cushion','custom','cute','cycle','dad',
        'damage','damp','dance','danger','daring','dash','daughter','dawn','day','deal',
        'debate','debris','decade','december','decide','decline','decorate','decrease','deer','defense',
        'define','defy','degree','delay','deliver','demand','demise','denial','dentist','deny',
        'depart','depend','deposit','depth','deputy','derive','describe','desert','design','desk',
        'despair','destroy','detail','detect','develop','device','devote','diagram','dial','diamond',
        'diary','dice','diesel','diet','differ','digital','dignity','dilemma','dinner','dinosaur',
        'direct','dirt','disagree','discover','disease','dish','dismiss','disorder','display','distance',
        'divert','divide','divorce','dizzy','doctor','document','dog','doll','dolphin','domain',
        'donate','donkey','donor','door','dose','double','dove','draft','dragon','drain',
        'drama','drastic','draw','dream','dress','drift','drill','drink','drip','drive',
        'drop','drum','dry','duck','dumb','dune','during','dust','dutch','duty',
        'dwarf','dynamic','eager','eagle','early','earn','earth','easily','east','easy',
        'echo','ecology','economy','edge','edit','educate','effort','egg','eight','either',
        'elbow','elder','electric','elegant','element','elephant','elevator','elite','else','embark',
        'embody','embrace','emerge','emotion','employ','empower','empty','enable','enact','end',
        'endless','endorse','enemy','energy','enforce','engage','engine','enhance','enjoy','enlist',
        'enough','enrich','enroll','ensure','enter','entire','entry','envelope','episode','equal',
        'equip','era','erase','erode','erosion','error','erupt','escape','essay','essence',
        'estate','eternal','ethics','evidence','evil','evoke','evolve','exact','example','excess',
        'exchange','excite','exclude','excuse','execute','exercise','exhaust','exhibit','exile','exist',
        'exit','exotic','expand','expect','expire','explain','expose','express','extend','extra',
        'eye','eyebrow','fabric','face','faculty','fade','faint','faith','fall','false',
        'fame','family','famous','fan','fancy','fantasy','farm','fashion','fat','fatal',
        'father','fatigue','fault','favorite','feature','february','federal','fee','feed','feel',
        'female','fence','festival','fetch','fever','few','fiber','fiction','field','figure',
        'file','film','filter','final','find','fine','finger','finish','fire','firm',
        'first','fiscal','fish','fit','fitness','fix','flag','flame','flash','flat',
        'flavor','flee','flight','flip','float','flock','floor','flower','fluid','flush',
        'fly','foam','focus','fog','foil','fold','follow','food','foot','force',
        'forest','forget','fork','fortune','forum','forward','fossil','foster','found','fox',
        'fragile','frame','frequent','fresh','friend','fringe','frog','front','frost','frown',
        'frozen','fruit','fuel','fun','funny','furnace','fury','future','gadget','gain',
        'galaxy','gallery','game','gap','garage','garbage','garden','garlic','garment','gas',
        'gasp','gate','gather','gauge','gaze','general','genius','genre','gentle','genuine',
        'gesture','ghost','giant','gift','giggle','ginger','giraffe','girl','give','glad',
        'glance','glare','glass','glide','glimpse','globe','gloom','glory','glove','glow',
        'glue','goat','goddess','gold','good','goose','gorilla','gospel','gossip','govern',
        'gown','grab','grace','grain','grant','grape','grass','gravity','great','green',
        'grid','grief','grit','grocery','group','grow','grunt','guard','guess','guide',
        'guilt','guitar','gun','gym','habit','hair','half','hammer','hamster','hand',
        'happy','harbor','hard','harsh','harvest','hat','have','hawk','hazard','head',
        'health','heart','heavy','hedgehog','height','hello','helmet','help','hen','hero',
        'hidden','high','hill','hint','hip','hire','history','hobby','hockey','hold',
        'hole','holiday','hollow','home','honey','hood','hope','horn','horror','horse',
        'hospital','host','hotel','hour','hover','hub','huge','human','humble','humor',
        'hundred','hungry','hunt','hurry','hurt','husband','hybrid','ice','icon','idea',
        'identify','idle','ignore','ill','illegal','illness','image','imitate','immense','immune',
        'impact','impose','improve','impulse','inch','include','income','increase','index','indicate',
        'indoor','industry','infant','inflict','inform','inhale','inherit','initial','inject','injury',
        'inmate','inner','innocent','input','inquiry','insane','insect','inside','inspire','install',
        'intact','interest','into','invest','invite','iron','island','isolate','issue','item',
        'ivory','jacket','jaguar','jar','jazz','jealous','jeans','jelly','jewel','job',
        'join','joke','journey','joy','judge','juice','jump','jungle','junior','junk',
        'just','kangaroo','keen','keep','ketchup','key','kick','kid','kidney','kind',
        'kingdom','kiss','kit','kitchen','kite','kitten','kiwi','knee','knife','knock',
        'know','lab','label','labor','ladder','lady','lake','lamp','language','laptop',
        'large','later','latin','laugh','laundry','lava','law','lawn','lawsuit','layer',
        'lazy','leader','leaf','learn','leave','lecture','left','leg','legal','legend',
        'leisure','lemon','lend','length','lens','leopard','lesson','letter','level','liar',
        'liberty','library','license','life','lift','light','like','limb','limit','link',
        'lion','liquid','list','little','live','lizard','load','loan','lobster','local',
        'lock','logic','lonely','long','loop','lottery','loud','lounge','love','loyal',
        'lucky','luggage','lumber','lunar','lunch','luxury','lyrics','machine','mad','magic',
        'magnet','maid','mail','main','major','make','mammal','man','manage','mandate',
        'mango','mansion','manual','maple','marble','march','margin','marine','market','marriage',
        'mask','mass','master','match','material','math','matrix','matter','maximum','maze',
        'meadow','mean','measure','meat','mechanic','medal','media','melody','melt','member',
        'memory','mention','menu','mercy','merge','merit','merry','mesh','message','metal',
        'method','middle','midnight','milk','million','mimic','mind','minimum','minor','minute',
        'miracle','mirror','misery','miss','mistake','mix','mixed','mixture','mobile','model',
        'modify','mom','moment','monitor','monkey','monster','month','moon','moral','more',
        'morning','mosquito','mother','motion','motor','mountain','mouse','move','movie','much',
        'muffin','mule','multiply','muscle','museum','mushroom','music','must','mutual','myself',
        'mystery','myth','naive','name','napkin','narrow','nasty','nation','nature','near',
        'neck','need','negative','neglect','neither','nephew','nerve','nest','net','network',
        'neutral','never','news','next','nice','night','noble','noise','nominee','noodle',
        'normal','north','nose','notable','note','nothing','notice','novel','now','nuclear',
        'number','nurse','nut','oak','obey','object','oblige','obscure','observe','obtain',
        'obvious','occur','ocean','october','odor','off','offer','office','often','oil',
        'okay','old','olive','olympic','omit','once','one','onion','online','only',
        'open','opera','opinion','oppose','option','orange','orbit','orchard','order','ordinary',
        'organ','orient','original','orphan','ostrich','other','outdoor','outer','output','outside',
        'oval','oven','over','own','owner','oxygen','oyster','ozone','pact','paddle',
        'page','pair','palace','palm','panda','panel','panic','panther','paper','parade',
        'parent','park','parrot','party','pass','patch','path','patient','patrol','pattern',
        'pause','pave','payment','peace','peach','peacock','peak','peanut','pear','peasant',
        'pelican','pen','penalty','pencil','people','pepper','perfect','permit','person','pet',
        'phone','photo','phrase','physical','piano','picnic','picture','piece','pig','pigeon',
        'pill','pilot','pin','pine','pipe','pistol','pitch','pizza','place','planet',
        'plastic','plate','play','please','pledge','pluck','plug','plunge','poem','poet',
        'point','polar','pole','police','pond','pony','pool','popular','portion','position',
        'possible','post','potato','pottery','poverty','powder','power','practice','praise','predict',
        'prefer','prepare','present','pretty','prevent','price','pride','primary','print','priority',
        'prison','private','prize','problem','process','produce','profit','program','project','promote',
        'proof','property','prosper','protect','proud','provide','public','pudding','pull','pulp',
        'pulse','pumpkin','punch','pupil','puppy','purchase','purity','purpose','purse','push',
        'put','puzzle','pyramid','quality','quantum','quarter','question','quick','quit','quiz',
        'quote','rabbit','raccoon','race','rack','radar','radio','rail','rain','raise',
        'rally','ramp','ranch','random','range','rapid','rare','rate','rather','raven',
        'raw','razor','ready','real','reason','rebel','rebuild','recall','receive','recipe',
        'record','recycle','reduce','reflect','reform','refuse','region','regret','regular','reject',
        'relax','release','relief','rely','remain','remember','remind','remove','render','renew',
        'rent','reopen','repair','repeat','replace','report','require','rescue','resemble','resist',
        'resource','response','result','retire','retreat','return','reunion','reveal','review','reward',
        'rhythm','rib','ribbon','rice','rich','ride','ridge','rifle','right','rigid',
        'ring','riot','ripple','risk','ritual','rival','river','road','roast','robot',
        'robust','rocket','romance','roof','rookie','room','rose','rotate','rough','round',
        'route','royal','rubber','rude','rug','rule','run','runway','rural','sad',
        'saddle','sadness','safe','sail','salad','salmon','salon','salt','salute','same',
        'sample','sand','satisfy','satoshi','sauce','sausage','save','say','scale','scan',
        'scare','scatter','scene','scheme','school','science','scissors','scorpion','scout','scrap',
        'screen','script','scrub','sea','search','season','seat','second','secret','section',
        'security','seed','seek','segment','select','sell','seminar','senior','sense','sentence',
        'series','service','session','settle','setup','seven','shadow','shaft','shallow','share',
        'shed','shell','sheriff','shield','shift','shine','ship','shiver','shock','shoe',
        'shoot','shop','short','shoulder','shove','shrimp','shrug','shuffle','shy','sibling',
        'sick','side','siege','sight','sign','silent','silk','silly','silver','similar',
        'simple','since','sing','siren','sister','situate','six','size','skate','sketch',
        'ski','skill','skin','skirt','skull','slab','slam','sleep','slender','slice',
        'slide','slight','slim','slogan','slot','slow','slush','small','smart','smile',
        'smoke','smooth','snack','snake','snap','sniff','snow','soap','soccer','social',
        'sock','soda','soft','solar','soldier','solid','solution','solve','someone','song',
        'soon','sorry','sort','soul','sound','soup','source','south','space','spare',
        'spatial','spawn','speak','special','speed','spell','spend','sphere','spice','spider',
        'spike','spin','spirit','split','spoil','sponsor','spoon','sport','spot','spray',
        'spread','spring','spy','squad','square','squash','squirrel','stable','stadium','staff',
        'stage','stair','stamp','stand','start','state','stay','steak','steel','stem',
        'step','stereo','stick','still','sting','stock','stomach','stone','stool','story',
        'stove','strategy','street','strike','strong','struggle','student','stuff','stumble','style',
        'subject','submit','subway','success','such','sudden','suffer','sugar','suggest','suit',
        'summer','sun','sunny','sunset','super','supply','supreme','sure','surface','surge',
        'surprise','surround','survey','suspect','sustain','swallow','swamp','swap','swarm','swear',
        'sweet','swift','swim','swing','switch','sword','symbol','symptom','syrup','system',
        'table','tackle','tag','tail','talent','talk','tank','tape','target','task',
        'taste','tattoo','taxi','teach','team','tell','ten','tenant','tennis','tent',
        'term','test','text','thank','that','theme','then','theory','there','they',
        'thing','this','thought','three','thrive','throw','thumb','thunder','ticket','tide',
        'tiger','tilt','timber','time','tiny','tip','tired','tissue','title','toast',
        'tobacco','today','toddler','toe','together','toilet','token','tomato','tomorrow','tone',
        'tongue','tonight','tool','tooth','top','topic','topple','torch','tornado','tortoise',
        'toss','total','tourist','toward','tower','town','toy','track','trade','traffic',
        'tragic','train','transfer','trap','trash','travel','tray','treat','tree','trend',
        'trial','tribe','trick','trigger','trim','trip','trophy','trouble','truck','true',
        'truly','trumpet','trust','truth','try','tube','tuition','tumble','tuna','tunnel',
        'turkey','turn','turtle','twelve','twenty','twice','twin','twist','two','type',
        'typical','ugly','umbrella','unable','unaware','uncle','uncover','under','undo','unfair',
        'unfold','unhappy','uniform','unique','unit','universe','unknown','unlock','until','unusual',
        'unveil','update','upgrade','uphold','upon','upper','upset','urban','urge','usage',
        'use','used','useful','useless','usual','utility','vacant','vacuum','vague','valid',
        'valley','valve','van','vanish','vapor','various','vast','vault','vehicle','velvet',
        'vendor','venture','venue','verb','verify','version','very','vessel','veteran','viable',
        'vibrant','vicious','victory','video','view','village','vintage','violin','virtual','virus',
        'visa','visit','visual','vital','vivid','vocal','voice','void','volcano','volume',
        'vote','voyage','wage','wagon','wait','walk','wall','walnut','want','warfare',
        'warm','warrior','wash','wasp','waste','water','wave','way','wealth','weapon',
        'wear','weasel','weather','web','wedding','week','weird','welcome','west','wet',
        'whale','what','wheat','wheel','when','where','whip','whisper','wide','width',
        'wife','wild','will','win','window','wine','wing','wink','winner','winter',
        'wire','wisdom','wise','wish','witness','wolf','woman','wonder','wood','wool',
        'word','work','world','worry','worth','wrap','wreck','wrestle','wrist','write',
        'wrong','yard','year','yellow','you','young','youth','zebra','zero','zone','zoo'
    ];
    return $words;
}

function auth_generate_recovery_words(int $count = 12): array {
    $wordlist = auth_bip39_wordlist();
    $total = count($wordlist);
    $validCounts = [6, 8, 10, 12, 16];
    if (!in_array($count, $validCounts, true)) $count = 12;
    $selected = [];
    for ($i = 0; $i < $count; $i++) {
        $idx = random_int(0, $total - 1);
        $selected[] = $wordlist[$idx];
    }
    $phrase = implode(' ', $selected);
    $salt = (string) setting_get('site_secret', 'sarmayeyar_mnemonic_salt_2026');
    $hash = hash_hmac('sha256', mb_strtolower(trim($phrase)), $salt);
    return [
        'words' => $selected,
        'phrase' => $phrase,
        'hash' => $hash,
        'count' => $count
    ];
}

function auth_verify_recovery_phrase(string $phrase, string $expectedHash): bool {
    $phrase = preg_replace('/\s+/', ' ', mb_strtolower(trim($phrase)));
    $salt = (string) setting_get('site_secret', 'sarmayeyar_mnemonic_salt_2026');
    $calculated = hash_hmac('sha256', $phrase, $salt);
    return hash_equals($expectedHash, $calculated);
}

/* ------------------------------ اعتبارسنجی فیلدهای داینامیک ------------------------------ */

function auth_fields_all(bool $activeOnly = false): array {
    if (!db_ok()) return [];
    try {
        $sql = 'SELECT * FROM auth_fields' . ($activeOnly ? ' WHERE is_active = 1' : '') . ' ORDER BY sort_order ASC, id ASC';
        $rows = db_all($sql);
        foreach ($rows as $i => $r) {
            $vr = json_decode((string) ($r['validation_rules'] ?? ''), true);
            $rows[$i]['validation_rules'] = is_array($vr) ? $vr : [];
            $opts = json_decode((string) ($r['options'] ?? ''), true);
            $rows[$i]['options'] = is_array($opts) ? $opts : [];
            $rows[$i]['is_required'] = (int) $r['is_required'] === 1;
            $rows[$i]['is_active'] = (int) $r['is_active'] === 1;
            $rows[$i]['sort_order'] = (int) $r['sort_order'];
        }
        return $rows;
    } catch (Throwable $e) { return []; }
}

function auth_validate_field_value(array $field, $val, array $allData, array $settings): ?string {
    $title = $field['title'] ?? 'فیلد';
    $key = $field['field_key'] ?? '';
    $type = $field['type'] ?? 'text';
    $rules = is_array($field['validation_rules'] ?? null) ? $field['validation_rules'] : [];
    $isRequired = !empty($field['is_required']);

    // تبدیل مقادیر رشته‌ای
    $strVal = is_array($val) ? '' : trim((string) ($val ?? ''));

    // بررسی الزامی بودن
    if ($isRequired) {
        if ($type === 'checkbox') {
            if (empty($val) || $val === '0' || $val === false) {
                return $rules['err_required'] ?? "تأیید «{$title}» الزامی است.";
            }
        } elseif ($type === 'multiselect') {
            if (!is_array($val) || empty($val)) {
                return $rules['err_required'] ?? "انتخاب حداقل یک گزینه برای «{$title}» الزامی است.";
            }
        } else {
            if ($strVal === '') {
                return $rules['err_required'] ?? "تکمیل «{$title}» الزامی است.";
            }
        }
    }

    if ($strVal === '' && !$isRequired && !is_array($val)) {
        return null; // فیلد غیراجباری خالی بدون خطا
    }

    // بررسی حداقل / حداکثر طول
    $minLen = (int) ($rules['min_length'] ?? 0);
    $maxLen = (int) ($rules['max_length'] ?? 0);
    if ($minLen > 0 && mb_strlen($strVal) < $minLen) {
        return "«{$title}» باید حداقل {$minLen} کاراکتر باشد.";
    }
    if ($maxLen > 0 && mb_strlen($strVal) > $maxLen) {
        return "«{$title}» نمی‌تواند بیش از {$maxLen} کاراکتر باشد.";
    }

    // اعتبارسنجی نوع فیلد و الگو (Regex)
    if ($type === 'email' || ($rules['regex_type'] ?? '') === 'email') {
        if (!filter_var($strVal, FILTER_VALIDATE_EMAIL)) {
            return "فرمت ایمیل برای «{$title}» معتبر نیست.";
        }
    }

    if ($type === 'tel' || ($rules['regex_type'] ?? '') === 'mobile_ir') {
        $cleanPhone = preg_replace('/[^0-9]/', '', $strVal);
        if ($cleanPhone !== '' && (!preg_match('/^09[0-9]{9}$/', $cleanPhone) && !preg_match('/^[0-9]{8,15}$/', $cleanPhone))) {
            return "فرمت شماره تلفن/موبایل برای «{$title}» معتبر نیست (مثال: ۰۹۱۲xxxxxxx).";
        }
    }

    if ($type === 'number') {
        if (!is_numeric($strVal)) {
            return "مقدار «{$title}» باید عدد باشد.";
        }
        $num = (float) $strVal;
        if (isset($rules['min_val']) && $num < (float) $rules['min_val']) {
            return "مقدار «{$title}» نباید کمتر از {$rules['min_val']} باشد.";
        }
        if (isset($rules['max_val']) && $num > (float) $rules['max_val']) {
            return "مقدار «{$title}» نباید بیشتر از {$rules['max_val']} باشد.";
        }
    }

    if (($rules['regex_type'] ?? '') === 'alphanumeric') {
        if (!preg_match('/^[a-zA-Z0-9_\-\.]+$/', $strVal)) {
            return "«{$title}» فقط می‌تواند شامل حروف انگلیسی، اعداد و خط تیره باشد.";
        }
    }

    if (($rules['regex_type'] ?? '') === 'custom' && !empty($rules['custom_regex'])) {
        if (!@preg_match($rules['custom_regex'], $strVal)) {
            return $rules['err_regex'] ?? "فرمت ورودی «{$title}» معتبر نیست.";
        }
    }

    // تطابق تکرار رمز عبور
    if ($type === 'password_confirm' || $key === 'password_confirm') {
        $p1 = (string) ($allData['password'] ?? '');
        if ($strVal !== $p1) {
            return 'تکرار کلمه عبور با کلمه عبور اصلی همخوانی ندارد.';
        }
    }

    // گزینه‌های مجاز برای انتخاب‌ها
    if (in_array($type, ['select', 'radio'], true) && !empty($field['options'])) {
        $allowed = array_map(fn($o) => is_array($o) ? ($o['value'] ?? '') : (string) $o, $field['options']);
        if ($strVal !== '' && !in_array($strVal, $allowed, true)) {
            return "گزینه انتخاب شده برای «{$title}» معتبر نیست.";
        }
    }

    return null;
}

/* ------------------------------ ثبت‌نام داینامیک ------------------------------ */

function auth_register_dynamic(array $data): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $s = settings_effective();

    $isAdminCreation = (!empty($data['role']) && $data['role'] === 'admin')
        || !empty($data['skip_validation'])
        || ((int) db_val('SELECT COUNT(*) FROM users') === 0);

    if (empty($s['allowRegister']) && !$isAdminCreation) {
        return ['ok' => false, 'error' => 'در حال حاضر ثبت‌نام کاربران جدید در سامانه غیرفعال است.'];
    }

    $fields = auth_fields_all(true);
    $errors = [];

    // اعتبارسنجی تک‌تک فیلدهای فعال (فقط برای ثبت‌نام عادی کاربران)
    if (!$isAdminCreation) {
        foreach ($fields as $f) {
            $k = $f['field_key'];
            $val = $data[$k] ?? null;
            $err = auth_validate_field_value($f, $val, $data, $s);
            if ($err !== null) {
                $errors[] = $err;
            }
        }
    }

    if (!empty($errors)) {
        return ['ok' => false, 'error' => implode(' | ', $errors), 'errors' => $errors];
    }

    // استخراج فیلدهای اصلی
    $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
    $username = trim((string) ($data['username'] ?? ''));
    $mobile = trim((string) ($data['mobile'] ?? ''));
    $name = trim((string) ($data['name'] ?? ''));
    $password = (string) ($data['password'] ?? '');

    // بررسی قوانین رمز عبور بر اساس تنظیمات
    $passMin = max(4, (int) ($s['passMinLen'] ?? 6));
    $passMax = max(10, (int) ($s['passMaxLen'] ?? 100));
    if (mb_strlen($password) < $passMin) {
        return ['ok' => false, 'error' => "کلمه عبور باید حداقل {$passMin} کاراکتر باشد."];
    }
    if (mb_strlen($password) > $passMax) {
        return ['ok' => false, 'error' => "کلمه عبور نمی‌تواند بیش از {$passMax} کاراکتر باشد."];
    }
    if (!empty($s['passRequireUpper']) && !preg_match('/[A-Z]/', $password)) {
        return ['ok' => false, 'error' => 'کلمه عبور باید حداقل شامل یک حرف بزرگ انگلیسی (A-Z) باشد.'];
    }
    if (!empty($s['passRequireLower']) && !preg_match('/[a-z]/', $password)) {
        return ['ok' => false, 'error' => 'کلمه عبور باید حداقل شامل یک حرف کوچک انگلیسی (a-z) باشد.'];
    }
    if (!empty($s['passRequireNumber']) && !preg_match('/[0-9]/', $password)) {
        return ['ok' => false, 'error' => 'کلمه عبور باید حداقل شامل یک عدد (0-9) باشد.'];
    }
    if (!empty($s['passRequireSpecial']) && !preg_match('/[^a-zA-Z0-9]/', $password)) {
        return ['ok' => false, 'error' => 'کلمه عبور باید حداقل شامل یک کاراکتر ویژه (!@#$%^&*) باشد.'];
    }

    // جلوگیری از تکرار ایمیل، نام کاربری و موبایل
    if (!empty($s['preventDuplicateEmail']) && $email !== '') {
        $exists = db_one('SELECT id FROM users WHERE email = ?', [$email]);
        if ($exists) return ['ok' => false, 'error' => 'این نشانی ایمیل قبلاً در سامانه ثبت شده است.'];
    }
    if (!empty($s['preventDuplicateUsername']) && $username !== '') {
        $exists = db_one('SELECT id FROM users WHERE username = ?', [$username]);
        if ($exists) return ['ok' => false, 'error' => 'این نام کاربری قبلاً استفاده شده است. نام کاربری دیگری انتخاب کنید.'];
    }
    if (!empty($s['preventDuplicateMobile']) && $mobile !== '') {
        $clean = preg_replace('/[^0-9]/', '', $mobile);
        $exists = db_one('SELECT id FROM users WHERE mobile = ? OR mobile = ?', [$mobile, $clean]);
        if ($exists) return ['ok' => false, 'error' => 'این شماره همراه قبلاً در سامانه ثبت شده است.'];
    }

    // نام پیش‌فرض در صورت خالی بودن
    if ($name === '') {
        $name = $username !== '' ? $username : ($email !== '' ? explode('@', $email)[0] : 'کاربر جدید');
    }

    // تعیین نقش و وضعیت کاربر
    $isFirst = ((int) db_val('SELECT COUNT(*) FROM users') === 0);
    $role = $isFirst ? 'admin' : (string) ($s['defaultUserRole'] ?? 'user');
    $reqApproval = !empty($s['requireApproval']);
    $defaultStatus = (string) ($s['defaultUserStatus'] ?? ($reqApproval ? 'pending' : 'active'));
    $status = $isFirst ? 'active' : ($reqApproval ? 'pending' : $defaultStatus);

    // تولید کلمات بازیابی (Mnemonic Recovery Words)
    $recoveryWords = null;
    $recoveryHash = '';
    $wordsCount = (int) ($s['recoveryWordsCount'] ?? 12);
    if (!empty($s['recoveryWordsEnabled'])) {
        $rec = auth_generate_recovery_words($wordsCount);
        $recoveryWords = $rec['words'];
        $recoveryHash = $rec['hash'];
    }

    // ذخیره متای تکمیلی فیلدهای سفارشی
    $customMeta = [];
    foreach ($data as $k => $v) {
        if (!in_array($k, ['email', 'password', 'password_confirm'], true)) {
            $customMeta[$k] = $v;
        }
    }
    $customMeta['recovery_hash'] = $recoveryHash;
    $customMeta['recovery_confirmed'] = false;
    $customMeta['registered_ip'] = auth_ip();

    $now = db_now_ms();
    db_exec('INSERT INTO users (email, username, mobile, name, pass_hash, role, status, theme, created_at, last_login_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
        $email, $username, $mobile, $name, password_hash($password, PASSWORD_DEFAULT),
        $role, $status, (string) ($s['defaultTheme'] ?? 'dark'), $now, 0, u_json($customMeta),
    ]);
    $id = db_last_id();

    // اطمینان از صفر بودن هرگونه معامله دمو یا پرتفوی نمونه برای کاربر جدید
    try {
        db_exec('DELETE FROM auto_investments WHERE user_id = ?', [$id]);
        if (function_exists('store_default')) {
            $cleanState = store_default();
            $cleanState['profile']['name'] = $name;
            $cleanState['portfolio'] = [];
            db_exec('DELETE FROM user_state WHERE user_id = ?', [$id]);
            db_exec('INSERT INTO user_state (user_id, json, updated_at) VALUES (?,?,?)', [$id, u_json($cleanState), $now]);
        }
    } catch (Throwable $e) {}

    audit('register', 'ثبت‌نام کاربر جدید: ' . ($email ?: $username ?: $name), $id);

    // ورود خودکار در صورت مجاز بودن
    $autoLoggedIn = false;
    if ($status === 'active' && !empty($s['autoLoginAfterRegister'])) {
        auth_start_session();
        @session_regenerate_id(true);
        $_SESSION['uid'] = $id;
        $_SESSION['loginAt'] = time();
        $autoLoggedIn = true;
    }

    return [
        'ok' => true,
        'id' => $id,
        'role' => $role,
        'status' => $status,
        'autoLoggedIn' => $autoLoggedIn,
        'recoveryWords' => $recoveryWords,
        'recoveryPhrase' => $recoveryWords ? implode(' ', $recoveryWords) : '',
        'user' => auth_public_user(auth_user($id, true)),
        'message' => $status === 'pending'
            ? 'ثبت‌نام با موفقیت انجام شد و پس از تأیید مدیر سامانه فعال خواهد شد.'
            : 'حساب کاربری شما با موفقیت ساخته شد.'
    ];
}

/* ------------------------------ ورود منعطف و هوشمند ------------------------------ */

function auth_login_flexible(string $identifier, string $password, bool $remember = false): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $identifier = trim($identifier);
    $idLower = mb_strtolower($identifier);
    $s = settings_effective();

    if (empty($s['allowLogin'])) {
        return ['ok' => false, 'error' => 'ورود به سامانه در حال حاضر غیرفعال است.'];
    }

    // کنترل محدودیت نرخ و قفل تلاش‌های ناموفق
    $maxAttempts = max(3, (int) ($s['maxLoginAttempts'] ?? 5));
    $lockMin = max(1, (int) ($s['lockoutDurationMin'] ?? 15));
    $rateKey = 'login:' . auth_ip() . ':' . md5($idLower);
    $rate = auth_rate_check($rateKey, $maxAttempts, $lockMin * 60);

    if (!$rate['ok']) {
        $retryMin = ceil(($rate['retryAfter'] ?? 60) / 60);
        audit('login_locked', 'قفل حساب/IP به دلیل تلاش‌های ناموفق: ' . $identifier);
        return [
            'ok' => false,
            'locked' => true,
            'retryAfter' => $rate['retryAfter'] ?? 60,
            'error' => "تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً {$retryMin} دقیقه دیگر دوباره امتحان کنید."
        ];
    }

    // جستجوی کاربر بر اساس روش ورودی مجاز
    $identMode = $s['loginIdentifierMode'] ?? 'any';
    $u = null;

    if ($identMode === 'email_only') {
        $u = db_one('SELECT * FROM users WHERE email = ?', [$idLower]);
    } elseif ($identMode === 'username_only') {
        $u = db_one('SELECT * FROM users WHERE username = ?', [$identifier]);
    } elseif ($identMode === 'mobile_only') {
        $cleanPhone = preg_replace('/[^0-9]/', '', $identifier);
        $u = db_one('SELECT * FROM users WHERE mobile = ? OR mobile = ?', [$identifier, $cleanPhone]);
    } else {
        // حالت ترکیبی (any)
        $cleanPhone = preg_replace('/[^0-9]/', '', $identifier);
        $u = db_one('SELECT * FROM users WHERE email = ? OR username = ? OR mobile = ? OR (mobile != "" AND mobile = ?)', [
            $idLower, $identifier, $identifier, $cleanPhone
        ]);
    }

    if (!$u || !password_verify($password, (string) $u['pass_hash'])) {
        auth_rate_record_fail($rateKey);
        audit('login_failed', 'ورود ناموفق با شناسه: ' . $identifier, (int) ($u['id'] ?? 0));
        $rem = max(0, $maxAttempts - (($rate['hits'] ?? 0) + 1));
        return [
            'ok' => false,
            'error' => 'اطلاعات ورود (شناسه یا کلمه عبور) نادرست است.',
            'remainingAttempts' => $rem
        ];
    }

    // پاک‌سازی شمارنده تلاش‌های ناموفق پس از موفقیت
    auth_rate_clear($rateKey);

    // بررسی وضعیت حساب
    $status = (string) ($u['status'] ?? 'active');
    if ($status === 'pending') {
        audit('login_pending', 'تلاش ورود حساب در انتظار تأیید: ' . $identifier, (int) $u['id']);
        return [
            'ok' => false,
            'pending' => true,
            'error' => 'حساب کاربری شما در انتظار تأیید مدیریت سامانه است. به محض تأیید دسترسی فعال خواهد شد.'
        ];
    }
    if ($status === 'blocked') {
        audit('login_blocked', 'تلاش ورود حساب مسدود: ' . $identifier, (int) $u['id']);
        $meta = json_decode((string) ($u['meta'] ?? ''), true);
        $reason = $meta['statusReason'] ?? '';
        return [
            'ok' => false,
            'blocked' => true,
            'error' => 'حساب کاربری شما مسدود شده است.' . ($reason ? " (علت: {$reason})" : '')
        ];
    }

    // ثبت لاگین موفق و ایجاد نشست
    $uid = (int) $u['id'];
    db_exec('UPDATE users SET last_login_at = ? WHERE id = ?', [db_now_ms(), $uid]);
    auth_start_session();
    @session_regenerate_id(true);
    $_SESSION['uid'] = $uid;
    $_SESSION['loginAt'] = time();

    audit('login', 'ورود موفق کاربر: ' . ($u['email'] ?: $u['username'] ?: $u['name']), $uid);

    return [
        'ok' => true,
        'user' => auth_public_user(auth_user($uid, true))
    ];
}

/* ------------------------------ تأیید کلمات بازیابی ------------------------------ */

function auth_confirm_recovery_words(int $userId): array {
    if (!db_ok() || $userId <= 0) return ['ok' => false, 'error' => 'شناسه کاربر نامعتبر است.'];
    $meta = user_meta_get($userId);
    $meta['recovery_confirmed'] = true;
    user_meta_set($userId, $meta);
    audit('recovery_words_confirmed', 'تأیید ذخیره‌سازی کلمات بازیابی توسط کاربر', $userId);
    return ['ok' => true];
}

/* ------------------------------ بازیابی رمز عبور با کلمات کلیدی (Recovery Words) ------------------------------ */

function auth_recover_unified(array $b): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $s = settings_effective();
    $mode = trim((string) ($b['mode'] ?? $s['forgotVerificationMode'] ?? 'any_with_words'));
    $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
    $mobile = trim((string) ($b['mobile'] ?? ''));
    $cleanMobile = preg_replace('/[^0-9]/', '', $mobile);
    $username = trim((string) ($b['username'] ?? ''));
    $identifier = trim((string) ($b['identifier'] ?? $email ?: $mobile ?: $username));
    $phrase = trim((string) ($b['phrase'] ?? ''));
    $newPassword = (string) ($b['password'] ?? $b['newPassword'] ?? '');

    $passMin = max(4, (int) ($s['passMinLen'] ?? 6));
    if (mb_strlen($newPassword) < $passMin) {
        return ['ok' => false, 'error' => "کلمه عبور جدید باید حداقل {$passMin} کاراکتر باشد."];
    }

    $needsWords = in_array($mode, ['words_only', 'email_and_words', 'mobile_and_words', 'username_and_words', 'email_mobile_and_words', 'any_with_words'], true);
    $needsEmail = in_array($mode, ['email_only', 'email_and_words', 'email_and_mobile', 'email_and_username', 'email_mobile_and_words'], true);
    $needsMobile = in_array($mode, ['mobile_only', 'mobile_and_words', 'email_and_mobile', 'mobile_and_username', 'email_mobile_and_words'], true);
    $needsUsername = in_array($mode, ['username_only', 'username_and_words', 'email_and_username', 'mobile_and_username'], true);

    if ($needsEmail && $email === '') return ['ok' => false, 'error' => 'لطفاً نشانی ایمیل حساب کاربری خود را وارد نمایید.'];
    if ($needsMobile && $mobile === '') return ['ok' => false, 'error' => 'لطفاً شماره موبایل ثبت‌شده در حساب را وارد نمایید.'];
    if ($needsUsername && $username === '') return ['ok' => false, 'error' => 'لطفاً نام کاربری خود را وارد نمایید.'];
    if ($needsWords && $phrase === '') return ['ok' => false, 'error' => 'لطفاً تمام کلمات بازیابی را در باکس‌های مربوطه وارد نمایید.'];

    $u = null;
    if ($mode === 'words_only') {
        $allUsers = db_all("SELECT * FROM users WHERE LOWER(email) != 'admin@gmail.com'");
        foreach ($allUsers as $cand) {
            $meta = json_decode((string) ($cand['meta'] ?? ''), true) ?: [];
            $savedHash = (string) ($meta['recovery_hash'] ?? '');
            if ($savedHash !== '' && auth_verify_recovery_phrase($phrase, $savedHash)) {
                $u = $cand;
                break;
            }
        }
        if (!$u) {
            return ['ok' => false, 'error' => 'هیچ حساب کاربری با این ترکیب کلمات بازیابی یافت نشد. ترتیب و املای کلمات را بررسی کنید.'];
        }
    } else {
        if ($needsEmail) {
            $u = db_one('SELECT * FROM users WHERE LOWER(email) = ?', [$email]);
        } elseif ($needsMobile) {
            $u = db_one('SELECT * FROM users WHERE mobile = ? OR (mobile != "" AND mobile = ?)', [$mobile, $cleanMobile]);
        } elseif ($needsUsername) {
            $u = db_one('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [$username]);
        } else {
            $idLow = mb_strtolower($identifier);
            $idPhone = preg_replace('/[^0-9]/', '', $identifier);
            $u = db_one('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? OR mobile = ? OR (mobile != "" AND mobile = ?)', [
                $idLow, $idLow, $identifier, $idPhone
            ]);
        }
        if (!$u || mb_strtolower((string)($u['email'] ?? '')) === 'admin@gmail.com') {
            return ['ok' => false, 'error' => 'حساب کاربری با مشخصات واردشده یافت نشد.'];
        }
        if ($needsEmail && mb_strtolower((string)($u['email'] ?? '')) !== $email) {
            return ['ok' => false, 'error' => 'ایمیل واردشده با اطلاعات این حساب مطابقت ندارد.'];
        }
        if ($needsMobile) {
            $uMob = preg_replace('/[^0-9]/', '', (string)($u['mobile'] ?? ''));
            if ($uMob === '' || ($uMob !== $cleanMobile && (string)$u['mobile'] !== $mobile)) {
                return ['ok' => false, 'error' => 'شماره موبایل واردشده با اطلاعات ثبت‌شده این حساب مطابقت ندارد.'];
            }
        }
        if ($needsUsername && mb_strtolower((string)($u['username'] ?? '')) !== mb_strtolower($username)) {
            return ['ok' => false, 'error' => 'نام کاربری واردشده با این حساب مطابقت ندارد.'];
        }
        if ($needsWords) {
            $meta = user_meta_get((int) $u['id']);
            $savedHash = (string) ($meta['recovery_hash'] ?? '');
            if ($savedHash === '' || !auth_verify_recovery_phrase($phrase, $savedHash)) {
                return ['ok' => false, 'error' => 'کلمات بازیابی واردشده نادرست هستند. ترتیب و املای کلمات را در باکس‌ها بررسی کنید.'];
            }
        }
    }

    $uid = (int) $u['id'];
    db_exec('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($newPassword, PASSWORD_DEFAULT), $uid]);
    audit('password_recovered_unified', "بازیابی موفق رمز عبور با روش {$mode}", $uid);

    return [
        'ok' => true,
        'message' => (string) ($s['forgotSuccessMessage'] ?? 'کلمه عبور جدید شما با موفقیت ثبت شد! اکنون می‌توانید وارد حساب خود شوید.')
    ];
}

function auth_recover_with_words(string $identifier, string $phrase, string $newPassword): array {
    return auth_recover_unified([
        'mode' => $identifier === '' ? 'words_only' : 'any_with_words',
        'identifier' => $identifier,
        'phrase' => $phrase,
        'password' => $newPassword,
    ]);
}

/* ------------------------------ خروج و متفرقه ------------------------------ */

function auth_logout(): void {
    if (auth_id()) audit('logout', 'خروج از حساب');
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], (bool) $p['secure'], (bool) $p['httponly']);
        }
        @session_destroy();
    }
}

function auth_change_password(int $userId, string $current, string $new): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $s = settings_effective();
    $passMin = max(4, (int) ($s['passMinLen'] ?? 6));
    if (mb_strlen($new) < $passMin) return ['ok' => false, 'error' => "رمز جدید باید حداقل {$passMin} کاراکتر باشد."];
    $u = db_one('SELECT * FROM users WHERE id = ?', [$userId]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (!password_verify($current, (string) $u['pass_hash'])) return ['ok' => false, 'error' => 'رمز فعلی نادرست است.'];
    db_exec('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $userId]);
    audit('password_change', 'تغییر رمز عبور', $userId);
    return ['ok' => true];
}

function auth_set_theme(int $userId, string $theme): void {
    $theme = $theme === 'light' ? 'light' : 'dark';
    if (!db_ok()) return;
    try { db_exec('UPDATE users SET theme = ? WHERE id = ?', [$theme, $userId]); } catch (Throwable $e) {}
}

/** بازنشانی رمز توسط مدیر → رمز موقت برمی‌گرداند */
function auth_admin_reset_password(int $userId): array {
    if (!db_ok()) return ['ok' => false, 'error' => 'دیتابیس در دسترس نیست.'];
    $u = db_one('SELECT id, email, username, name, role, status FROM users WHERE id = ?', [$userId]);
    if (!$u) return ['ok' => false, 'error' => 'کاربر یافت نشد.'];
    if (auth_is_super_admin($u) && !auth_is_super_admin()) {
        return ['ok' => false, 'error' => 'دسترسی غیرمجاز! شما مجاز به تغییر رمز عبور مدیر ارشد (Super Admin) نیستید.'];
    }
    $temp = 'sy-' . bin2hex(random_bytes(4));
    db_exec('UPDATE users SET pass_hash = ? WHERE id = ?', [password_hash($temp, PASSWORD_DEFAULT), $userId]);
    audit('admin_reset_password', 'بازنشانی رمز ' . ($u['email'] ?: $u['username'] ?: $u['name']), $userId);
    return ['ok' => true, 'tempPassword' => $temp];
}

/* ------------------------------ نگهبان ورود و سطح دسترسی ------------------------------ */

function auth_guard(string $path): ?array {
    $s = settings_effective();
    $public = [
        '/api/auth/login', '/api/auth/register', '/api/auth/me', '/api/auth/logout',
        '/api/auth/setup', '/api/auth/install-state', '/api/auth/forgot',
        '/api/auth/fields', '/api/auth/recover-with-words', '/api/auth/verify-words'
    ];
    if (in_array($path, $public, true)) return null;
    if (str_starts_with($path, '/api/install/')) return null;
    if ($path === '/api/health') return null;

    $u = auth_user();
    if ($u === null) {
        if (!empty($s['requireLogin']) || !empty($s['allowRegister'])) {
            return ['code' => 401, 'body' => ['error' => 'برای استفاده از سامانه ابتدا وارد شوید یا ثبت‌نام کنید.', 'auth' => true,
                'allowRegister' => !empty($s['allowRegister'])]];
        }
        return null;
    }
    if (($u['status'] ?? 'active') !== 'active') {
        return ['code' => 403, 'body' => ['error' => 'حساب شما فعال نیست.', 'auth' => true]];
    }
    // دسترسی بخش مدیریت و تنظیمات هوش مصنوعی و سیستم فقط مختص سوپر ادمین است
    $isAdminOnly = str_starts_with($path, '/api/admin/')
        || in_array($path, ['/api/ai/config', '/api/ai/models', '/api/ai/test'], true);

    if ($isAdminOnly && !auth_is_admin()) {
        return ['code' => 403, 'body' => ['error' => 'دسترسی غیرمجاز. پنل مدیریت و تنظیمات سیستم فقط مختص مدیر ارشد است.']];
    }
    return null;
}

function auth_installed(): bool {
    if (!db_ok()) return false;
    try {
        if (!db_is_migrated()) return false;
        $n = (int) db_val('SELECT COUNT(*) FROM users');
        return $n > 0;
    } catch (Throwable $e) { return false; }
}

function auth_public_user(?array $u): ?array {
    if ($u === null) return null;
    $uid = (int) $u['id'];
    $meta = user_meta_get($uid);
    $roleSlug = (string) ($u['role'] ?? 'user');
    return [
        'id' => $uid,
        'email' => (string) ($u['email'] ?? ''),
        'username' => (string) ($u['username'] ?? ''),
        'mobile' => (string) ($u['mobile'] ?? ''),
        'name' => (string) ($u['name'] ?? ''),
        'role' => $roleSlug,
        'status' => (string) ($u['status'] ?? 'active'),
        'theme' => (string) ($u['theme'] ?? 'dark'),
        'createdAt' => (int) ($u['created_at'] ?? 0),
        'lastLoginAt' => (int) ($u['last_login_at'] ?? 0),
        'isSuperAdmin' => auth_is_super_admin($u),
        'isAdmin' => auth_is_admin($u),
        'permissions' => auth_role_permissions($roleSlug),
        'walletBalance' => max(0, (int) ($meta['walletBalance'] ?? 0)),
        'tradeRestricted' => !empty($meta['tradeRestricted']),
        'statusReason' => (string) ($meta['statusReason'] ?? ''),
        'subscription' => user_subscription_active($uid),
        'hasRecoveryWords' => !empty($meta['recovery_hash']),
        'recoveryConfirmed' => !empty($meta['recovery_confirmed']),
        'meta' => $meta,
    ];
}
