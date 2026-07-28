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
