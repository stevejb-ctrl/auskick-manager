import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import {
  MARKETING_SPORTS,
  type MarketingSportConfig,
} from "@/lib/sports/marketing-sports";
import {
  AflOvalField,
  LeagueRectField,
  NetballCourtField,
  RugbyUnionField,
} from "@/components/marketing/sport-fields";
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
 *   - Server component; no client JS needed.
 *   - Each sport card is a `<form>` posting to `runDemoGame` with
 *     the marketing sport id. Server action creates the game +
 *     redirects to /run/{token}.
 *   - Rugby Union renders as a disabled "Coming soon" card.
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

      {/* Picker grid — mirrors the homepage MultiSportSection
          layout (2 cols on phone, 4 on lg+). Each card is its own
          form so a click submits to runDemoGame with that card's
          sport id. */}
      <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {MARKETING_SPORTS.map((sport) => (
          <DemoSportCard key={sport.id} sport={sport} />
        ))}
      </div>

      {/* Quiet footer note — clarifies the demo is read-only-ish
          (no signup) without making it the headline pitch. */}
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

// ── One picker card ───────────────────────────────────────────────
function DemoSportCard({ sport }: { sport: MarketingSportConfig }) {
  const isDisabled = Boolean(sport.comingSoon);

  // Coming-soon (Union) renders a non-button card so visitors see
  // it in the line-up but can't click. Cursor-not-allowed + reduced
  // opacity mirrors the homepage MultiSportSection treatment.
  if (isDisabled) {
    return (
      <div
        aria-disabled="true"
        aria-label={`${sport.label} — coming soon`}
        data-testid={`demo-card-${sport.id}`}
        className="group relative h-[130px] cursor-not-allowed overflow-hidden rounded-lg opacity-55 sm:h-[150px]"
        style={{ backgroundColor: sport.accent }}
      >
        <CardFieldDecoration sport={sport} dimmed />
        <CardTextOverlay sport={sport} label="Coming soon" />
      </div>
    );
  }

  // Active card — wraps the visual in a form posting to
  // runDemoGame. The hidden `sport` input feeds the action; the
  // whole card surface is the submit button so the click target
  // is the visible card edge.
  return (
    <form action={runDemoGame}>
      <input type="hidden" name="sport" value={sport.id} />
      <button
        type="submit"
        aria-label={`Start ${sport.label} demo game`}
        data-testid={`demo-card-${sport.id}`}
        className="
          group relative block h-[130px] w-full overflow-hidden rounded-lg
          text-left transition-transform duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]
          hover:-translate-y-0.5
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          motion-reduce:transition-none
          sm:h-[150px]
        "
        style={{
          backgroundColor: sport.accent,
        }}
      >
        <CardFieldDecoration sport={sport} />
        <CardTextOverlay sport={sport} label="Run demo →" />
      </button>
    </form>
  );
}

// ── Field-illustration decoration, cropped bottom-right ──
// Same positional logic as the homepage card — container offset so
// the SVG's top-left lands in the card's mid-region, with the rest
// extending past the card edges. overflow-hidden on the card crops.
function CardFieldDecoration({
  sport,
  dimmed = false,
}: {
  sport: MarketingSportConfig;
  dimmed?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`
        pointer-events-none absolute left-2/3 top-[20%] w-[60%] aspect-[200/220]
        transition-opacity duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]
        ${dimmed ? "opacity-40" : "opacity-45 group-hover:opacity-60"}
      `}
    >
      <FieldForSport sport={sport} />
    </div>
  );
}

// ── Card text overlay — code top-left, sport name + action bottom-left
function CardTextOverlay({
  sport,
  label,
}: {
  sport: MarketingSportConfig;
  label: string;
}) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
      <p
        className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: "rgba(255,255,255,0.75)" }}
      >
        {sport.code}
      </p>
      <div>
        <p
          className="text-xl font-bold leading-tight tracking-tightest sm:text-2xl"
          style={{ color: "#FFFFFF" }}
        >
          {sport.label}
        </p>
        <p
          className="mt-0.5 text-xs"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

// Exhaustive switch — adding a sport here trips a TypeScript
// error if you forget to wire the SVG.
function FieldForSport({ sport }: { sport: MarketingSportConfig }) {
  switch (sport.id) {
    case "afl":
      return <AflOvalField accent={sport.accent} tintOpacity={0} />;
    case "league":
      return <LeagueRectField accent={sport.accent} tintOpacity={0} />;
    case "netball":
      return <NetballCourtField accent={sport.accent} tintOpacity={0} />;
    case "union":
      return <RugbyUnionField accent={sport.accent} tintOpacity={0} />;
  }
}
