/*
 * Everything you might want to tune about the mobile lives in this file.
 *
 * Units: lengths are "world units" (the top arm is about 1.6 long; the canvas scales the
 * whole sculpture to fit), time is seconds, angles in DESIGN are degrees.
 */

export type ColorKey = "ink" | "red" | "orange";
export type ShapeKind = "leaf" | "petal" | "boomerang" | "blade" | "fin";

/** A flat sheet-metal shape fixed to the end of an arm. */
export interface ShapeSpec {
  shape: ShapeKind;
  /** Rough width of the shape, in world units. */
  size: number;
  color: ColorKey;
  /** Rotation of the cut-out within its own plane, in degrees. */
  rot?: number;
  /** Mirror the cut-out top-to-bottom. */
  flip?: boolean;
}

/**
 * A wire arm. It hangs from a hook at its balance point, which is computed from the masses
 * below it (see physics.ts), so you only choose its length and what hangs from each end.
 */
export interface RodSpec {
  /** Horizontal length of the arm, end to end. */
  len: number;
  /** How much the ends droop: the arm follows v(u) = bend·u² + tilt·u around its pivot. */
  bend?: number;
  /** Tilts the arm (positive dips the right end). */
  tilt?: number;
  /** Resting yaw relative to the arm above, in degrees. */
  rest?: number;
  /** Length of the hook between the parent's arm end and this arm's balance point. */
  drop?: number;
  /** The hook's length in the side view, if it should differ from drop × VIEW.side.hooks. */
  sideDrop?: number;
  /** Bows the arm's left side a little further down, sinking its end by this much. */
  leftDip?: number;
  left: NodeSpec;
  right: NodeSpec;
}

export type NodeSpec = RodSpec | ShapeSpec;

const rod = (spec: RodSpec): RodSpec => spec;
const sheet = (shape: ShapeKind, size: number, color: ColorKey, extra: Partial<ShapeSpec> = {}): ShapeSpec => ({
  shape,
  size,
  color,
  ...extra,
});

/*
 * The arrangement. Mostly black and orange, with two red.
 * Add or remove arms freely: balance points, inertia and springs are all derived.
 */
export const DESIGN: RodSpec = rod({
  len: 1.5,
  bend: 0.24,
  tilt: -0.02,
  rest: 0,
  // Left: a black cascade arcing down and outward, ending in the red.
  left: rod({
    len: 1.0,
    bend: 0.34,
    tilt: 0.04,
    rest: 18,
    drop: 0.07,
    sideDrop: 0.22, // the long hook under the top arm's left end, in the side view
    left: rod({
      len: 0.72,
      bend: 0.44,
      rest: -26,
      drop: 0.06,
      left: sheet("blade", 0.3, "ink", { rot: 14 }),
      right: rod({
        len: 0.48,
        bend: 0.55,
        rest: 30,
        drop: 0.06,
        left: sheet("fin", 0.22, "red", { rot: 8 }),
        right: sheet("boomerang", 0.17, "ink", { rot: 18 }),
      }),
    }),
    right: sheet("boomerang", 0.32, "ink", { rot: 10 }),
  }),
  // Right: petals (one red) growing toward the big leaf that counterweights everything.
  right: rod({
    len: 0.92,
    bend: 0.32,
    tilt: -0.03,
    rest: -16,
    drop: 0.08,
    left: rod({
      len: 0.62,
      bend: 0.44,
      rest: 24,
      drop: 0.06,
      left: rod({
        len: 0.42,
        bend: 0.6,
        rest: -28,
        drop: 0.05,
        left: sheet("petal", 0.15, "orange", { rot: -10 }),
        right: sheet("blade", 0.18, "ink", { rot: 4 }),
      }),
      right: sheet("petal", 0.24, "red", { rot: 12 }),
    }),
    right: sheet("leaf", 0.42, "orange", { rot: 8 }),
  }),
});

