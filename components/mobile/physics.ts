/*
 * Physics of the mobile.
 *
 * The sculpture is a tree of rigid wire arms ("rods"). Each rod hangs from a hook at its
 * balance point and can only turn about the vertical axis through that hook (yaw). That is
 * how real mobiles move: every arm is level because it is balanced, and what you see is
 * each arm slowly twisting on its hook.
 *
 * Coordinates: x right, y DOWN, z toward the viewer. A rod with yaw θ points along
 * d = (cos θ, 0, sin θ). A point at distance u along the arm (negative = left end) sits at
 * pivot + u·d + (0, v(u), 0), where v(u) = bend·u² + tilt·u is the arm's droop.
 *
 * Dynamics, per rod i (a torsional pendulum):
 *
 *   I_i · dω_i/dt = τ_hook + τ_air + τ_children + τ_eddy
 *
 *   I_i        moment of inertia about the hook: the wire, its sheets, and the subtrees hanging
 *              from its ends (carried around as point masses).
 *   τ_hook     a soft torsion spring + damper between this rod and the one above it, the twist
 *              stiffness of the hook and wire. Equal and opposite on the parent, so a push
 *              anywhere ripples up and down the tree.
 *   τ_air      drag on each sheet from the air moving past it (relative to the sheet's own
 *              motion, which also damps the swing).
 *   τ_children horizontal air force on each subtree, passed up through its hook to the end
 *              of this arm.
 *   τ_eddy     a tiny smooth random torque for turbulence too small to model.
 */

import { PHYSICS, AIR, VIEW, type ColorKey, type NodeSpec, type RodSpec, type ShapeSpec } from "./config";
import { makeOutline, mulberry32, polygonMoments } from "./shapes";

const DEG = Math.PI / 180;

export interface Shape {
  rod: Rod;
  color: ColorKey;
  size: number;
  /** Outline in the rod's local (u, v) coordinates, as pairs. */
  pts: Float64Array;
  /** The bit of arm wire that lies across the sheet, (u, v) pairs. */
  wire: Float64Array;
  area: number;
  /** ∫u dA and ∫u² dA over the sheet, in rod-local coordinates (for drag torque). */
  Au: number;
  Auu: number;
  /** Centroid in rod-local coordinates. */
  uc: number;
  vc: number;
  /** Per-sheet drag factor: hand-cut sheets are a little cupped, each catches air differently. */
  sail: number;
  /** Where the sheet sits: the arm end (u), which way is outward, the outline's heights below
   *  the end, and the centroid's height below the end. Used to re-seat it when arcs change. */
  endU: number;
  side: number;
  outlineV: Float64Array;
  cy: number;
  // Updated every step / frame:
  x: number;
  y: number;
  z: number;
  /** Screen position of the centroid (for the cursor breeze). */
  sx: number;
  sy: number;
}

export interface Rod {
  parent: Rod | null;
  depth: number;
  len: number;
  /** Distance from the pivot to the left and right ends. */
  a: number;
  b: number;
  bend: number;
  tilt: number;
  /** Resting yaw relative to the parent (radians). */
  rest: number;
  /** The arm's curve as designed (see setArcScale). */
  baseBend: number;
  baseTilt: number;
  drop: number;
  /** Where this rod hangs on its parent, in the parent's local coordinates. */
  hu: number;
  hv: number;
  shapes: Shape[];
  children: Rod[];
  /** Total mass of this rod and everything below it. */
  mass: number;
  I: number;
  k: number;
  c: number;
  theta: number;
  omega: number;
  torque: number;
  /** Net horizontal air force on this subtree (passed to the parent's arm end). */
  fx: number;
  fz: number;
  // Pivot position and arm direction, updated by kinematics():
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  /** Two slow sinusoids for this arm's eddy torque: [ω1, φ1, ω2, φ2]. */
  eddy: [number, number, number, number];
}

export interface Mobile {
  /** All rods, parents before children. */
  rods: Rod[];
  shapes: Shape[];
  /**
   * How far any part can reach to the left and right of the thread, and toward or away
   * from the viewer, for any pose with every arm (the top one included) within
   * PHYSICS.swingLimit of rest. left/right include the camera's perspective.
   */
  reach: { left: number; right: number; depth: number };
  /** Vertical extent below the top pivot. */
  minY: number;
  maxY: number;
}

/** Height of the arm at distance u from its pivot. */
export const arm = (r: Rod, u: number) => r.bend * u * u + r.tilt * u;

const isRod = (n: NodeSpec): n is RodSpec => "len" in n;

