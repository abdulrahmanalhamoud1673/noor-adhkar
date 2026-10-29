// Reads the board from the phone camera.
//
// How it works:
// 1. The user taps the 4 corners of the 64 squares. A homography maps board
//    coordinates (0..8, 0..8) to camera pixels, and from it we recover the
//    camera's position (height and angle) above the board.
// 2. Each square is sampled on a small grid of points every frame.
// 3. With the camera position known, every piece can be "stood up" in 3D:
//    we know which sample points a king on e1 hides, which a pawn on e4 covers,
//    and so on, including squares hidden behind tall pieces.
// 4. When the picture has been still for a moment (no hand over the board),
//    it is compared with the last known position. Each legal move predicts
//    which points should change; the move whose prediction matches the
//    observed change best is the move that was played.
// The rules (legal moves) come from chess.js, so the camera never has to
// recognise pieces, only which parts of the picture changed.

const N = 7;                 // samples per side of each square
const PTS = N * N;           // samples per square
const INNER = [0.18, 0.82];  // sample the middle of each square
const PROC_WIDTH = 480;      // processing resolution (pixels wide)

// Typical tournament (Staunton) pieces, in square widths: [height, base radius].
const DIMS = { p: [0.88, 0.28], n: [1.15, 0.32], b: [1.3, 0.3], r: [1.0, 0.32], q: [1.6, 0.34], k: [1.75, 0.34] };
const TYPES = "pnbrqk";
const pieceCode = (color, type) => (color === "w" ? 1 : 7) + TYPES.indexOf(type);
const typeOf = (code) => (code - 1) % 6;
const isWhite = (code) => code <= 6;

// ---------- geometry ----------

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-12) throw new Error("degenerate corners");
    for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row) => row[n]);
}

// Homography from 4 source points to 4 destination points.
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...solve(A, b), 1];
}

export function project(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// Sort 4 tapped points around their centre so they form a proper quad.
export function orderQuad(pts) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  return [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
}

// Camera pose from the board homography (principal point at image centre).
// The focal length is solved from the board being square; a typical phone
// value is used when the view is too flat to tell.
export function estimateCamera(H, w, h) {
  const cx = w / 2, cy = h / 2;
  const M = [H[0] - cx * H[6], H[1] - cx * H[7], H[2] - cx * H[8],
             H[3] - cy * H[6], H[4] - cy * H[7], H[5] - cy * H[8],
             H[6], H[7], H[8]];
  const a1 = M[0], b1 = M[3], c1 = M[6], a2 = M[1], b2 = M[4], c2 = M[7];
  const A1 = a1 * a2 + b1 * b2, C1 = c1 * c2;
  const A2 = a1 * a1 + b1 * b1 - a2 * a2 - b2 * b2, C2 = c1 * c1 - c2 * c2;
  const inv = -(A1 * C1 + A2 * C2) / (A1 * A1 + A2 * A2 || 1);
  let f = inv > 0 ? Math.sqrt(1 / inv) : 0;
  const guessed = !(f > 0.45 * w && f < 3 * w);
  if (guessed) f = 0.85 * w;
  const h1 = [a1 / f, b1 / f, c1], h2 = [a2 / f, b2 / f, c2], h3 = [M[2] / f, M[5] / f, M[8]];
  let lam = 2 / (Math.hypot(...h1) + Math.hypot(...h2));
  if (h3[2] * lam < 0) lam = -lam;
  const r1 = h1.map((v) => v * lam), r2 = h2.map((v) => v * lam), t = h3.map((v) => v * lam);
  const r3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const C = [-dot(r1, t), -dot(r2, t), -dot(r3, t)];
  const up = C[2] >= 0 ? 1 : -1;
  const proj = (u, v, z) => {
    const zz = z * up;
    const X = r1[0] * u + r2[0] * v + r3[0] * zz + t[0];
    const Y = r1[1] * u + r2[1] * v + r3[1] * zz + t[1];
    const Z = r1[2] * u + r2[2] * v + r3[2] * zz + t[2];
    return [cx + (f * X) / Z, cy + (f * Y) / Z, Z];
  };
  const elevation = Math.atan2(Math.abs(C[2]), Math.hypot(C[0] - 4, C[1] - 4)) * 180 / Math.PI;
  return { f, guessed, proj, elevation };
}

function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

function insideHull(hull, x, y) {
  for (let i = 0, n = hull.length; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}

// ---------- orientation ----------
// Grid cell (i, j): i runs along corner0->corner1, j along corner0->corner3.
// An orientation maps a grid cell to a chess square index (rank * 8 + file,
// a1 = 0). There are 8: four rotations, each with or without a mirror.

export const ORIENTATIONS = [];
for (let m = 0; m < 2; m++) {
  for (let r = 0; r < 4; r++) {
    const cellToSq = new Int8Array(64);
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        let x = m ? 7 - i : i, y = j;
        for (let k = 0; k < r; k++) [x, y] = [7 - y, x];
        cellToSq[j * 8 + i] = y * 8 + x;
      }
    }
    const sqToCell = new Int8Array(64);
    for (let c = 0; c < 64; c++) sqToCell[cellToSq[c]] = c;
    ORIENTATIONS.push({ id: m * 4 + r, cellToSq, sqToCell });
  }
}

