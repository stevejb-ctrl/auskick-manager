import { track } from "@/lib/analytics/client";
import type { AnalyticsSport } from "@/lib/analytics/events";

// Game-day events that more than one shared component sends, so the
// rules live in one place. See the catalogue in events.ts.

/**
 * The sub card was applied: AFL's SwapCard, or NextSubCard in league,
 * union, soccer and basketball. While "Sub due" shows, that's the coach
 * answering the prompt too.
 */
export function trackSuggestedSub(sport: AnalyticsSport, due: boolean, count: number): void {
  track("sub_made", { sport, source: due ? "due_prompt" : "suggestion", count });
  if (due) track("sub_due_prompt", { sport, action: "accepted" });
}

/** A sub the coach picked themselves (tap-tap, Switch, an empty spot). */
export function trackManualSub(sport: AnalyticsSport, count = 1): void {
  track("sub_made", { sport, source: "manual", count });
}

/** Same players in the same spots, whatever order each spot lists them. */
export function sameLineup(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm).map((x) => JSON.stringify(x)).sort();
    if (v && typeof v === "object") {
      return Object.keys(v)
        .sort()
        .map((k) => [k, norm((v as Record<string, unknown>)[k])]);
    }
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * The break's Start: did the coach take the suggested lineup as is,
 * edit it first, or use another rotation mode (rotate, keep, manual)?
 */
export function trackBreakSuggestion(
  sport: AnalyticsSport,
  mode: string,
  started: unknown,
  suggested: unknown,
): void {
  const action = mode !== "suggested" ? "ignored" : sameLineup(started, suggested) ? "applied" : "edited";
  track("quarter_break_suggestion", { sport, action });
}
