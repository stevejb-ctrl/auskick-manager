// The playing surface under the live tiles, in every sport: a grass field
// or a court, from the field / court tokens, with the same hairline lift.
//
// One place so the sports can't drift (design review, Oct 2026: rugby
// league painted its field with raw Tailwind emerald-700, a different
// green from AFL's, soccer's and touch's, outside the token system).
export type SurfaceKind = "field" | "court";

export function sportSurface(kind: SurfaceKind): string {
  return `${kind === "court" ? "bg-court" : "bg-field"} shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]`;
}

/** A count or label chip that sits on the surface (league's "11 / 11"). */
export const ON_SURFACE_CHIP = "bg-black/25 text-white";
