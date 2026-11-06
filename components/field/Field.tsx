"use client";

/*
 * The page's background field: faint contour lines behind the text and the sculpture.
 * draw-field.ts draws it; config.ts tunes it (FIELD.enabled turns it off).
 */

import { useEffect, useRef } from "react";
import { FIELD } from "./config";
import { runField } from "./draw-field";

export default function Field() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current || !FIELD.enabled) return;
    return runField(ref.current);
  }, []);

  if (!FIELD.enabled) return null;
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
