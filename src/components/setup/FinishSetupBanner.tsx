import Link from "next/link";

interface FinishSetupBannerProps {
  teamId: string;
}

/**
 * Banner shown at the top of the team landing page when setup looks
 * incomplete (zero active players). Clears itself once the squad has
 * anyone on it. Only rendered for admins by the caller.
 */
export function FinishSetupBanner({ teamId }: FinishSetupBannerProps) {
  return (
    <Link
      href={`/teams/${teamId}/setup?step=squad`}
      className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 shadow-card transition-colors hover:bg-brand-100"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-micro text-brand-700">
          Finish setup
        </p>
        <p className="mt-0.5 text-sm text-ink">
          You haven&apos;t added any players yet. Pick up where you left off.
        </p>
      </div>
      <span
        aria-hidden
        className="flex-shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-warm"
      >
        Continue →
      </span>
    </Link>
  );
}