export const sqName = (sq) => "abcdefgh"[sq & 7] + ((sq >> 3) + 1);
export const sqIndex = (name) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);

function corr(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

// Per-cell texture (piece edges) and brightness, from a feature vector.
export function cellStats(feat) {
  const tex = new Float32Array(64), lum = new Float32Array(64);
  for (let c = 0; c < 64; c++) {
    let s = 0, s2 = 0;
    const base = c * PTS * 3;
    for (let p = 0; p < PTS; p++) {
      const o = base + p * 3;
      const l = 0.299 * feat[o] + 0.587 * feat[o + 1] + 0.114 * feat[o + 2];
      s += l; s2 += l * l;
    }
    const m = s / PTS;
    lum[c] = m;
    tex[c] = Math.sqrt(Math.max(0, s2 / PTS - m * m));
  }
  return { tex, lum };
}

// chess.js board() -> piece code per square index (a1 = 0).
export function boardCodes(board) {
  const out = new Int8Array(64);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[7 - r][f];
    if (p) out[r * 8 + f] = pieceCode(p.color, p.type);
  }
  return out;
}

// Picks the orientation that best matches a known position.
export function bestOrientation(feat, board) {
  const { tex, lum } = cellStats(feat);
  const codes = boardCodes(board);
  const results = ORIENTATIONS.map((o) => {
    const T = [], O = [], Lo = [], W = [], Le = [], Light = [];
    for (let c = 0; c < 64; c++) {
      const sq = o.cellToSq[c], p = codes[sq];
      T.push(tex[c]); O.push(p ? 1 : 0);
      if (p) { Lo.push(lum[c]); W.push(isWhite(p) ? 1 : 0); }
      else { Le.push(lum[c]); Light.push(((sq & 7) + (sq >> 3)) % 2); }
    }
    return { o, score: corr(T, O) + corr(Lo, W) + corr(Le, Light) };
  }).sort((a, b) => b.score - a.score);
  return { orientation: results[0].o, score: results[0].score, margin: results[0].score - results[1].score, ranked: results };
}

// ---------- the 3D piece model ----------

