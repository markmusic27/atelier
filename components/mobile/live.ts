/*
 * Where the mobile is on screen right now, for other layers of the page to react to (the
 * background field, components/field/, keeps clear of it and stirs as its sheets move).
 * engine.ts rewrites it on every frame it draws the live page; positions are CSS px in the
 * mobile's canvas.
 */

export interface LiveSheet {
  x: number;
  y: number;
  /** Roughly how far the sheet reaches from its center. */
  r: number;
}

export const live = {
  /** The canvas the mobile is drawn on (null while it isn't running). */
  canvas: null as HTMLCanvasElement | null,
  sheets: [] as LiveSheet[],
  /** The thread, hooks and arms as line segments: x1, y1, x2, y2, x1, … */
  wires: [] as number[],
};
