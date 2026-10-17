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
    // box-shadow would otherwise be clipped). Outer div keeps the
    // rounded border / shadow so the visual chrome is unchanged.
    // Deeper court surface (UI polish audit §8): beside AFL's
    // saturated green field the sky-50 wash read as the B-side —
    // low-contrast pastel lines and white tokens on a near-white
    // court. Still netball blue, it just commits: sky-200/300 bands,
    // full-strength sky-700 lines, and the white tokens get the same
    // card-on-colour pop AFL's tiles enjoy.
    <div className="relative flex w-full flex-col rounded-lg border border-sky-400 bg-sky-200 shadow-card">
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
            className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-700"
          />
          {/* Attack goal circle — top semicircle */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-20 w-40 -translate-x-1/2 rounded-b-full border-2 border-b-2 border-t-0 border-sky-700 bg-sky-100/60"
          />
          {/* Defence goal circle — bottom semicircle */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-1/2 h-20 w-40 -translate-x-1/2 rounded-t-full border-2 border-b-0 border-t-2 border-sky-700 bg-sky-100/60"
          />
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
  const bg =
    kind === "attack"
      ? "bg-sky-200"
      : kind === "centre"
      ? "bg-sky-300/70"
      : "bg-sky-200";
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
      className={`relative flex h-1/3 w-full flex-col items-stretch justify-around border-b-2 border-sky-700 last:border-b-0 px-2 pt-4 pb-1 ${bg}`}
    >
      <span className="pointer-events-none absolute right-2 top-1 text-[10px] font-semibold uppercase tracking-wider text-sky-900/80">
        {label}
      </span>
      {children}
    </div>
  );
}
