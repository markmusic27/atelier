/*
 * Draws the background (config.ts) on a fixed canvas behind the page: the contour lines of
 * the terrain in terrain.ts, printed in typewriter characters.
 *
 * The lines are traced once per screen size (marching squares over a grid of heights), and
 * characters are laid along each a step apart: dashes turned to follow the line, and
 * periods. Every frame only decides how dark each one is:
 *
 *   - clear of the text (following its lines) and the sculpture, each with a soft edge that
 *     wanders in and out, so the page reads as text on white with the texture coming in
 *     around it;
 *   - fading to white and back as soft waves run along its line;
 *   - darker in the wake of a sheet moving toward it (the sculpture's positions come from
 *     components/mobile/live.ts).
 *
 * Each character is copied from a sheet of sprites drawn once: on the GPU where it can
 * (gl-glyphs.ts), all in one go, or else on the 2D canvas.
 */

import { live } from "../mobile/live";
import { FIELD } from "./config";
import { glyphLayer } from "./gl-glyphs";
import { makeTerrain, random } from "./terrain";

const TAU = Math.PI * 2;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** A repeatable pseudo-random number in [0, 1) for an integer. */
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A smooth wobble in about [-1, 1], varying over a hundred px or so (for the rough edges). */
function wobble(x: number, y: number) {
  return (
    0.5 * Math.sin(0.021 * x + 0.013 * y + 1.3) +
    0.3 * Math.sin(-0.009 * x + 0.026 * y + 4.1) +
    0.2 * Math.sin(0.047 * x - 0.033 * y + 0.7)
  );
}

/** Distance from (x, y) to the segment (ax, ay)–(bx, by). */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / len2) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

