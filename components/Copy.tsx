/* The page text. */

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

        {/* The body copy. */}
        <div>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>

          <p>
            Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
            nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
            dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          </p>

          <p>
            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id
            est laborum. Curabitur pretium tincidunt lacus, nulla gravida orci a odio. Nullam varius, turpis et
            commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.
          </p>

          <p>
            Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec
            lobortis risus a elit. Etiam tempor, ut ullamcorper, ligula eu tempor congue, eros est euismod
            turpis, id tincidunt sapien risus a quam.
          </p>

          <p>
            Maecenas fermentum consequat mi. Donec fermentum, pellentesque malesuada nulla a mi. Duis sapien
            sem, aliquet nec, commodo eget, consequat quis, neque. Aliquam faucibus, elit ut dictum aliquet,
            felis nisl adipiscing sapien, sed malesuada diam lacus eget erat.
          </p>

          <p>Cras mollis scelerisque nunc.</p>

          <p>
            Nullam arcu. Aliquam consequat, curabitur augue lorem, dapibus quis, laoreet et, pretium ac,
            nisi.
            <sup className="ml-[0.08em] text-[0.68em] leading-none">
              <a id="fnref1" href="#fn1" aria-label="Footnote 1" className="scroll-mt-8 px-[0.1em] no-underline">
                1
              </a>
            </sup>
          </p>

          <footer className="mt-12">
            <hr className="mb-4 w-14 border-0 border-t border-current opacity-30" />
            <p id="fn1" className="scroll-mt-8">
              <sup className="mr-[0.25em] text-[0.75em]">1</sup>
              Aenean ut orci vel massa suscipit pulvinar. Nulla sollicitudin, fusce varius ligula non tempus
              aliquam.{" "}
              <a href="#fnref1" aria-label="Back to text" className="no-underline opacity-70 hover:opacity-100">
                ↩&#xFE0E;
              </a>
            </p>
          </footer>
        </div>
      </article>
    </main>
  );
}