/** How the structure responds. */
export const PHYSICS = {
  /** Mass per unit area of the sheet metal. */
  sheetDensity: 1,
  /** Mass per unit length of the wire arms (light compared with the sheets). */
  wireDensity: 0.012,
  /** Natural period (s) of the whole mobile twisting on its long top thread. */
  rootPeriod: 16,
  /** Natural period (s) of an 0.8-long arm twisting on its hook; scales with √length. */
  armPeriod: 9,
  /** Damping ratio of each hook's twist (0 rings forever, 1 is critically damped). */
  damping: 0.04,
  /** Same, for the whole mobile on its thread: higher, so its slow drift stays modest. */
  rootDamping: 0.1,
  /** Linear air drag on the sheets. Also damps the motion, since sheets push through air. */
  drag: 0.25,
  /** Fixed physics timestep (s). */
  timestep: 1 / 120,
  /**
   * The opening pose, so the mobile never opens flat: the whole mobile turned `turn` degrees
   * on its thread, each arm off its rest by `min`–`max` degrees (either way, never zero), and
   * each already turning at up to `spin` degrees per second.
   */
  start: { turn: 7, min: 4, max: 9, spin: 3 },
  /**
   * How far (degrees) an arm may turn away from its resting angle, and the whole mobile on
   * its thread. No breeze, click or gust can carry it further. The on-screen placement
   * guarantees the text stays clear for any pose within these limits.
   */
  swingLimit: 25,
  turnLimit: 12,
  /**
   * The stop at those limits: from `from` of the way there the hook stiffens, by up to
   * `stiffness` times its own spring at the limit, and damps motion outward (up to `damping`
   * times critical), so the mobile eases to a halt instead of hitting a wall. At the limit
   * it stops outright.
   */
  stop: { from: 0.6, stiffness: 6, damping: 1.5 },
};

/** The ambient air current: smooth, slow and quiet. */
export const AIR = {
  /** Typical speed of the drifting air (world units / s). */
  speed: 0.15,
  /** A slow, steady drift on top of the swirls. */
  drift: 0.045,
  /** Range of swirl sizes (world units) and how long each takes to pass (s). */
  wavelength: [1.4, 3.4] as const,
  period: [10, 34] as const,
  /** Tiny random twisting of each arm (rad/s²), standing in for eddies too small to model. */
  eddy: 0.022,
  /** Same, for the whole mobile on its thread. */
  rootEddy: 0.011,
};

/** The cursor as a breeze, and clicks and taps as puffs that build up a gust. */
export const BREEZE = {
  /** How strongly cursor motion becomes air motion right around the cursor. */
  gain: 1.4,
  /** How much of any motion pushes air in toward the wall (the cursor is in front of the mobile). */
  push: 0.65,
  /** Reach of the breeze around the cursor (world units). */
  radius: 0.38,
  /** Cap on the breeze speed (world units / s), so fast flicks don't fling the arms. */
  max: 4,
  /** Peak speed of a tap's puff, how long it lasts (s), and its initial reach. */
  puffSpeed: 1.2,
  puffLife: 1.2,
  puffRadius: 0.3,
  /**
   * The opening gust: this many seconds after the page opens, a puff `power` times a tap's
   * strength hits the biggest sheet head-on, pushing it back toward the wall.
   */
  openingDelay: 0.6,
  openingPower: 3,
  /**
   * Gusts. Moving the cursor around the mobile builds up a gust (0–1) that stirs all of it,
   * not just the sheets under the cursor; it dies away once the cursor rests.
   *   gustBuild: gust gained per CSS px of cursor travel over the mobile.
   *   gustDecay: seconds for a gust to fade to about a third.
   *   gustTap:   share of the remaining gust added by each click or tap.
   *   At full gust the air is (1 + gustWind)× stronger and changes (1 + gustTempo)× faster,
   *   and the small random eddies are (1 + gustEddy)× stronger.
   */
  gustBuild: 0.0009,
  gustDecay: 2.2,
  gustTap: 0.22,
  gustWind: 1.2,
  gustTempo: 2,
  gustEddy: 1.3,
};

