"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

export interface WalkthroughStep {
  emoji: string;
  title: string;
  body: string;
}

/**
 * The words on the live and break screens, in one place, last in every
 * sport's walkthrough. Parents who don't know the sport stopped at each
 * of these (Stagehand round 8, #14).
 */
export const GLOSSARY_STEP: WalkthroughStep = {
  emoji: "📖",
  title: "Words you'll see",
  body:
    "Pair 1, OFF 1: who swaps with whom in the suggested subs. Stays: keeps their spot. From Bench, From C: where a kid is coming from. " +
    "Suggested, Rotate, Repeat, Manual: how the next lineup is picked (Siren's pick, everyone moves round, the same as last time, or you choose). " +
    "+G, +B, +T, +C, +2: add a goal, behind, try, conversion or basket for the team it sits under. Undo takes back the latest score; Fix scores changes an earlier one.",
};

/** A walkthrough ends on the words, once. */
export function withGlossary(steps: WalkthroughStep[]): WalkthroughStep[] {
  return steps.some((s) => s.title === GLOSSARY_STEP.title) ? steps : [...steps, GLOSSARY_STEP];
}

/**
 * The walkthrough for the sports on the shared live chrome (football,
 * futsal, hockey, basketball, touch, Oztag), which had no "?" at all: a
 * parent "found only a feedback form" (Stagehand round 8).
 */
export function buildSharedWalkthroughSteps(): WalkthroughStep[] {
  return withGlossary([
    {
      emoji: "⏱️",
      title: "Starting",
      body: "Check the lineup, then tap Start. The clock runs on its own: tap it to pause, or to end the period early.",
    },
    {
      emoji: "🔄",
      title: "Subs",
      body: "When subs are due, the card shows who swaps: tap Make all swaps. Or tap a kid, then a bench kid, to swap just them.",
    },
    {
      emoji: "➕",
      title: "Scores",
      body: "Tap the + under a team's name to add a score. Ours asks who scored. Undo on the strip takes back the latest.",
    },
    {
      emoji: "🏁",
      title: "The break",
      body: "When a period ends, the break shows the next lineup. Change anything you like, then tap Start.",
    },
  ]);
}

export function buildWalkthroughSteps(trackScoring: boolean): WalkthroughStep[] {
  const steps: WalkthroughStep[] = [
    {
      emoji: "⏱️",
      title: "Starting the game",
      body: "Tap Start Q1, then confirm when the siren goes — the clock starts then and runs automatically. Tap the clock pill to pause if there's a break in play, then tap it again to resume.",
    },
    {
      emoji: "🏟️",
      title: "Field & bench",
      body: "The field shows your players in their zones — Forward at the top, Centre in the middle, Back at the bottom. Anyone not on the field sits on the bench below.",
    },
    {
      emoji: "🔄",
      title: "Making a substitution",
      body: "Tap a field player to select them (they'll highlight), then tap a bench player to swap them. A confirmation screen appears before anything changes. Empty slots on the field work the same way — tap one with a bench player selected to send them on.",
    },
    {
      emoji: "🔀",
      title: "Swapping zones on the field",
      body: "Tap a field player, then tap another field player in a different zone. They'll exchange positions without anyone going off.",
    },
    {
      emoji: "⚡",
      title: "Auto-rotation",
      body: "The app tracks how long each player has been on field and suggests fair subs. Players due to come off get an amber badge (↓), players ready to come on get a green badge (↑).",
    },
    {
      emoji: "🔔",
      title: "Sub timer alert",
      body: "When it's time for subs, a Sub due banner appears under the top bar and the sub card opens with the suggested swaps. Tap Make all swaps to do them in one go, or do it yourself. The banner never blocks scoring.",
    },
    {
      emoji: "👇",
      title: "Tap for player actions",
      body: "Tap a player, then Player actions at the bottom of the screen to open the actions sheet. From here you can Switch player, Keep on field (never subbed), Keep in their zone (rotates off but always back to the same spot), Mark injured (sits on the bench, skipped by auto-rotation), or Lend to opposition (counts toward season fairness).",
    },
    {
      emoji: "↩️",
      title: "Bringing someone back",
      body: "Injured and lent players show a red INJ or amber LENT badge on the bench. Just tap them — the actions sheet opens straight to Mark recovered or Bring back, one tap and they're available for the next sub.",
    },
  ];

  if (trackScoring) {
    steps.push({
      emoji: "⚽",
      title: "Recording scores",
      body: "Tap a field player, then tap + GOAL or + BEHIND at the bottom to credit them — their score appears on their tile. For the opposition, tap the + beside their score in the header. Made a mistake? Tap Undo on the strip above the scoreboard to take back the latest score.",
    });
  }

  steps.push({
    emoji: "🏁",
    title: "Ending a quarter",
    body: "The quarter ends when the clock runs out (or tap the clock, then End Q1 now). You'll get a break screen where you can shuffle the lineup before the next quarter starts. After Q4, check the full-time review and tap Finish game so it flows into your season stats.",
  });

  return steps;
}

