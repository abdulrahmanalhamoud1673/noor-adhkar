'use strict';
(async () => {
  const id = new URLSearchParams(location.search).get('id');
  const me = await api('GET', '/api/me');
  const car = me.ok && me.data.cars.find((c) => String(c.id) === id);
  const box = $('#sticker');
  if (!car) { box.replaceChildren(h('p', { class: 'err' }, 'سجّل دخولك أولاً من لوحة التحكم.', h('a', { href: '/app' }, ' فتح'))); return; }
  box.replaceChildren(
    h('div', { class: 'sb' }, h('img', { src: '/logo.svg', alt: '' }), 'زمّور'),
    h('h2', {}, 'سيارتي واقفة غلط؟'), h('p', {}, 'امسح الكود وابعث لي رسالة'),
    h('div', { class: 'sqr' }, h('img', { src: `/api/cars/${car.id}/qr.svg?v=${car.code}`, alt: 'QR' })),
    h('div', { class: 'steps3' }, h('span', {}, '١ صوّر الكود'), h('span', {}, '٢ اختر التنبيه'), h('span', {}, '٣ أرسل')),
    h('p', { style: 'margin-top:3mm;font-size:3.6mm' }, '🔒 رقمي مخفي — ما بتعرفه ولا بتحتاج تعرفه'),
    h('div', { class: 'code' }, new URL(car.url).host + '/c/' + car.code));
  document.title = `ستيكر ${car.label}`;
})();
