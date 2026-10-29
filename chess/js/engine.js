// Stockfish 18 (lite, single-threaded WASM) running in a Web Worker.
// Runs fully on the phone: no internet needed once the page has loaded.

const ENGINE_URL = new URL("../lib/stockfish/stockfish-18-lite-single.js", import.meta.url);

export class Engine {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.listeners = new Set();
    this.searchId = 0;
    this.busy = false;
  }

  start() {
    if (this.ready) return this.ready;
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);
      for (const fn of [...this.listeners]) fn(line);
    };
    this.ready = (async () => {
      await this._send("uci", (l) => l === "uciok");
      this.worker.postMessage("setoption name Hash value 32");
      await this._send("isready", (l) => l === "readyok");
    })();
    return this.ready;
  }

  // Waits for the first line that matches `done`.
  _send(cmd, done, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(fn);
        reject(new Error("engine timeout: " + cmd));
      }, timeoutMs);
      const fn = (line) => {
        if (done(line)) {
          clearTimeout(timer);
          this.listeners.delete(fn);
          resolve(line);
        }
      };
      this.listeners.add(fn);
      this.worker.postMessage(cmd);
    });
  }

  setSkill(level) {
    if (!this.worker) return;
    const v = Math.max(0, Math.min(20, Math.round(level)));
    this.worker.postMessage("setoption name Skill Level value " + v);
  }

  // Best move for a FEN. Returns {uci, from, to, promotion, score} or null when
  // a newer search replaced this one.
  async best(fen, movetimeMs = 1500) {
    await this.start();
    const id = ++this.searchId;
    if (this.busy) {
      this.worker.postMessage("stop");
      await this._send("isready", (l) => l === "readyok");
    }
    if (id !== this.searchId) return null;
    this.busy = true;
    let score = null;
    const info = (line) => {
      const m = line.match(/ score (cp|mate) (-?\d+)/);
      if (m) score = { type: m[1], value: Number(m[2]) };
    };
    this.listeners.add(info);
    try {
      this.worker.postMessage("position fen " + fen);
      const line = await this._send("go movetime " + Math.round(movetimeMs), (l) => l.startsWith("bestmove"), movetimeMs + 20000);
      if (id !== this.searchId) return null;
      const uci = line.split(/\s+/)[1];
      if (!uci || uci === "(none)") return { uci: null, score };
      return {
        uci,
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
        score,
      };
    } finally {
      this.listeners.delete(info);
      if (id === this.searchId) this.busy = false;
    }
  }

  cancel() {
    this.searchId++;
    if (this.worker && this.busy) this.worker.postMessage("stop");
  }
}
