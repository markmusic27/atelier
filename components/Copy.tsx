/* The page text. */

import type { ReactNode } from "react";

/* Footnotes, numbered from 0: note 0 is about the sculpture (no marker in the text); the rest go
   with the markers (<Ref n={…} />) in the copy. */
const NOTES: ReactNode[] = [
  <>
    The sculpture on this page is after Alexander Calder, inspired by his{" "}
    <Link href="https://www.nga.gov/artworks/55697-model-east-building-mobile">
      <i>Model for East Building Mobile</i>
    </Link>{" "}
    (1972) at the National Gallery of Art.
  </>,
  <>
    Two OpenAI team members worked with GPT-6 Astra to design a prototype device for talking to Codex in under a
    week, as a side project. Astra designed the enclosure, circuit board, interface, and software, without any
    direct human edits (<Link href="https://openai.com/index/accelerating-engineering-for-the-physical-world/">OpenAI</Link>).
  </>,
  <>
    Tom Krcha gave Astra an image of a house, and it rebuilt the house in Blender as editable geometry, down to the
    toys and furniture (<Link href="https://x.com/tomkrcha/status/2095598645190291775">post</Link>). Separately,
    NVIDIA found that Astra, with no robot-specific finetuning, beat the best existing robot policy on 120 simulated
    manipulation tasks (<Link href="https://research.nvidia.com/labs/srl/projects/astranomy/">Astranomy</Link>).
  </>,
  <>
    Kyle Vedder from Pi argues robots don’t need dexterous hands: bimanual parallel-jaw grippers handle most tasks, and for
    the rest, adding an arm beats adding end-effector complexity (
    <Link href="https://vedder.io/misc/the_case_against_human_hands.html">Vedder</Link>). We agree with his
    reasoning but not his conclusion. Robots can swap end effectors, as Generalist does by pretraining one model
    across roughly 9,000 of them (
    <Link href="https://generalistai.com/blog/towards-machines-with-a-thousand-hands">Generalist</Link>).
  </>,
  <>
    RoboHarm asked frontier policies driving real robot arms to do things a safe robot should refuse, such as
    stabbing a baby doll, putting a screwdriver in a toaster, or mixing bleach and ammonia. Over 100 trials each,
    Claude Fable 5.1 refused 20 times, GPT-6 Astra twice, and MolmoAct2 never (
    <Link href="https://robocurve.org/roboharm/">Robocurve</Link>).
  </>,
];

const linkClass =
  "underline decoration-current/30 underline-offset-[0.18em] transition-colors duration-120 ease-out hover:decoration-current";

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={linkClass}>
      {children}
    </a>
  );
}

