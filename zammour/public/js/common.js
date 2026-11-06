'use strict';
const $ = (s, r = document) => r.querySelector(s);
/** إنشاء عناصر بأمان (textContent فقط، ما في innerHTML لمحتوى المستخدم) */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
async function api(method, url, body) {
  try {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let data = {}; try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: { message: 'ما في اتصال بالإنترنت. جرّب مرة ثانية.' } }; }
}
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'قبل لحظات';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
}
function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}
const lastSeg = () => decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
function notFound(box, msg) { box.replaceChildren(h('p', { class: 'err' }, msg || 'هاي الصفحة مش موجودة أو انتهت صلاحيتها.')); }
