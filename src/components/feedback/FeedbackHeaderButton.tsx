"use client";

import { useState } from "react";
import { FeedbackModal } from "./FeedbackModal";

/**
 * In-game feedback trigger that sits in `LiveTopBar` next to the "?"
 * help icon. Same modal as `FeedbackFab`, different chrome:
 *
 *   • Floating FAB position (bottom-right, z-40) overlapped the
 *     opposition +G/+B scoring chip on the live game UI — Steve
 *     reported it being unusable mid-game.
 *   • Header placement keeps the trigger out of every other tap
 *     surface and matches the visual rhythm of the existing "?"
 *     help icon: 44pt outer tap target, 28pt visible pill with
 *     border + neutral text, subtle hover/active transitions.
 *
 * Auth assumption: every current `LiveTopBar` caller is in an
 * authenticated route (AFL/netball/league live pages, AFL pre-
 * kickoff). The feedback action's `kind: "feedback"` branch demands
 * an authed user, so the button is hardcoded to that kind here.
 * If a future unauthenticated surface mounts `LiveTopBar`, this
 * component should be gated behind a prop or moved into the
 * authenticated callers individually.
 */
export function FeedbackHeaderButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Mirrors the "?" pill's structure: 44pt tap area, 28pt
        // visible glyph, `group` so the inner pill (not the outer
        // tap surface) carries the hover/active treatment.
        className="group inline-flex h-11 w-11 shrink-0 items-center justify-center"
        aria-label="Send feedback"
        data-testid="feedback-header-button"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-hairline text-ink-mute transition-colors duration-fast ease-out-quart group-hover:border-ink-dim group-hover:text-ink-dim group-active:bg-ink/5">
          {/* Chat-bubble glyph at 14px so it sits comfortably inside
              the 28pt pill. Same icon as the FAB so the affordance
              reads consistently across surfaces. */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </span>
      </button>

      <FeedbackModal
        kind="feedback"
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
