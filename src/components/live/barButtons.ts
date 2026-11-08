// ─── The live bar's buttons (live v3) ────────────────────────
// One set of button looks for everything that sits in the shell's bar:
// the score bar (ScoreBugFrame part="bar"), the sub-due bar ("MAKE ALL
// 3 SWAPS" / "PAIRS"), and the kid bar's row (+ GOAL, INJURED, MORE).
// One filled primary per bar; the rest outlined or plain text.

const BASE =
  "relative flex min-w-0 flex-col items-center justify-center gap-[3px] px-[4px] py-[4px] " +
  "font-display stretch-75 font-extrabold uppercase leading-none " +
  "transition-[background-color,transform] duration-tap ease-out-quart motion-safe:active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-60 short:min-h-[44px]";

/** The bar's size, and the kid bar's a size down so four fit. */
const SIZE = {
  lg: "min-h-[58px] rounded-[16px] text-[1.0625rem]",
  sm: "min-h-[48px] rounded-[14px] text-base",
} as const;

const TONE = {
  /** The bar's one filled primary: + GOAL. */
  primary: "bg-primary text-on-primary hover:bg-primary/90",
  /** The others: outlined on the chalk. */
  outlined: "bg-transparent text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] hover:bg-surface-alt",
  /** Act now (a sub that's due, Start Q1): hi-vis, ink on it. */
  hot: "bg-hivis text-hivis-ink hover:bg-hivis/90",
  /** Hurt: outlined, the word in blood. */
  hurt: "bg-transparent text-blood shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] hover:bg-surface-alt",
  /** Calm go (Let them rotate again): the oval, chalk on it. */
  oval: "bg-brand-600 text-mark hover:bg-brand-700",
} as const;

export function barButton(tone: keyof typeof TONE, size: keyof typeof SIZE = "lg"): string {
  return `${BASE} ${SIZE[size]} ${TONE[tone]}`;
}

export const BAR_PRIMARY = barButton("primary");
export const BAR_OUTLINED = barButton("outlined");

/** Theirs: text buttons, 44 px tall, underlined so they read as buttons. */
export const BAR_TEXT =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md font-display text-base font-extrabold text-ink-dim " +
  "underline decoration-hairline underline-offset-[3px] hover:bg-surface-alt disabled:pointer-events-none disabled:opacity-60";

/** A small line under a bar button's word ("who scored?", "edit one"). */
export const BAR_SMALL = "font-sans text-[0.6875rem] font-normal normal-case tracking-normal opacity-80 bigtext:hidden";
