"use client";

import { PulseMark } from "@/components/brand/PulseMark";
import { SFButton } from "@/components/sf";

// ─── SubDueBanner ─────────────────────────────────────────────
// "Sub due" in every sport: a strip inside the sticky LiveTopBar (its
// `banner` slot), so it stays on screen as the coach scrolls but never
// covers the field or the score chips. It was a modal until Steve's
// call on 16 Oct 2026: the modal sat over the chips, so a try scored
// as the sub fell due waited behind "Got it" (Stagehand union).
//
// The siren-red pulse is the brand's sub-due moment (see PulseMark).
// The suggested swaps themselves stay in each sport's sub card, which
// opens when the sub falls due.

interface SubDueBannerProps {
  onAcknowledge: () => void;
  /**
   * What to do, after "Sub due —". Touch and Oztag wait for the ball
   * (no interchange after a turnover until the next touch), so theirs is
   * "make the change next time you have the ball"; it wraps to a second
   * line on a phone.
   */
  hint?: string;
}

export function SubDueBanner({ onAcknowledge, hint = "rotate a player off" }: SubDueBannerProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-4xl items-center gap-3 border-t border-hairline px-3 py-1.5 motion-safe:animate-slide-in-bottom-fast"
    >
      <span className="shrink-0 text-alarm">
        <PulseMark size={16} pulsing />
      </span>
      <p className="min-w-0 flex-1 text-sm text-ink-dim">
        {/* Short enough for one line beside Got it on a 375 px phone. */}
        <strong className="font-semibold text-ink">Sub due</strong>
        {" — "}
        {hint}
      </p>
      <SFButton size="md" variant="ghost" onClick={onAcknowledge} className="shrink-0">
        Got it
      </SFButton>
    </div>
  );
}
