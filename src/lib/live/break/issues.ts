// ─── Period break issues ─────────────────────────────────────
// A sport's rule check for the staged lineup, as the break screen shows
// it: broken rules ("must" rules and the game-time floor) inline, each
// with the swap that would fix it when one exists; everything soft as a
// warning. Re-run after every swap, so a fixed rule drops off at once.

import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { findFixSwap, type BoardSlot } from "@/lib/live/break/board";

export interface BreakIssue {
  id: string;
  /** What's wrong, about these kids, now. */
  message: string;
  /** The rule it breaks. */
  rule?: string;
  /** The single swap that fixes it; absent → no Fix button. */
  fix?: [BoardSlot, BoardSlot];
}

export interface BreakIssues {
  broken: BreakIssue[];
  warnings: string[];
}

export interface BreakIssuesInput {
  /** The rule check for the staged lineup. */
  items: readonly RuleCheckItem[];
  slots: readonly BoardSlot[];
  sidelined: ReadonlySet<string>;
  /** The rule check had slots a and b been swapped. */
  checkAfter: (a: BoardSlot, b: BoardSlot) => readonly RuleCheckItem[];
  /** Soft notes the check doesn't make ("1 spot is empty"). */
  extraWarnings?: readonly string[];
}

const slotKey = (s: BoardSlot) => `${s.group}#${s.index}#${s.playerId ?? ""}`;

export function breakIssues({ items, slots, sidelined, checkAfter, extraWarnings = [] }: BreakIssuesInput): BreakIssues {
  const failing = new Set(items.filter((i) => i.status === "fail").map((i) => i.id));
  const tried = new Map<string, ReadonlySet<string>>();
  const failingAfter = (a: BoardSlot, b: BoardSlot) => {
    const key = `${slotKey(a)}|${slotKey(b)}`;
    let hit = tried.get(key);
    if (!hit) {
      hit = new Set(checkAfter(a, b).filter((i) => i.status === "fail").map((i) => i.id));
      tried.set(key, hit);
    }
    return hit;
  };
  const broken = items
    .filter((i) => i.status === "fail")
    .map((i) => ({
      id: i.id,
      message: i.text,
      rule: i.rule || undefined,
      fix: findFixSwap({ slots, sidelined, itemId: i.id, offenders: i.playerIds, failing, failingAfter }) ?? undefined,
    }));
  const warnings = [...extraWarnings, ...items.filter((i) => i.status === "warn").map((i) => i.text)];
  return { broken, warnings };
}
