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
//
// Re-skin (design session 17 Oct 2026): ink 700 label on the well
// fill — the chips are the scorebug's actions, so they read as
// buttons rather than greyed hints.
export const SCORE_CHIP =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center " +
  "rounded-md bg-well px-3 py-2 font-mono text-sm font-bold text-ink " +
  "transition-colors duration-fast ease-out-quart " +
  "hover:bg-hairline " +
  "active:bg-brand-200 active:text-brand-700 " +
  "disabled:pointer-events-none disabled:opacity-60";