/** A footnote marker, linking to its note at the bottom. */
function Ref({ n }: { n: number }) {
  return (
    <sup className="ml-[0.08em] text-[0.68em] leading-none">
      <a
        id={`fnref${n}`}
        href={`#fn${n}`}
        aria-label={`Footnote ${n}`}
        className="scroll-mt-8 px-[0.1em] underline decoration-transparent underline-offset-[0.18em] transition duration-120 ease-out hover:decoration-current hover:opacity-60"
      >
        {n}
      </a>
    </sup>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 mb-3 text-[1.3em] leading-snug font-medium">{children}</h2>;
}

export default function Copy() {
  return (
    <main className="page relative z-10 px-4 pt-14 pb-24 md:pt-[clamp(56px,12vh,128px)] md:pr-8 md:pl-[clamp(24px,7vw,112px)]">
      <article id="column" className="max-w-[620px] text-pretty [&_p]:mb-[1.05em]">
        <h1 className="mb-3 text-[2.15rem] leading-tight font-normal tracking-[-0.02em]">Atelier</h1>
        <div className="mb-7">A research workshop for people taking asymmetric bets in robot learning.</div>
        <hr className="mb-7 w-14 border-0 border-t border-current opacity-30" />

        {/* The body copy. */}
        <div>
          <p>
            We’re a small group of engineers and roboticists exploring ideas that are newly within reach. Most of us are Stanford researchers who also work in labs like{" "}
            <Link href="https://iliad.stanford.edu/">ILIAD</Link>,{" "}
            <Link href="https://real.stanford.edu/">REAL</Link>, and{" "}
            <Link href="https://hazyresearch.stanford.edu/">Hazy Research</Link>.
          </p>

          <p>We’re starting now because the economics and the possibilities of robotics research are shifting.</p>

          <ol className="mb-[1.05em] list-decimal pl-[1.4em] marker:text-ink/60 [&_li]:mb-[0.6em] [&_li]:pl-[0.2em]">
            <li>
              Running an experiment used to take weeks: integrating components from several vendors, calibrating
              poses, and fabricating a test rig, to name a few. Frontier AI has collapsed the cost of software and
              is beginning to do the same for parts of hardware.
              <Ref n={1} /> Most of the setup is no longer the bottleneck.
            </li>
            <li>
              Frontier LLMs are also demonstrating striking spatial reasoning capabilities, strong enough to
              generate realistic 3D environments and even actuate robots directly.
              <Ref n={2} /> We think much of the field still underestimates how much value these models can
              unlock when used creatively.
            </li>
          </ol>

          <p>
            Together, these mean that testing a strange idea now costs a fraction of what it did even a few
            months ago. Directions that once needed a well-funded lab and years of infrastructure are now within
            reach of a small group with a good idea and the will to pursue it.
          </p>

          <p>
            The name comes from nineteenth-century Paris, where{" "}
            <Link href="https://en.wikipedia.org/wiki/Atelier">ateliers</Link> were small workshops for artists and
            architects to learn and create with one another outside of the academy. We think robotics needs the same thing right now, and we envision Atelier as a contemporary
            equivalent for engineers and roboticists. The point is not to commercialize our work, but to provide
            a space with resources and other people working seriously on hard problems.
          </p>

          <Heading>Early directions</Heading>

          <p>
            Right now, we’re most excited about three directions. The first is unexplored end effectors and
            dexterous tool use. The field has mostly converged on parallel-jaw grippers and dexterous hands,
            <Ref n={3} /> and we think the space of possible bodies, and how one collects data for them, is much
            larger than what’s been tried.
          </p>

          <p>
            The second is automating the <Link href="https://vedder.io/misc/novelty_pump.html">novelty pump</Link>.
            More data doesn’t automatically make a robot policy better; it only improves from data that shows it
            something new, like a situation where it fails or a task it hasn’t tried. Today, collecting that data
            is manual work: people watch the robot, spot where it struggles, and set up new demonstrations, and
            that effort doesn’t compound as the robot is deployed more. We think frontier models can take over
            parts of this loop, from spotting failures to generating new scenarios. The goal is a true data
            flywheel, where every hour of deployment makes the policy better, which is{" "}
            <Link href="https://vedder.io/misc/novelty_pump.html#:~:text=You%20do%20not%20get%20that%20by%20deploying%20more%20robots%20doing%20the%20same%20task.%20You%20can%20only%20get%20that%20by%20operating%20a%20Novelty%20Pump%2C%20which%20requires%20constant%20operational%20effort%20and%20does%20not%20compound.">
              harder than it sounds
            </Link>
            .
          </p>

          <p>
            The third is what we call embodied alignment: making sure robots act in ways that follow our intent,
            including the parts we don’t think to specify.
            <Ref n={4} />
          </p>

          <Heading>Reach out</Heading>

          <p>
            If you have a bet you want to test and Atelier sounds appealing to you, we’d like to hear from you.
            You don’t need to be at Stanford or in a lab. Email us at{" "}
            <Link href="mailto:mmusic@stanford.edu">mmusic@stanford.edu</Link>.
          </p>

          <p>
            If you’re a lab or company interested in sponsoring research or learning more about what we’re up
            to, email us at <Link href="mailto:mmusic@stanford.edu">mmusic@stanford.edu</Link>.
          </p>

          <footer className="mt-12 text-[0.88em] text-ink/70">
            <hr className="mb-4 w-14 border-0 border-t border-current opacity-30" />
            {NOTES.map((note, i) => (
              <p key={i} id={`fn${i}`} className="scroll-mt-8">
                <sup className="mr-[0.25em] text-[0.75em]">{i}</sup>
                {note}
                {i > 0 && (
                  <>
                    {" "}
                    <a href={`#fnref${i}`} aria-label="Back to text" className="no-underline opacity-70 transition-opacity duration-120 ease-out hover:opacity-100">
                      ↩&#xFE0E;
                    </a>
                  </>
                )}
              </p>
            ))}
          </footer>
        </div>
      </article>
    </main>
  );
}
