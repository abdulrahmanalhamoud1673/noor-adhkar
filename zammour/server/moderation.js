'use strict';
/**
 * فلترة النص الحرّ قبل ما يوصل لصاحب السيارة.
 * الرسائل الجاهزة (quick) ما بتمرّ من هون لأنها ثابتة ونحن كاتبينها.
 * المبدأ: نطبّع النص (تشكيل، همزات، حروف مكرّرة، حروف مفصولة، أرقام هندية، leet)
 * وبعدين نقارن "كلمة كلمة" عشان ما نظلم كلمات بريئة (مشكلة Scunthorpe).
 */

const MAX_LEN = 140;

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // تشكيل + تطويل
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '$': 's', '@': 'a', '!': 'i', '7': 'h' };

function normalizeAr(s) {
  return s
    .normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d])
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}
// "شرررموووطة" → "شرموطه"  (نختصر أي تكرار لحرف واحد)
const squeeze = (s) => s.replace(/(.)\1+/gu, '$1');

function tokenize(norm) {
  const raw = norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // "ش ر م و ط ة" أو "ش.ر.م.و.ط.ة" → ندمج سلسلة الحروف المفردة (3+) بكلمة وحدة
  const out = [];
  let run = [];
  const flush = () => { if (run.length >= 3) out.push(run.join('')); else out.push(...run); run = []; };
  for (const t of raw) { if ([...t].length === 1 && /\p{L}/u.test(t)) run.push(t); else { flush(); out.push(t); } }
  flush();
  return out;
}

// ———————— القوائم (بعد التطبيع) ————————
// exact: لازم تطابق الكلمة كلها. stem: بتطابق إذا الكلمة بتبدأ فيها (للجذور الطويلة فقط).
const AR_PROFANITY = {
  exact: ['كس', 'زب', 'زبي', 'عير', 'طيز', 'خرا', 'خره', 'كلب', 'كلبه', 'حمار', 'حماره', 'تيس', 'بهيم', 'بهايم',
    'غبي', 'غبيه', 'حيوان', 'خنزير', 'حقير', 'وسخ', 'وسخه', 'زفت', 'ملعون', 'ملعونه', 'يلعن', 'لعنه', 'عرص', 'عرصه',
    'معرص', 'ديوث', 'قواد', 'كلاب', 'حمير', 'اهبل', 'هبله', 'زاني', 'زانيه', 'متخلف', 'متخلفه', 'قذر', 'قذره',
    'بلا', 'ورع', 'سافل', 'سافله', 'وقح', 'وقحه', 'نذل', 'نذله', 'جزمه', 'جزمة', 'حثاله', 'معفن', 'معفنه', 'تافه'],
  stem: ['شرموط', 'عاهر', 'قحب', 'منيوك', 'منيك', 'كسمك', 'كسام', 'كسخت', 'كساخت', 'نيك', 'ينيك', 'نايك', 'سكس', 'بزاز',
    'متناك', 'مخنث', 'شاذ', 'لوطي', 'خول', 'ابن الكلب', 'بنت الكلب', 'ابن الحرام', 'يخرب بيت', 'ولاد الحرام', 'انيك',
    'قضيب', 'مؤخر', 'شرج', 'عريان', 'عاريه', 'اباحي', 'سكسي'],
};
const AR_PHRASES = ['ابن الكلب', 'بنت الكلب', 'ابن الحرام', 'ابن الزانيه', 'يا حمار', 'يا كلب', 'اختك', 'امك', 'ام ك', 'يلعن ابو', 'يلعن ابوك', 'يلعن دينك', 'اللي خلفك', 'الله ياخذك', 'روح موت', 'موت يا'];
const EN_PROFANITY = ['fuck', 'fck', 'fuk', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'slut', 'whore', 'cunt',
  'nigg', 'porn', 'nude', 'nudes', 'sex', 'sexy', 'horny', 'idiot', 'stupid', 'moron', 'retard', 'ass', 'damn'];
const ARABIZI = ['sharmo', 'shrmo', 'sharmuta', 'sharmoot', 'kess', 'kuss', 'kos', 'koss', 'ayre', 'ayri', 'manyak', 'manyk',
  'mnyk', 'nayek', 'nik', 'zeb', 'tez', 'a7a', '7mar', 'hmar', '3ars', 'ars', 'khara', 'kalb', 'ibnel', 'ibn el', 'ya kalb', 'ya 7mar', 'ya hmar'];

