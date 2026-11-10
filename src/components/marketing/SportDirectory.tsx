import Link from "next/link";
import { SPORT_TILE_FRAME, SportTileFace } from "@/components/marketing/SportTile";
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
                className={SPORT_TILE_FRAME}
              >
                <SportTileFace sport={sport} line={sportPageCopy(sport.sport).tileLine} />
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
