// On-screen board: shows the position, the last move and the suggestion,
// and lets you enter a move by tapping two squares.

const GLYPH = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export class BoardView {
  constructor(container) {
    this.container = container;
    this.flipped = false;     // true: black at the bottom
    this.selected = null;
    this.onPick = null;       // (from, to) => void
    this.svg = el("svg", { viewBox: "0 0 8 8", class: "board-svg", role: "img", "aria-label": "Chess board" });
    container.appendChild(this.svg);
    this.svg.addEventListener("click", (e) => this._click(e));
    this.state = { board: null, last: null, hint: null, check: null };
  }

  _xy(sq) {
    const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
    return this.flipped ? [7 - f, r] : [f, 7 - r];
  }

  _sqAt(x, y) {
    const f = this.flipped ? 7 - x : x, r = this.flipped ? y : 7 - y;
    return "abcdefgh"[f] + (r + 1);
  }

  _click(e) {
    const rect = this.svg.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return;
    const sq = this._sqAt(x, y);
    if (!this.selected) { this.selected = sq; this.render(); return; }
    const from = this.selected;
    this.selected = null;
    this.render();
    if (from !== sq) this.onPick?.(from, sq);
  }

  set(state) { Object.assign(this.state, state); this.render(); }

  render() {
    const { board, last, hint, check } = this.state;
    const svg = this.svg;
    svg.replaceChildren();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = this._sqAt(x, y);
      const light = (x + y) % 2 === 0;
      svg.appendChild(el("rect", { x, y, width: 1, height: 1, class: light ? "sq-light" : "sq-dark" }));
      if (last && (sq === last.from || sq === last.to)) svg.appendChild(el("rect", { x, y, width: 1, height: 1, class: "sq-last" }));
      if (hint && (sq === hint.from || sq === hint.to)) svg.appendChild(el("rect", { x, y, width: 1, height: 1, class: "sq-hint" }));
      if (sq === check) svg.appendChild(el("rect", { x, y, width: 1, height: 1, class: "sq-check" }));
      if (sq === this.selected) svg.appendChild(el("rect", { x: x + 0.04, y: y + 0.04, width: 0.92, height: 0.92, class: "sq-sel" }));
    }
    // coordinates
    for (let i = 0; i < 8; i++) {
      const file = this.flipped ? "hgfedcba"[i] : "abcdefgh"[i];
      const rank = this.flipped ? i + 1 : 8 - i;
      const t1 = el("text", { x: i + 0.94, y: 7.95, class: "coord" + ((i + 7) % 2 === 0 ? " on-light" : " on-dark"), "text-anchor": "end" });
      t1.textContent = file; svg.appendChild(t1);
      const t2 = el("text", { x: 0.05, y: i + 0.22, class: "coord" + (i % 2 === 0 ? " on-light" : " on-dark") });
      t2.textContent = rank; svg.appendChild(t2);
    }
    if (board) {
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p) continue;
        const sq = "abcdefgh"[f] + (8 - r);
        const [x, y] = this._xy(sq);
        const t = el("text", { x: x + 0.5, y: y + 0.8, class: "piece " + (p.color === "w" ? "pw" : "pb"), "text-anchor": "middle" });
        t.textContent = GLYPH[p.color + p.type] + "︎";
        svg.appendChild(t);
      }
    }
    if (hint) {
      const [x1, y1] = this._xy(hint.from), [x2, y2] = this._xy(hint.to);
      const ax = x1 + 0.5, ay = y1 + 0.5, bx = x2 + 0.5, by = y2 + 0.5;
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      const ex = bx - ux * 0.32, ey = by - uy * 0.32;
      svg.appendChild(el("line", { x1: ax, y1: ay, x2: ex, y2: ey, class: "arrow" }));
      const px = -uy * 0.2, py = ux * 0.2;
      svg.appendChild(el("polygon", {
        points: `${bx - ux * 0.08},${by - uy * 0.08} ${ex + px},${ey + py} ${ex - px},${ey - py}`,
        class: "arrow-head",
      }));
    }
  }
}