interface WalkthroughModalProps {
  steps: WalkthroughStep[];
  onClose: () => void;
}

// Opens straight onto the steps. The old "Welcome to Game Manager"
// interstitial is gone: the tour is offered on the lineup screen before
// kickoff (WalkthroughOffer) or opened from the "?" button, and both of
// those already ask the question (UX plan H1).
export function WalkthroughModal({ steps: stepsProp, onClose }: WalkthroughModalProps) {
  // Every walkthrough ends on the words (GLOSSARY_STEP).
  const steps = withGlossary(stepsProp);
  const [idx, setIdx] = useState(0);

  // Direction tracking for step-content slide animations. The
  // prevIdxRef holds the LAST committed idx; comparing to the
  // current idx tells us which way the user navigated. Set in a
  // post-render useEffect so the comparison during render N uses
  // the value committed in render N-1. Direction "forward" on
  // first render (initial mount).
  // P2-7 in MICRO-INTERACTIONS-PLAN.md.
  const prevIdxRef = useRef(idx);
  const direction: "forward" | "backward" =
    idx >= prevIdxRef.current ? "forward" : "backward";
  useEffect(() => {
    prevIdxRef.current = idx;
  }, [idx]);

  const step = steps[idx];
  const isFirst = idx === 0;
  const isLast = idx === steps.length - 1;

  return (
    <Modal placement="sheet" labelledBy="wt-step-title" onClose={onClose} padding="p-6">
        {/* Progress dots */}
        <div className="mb-5 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-base ease-out-quart ${
                i === idx ? "w-5 bg-brand-500" : i < idx ? "w-1.5 bg-brand-200" : "w-1.5 bg-surface-alt"
              }`}
            />
          ))}
        </div>

        {/* Step content — emoji + title + body. Re-keyed on `idx`
            so React remounts the block on every step change, which
            restarts the directional slide-in animation from frame
            0. Direction is computed in the parent: forward (Next
            tap) slides in from the right, backward (Back tap) from
            the left. Communicates the directional flow without
            requiring the user to read the progress dots.
            P2-7 in MICRO-INTERACTIONS-PLAN.md. */}
        <div
          key={idx}
          className={
            direction === "forward"
              ? "motion-safe:animate-slide-in-right"
              : "motion-safe:animate-slide-in-left"
          }
        >
          <div className="mb-3 text-center text-4xl">{step.emoji}</div>
          <h3 id="wt-step-title" className="mb-2 text-center text-lg font-bold text-ink">
            {step.title}
          </h3>
          <p className="mb-6 text-center text-sm leading-relaxed text-ink-dim">{step.body}</p>
        </div>

        <div className="flex gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={() => setIdx(idx - 1)}
              className="flex-1 rounded-md border border-hairline py-2.5 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onClose() : setIdx(idx + 1))}
            className="flex-1 rounded-md bg-brand-600 py-2.5 text-sm font-bold text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
          >
            {isLast ? "Let's go! 🎉" : "Next"}
          </button>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full text-center text-xs text-ink-mute transition-colors duration-fast ease-out-quart hover:text-ink-dim"
          >
            Skip walkthrough
          </button>
        )}
      </Modal>
  );
}
