import { Chess } from "../lib/chess.js";
import { Engine } from "./engine.js";
import { BoardWatcher, sqIndex } from "./vision.js";
import { Speaker, phraseMove, phraseOpponent, PHRASES } from "./say.js";
import { Listener, parseSpeech, matchMove } from "./voice.js";
import { BoardView } from "./board.js";

const $ = (id) => document.getElementById(id);
const GLYPH = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };

// ---------- settings ----------
const DEFAULTS = { color: "w", input: "camera", lang: "ar", think: "1500", echo: true, tapctl: true };
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem("hamsa-settings") || "{}")); } catch { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem("hamsa-settings", JSON.stringify(settings)); } catch { /* ignore */ } };

document.querySelectorAll("[data-key]").forEach((group) => {
  const key = group.dataset.key;
  const buttons = group.querySelectorAll("button[data-val]");
  const paint = () => buttons.forEach((b) => b.classList.toggle("on", b.dataset.val === String(settings[key])));
  buttons.forEach((b) => b.addEventListener("click", () => { settings[key] = b.dataset.val; saveSettings(); paint(); }));
  paint();
});
$("opt-echo").checked = !!settings.echo;
$("opt-tapctl").checked = !!settings.tapctl;
$("opt-echo").addEventListener("change", (e) => { settings.echo = e.target.checked; saveSettings(); });
$("opt-tapctl").addEventListener("change", (e) => { settings.tapctl = e.target.checked; saveSettings(); });

// ---------- parts ----------
const game = new Chess();
const engine = new Engine();
const speaker = new Speaker();
const listener = new Listener();
const view = new BoardView($("board"));
const video = $("video");
let watcher = null;
let stream = null;
let suggestion = null;      // move the engine wants you to play now
let shown = null;           // last suggestion, kept on screen
let lastMove = null;
let lastEval = null;
let pendingEcho = "";
let holdAuto = false;       // after "undo": wait for you to enter your real move
let turnToken = 0;
let confusedSaid = false;
let camState = {};
let wakeLock = null;
let started = false;

engine.start()
  .then(() => { $("engine-chip").textContent = "المحرك جاهز"; $("engine-chip").className = "chip ok"; })
  .catch(() => { $("engine-chip").textContent = "المحرك ما اشتغل"; $("engine-chip").className = "chip bad"; });

const show = (id) => ["setup", "calib", "play"].forEach((s) => { $(s).hidden = s !== id; });
const setStatus = (t) => { $("status-text").textContent = t; };
const banner = (t) => { const b = $("banner"); b.hidden = !t; b.textContent = t || ""; };

// ---------- sound ----------
$("btn-test").addEventListener("click", async () => {
  speaker.lang = settings.lang;
  await speaker.startKeepalive();
  speaker.say(PHRASES[settings.lang].test, { remember: false });
  voiceNote();
});

function voiceNote() {
  const n = $("voice-note");
  if (!speaker.available) { n.hidden = false; n.textContent = "المتصفح هاد ما فيه نطق. جرّب Chrome."; return; }
  setTimeout(() => {
    if (settings.lang === "ar" && speaker.voices.length && !speaker.hasArabicVoice()) {
      n.hidden = false;
      n.textContent = "ما لقيت صوت عربي على موبايلك. نزّل «العربية» من إعدادات تحويل النص إلى كلام، أو اختار English.";
    } else n.hidden = true;
  }, 600);
}

speaker.onTap = (kind) => {
  if (!settings.tapctl || !started) return;
  if (kind === "next" && settings.input === "voice") listener.start();
  else speaker.repeat();
};

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && started) {
    requestWakeLock();
    watcher?.resync();
  }
});

// ---------- start ----------
$("btn-start").addEventListener("click", start);

async function start() {
  speaker.lang = settings.lang;
  await speaker.startKeepalive();
  requestWakeLock();
  game.reset();
  suggestion = shown = lastMove = null;
  pendingEcho = "";
  holdAuto = false;
  view.flipped = settings.color === "b";
  if (settings.input === "camera") {
    if (!(await openCamera())) return;
    show("calib");
    resetCalib();
  } else {
    show("play");
    enterPlay();
  }
}

