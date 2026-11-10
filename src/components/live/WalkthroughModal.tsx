"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useHelpHref } from "@/lib/help/helpHref";

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
    "Off next, On next → DEF: the kid's part in the next sub, and the same number on both kids of a pair. Off now, On now: the sub is due. " +
    "Stays: keeps their spot at the break. From bench, From C: where a kid is coming from. " +
    "Suggested, Rotate, Repeat, Manual: how the next lineup is picked (Siren's pick, everyone moves round, the same as last time, or you choose). " +
    "+G, +B, +T, +C, +2: add a goal, behind, try, conversion or basket for that team. Undo takes back the latest score; tap the score to fix an earlier one.",
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
      body: "Check the lineup, then tap Start on the bar at the bottom. The clock runs on its own: tap it to pause, or to end the period early.",
    },
    {
      emoji: "🔄",
      title: "Subs",
      body: "The Next sub line under the score counts down and says how many swaps; tap it to see the pairs. When subs are due, tap Make all swaps on the bar. Or tap a kid, then another, to swap just them: it happens straight away, with Undo for a few seconds.",
    },
    {
      emoji: "👆",
      title: "Tap a kid",
      body: "Tapping a kid opens their bar at the bottom: score for them, Injured, or More for the rest. Their minutes are there too. Tap × to put them down.",
    },
    {
      emoji: "➕",
      title: "Scores",
      body: "Tap + on the bar to add a score. Ours asks who scored. Undo under the score takes back the latest; tap the score to fix an earlier one.",
    },
    {
      emoji: "⋯",
      title: "The ⋯ menu",
      body: "Late arrivals, game settings, scores, this tour and the game-day link (so another parent can run the clock) are under ⋯ at the top.",
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
      body: "Tap Start Q1 on the bar at the bottom, then Start Q1 now when the siren goes. The clock runs on its own: tap it to pause for a stoppage, or to end the quarter early.",
    },
    {
      emoji: "🏟️",
      title: "Field & bench",
      body: "The kids sit on the field in their lines: forwards at the top, centres in the middle, backs at the bottom. Anyone not on the field is on the bench underneath.",
    },
    {
      emoji: "⚡",
      title: "The next sub",
      body: "Siren tracks everyone's minutes and plans fair subs. The Next sub line under the score counts down and says how many swaps. The kids in it say Off next or On next → FWD, with the same number on both kids of a pair. Tap the line to see the pairs.",
    },
    {
      emoji: "🔔",
      title: "Sub due",
      body: "When it's time, the clock turns orange, the kids say Off now and On now, and the bar shows Make all swaps. Tap it to do them in one go, or Pairs to check or change them first. You can still score.",
    },
    {
      emoji: "🔄",
      title: "Making a substitution",
      body: "Tap a kid, then tap another: a bench kid swaps on, a field kid swaps lines. It happens straight away, and Undo shows for a few seconds if you picked the wrong pair. Tap an empty spot to fill it.",
    },
    {
      emoji: "👆",
      title: "Tap a kid for their bar",
      body: "Tapping a kid opens their bar at the bottom, with their minutes this game. From there: Injured, or More to Switch, Keep on field (never subbed), Keep in their line, or Lend to the other team. Tap × to put them down.",
    },
    {
      emoji: "↩️",
      title: "Bringing someone back",
      body: "Injured and lent kids sit on the bench marked INJ or LENT. Tap them to bring them back, ready for the next sub.",
    },
  ];

  if (trackScoring) {
    steps.push({
      emoji: "⚽",
      title: "Recording scores",
      body: "Tap + Goal or + Behind on the bar and pick who scored (or tap a kid first). For the other team, tap their +G or +B. Undo under the score takes back the latest; tap the score to fix any of them.",
    });
  }

  steps.push(
    {
      emoji: "⋯",
      title: "The ⋯ menu",
      body: "Late arrivals, game settings, scores and fixes, this tour and the game-day link (so another parent can run the clock) are under ⋯ at the top.",
    },
    {
      emoji: "🏁",
      title: "Ending a quarter",
      body: "The quarter ends when the clock runs out (or tap the clock, then End Q1 now). The break shows the next lineup to change before you start the next quarter. After Q4, check the full-time review and tap Finish game so it counts in your season stats.",
    },
  );

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
  // The full help for this team's sport, in a new tab so the game stays open.
  const helpHref = useHelpHref();
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
        {isLast && (
          <a
            href={helpHref}
            target="_blank"
            rel="noopener"
            data-testid="walkthrough-help-link"
            className="mt-3 block w-full text-center text-xs text-ink-mute underline transition-colors duration-fast ease-out-quart hover:text-ink-dim"
          >
            More in the help pages (opens a new tab)
          </a>
        )}
      </Modal>
  );
}
