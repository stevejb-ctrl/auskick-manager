import Link from "next/link";
import { SportFieldGlyph } from "@/components/marketing/SportFieldGlyph";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { SPORT_COUNT_WORD } from "@/lib/siren-facts";
import { MARKETING_SPORTS, type MarketingSurface, sportPagePath } from "@/lib/sports/marketing-sports";

const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const SURFACE_BG: Record<MarketingSurface, string> = {
  field: "bg-field",
  court: "bg-court",
  wood: "bg-wood",
};

/**
 * The homepage's sport directory: a tile per sport, in popularity order,
 * each a link to its page. Every tile carries a small piece of its
 * sport's ground (its surface, its markings in chalk), so ten grounds
 * side by side tell the sports apart before a word is read, and one
 * line says the rule Siren handles for it. A card for coaches with more
 * than one team fills the grid's last two cells.
 */
export function SportDirectory() {
  return (
    <section id="sports" aria-labelledby="sports-heading" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2
            id="sports-heading"
            className="font-display text-[clamp(2.25rem,4.6vw,3.5rem)] font-extrabold leading-[1] text-ink stretch-80 [text-wrap:balance]"
          >
            {capitalised(SPORT_COUNT_WORD)} sports. Each one by its <span className="text-brand-600">own</span> rules.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-dim">
            Formats, positions and game-time rules change from sport to sport and age to age. Siren
            carries them for you. Pick yours to see what it knows.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {MARKETING_SPORTS.map((sport) => (
            <li key={sport.id}>
              <Link
                href={sportPagePath(sport)}
                data-testid={`sport-tile-${sport.id}`}
                className="group flex h-full flex-row items-center gap-4 rounded-[18px] border border-hairline bg-surface p-2.5 transition-colors duration-fast ease-out-quart hover:border-ink sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:p-0"
              >
                <span
                  className={`flex aspect-[16/10] w-[88px] shrink-0 items-center rounded-[12px] p-1.5 text-mark/75 sm:w-auto sm:rounded-none sm:px-7 sm:py-5 ${SURFACE_BG[sport.surface]}`}
                >
                  <SportFieldGlyph sport={sport.sport} weight={1.4} className="h-full w-full" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:px-[18px] sm:pb-5 sm:pt-4">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sport.accent }} />
                    <span className="font-display text-[1.25rem] font-extrabold leading-tight text-ink stretch-80 sm:text-[1.375rem]">
                      {sport.short}
                    </span>
                    <ArrowRight className="ml-auto hidden h-4 w-4 text-ink transition-transform duration-fast group-hover:translate-x-0.5 motion-reduce:transition-none sm:block" />
                  </span>
                  <span className="text-[0.875rem] leading-snug text-ink-dim sm:text-[0.9375rem]">
                    {sportPageCopy(sport.sport).tileLine}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim sm:hidden" />
              </Link>
            </li>
          ))}

          <li className="sm:col-span-2">
            <div className="flex h-full flex-col gap-6 rounded-[18px] bg-ink p-6 text-mark sm:flex-row sm:flex-wrap sm:items-center sm:p-8">
              <div className="min-w-0 flex-1 basis-56">
                <h3 className="font-display text-[1.75rem] font-extrabold leading-tight stretch-80">Coach more than one team?</h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-mark/80">
                  Every team sits in one account, whatever the sport, and every sport works the same
                  way: the same subs, the same breaks, the same link for parents.
                </p>
              </div>
              <ul
                aria-label="One coach's teams, each in a different sport"
                className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5 rounded-[14px] bg-mark/[0.06] p-1.5"
              >
                {EXAMPLE_TEAMS.map((team, i) => (
                  <li key={team.name} className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 ${i === 0 ? "bg-mark/[0.1]" : ""}`}>
                    <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-[3px] ${SURFACE_BG[team.surface]} ring-1 ring-mark/40`} />
                    <span className="flex-1 truncate text-[0.9375rem] font-semibold">{team.name}</span>
                    <span className="text-[0.8125rem] text-mark/75">{team.sport}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        </ul>

        <p className="mt-7 text-[0.9375rem] text-ink-dim">
          Coaching a sport that isn&apos;t here yet?{" "}
          <Link href="/contact" className="font-semibold text-ink underline underline-offset-4 hover:text-brand-700">
            Tell us what you coach
          </Link>
        </p>
      </div>
    </section>
  );
}

const EXAMPLE_TEAMS: ReadonlyArray<{ name: string; sport: string; surface: MarketingSurface }> = [
  { name: "Kingsway Hawks", sport: "Basketball U10", surface: "wood" },
  { name: "Kingsway United", sport: "Football U9", surface: "field" },
  { name: "Fitzroy Falcons", sport: "AFL U10", surface: "field" },
];

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={className}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}