async function openCamera() {
  if (stream) return true;
  if (!navigator.mediaDevices?.getUserMedia) {
    banner("");
    $("voice-note").hidden = false;
    $("voice-note").textContent = "الكاميرا بتشتغل بس من رابط https. افتح الصفحة من الرابط الصحيح.";
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    if (!video.videoWidth) await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
    watcher = new BoardWatcher(video);
    wireWatcher();
    return true;
  } catch (err) {
    $("voice-note").hidden = false;
    $("voice-note").textContent = "ما قدرت افتح الكاميرا (" + (err.name || err.message) + "). اسمح للصفحة تستعمل الكاميرا.";
    return false;
  }
}

// ---------- calibration ----------
let corners = [];
let drag = -1;
const calibCanvas = $("calib-overlay");

// Where the video picture actually sits inside its box (object-fit: contain).
function videoBox(canvas) {
  const r = canvas.getBoundingClientRect();
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const s = Math.min(r.width / vw, r.height / vh);
  const w = vw * s, h = vh * s;
  return { r, x: (r.width - w) / 2, y: (r.height - h) / 2, w, h };
}
const toNorm = (canvas, e) => {
  const b = videoBox(canvas);
  return [(e.clientX - b.r.left - b.x) / b.w, (e.clientY - b.r.top - b.y) / b.h];
};

function resetCalib() {
  corners = [];
  if (watcher) { watcher.orientation = null; watcher.H = null; }
  $("btn-calib-ok").disabled = true;
  $("btn-calib-rotate").disabled = true;
  $("calib-msg").innerHTML = game.history().length
    ? "اكبس على <b>الزوايا الأربع للمربعات</b> (مش الإطار). القطع لازم تكون متل ما هي على اللوح بالشاشة."
    : "رتّب القطع بوضع البداية. بعدين اكبس على <b>الزوايا الأربع للمربعات</b> (مش الإطار اللي حوالين الرقعة).";
  drawCalib();
}

calibCanvas.addEventListener("pointerdown", (e) => {
  const p = toNorm(calibCanvas, e);
  const b = videoBox(calibCanvas);
  drag = corners.findIndex((c) => Math.hypot((c[0] - p[0]) * b.w, (c[1] - p[1]) * b.h) < 28);
  if (drag < 0 && corners.length < 4) { corners.push(p); drag = corners.length - 1; }
  calibCanvas.setPointerCapture?.(e.pointerId);
  drawCalib();
});
calibCanvas.addEventListener("pointermove", (e) => {
  if (drag < 0) return;
  corners[drag] = toNorm(calibCanvas, e);
  drawCalib();
});
const endDrag = () => {
  if (drag < 0) return;
  drag = -1;
  if (corners.length === 4) runCalibration();
  else drawCalib();
};
calibCanvas.addEventListener("pointerup", endDrag);
calibCanvas.addEventListener("pointercancel", endDrag);

async function runCalibration() {
  try {
    watcher.setCorners(corners);
    const feat = await watcher.grabAverage(6);
    const r = watcher.calibrate(game.board(), feat);
    $("btn-calib-ok").disabled = false;
    $("btn-calib-rotate").disabled = false;
    $("calib-msg").innerHTML = r.margin < 0.25
      ? "مش متأكد من الاتجاه. لازم يكون <b>a1</b> عند زاوية الأبيض اليسار. إذا لا، اكبس «دوّر». فيك تسحب أي زاوية لتظبطها."
      : "تمام. تأكد إن <b>a1</b> عند زاوية الأبيض اليسار وإن الخطوط فوق المربعات. فيك تسحب أي زاوية لتظبطها.";
  } catch (err) {
    $("calib-msg").textContent = "الزوايا مش مزبوطة، جرّب من جديد.";
  }
  drawCalib();
}

$("btn-calib-reset").addEventListener("click", resetCalib);
$("btn-calib-rotate").addEventListener("click", () => { watcher.nextOrientation(); drawCalib(); });
$("btn-calib-ok").addEventListener("click", () => {
  $("play-cam").prepend(video);
  show("play");
  watcher.resync();
  watcher.start();
  enterPlay();
});

