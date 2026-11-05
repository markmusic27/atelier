import type { ShapeKind, ShapeSpec } from "./config";

/** Small seeded PRNG, so the hand-cut irregularities are the same on every load. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Outline templates in unit size. x runs outward along the arm, y downward.
 * `attach` is where the wire meets the sheet; the third value marks a sharp corner
 * (a snipped point) instead of a smooth curve.
 */
type ControlPoint = [x: number, y: number, sharp?: 1];
interface Template {
  attach: [number, number];
  points: ControlPoint[];
}

const TEMPLATES: Record<ShapeKind, Template> = {
  // Broad rounded triangle hanging from its upper edge, tapering to a point.
  leaf: {
    attach: [0.1, 0.08],
    points: [
      [-0.06, -0.04],
      [0.52, -0.1],
      [0.98, 0.04],
      [0.96, 0.42],
      [0.64, 0.84],
      [0.43, 1.0, 1],
      [0.2, 0.62],
      [0.02, 0.24],
    ],
  },
  // Smaller, rounder teardrop.
  petal: {
    attach: [0.08, 0.1],
    points: [
      [-0.08, 0.02],
      [0.4, -0.12],
      [0.86, 0.06],
      [0.88, 0.44],
      [0.56, 0.9, 1],
      [0.14, 0.56],
    ],
  },
  // Chevron with its apex at the wire and two arms reaching outward.
  boomerang: {
    attach: [0.12, 0.14],
    points: [
      [-0.1, 0.12, 1],
      [0.45, -0.1],
      [1.0, -0.28, 1],
      [0.64, 0.02],
      [0.42, 0.17, 1],
      [0.6, 0.34],
      [0.86, 0.6, 1],
      [0.38, 0.42],
    ],
  },
  // Thin crescent, belly down.
  blade: {
    attach: [0.1, 0.17],
    points: [
      [-0.06, 0.1, 1],
      [0.3, 0.36],
      [0.72, 0.36],
      [1.06, 0.02, 1],
      [0.66, 0.17],
      [0.3, 0.16],
    ],
  },
  // Lopsided fin with one bellied edge (one of the two reds).
  fin: {
    attach: [0.08, 0.07],
    points: [
      [-0.02, -0.02, 1],
      [0.46, -0.07],
      [1.0, 0.08, 1],
      [0.88, 0.36],
      [0.7, 0.66, 1],
      [0.32, 0.5],
      [0.06, 0.4, 1],
    ],
  },
};

/** Points sampled per spline segment. */
const SAMPLES = 9;

/**
 * Builds a closed outline (x, y pairs, wire attachment at the origin) for a shape spec.
 * Control points are nudged at random, so no two shapes are geometrically perfect, then
 * joined by a Hermite spline whose tangents vanish at sharp corners.
 */
export function makeOutline(spec: ShapeSpec, rng: () => number): Float64Array {
  const tpl = TEMPLATES[spec.shape];
  const jitter = 0.035;
  const rot = ((spec.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const flip = spec.flip ? -1 : 1;

  const cps = tpl.points.map(([x, y, sharp]) => {
    const px = x - tpl.attach[0] + (rng() - 0.5) * 2 * jitter;
    const py = (y - tpl.attach[1] + (rng() - 0.5) * 2 * jitter) * flip;
    return { x: (px * cos - py * sin) * spec.size, y: (px * sin + py * cos) * spec.size, sharp: !!sharp };
  });

  const n = cps.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const pm = cps[(i - 1 + n) % n];
    const p0 = cps[i];
    const p1 = cps[(i + 1) % n];
    const p2 = cps[(i + 2) % n];
    const m0x = p0.sharp ? 0 : 0.5 * (p1.x - pm.x);
    const m0y = p0.sharp ? 0 : 0.5 * (p1.y - pm.y);
    const m1x = p1.sharp ? 0 : 0.5 * (p2.x - p0.x);
    const m1y = p1.sharp ? 0 : 0.5 * (p2.y - p0.y);
    for (let j = 0; j < SAMPLES; j++) {
      const t = j / SAMPLES;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push(h00 * p0.x + h10 * m0x + h01 * p1.x + h11 * m1x, h00 * p0.y + h10 * m0y + h01 * p1.y + h11 * m1y);
    }
  }

  // A faint wander along the edge, like snips that didn't quite follow the line.
  const N = out.length / 2;
  const amp = 0.006 * spec.size;
  const phase = rng() * Math.PI * 2;
  const res = new Float64Array(out.length);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N;
    const b = (i + 1) % N;
    const tx = out[2 * b] - out[2 * a];
    const ty = out[2 * b + 1] - out[2 * a + 1];
    const len = Math.hypot(tx, ty) || 1;
    const w = amp * (Math.sin((i / N) * Math.PI * 6 + phase) + 0.5 * Math.sin((i / N) * Math.PI * 14 + 2 * phase));
    res[2 * i] = out[2 * i] + (ty / len) * w;
    res[2 * i + 1] = out[2 * i + 1] - (tx / len) * w;
  }
  return res;
}

/**
 * Area and first/second moments of a polygon (x, y pairs):
 * area = ∫dA, cx = ∫x dA / area, cy = ∫y dA / area, sxx = ∫x² dA.
 * These give each sheet's mass, balance point and moment of inertia.
 */
export function polygonMoments(p: Float64Array) {
  let a = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = p[2 * i];
    const y0 = p[2 * i + 1];
    const x1 = p[(2 * i + 2) % p.length];
    const y1 = p[(2 * i + 3) % p.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    sx += (x0 + x1) * cross;
    sy += (y0 + y1) * cross;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * cross;
  }
  const sign = a < 0 ? -1 : 1;
  const area = (sign * a) / 2;
  return {
    area,
    cx: (sign * sx) / 6 / area,
    cy: (sign * sy) / 6 / area,
    sxx: (sign * sxx) / 12,
  };
}
