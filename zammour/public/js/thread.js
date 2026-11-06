'use strict';
(async () => {
  const box = $('#box'), token = lastSeg();
  async function load() {
    const r = await api('GET', `/api/thread/${encodeURIComponent(token)}`);
    if (r.status === 404) return notFound(box, 'تم إرسال رسالتك. (ما في تفاصيل لعرضها.)');
    const d = r.data;
    const sent = [...d.quick.map((q) => h('div', { class: 'bubble me' }, `${q.emoji} ${q.text}`)), d.text && h('div', { class: 'bubble me' }, d.text)];
    box.replaceChildren(
      h('div', { class: 'tick' }, '✅ وصلت رسالتك لصاحب ', d.label),
      h('p', { class: 'muted small' }, ago(d.at)),
      h('div', { class: 'thread' }, ...sent),
      d.replies.length
        ? h('div', { class: 'replies' }, h('div', { class: 'sec-title' }, 'ردّ صاحب السيارة'), ...d.replies.map((x) => h('div', { class: 'bubble' }, `${x.emoji || ''} ${x.text || ''}`)))
        : h('div', { class: 'waiting', style: 'margin-top:18px' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), 'بانتظار ردّ صاحب السيارة (اختياري)'),
    );
  }
  await load();
  setInterval(load, 8000);
})();
