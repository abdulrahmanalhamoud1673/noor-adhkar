'use strict';
const root = $('#root');

function loginView() {
  let phone = '';
  const err = h('div');
  const showErr = (m) => err.replaceChildren(m ? h('div', { class: 'err', role: 'alert' }, m) : '');
  const phoneIn = h('input', { type: 'tel', inputmode: 'numeric', placeholder: '07X XXX XXXX', autocomplete: 'tel', dir: 'ltr', style: 'text-align:center;font-size:22px' });
  const codeIn = h('input', { type: 'text', inputmode: 'numeric', maxlength: '6', class: 'otp', dir: 'ltr', autocomplete: 'one-time-code', placeholder: '••••••' });
  const step1 = h('div', {},
    h('label', { class: 'f' }, 'رقم موبايلك الأردني'), phoneIn,
    h('p', { class: 'muted small' }, 'بنبعثلك رمز تحقق. الرقم بيتخزن مشفّر وما بينعرض لأي حدا.'),
    h('button', { class: 'btn btn-primary btn-block', onclick: async (e) => {
      showErr(''); e.target.disabled = true;
      const r = await api('POST', '/api/auth/request', { phone: phoneIn.value });
      e.target.disabled = false;
      if (!r.ok) return showErr(r.data.message || 'خطأ');
      phone = phoneIn.value; step1.classList.add('hide'); step2.classList.remove('hide'); codeIn.focus();
      if (r.data.devCode) step2.prepend(h('p', { class: 'okmsg' }, '🧪 وضع التطوير — الرمز: ', h('b', {}, r.data.devCode)));
    } }, 'أرسل الرمز'));
  const step2 = h('div', { class: 'hide' },
    h('label', { class: 'f' }, 'اكتب الرمز اللي وصلك'), codeIn,
    h('button', { class: 'btn btn-primary btn-block', style: 'margin-top:14px', onclick: async (e) => {
      showErr(''); e.target.disabled = true;
      const r = await api('POST', '/api/auth/verify', { phone, code: codeIn.value });
      e.target.disabled = false;
      if (!r.ok) return showErr(r.data.message || 'خطأ');
      boot();
    } }, 'دخول'),
    h('button', { class: 'btn btn-ghost btn-block btn-sm', style: 'margin-top:10px', onclick: () => { step2.classList.add('hide'); step1.classList.remove('hide'); } }, 'تغيير الرقم'));
  return h('div', { class: 'narrow' },
    h('div', { class: 'scan-head' }, h('a', { class: 'brand', href: '/', style: 'justify-content:center' }, h('img', { src: '/logo.svg', alt: '' }), 'زمّور'), h('h1', { style: 'font-size:26px;margin-top:10px' }, 'سجّل دخولك أو أنشئ حسابك')),
    h('div', { class: 'card' }, err, step1, step2));
}

