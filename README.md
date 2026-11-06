<p align="center">
  <img src=".github/thumbnail.png" width="800" alt="An ASCII-art mobile after Alexander Calder, its sheets printed with reinforcement-learning notation.">
</p>

# Atelier

A research workshop for people taking asymmetric bets in robot learning.

We're a small group of engineers and roboticists exploring ideas that are newly within reach. Most of us
are Stanford researchers who also work in labs like [ILIAD](https://iliad.stanford.edu/),
[REAL](https://real.stanford.edu/), and [Hazy Research](https://hazyresearch.stanford.edu/).

## Why now

The economics and the possibilities of robotics research are shifting. Running an experiment used to take
weeks: integrating components from several vendors, calibrating poses, and fabricating a test rig.
Frontier AI has collapsed the cost of software and is beginning to do the same for parts of hardware. Most
of the setup is no longer the bottleneck. Frontier models are also showing strong spatial reasoning,
enough to generate realistic 3D environments and even actuate robots directly, and we think much of the
field still underestimates what they can unlock when used creatively. Together, these mean that testing a
strange idea now costs a fraction of what it did even a few months ago. Directions that once needed a
well-funded lab and years of infrastructure are now within reach of a small group with a good idea and the
will to pursue it.

## The name

In nineteenth-century Paris, [ateliers](https://en.wikipedia.org/wiki/Atelier) were small workshops
where artists and architects learned and created with one another outside of the academy. We think
robotics needs the same thing now. The point is not to commercialize our work, but to provide a space with
resources and other people working seriously on hard problems.

## Early directions

- **Unexplored end effectors and dexterous tool use.** The field has mostly converged on parallel-jaw
  grippers and dexterous hands. The space of possible bodies, and of ways to collect data for them, is
  much larger than what's been tried.
- **Automating the [novelty pump](https://vedder.io/misc/novelty_pump.html).** A robot policy only
  improves from data that shows it something new, and finding that data today is manual work that doesn't
  compound. We think frontier models can take over parts of this loop, from spotting failures to
  generating new scenarios, toward a true data flywheel where every hour of deployment makes the policy
  better.
- **Embodied alignment.** Making sure robots act in ways that follow our intent, including the parts we
  don't think to specify.

## Get in touch

If you have a bet you want to test and Atelier sounds appealing, we'd like to hear from you. You don't
need to be at Stanford or in a lab. Labs and companies interested in sponsoring research or learning more
are welcome too. Email us at [mmusic@stanford.edu](mailto:mmusic@stanford.edu).

## This repository

Atelier's work will live here. For now, it holds the landing page at [atelierlab.io](https://atelierlab.io),
a Next.js site: one column of text beside an ASCII-art sculpture after Alexander Calder's
[*Model for East Building Mobile*](https://www.nga.gov/artworks/55697-model-east-building-mobile) (1972).
The sculpture is a small physics simulation of a balanced mobile, printed in reinforcement-learning
notation, that drifts in a slow air current and stirs when the cursor moves across it.

```bash
npm install
npm run dev     # http://localhost:3000
```

The text is in `components/Copy.tsx`, the title and share image in `app/layout.tsx`, the colors in
`app/globals.css`, and the sculpture in `components/mobile/` (every tuning knob is in `config.ts`). The
page is set in FK Roman Standard where it's installed locally (its trial license doesn't cover serving it)
and in Times New Roman otherwise. The sculpture is printed in CMU Typewriter.
