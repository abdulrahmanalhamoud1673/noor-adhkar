'use strict';
(async () => {
  const box = $('#box'), bz = $('#blockzone'), token = lastSeg();
  async function load() {
    const r = await api('GET', `/api/m/${encodeURIComponent(token)}`);
    if (!r.ok) { $('#carname').textContent = ''; return notFound(box); }
    const d = r.data;
    $('#carname').textContent = d.label;
    const bubbles = [...d.quick.map((q) => h('div', { class: 'bubble' }, `${q.emoji} ${q.text}`)), d.text && h('div', { class: 'bubble' }, d.text)];
    const done = new Set(d.replies.map((x) => x.key));
    box.replaceChildren(
      h('p', { class: 'muted small' }, ago(d.at), ' · المرسل مجهول'),
      h('div', { class: 'thread' }, ...bubbles),
      h('div', { class: 'sec-title' }, 'ردّ بضغطة'),
      h('div', { class: 'replyopts' }, ...d.replyOptions.map((o) =>
        h('button', { class: 'btn ' + (done.has(o.key) ? 'btn-dark' : 'btn-ghost'), onclick: async () => {
          const x = await api('POST', `/api/m/${encodeURIComponent(token)}/reply`, { key: o.key });
          toast(x.ok ? 'تم إرسال ردّك ✅' : 'ما قدرنا نرسل'); load();
        } }, `${o.emoji} ${o.text}`))),
    );
    bz.replaceChildren(d.blocked
      ? h('p', { class: 'muted small' }, '🚫 تم حظر هذا المرسل.')
      : h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
        if (!confirm('حظر هذا المرسل؟ ما رح توصلك منه رسائل ثانية.')) return;
        await api('POST', `/api/m/${encodeURIComponent(token)}/block`, {}); toast('تم الحظر'); load();
      } }, '🚫 الرسالة مزعجة؟ احظر المرسل'));
  }
  load();
})();