/** Drawing. */
export const VIEW = {
  /** Camera distance in world units. Larger means flatter perspective. */
  camera: 6.5,
  /** Largest scale (CSS px per world unit), for very large screens. */
  maxScale: 420,
  /** If the sculpture would be narrower than this (CSS px) beside the text, stack it above. */
  minWidth: 440,
  /**
   * The header view (mobile above the text). Below `phone.below` px wide it shows `phone.design`
   * ("side" for the side view's arrangement, with its deeper droop and longer hooks, or
   * "compact" for DESIGN as is) on a `phone.thread` px thread; on wider windows that are too
   * narrow for the side view, it shows the compact DESIGN on a `thread` px thread.
   */
  header: { thread: 40, phone: { below: 600, design: "side" as "side" | "compact", thread: 64 } },
  /**
   * Padding around the side view's space (CSS px, or a fraction of the window): the gap to
   * the text column, the right edge, above the top pivot (the thread runs through it) and
   * the bottom. Within that space the mobile grows as large as it fits.
   */
  sidePadding: { gap: 0.004, gapMin: 6, right: 8, top: 0.11, topMin: 48, topMax: 150, bottom: 16 },
  /**
   * Still while reading: scrolled down by `over` window heights or more, the mobile settles
   * (at `settle` per second) into its display pose, every arm turned nearly flat to the
   * viewer so it spreads to its full width, keeping `depth` of its resting turns; then it is
   * held exactly still, letters included. Only a gust stronger than `wake` (0–1; a quick
   * sweep of the cursor or a click) wakes it; scrolling back up frees it.
   */
  scrollCalm: { over: 0.03, settle: 2.4, depth: 0.6, wake: 0.3 },
  /**
   * The side view (mobile beside the text) uses DESIGN with its arms `narrow` times as long
   * (so it draws larger in the same space, characters included), the same droop at the
   * arm ends, and hooks `hooks` times as long (so it hangs a little lower). The top arm's
   * left side also bows a little further down, its end by `topLeftDip`, without reaching
   * further left. It is drawn `scale` times as large as its space strictly fits (about its
   * center): that fit allows for every arm at its limit at once, which real poses never
   * come near, so a little extra still keeps clear of the text. It is then moved left by
   * `nudge` of its space's width. As the page scrolls down (over its first `dropOver` window
   * heights), it lowers by `drop` of the window height, the top string lengthening, as far
   * as the room below allows.
   */
  side: { narrow: 0.85, hooks: 1.4, topLeftDip: 0.05, scale: 1.03, nudge: 0.02, drop: 0.05, dropOver: 0.8 },
  /**
   * In wide layouts (mobile beside the text) there is room below, so the top arm's arc
   * droops up to wideArc times more than designed, as far as the window height allows.
   * The arms below get only wideArcLower of that extra droop (0 = as designed).
   */
  wideArc: 1.7,
  /**
   * The share image (app/thumbnail): margins as fractions of its height (top, bottom) and width
   * (side); the pose, as a share of the arms' resting turns (the open display pose, nearly flat
   * to the viewer); how far the arcs droop (as wideArc); the font size (CSS px); the wall
   * shadow, further back (as shadow.wall) and stronger (opacity) than on the page, with only
   * `shadowKeep` of its characters; and `noise`, the share of the background's character cells
   * holding a faint shadow character.
   */
  thumbnail: {
    top: 0.06,
    side: 0.025,
    bottom: 0.05,
    pose: 0.6,
    arc: 1.7,
    font: 26,
    wall: 1.6,
    shadow: 0.38,
    shadowKeep: 0.5,
    noise: 0.03,
  },
  wideArcLower: 0.29,
  shadow: {
    /** Distance of the wall behind the thread, as a multiple of the mobile's radius. */
    wall: 1.3,
    /** Direction of the light rays (x right, y down), per unit of depth toward the wall. */
    light: [0.07, 0.11] as const,
  },
};

