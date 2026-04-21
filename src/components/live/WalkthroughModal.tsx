"use client";

import { useState } from "react";

interface Step {
  emoji: string;
  title: string;
  body: string;
}

export function buildWalkthroughSteps(trackScoring: boolean): Step[] {
  const steps: Step[] = [
    {
      emoji: "⏱️",
      title: "Starting the game",
      body: "Tap Start Q1 to begin the first quarter. The clock runs automatically. Tap the clock pill to pause if there's a break in play, then tap it again to resume.",
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
      body: "When it's time for subs, a pop-up shows you the suggested swaps. Tap Apply subs to action them all in one go, or dismiss and do it yourself.",
    },
    {
      emoji: "🔒",
      title: "Locking a player",
      body: "Hold a player tile for half a second to open the lock menu. Lock to field keeps them on the pitch through auto-subs; Lock to zone lets them rotate off but always back into the same position. Hold again and tap Unlock to release.",
    },
    {
      emoji: "🩹",
      title: "Managing an injury",
      body: "Tap the Report injury button below the field to open the injury list. Mark a player injured and they'll stay on the bench and be skipped by auto-rotation — sub them off first if they're on the field. Tap the same button again (it shows the count) to clear the injury when they're ready to return.",
    },
  ];

  if (trackScoring) {
    steps.push({
      emoji: "⚽",
      title: "Recording scores",
      body: "Tap a field player, then tap + GOAL or + BEHIND at the bottom to credit them — their score appears on their tile. For the opposition, tap the + beside their score in the header. Made a mistake? An Undo chip appears at the top after every score — tap Undo to reverse it.",
    });
  }

  steps.push({
    emoji: "🏁",
    title: "Ending a quarter",
    body: "Tap End Q1 when the quarter finishes. You'll get a break screen where you can shuffle the lineup before the next quarter starts. After Q4 the game is marked complete and flows into your season stats.",
  });

  return steps;
}

interface WalkthroughModalProps {
  steps: Step[];
  skipWelcome?: boolean;
  onClose: () => void;
}

export function WalkthroughModal({ steps, skipWelcome, onClose }: WalkthroughModalProps) {
  const [phase, setPhase] = useState<"welcome" | "steps">(skipWelcome ? "steps" : "welcome");
  const [idx, setIdx] = useState(0);

  if (phase === "welcome") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wt-welcome-title"
      >
        <div className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-6 shadow-modal">
          <div className="mb-4 text-center text-5xl">👋</div>
          <h2 id="wt-welcome-title" className="mb-2 text-center text-xl font-bold text-ink">
            Welcome to Game Manager
          </h2>
          <p className="mb-6 text-center text-sm leading-relaxed text-ink-dim">
            You&apos;re in charge of today&apos;s game. Would you like a quick walkthrough of how it works?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPhase("steps")}
              className="w-full rounded-md bg-brand-600 py-3 text-base font-bold text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
            >
              Yes, show me!
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md border border-hairline py-2.5 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  const step = steps[idx];
  const isFirst = idx === 0;
  const isLast = idx === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wt-step-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-6 shadow-modal">
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

        <div className="mb-3 text-center text-4xl">{step.emoji}</div>
        <h3 id="wt-step-title" className="mb-2 text-center text-lg font-bold text-ink">
          {step.title}
        </h3>
        <p className="mb-6 text-center text-sm leading-relaxed text-ink-dim">{step.body}</p>

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
      </div>
    </div>
  );
}