// Which sample points each piece type would cover, standing on each cell.
export function buildPieceModel(cam, points) {
  const nPts = points.length / 2;
  const masks = new Array(64 * 6);
  const anyList = [];
  const depth = new Float32Array(64);
  const coverBy = Array.from({ length: nPts }, () => []);
  for (let c = 0; c < 64; c++) {
    const i = c & 7, j = c >> 3, cu = i + 0.5, cv = j + 0.5;
    depth[c] = cam.proj(cu, cv, 0)[2];
    const any = new Uint8Array(nPts);
    for (let ti = 0; ti < 6; ti++) {
      const [h, r] = DIMS[TYPES[ti]];
      const ring = [];
      for (const [z, rr] of [[0, r], [0.35 * h, 0.82 * r], [h, 0.55 * r]]) {
        for (let k = 0; k < 16; k++) {
          const a = (2 * Math.PI * k) / 16;
          const p = cam.proj(cu + rr * Math.cos(a), cv + rr * Math.sin(a), z);
          ring.push([p[0], p[1]]);
        }
      }
      let hull = convexHull(ring);
      // make the hull counter-clockwise in image coordinates for insideHull()
      let area = 0;
      for (let k = 0; k < hull.length; k++) { const a = hull[k], b = hull[(k + 1) % hull.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (area < 0) hull = hull.reverse();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of hull) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const m = new Uint8Array(nPts);
      for (let k = 0; k < nPts; k++) {
        const x = points[2 * k], y = points[2 * k + 1];
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (insideHull(hull, x, y)) { m[k] = 1; any[k] = 1; }
      }
      masks[c * 6 + ti] = m;
    }
    const list = [];
    for (let k = 0; k < nPts; k++) if (any[k]) { list.push(k); coverBy[k].push(c); }
    anyList.push(list);
  }
  // nearest piece first, so the first match is the one in front
  for (const l of coverBy) l.sort((a, b) => depth[a] - depth[b]);
  return { masks, anyList, coverBy, depth };
}

// Which piece (cell) is visible at sample point k, for a position given as
// piece codes per cell. -1 = the bare square is visible.
function ownerAt(model, cells, k) {
  for (const c of model.coverBy[k]) {
    const p = cells[c];
    if (p && model.masks[c * 6 + typeOf(p)][k]) return c;
  }
  return -1;
}

// ---------- the watcher ----------

export class BoardWatcher {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.corners = null;      // 4 points, normalized 0..1 in video space
    this.H = null;
    this.cam = null;
    this.model = null;
    this.orientation = null;
    this.points = null;       // pixel sample positions, per cell
    this.ref = null;          // features of the last known position
    this.prev = null;
    this.stableCount = 0;
    this.stableAcc = null;
    this.stableN = 0;
    this.evaluated = false;
    this.noise = 3;
    this.sensitivity = 1;
    this.lastUnexplained = 0;
    this.timer = null;
    this.onMove = null;       // (moves[], info) => void
    this.onState = null;      // ({moving, changed, confused}) => void
    this.onCorrect = null;    // (undoCount, moves[]) => void: fix the last move
    this.getGame = null;      // () => chess.js instance
    this.getPrefer = null;    // () => {from, to} suggested move
    this.lastDiff = null;
    this.lastCands = null;
    this.now = () => performance.now();
  }

  get tau() { return Math.max(9, 5 * this.noise) * this.sensitivity; }

  setCorners(norm) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) throw new Error("camera not ready");
    const w = PROC_WIDTH, h = Math.round((PROC_WIDTH * vh) / vw);
    this.canvas.width = w; this.canvas.height = h;
    const quad = orderQuad(norm.map(([x, y]) => [x, y]));
    this.corners = quad;
    this.H = homography([[0, 0], [8, 0], [8, 8], [0, 8]], quad.map(([x, y]) => [x * w, y * h]));
    this.points = new Float32Array(64 * PTS * 2);
    let k = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
        const u = i + INNER[0] + ((INNER[1] - INNER[0]) * a) / (N - 1);
        const v = j + INNER[0] + ((INNER[1] - INNER[0]) * b) / (N - 1);
        const [x, y] = project(this.H, u, v);
        this.points[k++] = x; this.points[k++] = y;
      }
    }
    this.cam = estimateCamera(this.H, w, h);
    this.model = buildPieceModel(this.cam, this.points);
    this.ref = null; this.prev = null; this.stableCount = 0;
  }

  gridToNorm(u, v) {
    const [x, y] = project(this.H, u, v);
    return [x / this.canvas.width, y / this.canvas.height];
  }

  squarePolygon(sq) {
    const c = this.orientation.sqToCell[sq];
    const i = c & 7, j = c >> 3;
    return [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([u, v]) => this.gridToNorm(u, v));
  }

  grab() {
    const { ctx, canvas } = this;
    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return sampleFeatures(ctx.getImageData(0, 0, canvas.width, canvas.height), this.points);
  }

  async grabAverage(frames = 6, gapMs = 70) {
    let acc = null;
    for (let k = 0; k < frames; k++) {
      const f = this.grab();
      if (!acc) acc = new Float32Array(f.length);
      for (let i = 0; i < f.length; i++) acc[i] += f[i];
      if (k < frames - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
    for (let i = 0; i < acc.length; i++) acc[i] /= frames;
    return acc;
  }

  // Finds a1 automatically from a known position (normally the start).
  calibrate(board, feat = this.grab()) {
    const r = bestOrientation(feat, board);
    this.calibFeat = feat;
    this.calibBoard = board;
    this.ranked = r.ranked;
    this.setOrientation(r.orientation);
    this.ref = feat; this.prev = feat;
    return r;
  }

  nextOrientation() {
    if (!this.ranked) return;
    const idx = this.ranked.findIndex((r) => r.o === this.orientation);
    this.setOrientation(this.ranked[(idx + 1) % this.ranked.length].o);
  }

  setOrientation(o) {
    this.orientation = o;
    this.learnColours(this.calibFeat, this.calibBoard);
  }

  cellsOf(codesBySquare) {
    const cells = new Int8Array(64);
    for (let s = 0; s < 64; s++) cells[this.orientation.sqToCell[s]] = codesBySquare[s];
    return cells;
  }

  // Learns what a white piece, a black piece, a light square and a dark
  // square look like in this light, from a frame of a known position.
  learnColours(feat, board) {
    const cells = this.cellsOf(boardCodes(board));
    const sum = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (let k = 0; k < this.points.length / 2; k++) {
      const cls = this.pointClass(cells, k, ownerAt(this.model, cells, k));
      const s = sum[cls];
      s[0] += feat[k * 3]; s[1] += feat[k * 3 + 1]; s[2] += feat[k * 3 + 2]; s[3]++;
    }
    const fallback = [[220, 215, 200], [40, 40, 40], [225, 225, 215], [70, 110, 90]];
    const col = sum.map((s, i) => (s[3] > 20 ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : fallback[i]));
    this.contrast = col.map((a) => col.map((b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3));
  }

  // 0 white piece, 1 black piece, 2 light square, 3 dark square
  pointClass(cells, k, owner) {
    if (owner >= 0) return isWhite(cells[owner]) ? 0 : 1;
    const sq = this.orientation.cellToSq[(k / PTS) | 0];
    return ((sq & 7) + (sq >> 3)) % 2 ? 2 : 3;
  }

  // Expected change per cell going from one position to another.
  predict(before, after, ownBefore) {
    const pred = new Float32Array(64);
    const changed = [];
    for (let c = 0; c < 64; c++) if (before[c] !== after[c]) changed.push(c);
    const seen = new Set();
    for (const c of changed) {
      for (const k of this.model.anyList[c]) {
        if (seen.has(k)) continue;
        seen.add(k);
        const ob = ownBefore[k], oa = ownerAt(this.model, after, k);
        if (ob === oa && (ob < 0 || before[ob] === after[oa])) continue;
        const cb = this.pointClass(before, k, ob), ca = this.pointClass(after, k, oa);
        pred[(k / PTS) | 0] += (this.contrast[cb][ca] + 8) / PTS;
      }
    }
    return pred;
  }

  start() { this.stop(); this.timer = setInterval(() => this.tick(), 120); }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // Take the next still frame as the truth (after a manual correction, or
  // if the phone moved a little).
  resync() { this.ref = null; this.prevRef = null; this.lastAccepted = null; this.stableCount = 0; this.evaluated = false; }

  tick() {
    if (!this.orientation || this.video.readyState < 2) return;
    const feat = this.grab();
    const prev = this.prev;
    this.prev = feat;
    if (!prev) return;
    const motion = squareDiffs(prev, feat);
    const sorted = Array.from(motion).sort((a, b) => a - b);
    const med = sorted[32], max = sorted[63];
    const moving = max > Math.max(7, 4 * this.noise);
    if (!moving) this.noise = 0.97 * this.noise + 0.03 * Math.max(1, med * 1.5);

    if (moving) {
      this.stableCount = 0; this.stableAcc = null; this.stableN = 0; this.evaluated = false;
      this.onState?.({ moving: true });
      return;
    }
    this.stableCount++;
    if (!this.stableAcc) this.stableAcc = new Float32Array(feat.length);
    for (let i = 0; i < feat.length; i++) this.stableAcc[i] += feat[i];
    this.stableN++;
    if (this.stableCount < 5 || this.evaluated) {
      if (this.evaluated && this.stableCount % 40 === 0) this.evaluated = false; // look again now and then
      return;
    }
    const still = new Float32Array(feat.length);
    for (let i = 0; i < feat.length; i++) still[i] = this.stableAcc[i] / this.stableN;
    this.evaluated = true;
    this.evaluate(still);
  }

  // Per-cell change between two frames, with the overall shift removed.
  diffVs(ref, still) {
    const raw = squareDiffs(ref, still);
    const med = Array.from(raw).sort((a, b) => a - b)[32];
    const d = new Float32Array(64);
    for (let c = 0; c < 64; c++) d[c] = Math.max(0, raw[c] - med);
    return d;
  }

  evaluate(still) {
    if (!this.ref) {
      this.ref = still;
      this.prevRef = null; this.lastAccepted = null;
      this.onState?.({ moving: false, synced: true });
      return;
    }
    const d = this.diffVs(this.ref, still);
    const bySq = new Float32Array(64);
    for (let c = 0; c < 64; c++) bySq[this.orientation.cellToSq[c]] = d[c];
    this.lastDiff = bySq;
    const tau = this.tau;
    const changed = [];
    for (let s = 0; s < 64; s++) if (bySq[s] > tau) changed.push(s);

    if (!changed.length) {
      for (let i = 0; i < still.length; i++) this.ref[i] = 0.8 * this.ref[i] + 0.2 * still[i];
      this.lastUnexplained = 0;
      this.onState?.({ moving: false, changed: [] });
      return;
    }

    const game = this.getGame();
    const result = this.explain(d, game, this.getPrefer?.());
    this.lastCands = result.ranked;
    if (result.accept) {
      this.prevRef = this.ref;
      this.lastAccepted = result.accept.moves;
      this.ref = still;
      this.lastUnexplained = 0;
      this.onMove?.(result.accept.moves, { fit: result.accept.fit, margin: result.accept.margin });
      return;
    }
    if (this.recheckLast(still, game)) return;
    // A soft change that looks like no move at all (a shadow, the light):
    // after a few seconds, accept it as the new normal.
    const best = result.ranked[0];
    let maxD = 0;
    for (let c = 0; c < 64; c++) maxD = Math.max(maxD, d[c]);
    if (this.lastUnexplained && this.now() - this.lastUnexplained > 3000 &&
        (!best || best.fit < 0.3) && maxD < 2.5 * tau) {
      for (let i = 0; i < still.length; i++) this.ref[i] = still[i];
      this.lastUnexplained = 0;
      this.onState?.({ moving: false, changed: [] });
      return;
    }
    if (!this.lastUnexplained) this.lastUnexplained = this.now();
    const confused = this.now() - this.lastUnexplained > 4000;
    this.onState?.({ moving: false, changed, confused, guess: result.ranked[0]?.moves[0] });
  }

  // The last move may have been read too early (piece still in the air) or
  // read wrongly. Read it again against the picture from before it.
  recheckLast(still, game) {
    const last = this.lastAccepted;
    if (!last || !this.prevRef) return false;
    const tail = game.history({ verbose: true }).slice(-last.length);
    if (tail.length !== last.length || tail.some((m, i) => m.from !== last[i].from || m.to !== last[i].to)) return false;
    const d = this.diffVs(this.prevRef, still);
    for (let i = 0; i < last.length; i++) game.undo();
    let result;
    try { result = this.explain(d, game, null); }
    finally { for (const m of last) game.move({ from: m.from, to: m.to, promotion: m.promotion }); }
    if (!result.accept) return false;
    const moves = result.accept.moves;
    const same = moves.length === last.length && moves.every((m, i) => m.from === last[i].from && m.to === last[i].to);
    if (same) {
      // Same move, seen more completely now: refresh the picture only when it
      // fits very well (otherwise the next move may be half done).
      if (result.accept.fit < 0.93) return false;
      this.ref = still;
      this.lastUnexplained = 0;
      this.onState?.({ moving: false, changed: [] });
      return true;
    }
    this.ref = still;
    this.lastUnexplained = 0;
    this.lastAccepted = moves;
    this.onCorrect?.(last.length, moves);
    return true;
  }

  // Ranks the legal moves (and, if needed, pairs of moves) by how well
  // their predicted change matches the observed one.
  explain(d, game, prefer) {
    let e0 = 0;
    for (let c = 0; c < 64; c++) e0 += d[c] * d[c];
    const before = this.cellsOf(boardCodes(game.board()));
    const ownBefore = new Int16Array(this.points.length / 2);
    for (let k = 0; k < ownBefore.length; k++) ownBefore[k] = ownerAt(this.model, before, k);

    // fit: share of the observed change the prediction explains.
    // cover: share of the predicted change that really showed up (a piece
    // still in the air has left its square but not landed yet).
    const fitOf = (pred) => {
      let pd = 0, pp = 0, sp = 0, sm = 0;
      for (let c = 0; c < 64; c++) { pd += pred[c] * d[c]; pp += pred[c] * pred[c]; }
      const k = pp ? Math.min(2, Math.max(0.5, pd / pp)) : 0;
      let sse = 0;
      for (let c = 0; c < 64; c++) {
        const r = d[c] - k * pred[c];
        sse += r * r;
        sp += k * pred[c]; sm += Math.min(d[c], k * pred[c]);
      }
      return { fit: 1 - sse / (e0 || 1), cover: sp ? sm / sp : 0 };
    };
    const toCells = (g) => this.cellsOf(boardCodes(g.board()));

    const singles = [];
    for (const m of game.moves({ verbose: true })) {
      if (m.promotion && m.promotion !== "q") continue;
      game.move(m);
      const after = toCells(game);
      game.undo();
      const pred = this.predict(before, after, ownBefore);
      const r = fitOf(pred);
      if (prefer && m.from === prefer.from && m.to === prefer.to) r.fit += 0.04;
      singles.push({ moves: [m], ...r, pred });
    }
    singles.sort((a, b) => b.fit - a.fit);
    let ranked = singles;
    let best = singles[0];

    // Both players may have moved before the board was still.
    if (!best || best.fit < 0.7) {
      const pairs = [];
      for (const s of singles.slice(0, 8)) {
        const m1 = s.moves[0];
        game.move(m1);
        for (const m2 of game.moves({ verbose: true })) {
          if (m2.promotion && m2.promotion !== "q") continue;
          game.move(m2);
          const after = toCells(game);
          game.undo();
          const r = fitOf(this.predict(before, after, ownBefore));
          r.fit -= 0.05;
          pairs.push({ moves: [m1, m2], ...r });
        }
        game.undo();
      }
      ranked = [...singles, ...pairs].sort((a, b) => b.fit - a.fit);
      best = ranked[0];
    }
    if (!best) return { ranked, accept: null };
    const key = (r) => r.moves.map((m) => m.from + m.to).join();
    const rival = ranked.find((r) => key(r) !== key(best));
    const margin = rival ? best.fit - rival.fit : 1;
    // Clear winner, or a near-perfect fit whose rival leaves far more unexplained.
    const resBest = 1 - best.fit, resRival = rival ? 1 - rival.fit : 1;
    const ok = best.fit >= 0.55 && best.cover >= 0.78 &&
               (margin >= 0.08 || (margin >= 0.03 && resRival >= 2.5 * resBest));
    return { ranked, accept: ok ? { ...best, margin } : null };
  }
}

// Mean RGB of the sample points, normalised for overall brightness.
export function sampleFeatures(img, points) {
  const { data, width, height } = img;
  const n = points.length / 2;
  const out = new Float32Array(n * 3);
  let total = 0;
  for (let k = 0; k < n; k++) {
    let x = points[2 * k], y = points[2 * k + 1];
    x = Math.min(width - 2, Math.max(0, x)); y = Math.min(height - 2, Math.max(0, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i00 = (y0 * width + x0) * 4, i10 = i00 + 4, i01 = i00 + width * 4, i11 = i01 + 4;
    for (let ch = 0; ch < 3; ch++) {
      const v = (data[i00 + ch] * (1 - fx) + data[i10 + ch] * fx) * (1 - fy) +
                (data[i01 + ch] * (1 - fx) + data[i11 + ch] * fx) * fy;
      out[k * 3 + ch] = v;
      total += v;
    }
  }
  const gain = 128 / Math.max(1, total / (n * 3));
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

// Mean absolute colour change per grid cell.
export function squareDiffs(a, b) {
  const P = PTS * 3;
  const out = new Float32Array(64);
  for (let c = 0; c < 64; c++) {
    let s = 0;
    const base = c * P;
    for (let i = 0; i < P; i++) s += Math.abs(a[base + i] - b[base + i]);
    out[c] = s / P;
  }
  return out;
}
