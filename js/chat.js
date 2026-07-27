/* ══════════════════════════════════════════════════════════
   فضفض — محادثة ذكية مؤصَّلة
   ----------------------------------------------------------
   القاعدة الأهم في هذا الملف: النموذج لا يكتب نصّ آية ولا نصّ
   حديث بنفسه أبداً. هو فقط يختار المرجع ويضع علامة مثل
   [[آية:2:286]] أو [[حديث:sabr1]]، ثم نحن نجلب النص الحقيقي:
   الآية من مصحف المدينة عبر alquran.cloud، والحديث من القائمة
   المثبّتة أسفله. هكذا يستحيل أن يُنسب إلى الله أو إلى رسوله ﷺ
   كلام لم يقولاه، مهما أخطأ النموذج.
   ══════════════════════════════════════════════════════════ */
(function () {

/* ────────── الأحاديث المعتمدة (لا يُقتبس غيرها) ────────── */
const HADITH = {
  niyyah: { t: "إنَّما الأعمالُ بالنيّاتِ، وإنَّما لكلِّ امرئٍ ما نوى.", s: "متفق عليه — البخاري ومسلم", tag: "النية، بداية جديدة" },
  lisan: { t: "مَن كان يؤمنُ بالله واليومِ الآخرِ فليقُلْ خيراً أو ليصمُتْ.", s: "متفق عليه", tag: "اللسان، الخصام" },
  hubb: { t: "لا يؤمنُ أحدُكم حتى يُحبَّ لأخيه ما يُحبُّ لنفسه.", s: "متفق عليه", tag: "الحسد، الغيرة، المعاملة" },
  taqwa: { t: "اتَّقِ اللهَ حيثما كنتَ، وأتبِعِ السيئةَ الحسنةَ تمحُها، وخالِقِ الناسَ بخُلُقٍ حسن.", s: "رواه الترمذي وقال: حديث حسن", tag: "الذنب، التوبة، الأخلاق" },
  ajab: { t: "عَجَباً لأمرِ المؤمنِ! إنَّ أمرَه كلَّه خير، وليس ذاك لأحدٍ إلا للمؤمن: إن أصابته سرّاءُ شكر فكان خيراً له، وإن أصابته ضرّاءُ صبر فكان خيراً له.", s: "رواه مسلم", tag: "الابتلاء، الرضا، الحزن" },
  ihfaz: { t: "احفَظِ اللهَ يحفَظْك، احفَظِ اللهَ تجِدْه تُجاهَك… واعلَمْ أنَّ النصرَ مع الصبر، وأنَّ الفرَجَ مع الكرب، وأنَّ مع العُسرِ يُسراً.", s: "رواه الترمذي", tag: "الكرب، الضيق، اليأس" },
  ghadab: { t: "قال رجلٌ للنبيِّ ﷺ: أوصِني. قال: «لا تغضَبْ». فردَّد مِراراً، قال: «لا تغضَبْ».", s: "رواه البخاري", tag: "الغضب، الانفعال" },
  muslim: { t: "المسلمُ مَن سَلِمَ المسلمون من لسانِه ويدِه.", s: "متفق عليه", tag: "الأذى، المعاملة" },
  rahma: { t: "مَن لا يَرحَمِ الناسَ لا يَرحَمْه اللهُ.", s: "متفق عليه", tag: "الرحمة، القسوة" },
  tuhur: { t: "الطُّهورُ شطرُ الإيمان، والحمدُ لله تملأُ الميزان، وسُبحان الله والحمدُ لله تملآنِ ما بين السماواتِ والأرض.", s: "رواه مسلم", tag: "الذكر، الطهارة" },
  ilm: { t: "مَن سلَكَ طريقاً يلتمِسُ فيه علماً سهَّلَ اللهُ له به طريقاً إلى الجنة.", s: "رواه مسلم", tag: "الدراسة، العلم، الامتحان" },
  dunya: { t: "الدنيا سِجنُ المؤمنِ وجنَّةُ الكافر.", s: "رواه مسلم", tag: "ضيق الدنيا، الظلم" },
  sadaqa: { t: "ما نقَصَتْ صدقةٌ من مال، وما زاد اللهُ عبداً بعفوٍ إلا عِزّاً، وما تواضَعَ أحدٌ لله إلا رفَعَه الله.", s: "رواه مسلم", tag: "المال، العفو، الكِبر" },
  naffas: { t: "مَن نفَّسَ عن مؤمنٍ كُربةً من كُرَبِ الدنيا نفَّسَ اللهُ عنه كُربةً من كُرَبِ يومِ القيامة… واللهُ في عونِ العبدِ ما كان العبدُ في عونِ أخيه.", s: "رواه مسلم", tag: "العون، الصداقة، الوحدة" },
  gharib: { t: "كُنْ في الدنيا كأنَّك غريبٌ أو عابرُ سبيل.", s: "رواه البخاري", tag: "الزهد، التعلق بالدنيا" },
  adwam: { t: "أحبُّ الأعمالِ إلى اللهِ أدوَمُها وإنْ قَلَّ.", s: "متفق عليه", tag: "الاستمرار، الانقطاع عن الطاعة" },
  shadid: { t: "ليس الشديدُ بالصُّرَعة، إنَّما الشديدُ الذي يملِكُ نفسَه عند الغضب.", s: "متفق عليه", tag: "الغضب، ضبط النفس" },
  istighfar: { t: "مَن لَزِمَ الاستغفارَ جعَلَ اللهُ له من كلِّ ضيقٍ مَخرَجاً، ومن كلِّ همٍّ فرَجاً، ورزَقَه من حيثُ لا يحتسِب.", s: "رواه أبو داود وابن ماجه", tag: "الهم، الرزق، الذنب" },
  nur: { t: "الطُّهورُ شطرُ الإيمان… والصلاةُ نور، والصدقةُ بُرهان، والصبرُ ضِياء.", s: "رواه مسلم", tag: "الصلاة، الصبر" },
  mazlum: { t: "واتَّقِ دعوةَ المظلوم، فإنَّه ليس بينها وبين اللهِ حجاب.", s: "متفق عليه", tag: "الظلم، الانتصاف" },
  yassiru: { t: "يَسِّروا ولا تُعَسِّروا، وبَشِّروا ولا تُنَفِّروا.", s: "متفق عليه", tag: "التشدد، الدعوة، الأبناء" },
  rifq: { t: "إنَّ اللهَ رفيقٌ يُحبُّ الرِّفقَ في الأمرِ كلِّه.", s: "متفق عليه", tag: "الرفق، العلاقات" },
  kalima: { t: "والكلمةُ الطيّبةُ صدقة.", s: "متفق عليه", tag: "الكلام، الإحسان" },
  ratb: { t: "قال رجلٌ: يا رسولَ الله، إنَّ شرائعَ الإسلامِ قد كثُرَتْ عليَّ فأخبِرْني بشيءٍ أتشبَّثُ به. قال: «لا يزالُ لسانُك رَطْباً من ذِكرِ الله».", s: "رواه الترمذي", tag: "الذكر، الحيرة، كثرة الواجبات" },
  subhan: { t: "مَن قال: سُبحانَ اللهِ وبحمدِه، في يومٍ مائةَ مرة، حُطَّتْ خطاياه وإنْ كانت مثلَ زَبَدِ البحر.", s: "متفق عليه", tag: "الذنب، الذكر" },
  nasab: { t: "ما يُصيبُ المسلمَ من نَصَبٍ ولا وَصَبٍ ولا همٍّ ولا حُزنٍ ولا أذىً ولا غمٍّ، حتى الشوكةِ يُشاكُها، إلا كفَّرَ اللهُ بها من خطاياه.", s: "متفق عليه", tag: "المرض، التعب، الحزن، الهم" },
  thalath: { t: "إذا ماتَ الإنسانُ انقطَعَ عملُه إلا من ثلاثة: صدقةٍ جارية، أو عِلمٍ يُنتفَعُ به، أو ولدٍ صالحٍ يدعو له.", s: "رواه مسلم", tag: "الموت، الأثر، الوالدان" },
  tabassum: { t: "تبسُّمُك في وجهِ أخيك صدقة.", s: "رواه الترمذي", tag: "الإحسان، البساطة" },
  sujud: { t: "أقرَبُ ما يكونُ العبدُ من ربِّه وهو ساجد، فأكثِروا الدعاء.", s: "رواه مسلم", tag: "الدعاء، الصلاة، القرب" },
  qulub: { t: "إنَّ اللهَ لا ينظُرُ إلى صُوَرِكم وأموالِكم، ولكن ينظُرُ إلى قلوبِكم وأعمالِكم.", s: "رواه مسلم", tag: "المقارنة بالناس، المظهر، النقص" },
  ghish: { t: "مَن غَشَّنا فليس مِنّا.", s: "رواه مسلم", tag: "الصدق، العمل، البيع" },
  saai: { t: "الساعي على الأرملةِ والمسكينِ كالمجاهدِ في سبيلِ الله.", s: "متفق عليه", tag: "الإنفاق، الأسرة، التعب في العمل" },
  subh: { t: "مَن صلّى الصبحَ فهو في ذمّةِ الله.", s: "رواه مسلم", tag: "الفجر، الحفظ" },
  dayn: { t: "كان النبيُّ ﷺ يقول: «اللهمَّ إني أعوذُ بك من الهمِّ والحَزَن، والعجزِ والكسل، والبُخلِ والجُبن، وضَلَعِ الدَّينِ وغَلَبةِ الرجال».", s: "رواه البخاري", tag: "الدَّين، الكسل، القهر، الخوف" },
  qanit: { t: "لا يتمنَّينَّ أحدُكم الموتَ من ضُرٍّ نزَلَ به، فإنْ كان لا بدَّ فاعلاً فليقُلْ: اللهمَّ أحيِني ما كانتِ الحياةُ خيراً لي، وتوفَّني إذا كانتِ الوفاةُ خيراً لي.", s: "متفق عليه", tag: "اليأس الشديد، تمني الموت" },
};

/* ────────── تعليمات النموذج ────────── */
const SYSTEM = `أنت "أنيس"، رفيقٌ مسلمٌ رحيمٌ داخل تطبيق "نور" لأذكار وصلاة رجل من الأردن.
هو يفضفض لك عن يومه: تعبه، غضبه، ذنبه، فرحه، خوفه. مهمّتك أن تُنصت أولاً، ثم تُهوّن عليه، ثم تدلّه على ما يعينه من الدين وعلى خطوة عملية صغيرة ليومه.

## اللغة والأسلوب
- اكتب بالعربية الفصحى المبسّطة، بلهجة دافئة قريبة، وبلا تكلّف.
- الردّ قصير: من ٣ إلى ٧ أسطر عادةً. لا عناوين ولا قوائم مرقّمة إلا إن طلب خطوات.
- ابدأ دائماً بالإنصات والتعاطف بجملة أو جملتين قبل أي نصيحة. لا تقفز إلى الوعظ.
- لا تُلقِ محاضرة، ولا تُشعره بالذنب، ولا تُقلّل من شعوره. هو يعرف الحكم غالباً، وينقصه العون لا التوبيخ.
- خاطبه بصيغة المذكّر.

## الاقتباس — القاعدة الأهم ولا استثناء لها
أنت **ممنوع منعاً باتاً** من كتابة نصّ أي آية قرآنية أو أي حديث بحروفه.
بدلاً من ذلك تضع علامة، والتطبيق هو الذي يجلب النصّ الصحيح ويعرضه:

- للآية: \`[[آية:رقم السورة:رقم الآية]]\` — مثال: \`[[آية:94:5]]\`. ولمقطع متتابع: \`[[آية:2:285-286]]\`.
- للحديث: \`[[حديث:المعرّف]]\` من القائمة المرفقة أدناه فقط.

لا تكتب الآية ولا جزءاً منها ولا ترجمتها بجانب العلامة، ولا تضع أقواس ﴿﴾ بنفسك. ضع العلامة في سطر مستقل، ويجوز أن تمهّد لها بجملة مثل: "واسمع هذه الآية، أظنّها تكلّمك اليوم:".
إن لم تكن **متأكّداً تمام التأكّد** من رقم السورة والآية، فلا تضع علامة أصلاً وتكلّم بكلامك أنت.
لا تستشهد بحديث ليس معرّفه في القائمة، ولو كنت تعرفه. إن لم يناسبه شيء في القائمة فاكتفِ بالآية أو بكلامك.
لا تكثر: علامة آية واحدة وعلامة حديث واحدة في الردّ على الأكثر، وكثير من الردود لا تحتاج أياً منهما.

## قائمة الأحاديث المتاحة (المعرّف — الموضوع)
${Object.entries(HADITH).map(([k, h]) => `${k} — ${h.tag}`).join("\n")}

## الفتوى
لست مفتياً. في مسائل الحلال والحرام والطلاق والميراث والمعاملات المالية: أعطِ المعنى العام إن كان معلوماً بالضرورة، وقل له بوضوح أن يسأل عالماً أو دار الإفتاء الأردنية. لا تخترع حكماً ولا تنسب قولاً لمذهب.

## السلامة
إن لمحتَ أنه يفكّر في إيذاء نفسه أو أن حزنه ثقيل جداً ومستمر: توقّف عن الوعظ، واحتضنه بالكلام، وذكّره أن الله أرحم به من نفسه، واطلب منه بوضوح ولطف أن يكلّم شخصاً يثق به اليوم — أهله أو صديقاً أو طبيباً نفسياً — وأن طلب المساعدة ليس ضعفاً ولا نقصاً في الإيمان.

## أخيراً
اختم غالباً بخطوة واحدة صغيرة يقدر عليها الآن: ركعتان، استغفار وهو ماشٍ، رسالة لأمّه، مشوار قصير، نوم مبكر. شيء واحد، لا قائمة.
لا تكتب أي وسوم داخلية أو XML في ردّك.`;

/* ────────── حالة ────────── */
const KEY_ID = "aiKey";
const HIST_ID = "chatHistory";
const MODEL = "claude-opus-5";

let client = null;
let sending = false;
let history = Store.get(HIST_ID, []);           // [{role, text}]
const ayahCache = Store.get("ayahCache", {});   // "2:286" → {text, surah, num}

/* ────────── جلب الآيات ────────── */
async function fetchAyah(ref) {
  if (ayahCache[ref]) return ayahCache[ref];

  const [sura, range] = ref.split(":");
  const [from, to] = range.split("-").map(Number);
  const last = to || from;
  if (!sura || !from || last < from || last - from > 6) throw new Error("مرجع غير صالح");

  const parts = [];
  let surahName = "";
  for (let n = from; n <= last; n++) {
    const r = await fetch(`https://api.alquran.cloud/v1/ayah/${sura}:${n}/quran-uthmani`);
    if (!r.ok) throw new Error("تعذّر الاتصال");
    const j = await r.json();
    if (j.code !== 200) throw new Error("لم تُوجد الآية");
    parts.push(stripLeadingBasmala(j.data.text));
    surahName = j.data.surah.name;
  }

  const out = {
    text: parts.join("  "),
    surah: surahName,
    num: to && to !== from ? `${from}-${last}` : String(from),
  };
  ayahCache[ref] = out;
  Store.set("ayahCache", ayahCache);
  return out;
}

/* ────────── العرض ────────── */
const MARKER = /\[\[(آية|حديث):([^\]]+)\]\]/g;

/** أثناء البثّ قد تصل علامة نصف مكتوبة، فنقصّ ما بعد آخر "[[" غير مغلق */
function trimOpenMarker(text) {
  const open = text.lastIndexOf("[[");
  if (open === -1) return text;
  return text.indexOf("]]", open) === -1 ? text.slice(0, open) : text;
}

function esc(s) {
  return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

/**
 * يحوّل نصّ النموذج إلى HTML. العلامات تصير بطاقات، والنصّ العادي فقرات.
 * live = أثناء البثّ: نضع مكان الآية بطاقة انتظار ولا نُطلق أي طلب شبكة.
 */
function renderReply(box, raw, live) {
  const text = live ? trimOpenMarker(raw) : raw;
  box.innerHTML = "";
  let cursor = 0;
  const pending = [];

  text.replace(MARKER, (m, kind, ref, idx) => {
    addText(text.slice(cursor, idx));
    cursor = idx + m.length;

    if (kind === "حديث") {
      const h = HADITH[ref.trim()];
      if (h) {
        const el = document.createElement("div");
        el.className = "quote-card hadith";
        el.innerHTML = `<div class="quote-kind">حديث شريف</div>
          <div class="quote-text">«${esc(h.t)}»</div>
          <div class="quote-ref">${esc(h.s)}</div>`;
        box.appendChild(el);
      }
    } else {
      const el = document.createElement("div");
      el.className = "quote-card ayah";
      el.innerHTML = `<div class="quote-kind">من القرآن الكريم</div>
        <div class="quote-text loading">…</div>
        <div class="quote-ref">—</div>`;
      box.appendChild(el);
      if (!live) pending.push([el, ref.trim()]);
    }
    return m;
  });
  addText(text.slice(cursor));

  function addText(chunk) {
    chunk.split(/\n{1,}/).forEach(line => {
      if (!line.trim()) return;
      const p = document.createElement("p");
      p.textContent = line.trim();
      box.appendChild(p);
    });
  }

  // نجلب نصوص الآيات بعد اكتمال الردّ فقط
  pending.forEach(([el, ref]) => {
    fetchAyah(ref).then(a => {
      el.querySelector(".quote-text").classList.remove("loading");
      el.querySelector(".quote-text").textContent = `﴿ ${a.text} ﴾`;
      el.querySelector(".quote-ref").textContent = `${a.surah} — الآية ${a.num}`;
    }).catch(() => {
      el.querySelector(".quote-text").classList.remove("loading");
      el.querySelector(".quote-text").textContent = "تعذّر إحضار نصّ الآية (تحقّق من الإنترنت).";
      el.querySelector(".quote-ref").textContent = `سورة رقم ${ref.split(":")[0]} — الآية ${ref.split(":")[1]}`;
    });
  });
}

function bubble(role) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  $("chatLog").appendChild(el);
  return el;
}

function scrollDown() {
  const log = $("chatLog");
  log.scrollTop = log.scrollHeight;
}

function drawHistory() {
  const log = $("chatLog");
  log.innerHTML = "";
  if (!history.length) {
    log.innerHTML = `<div class="chat-empty">
      <div class="chat-empty-icon">🌙</div>
      <p>احكِ ما في قلبك بلا تجمّل.<br>ما تكتبه هنا يبقى على جهازك.</p>
    </div>`;
    return;
  }
  history.forEach(m => {
    const el = bubble(m.role === "user" ? "me" : "ai");
    if (m.role === "user") el.textContent = m.text;
    else renderReply(el, m.text, false);
  });
  scrollDown();
}

/* ────────── الإرسال ────────── */
async function ensureClient() {
  if (client) return client;
  const key = Store.get(KEY_ID, "");
  if (!key) throw new Error("NO_KEY");
  const { default: Anthropic } = await import("https://esm.sh/@anthropic-ai/sdk");
  client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  return client;
}

async function send(text) {
  if (sending || !text.trim()) return;
  sending = true;
  $("chatSend").disabled = true;

  if (!history.length) $("chatLog").innerHTML = "";
  history.push({ role: "user", text: text.trim() });
  bubble("me").textContent = text.trim();
  Store.set(HIST_ID, history);
  scrollDown();

  const box = bubble("ai");
  box.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  scrollDown();

  let full = "";
  try {
    const c = await ensureClient();
    // نرسل آخر ٢٠ رسالة فقط حتى لا تكبر التكلفة بلا داعٍ
    const convo = history.slice(-20).map(m => ({ role: m.role, content: m.text }));

    const stream = c.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium" },
      messages: convo,
    });

    stream.on("text", delta => {
      full += delta;
      renderReply(box, full, true);
      scrollDown();
    });

    const final = await stream.finalMessage();

    if (final.stop_reason === "refusal") {
      box.innerHTML = "";
      box.textContent = "اعتذر، ما قدرت أردّ على هذا. جرّب تصيغه بطريقة ثانية.";
      history.pop();
    } else {
      renderReply(box, full, false);
      history.push({ role: "assistant", text: full });
      Store.set(HIST_ID, history);
    }
  } catch (err) {
    console.error(err);
    box.innerHTML = "";
    box.classList.add("err");
    box.textContent = errorText(err);
    history.pop();                    // لا نحفظ سؤالاً بلا جواب
    Store.set(HIST_ID, history);
  } finally {
    sending = false;
    $("chatSend").disabled = false;
    scrollDown();
  }
}