async function dashboard(me) {
  const list = h('div');
  const labelIn = h('input', { type: 'text', maxlength: '40', placeholder: 'مثلاً: كيا سبورتج بيضاء' });
  const addErr = h('div');
  async function render() {
    const m = (await api('GET', '/api/me')).data;
    list.replaceChildren(...(m.cars.length ? m.cars.map(carCard) : [h('div', { class: 'card muted' }, 'ما عندك سيارات بعد. أضف أول سيارة من تحت 👇')]));
  }
  function carCard(c) {
    const msgs = h('div', { class: 'hide', style: 'margin-top:14px' });
    const toggleMsgs = async () => {
      if (!msgs.classList.toggle('hide')) {
        const r = (await api('GET', `/api/cars/${c.id}/messages`)).data;
        msgs.replaceChildren(...(r.messages.length ? r.messages.map((x) => h('div', { class: 'msg' },
          h('div', { class: 'meta' }, ago(x.at), x.replies.length ? ' · ✅ رديت' : ''),
          ...x.quick.map((q) => h('div', {}, `${q.emoji} ${q.text}`)), x.text && h('div', {}, `«${x.text}»`),
          h('button', { class: 'btn btn-danger btn-sm', style: 'margin-top:6px', onclick: async () => {
            if (confirm('حظر هذا المرسل؟')) { await api('POST', `/api/messages/${x.id}/block`, {}); toast('تم الحظر'); }
          } }, 'حظر المرسل'))) : [h('p', { class: 'muted' }, 'ما وصلتك رسائل بعد.')]));
      }
    };
    const act = (label, cls, fn) => h('button', { class: `btn btn-sm ${cls}`, onclick: fn }, label);
    return h('div', { class: 'card car-card' },
      h('div', { class: 'row' },
        h('div', { class: 'qrbox' }, h('img', { src: `/api/cars/${c.id}/qr.svg?v=${c.code}`, alt: 'QR' })),
        h('div', { class: 'info' },
          h('h3', {}, c.label, ' ', h('span', { class: `tag ${c.active ? 'on' : 'off'}` }, c.active ? 'يستقبل' : 'موقوف'), c.unreplied ? h('span', { class: 'tag new', style: 'margin-inline-start:6px' }, `${c.unreplied} بدون رد`) : ''),
          h('p', { class: 'muted small', style: 'margin:4px 0', dir: 'ltr' }, c.url),
          h('div', { class: 'actions' },
            h('a', { class: 'btn btn-primary btn-sm', href: `/sticker?id=${c.id}`, target: '_blank', rel: 'noopener' }, '🖨️ اطبع الستيكر'),
            act('📨 الرسائل', 'btn-dark', toggleMsgs),
            act(c.active ? '⏸️ إيقاف مؤقت' : '▶️ تفعيل', 'btn-ghost', async () => { await api('PATCH', `/api/cars/${c.id}`, { active: !c.active }); render(); }),
            act('✏️ الاسم', 'btn-ghost', async () => {
              const v = prompt('وصف السيارة', c.label); if (!v) return;
              const r = await api('PATCH', `/api/cars/${c.id}`, { label: v }); r.ok ? render() : toast(r.data.message || 'غير صالح');
            }),
            act('🔄 غيّر الكود', 'btn-ghost', async () => {
              if (confirm('رح يتغيّر كود الـQR والستيكر القديم بيوقف. متأكد؟')) { await api('POST', `/api/cars/${c.id}/rotate`, {}); toast('تم تغيير الكود، اطبع ستيكر جديد'); render(); }
            }),
            act('🗑️', 'btn-danger', async () => { if (confirm('حذف السيارة نهائياً مع رسائلها؟')) { await api('DELETE', `/api/cars/${c.id}`); render(); } }))),
      ), msgs);
  }
  const add = h('div', { class: 'card' },
    h('h3', {}, 'أضف سيارة'), addErr,
    h('label', { class: 'f' }, 'وصف السيارة (بدون رقم لوحة)'), labelIn,
    h('p', { class: 'muted small' }, 'هاد الوصف هو اللي بيشوفه اللي بيمسح الكود، عشان يتأكد إنها السيارة الصح.'),
    h('button', { class: 'btn btn-primary', onclick: async () => {
      const r = await api('POST', '/api/cars', { label: labelIn.value });
      if (!r.ok) return addErr.replaceChildren(h('div', { class: 'err' }, r.data.message || 'خطأ'));
      addErr.replaceChildren(); labelIn.value = ''; toast('تمت الإضافة ✅ اطبع الستيكر'); render();
    } }, '➕ أضف'));
  await render();
  return h('div', { class: 'wrap' },
    h('header', { class: 'top' }, h('a', { class: 'brand', href: '/' }, h('img', { src: '/logo.svg', alt: '' }), 'زمّور'),
      h('div', {}, h('span', { class: 'muted small', style: 'direction:ltr;unicode-bidi:isolate;display:inline-block' }, me.phone), ' ', h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await api('POST', '/api/auth/logout', {}); boot(); } }, 'خروج'))),
    h('h2', {}, 'سياراتي'), list, add,
    h('p', { class: 'muted small', style: 'margin:22px 0' }, 'نصيحة: اطبع الستيكر على ورق لاصق أو غلّفه بلاصق شفاف ضد الشمس، والصقه على الزجاج من الداخل.'));
}

async function boot() {
  const r = await api('GET', '/api/me');
  root.replaceChildren(r.ok ? await dashboard(r.data) : loginView());
}
boot();
