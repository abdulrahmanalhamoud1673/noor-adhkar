/* ══════════════════════════════════════════════════════════
   عامل الخدمة السابق كان يخزّن الملفات، فكان يخلط نسخة قديمة
   من app.js مع نسخة جديدة من index.html فيتعطّل التطبيق.
   هذا الملف الآن يلغي نفسه ويمسح كل ما خزّنه، ثم يختفي.
   ══════════════════════════════════════════════════════════ */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // امسح كل الذاكرة المخزّنة
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));

    // ألغِ تسجيل هذا العامل نفسه
    await self.registration.unregister();

    // أعِد تحميل كل النوافذ المفتوحة لتأخذ الملفات الطازجة
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) client.navigate(client.url);
  })());
});

/* لا نعترض أي طلب — كل شيء يذهب للشبكة مباشرة */
