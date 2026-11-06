'use strict';
(async () => {
  const code = lastSeg();
  const state = $('#state'), form = $('#form'), send = $('#send'), err = $('#err'), text = $('#text');
  const r = await api('GET', `/api/car/${encodeURIComponent(code)}`);
  if (r.status === 404) {
    $('#carname').remove();
    state.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'هاي السيارة مش مسجّلة'), h('p', { class: 'muted' }, 'يمكن صاحبها غيّر كود الـQR أو حذفه. جرّب تتواصل بطريقة ثانية.')));
    return;
  }
  if (!r.ok) { state.replaceChildren(h('p', { class: 'err' }, 'صار خطأ. حدّث الصفحة.')); return; }
  const { label, active, quick, turnstile } = r.data;
  $('#carname').textContent = label;
  if (!active) { state.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'الاستقبال موقوف مؤقتاً'), h('p', { class: 'muted' }, 'صاحب السيارة أوقف استقبال الرسائل حالياً.'))); return; }

  const picked = new Set();
  const refresh = () => { send.disabled = !(picked.size || text.value.trim().length >= 2); };
  for (const q of quick) {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' },
      h('span', { class: 'e', 'aria-hidden': 'true' }, q.emoji), q.text.replace(/[.،]$/, ''));
    b.addEventListener('click', () => {
      if (picked.has(q.key)) picked.delete(q.key);
      else if (picked.size < 3) picked.add(q.key); else return toast('بتقدر تختار لحد 3 تنبيهات');
      b.setAttribute('aria-pressed', picked.has(q.key));
      refresh();
    });
    $(`#g-${q.group}`).append(b);
  }
  text.addEventListener('input', () => { $('#cnt').textContent = [...text.value].length; refresh(); });
  form.classList.remove('hide');

  let captcha = '';
  if (turnstile) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
    s.onload = () => window.turnstile.render('#ts', { sitekey: turnstile, callback: (t) => { captcha = t; } });
    document.head.append(s);
  }

  const t0 = Date.now();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.replaceChildren(); send.disabled = true; send.textContent = 'جاري الإرسال…';
    const res = await api('POST', `/api/car/${encodeURIComponent(code)}/message`, {
      quick: [...picked], text: text.value.trim(), website: $('#website').value, elapsed: Date.now() - t0, captcha,
    });
    if (res.ok && res.data.thread) { location.href = `/t/${res.data.thread}`; return; }
    err.replaceChildren(h('div', { class: 'err', role: 'alert' }, res.data.message || 'تعذر الإرسال. جرّب مرة ثانية.'));
    send.textContent = 'أرسل الرسالة'; refresh();
    if (window.turnstile) { try { window.turnstile.reset(); captcha = ''; } catch {} }
  });
})();
