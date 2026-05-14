"use client";

import { useState, useTransition } from "react";
import { removeFillIn } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { PulseDot } from "@/components/ui/PulseDot";
import type { LiveAuth } from "@/lib/types";

interface FillInRowProps {
  auth: LiveAuth;
  gameId: string;
  fillInId: string;
  fullName: string;
  jerseyNumber: number | null;
  canEdit: boolean;
}

// 200ms — long enough to see the collapse, short enough not to
// delay the consequence of "Remove" pointlessly. Tied to the
// duration-base token in Tailwind via the className below.
const REMOVE_ANIMATION_MS = 200;

export function FillInRow({
  auth,
  gameId,
  fillInId,
  fullName,
  jerseyNumber,
  canEdit,
}: FillInRowProps) {
  const [isPending, startTransition] = useTransition();
  // P1-4 in MICRO-INTERACTIONS-PLAN.md: row fades + collapses
  // height to 0 over 200ms BEFORE the server action runs. After
  // the action lands, the parent's re-fetch drops this row from
  // the list and React unmounts the (now-zero-height) li cleanly.
  // The grid-template-rows trick (1fr → 0fr + inner overflow-
  // hidden) is the only CSS-only way to animate height: auto.
  const [removing, setRemoving] = useState(false);

  function handleRemove() {
    if (!canEdit || isPending || removing) return;

    // Reduced-motion users skip the collapse animation entirely
    // — fire the server action immediately, the row unmounts on
    // re-fetch. (The animation is decorative, not informational.)
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      startTransition(async () => {
        await removeFillIn(auth, gameId, fillInId);
      });
      return;
    }

    setRemoving(true);
    // Wait for the collapse animation, THEN fire the action. If
    // the action fails the parent's re-fetch will surface the
    // row again, so we don't need a manual rollback of `removing`
    // — but reset defensively in case the action throws and the
    // catch doesn't surface (would leave the row collapsed in
    // perpetuity for this session).
    setTimeout(() => {
      startTransition(async () => {
        try {
          await removeFillIn(auth, gameId, fillInId);
        } catch {
          setRemoving(false);
        }
      });
    }, REMOVE_ANIMATION_MS);
  }

  return (
    <li
      // Slide-in on mount: every FillInRow that mounts animates in.
      // First page load with N pre-existing fill-ins shows them
      // all sliding in together over 220ms — bounded enough not
      // to feel chaotic for a typical list of 0-3 fill-ins. The
      // common case (one fill-in just added) animates only the
      // new row because React reuses the existing nodes via key
      // matching. P1-3 in MICRO-INTERACTIONS-PLAN.md.
      //
      // Collapse on remove: the grid wrapper animates
      // grid-template-rows 1fr → 0fr, the inner div uses
      // overflow-hidden to clip the content as it collapses.
      // Pure CSS animation of `height: auto` isn't possible;
      // this is the canonical workaround.
      className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-base ease-out-quart motion-safe:animate-slide-in-right"
      style={{
        gridTemplateRows: removing ? "0fr" : "1fr",
        opacity: removing ? 0 : 1,
      }}
      aria-hidden={removing}
    >
      <div className="overflow-hidden">
        <div className="flex items-center justify-between bg-warn-soft/40 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Jersey-number chip — hidden when no number is set, which is
                the netball case (no numbers in netball) and also the AFL
                case where a fill-in arrived without one. Mirrors the same
                null-guard already in AvailabilityRow. */}
            {jerseyNumber != null && (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-warn-soft text-xs font-semibold text-warn tabular-nums">
                {jerseyNumber}
              </span>
            )}
            <span className="text-sm font-medium text-ink">{fullName}</span>
            <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-micro text-warn">
              Fill-in
            </span>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isPending || removing}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:border-danger/30 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
            >
              {(isPending || removing) && <PulseDot size="sm" />}
              {removing
                ? "Removing…"
                : isPending
                  ? "Removing…"
                  : "Remove"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
