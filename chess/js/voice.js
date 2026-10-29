// Voice input: you whisper the opponent's move ("e5", "knight f3",
// "e7 e5", "castle") and it is matched against the legal moves.

const LETTERS = {
  a: ["a", "ay", "eh", "ei", "alpha", "إيه", "ايه", "أيه"],
  b: ["b", "be", "bee", "bea", "bravo", "بي"],
  c: ["c", "see", "sea", "si", "cee", "charlie", "سي"],
  d: ["d", "dee", "de", "delta", "دي"],
  e: ["e", "ee", "echo", "إي", "اي", "ئي"],
  f: ["f", "ef", "eff", "foxtrot", "إف", "اف"],
  g: ["g", "gee", "ji", "jee", "golf", "جي"],
  h: ["h", "age", "aitch", "ach", "hotel", "إتش", "اتش", "إتش"],
};
const DIGITS = {
  1: ["1", "one", "won", "واحد"],
  2: ["2", "two", "too", "اثنين", "اثنان", "اتنين", "تنين"],
  3: ["3", "three", "tree", "free", "ثلاثة", "ثلاثه", "تلاتة", "تلاته", "تلاتي"],
  4: ["4", "four", "for", "fore", "أربعة", "اربعة", "اربعه", "أربعه"],
  5: ["5", "five", "خمسة", "خمسه"],
  6: ["6", "six", "sex", "sicks", "ستة", "سته", "ستّة"],
  7: ["7", "seven", "سبعة", "سبعه"],
  8: ["8", "eight", "ate", "ثمانية", "ثمانيه", "تمانية", "تمانيه"],
};
const PIECES = {
  n: ["knight", "night", "nite", "horse", "حصان", "الحصان", "فرس"],
  b: ["bishop", "فيل", "الفيل"],
  r: ["rook", "rock", "tower", "طابية", "طابيه", "الطابية", "رخ", "قلعة"],
  q: ["queen", "وزير", "الوزير", "ملكة", "ملكه"],
  k: ["king", "ملك", "الملك", "شاه"],
  p: ["pawn", "pond", "pan", "بيدق", "البيدق", "جندي", "عسكري"],
};
const CASTLE = ["castle", "castles", "castling", "تبييت", "بيت", "بيّت", "روك"];
const LONG = ["long", "queenside", "طويل"];
const UNDO = ["undo", "back", "تراجع", "رجوع", "ارجع"];
const REPEAT = ["repeat", "again", "كرر", "عيد", "اعيد", "كمان"];

const lookup = (table) => {
  const m = new Map();
  for (const [k, words] of Object.entries(table)) for (const w of words) m.set(w, k);
  return m;
};
const L = lookup(LETTERS), D = lookup(DIGITS), P = lookup(PIECES);

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[ً-ْ]/g, "")       // Arabic diacritics
    .replace(/\bqueen\s*side\b/g, "queenside")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Turns a transcript into { squares, piece, castle, long, command }.
export function parseSpeech(text) {
  const toks = normalize(text);
  const out = { squares: [], alt: [], piece: null, castle: false, long: false, command: null };
  let letter = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (UNDO.includes(t)) { out.command = "undo"; continue; }
    if (REPEAT.includes(t)) { out.command = "repeat"; continue; }
    if (CASTLE.includes(t)) { out.castle = true; continue; }
    if (LONG.includes(t)) { out.long = true; continue; }
    let m;
    if ((m = t.match(/^([a-h])([1-8])([a-h])([1-8])$/))) { out.squares.push(m[1] + m[2], m[3] + m[4]); letter = null; continue; }
    if ((m = t.match(/^([a-h])([1-8])$/))) { out.squares.push(t); letter = null; continue; }
    if ((m = t.match(/^8([1-8])$/))) { out.alt.push("a" + m[1]); continue; } // "a4" heard as "84"
    if (P.has(t)) { out.piece = P.get(t); letter = null; continue; }
    if (letter && (D.has(t) || t === "to")) {
      out.squares.push(letter + (t === "to" ? "2" : D.get(t)));
      letter = null;
      continue;
    }
    if (L.has(t)) { letter = L.get(t); continue; }
    if (/^[1-8]$/.test(t) && !letter) continue;
    letter = null;
  }
  return out;
}

// Finds the legal move a parsed phrase describes.
// Returns { move } or { error: "none" | "ambiguous", candidates }.
export function matchMove(parsed, legal) {
  if (parsed.castle) {
    const c = legal.filter((m) => m.flags.includes(parsed.long ? "q" : "k"));
    const any = legal.filter((m) => m.flags.includes("k") || m.flags.includes("q"));
    if (c.length === 1) return { move: c[0] };
    if (!parsed.long && any.length === 1) return { move: any[0] };
    return { error: "none", candidates: any };
  }
  const tryList = (squares) => {
    if (squares.length >= 2) {
      const from = squares[0], to = squares[squares.length - 1];
      const c = legal.filter((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === "q"));
      if (c.length) return { move: c[0] };
      return null;
    }
    if (squares.length === 1) {
      const to = squares[0];
      let c = legal.filter((m) => m.to === to && (!m.promotion || m.promotion === "q"));
      if (parsed.piece) c = c.filter((m) => m.piece === parsed.piece);
      else {
        const pawns = c.filter((m) => m.piece === "p");
        if (pawns.length) c = pawns;   // a bare square means a pawn move
      }
      if (c.length === 1) return { move: c[0] };
      if (c.length > 1) return { error: "ambiguous", candidates: c };
    }
    return null;
  };
  return tryList(parsed.squares) || tryList([...parsed.squares, ...parsed.alt]) ||
         tryList(parsed.alt) || { error: "none", candidates: [] };
}

export class Listener {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.SR = SR;
    this.active = false;
    this.rec = null;
    this.lang = "en-US";
    this.onPhrases = null;  // (string[]) => void
    this.onError = null;
    this.onListening = null;
  }

  get available() { return !!this.SR; }

  start() {
    if (!this.SR || this.active) return;
    this.active = true;
    this._run();
  }

  stop() {
    this.active = false;
    try { this.rec?.abort(); } catch { /* already stopped */ }
    this.rec = null;
    this.onListening?.(false);
  }

  _run() {
    if (!this.active) return;
    const rec = new this.SR();
    this.rec = rec;
    rec.lang = this.lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.onstart = () => this.onListening?.(true);
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      const phrases = [];
      for (let i = 0; i < r.length; i++) phrases.push(r[i].transcript);
      this.onPhrases?.(phrases);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.active = false;
        this.onError?.(e.error);
      }
    };
    rec.onend = () => {
      this.onListening?.(false);
      if (this.active) setTimeout(() => this._run(), 250);
    };
    try { rec.start(); } catch { setTimeout(() => this._run(), 800); }
  }
}