export function buildMobile(design: RodSpec, seed = 7): Mobile {
  const rng = mulberry32(seed);
  const rods: Rod[] = [];
  const shapes: Shape[] = [];

  function build(spec: RodSpec, parent: Rod | null): Rod {
    const r = {
      parent,
      depth: parent ? parent.depth + 1 : 0,
      len: spec.len,
      bend: spec.bend ?? 0.12,
      tilt: spec.tilt ?? 0,
      rest: (spec.rest ?? 0) * DEG,
      baseBend: spec.bend ?? 0.12,
      baseTilt: spec.tilt ?? 0,
      drop: spec.drop ?? 0.07,
      shapes: [],
      children: [],
      theta: 0,
      omega: 0,
      torque: 0,
      fx: 0,
      fz: 0,
      x: 0,
      y: 0,
      z: 0,
      dx: 1,
      dz: 0,
      eddy: [
        (2 * Math.PI) / (20 + rng() * 30),
        rng() * 2 * Math.PI,
        (2 * Math.PI) / (12 + rng() * 10), // kept slower than the arms' own periods, so it never pumps them
        rng() * 2 * Math.PI,
      ],
    } as unknown as Rod;
    rods.push(r); // pre-order: parents before children

    // 1. What hangs from each end: its mass, and how far its center of mass sits outward
    //    from the end. A subtree hangs freely from its hook, so its mass is right below
    //    the end; a sheet is fixed to the wire, so its centroid can sit beyond the end.
    type End =
      | { side: number; mass: number; cx: number; child: Rod }
      | { side: number; mass: number; cx: number; outline: Float64Array; m: ReturnType<typeof polygonMoments>; node: ShapeSpec };
    const ends = [spec.left, spec.right].map((node, i): End => {
      const side = i === 0 ? -1 : 1;
      if (isRod(node)) {
        const child = build(node, r);
        return { side, mass: child.mass, cx: 0, child };
      }
      const outline = makeOutline(node, rng);
      const m = polygonMoments(outline);
      return { side, mass: PHYSICS.sheetDensity * m.area, cx: m.cx, outline, m, node };
    });

    // 2. Balance point. Torques about the pivot must cancel:
    //      mL·(a + cxL) = mR·(L − a + cxR) + mWire·(L/2 − a)
    //    which gives the distance a from the pivot to the left end.
    const L = spec.len;
    const wireMass = PHYSICS.wireDensity * L;
    const [left, right] = ends;
    const M = left.mass + right.mass + wireMass;
    let a = (right.mass * (L + right.cx) - left.mass * left.cx + (wireMass * L) / 2) / M;
    if (a < 0.03 * L || a > 0.97 * L) {
      console.warn("Mobile: an arm cannot balance within its length; adjust the design.", spec);
      a = Math.min(0.97 * L, Math.max(0.03 * L, a));
    }
    r.a = a;
    r.b = L - a;
    r.mass = M;

    // 3. Moment of inertia about the hook: the wire as a thin rod, each sheet from its
    //    second moment ∫u² dA, and each subtree as a point mass at its end.
    let I = (wireMass * (a ** 3 + r.b ** 3)) / (3 * L);
    for (const end of ends) {
      const e = end.side < 0 ? -a : r.b;
      const ve = arm(r, e);
      if ("child" in end) {
        end.child.hu = e;
        end.child.hv = ve;
        r.children.push(end.child);
        I += end.child.mass * e * e;
        continue;
      }
      const { outline, m, node } = end;
      // Sheet outline → rod-local coordinates (mirrored on the left end).
      const pts = new Float64Array(outline.length);
      const outlineV = new Float64Array(outline.length / 2);
      for (let j = 0; j < outline.length; j += 2) {
        pts[j] = e + end.side * outline[j];
        outlineV[j / 2] = outline[j + 1];
      }
      // The arm continues a little way across the sheet, where it is riveted on.
      const wire = new Float64Array(12);
      for (let j = 0; j < 6; j++) wire[2 * j] = e + end.side * (j / 5) * 0.42 * node.size;
      const Sx = m.area * m.cx; // ∫s dA in the sheet's own frame
      const Au = m.area * e + end.side * Sx;
      const Auu = m.area * e * e + 2 * e * end.side * Sx + m.sxx;
      I += PHYSICS.sheetDensity * Auu;
      const shape: Shape = {
        rod: r,
        color: node.color,
        size: node.size,
        pts,
        wire,
        area: m.area,
        Au,
        Auu,
        uc: Au / m.area,
        vc: 0,
        sail: 0.75 + rng() * 0.5,
        endU: e,
        side: end.side,
        outlineV,
        cy: m.cy,
        x: 0,
        y: 0,
        z: 0,
        sx: -1e5,
        sy: -1e5,
      };
      seat(shape);
      r.shapes.push(shape);
      shapes.push(shape);
    }
    r.I = I;

    // 4. Hook spring and damper, from a chosen natural period T and damping ratio ζ:
    //      k = I·(2π/T)²,   c = 2ζ·√(k·I)
    const T = parent ? PHYSICS.armPeriod * Math.sqrt(L / 0.8) : PHYSICS.rootPeriod;
    const w0 = (2 * Math.PI) / T;
    r.k = I * w0 * w0;
    r.c = 2 * PHYSICS.damping * I * w0;
    return r;
  }

  const root = build(design, null);
  root.hu = 0;
  root.hv = 0;

  // Bounds, used to fit the sculpture on screen without ever reaching the text.
  const m: Mobile = { rods, shapes, reach: { left: 0, right: 0, depth: 0 }, minY: 0, maxY: 0 };
  measureHeight(m);
  m.reach = sweepReach(m, PHYSICS.swingLimit);
  return m;
}

