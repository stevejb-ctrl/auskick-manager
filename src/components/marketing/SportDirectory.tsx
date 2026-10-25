import Link from "next/link";
import { SportFieldGlyph } from "@/components/marketing/SportFieldGlyph";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { SPORT_COUNT_WORD } from "@/lib/siren-facts";
import { MARKETING_SPORTS, sportPagePath } from "@/lib/sports/marketing-sports";

const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The homepage's sport directory: a tile per sport, in popularity
 * order, each a link to its page with the sport's field drawn and one
 * line on the rule Siren handles for it. A dark card for coaches with
 * more than one team fills the grid's last two cells.
 */
export function SportDirectory() {
  return (
    <section id="sports" aria-labelledby="sports-heading" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">
            The sports
          </p>
          <h2
            id="sports-heading"
            className="mt-3 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance]"
          >
            {capitalised(SPORT_COUNT_WORD)} sports. Each one by its <span className="text-brand-600">own</span> rules.
          </h2>
          <p className="mt-4 text-lg text-ink-dim">
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
                className="group flex h-full flex-row items-center gap-4 rounded-xl border border-hairline bg-surface p-3 transition-colors duration-fast ease-out-quart hover:border-ink sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:rounded-2xl sm:p-0"
              >
                <span className="flex aspect-[16/10] w-[72px] shrink-0 items-center rounded-lg bg-surface-alt p-1.5 text-ink sm:w-auto sm:rounded-none sm:px-6 sm:py-5">
                  <SportFieldGlyph sport={sport.sport} weight={1.4} className="h-full w-full" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:px-[18px] sm:pb-5 sm:pt-4">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="hidden h-2 w-2 rounded-full sm:block"
                      style={{ backgroundColor: sport.accent }}
                    />
                    <span className="text-[17px] font-bold tracking-tight text-ink sm:text-[19px]">
                      {sport.short}
                    </span>
                    <ArrowRight className="ml-auto hidden h-4 w-4 text-ink transition-transform duration-fast group-hover:translate-x-0.5 sm:block" />
                  </span>
                  <span className="text-[13.5px] leading-snug text-ink-dim sm:text-sm">
                    {sportPageCopy(sport.sport).tileLine}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim sm:hidden" />
              </Link>
            </li>
          ))}

          <li className="sm:col-span-2">
            <div className="flex h-full flex-col gap-6 rounded-2xl bg-ink p-6 text-warm sm:flex-row sm:flex-wrap sm:items-center sm:p-8">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mint">
                  One account
                </p>
                <h3 className="mt-2 text-2xl font-bold leading-tight tracking-tight">
                  Coach more than one team?
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-warm/75">
                  Every team sits in one account, whatever the sport, and every sport works the same
                  way: the same sub card, the same breaks, the same link for parents.
                </p>
              </div>
              <ul
                aria-label="One coach's teams, each in a different sport"
                className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5 rounded-xl bg-[#252A26] p-1.5"
              >
                {EXAMPLE_TEAMS.map((team, i) => (
                  <li
                    key={team.name}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${i === 0 ? "bg-[#303631]" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: team.accent }}
                    />
                    <span className="flex-1 truncate text-[15px] font-semibold">{team.name}</span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-warm/70">
                      {team.sport}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        </ul>

        <p className="mt-7 text-[15px] text-ink-dim">
          Coaching a sport that isn&apos;t here yet?{" "}
          <Link href="/contact" className="font-semibold text-ink underline underline-offset-4 hover:text-brand-700">
            Tell us what you coach
          </Link>
        </p>
      </div>
    </section>
  );
}

const accentOf = (id: string) => MARKETING_SPORTS.find((s) => s.id === id)?.accent ?? "#1A1E1A";

const EXAMPLE_TEAMS = [
  { name: "Kingsway Hawks", sport: "Basketball U10", accent: accentOf("basketball") },
  { name: "Kingsway United", sport: "Football U9", accent: accentOf("football") },
  { name: "Fitzroy Falcons", sport: "AFL U10", accent: accentOf("afl") },
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
