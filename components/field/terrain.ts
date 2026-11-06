/*
 * The terrain the background draws the contour lines of: smooth gradient noise in a few
 * layers, whose coordinates are pushed around by more noise so the lines meander and fold
 * into saddles and the odd closed loop instead of ringing tightly around peaks. Positions are
 * CSS px; heights have no unit (the contour spacing is worked out from the typical slope).
 */

import { FIELD } from "./config";

/** A small seeded random number generator (mulberry32), giving numbers in [0, 1). */
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D gradient noise (Perlin's improved noise), about -0.7 to 0.7, varying over a unit or so. */
function gradientNoise(seed: number) {
  const rnd = random(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const S = Math.SQRT1_2;
  const GX = [1, -1, 0, 0, S, -S, S, -S];
  const GY = [0, 0, 1, -1, S, S, -S, -S];
  const grad = (h: number, x: number, y: number) => GX[h & 7] * x + GY[h & 7] * y;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const aa = grad(perm[perm[X] + Y], xf, yf);
    const ba = grad(perm[perm[X + 1] + Y], xf - 1, yf);
    const ab = grad(perm[perm[X] + Y + 1], xf, yf - 1);
    const bb = grad(perm[perm[X + 1] + Y + 1], xf - 1, yf - 1);
    const u = fade(xf);
    const top = aa + u * (ba - aa);
    const bottom = ab + u * (bb - ab);
    return top + fade(yf) * (bottom - top);
  };
}

/**
 * The terrain's height at (x, y). `t` slides the warp along, for animating the lines later
 * (0 holds them still).
 */
export function makeTerrain() {
  const T = FIELD.terrain;
  const noise = gradientNoise(T.seed);
  // Each layer is half the size of the last, and turned and shifted against it, so the
  // noise's underlying grid never lines up from one layer to the next.
  const c = Math.cos(0.62);
  const s = Math.sin(0.62);
  const layered = (x: number, y: number, layers: number) => {
    let v = 0;
    let a = 0.5;
    let f = 1;
    for (let i = 0; i < layers; i++) {
      v += a * noise(x * f + 17.3 * i, y * f - 9.1 * i);
      const rx = c * x - s * y;
      y = s * x + c * y;
      x = rx;
      f *= 2;
      a *= 0.5;
    }
    return v;
  };

  return (x: number, y: number, t = 0) => {
    const px = x / T.scale;
    const py = y / T.scale;
    const wx = layered(px * 0.7 + 3.1, py * 0.7 + 7.7 + t, 2);
    const wy = layered(px * 0.7 + 11.4 + t, py * 0.7 + 1.9, 2);
    return layered(px + T.warp * wx, py + T.warp * wy, T.layers);
  };
}
