/*
 * Draws the mobile in ASCII characters.
 *
 * The characters are attached to the sculpture, not snapped to a grid on the screen. A
 * screen grid only changes when a part crosses a whole character cell, which hides the
 * mobile's slow, small swings. Instead:
 *
 *   - Each sheet carries its own grid of characters, laid out in the sheet's plane: RL
 *     terms with operators between them through its middle, lighter characters along the
 *     edge where the sheet only partly covers a cell. Every frame the grid is mapped onto
 *     the screen with the sheet's own projection, so it moves, turns and foreshortens
 *     exactly like the painted sheet; seen edge-on, its characters squeeze into a sliver.
 *   - As a sheet turns, its terms swap in place, one at a time, for other terms of the same
 *     length: π(·|s) becomes Q(s,a), logπ(a|s) becomes E[G(s,a)]. The more it turns, the
 *     more change; in still air only the odd term changes.
 *   - Each arm is a dashed line of characters spaced along its length:  -  , turning into
 *     /  \  on its steepest stretches and  |  where it runs nearly straight down, with an  o
 *     at each joint. The strings (the
 *     thread from above and the hooks between levels) are  |  in their own, lighter color.
 *   - The wall shadow is the sheets' outlines projected onto the wall as faint characters,
 *     which also change as their sheet moves.
 *   - Farther parts, and sheets turned away from the light, are printed closer to the
 *     background color.
 *
 * Each sheet has a solid backing, a blend of the page color and its own color, so nothing
 * behind it shows through between its characters.
 */

import { ASCII, VIEW } from "./config";
import type { PaletteKey, Renderer, Scene } from "./engine";
import { arm, type Rod, type Shape } from "./physics";
import { mulberry32 } from "./shapes";

/** Narrowest a sheet's characters get when it is edge-on, as a fraction of full width. */
const MIN_SQUEEZE = 0.06;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// The vocabulary, grouped by length, so a term can be swapped for one that fits its slot.
const TERMS = new Map<number, string[][]>();
for (const term of ASCII.terms) {
  const chars = Array.from(term);
  const group = TERMS.get(chars.length) ?? [];
  group.push(chars);
  TERMS.set(chars.length, group);
}
const TERM_LENGTHS = [...TERMS.keys()].filter((n) => n >= 2).sort((a, b) => a - b);
const OPERATORS = ASCII.operators.map((o) => [o]);
const LETTERS = TERMS.get(1) ?? OPERATORS;
const SHADOW = ASCII.shadowGlyphs.map((g) => [g]);

/** A run of cells holding one term (or operator), and the group it swaps within. */
interface Slot {
  at: number;
  group: string[][];
  current: number;
  /** Turning left before this slot next changes (in swap units; see ASCII.swapPerRadian). */
  budget: number;
}

/** One printed row of a sheet's grid: the cells it spans and where it sits in text space. */
interface Row {
  first: number;
  last: number;
  /** Left edge facing front and facing back, and the row's center height. */
  x: number;
  xBack: number;
  y: number;
}

/** A sheet's character grid, in its arm's local (u, v) coordinates. */
interface SheetGrid {
  shape: Shape;
  /** Center of the grid, where its projection is linearized. */
  cu: number;
  cv: number;
  /** What each cell prints, on the sheet and in its shadow. */
  face: string[];
  shade: string[];
  rows: Row[];
  shadowRows: Row[];
  slots: Slot[];
  shadowSlots: Slot[];
  /** The sheet's yaw at the previous frame, to measure how far it turned. */
  lastTheta: number;
}

