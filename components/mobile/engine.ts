/*
 * Everything about the mobile except how it is drawn: the camera, placement on the page,
 * colors, the air field, input and the animation loop. The renderer (draw-ascii.ts)
 * receives the Scene and draws it.
 *
 * The physics lives in physics.ts; every tuning knob lives in config.ts.
 */

import { AIR, BREEZE, DESIGN, DESIGN_SIDE, PHYSICS, VIEW, type ColorKey } from "./config";
import {
  arm,
  buildMobile,
  kinematics,
  resetPose,
  setArcScale,
  settleToward,
  startPose,
  step,
  type Mobile,
  type Shape,
  type Wind,
} from "./physics";
import { live } from "./live";
import { mulberry32 } from "./shapes";

export type RGB = [number, number, number];
export type PaletteKey = ColorKey | "wire" | "string" | "paper";

/** What a renderer gets to work with. Fields are updated in place on resize and theme change. */
export interface Scene {
  mobile: Mobile;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** CSS px per world unit, and the screen position of the top pivot. */
  S: number;
  ox: number;
  oy: number;
  cssW: number;
  cssH: number;
  dpr: number;
  /** Output of project() / projectShadow(). */
  PX: number;
  PY: number;
  /** Projects a world point into (PX, PY); returns the perspective factor. */
  project: (x: number, y: number, z: number) => number;
  /** Projects a point's shadow on the wall behind the mobile into (PX, PY). */
  projectShadow: (x: number, y: number, z: number) => number;
  /** Colors from the --mobile-* tokens in globals.css. */
  palette: Record<PaletteKey, RGB>;
  /**
   * Beside the text ("side"), above it ("header"), above it on a phone-width screen ("phone"),
   * or alone as a still picture filling the canvas ("thumbnail", the share image).
   */
  layout: "side" | "header" | "phone" | "thumbnail";
  /** How frozen the mobile is for reading (0 moving freely, 1 held still; VIEW.scrollCalm). */
  quiet: number;
}

export interface Renderer {
  /** Called after the canvas has been sized or the colors changed. */
  resize(): void;
  /** Draws the current pose (kinematics are already up to date). */
  render(): void;
}

/**
 * Reads a CSS color as RGB: #rgb, #rrggbb (the build may shorten either way) or rgb().
 * Anything else returns the fallback.
 */
