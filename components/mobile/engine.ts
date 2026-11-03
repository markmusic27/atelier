/*
 * Everything about the mobile except how it is drawn: the camera, placement on the page,
 * colors, the air field, input and the animation loop. The renderer (draw-ascii.ts)
 * receives the Scene and draws it.
 *
 * The physics lives in physics.ts; every tuning knob lives in config.ts.
 */

import { AIR, BREEZE, DESIGN, PHYSICS, VIEW, type ColorKey } from "./config";
import { buildMobile, kinematics, resetPose, setArcScale, step, type Mobile, type Shape, type Wind } from "./physics";
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

/** Starts the mobile on a canvas. Returns a cleanup function. */
export function runMobile(canvas: HTMLCanvasElement, createRenderer: (scene: Scene) => Renderer): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const html = document.documentElement;
  const mobile = buildMobile(DESIGN);

  // -----------------------------------------------------------------------------------
  // Camera. A subtle perspective: points nearer the viewer (z > 0) are drawn larger.
  //   screen = origin + S · (x, camY + (y − camY)) · F / (F − z)
  // -----------------------------------------------------------------------------------
  const F = VIEW.camera;
  const { reach } = mobile;
  const span = reach.left + reach.right; // widest possible footprint on screen, world units
  const kNear = F / (F - reach.depth); // magnification of the nearest possible point
  let camY = 0; // the camera's height, mid-mobile
  let bottom = 0; // lowest possible point on screen, below the pivot (world units)

  /** Sets how far the arcs droop, and updates the vertical measures that depend on it. */
  function setArcs(k: number) {
    setArcScale(mobile, k, VIEW.wideArcLower);
    camY = (mobile.minY + mobile.maxY) / 2;
    bottom = camY + (mobile.maxY - camY) * kNear;
  }
  setArcs(1);
  const wallZ = -reach.depth * VIEW.shadow.wall;
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
      ink: [18, 18, 17],
      red: [255, 45, 0],
      blue: [0, 51, 255],
      wire: [43, 42, 39],
      string: [168, 163, 154],
      paper: [255, 255, 255],
    },
  };

  // -----------------------------------------------------------------------------------
  // Placement. Desktop: hang from the top of the viewport in the space to the right of
  // the text column, scaled and positioned so that no reachable pose (mobile.reach) can
  // cross into the text. If that space is too small, stack it above the text.
  // -----------------------------------------------------------------------------------
  const narrow = matchMedia("(max-width: 767px)");

  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let stacked = narrow.matches;

    if (!stacked) {
      html.removeAttribute("data-stacked");
      const col = document.getElementById("column");
      const right = col ? col.getBoundingClientRect().right : vw / 2;
      const gap = Math.max(32, vw * 0.035);
      const left = right + gap;
      const avail = vw - left - 20;
      const top = clamp(vh * 0.13, 48, 150);
      const room = vh - top - 36;
      setArcs(1);
      const s = Math.min(avail / span, room / bottom, VIEW.maxScale);
      if (s * span < VIEW.minWidth) {
        stacked = true;
      } else {
        // There's usually room below: let the arcs droop more, as far as the height allows.
        for (let k = VIEW.wideArc; k > 1; k -= 0.1) {
          setArcs(k);
          if (s * bottom <= room) break;
        }
        if (s * bottom > room) setArcs(1);
        scene.S = s;
        scene.ox = left + s * reach.left + (avail - s * span) / 2;
        scene.oy = top;
      }
    }

    if (stacked) {
      if (!narrow.matches) html.setAttribute("data-stacked", "");
      setArcs(1);
      // Fit the width, then shrink the band above the text to the height actually needed.
      html.style.removeProperty("--mobile-h");
      const { width, height } = canvas.getBoundingClientRect();
      const oy = 40;
      const s = Math.min((width - 32) / span, (height - oy - 24) / bottom, VIEW.maxScale);
      scene.S = s;
      scene.oy = oy;
      scene.ox = 16 + s * reach.left + (width - 32 - s * span) / 2;
      html.style.setProperty("--mobile-h", `${Math.ceil(oy + s * bottom + 24)}px`);
    } else {
      html.style.removeProperty("--mobile-h");
    }

    const rect = canvas.getBoundingClientRect();
    scene.cssW = rect.width;
    scene.cssH = rect.height;
    // Draw at the screen's real pixel density (which browser zoom raises), so the canvas
    // stays sharp when zoomed in. (A viewport-sized canvas then matches the screen's own
    // pixels at any zoom; the cap only guards against absurd sizes.)
    const maxDpr = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, scene.cssW * scene.cssH));
    scene.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = Math.round(scene.cssW * scene.dpr);
    canvas.height = Math.round(scene.cssH * scene.dpr);
    renderer.resize();
    if (still) render();
  }

  // -----------------------------------------------------------------------------------
  // Colors, read from CSS so light and dark mode stay in one place (globals.css).
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
    const strength = calm * (1 + BREEZE.gustWind * gust);
    let wx = AIR.drift * Math.cos(0.017 * t + 1.3);
    let wz = AIR.drift * Math.sin(0.011 * t);
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
  const puffs: { x: number; y: number; t: number }[] = [];
  let simT = 0;
  let airT = 0;
  let gust = 0;

  /** 1 over the area the mobile can reach on screen, falling off with distance outside it. */
  function nearMobile(x: number, y: number) {
    const { S, ox, oy } = scene;
    const dx = Math.max(ox - S * reach.left - x, 0, x - (ox + S * reach.right));
    const dy = Math.max(-y, 0, y - (oy + S * bottom));
    const d = Math.hypot(dx, dy) / (BREEZE.radius * S);
    return Math.exp(-d * d);
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
    puffs.push({ x, y, t: simT });
    if (puffs.length > 6) puffs.shift();
    gust += BREEZE.gustTap * nearMobile(x, y) * (1 - gust);
  };

  // Clicks pass through the canvas to the page, so double-clicking the artwork would select
  // nearby text. Cancel multi-click selection over the artwork (but not over the text).
  const onMouseDown = (e: MouseEvent) => {
    if (e.detail < 2) return;
    if (document.getElementById("column")?.contains(e.target as Node)) return;
    const [x, y] = toCanvas(e);
    if (nearMobile(x, y) > 0.5) e.preventDefault();
  };

  /**
   * Smoothed cursor velocity (CSS px / s), fading to zero when the cursor rests, and the
   * gust it builds up.
   */
  function updatePointer(dt: number) {
    let rawX = 0;
    let rawY = 0;
    if (pointer.inside && dt > 0) {
      rawX = (pointer.x - pointer.lastX) / dt;
      rawY = (pointer.y - pointer.lastY) / dt;
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
    }
    const a = 1 - Math.exp(-dt / 0.09);
    pointer.vx += (rawX - pointer.vx) * a;
    pointer.vy += (rawY - pointer.vy) * a;

    const travel = Math.hypot(rawX, rawY) * dt; // CSS px moved this frame
    gust += BREEZE.gustBuild * travel * nearMobile(pointer.x, pointer.y) * (1 - gust);
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
      const f = BREEZE.puffSpeed * env * Math.exp(-(d * d) / (2 * sigma * sigma));
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
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let still = reduceMotion.matches;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let visible = true;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    updatePointer(dt);
    acc += dt;
    while (acc >= PHYSICS.timestep) {
      step(mobile, PHYSICS.timestep, airT, air, 1 + BREEZE.gustEddy * gust);
      airT += PHYSICS.timestep * (1 + BREEZE.gustTempo * gust);
      simT += PHYSICS.timestep;
      acc -= PHYSICS.timestep;
    }
    render();
  }

  function start() {
    cancelAnimationFrame(raf);
    if (still) {
      resetPose(mobile);
      render();
    } else {
      resetPose(mobile, PHYSICS.startJitter);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  const onMotionPref = () => {
    still = reduceMotion.matches;
    start();
  };
  const colorScheme = matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => {
    readColors();
    renderer.resize();
    if (still) render();
  };

  // Skip work while the canvas is scrolled out of view (stacked layout).
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(canvas);

  readColors();
  layout();
  start();

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
  reduceMotion.addEventListener("change", onMotionPref);
  colorScheme.addEventListener("change", onScheme);

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    window.removeEventListener("resize", layout);
    densityQuery?.removeEventListener("change", onDensity);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("mousedown", onMouseDown);
    html.removeEventListener("pointerleave", onLeave);
    narrow.removeEventListener("change", layout);
    reduceMotion.removeEventListener("change", onMotionPref);
    colorScheme.removeEventListener("change", onScheme);
    html.removeAttribute("data-stacked");
    html.style.removeProperty("--mobile-h");
  };
}
