import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { BAND_ACCENT } from "@/components/marketing/bandStyles";
import { FieldBand } from "@/components/marketing/FieldBand";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { MARKETING_SPORTS } from "@/lib/sports/marketing-sports";
import { DemoSportCard } from "./DemoSportCard";
import { runDemoGame } from "./actions";

const DEMO_SPORTS = MARKETING_SPORTS.filter((s) => s.hasDemo);

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try Siren — pick a sport",
  description:
    "Run a sped-up junior demo game in any of ten sports: netball, AFL, rugby league, football (soccer), basketball, rugby union, touch football, Oztag, hockey or futsal. See Siren handle rotations, scoring, and breaks in a couple of minutes.",
  alternates: { canonical: "/demo" },
};

/**
 * Demo picker. A visitor picks their sport and a fresh U10 demo game
 * starts (clock at 8×) on the public game-day view (/run/{token}).
 *
 * Live v3 (11 Nov 2026): on the site's field bands, as the homepage
 * and the sport pages are. A grass band with the oval says what a demo
 * is; below it, each sport is the homepage's sport tile (SportTile) as
 * a Run demo button. Only sports with a seeded demo team (hasDemo;
 * /api/admin/seed-demo) are listed; today that's all ten.
 */
export default function DemoPage() {
  noStore();

  return (
    <main>
      <FieldBand surface="field" marks="afl" markOpacity={0.12} markFit="meet" labelledBy="demo-heading">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="font-display text-[1.0625rem] font-bold text-mark/75 stretch-80">Try Siren</p>
          <h1
            id="demo-heading"
            className="mt-3 font-display text-[clamp(2.75rem,7vw,4.75rem)] font-extrabold leading-[0.95] stretch-80 [text-wrap:balance]"
          >
            Pick a sport, run a <span style={{ color: BAND_ACCENT }}>demo</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-mark/85 sm:text-xl">
            We&apos;ll set up a junior game with the clock sped up. See Siren handle rotations, scoring and
            breaks in a couple of minutes.
          </p>
        </div>
      </FieldBand>

      <section aria-label="Demo games" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
          {DEMO_SPORTS.map((sport) => (
            <li key={sport.id}>
              <DemoSportCard sport={sport} line={sportPageCopy(sport.sport).tileLine} action={runDemoGame} />
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-10 max-w-xl text-center text-[0.9375rem] text-ink-dim">
          Demos run in a public scoring view. No signup, no install. Already convinced?{" "}
          <Link href="/signup" className="font-semibold text-ink underline underline-offset-4 hover:text-brand-700">
            Create your team
          </Link>
        </p>
      </section>
    </main>
  );
}
