"use client";

import { useState } from "react";
import { summariseCheck, type CheckStatus, type RuleCheckItem } from "@/lib/playbook/ruleCheck";

interface RuleCheckBarProps {
  items: RuleCheckItem[];
  /** Why chips for the suggested moves: "Mia → Back: owed Back time". */
  why?: { playerName: string; to: string; reason: string }[];
  /**
   * Spots in the lineup with nobody in them (a kid lent or hurt at the
   * break and not replaced). They lead the check — "All rules kept" over
   * an empty spot read as all clear (round 5).
   */
  emptySpots?: number;
  /** What a spot is called: "spot" (AFL, league) or "position" (netball). */
  spotWord?: string;
}

const ICON: Record<CheckStatus, string> = { ok: "✓", warn: "⚠", fail: "✕" };
const WHY_LIMIT = 5;
const TONE: Record<CheckStatus, string> = {
  ok: "text-ok",
  warn: "text-warn",
  fail: "text-danger",
};

/**
 * Rule check (UX plan §7.6 RuleCheckBar) — one line that says whether
 * the lineup keeps the team's rules, the game-time floor and season
 * balance; tap for every line and the Why behind each suggested move.
 * Season nudges are soft warnings and never block. Shared by the AFL,
 * netball and league lineup and break screens.
 */
export function RuleCheckBar({ items: ruleItems, why = [], emptySpots = 0, spotWord = "spot" }: RuleCheckBarProps) {
  const [open, setOpen] = useState(false);
  const items: RuleCheckItem[] =
    emptySpots > 0
      ? [
          {
            id: "empty-spots",
            status: "warn",
            text: emptySpots === 1 ? `1 ${spotWord} is empty` : `${emptySpots} ${spotWord}s are empty`,
          },
          ...ruleItems,
        ]
      : ruleItems;
  if (items.length === 0) return null;
  const summary = summariseCheck(items);
  const extra = items.filter((i) => i.status !== "ok").length;
  // Collapsed copy (UI polish audit §14): with several findings the
  // old header clipped the first sentence mid-word ("Theo Russo is 2
  // quarters short at…") with a "+1" chip — a rendering accident as
  // the card's resting state. Several findings collapse to a count
  // ("1 rule broken · 2 warnings"); a single finding keeps its own
  // short sentence.
  const failCount = items.filter((i) => i.status === "fail").length;
  const warnCount = items.filter((i) => i.status === "warn").length;
  const headerText =
    extra > 1
      ? [
          failCount > 0 && `${failCount} rule${failCount === 1 ? "" : "s"} broken`,
          warnCount > 0 && `${warnCount} warning${warnCount === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join(" · ")
      : summary.text;
  // The routine reasons (fresh line this game, fair time) go last; the
  // ones a coach wouldn't guess — season debt, home, rules — first.
  const routine = (r: string) => /^(Hasn't played|Fair )/.test(r);
  const sortedWhy = [...why].sort((a, b) => Number(routine(a.reason)) - Number(routine(b.reason)));
  const shownWhy = sortedWhy.slice(0, WHY_LIMIT);

  return (
    <section
      aria-label="Rule check"
      className="rounded-lg border border-hairline bg-surface shadow-card"
      data-testid="rule-check"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <span aria-hidden className={`font-bold ${TONE[summary.status]}`}>
          {ICON[summary.status]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink" data-testid="rule-check-summary">
          {headerText}
        </span>
        <span aria-hidden className={`text-ink-mute transition-transform duration-fast ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-hairline px-4 py-3">
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id} className="flex gap-2 text-sm">
                <span aria-hidden className={`font-bold ${TONE[i.status]}`}>
                  {ICON[i.status]}
                </span>
                <span className={i.status === "ok" ? "text-ink-dim" : "text-ink"}>{i.text}</span>
              </li>
            ))}
          </ul>
          {why.length > 0 && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute">Why</p>
              <ul className="mt-1 space-y-1" aria-label="Why these moves">
                {shownWhy.map((w) => (
                  <li key={`${w.playerName}-${w.to}`} className="text-xs text-ink-dim">
                    <span className="font-semibold text-ink">{w.playerName}</span> → {w.to}: {w.reason}
                  </li>
                ))}
              </ul>
              {why.length > shownWhy.length && (
                <p className="mt-1 text-xs text-ink-mute">
                  and {why.length - shownWhy.length} more moves for a fair rotation
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
