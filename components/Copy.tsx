/* The page text. */

const link = "underline decoration-1 underline-offset-[0.18em] hover:decoration-[1.5px]";

export default function Copy() {
  return (
    <main className="page relative z-10 px-4 pt-14 pb-24 md:pt-[clamp(56px,12vh,128px)] md:pr-8 md:pl-[clamp(24px,7vw,112px)]">
      <article id="column" className="max-w-[620px] text-pretty [&_p]:mb-[1.05em]">
        <h1 className="mb-1 text-[2.15rem] leading-tight font-normal tracking-[0.01em]">Atelier</h1>

        {/* A dictionary entry for the name. */}
        <div className="mb-4 text-ink/60">
          a-tə-lye · <i>proper noun</i>
        </div>
        <div className="mb-7">A workshop dedicated to asymmetric research bets in robot learning.</div>
        <hr className="mb-7 w-14 border-0 border-t border-current opacity-30" />

        <p>Atelier is a workshop for robot learning. Based near Stanford.</p>

        <p>
          In the ateliers of old Paris, apprentices learned their craft the slow way: by watching a
          master’s hands, copying them, and practicing until the work became their own. We think robots
          can learn the same way. Not from a few clever equations, but from demonstrations, repetition,
          and a lot of time spent touching the real world.
        </p>

        <p>
          The problem is that the real world is expensive. Robot learning research needs arms, grippers,
          cameras, compute, and a room where things are allowed to break. Most people with good ideas
          don’t have that. Atelier exists to close that gap: it’s a place to do robot learning research,
          and a place to get the equipment to do it.
        </p>

        <p>
          Atelier is not a startup, and it isn’t trying to be a company. There’s no product. We care about
          one thing: helping good research in robot learning happen, especially research that wouldn’t
          happen otherwise.
        </p>

        <p>
          The name is also a small tribute to Alexander Calder, who trained as a mechanical engineer
          before he started making sculptures move. His mobiles are machines tuned until they look
          effortless, balanced so precisely that a breath of air sets them in motion. That’s what we hope
          robots will feel like someday. The mobile on this page is our homage to him.
        </p>

        <p>Atelier is supported by Ribbit Capital.</p>

        <p>
          If you’re working on robot learning and need an arm, a place to work, or just someone to think
          with, write to{" "}
          <a className={link} href="mailto:hello@theatelier.sh">
            hello@theatelier.sh
          </a>
          .
          <sup className="ml-[0.08em] text-[0.68em] leading-none">
            <a id="fnref1" href="#fn1" aria-label="Footnote 1" className="scroll-mt-8 px-[0.1em] no-underline">
              1
            </a>
          </sup>
        </p>

        <footer className="mt-12 text-[0.86em] leading-relaxed">
          <hr className="mb-4 w-14 border-0 border-t border-current opacity-30" />
          <p id="fn1" className="scroll-mt-8">
            <sup className="mr-[0.25em] text-[0.75em]">1</sup>
            If you think robots don’t need a workshop, email{" "}
            <a className={link} href="mailto:disagree@theatelier.sh">
              disagree@theatelier.sh
            </a>
            . We’d love to argue about it, preferably over a broken gripper.{" "}
            <a href="#fnref1" aria-label="Back to text" className="no-underline opacity-70 hover:opacity-100">
              ↩&#xFE0E;
            </a>
          </p>
        </footer>
      </article>
    </main>
  );
}
