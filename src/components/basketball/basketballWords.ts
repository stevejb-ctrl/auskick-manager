// ─── Basketball's words ──────────────────────────────────────
// Lines of copy the basketball screens share, from basketball's own
// rules.

import type { BasketballStrategy } from "@/lib/sports/basketball/types";

const STRATEGY_LABEL: Record<BasketballStrategy, string> = {
  minutes: "Equal minutes",
  "both-lines": "Guards and forwards",
  "preferred-line": "Home line",
  "position-by-position": "All five positions",
  "set-positions": "Set positions",
};

/** How we play's name for a rotation. */
export function basketballStrategyLabel(strategy: BasketballStrategy): string {
  return STRATEGY_LABEL[strategy];
}