/** The mobile's vertical extent below its top pivot (it doesn't change as arms turn). */
function measureHeight(m: Mobile) {
  let minY = 0;
  let maxY = 0;
  function extent(r: Rod, y0: number) {
    for (let i = 0; i <= 16; i++) {
      const v = y0 + arm(r, -r.a + (r.len * i) / 16);
      minY = Math.min(minY, v);
      maxY = Math.max(maxY, v);
    }
    for (const s of r.shapes)
      for (let j = 1; j < s.pts.length; j += 2) {
        minY = Math.min(minY, y0 + s.pts[j]);
        maxY = Math.max(maxY, y0 + s.pts[j]);
      }
    for (const c of r.children) extent(c, y0 + c.hv + c.drop);
  }
  extent(m.rods[0], 0);
  m.minY = minY;
  m.maxY = maxY;
}

/** Places a sheet's outline, centroid and riveted wire at its arm end's current height. */
function seat(s: Shape) {
  const r = s.rod;
  const ve = arm(r, s.endU);
  for (let j = 0; j < s.outlineV.length; j++) s.pts[2 * j + 1] = ve + s.outlineV[j];
  for (let j = 0; j < s.wire.length; j += 2) s.wire[j + 1] = arm(r, s.wire[j]);
  s.vc = ve + s.cy;
}

/**
 * Scales how far the arms' curves droop (1 = as designed): the top arm by k, the arms below
 * by only `lowerShare` of the extra. The droop is purely vertical: balance points, inertia
 * and reach depend only on horizontal distances, so the motion is unchanged. Sheets and the
 * hooks of the arms below move with their arm ends.
 */
export function setArcScale(m: Mobile, k: number, lowerShare = 1) {
  for (const r of m.rods) {
    const f = r.parent ? 1 + (k - 1) * lowerShare : k;
    r.bend = r.baseBend * f;
    r.tilt = r.baseTilt * f;
    for (const s of r.shapes) seat(s);
    for (const c of r.children) c.hv = arm(r, c.hu);
  }
  measureHeight(m);
}

/**
 * Finds the reach of the mobile by sweeping every arm through its allowed swing: each pose
 * holds one arm at an extreme or a random angle in range. Leaves the mobile at rest.
 */
function sweepReach(m: Mobile, limitDeg: number, samples = 4000) {
  const rng = mulberry32(5);
  const limit = limitDeg * DEG;
  const F = VIEW.camera;
  let left = 0;
  let right = 0;
  let depth = 0;
  const visit = (x: number, z: number) => {
    const sx = (x * F) / (F - z);
    left = Math.max(left, -sx);
    right = Math.max(right, sx);
    depth = Math.max(depth, Math.abs(z));
  };
  for (let n = 0; n < samples; n++) {
    for (const r of m.rods) {
      const swing = n % 3 === 0 ? (rng() < 0.5 ? -limit : limit) : (rng() * 2 - 1) * limit;
      r.theta = (r.parent ? r.parent.theta : 0) + r.rest + swing;
    }
    kinematics(m);
    for (const r of m.rods) {
      visit(r.x - r.a * r.dx, r.z - r.a * r.dz);
      visit(r.x + r.b * r.dx, r.z + r.b * r.dz);
      for (const s of r.shapes)
        for (let j = 0; j < s.pts.length; j += 2) visit(r.x + s.pts[j] * r.dx, r.z + s.pts[j] * r.dz);
    }
  }
  resetPose(m);
  // A little margin for the sheets' hairline edges.
  return { left: left * 1.03, right: right * 1.03, depth: depth * 1.03 };
}

