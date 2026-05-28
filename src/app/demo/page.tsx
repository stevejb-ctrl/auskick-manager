import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { MARKETING_SPORTS } from "@/lib/sports/marketing-sports";
import { DemoSportCard, DemoSportCardDisabled } from "./DemoSportCard";
import { runDemoGame } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try Siren — pick a sport",
  description:
    "Run a sped-up U10 demo game in AFL, Rugby League, or Netball. See Siren handle rotations, scoring, and quarter breaks in a couple of minutes.",
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
 *   - Disabled (Rugby Union) card stays server-rendered — no form,
 *     no client JS needed.
 *
 * Visual styling intentionally mirrors the homepage
 * MultiSportSection card grid (same field illustrations cropped
 * bottom-right, same accent-fill on active) but on the cream
 * surface background instead of the dark plate — per Steve's
 * "use the same buttons but not on the dark background".
 */
export default function DemoPage() {
  noStore();

  return (
    <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-mute">
          Try Siren
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tightest text-ink [text-wrap:balance] sm:text-5xl md:text-6xl">
          Pick a sport, run a demo.
        </h1>
        <p className="mt-6 text-lg text-ink-dim sm:text-xl">
          We&apos;ll set up an Under 10s game with the clock sped up. See
          Siren handle rotations, scoring, and breaks in a couple of
          minutes.
        </p>
      </div>

      {/* Picker grid — 2 cols on phone, 4 on lg+. Active sports
          render through DemoSportCard (form + useFormStatus loader);
          coming-soon sports use the lightweight server-only
          disabled variant. */}
      <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {MARKETING_SPORTS.map((sport) =>
          sport.comingSoon ? (
            <DemoSportCardDisabled key={sport.id} sport={sport} />
          ) : (
            <DemoSportCard
              key={sport.id}
              sport={sport}
              action={runDemoGame}
            />
          ),
        )}
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