// معاكسات / تعارف / طلب رقم
const FLIRT = {
  exact: ['حلوه', 'حلو', 'جميله', 'جميل', 'قمر', 'قمره', 'حبيبتي', 'حبيبي', 'عمري', 'قلبي', 'روحي', 'عيونك', 'عيونج',
    'تعارف', 'اتعرف', 'نتعرف', 'تعرفي', 'تعرفين', 'اتعرف', 'جمالك', 'جمالج', 'ملاك', 'حياتي', 'يا عسل', 'عسل', 'كيوت',
    'بوسه', 'بوسات', 'احبك', 'بحبك', 'حبيت', 'اشتقت', 'اعجبتي', 'عجبتيني', 'بنوته', 'صبيه', 'صبية', 'فاتنه', 'مزه', 'مزة', 'غزال', 'غزاله'],
  stem: ['معاكس', 'عاكس', 'تعارف', 'رقمك', 'رقمج', 'رقمي', 'رقمنا', 'نمرتك', 'نمرتج', 'نمرتي', 'نمره'],
};
// طلب/تبادل وسائل تواصل
const CONTACT_WORDS = ['واتس', 'واتساب', 'وتساب', 'وتس', 'انستا', 'انستغرام', 'انستجرام', 'سناب', 'سنابشات', 'تلغرام', 'تليجرام',
  'تيك توك', 'تيكتوك', 'فيسبوك', 'فيس بوك', 'ايميل', 'ايميلك', 'بريدك', 'كلميني', 'كلمني', 'اتصل', 'اتصلي', 'ارقم', 'رنلي', 'رن عليي',
  'whatsapp', 'wtsp', 'whats', 'insta', 'instagram', 'snap', 'snapchat', 'telegram', 'tiktok', 'facebook', 'email', 'gmail', 'hotmail', 'call me', 'text me'];
const THREATS = {
  exact: [],
  stem: ['بقتلك', 'اقتلك', 'رح اقتل', 'بقتل', 'اذبحك', 'بذبحك', 'بكسرلك', 'اكسرلك', 'بحرقلك', 'احرقلك', 'بحرق سيارتك', 'بدمرلك',
    'بخرب سيارتك', 'بكسر سيارتك', 'بخربلك', 'خلي بالك مني', 'بجيبك', 'لاقيك', 'بلاقيك', 'اعرف وين تسكن', 'اعرف مكانك', 'بنتقم', 'انتقام', 'kill you', 'hurt you', 'burn your', 'smash your'],
};

// تطبيع القوائم مرة وحدة
const N = (arr) => arr.map((w) => squeeze(normalizeAr(w)));
const L = {
  arExact: new Set(N(AR_PROFANITY.exact)),
  arStem: N(AR_PROFANITY.stem).filter((w) => !w.includes(' ')),
  arStemPhrases: N(AR_PROFANITY.stem).filter((w) => w.includes(' ')),
  arPhrases: N(AR_PHRASES),
  en: EN_PROFANITY,
  arabizi: ARABIZI,
  flirtExact: new Set(N(FLIRT.exact)),
  flirtStem: N(FLIRT.stem),
  contact: N(CONTACT_WORDS),
  threatStem: N(THREATS.stem),
};

// أحرف الجر/العطف اللي بتلزق بأول الكلمة: وحمار، بحمار، لحمار، الحمار
function variants(tok) {
  const v = new Set([tok]);
  for (const p of ['ال', 'و', 'ف', 'ب', 'ل', 'ك', 'وال', 'بال', 'لل', 'فال', 'كال', 'ي', 'ت', 'ا']) {
    if (tok.startsWith(p) && tok.length - p.length >= 2) v.add(tok.slice(p.length));
  }
  return v;
}

const DIGITS_RE = /\d/g;
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|jo|me|io|co|app|ly|gl|link|xyz)\b|t\.me|wa\.me)/i;
const HANDLE_RE = /(^|\s)@[\w.]{2,}/;

