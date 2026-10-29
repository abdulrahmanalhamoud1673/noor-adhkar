// Speaks moves into the glasses (they are a Bluetooth headset, so normal
// phone audio plays in your ears) and listens to the glasses' touch button.

const AR_FILE = { a: "إيه", b: "بي", c: "سي", d: "دي", e: "إي", f: "إف", g: "جي", h: "إتش" };
const AR_NUM = ["", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية"];
const AR_PIECE = { p: "بيدق", n: "حصان", b: "فيل", r: "طابية", q: "وزير", k: "ملك" };
const EN_PIECE = { p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" };

const arSq = (s) => `${AR_FILE[s[0]]} ${AR_NUM[+s[1]]}`;
const enSq = (s) => `${s[0].toUpperCase()} ${s[1]}`;

// m: a chess.js move object.
export function phraseMove(m, lang) {
  const check = m.san.includes("#") ? "mate" : m.san.includes("+") ? "check" : "";
  if (lang === "en") {
    let t;
    if (m.flags.includes("k")) t = "Castle short";
    else if (m.flags.includes("q")) t = "Castle long";
    else {
      t = `${EN_PIECE[m.piece]}, ${enSq(m.from)}, to ${enSq(m.to)}`;
      if (m.captured) t += ", takes";
      if (m.promotion) t += `, promote to ${EN_PIECE[m.promotion]}`;
    }
    if (check === "mate") t += ". Checkmate!";
    else if (check) t += ", check";
    return t;
  }
  let t;
  if (m.flags.includes("k")) t = "تبييت قصير";
  else if (m.flags.includes("q")) t = "تبييت طويل";
  else {
    t = `${AR_PIECE[m.piece]} من ${arSq(m.from)} إلى ${arSq(m.to)}`;
    if (m.captured) t += "، يأكل";
    if (m.promotion) t += `، ويترقّى ${AR_PIECE[m.promotion]}`;
  }
  if (check === "mate") t += ". كش مات!";
  else if (check) t += "، كش";
  return t;
}

// Short form for the opponent's move ("he played e5").
export function phraseOpponent(m, lang) {
  if (lang === "en") {
    if (m.flags.includes("k") || m.flags.includes("q")) return "He castled.";
    return `He played ${m.piece === "p" ? "" : EN_PIECE[m.piece] + " "}${enSq(m.to)}.`;
  }
  if (m.flags.includes("k") || m.flags.includes("q")) return "هو بيّت.";
  return `هو لعب ${m.piece === "p" ? "" : AR_PIECE[m.piece] + " "}${arSq(m.to)}.`;
}

export const PHRASES = {
  ar: {
    test: "أهلاً، الصوت شغّال. هيك رح تسمع الحركات.",
    dunno: "ما فهمت.",
    which: "أي قطعة؟",
    check: "انتبه، كش.",
    confused: "ما شفت الحركة منيح، صحّحها من الشاشة.",
    gameover: "خلصت اللعبة.",
    ready: "جاهز. بلّش.",
  },
  en: {
    test: "Hi, sound works. This is how you will hear the moves.",
    dunno: "Didn't get that.",
    which: "Which piece?",
    check: "Careful, check.",
    confused: "I could not see that move. Fix it on the screen.",
    gameover: "Game over.",
    ready: "Ready. Go.",
  },
};

export class Speaker {
  constructor() {
    this.lang = "ar";
    this.rate = 1.05;
    this.voices = [];
    this.keepalive = null;
    this.last = "";
    this.onTap = null;
    if ("speechSynthesis" in window) {
      const load = () => { this.voices = speechSynthesis.getVoices(); };
      load();
      speechSynthesis.addEventListener?.("voiceschanged", load);
    }
  }

  get available() { return "speechSynthesis" in window; }

  pickVoice() {
    const want = this.lang === "en" ? "en" : "ar";
    const vs = this.voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(want));
    return vs.find((v) => v.localService) || vs[0] || null;
  }

  hasArabicVoice() {
    return this.voices.some((v) => v.lang && v.lang.toLowerCase().startsWith("ar"));
  }

  say(text, { remember = true } = {}) {
    if (remember) this.last = text;
    if (!this.available) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = this.pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || (this.lang === "en" ? "en-US" : "ar-SA");
    u.rate = this.rate;
    speechSynthesis.speak(u);
  }

  repeat() { if (this.last) this.say(this.last); }

  // A near-silent audio loop keeps the Bluetooth link to the glasses open, so
  // the first word is not cut off, and lets the page receive the glasses'
  // play/pause taps through the Media Session API.
  async startKeepalive() {
    if (this.keepalive) return;
    const a = new Audio(URL.createObjectURL(silentWav(8)));
    a.loop = true;
    a.volume = 1;
    this.keepalive = a;
    try { await a.play(); } catch { /* needs a tap first */ }
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Chess Glasses", artist: "♞" });
        const tap = (kind) => () => {
          a.play().catch(() => {});
          navigator.mediaSession.playbackState = "playing";
          this.onTap?.(kind);
        };
        navigator.mediaSession.setActionHandler("play", tap("play"));
        navigator.mediaSession.setActionHandler("pause", tap("pause"));
        navigator.mediaSession.setActionHandler("nexttrack", tap("next"));
        navigator.mediaSession.setActionHandler("previoustrack", tap("prev"));
        navigator.mediaSession.playbackState = "playing";
      } catch { /* not supported */ }
    }
  }
}

// WAV with the quietest possible noise (silence would be ignored as media).
function silentWav(seconds) {
  const rate = 8000, n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, (i & 1) ? 1 : -1, true);
  return new Blob([buf], { type: "audio/wav" });
}
