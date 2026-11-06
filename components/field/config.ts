/*
 * The page's background: a contour plot of a gently rolling terrain (terrain.ts), its lines
 * printed in typewriter characters (dashes turned to follow the line, and periods), kept
 * clear of the text and the sculpture. Soft waves run along each line, fading it to white
 * and back, and the sheets of the sculpture stir the lines they move toward.
 * Lengths are CSS px, times seconds.
 */

export const FIELD = {
  /** Draw the background at all. false gives the plain page (and turn ASCII.wallShadow back on). */
  enabled: true,
  /**
   * For tuning: the page shows only the background, with no text or sculpture (so nothing to
   * clear around, and no wakes). Leave false on the live page.
   */
  solo: false,

  /**
   * The terrain: smooth noise in `layers` layers, each half the size of the last, its broad
   * features about `scale` px across, pushed around by more noise (`warp`) so the lines
   * meander (too much and they crowd into steep bands). `seed` picks the terrain; `mirror`
   * flips it left to right.
   */
  terrain: { seed: 5, scale: 1000, layers: 3, warp: 0.45, mirror: true },
  /** Typical distance between neighboring contour lines (they bunch on steep ground and spread on flat). */
  lineSpacing: 30,
  /** How finely the terrain is sampled to trace its lines. */
  grid: 6,
  /**
   * The characters along each line: one every `step` px, in the typewriter face at `size` px,
   * at opacity `alpha` (in --ink). About `dash` of them are dashes (each line has its own
   * mix), the rest periods, with the odd single gap (`gap`).
   */
  glyph: { size: 12, step: 6.5, alpha: 0.11, dash: 0.6, gap: 0.05 },
  /** Redraws per second while something moves (the waves, the sculpture). */
  fps: 30,

  /**
   * The waves: along each line a soft gradient runs from white up to the lines' full gray
   * and back, about `length` px from one gray stretch to the next (each line a little
   * different, some running one way and some the other), passing every `period` seconds.
   * Each line starts at its own point in the cycle and keeps its own tempo, up to `vary`
   * faster or slower, so neighbors drift in and out of step rather than pulsing together.
   * `depth` is how far the lines fade (1 all the way to white, 0 holds them at full gray);
   * `shape` above 1 shortens the gray stretches, below 1 lengthens them.
   */
  wave: { depth: 1, length: 700, period: 3, vary: 0.35, shape: 1 },

  /**
   * Clear space around the text, following its lines rather than the whole column. Right
   * around each line it's fully clear within `inner`, the lines coming back softly over
   * `edge`, that edge wandering by up to `wander` so it never reads as a box. Around the
   * text as a whole they stay lighter, at `keep` of their strength from `from` out, reaching
   * full strength `fade` further, the edge wandering in and out by up to `rough` (less right
   * by the text).
   */
  text: { inner: 4, edge: 50, wander: 10, keep: 0.35, from: 12, fade: 100, rough: 32 },
  /**
   * Clear space around the sculpture: around each sheet (`sheet` times its rough radius) and
   * each wire or string (`wire`), then the same inner / fade / rough.
   */
  art: { sheet: 1.2, wire: 7, inner: 16, fade: 100, rough: 30 },
  /**
   * For tuning: paints the clear space red (solid where it's fully clear, fading out where
   * the lines come back), so its edge can be seen. Leave false on the live page.
   */
  showClearing: false,

  /**
   * Wakes: a moving sheet darkens the lines just ahead of it, more the faster it goes, fading
   * over `decay` s. `gain` is how much per px of travel (the sheets drift at a few px a second
   * and swing at 10–30 when stirred); `alpha` is the most a wake adds.
   */
  wake: { gain: 0.06, decay: 1.2, ahead: 10, spread: 0.9, alpha: 0.11, cell: 14 },
};
