import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";

interface DoneStepProps {
  teamId: string;
  teamName: string;
}

export function DoneStep({ teamId, teamName }: DoneStepProps) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="done" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">All set 🎉</h1>
        <p className="text-sm text-ink-dim">
          Nice work — <strong className="text-ink">{teamName}</strong> is ready
          for Saturday. You can always come back to Settings to tweak things,
          add a goal song, or bring another coach/manager onto the team.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <h2 className="text-base font-semibold text-ink">Two things worth doing next</h2>
        <ul className="mt-3 space-y-3 text-sm text-ink-dim">
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 text-brand-600">•</span>
            <span>
              <strong className="text-ink">Invite a co-manager</strong> so
              you&apos;ve got backup when you can&apos;t be on the sideline.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-0.5 text-brand-600">•</span>
            <span>
              <strong className="text-ink">Share availability</strong> with
              parents so you know who&apos;s playing before match day.
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Link
          href={`/teams/${teamId}/settings`}
          className="inline-flex items-center justify-center rounded-md border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
        >
          Invite a co-manager
        </Link>
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Open team
        </Link>
      </div>
    </div>
  );
}
