"use client";

// ─── LeagueScorerPicker ──────────────────────────────────────
// The sheet the scorebug's `+T` opens (and, U13+, `+PG` / `+FG` to name
// the kicker): the kids on the field, so the coach can credit the score
// without first tapping a tile. It's the shared SlotFillSheet every
// sport's scorer sheet is (UX audit 23 Oct 2026): "Who scored?" under
// what was scored ("Try · 4 points", union's "Drop goal · 3 points"),
// and a stray tap on the backdrop keeps it (its default), so the score
// isn't lost. League's own sheet used to close on one. A try can be
// counted without a name ("Not sure who", as touch's and AFL's sheets
// offer): a parent running the game may not have seen who scored (UX
// round 2, 24 Oct 2026).

import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import type { Player } from "@/lib/types";
import { rugbyPoints, rugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import type { RugbySport } from "@/lib/sports/registry";

interface LeagueScorerPickerProps {
  /** The team's rugby sport: its points and goal names (union's drop goal). */
  sport: RugbySport;
  /** On-field players, in display order. */
  onFieldPlayers: Player[];
  /** Picked → orchestrator records the score for this player. */
  onPick: (playerId: string) => void;
  onCancel: () => void;
  /** "Not sure who": count the try without a scorer (tries only). */
  onNoScorer?: () => void;
  /** What was scored. Defaults to a try. */
  score?: "try" | "penalty_goal" | "field_goal";
}

/** "Try · 4 points", "Field goal · 1 point": the sheet's eyebrow. */
function scoreEyebrow(sport: RugbySport, score: "try" | "penalty_goal" | "field_goal"): string {
  const points = rugbyPoints(sport);
  const words = rugbyScoreWords(sport);
  const [label, n] =
    score === "try"
      ? ["Try", points.try]
      : score === "penalty_goal"
        ? [words.penaltyGoal.label, points.penaltyGoal]
        : [words.fieldGoal.label, points.fieldGoal];
  return `${label} · ${n} ${n === 1 ? "point" : "points"}`;
}

export function LeagueScorerPicker({ sport, onFieldPlayers, onPick, onCancel, onNoScorer, score = "try" }: LeagueScorerPickerProps) {
  const noScorer = score === "try" && onNoScorer ? onNoScorer : null;
  const words = rugbyScoreWords(sport);
  const what = score === "try" ? "try" : (score === "penalty_goal" ? words.penaltyGoal : words.fieldGoal).label.toLowerCase();
  return (
    <SlotFillSheet
      slotLabel={what}
      eyebrow={scoreEyebrow(sport, score)}
      title="Who scored?"
      lostScore={what}
      subtitle={
        score !== "try"
          ? `Pick the player who kicked the ${what}.`
          : noScorer
            ? "Pick who scored, or count the try without a name."
            : "Pick the player who scored the try."
      }
      candidates={onFieldPlayers.map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
      emptyMessage="No players on the field."
      extraOptions={noScorer ? [{ label: "Not sure who", subLabel: "Counts the try without a scorer", onSelect: noScorer }] : []}
      onPick={onPick}
      onCancel={onCancel}
    />
  );
}