/** Puts every arm at its resting angle (plus an optional random offset, in degrees). */
export function resetPose(m: Mobile, jitterDeg = 0, seed = 3) {
  const rng = mulberry32(seed);
  for (const r of m.rods) {
    r.theta = (r.parent ? r.parent.theta : 0) + r.rest + (rng() - 0.5) * 2 * jitterDeg * DEG;
    r.omega = 0;
  }
}

/** Positions of every pivot and sheet centroid from the current angles. */
export function kinematics(m: Mobile) {
  for (const r of m.rods) {
    r.dx = Math.cos(r.theta);
    r.dz = Math.sin(r.theta);
    const p = r.parent;
    if (p) {
      r.x = p.x + r.hu * p.dx;
      r.y = p.y + r.hv + r.drop;
      r.z = p.z + r.hu * p.dz;
    } else {
      r.x = r.y = r.z = 0;
    }
    for (const s of r.shapes) {
      s.x = r.x + s.uc * r.dx;
      s.y = r.y + s.vc;
      s.z = r.z + s.uc * r.dz;
    }
  }
}

export interface Wind {
  x: number;
  z: number;
}
/** Fills `out` with the horizontal air velocity at a sheet. */
export type AirField = (s: Shape, out: Wind) => void;

const wind: Wind = { x: 0, z: 0 };

/**
 * Advances the simulation by dt seconds. t is the air's clock (it runs faster in a gust),
 * and stir scales the eddies (1 in calm air).
 */
export function step(m: Mobile, dt: number, t: number, air: AirField, stir = 1) {
  const { rods } = m;
  kinematics(m);

  // Air forces, children before parents so each subtree's force can be passed up.
  for (let i = rods.length - 1; i >= 0; i--) {
    const r = rods[i];
    // Unit normal of this arm's vertical plane (= ∂d/∂θ). Every sheet on the arm lies in this
    // plane, so it only feels air moving along n, and that air turns the arm.
    const nx = -r.dz;
    const nz = r.dx;
    let tau = 0;
    let fx = 0;
    let fz = 0;

    for (const s of r.shapes) {
      air(s, wind);
      const wn = wind.x * nx + wind.z * nz;
      // Linear drag on the sheet, using air speed relative to the moving sheet (ω·u):
      //   F = drag·∫(wn − ω·u) dA,   τ = drag·∫u·(wn − ω·u) dA
      const g = PHYSICS.drag * s.sail;
      const f = g * (s.area * wn - r.omega * s.Au);
      tau += g * (s.Au * wn - r.omega * s.Auu);
      fx += f * nx;
      fz += f * nz;
    }

    // Subtrees push sideways on the ends of this arm.
    for (const c of r.children) {
      tau += c.hu * (c.fx * nx + c.fz * nz);
      fx += c.fx;
      fz += c.fz;
    }

    // Eddies, scaled by inertia so they act as a gentle angular acceleration.
    const [w1, p1, w2, p2] = r.eddy;
    const eddy = (r.parent ? AIR.eddy : AIR.rootEddy) * stir;
    tau += r.I * eddy * (0.7 * Math.sin(w1 * t + p1) + 0.3 * Math.sin(w2 * t + p2));

    r.torque = tau;
    r.fx = fx;
    r.fz = fz;
  }

  // Hook springs: each pulls its rod toward its resting angle relative to the parent, and
  // pushes back on the parent equally. The top rod's spring is the thread, tied to the ceiling.
  const limit = PHYSICS.swingLimit * DEG;
  for (const r of rods) {
    const p = r.parent;
    const rel = r.theta - (p ? p.theta : 0) - r.rest;
    const relW = r.omega - (p ? p.omega : 0);
    let ts = -r.k * rel - r.c * relW;
    // Soft stop past the swing limit (rarely reached; keeps the reach bound honest).
    const over = Math.abs(rel) - limit;
    if (over > 0) ts -= Math.sign(rel) * 12 * r.k * over;
    r.torque += ts;
    if (p) p.torque -= ts;
  }

  // Semi-implicit Euler: stable and plenty accurate at this timestep.
  for (const r of rods) {
    r.omega += (r.torque / r.I) * dt;
    r.theta += r.omega * dt;
  }
}
