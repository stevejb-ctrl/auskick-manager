// ─── RunnerAllDone ───────────────────────────────────────────
// The game-day link's last word once the game is finished: nothing more
// to do, everything's saved. Netball's runner had it; touch and league
// runners finished their games with no sign they could stop (UX round 2,
// 24 Oct 2026). Every sport's runner page shows this one.

export function RunnerAllDone({ className = "" }: { className?: string }) {
  return (
    <div className={`text-center ${className}`} data-testid="runner-all-done">
      <p className="text-sm font-semibold text-ink">
        All done — thanks for running today&apos;s game!
      </p>
      <p className="mt-0.5 text-xs text-ink-dim">
        Everything&apos;s saved. You can close this tab.
      </p>
    </div>
  );
}