function sizeCanvas(c) {
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  return ctx;
}

function drawCalib() {
  const ctx = sizeCanvas(calibCanvas);
  const b = videoBox(calibCanvas);
  const P = ([x, y]) => [b.x + x * b.w, b.y + y * b.h];
  if (watcher?.orientation) {
    drawGrid(ctx, P, true);
  } else {
    ctx.strokeStyle = "#2bd47a"; ctx.lineWidth = 2;
    if (corners.length > 1) {
      ctx.beginPath();
      corners.forEach((c, i) => { const [x, y] = P(c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
  }
  corners.forEach((c, i) => {
    const [x, y] = P(c);
    ctx.fillStyle = "rgba(43,212,122,.25)"; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill();
    ctx.fillStyle = "#2bd47a"; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.fillText(String(i + 1), x + 9, y - 9);
  });
}

// Grid lines and square names over the camera picture.
function drawGrid(ctx, P, labels) {
  const g = (u, v) => P(watcher.gridToNorm(u, v));
  ctx.strokeStyle = "rgba(43,212,122,.9)"; ctx.lineWidth = 1.5;
  for (let k = 0; k <= 8; k++) {
    ctx.beginPath(); ctx.moveTo(...g(k, 0)); ctx.lineTo(...g(k, 8)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...g(0, k)); ctx.lineTo(...g(8, k)); ctx.stroke();
  }
  if (!labels) return;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let sq = 0; sq < 64; sq++) {
    const name = "abcdefgh"[sq & 7] + ((sq >> 3) + 1);
    const corner = ["a1", "h1", "a8", "h8"].includes(name);
    const pts = watcher.squarePolygon(sq).map(P);
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    ctx.font = corner ? "bold 15px sans-serif" : "10px sans-serif";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.strokeText(name, cx, cy);
    ctx.fillStyle = corner ? "#ffe066" : "rgba(255,255,255,.85)"; ctx.fillText(name, cx, cy);
  }
}

// Suggestion squares lit up on the live camera picture.
function drawPlayOverlay() {
  if (!watcher?.orientation || $("play-cam").hidden) return;
  const c = $("play-overlay");
  const ctx = sizeCanvas(c);
  const b = videoBox(c);
  const P = ([x, y]) => [b.x + x * b.w, b.y + y * b.h];
  const fillSq = (name, color) => {
    const pts = watcher.squarePolygon(sqIndex(name)).map(P);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  };
  ctx.strokeStyle = "rgba(43,212,122,.7)"; ctx.lineWidth = 1.5;
  const g = (u, v) => P(watcher.gridToNorm(u, v));
  ctx.beginPath(); ctx.moveTo(...g(0, 0)); ctx.lineTo(...g(8, 0)); ctx.lineTo(...g(8, 8)); ctx.lineTo(...g(0, 8)); ctx.closePath(); ctx.stroke();
  if (lastMove) { fillSq(lastMove.from, "rgba(245,215,110,.35)"); fillSq(lastMove.to, "rgba(245,215,110,.35)"); }
  if (suggestion && game.turn() === settings.color) { fillSq(suggestion.from, "rgba(43,212,122,.55)"); fillSq(suggestion.to, "rgba(43,212,122,.55)"); }
  if (camState.changed?.length && !camState.moving) {
    ctx.strokeStyle = "#f5a524"; ctx.lineWidth = 2;
    for (const sq of camState.changed) {
      const pts = watcher.squarePolygon(sq).map(P);
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.stroke();
    }
  }
  if (camState.moving) {
    const w = b.r.width;
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(w - 100, 8, 92, 24);
    ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif"; ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("في حركة…", w - 16, 20);
  }
}

function wireWatcher() {
  watcher.getGame = () => game;
  watcher.getPrefer = () => (game.turn() === settings.color ? suggestion : null);
  watcher.onMove = (moves) => {
    for (const m of moves) applyMove(m, "camera");
    confusedSaid = false;
    banner("");
    nextTurn();
  };
  // The camera saw the last move better a moment later: replace it.
  watcher.onCorrect = (undoCount, moves) => {
    engine.cancel();
    for (let i = 0; i < undoCount; i++) game.undo();
    const h = game.history({ verbose: true });
    lastMove = h[h.length - 1] || null;
    suggestion = null;
    pendingEcho = "";
    for (const m of moves) applyMove(m, "camera");
    confusedSaid = false;
    banner("");
    nextTurn();
  };
  watcher.onState = (s) => {
    camState = s;
    if (s.confused && !confusedSaid) {
      confusedSaid = true;
      banner("ما فهمت الحركة الأخيرة. اكبسها على اللوح تحت (مربع البداية بعدين النهاية).");
      speaker.say(PHRASES[settings.lang].confused, { remember: false });
    }
    drawPlayOverlay();
  };
}

// ---------- playing ----------
function enterPlay() {
  started = true;
  const cam = settings.input === "camera";
  $("play-cam").hidden = !cam;
  $("btn-resync").hidden = !cam;
  $("btn-listen").hidden = settings.input !== "voice";
  if (settings.input === "voice" && !listener.available) {
    banner("المتصفح هاد ما بيسمع صوت. استعمل Chrome، أو اكبس الحركات على اللوح.");
  }
  listener.onPhrases = handlePhrases;
  listener.onListening = (on) => { if (settings.input === "voice") $("btn-listen").textContent = on ? "عم اسمع…" : "اسمعني"; };
  listener.onError = () => banner("ما في إذن للمايك. اسمح للصفحة تستعمل المايك.");
  speaker.say(PHRASES[settings.lang].ready, { remember: false });
  nextTurn();
}

function applyMove(m, source) {
  const mover = game.turn();
  const res = game.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
  lastMove = res;
  if (mover !== settings.color && settings.echo) pendingEcho = phraseOpponent(res, settings.lang);
  if (mover === settings.color) suggestion = null;
  if (source === "tap") { holdAuto = false; watcher?.resync(); }
  return res;
}

async function nextTurn() {
  const token = ++turnToken;
  render();
  if (game.isGameOver()) {
    listener.stop();
    setStatus(game.isCheckmate() ? "كش مات" : "تعادل");
    speaker.say((pendingEcho ? pendingEcho + " " : "") + PHRASES[settings.lang].gameover, { remember: false });
    pendingEcho = "";
    return;
  }
  const mine = game.turn() === settings.color;
  if (!mine) {
    suggestion = null;
    if (pendingEcho) { speaker.say(pendingEcho, { remember: false }); pendingEcho = ""; }
    setStatus(settings.input === "camera" ? "دور الخصم. الكاميرا عم تراقب." : settings.input === "voice" ? "دور الخصم. احكي حركته." : "دور الخصم. اكبس حركته على اللوح.");
    if (settings.input === "voice") listener.start();
    render();
    return;
  }
  listener.stop();
  setStatus("عم فكّر…");
  const res = await engine.best(game.fen(), +settings.think).catch((err) => { setStatus("المحرك وقف: " + err.message); return null; });
  if (token !== turnToken || !res?.uci) return;
  const mv = game.moves({ verbose: true }).find((m) => m.from === res.from && m.to === res.to && (!res.promotion || m.promotion === res.promotion));
  if (!mv) return;
  suggestion = shown = mv;
  lastEval = res.score;
  const text = phraseMove(mv, settings.lang);
  speaker.say(pendingEcho ? pendingEcho + " " + text : text, { remember: false });
  speaker.last = text;
  pendingEcho = "";
  if (settings.input === "camera") {
    setStatus("العبها، والكاميرا بتتأكد.");
    render();
  } else if (holdAuto) {
    setStatus("اكبس الحركة اللي لعبتها فعلاً على اللوح.");
    render();
  } else {
    // You play it on the real board; it is entered for you.
    applyMove(mv, "auto");
    nextTurn();
  }
}

function handlePhrases(phrases) {
  setStatus("سمعت: " + phrases[0]);
  let ambiguous = false;
  for (const p of phrases) {
    const parsed = parseSpeech(p);
    if (parsed.command === "repeat") { speaker.repeat(); return; }
    if (parsed.command === "undo") { undo(); return; }
    if (game.turn() === settings.color) continue;
    const r = matchMove(parsed, game.moves({ verbose: true }));
    if (r.move) { applyMove(r.move, "voice"); nextTurn(); return; }
    if (r.error === "ambiguous") ambiguous = true;
  }
  if (game.turn() !== settings.color) speaker.say(PHRASES[settings.lang][ambiguous ? "which" : "dunno"], { remember: false });
}

view.onPick = (from, to) => {
  if (!started) return;
  const legal = game.moves({ verbose: true }).filter((m) => m.from === from && m.to === to);
  if (!legal.length) { banner("هاي مش حركة مسموحة. اكبس مربع البداية بعدين النهاية."); setTimeout(() => banner(""), 2500); return; }
  banner("");
  applyMove(legal.find((m) => !m.promotion || m.promotion === "q"), "tap");
  nextTurn();
};

function undo() {
  if (!game.history().length) return;
  engine.cancel();
  game.undo();
  const h = game.history({ verbose: true });
  lastMove = h[h.length - 1] || null;
  suggestion = null;
  pendingEcho = "";
  holdAuto = settings.input !== "camera" && game.turn() === settings.color;
  watcher?.resync();
  nextTurn();
}

$("btn-repeat").addEventListener("click", () => speaker.repeat());
$("btn-undo").addEventListener("click", undo);
$("btn-listen").addEventListener("click", () => listener.start());
$("btn-resync").addEventListener("click", () => {
  watcher?.resync();
  confusedSaid = false;
  const b = $("banner");
  b.hidden = false;
  b.innerHTML = "خلّيت الكاميرا تاخد الرقعة متل ما هي هلق. إذا تحرّك الموبايل: <button type=\"button\" class=\"btn ghost\" id=\"btn-recalib\">عاير من جديد</button>";
  $("btn-recalib").addEventListener("click", () => {
    watcher.stop();
    banner("");
    $("calib-cam").prepend(video);
    show("calib");
    resetCalib();
  }, { once: true });
});
$("btn-new").addEventListener("click", () => {
  engine.cancel();
  game.reset();
  suggestion = shown = lastMove = null;
  pendingEcho = "";
  holdAuto = false;
  watcher?.resync();
  banner(settings.input === "camera" ? "رتّب القطع بوضع البداية." : "");
  if (settings.input === "camera") setTimeout(() => banner(""), 4000);
  nextTurn();
});

function render() {
  const mine = game.turn() === settings.color;
  let check = null;
  if (game.inCheck()) {
    const b = game.board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = b[r][f];
      if (p && p.type === "k" && p.color === game.turn()) check = "abcdefgh"[f] + (8 - r);
    }
  }
  view.set({
    board: game.board(),
    last: lastMove ? { from: lastMove.from, to: lastMove.to } : null,
    hint: suggestion && mine ? suggestion : null,
    check,
  });
  $("turn-label").textContent = mine ? (suggestion ? "دورك، العب:" : "دورك") : "دور الخصم. آخر حركة إلك:";
  $("hint-card").classList.toggle("mine", mine && !!suggestion);
  const h = $("hint-text");
  h.replaceChildren();
  if (shown) {
    const g = document.createElement("span");
    g.className = "glyph";
    g.textContent = GLYPH[shown.piece] + "︎";
    h.append(g, `${shown.from} ${shown.captured ? "×" : "→"} ${shown.to}`);
  } else h.textContent = "…";
  $("eval-text").textContent = lastEval
    ? lastEval.type === "mate" ? `M${Math.abs(lastEval.value)}` : `${lastEval.value >= 0 ? "+" : ""}${(lastEval.value / 100).toFixed(1)}`
    : "";
  const list = $("moves");
  list.replaceChildren();
  const hist = game.history();
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement("li");
    li.textContent = hist[i] + (hist[i + 1] ? "  " + hist[i + 1] : "");
    list.appendChild(li);
  }
  drawPlayOverlay();
}

render();
window.addEventListener("resize", () => { drawCalib(); drawPlayOverlay(); });

// For automated tests.
window.__hamsa = { game, settings, engine, speaker, listener, get watcher() { return watcher; } };