export function parseColor(value: string, fallback: RGB): RGB {
  const v = value.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as RGB;
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  return fallback;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Upper bound on the canvas backing store, in device pixels. */
const MAX_CANVAS_PIXELS = 36e6;

export interface MobileOptions {
  /** Draw a still picture filling the canvas (the share image, app/thumbnail) instead of the live page. */
  thumbnail?: boolean;
}

/** Starts the mobile on a canvas. Returns a cleanup function. */
export function runMobile(
  canvas: HTMLCanvasElement,
  createRenderer: (scene: Scene) => Renderer,
  options: MobileOptions = {},
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const html = document.documentElement;

  // Two versions of the arrangement: the side view hangs beside the text on wide screens,
  // the compact one in the band above the text. Layout picks one (see use()).
  const wide = buildMobile(DESIGN_SIDE);
  const compact = buildMobile(DESIGN);
  let mobile = compact;

  // -----------------------------------------------------------------------------------
  // Camera. A subtle perspective: points nearer the viewer (z > 0) are drawn larger.
  //   screen = origin + S · (x, camY + (y − camY)) · F / (F − z)
  // -----------------------------------------------------------------------------------
  const F = VIEW.camera;
  let reach = mobile.reach;
  let span = 0; // widest possible footprint on screen, world units
  let kNear = 1; // magnification of the nearest possible point
  let wallZ = 0; // the wall behind the mobile, for its shadow
  let camY = 0; // the camera's height, mid-mobile
  let bottom = 0; // lowest possible point on screen, below the pivot (world units)
  // The side view lowers a little as the page scrolls (VIEW.side.drop): where its top pivot
  // starts, how far it may go (CSS px), and how far it has gone.
  let sideTop = 0;
  let sideDrop = 0;
  let dropped = 0;

  /** The artwork's left and right edges at rest (world units, with perspective). */
  function restExtent(m: Mobile) {
    const saved = m.rods.map((r) => [r.theta, r.omega]);
    resetPose(m);
    kinematics(m);
    let min = 0;
    let max = 0;
    const visit = (x: number, z: number) => {
      const sx = (x * F) / (F - z);
      min = Math.min(min, sx);
      max = Math.max(max, sx);
    };
    for (const r of m.rods) {
      visit(r.x - r.a * r.dx, r.z - r.a * r.dz);
      visit(r.x + r.b * r.dx, r.z + r.b * r.dz);
      for (const s of r.shapes) for (let j = 0; j < s.pts.length; j += 2) visit(r.x + s.pts[j] * r.dx, r.z + s.pts[j] * r.dz);
    }
    m.rods.forEach((r, i) => ([r.theta, r.omega] = saved[i]));
    kinematics(m);
    return { min, max };
  }
  const rest = new Map([wide, compact].map((m) => [m, restExtent(m)]));

  /** Puts `m` on show (starting it swinging if it wasn't), and updates its bounds. */
  function use(m: Mobile, restart = false) {
    if (m !== mobile || restart) {
      mobile = m;
      startPose(m, still);
    }
    scene.mobile = m;
    reach = m.reach;
    span = reach.left + reach.right;
    kNear = F / (F - reach.depth);
    wallZ = -reach.depth * VIEW.shadow.wall;
  }

  /** Sets how far the arcs droop, and updates the vertical measures that depend on it. */
  function setArcs(k: number) {
    setArcScale(mobile, k, VIEW.wideArcLower);
    camY = (mobile.minY + mobile.maxY) / 2;
    bottom = camY + (mobile.maxY - camY) * kNear;
  }
  const [lightX, lightY] = VIEW.shadow.light;

  const scene: Scene = {
    mobile,
    canvas,
    ctx,
    S: 200,
    ox: 0,
    oy: 0,
    cssW: 0,
    cssH: 0,
    dpr: 1,
    PX: 0,
    PY: 0,
    project(x, y, z) {
      const k = F / (F - z);
      scene.PX = scene.ox + scene.S * x * k;
      scene.PY = scene.oy + scene.S * (camY + (y - camY) * k);
      return k;
    },
    projectShadow(x, y, z) {
      const t = z - wallZ;
      return scene.project(x + lightX * t, y + lightY * t, wallZ);
    },
    palette: {
      ink: [35, 54, 80],
      teal: [8, 127, 140],
      coral: [212, 76, 104],
      wire: [43, 42, 39],
      string: [168, 163, 154],
      paper: [255, 255, 255],
    },
    quiet: 0,
    layout: "side",
  };

  // -----------------------------------------------------------------------------------
  // Placement. Desktop: hang from the top of the viewport in the space to the right of
  // the text column, scaled and positioned so that no reachable pose (mobile.reach) can
  // cross into the text. If that space is too small, stack it above the text.
  // -----------------------------------------------------------------------------------
  const narrow = matchMedia("(max-width: 767px)");
  const phoneWidth = matchMedia(`(max-width: ${VIEW.header.phone.below - 0.02}px)`);

  function layout() {
    if (options.thumbnail) layoutThumbnail();
    else layoutPage();
    fitCanvas();
  }

  function layoutPage() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let stacked = narrow.matches;

    if (!stacked) {
      html.removeAttribute("data-stacked");
      scene.layout = "side";
      use(wide);
      const col = document.getElementById("column");
      const right = col ? col.getBoundingClientRect().right : vw / 2;
      const pad = VIEW.sidePadding;
      const gap = Math.max(pad.gapMin, vw * pad.gap);
      const left = right + gap;
      const avail = vw - left - pad.right;
      const top = clamp(vh * pad.top, pad.topMin, pad.topMax);
      const room = vh - top - pad.bottom;
      setArcs(1);
      const fit = Math.min(avail / span, room / bottom, VIEW.maxScale);
      if (fit * span < VIEW.minWidth) {
        stacked = true;
      } else {
        const s = fit * VIEW.side.scale;
        // There's usually room below: let the arcs droop more, as far as the height allows.
        for (let k = VIEW.wideArc; k > 1; k -= 0.1) {
          setArcs(k);
          if (s * bottom <= room) break;
        }
        if (s * bottom > room) setArcs(1);
        scene.S = s;
        scene.ox = left + s * reach.left + (avail - s * span) / 2 - avail * VIEW.side.nudge;
        sideTop = top;
        sideDrop = Math.max(0, Math.min(vh * VIEW.side.drop, room - s * bottom));
        dropped = Math.min(dropped, sideDrop);
        scene.oy = top + dropped;
      }
    }

    if (stacked) {
      if (!narrow.matches) html.setAttribute("data-stacked", "");
      // Phone-width screens get the side view's deeper look; wider windows the compact one.
      const phone = phoneWidth.matches;
      scene.layout = phone ? "phone" : "header";
      const sideLook = phone && VIEW.header.phone.design === "side";
      use(sideLook ? wide : compact);
      setArcs(sideLook ? VIEW.wideArc : 1);
      // Center the artwork (not its thread), sized so that every reachable pose still fits
      // the width; then shrink the band above the text to the height actually needed.
      html.style.removeProperty("--mobile-h");
      const { width, height } = canvas.getBoundingClientRect();
      const oy = phone ? VIEW.header.phone.thread : VIEW.header.thread;
      const { min, max } = rest.get(mobile)!;
      const center = (min + max) / 2;
      const half = Math.max(center + reach.left, reach.right - center);
      const s = Math.min((width - 32) / (2 * half), (height - oy - 24) / bottom, VIEW.maxScale);
      scene.S = s;
      scene.oy = oy;
      scene.ox = width / 2 - s * center;
      html.style.setProperty("--mobile-h", `${Math.ceil(oy + s * bottom + 24)}px`);
    } else {
      html.style.removeProperty("--mobile-h");
    }
  }

  /**
   * The share image: the side view's arrangement, still, in the pose VIEW.thumbnail sets, as
   * large as fits the canvas within its margins.
   */
  function layoutThumbnail() {
    scene.layout = "thumbnail";
    use(wide);
    wallZ = -reach.depth * VIEW.thumbnail.wall;
    setArcs(VIEW.thumbnail.arc);
    resetPose(mobile);
    settleToward(mobile, VIEW.thumbnail.pose, 1);
    kinematics(mobile);
    // Its extent on screen in this pose, shadow included, measured at a scale of 1 from the top pivot.
    Object.assign(scene, { S: 1, ox: 0, oy: 0 });
    let left = 0;
    let right = 0;
    let low = 0;
    const visit = (x: number, y: number, z: number, shadow = false) => {
      if (shadow) scene.projectShadow(x, y, z);
      else scene.project(x, y, z);
      left = Math.min(left, scene.PX);
      right = Math.max(right, scene.PX);
      low = Math.max(low, scene.PY);
    };
    for (const r of mobile.rods) {
      for (let i = 0; i <= 16; i++) {
        const u = -r.a + (r.len * i) / 16;
        visit(r.x + u * r.dx, r.y + arm(r, u), r.z + u * r.dz);
      }
      for (const s of r.shapes)
        for (let j = 0; j < s.pts.length; j += 2)
          for (const shadow of [false, true]) visit(r.x + s.pts[j] * r.dx, r.y + s.pts[j + 1], r.z + s.pts[j] * r.dz, shadow);
    }
    const { width, height } = canvas.getBoundingClientRect();
    const { top, side, bottom: below } = VIEW.thumbnail;
    const s = Math.min((width * (1 - 2 * side)) / (right - left), (height * (1 - top - below)) / low);
    scene.S = s;
    scene.oy = height * top;
    scene.ox = width / 2 - (s * (left + right)) / 2;
  }

  /** Sizes the canvas's backing store to its box and redraws. */
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    scene.cssW = rect.width;
    scene.cssH = rect.height;
    // Draw at the screen's real pixel density (which browser zoom raises), so the canvas
    // stays sharp when zoomed in. (A viewport-sized canvas then matches the screen's own
    // pixels at any zoom; the cap only guards against absurd sizes.)
    const maxDpr = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, scene.cssW * scene.cssH));
    const density = window.devicePixelRatio || 1;
    scene.dpr = Math.min(options.thumbnail ? Math.max(2, density) : density, maxDpr); // the share image at 2× or more
    canvas.width = Math.round(scene.cssW * scene.dpr);
    canvas.height = Math.round(scene.cssH * scene.dpr);
    renderer.resize();
    if (still) render();
  }

  // -----------------------------------------------------------------------------------
  // Colors, read from CSS so they stay in one place (globals.css).
  // -----------------------------------------------------------------------------------
  function readColors() {
    const cs = getComputedStyle(html);
    for (const key of Object.keys(scene.palette) as PaletteKey[]) {
      scene.palette[key] = parseColor(cs.getPropertyValue(`--mobile-${key}`), scene.palette[key]);
    }
  }

  // -----------------------------------------------------------------------------------
  // The air. A slow, smooth current made of a few traveling swirls of different sizes
  // and speeds, plus a slow drift and a gentle rise and fall in strength.
  // -----------------------------------------------------------------------------------
  const rng = mulberry32(11);
  const swirls = Array.from({ length: 5 }, (_, i) => {
    const dir = rng() * Math.PI * 2;
    const flow = rng() * Math.PI * 2;
    const lambda = AIR.wavelength[0] + rng() * (AIR.wavelength[1] - AIR.wavelength[0]);
    const period = AIR.period[0] + rng() * (AIR.period[1] - AIR.period[0]);
    return {
      kx: (Math.cos(dir) * 2 * Math.PI) / lambda,
      kz: (Math.sin(dir) * 2 * Math.PI) / lambda,
      w: (2 * Math.PI) / period,
      phase: rng() * Math.PI * 2,
      fx: Math.cos(flow),
      fz: Math.sin(flow),
      amp: 1 / (1 + i * 0.5),
    };
  });
  const ampSum = swirls.reduce((s, w) => s + w.amp, 0);
  for (const w of swirls) w.amp /= ampSum;

  function current(x: number, z: number, t: number, out: Wind) {
    const calm = AIR.speed * (0.75 + 0.25 * Math.sin(0.041 * t) * Math.sin(0.027 * t + 2));
    const strength = calm * (1 - quiet + BREEZE.gustWind * gust);
    let wx = (1 - quiet) * AIR.drift * Math.cos(0.017 * t + 1.3);
    let wz = (1 - quiet) * AIR.drift * Math.sin(0.011 * t);
    for (const s of swirls) {
      const v = strength * s.amp * Math.sin(s.kx * x + s.kz * z - s.w * t + s.phase);
      wx += s.fx * v;
      wz += s.fz * v;
    }
    out.x = wx;
    out.z = wz;
  }

  // -----------------------------------------------------------------------------------
  // The cursor as a breeze, and clicks and taps as puffs. The cursor lives on the screen,
  // in front of the sculpture: sideways motion moves air sideways, and any motion also
  // pushes a little air in toward the wall, as a passing hand would.
  //
  // Moving around the mobile also builds up a gust (0–1) that stirs the whole sculpture:
  // stronger, faster-changing air and livelier eddies. It fades once the cursor rests.
  // The air runs on its own clock (airT), which speeds up in a gust.
  // -----------------------------------------------------------------------------------
  const pointer = { x: 0, y: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, inside: false };
  const puffs: { x: number; y: number; t: number; power: number }[] = [];
  let simT = 0;
  let airT = 0;
  let gust = 0;
  // Still while reading (VIEW.scrollCalm): `quiet` eases to 1 once the page is scrolled, and
  // back to 0 at the top or while someone makes a gust. The more quiet, the more the ambient
  // air fades and the hooks' resting turns shift toward the open display pose, so the mobile
  // comes to rest there (and its letters stop changing). Cursor breezes and puffs still act.
  let quiet = 0;
  let frozen = false; // held exactly still (no simulation at all) while reading
  // Scrolling down stirs it a little even then (VIEW.scrollCalm.nudge): `stirred` (0–1) is
  // how recently, holding off the settling while it lasts. Each arm turns its own way.
  let stirred = 0;
  let lastScroll = typeof window === "undefined" ? 0 : window.scrollY;
  const nudgeWay = mobile.rods.map((r, i) => (i % 2 ? 1 : -1) * (0.6 + 0.4 * Math.abs(Math.sin(i * 12.9898 + 4.1))) * (r.parent ? 1 : 0.5));

  /**
   * Whether a point (canvas px) is in the artwork's area, the space the mobile can reach.
   * Only the cursor and clicks inside it stir the mobile.
   */
  function inArt(x: number, y: number) {
    const { S, ox, oy } = scene;
    return x >= ox - S * reach.left && x <= ox + S * reach.right && y >= 0 && y <= oy + S * bottom;
  }

  const toCanvas = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const [x, y] = toCanvas(e);
    if (!pointer.inside) {
      pointer.lastX = x;
      pointer.lastY = y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.inside = true;
  };
  const onLeave = () => {
    pointer.inside = false;
  };
  // A click or tap sends a puff of air from that spot and adds to the gust, so repeated
  // clicks build it up (each one adding a little less as it nears full strength).
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const [x, y] = toCanvas(e);
    if (!inArt(x, y)) return; // only clicks on the artwork stir it
    puffs.push({ x, y, t: simT, power: 1 });
    if (puffs.length > 6) puffs.shift();
    gust += BREEZE.gustTap * (1 - gust);
  };

  // Clicks pass through the canvas to the page, so double-clicking the artwork would select
  // nearby text. Cancel multi-click selection over the artwork (but not over the text).
  const onMouseDown = (e: MouseEvent) => {
    if (e.detail < 2) return;
    if (document.getElementById("column")?.contains(e.target as Node)) return;
    const [x, y] = toCanvas(e);
    if (inArt(x, y)) e.preventDefault();
  };

  /**
   * Smoothed cursor velocity (CSS px / s), fading to zero when the cursor rests, and the
   * gust it builds up.
   */
  function updatePointer(dt: number) {
    // Movement only counts inside the artwork's area; elsewhere the breeze fades to nothing.
    let rawX = 0;
    let rawY = 0;
    if (pointer.inside && dt > 0 && inArt(pointer.x, pointer.y)) {
      rawX = (pointer.x - pointer.lastX) / dt;
      rawY = (pointer.y - pointer.lastY) / dt;
    }
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    const a = 1 - Math.exp(-dt / 0.09);
    pointer.vx += (rawX - pointer.vx) * a;
    pointer.vy += (rawY - pointer.vy) * a;

    const travel = Math.hypot(rawX, rawY) * dt; // CSS px moved this frame
    gust += BREEZE.gustBuild * travel * (1 - gust);
    gust *= Math.exp(-dt / BREEZE.gustDecay);
  }

  /** Air velocity at a sheet: the ambient current plus cursor breeze and puffs. */
  function air(s: Shape, out: Wind) {
    current(s.x, s.z, airT, out);
    const S = scene.S;

    const speed = Math.hypot(pointer.vx, pointer.vy);
    if (speed > 1) {
      const sigma = BREEZE.radius * S;
      const dx = s.sx - pointer.x;
      const dy = s.sy - pointer.y;
      const fall = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      if (fall > 1e-3) {
        let bx = (BREEZE.gain * pointer.vx) / S;
        let bz = (BREEZE.gain * (0.4 * pointer.vy - BREEZE.push * speed)) / S;
        const m = Math.hypot(bx, bz);
        if (m > BREEZE.max) {
          bx *= BREEZE.max / m;
          bz *= BREEZE.max / m;
        }
        out.x += fall * bx;
        out.z += fall * bz;
      }
    }

    for (const p of puffs) {
      const age = simT - p.t;
      if (age > BREEZE.puffLife) continue;
      // Quick rise, slow fade; the puff spreads as it goes.
      const rise = 0.12;
      const env = (age / rise) * Math.exp(1 - age / rise);
      const sigma = BREEZE.puffRadius * S * (0.7 + 2 * age);
      const dx = s.sx - p.x;
      const dy = s.sy - p.y;
      const d = Math.hypot(dx, dy) + 1e-6;
      const f = BREEZE.puffSpeed * p.power * env * Math.exp(-(d * d) / (2 * sigma * sigma));
      out.x += 0.8 * f * (dx / d);
      out.z -= 0.6 * f;
    }
  }

  // -----------------------------------------------------------------------------------
  // Loop. Physics runs on a fixed timestep; drawing once per frame. With reduced motion,
  // the mobile is drawn once, at rest, and redrawn only on resize or theme change.
  // -----------------------------------------------------------------------------------
  const renderer = createRenderer(scene);

  function render() {
    kinematics(mobile);
    // Remember where each sheet is on screen, for the breeze.
    for (const s of mobile.shapes) {
      scene.project(s.x, s.y, s.z);
      s.sx = scene.PX;
      s.sy = scene.PY;
    }
    renderer.render();
    if (!options.thumbnail) shareLive();
  }

  /** Publishes where the sheets and wires are on screen (live.ts). */
  function shareLive() {
    const { S } = scene;
    live.canvas = canvas;
    live.sheets.length = mobile.shapes.length;
    mobile.shapes.forEach((s, i) => {
      const o = live.sheets[i] ?? (live.sheets[i] = { x: 0, y: 0, r: 0 });
      o.x = s.sx;
      o.y = s.sy;
      o.r = Math.sqrt(s.area / Math.PI) * S;
    });
    const w = live.wires;
    w.length = 0;
    w.push(scene.ox, 0, scene.ox, scene.oy);
    for (const r of mobile.rods) {
      if (r.parent) {
        scene.project(r.x, r.y - r.drop, r.z);
        w.push(scene.PX, scene.PY);
        scene.project(r.x, r.y, r.z);
        w.push(scene.PX, scene.PY);
      }
      // The arm, as a few straight pieces along its curve.
      let px = 0;
      let py = 0;
      for (let i = 0, n = 8; i <= n; i++) {
        const u = -r.a + (r.len * i) / n;
        scene.project(r.x + u * r.dx, r.y + arm(r, u), r.z + u * r.dz);
        if (i > 0) w.push(px, py, scene.PX, scene.PY);
        px = scene.PX;
        py = scene.PY;
      }
    }
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let still = options.thumbnail || reduceMotion.matches;
  let raf = 0;
  let last = 0;
  let acc = 0;

  let visible = true;

  // The opening gust: once, shortly after the page opens, a strong puff hits the biggest
  // sheet head-on (pushing it back toward the wall) and sets the mobile swinging.
  let opened = false;
  function openingGust() {
    opened = true;
    const biggest = mobile.shapes.reduce((a, b) => (b.area > a.area ? b : a));
    puffs.push({ x: biggest.sx, y: biggest.sy, t: simT, power: BREEZE.openingPower });
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    if (!opened && simT >= BREEZE.openingDelay) openingGust();
    updatePointer(dt);
    if (scene.layout === "side") {
      // Lower with the scroll, easing after it so the move stays gentle.
      const t = clamp(window.scrollY / (VIEW.side.dropOver * window.innerHeight), 0, 1);
      const want = sideDrop * t * t * (3 - 2 * t);
      dropped += (want - dropped) * (1 - Math.exp(-dt / 0.25));
      scene.oy = sideTop + dropped;
    }
    const calm = VIEW.scrollCalm;
    const scrolled = clamp(window.scrollY / (calm.over * window.innerHeight), 0, 1);
    const target = gust > calm.wake ? 0 : scrolled; // only a deliberate gust wakes it
    quiet += (target - quiet) * (1 - Math.exp(-dt / 0.5));
    scene.quiet = quiet;
    // Scrolling down turns each arm a touch and holds off the settling for a moment.
    const down = window.scrollY - lastScroll;
    lastScroll = window.scrollY;
    if (down > 0) {
      // Up to a cap, so even a long, fast scroll only sways it a few degrees (and an arm
      // already swinging faster, from a gust, is left alone).
      mobile.rods.forEach((r, i) => {
        const cap = calm.nudgeMax * Math.abs(nudgeWay[i]);
        if (Math.abs(r.omega) < cap) r.omega = clamp(r.omega + calm.nudge * down * nudgeWay[i], -cap, cap);
      });
      stirred = 1;
    } else stirred *= Math.exp(-dt / calm.nudgeHold);
    // Nearly settled and still meant to be still: snap exactly into the display pose with
    // every velocity at zero, and stop simulating until it is woken.
    if (target === 1 && quiet > 0.99 && stirred < 0.01) {
      if (!frozen) settleToward(mobile, calm.depth, 1);
      frozen = true;
    } else frozen = false;
    const settle = calm.settle * quiet * quiet * (1 - stirred) ** 2;
    acc = frozen ? 0 : acc + dt;
    while (acc >= PHYSICS.timestep) {
      step(mobile, PHYSICS.timestep, airT, air, 1 - quiet + BREEZE.gustEddy * gust, 1 - (1 - calm.depth) * quiet);
      settleToward(mobile, calm.depth, 1 - Math.exp(-PHYSICS.timestep * settle));
      airT += PHYSICS.timestep * (1 + BREEZE.gustTempo * gust);
      simT += PHYSICS.timestep;
      acc -= PHYSICS.timestep;
    }
    render();
  }

  function start() {
    cancelAnimationFrame(raf);
    if (still) {
      if (!options.thumbnail) startPose(mobile, true); // (the thumbnail keeps its display pose)
      render();
    } else {
      startPose(mobile);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  const onMotionPref = () => {
    still = options.thumbnail || reduceMotion.matches;
    start();
  };

  // Skip work while the canvas is scrolled out of view (stacked layout).
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(canvas);

  readColors();
  layout();
  start();

  // A still picture is drawn once, so draw it again once the typewriter faces have loaded.
  let alive = true;
  document.fonts.ready.then(() => {
    if (alive && still) layout();
  });

  // Lay out again when the pixel density changes without a resize (e.g. the window moves
  // to another display): watch for the current density to stop matching.
  let densityQuery: MediaQueryList | null = null;
  const onDensity = () => {
    layout();
    watchDensity();
  };
  function watchDensity() {
    densityQuery?.removeEventListener("change", onDensity);
    densityQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    densityQuery.addEventListener("change", onDensity);
  }
  watchDensity();

  window.addEventListener("resize", layout);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("mousedown", onMouseDown);
  html.addEventListener("pointerleave", onLeave);
  narrow.addEventListener("change", layout);
  phoneWidth.addEventListener("change", layout);
  reduceMotion.addEventListener("change", onMotionPref);

  return () => {
    alive = false;
    if (live.canvas === canvas) live.canvas = null;
    cancelAnimationFrame(raf);
    io.disconnect();
    window.removeEventListener("resize", layout);
    densityQuery?.removeEventListener("change", onDensity);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("mousedown", onMouseDown);
    html.removeEventListener("pointerleave", onLeave);
    narrow.removeEventListener("change", layout);
    phoneWidth.removeEventListener("change", layout);
    reduceMotion.removeEventListener("change", onMotionPref);
    html.removeAttribute("data-stacked");
    html.style.removeProperty("--mobile-h");
  };
}
