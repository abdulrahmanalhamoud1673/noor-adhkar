/* ══════════════════════════════════════════════════════════
   نور — الشيخ المتحرّك
   مجسّم يؤدّي وضعيات الصلاة وينتقل بينها بحركة سلسة.
   كل الوضعيات تواجه اليمين (اتجاه القبلة في الرسم).
   ══════════════════════════════════════════════════════════ */

const POSE_JOINTS = {
  qiyam: {   // اليدان على الصدر/البطن
    head: [100, 42], shoulder: [100, 64], hip: [100, 118],
    elbow: [113, 92], wrist: [101, 105],
    knee: [100, 152], ankle: [100, 182], toe: [117, 184],
    face: [1, 0]
  },
  takbir: {  // اليدان مرفوعتان عند الأذنين
    head: [100, 42], shoulder: [100, 64], hip: [100, 118],
    elbow: [118, 76], wrist: [115, 45],
    knee: [100, 152], ankle: [100, 182], toe: [117, 184],
    face: [1, 0]
  },
  itidal: {  // منتصب بعد الركوع
    head: [100, 42], shoulder: [100, 64], hip: [100, 118],
    elbow: [110, 94], wrist: [104, 118],
    knee: [100, 152], ankle: [100, 182], toe: [117, 184],
    face: [1, 0]
  },
  ruku: {    // الظهر أفقي واليدان على الركبتين
    head: [163, 106], shoulder: [140, 110], hip: [92, 118],
    elbow: [131, 131], wrist: [102, 149],
    knee: [92, 152], ankle: [92, 182], toe: [109, 184],
    face: [0.85, 0.5]
  },
  sujud: {   // الجبهة على الأرض واليدان بجانب الرأس
    head: [146, 167], shoulder: [112, 160], hip: [72, 126],
    elbow: [120, 176], wrist: [140, 183],
    knee: [70, 170], ankle: [44, 181], toe: [56, 185],
    face: [0.5, 0.85]
  },
  julus: {   // جالس واليدان على الفخذين
    head: [100, 78], shoulder: [100, 98], hip: [100, 148],
    elbow: [111, 123], wrist: [127, 151],
    knee: [137, 158], ankle: [107, 178], toe: [125, 182],
    face: [1, 0]
  }
};
POSE_JOINTS.tashahhud = POSE_JOINTS.julus;
POSE_JOINTS.salam = { ...POSE_JOINTS.julus, face: [0.2, -0.3] };

const POSE_AR = {
  qiyam: "قيام", takbir: "تكبير", itidal: "اعتدال",
  ruku: "ركوع", sujud: "سجود", julus: "جلوس",
  tashahhud: "تشهّد", salam: "تسليم", none: "لا أراك"
};

const JOINT_KEYS = ["head", "shoulder", "hip", "elbow", "wrist", "knee", "ankle", "toe", "face"];

const svgEl = (tag, attrs) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export function createSheikh(container) {
  container.innerHTML = "";
  const svg = svgEl("svg", { viewBox: "0 0 200 200", class: "sheikh-svg" });

  svg.appendChild(svgEl("rect", {
    x: 18, y: 183, width: 164, height: 9, rx: 4, fill: "rgba(212,175,55,.28)"
  }));
  svg.appendChild(svgEl("line", {
    x1: 10, y1: 186, x2: 190, y2: 186,
    stroke: "rgba(212,175,55,.45)", "stroke-width": 2
  }));

  const parts = {
    thigh:    svgEl("line", { stroke: "#cfe6db", "stroke-width": 17, "stroke-linecap": "round" }),
    shin:     svgEl("line", { stroke: "#cfe6db", "stroke-width": 14, "stroke-linecap": "round" }),
    foot:     svgEl("line", { stroke: "#b9d6c9", "stroke-width": 9,  "stroke-linecap": "round" }),
    robe:     svgEl("line", { stroke: "#eef7f2", "stroke-width": 32, "stroke-linecap": "round" }),
    upperArm: svgEl("line", { stroke: "#e2f0e9", "stroke-width": 13, "stroke-linecap": "round" }),
    forearm:  svgEl("line", { stroke: "#e2f0e9", "stroke-width": 11, "stroke-linecap": "round" }),
    hand:     svgEl("circle", { r: 6, fill: "#d9b38c" }),
    neck:     svgEl("line", { stroke: "#d9b38c", "stroke-width": 9, "stroke-linecap": "round" }),
    head:     svgEl("circle", { r: 15, fill: "#d9b38c" }),
    beard:    svgEl("ellipse", { rx: 9, ry: 11, fill: "#f2f6f4" }),
    turban:   svgEl("ellipse", { rx: 18, ry: 9, fill: "#f7fbf9", stroke: "#d4af37", "stroke-width": 1.5 })
  };

  ["thigh", "shin", "foot", "robe", "upperArm", "forearm", "hand", "neck", "head", "beard", "turban"]
    .forEach(k => svg.appendChild(parts[k]));

  container.appendChild(svg);

  let current = JSON.parse(JSON.stringify(POSE_JOINTS.qiyam));
  let anim = null;

  function paint(j) {
    const [hx, hy] = j.head, [sx, sy] = j.shoulder;
    const [fx, fy] = j.face;
    const flen = Math.hypot(fx, fy) || 1;
    const ux = fx / flen, uy = fy / flen;

    // اتجاه أعلى الرأس: مزيج بين الرقبة والعمودي حتى لا تنزلق العمامة أمام الوجه
    let dx = hx - sx, dy = hy - sy;
    const nlen = Math.hypot(dx, dy) || 1;
    dx = dx / nlen;
    dy = dy / nlen - 1;
    const dlen = Math.hypot(dx, dy) || 1;
    dx /= dlen; dy /= dlen;

    const set = (el, a, b) => {
      el.setAttribute("x1", a[0]); el.setAttribute("y1", a[1]);
      el.setAttribute("x2", b[0]); el.setAttribute("y2", b[1]);
    };
    set(parts.thigh, j.hip, j.knee);
    set(parts.shin, j.knee, j.ankle);
    set(parts.foot, j.ankle, j.toe);
    set(parts.robe, j.shoulder, j.hip);
    set(parts.upperArm, j.shoulder, j.elbow);
    set(parts.forearm, j.elbow, j.wrist);
    set(parts.neck, j.shoulder, j.head);

    parts.hand.setAttribute("cx", j.wrist[0]);
    parts.hand.setAttribute("cy", j.wrist[1]);
    parts.head.setAttribute("cx", hx);
    parts.head.setAttribute("cy", hy);
    parts.beard.setAttribute("cx", hx + ux * 7);
    parts.beard.setAttribute("cy", hy + uy * 7 + 4);

    const tx = hx + dx * 9, ty = hy + dy * 9;
    parts.turban.setAttribute("cx", tx);
    parts.turban.setAttribute("cy", ty);
    parts.turban.setAttribute(
      "transform",
      `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI + 90} ${tx} ${ty})`
    );
  }

  paint(current);

  return {
    setPose(key, duration = 650) {
      const target = POSE_JOINTS[key] || POSE_JOINTS.qiyam;
      const from = JSON.parse(JSON.stringify(current));
      if (anim) cancelAnimationFrame(anim);

      if (duration <= 0) {
        for (const k of JOINT_KEYS) current[k] = [...target[k]];
        paint(current);
        return;
      }

      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / duration);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        for (const k of JOINT_KEYS) {
          current[k] = [
            from[k][0] + (target[k][0] - from[k][0]) * e,
            from[k][1] + (target[k][1] - from[k][1]) * e
          ];
        }
        paint(current);
        if (p < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
  };
}

export { POSE_AR };
