import Link from "next/link";

export type SetupStep = "basics" | "config" | "squad" | "games" | "done";

interface StepDef {
  id: SetupStep;
  label: string;
}

const STEPS: StepDef[] = [
  { id: "basics", label: "Team basics" },
  { id: "config", label: "How we play" },
  { id: "squad", label: "Add the squad" },
  { id: "games", label: "Add games" },
  { id: "done", label: "All set" },
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
  // Basics edits the team that already exists — never /teams/new,
  // which would create a second team (UX plan C3).
  return `/teams/${teamId}/setup?step=${step}`;
}

export function SetupProgress({ current, teamId }: SetupProgressProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  const currentStep = STEPS[currentIndex];

  return (
    <div className="space-y-2">
      {/* Phones: "Step n of 5 · label" over a segment bar — five pills
          truncated to "B…", "P…" at 375 px (UX plan M2). Completed
          segments still link back. */}
      <div className="sm:hidden">
        <p className="text-sm font-semibold text-ink">
          Step {currentIndex + 1} of {STEPS.length} · {currentStep?.label}
        </p>
        <ol className="mt-1.5 flex gap-1">
          {STEPS.map((step, i) => {
            const bar = (
              <span
                className={`block h-1.5 rounded-full ${
                  i < currentIndex ? "bg-brand-600" : i === currentIndex ? "bg-brand-400" : "bg-hairline"
                }`}
              />
            );
            return (
              <li key={step.id} className="flex-1">
                {i < currentIndex && teamId ? (
                  <Link
                    href={stepHref(teamId, step.id)}
                    aria-label={`Back to ${step.label}`}
                    className="block py-2"
                  >
                    {bar}
                  </Link>
                ) : (
                  <span className="block py-2" aria-current={i === currentIndex ? "step" : undefined}>
                    {bar}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
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
              <span className="truncate">{step.label}</span>
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
