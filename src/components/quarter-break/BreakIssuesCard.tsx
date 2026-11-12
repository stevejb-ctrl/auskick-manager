"use client";

// The period break's issues (handoff §2.4): each broken rule inline in
// red, what broke it in bold, the rule under it and a Fix button when a
// single swap would clear it; the warnings folded into one "N warnings"
// row. Nothing at all when the lineup keeps every rule.

import { useState } from "react";
import type { BreakIssues } from "@/lib/live/break/issues";

interface Props {
  issues: BreakIssues;
  onFix: (issueId: string) => void;
}

export function BreakIssuesCard({ issues, onFix }: Props) {
  const [warningsOpen, setWarningsOpen] = useState(false);
  const { broken, warnings } = issues;
  if (broken.length === 0 && warnings.length === 0) return null;
  return (
    <section
      aria-label="Rule check"
      data-testid="break-issues"
      className={`overflow-hidden rounded-[14px] border bg-surface ${broken.length > 0 ? "border-danger/30" : "border-hairline"}`}
    >
      {broken.map((issue) => (
        <div
          key={issue.id}
          data-testid="break-broken-rule"
          className="flex min-h-[44px] items-center gap-2.5 border-b border-danger/20 bg-danger/5 px-3 py-2.5 last:border-b-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-danger">
            <path
              d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger">{issue.message}</p>
            {issue.rule && <p className="text-xs text-ink-dim">Rule: {issue.rule}</p>}
          </div>
          {issue.fix && (
            <button
              type="button"
              onClick={() => onFix(issue.id)}
              className="h-9 shrink-0 rounded-[10px] bg-danger px-3.5 text-[0.8125rem] font-semibold text-white transition-transform duration-fast ease-out-quart active:scale-[0.97]"
            >
              Fix
            </button>
          )}
        </div>
      ))}
      {warnings.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setWarningsOpen((v) => !v)}
            aria-expanded={warningsOpen}
            className="flex min-h-[44px] w-full items-center justify-between px-3 text-left text-[0.8125rem] font-medium text-ink"
          >
            <span>
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-ink-dim">{warningsOpen ? "Hide" : "Show"}</span>
          </button>
          {warningsOpen && (
            <ul className="space-y-2 px-3 pb-3 text-[0.8125rem] text-ink">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
