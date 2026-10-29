// The score chips beside each team's score — AFL's +G / +B, netball's
// +G, league and union's +T / +C / +PG / +DG — in every sport.
//
// One token so they can't drift apart (there were three copies). Each
// chip is a 44 × 44 pt target at least: union shows four per side and a
// coach's tap meant for +T landed between it and +PG when they were
// 36 px tall (Stagehand union game day, 16 Oct 2026).
//
// Press (design session 17 Oct 2026): 80ms to scale .94 on the
// hairline fill, springing back on the ease-snap curve — confirms the
// chip registered before the picker mounts.
//
// Re-skin (design session 17 Oct 2026): ink 700 label on the well
// fill — the chips are the scorebug's actions, so they read as
// buttons rather than greyed hints.
//
// Padding in px (UX round 3, e4): the label grows with large text, the
// padding doesn't, so union's four chips a side still fit at 200%.
const SCORE_CHIP_SHAPE =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center " +
  "rounded-md px-[12px] py-[8px] font-mono text-sm font-bold " +
  "transition-[background-color,transform] duration-tap ease-out-quart " +
  "motion-safe:active:scale-[0.94] " +
  "disabled:pointer-events-none disabled:opacity-60";

/** The neutral chip: the break's score editor, where both sides sit in one list. */
export const SCORE_CHIP =
  SCORE_CHIP_SHAPE + " bg-well text-ink hover:bg-hairline active:bg-hairline";

// Ours and theirs look different (design review, Oct 2026): four
// identical grey chips, told apart only by side, are the most-tapped
// controls in the app, and round 8's cold-link parents weren't sure
// which +G was theirs. Ours fill with the brand; theirs are outlined.
// Grey well on white also read as inactive in sunlight.
export const SCORE_CHIP_OURS =
  SCORE_CHIP_SHAPE + " bg-brand-600 text-warm shadow-card hover:bg-brand-700 active:bg-brand-800";
export const SCORE_CHIP_THEIRS =
  SCORE_CHIP_SHAPE + " border border-ink/30 bg-surface text-ink hover:bg-surface-alt active:bg-hairline";

// The team names above each scorebug total, in every sport. They wrap
// to a second line rather than truncate. The columns are bottom-aligned,
// so a wrapped name grows upward and the totals keep one baseline.
// Sans semibold in the team's own spelling, in rem so it grows with
// large text (design review, Oct 2026: 10 px spaced mono capitals were
// the slowest way to read "which side is mine").
export const SCORE_TEAM_NAME =
  "line-clamp-2 break-words text-[0.8125rem] font-semibold leading-tight text-ink bigtext:line-clamp-1";
