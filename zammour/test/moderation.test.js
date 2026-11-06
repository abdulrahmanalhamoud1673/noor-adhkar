const test = require('node:test');
const assert = require('node:assert/strict');
const { moderate } = require('../server/moderation');

const ok = (s) => test(`مسموح: ${s}`, () => assert.equal(moderate(s).ok, true, JSON.stringify(moderate(s))));
const no = (s, reason) => test(`ممنوع: ${s}`, () => {
  const r = moderate(s);
  assert.equal(r.ok, false);
  if (reason) assert.equal(r.reason, reason);
});

// رسائل بريئة لازم تمرّ (بما فيها كلمات فيها حروف الكلمات الممنوعة)
ok('لو سمحت حرك سيارتك، مسكّرة علي الطريق');
ok('الشباك مفتوح والمطر عم ينزل');
ok('كسرت زجاج السيارة المجاورة؟ لا، بس انتبه'); // كسر ≠ كس
ok('سيارتك فيها ضوء شغال من الصبح');
ok('الله يعطيك العافية، شكراً');
ok('عندي موعد مستعجل ٤٥ دقيقة');
ok('ممكن تحرك السيارة بعد إذنك؟');
ok('كلنا بنخطئ، بس هاي السيارة واقفة قدام الكراج');
ok('الشنطة مفتوحة'); // شنطة ≠ شاذ
ok('مشكور يا غالي');

// سب
no('يا حمار حرك سيارتك', 'profanity');
no('انت كلب', 'profanity');
no('ابن الكلب', 'profanity');
no('شرررموووطة', 'profanity');
no('ش ر م و ط ة', 'profanity');
no('ش.ر.م.و.ط.ة', 'profanity');
no('والحمير مثلك', 'profanity');
no('fuck you', 'profanity');
no('f u c k', undefined);
no('sh1t', 'profanity');
no('ya 7mar', 'profanity');
no('كَلْبٌ', 'profanity');
// معاكسات
no('عيونك حلوة', 'harassment');
no('انتي قمر', 'harassment');
no('بدي أتعرف عليكي', 'harassment');
no('شو رقمك', 'harassment');
no('معاكسة', 'harassment');
// تواصل
no('كلمني على 0791234567', 'contact');
no('٠٧٩١٢٣٤٥٦٧٨', 'contact');
no('ابعتلي واتس', 'contact');
no('my insta is cool', 'contact');
no('http://evil.example', 'contact');
no('example.com', 'contact');
no('@someone', 'contact');
no('صفر سبعة تسعة واحد اثنين ثلاثة', 'contact');
// تهديد
no('بكسرلك السيارة', 'threat');
no('رح اقتلك', 'threat');
no('i will kill you', 'threat');
// حدود
no('', 'empty');
no('x'.repeat(141), 'long');
no('!!!!!!!!!!', 'spam');
