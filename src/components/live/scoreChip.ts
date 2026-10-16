// The score chips beside each team's score — AFL's +G / +B, netball's
// +G, league and union's +T / +C / +PG / +DG — in every sport.
//
// One token so they can't drift apart (there were three copies). Each
// chip is a 44 × 44 pt target at least: union shows four per side and a
// coach's tap meant for +T landed between it and +PG when they were
// 36 px tall (Stagehand union game day, 16 Oct 2026).
//
// `active:bg-brand-200 active:text-brand-700` is the brief tap-down
// flash that confirms the chip registered before the picker mounts.
export const SCORE_CHIP =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center " +
  "rounded-md bg-surface-alt px-3 py-2 font-mono text-sm font-semibold text-ink-dim " +
  "transition-colors duration-fast ease-out-quart " +
  "hover:bg-hairline hover:text-ink " +
  "active:bg-brand-200 active:text-brand-700 " +
  "disabled:pointer-events-none disabled:opacity-60";