/** How the mobile is printed in ASCII characters (draw-ascii.ts). */
export const ASCII = {
  /** Character font; a monospace face keeps each sheet's character grid even. */
  font: '"CMU Typewriter", ui-monospace, "SF Mono", Menlo, monospace',
  /** Font size as a fraction of the drawing scale (CSS px per world unit), within limits. */
  fontScale: 0.058,
  minFont: 10,
  /** The smallest size on phone-width screens, where the whole sculpture is small. */
  phoneMinFont: 6.5,
  maxFont: 15,
  /** Row height as a multiple of the font size. */
  lineHeight: 1.1,
  /**
   * What is printed on the sheets: RL terms, laid out in reading order through each sheet
   * with operators between them. As a sheet turns, terms swap in place for other terms of
   * the same length, so nothing around them shifts. Add or edit freely; lengths are counted
   * automatically. Stick to characters CMU Typewriter has: ASCII, Greek letters, and
   * ← → · × ± √ (no ∇ ∑ ∂ ∫ ≈ ∈, which would fall back to another font).
   */
  terms: [
    "α", "β", "γ", "δ", "ε", "θ", "λ", "μ", "π", "ρ", "σ", "τ",
    "dθ", "Δθ", "V*", "Q*", "π*", "s'", "a'", "r'",
    "r_t", "s_t", "a_t", "γ^t", "G_t", "A_t", "δ_t", "π_θ", "max", "log", "E_π", "Σ_t",
    "V(s)", "Q(s)", "π(a)", "R(s)", "E[r]", "A(s)", "H(π)", "σ(x)", "E[G]",
    "V(s')", "Q(s')", "KL(π)", "r+γV'", "Σγ^tr", "P(s')",
    "π(·|s)", "Q(s,a)", "A(s,a)", "R(s,a)", "V(s_t)", "logπ_θ", "argmax", "θ←θ+α", "E_π[G]",
    "softmax", "E[V(s)]", "clip(ρ)", "max_aQ'", "P(s'|s)", "σ(Wx+b)",
    "π_θ(a|s)", "Q(s',a')", "E_π[G_t]", "r_t+γV_t", "V(s_t+1)",
    "E[G(s,a)]", "logπ(a|s)", "P(s'|s,a)", "max_aQ(s)",
    "Q(s_t,a_t)", "π(a_t|s_t)", "E[Σγ^tr_t]", "R(s_t,a_t)",
  ],
  /** One-character operators placed between terms (they swap among themselves). */
  operators: ["=", "+", "-", "·", "~", "←", "×", "|"],
  /**
   * How often terms swap: per term, swaps per radian its sheet turns, plus a slow rate in
   * still air (swaps per second). The shadow's dots swap at the same rates.
   */
  swapPerRadian: 14,
  swapDrift: 0.08,
  /** Faint characters the wall shadow is made of. */
  shadowGlyphs: [".", "·", "'", ",", ":"],
  /** Weight of the sheets' characters (CMU Typewriter has 400 and 700); bold reads more solid. */
  sheetWeight: 700,
  /**
   * Thickens the sheets' characters past the font's heaviest weight: each is also traced with
   * an outline of its own color this wide, as a fraction of the font size (0 = none).
   */
  sheetOutline: 0.01,
  /** Partly covered cells along a sheet's edge are shaded with these, from faint to dense. */
  edgeRamp: ".,:;",
  /** Cells at least this covered print terms; less covered ones get edge shading. */
  solidCoverage: 0.6,
  /** Cells with less sheet coverage than this stay empty. */
  minCoverage: 0.12,
  /**
   * Depth: arms and strings farther from the viewer are printed closer to the background
   * color (sheets keep their exact colors).
   * depthFade is the most they fade (0–1; --mobile-depth-fade in globals.css overrides it
   * per color scheme); depthRange is the depth (world units, either side of the thread)
   * over which the fade runs from none to full.
   */
  depthFade: 0.45,
  depthRange: 0.7,
  /** Opacity of the shadow dots. (Colors are the --mobile-* tokens in globals.css.) */
  shadowOpacity: 0.3,
  /**
   * Each sheet's shadow is drawn `shadowSpread` times its size (about its center), with only
   * `shadowKeep` of its characters, so it falls soft and diffuse around the sheet.
   */
  shadowSpread: 1.35,
  shadowKeep: 0.75,
};

/** The arrangement for the side view: DESIGN, narrower and hanging a little lower (VIEW.side). */
function sideView(spec: RodSpec, top = true): RodSpec {
  const { narrow, hooks, topLeftDip } = VIEW.side;
  const node = (n: NodeSpec): NodeSpec => ("len" in n ? sideView(n, false) : n);
  return {
    ...spec,
    leftDip: top ? topLeftDip : spec.leftDip,
    len: spec.len * narrow,
    // v = bend·u² + tilt·u: keep the ends' heights where they were on the shorter arm.
    bend: spec.bend !== undefined ? spec.bend / (narrow * narrow) : undefined,
    tilt: spec.tilt !== undefined ? spec.tilt / narrow : undefined,
    drop: spec.sideDrop ?? (spec.drop ?? 0.07) * hooks,
    left: node(spec.left),
    right: node(spec.right),
  };
}
export const DESIGN_SIDE: RodSpec = sideView(DESIGN);
