import Link from "next/link";

export type SetupStep = "basics" | "config" | "squad" | "games" | "done";

interface StepDef {
  id: SetupStep;
  label: string;
  short: string;
}

const STEPS: StepDef[] = [
  { id: "basics", label: "Team basics", short: "Basics" },
  { id: "config", label: "How we play", short: "Play" },
  { id: "squad", label: "Add the squad", short: "Squad" },
  { id: "games", label: "Add games", short: "Games" },
  { id: "done", label: "All set", short: "Done" },
];

interface SetupProgressProps {
  current: SetupStep;
  /**
   * Team id. When provided, completed steps link back to their setup route
   * (e.g. to change a decision). Omit on step 1 — the team doesn't exist yet.
   */
  teamId?: string;
}

function stepHref(teamId: string, step: SetupStep): string {
  if (step === "basics") return "/teams/new";
  return `/teams/${teamId}/setup?step=${step}`;
}

export function SetupProgress({ current, teamId }: SetupProgressProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <div className="space-y-2">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isDone = i < currentIndex;
          const isFuture = i > currentIndex;

          const base =
            "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-semibold uppercase tracking-micro transition-colors sm:px-3 sm:text-xs";
          const stateClass = isCurrent
            ? "bg-brand-600 text-warm"
            : isDone
            ? "bg-brand-100 text-brand-700 hover:bg-brand-200"
            : "bg-surface-alt text-ink-mute";

          const numberBubble = (
            <span
              className={[
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                isCurrent
                  ? "bg-white/25 text-warm"
                  : isDone
                  ? "bg-brand-600 text-warm"
                  : "bg-hairline text-ink-mute",
              ].join(" ")}
              aria-hidden
            >
              {isDone ? "✓" : i + 1}
            </span>
          );

          const content = (
            <>
              {numberBubble}
              <span className="hidden truncate sm:inline">{step.label}</span>
              <span className="truncate sm:hidden">{step.short}</span>
            </>
          );

          // Completed steps link back; current and future do not.
          if (isDone && teamId) {
            return (
              <li key={step.id} className="min-w-0 flex-1">
                <Link
                  href={stepHref(teamId, step.id)}
                  className={`${base} ${stateClass}`}
                  aria-label={`Back to ${step.label}`}
                >
                  {content}
                </Link>
              </li>
            );
          }

          return (
            <li key={step.id} className="min-w-0 flex-1">
              <div
                className={`${base} ${stateClass}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {content}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-xs text-ink-mute">
        You can skip any step and come back to it later.
      </p>
    </div>
  );
}
