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
  /**
   * Bumped by the parent on the pre-game → Q1 transition. Each new
   * value re-mounts the halo span (React key trick) so the
   * `siren-pulse-once` keyframe restarts from frame 0. Null on first
   * mount and any time the parent isn't celebrating — a fresh page
   * load mid-game (Q1 already running) does NOT pulse.
   *
   * Mirrors AFL's `Field.wakeUpKey` (P1.5-5 / commit 753c2a4).
   * Brand-aware: `--siren-pulse-from/-to` cascade from the
   * [data-brand] root means netball gets court-blue automatically,
   * AFL gets alarm-orange.
   */
  wakeUpKey?: number | null;
}

export function Court({
  attackThird,
  centreThird,
  defenceThird,
  overlay,
  wakeUpKey = null,
}: CourtProps) {
  return (
    // `overflow-hidden` moved to the inner wrapper below so the
    // wake-up halo can radiate beyond the court edge (its expanding
    // box-shadow would otherwise be clipped).
    //
    // Re-skin (design session 17 Oct 2026): the same logic as the AFL
    // oval — a saturated ground (court #2A74A8, centre third #2F7AAF)
    // with white 2px markings at 70%, so the white tokens pop and read
    // as players standing on a court rather than stickers on a wash.
    <div className="relative flex w-full flex-col rounded-lg bg-court shadow-[0_1px_2px_rgba(26,30,26,0.08)]">
      {/* Q1-kickoff wake-up halo. Mirrors AFL `Field.tsx` (P1.5-5).
          The re-keyed span unmounts + remounts on each new
          wakeUpKey, restarting `siren-pulse-once` from frame 0.
          `--siren-pulse-r` is bumped to 40px so the halo radiates
          further than the standard chip/wordmark beat — the court
          is a larger surface and deserves a more dramatic moment. */}
      {wakeUpKey !== null && (
        <span
          key={wakeUpKey}
          aria-hidden="true"
          className="siren-pulse-once pointer-events-none absolute inset-0 rounded-lg"
          style={
            {
              "--siren-pulse-r": "40px",
            } as React.CSSProperties
          }
        />
      )}
      <div className="relative overflow-hidden rounded-lg">
        {/* Court aspect: 3:5 width-to-height (600px tall at 390, thirds
            of 200). Closer to a real netball court's 2:1 than 2:3 was,
            and gives the centre third room for WA / C / WD. */}
        <div className="relative aspect-[3/5]">
          {/* Markings sit under the tokens. */}
          {/* Centre third fill. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 h-1/3 bg-court-mid" />
          {/* Boundary, inset 8. */}
          <div aria-hidden className="pointer-events-none absolute inset-2 rounded-sm border-2 border-court-line" />
          {/* Third lines. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/3 h-0.5 -translate-y-px bg-court-line" />
          <div aria-hidden className="pointer-events-none absolute inset-x-2 top-2/3 h-0.5 -translate-y-px bg-court-line" />
          {/* Attack goal circle — top semicircle */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-2 h-[88px] w-44 -translate-x-1/2 rounded-b-full border-2 border-t-0 border-court-line bg-white/[0.06]"
          />
          {/* Defence goal circle — bottom semicircle */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-2 left-1/2 h-[88px] w-44 -translate-x-1/2 rounded-t-full border-2 border-b-0 border-court-line bg-white/[0.06]"
          />
          {/* Centre circle */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-court-line"
          />
          <div className="absolute inset-0 flex flex-col">
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
          </div>
          {overlay}
        </div>
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
  // Thirds are 33.333% of court height each. Tokens within a third
  // stack vertically (flex-col) so reading order down the court is
  // GS → GA → WA → C → WD → GD → GK. The caller places each token in
  // one of three lanes (16 / centred / 16 from the right).
  //
  // pt-4 reserves vertical space for the third's label so the first
  // token in each band clears it.
  return (
    <div className="relative flex h-1/3 w-full flex-col items-stretch justify-around pb-1 pt-4">
      {/* White mono micro-caps (5.1:1 on the court). */}
      <span
        className={`pointer-events-none absolute right-5 font-mono text-nano font-bold uppercase tracking-micro text-white ${
          kind === "attack" ? "top-5" : "top-3"
        }`}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
