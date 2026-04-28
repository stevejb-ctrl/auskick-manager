"use client";

// ─── Netball Court ───────────────────────────────────────────
// Rectangular court drawn as an SVG-free CSS layout so it scales
// cleanly on phones. Three thirds stacked vertically (attack /
// centre / defence) with a semicircular goal circle at either end.
// Position tokens are rendered by caller in their primary third.
//
// Palette is sky-* (Tailwind) — netball courts in Australia are
// almost universally painted blue, so the colour cue matches what a
// coach physically sees on a Saturday morning.

import type { ReactNode } from "react";

interface CourtProps {
  /** Tokens rendered in the attack third (GS, GA). */
  attackThird: ReactNode;
  /** Tokens rendered in the centre third (WA, C, WD). */
  centreThird: ReactNode;
  /** Tokens rendered in the defence third (GD, GK). */
  defenceThird: ReactNode;
  /** Optional overlay (e.g. "Q1 break" modal). */
  overlay?: ReactNode;
}

export function Court({ attackThird, centreThird, defenceThird, overlay }: CourtProps) {
  return (
    <div className="relative flex w-full flex-col rounded-lg border border-sky-300 bg-sky-50 shadow-sm overflow-hidden">
      {/* Court aspect: 3:5 width-to-height. Closer to a real netball
          court's 2:1 (30.5m × 15.25m) than the previous 2:3 was, and
          gives each band enough vertical breathing room to fit 3
          tokens (centre band: WA / C / WD) without overflowing into
          the next band and covering the DEFENCE / CENTRE labels. */}
      <div className="relative aspect-[3/5]">
        {/* Attack third */}
        <ThirdRow kind="attack" label="Attack">
          {attackThird}
        </ThirdRow>
        {/* Centre third */}
        <ThirdRow kind="centre" label="Centre">
          {centreThird}
        </ThirdRow>
        {/* Defence third */}
        <ThirdRow kind="defence" label="Defence">
          {defenceThird}
        </ThirdRow>
        {/* Centre circle */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-700/60"
        />
        {/* Attack goal circle — top semicircle */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-20 w-40 -translate-x-1/2 rounded-b-full border-2 border-b-2 border-t-0 border-sky-700/60 bg-sky-100/40"
        />
        {/* Defence goal circle — bottom semicircle */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-20 w-40 -translate-x-1/2 rounded-t-full border-2 border-b-0 border-t-2 border-sky-700/60 bg-sky-100/40"
        />
        {overlay}
      </div>
    </div>
  );
}

function ThirdRow({
  kind,
  label,
  children,
}: {
  kind: "attack" | "centre" | "defence";
  label: string;
  children: ReactNode;
}) {
  const bg =
    kind === "attack"
      ? "bg-sky-50"
      : kind === "centre"
      ? "bg-sky-100/70"
      : "bg-sky-50";
  // Thirds are 33.333% of court height each. Tokens within a third
  // stack vertically (flex-col) so reading order down the court is
  // GS → GA → WA → C → WD → GD → GK. The caller is responsible for
  // adding the per-token horizontal stagger.
  //
  // pt-4 reserves vertical space for the absolute-positioned ATTACK /
  // CENTRE / DEFENCE label so the first token in each band can't
  // overlap it. pb-1 keeps the band tight at the bottom. Combined
  // with the taller aspect ratio (3:5) this leaves room for the
  // centre band's three tokens (WA / C / WD) without overflow.
  return (
    <div
      className={`relative flex h-1/3 w-full flex-col items-stretch justify-around border-b-2 border-sky-700/60 last:border-b-0 px-2 pt-4 pb-1 ${bg}`}
    >
      <span className="pointer-events-none absolute right-2 top-1 text-[10px] font-semibold uppercase tracking-wider text-sky-800/70">
        {label}
      </span>
      {children}
    </div>
  );
}
