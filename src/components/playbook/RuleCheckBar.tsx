"use client";

import { useState } from "react";
import { summariseCheck, type CheckStatus, type RuleCheckItem } from "@/lib/playbook/ruleCheck";

interface RuleCheckBarProps {
  items: RuleCheckItem[];
  /** Why chips for the suggested moves: "Mia → Back: owed Back time". */
  why?: { playerName: string; to: string; reason: string }[];
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
export function RuleCheckBar({ items, why = [] }: RuleCheckBarProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const summary = summariseCheck(items);
  const extra = items.filter((i) => i.status !== "ok").length;
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
          {summary.text}
        </span>
        {extra > 1 && (
          <span className="shrink-0 rounded-full bg-surface-alt px-2 py-0.5 font-mono text-[10px] font-bold text-ink-dim">
            +{extra - 1}
          </span>
        )}
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