export function runField(canvas: HTMLCanvasElement): () => void {
  // The GPU draws the characters where it can (gl-glyphs.ts); otherwise, and while the clear
  // space is shown in red, the 2D canvas does.
  const layer = FIELD.showClearing ? null : glyphLayer(canvas);
  const ctx = layer ? null : canvas.getContext("2d");
  if (!layer && !ctx) return () => {};
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const height = makeTerrain();
  const G = FIELD.glyph;

  // The contour spacing: the typical slope (over a fixed stretch of the terrain, so it's the
  // same at any screen size) times the distance wanted between lines.
  const levelStep = (() => {
    const slopes: number[] = [];
    const d = 4;
    for (let y = 0; y < 2400; y += 37)
      for (let x = 0; x < 2400; x += 37) {
        const h = height(x, y);
        slopes.push(Math.hypot(height(x + d, y) - h, height(x, y + d) - h) / d);
      }
    slopes.sort((a, b) => a - b);
    return slopes[slopes.length >> 1] * FIELD.lineSpacing;
  })();

  let W = 0;
  let H = 0;
  let dpr = 1;
  let ink = "#1d1d1b";

  // The characters: where each sits (CSS px, and its corner in device px), which sprite it
  // is, the line it's on and how far along it, and a fixed wobble for the edge of the
  // sculpture's clearing.
  let count = 0;
  let X = new Float32Array(0);
  let Y = new Float32Array(0);
  let DX = new Int32Array(0);
  let DY = new Int32Array(0);
  let KIND = new Uint8Array(0);
  let LINE = new Uint16Array(0);
  let ALONG = new Float32Array(0);
  let ROUGH = new Float32Array(0);
  let ALPHA = new Float32Array(0); // this frame's opacity of each
  // Per line: its waves' wavenumber (its sign says which way they run), where in their cycle
  // they start, and their tempo (so neighboring lines drift in and out of step).
  let lineK = new Float32Array(0);
  let linePhase = new Float32Array(0);
  let lineRate = new Float32Array(0);

  // The sprites: a dash turned to each of ANGLES directions and a period, drawn once
  // in the typewriter face and copied into place.
  const ANGLES = 24;
  const DOT = ANGLES;
  let atlas: HTMLCanvasElement | null = null;
  let cellPx = 0;
  const font = (px: number) => `${px}px "CMU Typewriter", ui-monospace, "SF Mono", Menlo, monospace`;

  function drawAtlas() {
    const size = G.size * dpr;
    cellPx = 2 * Math.ceil(size * 0.7);
    atlas = document.createElement("canvas");
    atlas.width = cellPx * (ANGLES + 1);
    atlas.height = cellPx;
    const g = atlas.getContext("2d")!;
    g.fillStyle = ink;
    g.font = font(size);
    // Each character is centered on its ink, not its baseline, so it sits right on the line.
    const put = (k: number, ch: string, angle: number) => {
      const m = g.measureText(ch);
      g.save();
      g.translate(k * cellPx + cellPx / 2, cellPx / 2);
      g.rotate(angle);
      g.fillText(ch, -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
      g.restore();
    };
    for (let a = 0; a < ANGLES; a++) put(a, "-", (a / ANGLES) * Math.PI);
    put(DOT, ".", 0);
    layer?.setAtlas(atlas, cellPx, ANGLES + 1, ink);
    dirty = true;
  }

  /**
   * Traces the terrain's contour lines across the screen (marching squares on a grid a
   * little bigger than the screen) and lays characters along them.
   */
  function trace() {
    const cell = FIELD.grid;
    const nx = Math.ceil(W / cell) + 3;
    const ny = Math.ceil(H / cell) + 3;
    const ox = -cell;
    const oy = -cell;
    const V = new Float32Array(nx * ny);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const x = ox + i * cell;
        // Mirrored left to right, the terrain is pinned to the screen's right edge instead.
        const v = height(FIELD.terrain.mirror ? W - x : x, oy + j * cell);
        V[j * nx + i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    const k0 = Math.ceil(lo / levelStep - 0.5);
    const k1 = Math.floor(hi / levelStep - 0.5);
    const levels = Math.max(0, k1 - k0 + 1);

    // Where each line crosses a grid edge, once per edge and level, and the (at most two)
    // neighbors along the line of each crossing.
    const ids = new Map<number, number>();
    const PX: number[] = [];
    const PY: number[] = [];
    const N1: number[] = [];
    const N2: number[] = [];
    const cross = (key: number, ax: number, ay: number, va: number, bx: number, by: number, vb: number, L: number) => {
      let p = ids.get(key);
      if (p !== undefined) return p;
      const t = (L - va) / (vb - va);
      p = PX.length;
      PX.push(ax + (bx - ax) * t);
      PY.push(ay + (by - ay) * t);
      N1.push(-1);
      N2.push(-1);
      ids.set(key, p);
      return p;
    };
    const join = (a: number, b: number) => {
      if (N1[a] < 0) N1[a] = b;
      else N2[a] = b;
      if (N1[b] < 0) N1[b] = a;
      else N2[b] = a;
    };

    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const v0 = V[j * nx + i]; // top left
        const v1 = V[j * nx + i + 1]; // top right
        const v2 = V[(j + 1) * nx + i + 1]; // bottom right
        const v3 = V[(j + 1) * nx + i]; // bottom left
        const cmin = Math.min(v0, v1, v2, v3);
        const cmax = Math.max(v0, v1, v2, v3);
        const first = Math.max(k0, Math.ceil(cmin / levelStep - 0.5));
        const last = Math.min(k1, Math.floor(cmax / levelStep - 0.5));
        if (first > last) continue;
        const x0 = ox + i * cell;
        const y0 = oy + j * cell;
        const x1 = x0 + cell;
        const y1 = y0 + cell;
        // Edge keys: each horizontal and vertical grid edge, per level.
        const eTop = (j * nx + i) * 2;
        const eBottom = ((j + 1) * nx + i) * 2;
        const eLeft = (j * nx + i) * 2 + 1;
        const eRight = (j * nx + i + 1) * 2 + 1;
        for (let k = first; k <= last; k++) {
          const L = (k + 0.5) * levelStep;
          const lk = k - k0;
          const top = () => cross(eTop * levels + lk, x0, y0, v0, x1, y0, v1, L);
          const bottom = () => cross(eBottom * levels + lk, x0, y1, v3, x1, y1, v2, L);
          const left = () => cross(eLeft * levels + lk, x0, y0, v0, x0, y1, v3, L);
          const right = () => cross(eRight * levels + lk, x1, y0, v1, x1, y1, v2, L);
          const c = (v0 > L ? 8 : 0) | (v1 > L ? 4 : 0) | (v2 > L ? 2 : 0) | (v3 > L ? 1 : 0);
          switch (c) {
            case 1:
            case 14:
              join(left(), bottom());
              break;
            case 2:
            case 13:
              join(bottom(), right());
              break;
            case 3:
            case 12:
              join(left(), right());
              break;
            case 4:
            case 11:
              join(top(), right());
              break;
            case 6:
            case 9:
              join(top(), bottom());
              break;
            case 7:
            case 8:
              join(left(), top());
              break;
            case 5: // a saddle: the middle decides which corners the line keeps together
              if ((v0 + v1 + v2 + v3) / 4 > L) {
                join(left(), top());
                join(bottom(), right());
              } else {
                join(left(), bottom());
                join(top(), right());
              }
              break;
            case 10:
              if ((v0 + v1 + v2 + v3) / 4 > L) {
                join(top(), right());
                join(left(), bottom());
              } else {
                join(left(), top());
                join(bottom(), right());
              }
              break;
          }
        }
      }

    // Follow the crossings into lines: first the ones that run off the grid's edge, then the
    // closed loops left over.
    const seen = new Uint8Array(PX.length);
    const lines: number[][] = [];
    const follow = (start: number) => {
      const line = [start];
      seen[start] = 1;
      let cur = start;
      for (;;) {
        const a = N1[cur];
        const b = N2[cur];
        const next = a >= 0 && !seen[a] ? a : b >= 0 && !seen[b] ? b : -1;
        if (next < 0) break;
        line.push(next);
        seen[next] = 1;
        cur = next;
      }
      if (line.length > 2 && (N1[cur] === start || N2[cur] === start)) line.push(start); // closed
      lines.push(line);
    };
    for (let p = 0; p < PX.length; p++) if (!seen[p] && N2[p] < 0) follow(p);
    for (let p = 0; p < PX.length; p++) if (!seen[p]) follow(p);

    // Lay characters along each line, a step apart, from a random start.
    const xs: number[] = [];
    const ys: number[] = [];
    const kinds: number[] = [];
    const ls: number[] = [];
    const along: number[] = [];
    const pad = G.size;
    lines.forEach((line, li) => {
      const rnd = random(FIELD.terrain.seed * 7919 + li * 104729 + Math.round(PX[line[0]] * 13 + PY[line[0]] * 7));
      const dashes = Math.min(0.95, Math.max(0.2, G.dash + (rnd() - 0.5) * 0.4));
      let s = rnd() * G.step; // distance into the current segment
      let skipped = false; // never two gaps in a row
      let total = 0;
      for (let n = 0; n + 1 < line.length; n++) {
        const ax = PX[line[n]];
        const ay = PY[line[n]];
        const bx = PX[line[n + 1]];
        const by = PY[line[n + 1]];
        const len = Math.hypot(bx - ax, by - ay);
        while (s <= len) {
          const t = len > 0 ? s / len : 0;
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          const r = rnd();
          const kind: number =
            !skipped && r < G.gap
              ? -1
              : rnd() < dashes
                ? Math.round(((((Math.atan2(by - ay, bx - ax) % Math.PI) + Math.PI) % Math.PI) / Math.PI) * ANGLES) % ANGLES
                : DOT;
          skipped = kind < 0;
          if (kind >= 0 && x > -pad && x < W + pad && y > -pad && y < H + pad) {
            xs.push(x);
            ys.push(y);
            kinds.push(kind);
            ls.push(li);
            along.push(total + s);
          }
          s += G.step;
        }
        s -= len;
        total += len;
      }
    });

    count = xs.length;
    X = Float32Array.from(xs);
    Y = Float32Array.from(ys);
    KIND = Uint8Array.from(kinds);
    LINE = Uint16Array.from(ls);
    ALONG = Float32Array.from(along);
    ROUGH = new Float32Array(count);
    for (let i = 0; i < count; i++) ROUGH[i] = wobble(X[i] * 1.4 + 500, Y[i] * 1.4);

    const n = lines.length;
    lineK = new Float32Array(n);
    linePhase = new Float32Array(n);
    lineRate = new Float32Array(n);
    for (let l = 0; l < n; l++) {
      const way = hash(l + 307) < 0.5 ? -1 : 1;
      lineK[l] = (way * TAU) / (FIELD.wave.length * (0.75 + 0.5 * hash(l + 101)));
      linePhase[l] = hash(l + 211) * TAU;
      lineRate[l] = 1 + FIELD.wave.vary * (2 * hash(l + 401) - 1);
    }
  }

  /** Where each character's sprite goes, in device px. */
  function place() {
    DX = new Int32Array(count);
    DY = new Int32Array(count);
    const half = cellPx / 2;
    for (let i = 0; i < count; i++) {
      DX[i] = Math.round(X[i] * dpr) - half;
      DY[i] = Math.round(Y[i] * dpr) - half;
    }
    ALPHA = new Float32Array(count);
    layer?.setGlyphs(DX, DY, KIND);
  }

  function build() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || ink;

    trace();
    drawAtlas();
    place();

    const cell = FIELD.wake.cell;
    gw = Math.ceil(W / cell) + 2;
    gh = Math.ceil(H / cell) + 2;
    wake = new Float32Array(gw * gh);
    prev = [];
    dirty = true;
  }

  // The wakes, on a coarse grid over the screen.
  let gw = 0;
  let gh = 0;
  let wake = new Float32Array(0);
  let prev: { x: number; y: number; vx: number; vy: number }[] = [];

  // ---------------------------------------------------------------------------------------
  // Per frame.
  // ---------------------------------------------------------------------------------------
  let column: HTMLElement | null = null;
  let scroll = 0;
  // The text, as a box around each line: left, top, right, bottom, with tops and bottoms
  // measured down the page (so they only need measuring again when the layout changes).
  let textBoxes = new Float64Array(0);
  let textL = 0;
  let textR = 0;
  let textT = 0;
  let textB = 0;
  // The sculpture, in this canvas's px, and a box around it beyond which it clears nothing.
  let sheetX: number[] = [];
  let sheetY: number[] = [];
  let sheetR: number[] = [];
  let wires: number[] = [];
  let artL = 0;
  let artR = 0;
  let artT = 0;
  let artB = 0;
  let hasArt = false;

  const T = FIELD.text;
  const A = FIELD.art;
  const textReach = Math.max(T.inner + T.edge, T.from + T.fade + T.rough);
  const artReach = A.inner + A.fade + A.rough;

  /**
   * Measures a box around each line of the text: the boxes of its runs of text, joined along
   * each line, plus the rules and the list numbers, which have no text of their own.
   */
  function measureText() {
    column ??= document.getElementById("column");
    if (!column) {
      textBoxes = new Float64Array(0);
      return;
    }
    const sy = window.scrollY;
    const runs: number[][] = [];
    const add = (l: number, t: number, r: number, b: number) => {
      if (r > l && b > t) runs.push([l, t + sy, r, b + sy]);
    };
    const range = document.createRange();
    const walker = document.createTreeWalker(column, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r.left, r.top, r.right, r.bottom);
    }
    for (const hr of column.querySelectorAll("hr")) {
      const r = hr.getBoundingClientRect();
      add(r.left, r.top - 1, r.right, r.bottom + 1);
    }
    for (const li of column.querySelectorAll("li")) {
      const r = li.getBoundingClientRect();
      const list = li.parentElement!.getBoundingClientRect();
      const style = getComputedStyle(li);
      const size = parseFloat(style.fontSize);
      const lead = Math.max(0, ((parseFloat(style.lineHeight) || size * 1.6) - size * 1.25) / 2);
      add(list.left, r.top + lead, r.left, r.top + lead + size * 1.25);
    }

    // Join the runs that share a line (they overlap top to bottom and nearly touch side to side).
    runs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const lines: number[][] = [];
    for (const run of runs) {
      const line = lines.find((b) => {
        const overlap = Math.min(b[3], run[3]) - Math.max(b[1], run[1]);
        return overlap > 0.5 * Math.min(b[3] - b[1], run[3] - run[1]) && run[0] < b[2] + 12 && run[2] > b[0] - 12;
      });
      if (line) {
        line[0] = Math.min(line[0], run[0]);
        line[1] = Math.min(line[1], run[1]);
        line[2] = Math.max(line[2], run[2]);
        line[3] = Math.max(line[3], run[3]);
      } else lines.push([...run]);
    }
    textBoxes = Float64Array.from(lines.flat());
    textL = Math.min(...lines.map((b) => b[0]));
    textR = Math.max(...lines.map((b) => b[2]));
    textT = Math.min(...lines.map((b) => b[1]));
    textB = Math.max(...lines.map((b) => b[3]));
    dirty = true;
  }

  /** How much of the texture shows at (x, y): 0 right by the text or the sculpture, 1 clear of them. */
  function clearance(x: number, y: number, rough: number) {
    let m = 1;
    const py = y + scroll; // down the page
    if (textBoxes.length && x > textL - textReach && x < textR + textReach && py > textT - textReach && py < textB + textReach) {
      let d = textReach;
      for (let j = 0; j < textBoxes.length; j += 4) {
        const dy = Math.max(textBoxes[j + 1] - py, py - textBoxes[j + 3], 0);
        if (dy >= d) continue;
        const dx = Math.max(textBoxes[j] - x, x - textBoxes[j + 2], 0);
        const dd = dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy);
        if (dd < d) d = dd;
      }
      if (d === 0) return 0; // over the text itself
      if (d < textReach) {
        // Clear by each line; lighter around the text as a whole, its edge wandering more
        // the further it is from the text.
        const near = smoothstep(T.inner, T.inner + T.edge, d + T.wander * wobble(x * 2.3 + 170, py * 2.3));
        const w = T.rough * smoothstep(0, T.from + T.fade * 0.5, d) * wobble(x, py);
        m = near * (T.keep + (1 - T.keep) * smoothstep(T.from, T.from + T.fade, d + w));
      }
      if (m === 0) return 0;
    }
    if (hasArt && x > artL && x < artR && y > artT && y < artB) {
      let d = Infinity;
      for (let j = 0; j < sheetX.length; j++) {
        const dd = Math.hypot(x - sheetX[j], y - sheetY[j]) - sheetR[j];
        if (dd < d) d = dd;
      }
      for (let j = 0; j < wires.length; j += 4) {
        const dd = segmentDistance(x, y, wires[j], wires[j + 1], wires[j + 2], wires[j + 3]) - A.wire;
        if (dd < d) d = dd;
      }
      if (d < artReach) m *= smoothstep(A.inner, A.inner + A.fade, d + A.rough * rough);
    }
    return m;
  }

  /** Reads how far the page has scrolled and where the sculpture is now. */
  function locate() {
    scroll = window.scrollY;

    hasArt = !!live.canvas;
    if (!live.canvas) return;
    const r = live.canvas.getBoundingClientRect();
    const ox = r.left;
    const oy = r.top;
    sheetX = live.sheets.map((s) => s.x + ox);
    sheetY = live.sheets.map((s) => s.y + oy);
    sheetR = live.sheets.map((s) => s.r * A.sheet);
    wires = live.wires.map((v, i) => v + (i % 2 ? oy : ox));
    artL = Infinity;
    artR = -Infinity;
    artT = Infinity;
    artB = -Infinity;
    for (let j = 0; j < sheetX.length; j++) {
      artL = Math.min(artL, sheetX[j] - sheetR[j]);
      artR = Math.max(artR, sheetX[j] + sheetR[j]);
      artT = Math.min(artT, sheetY[j] - sheetR[j]);
      artB = Math.max(artB, sheetY[j] + sheetR[j]);
    }
    for (let j = 0; j < wires.length; j += 2) {
      artL = Math.min(artL, wires[j]);
      artR = Math.max(artR, wires[j]);
      artT = Math.min(artT, wires[j + 1]);
      artB = Math.max(artB, wires[j + 1]);
    }
    artL -= artReach + A.wire;
    artR += artReach + A.wire;
    artT -= artReach + A.wire;
    artB += artReach + A.wire;
  }

  /** Fades the wakes, and lays down new ones ahead of each moving sheet. */
  function stir(dt: number) {
    const k = FIELD.wake;
    const fade = Math.exp(-dt / k.decay);
    for (let i = 0; i < wake.length; i++) wake[i] *= fade;
    if (!live.canvas || dt <= 0) return;
    const r = live.canvas.getBoundingClientRect();
    live.sheets.forEach((s, i) => {
      // Velocity in the sculpture's own canvas, so scrolling it along doesn't count as moving.
      const p = prev[i];
      if (!p) {
        prev[i] = { x: s.x, y: s.y, vx: 0, vy: 0 };
        return;
      }
      const ease = Math.min(1, dt / 0.15);
      p.vx += ((s.x - p.x) / dt - p.vx) * ease;
      p.vy += ((s.y - p.y) / dt - p.vy) * ease;
      p.x = s.x;
      p.y = s.y;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < 0.5) return;
      const ux = p.vx / speed;
      const uy = p.vy / speed;
      // Just past the edge of the sheet's clear space, where the lines start.
      const reach = s.r * A.sheet + A.inner + A.fade * 0.6 + k.ahead;
      const cx = s.x + r.left + ux * reach;
      const cy = s.y + r.top + uy * reach;
      const sigma = s.r * k.spread + 10;
      const amount = k.gain * speed * dt;
      const cell = k.cell;
      const c0 = Math.max(0, Math.floor((cx - 2 * sigma) / cell));
      const c1 = Math.min(gw - 1, Math.ceil((cx + 2 * sigma) / cell));
      const r0 = Math.max(0, Math.floor((cy - 2 * sigma) / cell));
      const r1 = Math.min(gh - 1, Math.ceil((cy + 2 * sigma) / cell));
      for (let gy = r0; gy <= r1; gy++)
        for (let gx = c0; gx <= c1; gx++) {
          const dx = gx * cell - cx;
          const dy = gy * cell - cy;
          const j = gy * gw + gx;
          wake[j] = Math.min(1, wake[j] + amount * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
        }
    });
  }

  /** The wake at (x, y), interpolated between grid points. */
  function wakeAt(x: number, y: number) {
    const cell = FIELD.wake.cell;
    const gx = x / cell;
    const gy = y / cell;
    const x0 = gx | 0;
    const y0 = gy | 0;
    if (x0 < 0 || y0 < 0 || x0 >= gw - 1 || y0 >= gh - 1) return 0;
    const tx = gx - x0;
    const ty = gy - y0;
    const j = y0 * gw + x0;
    const top = wake[j] + (wake[j + 1] - wake[j]) * tx;
    const bottom = wake[j + gw] + (wake[j + gw + 1] - wake[j + gw]) * tx;
    return top + (bottom - top) * ty;
  }

  // FIELD.showClearing: the clear space as a red wash, worked out on a coarse grid and scaled up.
  const RED_CELL = 3;
  let red: HTMLCanvasElement | null = null;
  let redData: ImageData | null = null;
  function drawClearing() {
    const cw = Math.ceil(W / RED_CELL) + 1;
    const ch = Math.ceil(H / RED_CELL) + 1;
    if (!red || red.width !== cw || red.height !== ch) {
      red = document.createElement("canvas");
      red.width = cw;
      red.height = ch;
      redData = red.getContext("2d")!.createImageData(cw, ch);
    }
    const px = redData!.data;
    for (let gy = 0; gy < ch; gy++)
      for (let gx = 0; gx < cw; gx++) {
        const x = gx * RED_CELL;
        const y = gy * RED_CELL;
        const m = clearance(x, y, wobble(x * 1.4 + 500, y * 1.4));
        const j = (gy * cw + gx) * 4;
        px[j] = 228;
        px[j + 1] = 38;
        px[j + 2] = 38;
        px[j + 3] = Math.round((1 - m) * 150);
      }
    red.getContext("2d")!.putImageData(redData!, 0, 0);
    ctx!.imageSmoothingEnabled = true;
    ctx!.drawImage(red, 0, 0, cw * RED_CELL * dpr, ch * RED_CELL * dpr);
  }

  // On the 2D canvas, the characters of each opacity are gathered and drawn together.
  const buckets: number[][] = [];

  // How far the waves have run (radians), advanced each frame.
  let drift = 0;

  function draw() {
    locate();
    if (!atlas) return;
    const wv = FIELD.wave;
    const waving = wv.depth > 0;
    const base = G.alpha;
    const wakeAlpha = FIELD.wake.alpha;
    for (let i = 0; i < count; i++) {
      const x = X[i];
      const y = Y[i];
      const m = clearance(x, y, ROUGH[i]);
      if (m < 0.02) {
        ALPHA[i] = 0;
        continue;
      }
      let a = base;
      if (waving) {
        const l = LINE[i];
        let v = 0.5 + 0.5 * Math.sin(lineK[l] * ALONG[i] - drift * lineRate[l] + linePhase[l]);
        if (wv.shape !== 1) v **= wv.shape;
        a *= 1 - wv.depth + wv.depth * v;
      }
      ALPHA[i] = Math.min(1, (a + wakeAlpha * wakeAt(x, y)) * m);
    }

    if (layer) {
      layer.draw(ALPHA);
      return;
    }
    for (const b of buckets) if (b) b.length = 0;
    for (let i = 0; i < count; i++) {
      const q = Math.round(ALPHA[i] * 100);
      if (q > 0) (buckets[q] ??= []).push(i);
    }
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.globalAlpha = 1;
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    if (FIELD.showClearing) drawClearing();
    const c = cellPx;
    buckets.forEach((b, q) => {
      if (!b || !b.length) return;
      ctx!.globalAlpha = q / 100;
      for (const i of b) ctx!.drawImage(atlas!, KIND[i] * c, 0, c, c, DX[i], DY[i], c, c);
    });
    ctx!.globalAlpha = 1;
  }

  let raf = 0;
  let last = 0;
  let drawn = -Infinity;
  let dirty = true;
  let frames = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const t = now / 1000;
    const dt = last ? Math.min(0.1, t - last) : 0;
    last = t;
    const still = reduceMotion.matches;
    stir(still ? 0 : dt);
    if (!still) drift = (drift + (TAU * dt) / FIELD.wave.period) % (TAU * 1e4);
    // The waves and wakes change slowly, so they're redrawn at FIELD.fps; a scroll redraws
    // at once, keeping the clear space around the text in step with it. Held still (reduced
    // motion), only a scroll or the sculpture settling in redraws.
    // Nothing moves without the waves or the sculpture, so then only a scroll redraws.
    const moving = FIELD.wave.depth > 0 || !!live.canvas;
    const due = still ? frames < 60 : moving && t - drawn >= 1 / FIELD.fps - 0.002;
    if (!dirty && !due) return;
    frames++;
    drawn = t;
    dirty = false;
    draw();
  }

  const onScroll = () => {
    dirty = true;
  };
  const onResize = () => build();
  build();
  measureText();
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, { passive: true });
  // The text's lines move whenever its layout does (a new width, the fonts arriving).
  const textResize = new ResizeObserver(() => measureText());
  if (column) textResize.observe(column);
  raf = requestAnimationFrame(frame);
  // Draw the characters again once the typewriter face has loaded, and measure the text
  // again once its own fonts have.
  let disposed = false;
  document.fonts.load(font(G.size)).then(() => !disposed && drawAtlas());
  document.fonts.ready.then(() => !disposed && measureText());

  return () => {
    disposed = true;
    layer?.dispose();
    cancelAnimationFrame(raf);
    textResize.disconnect();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll);
  };
}