/** Even-odd point-in-polygon test on (u, v) pairs. */
function inside(p: Float64Array, x: number, y: number) {
  let hit = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i];
    const yi = p[2 * i + 1];
    const xj = p[2 * j];
    const yj = p[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function createAsciiRenderer(scene: Scene): Renderer {
  const { ctx } = scene;
  // The mobile on show can change with the layout; resize() picks up the current one.
  let rods = scene.mobile.rods;
  let shapes = scene.mobile.shapes;
  const rng = mulberry32(17);

  let sheetFont = "";
  let wireFont = "";
  let outline = 0; // width of the sheets' extra outline (ASCII.sheetOutline), in font px
  let cw = 6; // character cell, CSS px
  let ch = 11;
  let du = 0.03; // the same cell in world units, at the scale of the thread's plane
  let dv = 0.05;
  let grids: SheetGrid[] = [];
  let lastTime = 0;

  // Draw order is back to front, re-sorted every frame as the arms turn.
  type Item = { z: number; rod?: Rod; grid?: SheetGrid };
  let items: Item[] = [];

  // ---------------------------------------------------------------------------------
  // Color: a palette color mixed toward the paper color by f (0–1), cached in steps.
  // The colors, the sheets' backing tint and the depth fade come from globals.css.
  // ---------------------------------------------------------------------------------
  const colorCache = new Map<string, string>();
  const FADE_STEPS = 32;
  let tint = 0.15;
  let depthFadeMax: number = ASCII.depthFade;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const t = parseFloat(cs.getPropertyValue("--mobile-tint"));
    tint = Number.isFinite(t) ? t : 0.15;
    const d = parseFloat(cs.getPropertyValue("--mobile-depth-fade"));
    depthFadeMax = Number.isFinite(d) ? d : ASCII.depthFade;
    colorCache.clear();
  }

  function faded(key: PaletteKey, f: number) {
    const q = Math.round(clamp(f, 0, 1) * FADE_STEPS);
    const id = key + q;
    let s = colorCache.get(id);
    if (!s) {
      const t = q / FADE_STEPS;
      const c = scene.palette[key];
      const p = scene.palette.paper;
      s = `rgb(${Math.round(c[0] + (p[0] - c[0]) * t)},${Math.round(c[1] + (p[1] - c[1]) * t)},${Math.round(
        c[2] + (p[2] - c[2]) * t,
      )})`;
      colorCache.set(id, s);
    }
    return s;
  }

  /** A sheet's backing: its color at exactly --mobile-tint opacity over the page. */
  function tinted(key: PaletteKey) {
    const id = key + "@";
    let s = colorCache.get(id);
    if (!s) {
      const c = scene.palette[key];
      const p = scene.palette.paper;
      s = `rgb(${[0, 1, 2].map((i) => Math.round(p[i] + (c[i] - p[i]) * tint)).join(",")})`;
      colorCache.set(id, s);
    }
    return s;
  }

  /** How much to fade a part at depth z (positive z is toward the viewer). */
  function depthFade(z: number) {
    const t = clamp((ASCII.depthRange - z) / (2 * ASCII.depthRange), 0, 1);
    return depthFadeMax * Math.pow(t, 1.4);
  }

  // ---------------------------------------------------------------------------------
  // Slots: terms and operators placed in cells, each able to swap within its group.
  // ---------------------------------------------------------------------------------
  const freshBudget = () => 0.4 + rng() * 1.2; // averages one swap per unit spent

  function place(cells: string[], slots: Slot[], group: string[][], at: number) {
    const current = Math.floor(rng() * group.length);
    const chars = group[current];
    for (let k = 0; k < chars.length; k++) cells[at + k] = chars[k];
    slots.push({ at, group, current, budget: freshBudget() });
  }

  /** Fills a run of `length` cells from `at` with terms, operators between them. */
  function fillRun(cells: string[], slots: Slot[], at: number, length: number) {
    let needOperator = false;
    while (length > 0) {
      const fits = TERM_LENGTHS.filter((n) => n <= length);
      if (needOperator || length === 1 || fits.length === 0) {
        place(cells, slots, needOperator || rng() < 0.5 ? OPERATORS : LETTERS, at);
        at += 1;
        length -= 1;
        needOperator = false;
        continue;
      }
      // Prefer longer terms, so sheets read as equations rather than symbol soup.
      const total = fits.reduce((s, n) => s + n, 0);
      let pick = rng() * total;
      let n = fits[0];
      for (const f of fits) {
        n = f;
        if ((pick -= f) <= 0) break;
      }
      place(cells, slots, TERMS.get(n)!, at);
      at += n;
      length -= n;
      needOperator = true;
    }
  }

  /** Spends `amount` of every slot's budget, swapping the ones that run out. */
  function spend(cells: string[], slots: Slot[], amount: number) {
    for (const s of slots) {
      s.budget -= amount;
      if (s.budget > 0) continue;
      s.budget += freshBudget();
      if (s.group.length < 2) continue;
      let next = Math.floor(rng() * (s.group.length - 1));
      if (next >= s.current) next++;
      s.current = next;
      const chars = s.group[next];
      for (let k = 0; k < chars.length; k++) cells[s.at + k] = chars[k];
    }
  }

  // ---------------------------------------------------------------------------------
  // Sheet grids: one cell per character, covering each sheet's outline.
  // ---------------------------------------------------------------------------------
  function buildGrid(shape: Shape): SheetGrid {
    const p = shape.pts;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let j = 0; j < p.length; j += 2) {
      minU = Math.min(minU, p[j]);
      maxU = Math.max(maxU, p[j]);
      minV = Math.min(minV, p[j + 1]);
      maxV = Math.max(maxV, p[j + 1]);
    }
    const cols = Math.ceil((maxU - minU) / du) + 1;
    const nrows = Math.ceil((maxV - minV) / dv) + 1;
    const u0 = minU - (cols * du - (maxU - minU)) / 2;
    const v0 = minV - (nrows * dv - (maxV - minV)) / 2;
    const cu = u0 + (cols * du) / 2;
    const cv = v0 + (nrows * dv) / 2;

    // How much of each cell the sheet covers (4×4 samples per cell).
    const cover = new Float32Array(cols * nrows);
    const N = 4;
    for (let r = 0; r < nrows; r++) {
      for (let c = 0; c < cols; c++) {
        let hits = 0;
        for (let sy = 0; sy < N; sy++)
          for (let sx = 0; sx < N; sx++)
            if (inside(p, u0 + (c + (sx + 0.5) / N) * du, v0 + (r + (sy + 0.5) / N) * dv)) hits++;
        cover[r * cols + c] = hits / (N * N);
      }
    }

    // The face: terms through each row's solid stretches, edge shading where the sheet only
    // partly covers a cell, nothing outside. The shadow: faint characters where covered.
    const face: string[] = new Array(cols * nrows).fill(" ");
    const shade: string[] = new Array(cols * nrows).fill(" ");
    const slots: Slot[] = [];
    const shadowSlots: Slot[] = [];
    const edge = ASCII.edgeRamp;
    for (let r = 0; r < nrows; r++) {
      let run = -1;
      for (let c = 0; c <= cols; c++) {
        const i = r * cols + c;
        const k = c < cols ? cover[i] : 0;
        if (c < cols && k >= 0.5) place(shade, shadowSlots, SHADOW, i);
        if (k >= ASCII.solidCoverage) {
          if (run < 0) run = c;
          continue;
        }
        if (run >= 0) {
          fillRun(face, slots, r * cols + run, c - run);
          run = -1;
        }
        if (c < cols && k >= ASCII.minCoverage) {
          face[i] = edge[Math.min(edge.length - 1, Math.floor((k / ASCII.solidCoverage) * edge.length))];
        }
      }
    }

    const toRows = (cells: string[]): Row[] => {
      const S = scene.S;
      const out: Row[] = [];
      for (let r = 0; r < nrows; r++) {
        let first = -1;
        let last = -1;
        for (let c = 0; c < cols; c++) {
          if (cells[r * cols + c] === " ") continue;
          if (first < 0) first = c;
          last = c;
        }
        if (first < 0) continue;
        out.push({
          first: r * cols + first,
          last: r * cols + last,
          x: (u0 + first * du - cu) * S,
          xBack: -(u0 + (last + 1) * du - cu) * S,
          y: (v0 + (r + 0.5) * dv - cv) * S,
        });
      }
      return out;
    };

    return {
      shape,
      cu,
      cv,
      face,
      shade,
      rows: toRows(face),
      shadowRows: toRows(shade),
      slots,
      shadowSlots,
      lastTheta: shape.rod.theta,
    };
  }

  /**
   * Swaps terms and shadow characters by how far the sheet turned, plus the drift; not at
   * all while the mobile is held still for reading (scene.quiet).
   */
  function update(g: SheetGrid, dt: number) {
    const theta = g.shape.rod.theta;
    const live = Math.max(0, 1 - 2 * scene.quiet);
    const amount = live * (ASCII.swapPerRadian * Math.abs(theta - g.lastTheta) + ASCII.swapDrift * dt);
    g.lastTheta = theta;
    if (amount <= 0) return;
    spend(g.face, g.slots, amount);
    spend(g.shade, g.shadowSlots, amount);
  }

  /**
   * Prints a sheet's rows through a projection (the camera, or the shadow on the wall).
   * The projection is linearized at the grid's center: a sheet is small next to the camera
   * distance, so one affine map per sheet places every character where that bit of sheet
   * really is.
   */
  function printGrid(g: SheetGrid, proj: Scene["project"], rows: Row[], cells: string[], spread = 1, stroke = 0) {
    const { S, dpr } = scene;
    const r = g.shape.rod;
    const h = 0.01;
    proj(r.x + g.cu * r.dx, r.y + g.cv, r.z + g.cu * r.dz);
    const px = scene.PX;
    const py = scene.PY;
    proj(r.x + (g.cu + h) * r.dx, r.y + g.cv, r.z + (g.cu + h) * r.dz);
    let ax = (scene.PX - px) / h;
    let ay = (scene.PY - py) / h;
    proj(r.x + g.cu * r.dx, r.y + g.cv + h, r.z + g.cu * r.dz);
    const bx = (scene.PX - px) / h;
    const by = (scene.PY - py) / h;

    // Seen from behind, the grid is mirrored but the characters stay upright: flip the
    // horizontal axis and print each row in reverse.
    const back = ax < 0;
    if (back) {
      ax = -ax;
      ay = -ay;
    }
    ax = Math.max(ax, MIN_SQUEEZE * S); // keep a sliver when exactly edge-on
    const k = (dpr * spread) / S; // (spread: printed larger about the grid's center)
    ctx.setTransform(k * ax, k * ay, k * bx, k * by, dpr * px, dpr * py);
    for (const row of rows) {
      let text = "";
      if (back) for (let i = row.last; i >= row.first; i--) text += cells[i];
      else for (let i = row.first; i <= row.last; i++) text += cells[i];
      ctx.fillText(text, back ? row.xBack : row.x, row.y);
      if (stroke) ctx.strokeText(text, back ? row.xBack : row.x, row.y);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Fills a sheet's outline with a solid color, hiding whatever is behind it. */
  function backing(s: Shape, color: string) {
    const r = s.rod;
    const p = s.pts;
    ctx.beginPath();
    for (let j = 0; j < p.length; j += 2) {
      scene.project(r.x + p[j] * r.dx, r.y + p[j + 1], r.z + p[j] * r.dz);
      if (j === 0) ctx.moveTo(scene.PX, scene.PY);
      else ctx.lineTo(scene.PX, scene.PY);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawSheet(g: SheetGrid) {
    const s = g.shape;
    // The backing: the sheet's color at --mobile-tint opacity over the page. The characters
    // print in the exact color, however far back or turned the sheet is.
    backing(s, tinted(s.color));
    ctx.font = sheetFont;
    ctx.fillStyle = ctx.strokeStyle = faded(s.color, 0);
    ctx.lineWidth = outline;
    ctx.lineJoin = "round";
    ctx.textAlign = "left";
    printGrid(g, scene.project, g.rows, g.face, 1, outline);
  }

  // ---------------------------------------------------------------------------------
  // Wires: characters spaced one cell apart along each wire, fixed to the wire.
  // ---------------------------------------------------------------------------------
  /** Character for a wire running in screen direction (dx, dy), judged in cell units. */
  function slopeGlyph(dx: number, dy: number) {
    // Mostly dashes, so arcs read as dashed curves; only the steepest stretches (over about
    // 50° on screen) turn into slashes, and nearly vertical ones into a bar. (The angle is
    // judged in cell units: a cell is about twice as tall as it is wide.)
    const angle = Math.atan2(Math.abs(dy / ch), Math.abs(dx / cw));
    if (angle > 1.3) return "|";
    if (angle > 0.56) return dx * dy > 0 ? "\\" : "/";
    return "-";
  }

  function glyphAt(g: string, x: number, y: number, z: number, color: PaletteKey = "wire") {
    scene.project(x, y, z);
    ctx.fillStyle = faded(color, depthFade(z));
    ctx.fillText(g, scene.PX, scene.PY);
  }

  function drawRod(r: Rod) {
    ctx.textAlign = "center";
    const p = r.parent;
    ctx.font = wireFont;
    if (p) {
      // The hook: a short run of string from the parent's arm end down to this arm.
      const n = Math.max(1, Math.round(r.drop / dv));
      const top = r.y - r.drop;
      for (let i = 0; i < n; i++) glyphAt("|", r.x, top + ((i + 0.5) / n) * r.drop, r.z, "string");
    }

    // The arm: a character each time the wire has run one cell along its length (so steep
    // stems stay as continuous as flat arms), following its slope on screen.
    const steps = Math.max(24, Math.ceil(r.len / du) * 8);
    let run = 0.5; // the first character sits half a cell in from the end
    let pu = -r.a;
    let pv = arm(r, pu);
    let gu = pu; // where the previous character went, to read the slope from
    let gv = pv;
    for (let i = 1; i <= steps; i++) {
      const u = -r.a + (r.len * i) / steps;
      const v = arm(r, u);
      run += Math.hypot((u - pu) / du, (v - pv) / dv);
      pu = u;
      pv = v;
      if (run < 1) continue;
      run -= 1;
      if (Math.hypot(u / du, v / dv) > 0.6) {
        // (leaving room for the loop at the pivot)
        scene.project(r.x + gu * r.dx, r.y + gv, r.z + gu * r.dz);
        const x0 = scene.PX;
        const y0 = scene.PY;
        scene.project(r.x + u * r.dx, r.y + v, r.z + u * r.dz);
        glyphAt(slopeGlyph(scene.PX - x0, scene.PY - y0), r.x + u * r.dx, r.y + v, r.z + u * r.dz);
      }
      gu = u;
      gv = v;
    }

    glyphAt("o", r.x, r.y, r.z);
  }

  // ---------------------------------------------------------------------------------

  function resize() {
    const { S } = scene;
    const minFont = scene.layout === "phone" ? ASCII.phoneMinFont : ASCII.minFont;
    const fontPx =
      scene.layout === "thumbnail"
        ? VIEW.thumbnail.font
        : clamp(Math.round(S * ASCII.fontScale * 2) / 2, minFont, ASCII.maxFont);
    sheetFont = `${ASCII.sheetWeight} ${fontPx}px ${ASCII.font}`;
    outline = fontPx * ASCII.sheetOutline;
    wireFont = `${fontPx}px ${ASCII.font}`;
    ctx.font = sheetFont;
    cw = ctx.measureText("M").width;
    ch = fontPx * ASCII.lineHeight;
    du = cw / S;
    dv = ch / S;
    rods = scene.mobile.rods;
    shapes = scene.mobile.shapes;
    grids = shapes.map(buildGrid);
    items = [...rods.map((rod) => ({ z: 0, rod })), ...grids.map((grid) => ({ z: 0, grid }))];
    readColors();

    // Measure again once the typewriter faces have loaded (the fallback has other widths).
    if (!document.fonts.check(sheetFont) || !document.fonts.check(wireFont)) {
      const pending = sheetFont;
      Promise.all([document.fonts.load(sheetFont), document.fonts.load(wireFont)]).then(() => {
        if (pending === sheetFont && document.fonts.check(sheetFont)) resize();
      });
    }
  }

  /** A copy of a sheet's shadow cells with only `share` of them printed (the same ones every frame). */
  function sparse(cells: string[], share: number) {
    const keep = mulberry32(cells.length);
    return cells.map((c) => (keep() < share ? c : " "));
  }

  /** Faint shadow characters in a few of the background's cells (VIEW.thumbnail.noise). */
  function scatterNoise() {
    const pick = mulberry32(17);
    const glyphs = ASCII.shadowGlyphs;
    ctx.textAlign = "center";
    for (let y = ch / 2; y < scene.cssH; y += ch)
      for (let x = cw / 2; x < scene.cssW; x += cw)
        if (pick() < VIEW.thumbnail.noise) ctx.fillText(glyphs[Math.floor(pick() * glyphs.length)], x, y);
  }

  function render() {
    const { dpr, cssW, cssH } = scene;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.textBaseline = "middle";
    const now = performance.now();
    const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
    lastTime = now;
    for (const g of grids) update(g, dt);

    // 1. The shadow on the wall. (The share image thins it out and scatters a few of its
    //    characters over the background.)
    const thumb = scene.layout === "thumbnail";
    ctx.font = sheetFont;
    ctx.fillStyle = faded("wire", 0);
    ctx.globalAlpha = thumb ? VIEW.thumbnail.shadow : ASCII.shadowOpacity;
    if (thumb) scatterNoise();
    ctx.textAlign = "left";
    const keep = thumb ? VIEW.thumbnail.shadowKeep : ASCII.shadowKeep;
    if (thumb || ASCII.wallShadow)
      for (const g of grids) printGrid(g, scene.projectShadow, g.shadowRows, sparse(g.shade, keep), ASCII.shadowSpread);

    // 2. The thread, rising out of view.
    ctx.font = wireFont;
    ctx.globalAlpha = 1;
    ctx.fillStyle = faded("string", 0);
    ctx.textAlign = "center";
    for (let y = ch / 2; y < scene.oy - ch * 0.6; y += ch) ctx.fillText("|", scene.ox, y);

    // 3. Arms and sheets, back to front.
    for (const it of items) {
      if (it.rod) it.z = it.rod.z + ((it.rod.b - it.rod.a) / 2) * it.rod.dz;
      else it.z = it.grid!.shape.z;
    }
    items.sort((p, q) => p.z - q.z);
    for (const it of items) {
      if (it.rod) drawRod(it.rod);
      else drawSheet(it.grid!);
    }
  }

  return { resize, render };
}
