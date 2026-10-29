import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
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
 * Demo picker. Visitor lands here, picks their sport, and a fresh
 * U10 demo game starts (clock at 8×) on the public live view.
 *
 * Replaces the previous host-resolved auto-redirect — that flow
 * worked when each brand had a separate domain (sirenfooty,
 * sirennetball), but the unified multi-sport homepage means
 * visitors should explicitly pick.
 *
 * Architecture:
 *   - Server component; defers active-card rendering to a client
 *     component (DemoSportCard) so each card can use
 *     `useFormStatus` to show a Siren-pulse-mark loader during
 *     the action's ~1-2s round-trip.
 *   - A disabled (coming-soon) card stays server-rendered — no form,
 *     no client JS needed. Every sport is open today.
 *
 * Each card is filled with the sport's accent and carries its field
 * drawing (SportFieldGlyph, as on the homepage tiles and the Sports
 * menu) cropped bottom-right, on the cream surface background.
 */
export default function DemoPage() {
  noStore();

  return (
    <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-micro font-bold uppercase tracking-[0.18em] text-ink-mute">
          Try Siren
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] sm:text-5xl md:text-6xl">
          Pick a sport, run a demo.
        </h1>
        <p className="mt-6 text-lg text-ink-dim sm:text-xl">
          We&apos;ll set up a junior game with the clock sped up. See
          Siren handle rotations, scoring, and breaks in a couple of
          minutes.
        </p>
      </div>

      {/* Picker grid — 2 cols on phone and tablet (an odd last card
          spans both), two rows of five on lg+. Only the sports with a
          seeded demo team (hasDemo; /api/admin/seed-demo) are listed. */}
      <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {DEMO_SPORTS.map((sport, index) => (
          <div
            key={sport.id}
            className={
              DEMO_SPORTS.length % 2 === 1 && index === DEMO_SPORTS.length - 1
                ? "col-span-2 lg:col-span-1"
                : undefined
            }
          >
            <DemoSportCard sport={sport} action={runDemoGame} />
          </div>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-xl text-center text-sm text-ink-mute">
        Demos run in a public scoring view. No signup, no install.
        Already convinced?{" "}
        <a
          href="/signup"
          className="underline underline-offset-4 hover:text-ink-dim"
        >
          Create your team →
        </a>
      </p>
    </main>
  );
}
