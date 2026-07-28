/* ══════════════════════════════════════════════════════════
   نور — تحميل نموذج التعرّف على الجسم
   ----------------------------------------------------------
   كان الزرّ يعلّق على «جارٍ تجهيز الكاميرا…» بلا نهاية، والسبب
   أن التطبيق كان ينزّل نحو ١٥ ميغابايت (محرّك + نموذج) من الإنترنت
   في كل مرة، بلا مهلة ولا رسالة تُخبرك بما يجري. فإن كان الاتصال
   بطيئاً بقي الزرّ معلّقاً إلى الأبد.

   الحلّ هنا ثلاثة أشياء:
   ١) نحفظ النموذج في ذاكرة الجهاز، فلا يُنزَّل إلا أول مرة.
   ٢) نُظهر لك ما يجري خطوة بخطوة بدل صمت مطبق.
   ٣) مهلة قصوى ورسالة واضحة بدل التعليق، مع محاولة على المعالج
      إن فشل تسريع الرسوميات.
   ══════════════════════════════════════════════════════════ */

import { PoseLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

/** اسم مخزن النموذج — cleanupOldCaches في app.js يتجاوزه عمداً */
export const MODEL_CACHE = "noor-model-v1";

/** يمنع الانتظار الأبدي: إمّا ينتهي العمل أو تظهر رسالة مفهومة */
export function withTimeout(promise, ms, message) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** ينزّل ملف النموذج مرّة واحدة ثم يقرأه من ذاكرة الجهاز بعدها */
async function modelBytes(onProgress) {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(MODEL_URL);
    if (hit) {
      onProgress("النموذج جاهز في الجهاز…");
      return await hit.arrayBuffer();
    }
  } catch { /* لا ذاكرة تخزين — ننزّل مباشرة */ }

  onProgress("جارٍ تحميل نموذج التعرّف (٥ ميغا، مرّة واحدة فقط)…");
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error("تعذّر تحميل النموذج (" + res.status + ")");
  const buf = await res.arrayBuffer();

  try {
    const cache = await caches.open(MODEL_CACHE);
    await cache.put(MODEL_URL, new Response(buf.slice(0)));
  } catch { /* امتلأت الذاكرة — لا يضر، سنعيد التحميل لاحقاً */ }

  return buf;
}

/**
 * يجهّز مُحلّل الوضعيات.
 * @param onProgress دالة تستقبل نصّاً عربياً يوضّح المرحلة الحالية
 */
export async function loadLandmarker(onProgress = () => {}) {
  onProgress("جارٍ تجهيز المحرّك…");
  const vision = await withTimeout(
    FilesetResolver.forVisionTasks(WASM_URL),
    45000,
    "تعذّر تحميل محرّك التعرّف. تحقّق من الإنترنت وأعد المحاولة."
  );

  const buffer = await withTimeout(
    modelBytes(onProgress),
    90000,
    "تحميل النموذج طال أكثر من اللازم. تحقّق من الإنترنت وأعد المحاولة."
  );

  const common = {
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4
  };

  // نسخة جديدة لكل محاولة: البايتات تُستهلك عند الإنشاء
  const bytes = () => new Uint8Array(buffer.slice(0));

  onProgress("جارٍ تشغيل التعرّف…");
  try {
    return await withTimeout(
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: bytes(), delegate: "GPU" }, ...common
      }),
      30000,
      "GPU_SLOW"
    );
  } catch (e) {
    // بعض الهواتف لا يعمل عليها تسريع الرسوميات — المعالج أبطأ لكنه يعمل
    onProgress("نجرّب المعالج بدل الرسوميات…");
    return await withTimeout(
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: bytes(), delegate: "CPU" }, ...common
      }),
      45000,
      "تعذّر تشغيل التعرّف على هذا الجهاز."
    );
  }
}

/** قيود الكاميرا بنفس اتجاه الهاتف — وإلا ظهرت الصورة صغيرة ومقصوصة */
export function cameraConstraints() {
  const portrait = window.innerHeight >= window.innerWidth;
  return {
    video: portrait
      ? { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }
      : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  };
}

/** يحوّل عطل الكاميرا إلى جملة عربية تقول ما العمل بالضبط */
function cameraError(e) {
  const name = (e && e.name) || "";
  if (e && e.message === "CAM_TIMEOUT") {
    return new Error(
      "لم تستجب الكاميرا.\n\nغالباً إذن الكاميرا غير ممنوح للتطبيق نفسه:\n" +
      "إعدادات الهاتف ← التطبيقات ← نور ← الأذونات ← الكاميرا ← اسمح.\n" +
      "ثم أغلق التطبيق وافتحه من جديد."
    );
  }
  if (name === "NotAllowedError" || name === "SecurityError")
    return new Error("رُفض إذن الكاميرا. اسمح به من إعدادات التطبيق ثم أعد المحاولة.");
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return new Error("لم أجد كاميرا على هذا الجهاز.");
  if (name === "NotReadableError" || name === "TrackStartError")
    return new Error("الكاميرا مشغولة بتطبيق آخر. أغلقه ثم أعد المحاولة.");
  return new Error("تعذّر فتح الكاميرا. " + ((e && e.message) || ""));
}

/**
 * يفتح الكاميرا بأمان.
 *
 * كان `getUserMedia` يعلّق بلا نهاية داخل تطبيق أندرويد حين لا يملك
 * التطبيق نفسه إذن الكاميرا من النظام: الصفحة تُمنح الإذن، ثم يقف
 * الطلب عند فتح العتاد فلا يرجع بنتيجة ولا بخطأ. لذلك: مهلة قصوى
 * دائماً، وتنازل تدريجي عن القيود، ورسالة تقول ما العمل.
 */
export async function openCamera(video, onProgress = () => {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("هذا المتصفّح لا يدعم الكاميرا. افتح التطبيق من رابط https.");
  }

  // أوقف أي بثّ سابق: كاميرا مشغولة من محاولة سابقة تجعل الطلب يعلّق
  if (video && video.srcObject) {
    try { video.srcObject.getTracks().forEach(t => t.stop()); } catch {}
    video.srcObject = null;
  }

  const attempts = [
    cameraConstraints(),
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false }
  ];

  let stream = null, lastErr = null;
  for (const constraints of attempts) {
    try {
      onProgress("جارٍ فتح الكاميرا…");
      stream = await withTimeout(
        navigator.mediaDevices.getUserMedia(constraints), 15000, "CAM_TIMEOUT"
      );
      break;
    } catch (e) {
      lastErr = e;
      if (e && e.message === "CAM_TIMEOUT") break;   // المهلة لا تُصلحها قيود أبسط
    }
  }
  if (!stream) throw cameraError(lastErr);

  video.srcObject = stream;
  // لا نُعلّق على play: مع muted/playsinline يبدأ العرض وحده
  try { await withTimeout(video.play(), 6000, "PLAY_TIMEOUT"); } catch {}

  if (!video.videoWidth) {
    onProgress("جارٍ انتظار الصورة…");
    await withTimeout(new Promise(done => {
      video.addEventListener("loadedmetadata", done, { once: true });
      video.addEventListener("playing", done, { once: true });
    }), 8000, "FRAME_TIMEOUT").catch(() => {});
  }

  return stream;
}
