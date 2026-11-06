'use strict';
// الرسائل الجاهزة: ثابتة ومكتوبة من عندنا، فما بتحتاج فلترة. "اختصارات سهلة".
const QUICK = [
  { key: 'blocking', emoji: '🚧', group: 'urgent', text: 'سيارتك مسكّرة عليّ، ممكن تحرّكها لو سمحت؟' },
  { key: 'damage',   emoji: '💥', group: 'urgent', text: 'صار شي لسيارتك (خبطة أو ضرر)، تعال شوفها.' },
  { key: 'tow',      emoji: '🚨', group: 'urgent', text: 'في خطر تنسحب سيارتك أو تنخالف، الأفضل تيجي بسرعة.' },
  { key: 'leak',     emoji: '💧', group: 'urgent', text: 'في سائل عم ينزل من تحت سيارتك.' },
  { key: 'flasher',  emoji: '⚠️', group: 'forgot', text: 'الفلاشر (إشارات التحذير) شغّال بسيارتك.' },
  { key: 'lights',   emoji: '💡', group: 'forgot', text: 'أضواء سيارتك شغّالة.' },
  { key: 'window',   emoji: '🪟', group: 'forgot', text: 'شباك سيارتك مفتوح.' },
  { key: 'door',     emoji: '🚪', group: 'forgot', text: 'باب سيارتك مش مسكّر زين.' },
  { key: 'trunk',    emoji: '🧳', group: 'forgot', text: 'شنطة (صندوق) السيارة مفتوحة.' },
  { key: 'alarm',    emoji: '🔔', group: 'forgot', text: 'إنذار سيارتك شغّال.' },
  { key: 'tire',     emoji: '🛞', group: 'forgot', text: 'إطار سيارتك فيه مشكلة (فاضي أو مفشّش).' },
];
// ردود صاحب السيارة (بدون كتابة حرّة = ما في مجال لإساءة بالاتجاه المعاكس)
const REPLIES = [
  { key: 'now',    emoji: '🏃', text: 'جاي حالاً، دقيقتين.' },
  { key: 'five',   emoji: '⏱️', text: 'بكون عندك خلال ٥ دقايق.' },
  { key: 'fixed',  emoji: '✅', text: 'تمام، تم الحل.' },
  { key: 'thanks', emoji: '🙏', text: 'مشكور كتير على التنبيه.' },
  { key: 'sorry',  emoji: '😔', text: 'آسف عن الإزعاج، رح أحرّكها.' },
  { key: 'cant',   emoji: '🚫', text: 'مش قادر آجي هلأ، أعتذر.' },
];
const quickByKey = Object.fromEntries(QUICK.map((q) => [q.key, q]));
const replyByKey = Object.fromEntries(REPLIES.map((q) => [q.key, q]));
module.exports = { QUICK, REPLIES, quickByKey, replyByKey };
