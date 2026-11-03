# Atelier

The homepage for theatelier.sh. Built with Next.js, React and Tailwind.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

The page hangs a Calder-style mobile beside the text, printed in ASCII characters and
simulated as a real balanced mobile: it drifts in a slow air current, and the cursor and
clicks stir it into gusts.

Files:

- `components/Copy.tsx`: the page text.
- `app/globals.css`: fonts (CMU Serif, CMU Typewriter), the light and dark palette (including the mobile's `--mobile-*` colors), and how the mobile is placed.
- `components/mobile/config.ts`: every tuning knob: the arrangement of arms and sheets, periods, damping, drag, air current, breeze and gusts, perspective, and the ASCII look (font size, RL terms, swap rate, depth fade).
- `components/mobile/physics.ts`: balance points, inertia and the torsional-pendulum simulation.
- `components/mobile/shapes.ts`: the hand-cut sheet outlines.
- `components/mobile/engine.ts`: camera, placement beside the text, the air field, input and the animation loop.
- `components/mobile/draw-ascii.ts`: draws the mobile in characters.
