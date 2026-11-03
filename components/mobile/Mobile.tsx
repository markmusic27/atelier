"use client";

/*
 * The hanging mobile, printed in ASCII characters on a canvas behind (or above) the text.
 *
 * engine.ts runs the simulation, placement and input; draw-ascii.ts draws it; config.ts
 * tunes it.
 */

import { useEffect, useRef } from "react";
import { createAsciiRenderer } from "./draw-ascii";
import { runMobile } from "./engine";

export default function Mobile() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return runMobile(ref.current, createAsciiRenderer);
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="mobile-canvas pointer-events-none z-0" />;
}