function errorText(err) {
  if (err.message === "NO_KEY") return "ما في مفتاح محفوظ. اضغط «🔑 تغيير المفتاح» وضعه.";
  if (err.status === 401) return "المفتاح غير صحيح أو ملغى. اضغط «🔑 تغيير المفتاح» وضع مفتاحاً جديداً.";
  if (err.status === 400) return "الطلب مرفوض من الخادم. غالباً المفتاح لا يملك رصيداً بعد.";
  if (err.status === 429) return "أكثرت من الطلبات بسرعة. انتظر دقيقة وأعد المحاولة.";
  if (err.status >= 500) return "الخادم مشغول الآن. أعد المحاولة بعد قليل.";
  return "تعذّر الاتصال. تحقّق من الإنترنت ثم أعد المحاولة.";
}

/* ────────── الإقلاع ────────── */
function showSetup(show) {
  $("chatSetup").classList.toggle("hidden", !show);
  $("chatWrap").classList.toggle("hidden", show);
}

function initChat() {
  showSetup(!Store.get(KEY_ID, ""));
  drawHistory();

  $("saveChatKey").addEventListener("click", () => {
    const v = $("chatKey").value.trim();
    if (!v.startsWith("sk-ant-")) { toast("المفتاح يبدأ بـ sk-ant-"); return; }
    Store.set(KEY_ID, v);
    client = null;
    $("chatKey").value = "";
    showSetup(false);
    toast("تم الحفظ ✓");
  });

  $("chatKeyEdit").addEventListener("click", () => {
    Store.set(KEY_ID, "");
    client = null;
    showSetup(true);
  });

  $("chatClear").addEventListener("click", () => {
    history = [];
    Store.set(HIST_ID, history);
    drawHistory();
    toast("بدأنا من جديد");
  });

  const input = $("chatInput");
  const grow = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 130) + "px";
  };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); fire(); }
  });
  $("chatSend").addEventListener("click", fire);

  function fire() {
    const t = input.value;
    input.value = "";
    grow();
    send(t);
  }

  document.querySelectorAll("#chatSuggest button").forEach(b => {
    b.addEventListener("click", () => send(b.textContent));
  });
}

window.Chat = { init: initChat };
})();
