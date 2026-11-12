"use client";

import { useFormStatus } from "react-dom";
import type { MarketingSportConfig } from "@/lib/sports/marketing-sports";
import { isBetaSport } from "@/lib/siren-facts";
import { PulseMark } from "@/components/brand/PulseMark";
import { SPORT_TILE_FRAME, SportTileFace } from "@/components/marketing/SportTile";

// Card for ONE sport in the demo picker: the homepage's sport tile
// (SportTile: a piece of the sport's ground in chalk, its dot, its
// name, its line) as a Run demo button, so the picker reads as the
// same site (live v3, 11 Nov 2026).
//
// A client component so it can use `useFormStatus`: the server action
// that starts a demo takes a couple of seconds (team lookup, game
// INSERT, availability seed, redirect). Without an immediate sign, a
// visitor thinks the tap did nothing and taps again, which starts a
// second game. Outer owns the <form>; Inner reads its status.
export function DemoSportCard({
  sport,
  line,
  action,
}: {
  sport: MarketingSportConfig;
  /** The words under the sport's name: its homepage tile line. */
  line: string;
  // The server action, passed through as the form's `action` so
  // React's form-status plumbing wires up.
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="h-full">
      <input type="hidden" name="sport" value={sport.id} />
      <DemoSportCardButton sport={sport} line={line} />
    </form>
  );
}

function DemoSportCardButton({ sport, line }: { sport: MarketingSportConfig; line: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      // Disabled while pending, so a second tap can't start a second game.
      disabled={pending}
      aria-label={`Start ${sport.label} demo game${isBetaSport(sport.sport) ? " (beta)" : ""}`}
      aria-busy={pending}
      data-testid={`demo-card-${sport.id}`}
      className={`${SPORT_TILE_FRAME} disabled:cursor-progress`}
    >
      <SportTileFace
        sport={sport}
        line={line}
        action={pending ? "Setting up the game…" : `Run demo${isBetaSport(sport.sport) ? " · Beta" : ""}`}
        overlay={
          pending && (
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/25 text-mark">
              <PulseMark size={32} pulsing />
            </span>
          )
        }
      />
    </button>
  );
}
