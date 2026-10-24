// ─── Touch and Oztag: time played outside the mixed rule ─────
// How long a mixed team's field broke its rule (too many boys, too few
// girls or boys: mixedFieldBreach, the live strip's own test), per
// period, from the game's events, for How we played (round 2 usability,
// 24 Oct 2026: a half played with 5 boys on for three minutes read
// "Rules kept"). Pure.

import type { GameEvent, MixedGroup } from "@/lib/types";
import { touchOnField } from "@/lib/sports/touch/lineup";
import { mixedFieldBreach } from "@/lib/sports/touch/mixed";
import { replayTouchGame } from "@/lib/sports/touch/replay";
import type { MixedRule } from "@/lib/sports/touch/types";

/** ms per period (1-based) the field broke the rule; periods that kept it are absent. */
export function mixedBreachMsByPeriod(
  events: readonly GameEvent[],
  rule: MixedRule,
  groupOf: (id: string) => MixedGroup | null | undefined,
): Record<number, number> {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out: Record<number, number> = {};
  // The field after each event, while a period is in play: whether it
  // broke the rule from that moment until the next event.
  let open: { period: number; from: number } | null = null;
  const close = (period: number, at: number) => {
    if (open && open.period === period && at > open.from) out[period] = (out[period] ?? 0) + (at - open.from);
    open = null;
  };
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const elapsed = typeof (ev.metadata as { elapsed_ms?: unknown })?.elapsed_ms === "number"
      ? (ev.metadata as { elapsed_ms: number }).elapsed_ms
      : 0;
    const state = replayTouchGame(sorted.slice(0, i + 1));
    const inPlay = state.currentPeriod >= 1 && !state.periodEnded;
    if (ev.type === "quarter_end") {
      close(state.currentPeriod, elapsed);
      continue;
    }
    if (!inPlay || !state.lineup) continue;
    const at = ev.type === "quarter_start" ? 0 : elapsed;
    const breach = mixedFieldBreach(touchOnField(state.lineup), rule, groupOf) !== null;
    if (breach && !open) open = { period: state.currentPeriod, from: at };
    else if (!breach && open) close(state.currentPeriod, at);
  }
  return out;
}
