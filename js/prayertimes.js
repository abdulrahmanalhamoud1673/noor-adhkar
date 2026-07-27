/* ============================================================
   حاسبة أوقات الصلاة — تعمل بدون إنترنت
   مبنية على الحسابات الفلكية القياسية (خوارزمية PrayTimes)
   ============================================================ */

const PT = (function () {
  // --- دوال مساعدة للزوايا (بالدرجات بدل الراديان) ---
  const dtr = d => (d * Math.PI) / 180;
  const rtd = r => (r * 180) / Math.PI;
  const sin = d => Math.sin(dtr(d));
  const cos = d => Math.cos(dtr(d));
  const tan = d => Math.tan(dtr(d));
  const arcsin = x => rtd(Math.asin(x));
  const arccos = x => rtd(Math.acos(x));
  const arctan2 = (y, x) => rtd(Math.atan2(y, x));
  const arccot = x => rtd(Math.atan(1 / x));

  const fixAngle = a => fix(a, 360);
  const fixHour = a => fix(a, 24);
  function fix(a, b) {
    a = a - b * Math.floor(a / b);
    return a < 0 ? a + b : a;
  }

  // طرق الحساب المعتمدة
  const METHODS = {
    jordan: { name: "دائرة الإفتاء الأردنية", fajr: 18, isha: 18 },
    mwl: { name: "رابطة العالم الإسلامي", fajr: 18, isha: 17 },
    egypt: { name: "الهيئة المصرية العامة للمساحة", fajr: 19.5, isha: 17.5 },
    makkah: { name: "أم القرى (مكة)", fajr: 18.5, isha: "90 min" },
    karachi: { name: "جامعة العلوم الإسلامية بكراتشي", fajr: 18, isha: 18 },
    isna: { name: "الجمعية الإسلامية بأمريكا الشمالية", fajr: 15, isha: 15 }
  };

  // التاريخ اليولياني
  function julian(year, month, day) {
    if (month <= 2) {
      year -= 1;
      month += 12;
    }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return (
      Math.floor(365.25 * (year + 4716)) +
      Math.floor(30.6001 * (month + 1)) +
      day + B - 1524.5
    );
  }

  // موقع الشمس: الميل + معادلة الزمن
  function sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = fixAngle(357.529 + 0.98560028 * D);
    const q = fixAngle(280.459 + 0.98564736 * D);
    const L = fixAngle(q + 1.915 * sin(g) + 0.02 * sin(2 * g));
    const e = 23.439 - 0.00000036 * D;
    const RA = fixHour(arctan2(cos(e) * sin(L), cos(L)) / 15);
    const decl = arcsin(sin(e) * sin(L));
    const eqt = q / 15 - RA;
    return { declination: decl, equation: eqt };
  }

  /**
   * حساب أوقات الصلاة
   * @param {Date} date التاريخ المطلوب
   * @param {number} lat خط العرض
   * @param {number} lng خط الطول
   * @param {number} tz فرق التوقيت بالساعات (الأردن = 3)
   * @param {string} methodKey مفتاح طريقة الحساب
   * @param {string} asrMethod 'standard' (الجمهور) أو 'hanafi'
   * @returns {Object} أوقات بصيغة دقائق منذ منتصف الليل
   */
  function calculate(date, lat, lng, tz, methodKey = "jordan", asrMethod = "standard") {
    const method = METHODS[methodKey] || METHODS.jordan;
    const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);

    // الوقت الشمسي لمنتصف النهار (بالساعات)
    function midDay(t) {
      const { equation } = sunPosition(jd + t);
      return fixHour(12 - equation);
    }

    // الوقت الذي تكون فيه الشمس على زاوية معينة تحت/فوق الأفق
    function sunAngleTime(angle, t, ccw) {
      const { declination } = sunPosition(jd + t);
      const noon = midDay(t);
      const inner =
        (-sin(angle) - sin(declination) * sin(lat)) /
        (cos(declination) * cos(lat));
      if (inner > 1 || inner < -1) return NaN; // مناطق قطبية
      const T = (1 / 15) * arccos(inner);
      return noon + (ccw ? -T : T);
    }

    // وقت العصر حسب طول الظل
    function asrTime(factor, t) {
      const { declination } = sunPosition(jd + t);
      const angle = -arccot(factor + tan(Math.abs(lat - declination)));
      return sunAngleTime(angle, t, false);
    }

    // القيم الابتدائية ثم التكرار للدقة
    let times = {
      fajr: 5 / 24,
      sunrise: 6 / 24,
      dhuhr: 12 / 24,
      asr: 13 / 24,
      maghrib: 18 / 24,
      isha: 19 / 24
    };

    for (let i = 0; i < 3; i++) {
      const t = { ...times };
      times.fajr = sunAngleTime(method.fajr, t.fajr, true);
      times.sunrise = sunAngleTime(0.833, t.sunrise, true);
      times.dhuhr = midDay(t.dhuhr);
      times.asr = asrTime(asrMethod === "hanafi" ? 2 : 1, t.asr);
      times.maghrib = sunAngleTime(0.833, t.maghrib, false);
      times.isha =
        typeof method.isha === "string"
          ? times.maghrib + parseInt(method.isha) / 60
          : sunAngleTime(method.isha, t.isha, false);
      for (const k in times) times[k] = times[k] / 24;
    }

    // التحويل للتوقيت المحلي + دقيقتان احتياط للظهر
    const result = {};
    for (const k in times) {
      let h = times[k] * 24 + tz - lng / 15;
      if (k === "dhuhr") h += 2 / 60;
      result[k] = Math.round(fixHour(h) * 60); // دقائق منذ منتصف الليل
    }
    return result;
  }

  /** تحويل الدقائق إلى نص 12 ساعة عربي */
  function fmt(minutes) {
    if (isNaN(minutes)) return "--:--";
    let h = Math.floor(minutes / 60) % 24;
    const m = Math.round(minutes % 60);
    const period = h >= 12 ? "م" : "ص";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }

  return { calculate, fmt, METHODS };
})();
