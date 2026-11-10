// The field bands' (FieldBand) shared looks, for server and client
// components alike.

/** The band's primary action: hi-vis with ink words, as Start Q1 is. */
export const BAND_PRIMARY =
  "inline-flex h-12 items-center justify-center rounded-[14px] bg-hivis px-6 font-display text-[1.0625rem] font-extrabold stretch-80 text-hivis-ink transition-[background-color,transform] duration-fast ease-out-quart hover:bg-hivis/90 motion-safe:active:scale-[0.98]";

/** A quiet action on a band: chalk outline. */
export const BAND_SECONDARY =
  "inline-flex h-12 items-center justify-center rounded-[14px] px-6 font-display text-[1.0625rem] font-bold stretch-80 text-mark shadow-[inset_0_0_0_1.5px_rgb(247_250_245_/_0.45)] transition-colors duration-fast ease-out-quart hover:bg-mark/10";

/** The accent word in a heading on a band: sun, colour only. */
export const BAND_ACCENT = "#F6C445";
