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
      body: "Tap Start Q1 to begin the first quarter. The clock runs automatically. Use Pause if there's a break in play, then Resume to continue.",
    },
    {
      emoji: "🏟️",
      title: "Field & bench",
      body: "The field shows your players in their zones — Back, Mid, Forward. Players not on the field are shown on the bench below.",
    },
    {
      emoji: "🔄",
      title: "Making a substitution",
      body: "Tap a field player to select them (they'll highlight), then tap a bench player to swap them. A confirmation screen will appear before anything changes.",
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
      body: "Hold down a player tile for half a second to lock them. A padlock icon appears and they'll be skipped by auto-rotation — great if someone is playing a special role. Hold again to unlock.",
    },
  ];

  if (trackScoring) {
    steps.push({
      emoji: "⚽",
      title: "Recording goals",
      body: "Tap a field player to select them, then tap + GOAL or + BEHIND at the bottom of the screen. Their score appears on their tile.",
    });
  }

  steps.push({
    emoji: "🏁",
    title: "Ending a quarter",
    body: "Tap End Q1 when the quarter finishes. You'll get a break screen where you can shuffle the lineup before the next quarter starts.",
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
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wt-welcome-title"
      >
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
          <div className="mb-4 text-center text-5xl">👋</div>
          <h2 id="wt-welcome-title" className="mb-2 text-center text-xl font-bold text-gray-900">
            Welcome to Game Manager
          </h2>
          <p className="mb-6 text-center text-sm leading-relaxed text-gray-500">
            You&apos;re in charge of today&apos;s game. Would you like a quick walkthrough of how it works?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPhase("steps")}
              className="w-full rounded-lg bg-brand-600 py-3 text-base font-bold text-white transition-colors hover:bg-brand-700"
            >
              Yes, show me!
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wt-step-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        {/* Progress dots */}
        <div className="mb-5 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === idx ? "w-5 bg-brand-500" : i < idx ? "w-1.5 bg-brand-200" : "w-1.5 bg-gray-200"
              }`}
            />
          ))}
        </div>

        <div className="mb-3 text-center text-4xl">{step.emoji}</div>
        <h3 id="wt-step-title" className="mb-2 text-center text-lg font-bold text-gray-900">
          {step.title}
        </h3>
        <p className="mb-6 text-center text-sm leading-relaxed text-gray-600">{step.body}</p>

        <div className="flex gap-2">
          {!isFirst && (
            <button
              type="button"
              onClick={() => setIdx(idx - 1)}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onClose() : setIdx(idx + 1))}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700"
          >
            {isLast ? "Let's go! 🎉" : "Next"}
          </button>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full text-center text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            Skip walkthrough
          </button>
        )}
      </div>
    </div>
  );
}