/** @returns {{ok:true, text:string} | {ok:false, reason:string}} */
function moderate(input) {
  let text = String(input ?? '').normalize('NFKC').replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if ([...text].length > MAX_LEN) return { ok: false, reason: 'long' };
  if ([...text].length < 2) return { ok: false, reason: 'empty' };

  const asciiDigitsText = text.replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d]);
  // أرقام: أكتر من 4 خانات (ما بنسمح بتبادل أرقام هواتف أو لوحات)
  if ((asciiDigitsText.match(DIGITS_RE) || []).length > 4) return { ok: false, reason: 'contact' };
  // أرقام مكتوبة بالحروف ("صفر سبعة سبعة...")
  const wordsNum = /(صفر|واحد|اثنين|ثلاثه|ثلاثة|اربعه|اربعة|خمسه|خمسة|سته|ستة|سبعه|سبعة|ثمانيه|ثمانية|تسعه|تسعة)/g;
  if ((normalizeAr(text).match(new RegExp(wordsNum.source.replace(/ة/g, 'ه'), 'g')) || []).length >= 5) return { ok: false, reason: 'contact' };
  if (URL_RE.test(text) || HANDLE_RE.test(text)) return { ok: false, reason: 'contact' };

  const norm = normalizeAr(text);
  const sq = squeeze(norm);
  const toks = tokenize(sq);
  const leetToks = tokenize(squeeze(norm.replace(/[013457$@!]/g, (c) => LEET[c])));
  const joined = ` ${toks.join(' ')} `;

  // عبارات
  for (const p of L.arPhrases) if (joined.includes(` ${p} `)) return { ok: false, reason: 'profanity' };
  for (const p of L.arStemPhrases) if (joined.includes(` ${p}`)) return { ok: false, reason: 'profanity' };
  for (const p of L.threatStem) if (joined.includes(` ${p}`) || joined.includes(p) && p.length >= 6) return { ok: false, reason: 'threat' };
  for (const p of L.contact) if (p.includes(' ') ? joined.includes(` ${p}`) : false) return { ok: false, reason: 'contact' };

  for (const tok of toks) {
    for (const t of variants(tok)) {
      if (L.arExact.has(t)) return { ok: false, reason: 'profanity' };
      for (const s of L.arStem) if (t.startsWith(s)) return { ok: false, reason: 'profanity' };
      if (L.flirtExact.has(t)) return { ok: false, reason: 'harassment' };
      for (const s of L.flirtStem) if (t.startsWith(s)) return { ok: false, reason: 'harassment' };
      for (const s of L.contact) if (!s.includes(' ') && t.startsWith(s)) return { ok: false, reason: 'contact' };
    }
  }
  for (const list of [toks, leetToks]) {
    for (const tok of list) {
      if (!/^[a-z]+$/.test(tok) && !/^[a-z0-9]+$/.test(tok)) continue;
      for (const w of L.en) if (tok === w || (w.length >= 4 && tok.startsWith(w))) return { ok: false, reason: 'profanity' };
      for (const w of L.arabizi) if (tok === w || (w.length >= 5 && tok.startsWith(w))) return { ok: false, reason: 'profanity' };
      for (const w of L.contact) if (/^[a-z ]+$/.test(w) && !w.includes(' ') && tok.startsWith(w)) return { ok: false, reason: 'contact' };
    }
  }
  if (/\bkill you|\bhurt you|\bbur(n|ning) your|\bsmash your/i.test(text)) return { ok: false, reason: 'threat' };

  // سبام: حرف واحد مكرّر كثير أو علامات ترقيم زايدة
  if (/(.)\1{9,}/u.test(text) || /[!؟?]{6,}/.test(text)) return { ok: false, reason: 'spam' };

  return { ok: true, text };
}

// رسائل جاهزة تنعرض للمرسل. عمداً عامة: ما نقول له أي كلمة بالضبط عشان ما يتحايل.
const REASON_AR = {
  empty: 'اكتب رسالة قصيرة أو اختر رسالة جاهزة.',
  long: `الرسالة طويلة. الحد الأقصى ${MAX_LEN} حرف.`,
  profanity: 'الرسالة فيها ألفاظ غير مسموحة. اكتبها بأدب أو اختر رسالة جاهزة.',
  harassment: 'ما بنسمح بالمعاكسة أو التعارف. الخدمة فقط لتنبيهات السيارة.',
  contact: 'ممنوع مشاركة أرقام أو روابط أو حسابات تواصل. هاي الخدمة تحمي خصوصية صاحب السيارة.',
  threat: 'ما بنسمح بالتهديد. إذا في مشكلة حقيقية تواصل مع الشرطة.',
  spam: 'الرسالة غير مفهومة. جرّب تكتبها بشكل أوضح.',
};

module.exports = { moderate, REASON_AR, MAX_LEN, _normalizeAr: normalizeAr };
