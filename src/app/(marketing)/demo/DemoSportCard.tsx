"use client";

import { useFormStatus } from "react-dom";
import type { MarketingSportConfig } from "@/lib/sports/marketing-sports";
import { PulseMark } from "@/components/brand/PulseMark";
import {
  AflOvalField,
  LeagueRectField,
  NetballCourtField,
  RugbyUnionField,
} from "@/components/marketing/sport-fields";

// Card for ONE sport in the demo picker. Lives in a client
// component (not the server page) so it can use `useFormStatus`
// to swap the "Run demo →" label for the Siren pulse-mark loader
// the moment the form is submitting.
//
// Why this matters: the server action that creates a demo game
// takes a couple of seconds (Supabase round-trips for team
// lookup + game INSERT + availability seed + the eventual
// redirect). Without an immediate visible affordance, a visitor
// thinks the click did nothing and re-clicks — which spins up a
// second game and complicates the redirect race.
//
// Split into Outer (rendered by the server page, owns the
// <form>) and Inner (uses useFormStatus, must be a descendant of
// that form per React docs).
export function DemoSportCard({
  sport,
  action,
}: {
  sport: MarketingSportConfig;
  // The server action gets serialised across the network boundary
  // — pass it through as the form's `action` prop so React's
  // form-status plumbing wires up correctly.
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="sport" value={sport.id} />
      <DemoSportCardButton sport={sport} />
    </form>
  );
}

// ── Inner: reads useFormStatus to swap label for the loader ──
function DemoSportCardButton({ sport }: { sport: MarketingSportConfig }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      // Disable while pending so re-clicks during the action's
      // ~1-2s round-trip don't trigger a second submission.
      disabled={pending}
      aria-label={`Start ${sport.label} demo game`}
      aria-busy={pending}
      data-testid={`demo-card-${sport.id}`}
      className="
        group relative block h-[130px] w-full overflow-hidden rounded-lg
        text-left transition-transform duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]
        hover:-translate-y-0.5
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        disabled:cursor-progress disabled:hover:translate-y-0
        motion-reduce:transition-none
        sm:h-[150px]
      "
      style={{ backgroundColor: sport.accent }}
    >
      <CardFieldDecoration sport={sport} />
      <CardTextOverlay
        sport={sport}
        label={pending ? null : "Run demo →"}
      />
      {/* Pending overlay — sits on top of the card content with a
          semi-transparent fill so the sport accent still bleeds
          through. The PulseMark uses the inherited `currentColor`
          (white from the parent text colour) so the halo reads
          on any sport accent. */}
      {pending && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-white"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.15)" }}
        >
          <PulseMark size={36} pulsing />
        </div>
      )}
    </button>
  );
}

// ── Disabled (coming-soon) card — server-renderable, no form ──
// Exported so the server page can render Union without bringing
// the client boundary in. Same visual shape as the active card.
export function DemoSportCardDisabled({
  sport,
}: {
  sport: MarketingSportConfig;
}) {
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

// ── Shared visual bits ────────────────────────────────────────
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

function CardTextOverlay({
  sport,
  label,
}: {
  sport: MarketingSportConfig;
  label: string | null;
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
        {label !== null && (
          <p
            className="mt-0.5 text-xs"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {label}
          </p>
        )}
      </div>
    </div>
  );
}

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
