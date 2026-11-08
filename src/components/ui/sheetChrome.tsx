// ─── The v3 bottom sheet's chrome ───────────────────────────────────
// One look for every sheet and dialog (Modal, ActionSheet,
// SlotFillSheet): chalk, a grab handle, 28 px top corners, rising from
// the bottom edge on a phone and centred with all four corners rounded
// from sm up. Shared so the three primitives can't drift.

/** The sheet card: chalk, rounded top on a phone, a long upward shadow. */
export const SHEET_CARD =
  "bg-sheet rounded-t-sheet shadow-sheet sm:rounded-sheet sm:shadow-modal";

/** The sheet's header label ("PICK A PLAYER"): small display caps. */
export const SHEET_EYEBROW =
  "font-display text-micro font-extrabold uppercase tracking-[0.14em] text-ink-mute";

/** The sheet's title: condensed display, as the v3 sheets set it. */
export const SHEET_TITLE =
  "font-display stretch-75 text-[1.375rem] font-black uppercase leading-[1.05] text-ink";

/** A choice row on the chalk: a white plate with a hairline inset. */
export const SHEET_OPTION =
  "flex min-h-[54px] w-full items-center gap-3 rounded-[15px] bg-surface px-3 py-2 text-left shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] transition-colors duration-fast ease-out-quart hover:bg-surface-alt active:bg-hairline";

/** The way out at the foot of a sheet: an outlined button. */
export const SHEET_CANCEL =
  "flex min-h-[48px] w-full items-center justify-center rounded-lg bg-transparent px-3 font-display stretch-85 text-base font-extrabold text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] transition-colors duration-fast ease-out-quart hover:bg-surface-alt active:bg-hairline";

/**
 * The grab handle at the top of a phone sheet. Decorative: the sheets
 * close on Cancel, Escape, or (where nothing is lost) a backdrop tap.
 */
export function SheetGrab() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-2 h-[5px] w-10 -translate-x-1/2 rounded-full bg-hairline sm:hidden"
    />
  );
}
