/* نور — العمل بدون إنترنت */
const CACHE = "noor-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/data.js",
  "./js/prayertimes.js",
  "./js/app.js",
  "./js/mushaf.js",
  "./js/salah-coach.js",
  "./js/sheikh-figure.js",
  "./manifest.json",
  "./reciters/afs.jpg",
  "./reciters/basit.jpg",
  "./reciters/sds.jpg",
  "./reciters/maher.jpg",
  "./reciters/yasser.jpg"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache: "reload" يجبره على جلب نسخة طازجة من الخادم
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // نموذج الذكاء الاصطناعي والخطوط: من الشبكة أولاً ثم الذاكرة
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // ملفات التطبيق: من الشبكة أولاً حتى تصلك التحديثات فوراً،
  // ومن الذاكرة عند انقطاع الإنترنت.
  // cache: "reload" يتجاوز ذاكرة المتصفح، وإلا بقيت النسخة القديمة
  // معروضة بعد كل تعديل على ملفات css أو js.
  e.respondWith(
    fetch(e.request.url, { cache: "reload" })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
  );
});
