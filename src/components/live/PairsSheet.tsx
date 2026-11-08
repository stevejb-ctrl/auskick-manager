"use client";

// ─── PairsSheet ──────────────────────────────────────────────
// The planned sub, pair by pair (live v3, Steve 8 Nov 2026). It opens
// from the info line ("Next sub 2:10 · 3 swaps ›") and from the due bar's
// PAIRS. It's the swap card's open view on a bottom sheet, where it no
// longer pushes the field down:
//
//   NEXT SUB IN 2:10
//   3 SWAPS
//   ① BCK  Damian → Maeve  [Edited ↺]          Make
//   ② CEN  Felix  → Pierce                     Make
//   [ Make all 3 swaps now ]
//
// Tap a name to pick someone else for that side of the pair (who can come
// off in the line, who can come on from the bench); the pair is then
// "Edited", and its badge reverts it to Siren's pick. Make makes one pair;
// Make all makes them all and restarts the sub clock.
//
// Sport-agnostic: the sport gives the pairs, who else could take each
// side, and what each button does. The test ids are the swap card's
// (swap-pair-<i>-off / -on / -edited, swap-option-<id>,
// swapcard-apply-all) so the specs that edit a pair still find it.

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SHEET_CANCEL, SHEET_EYEBROW, SHEET_TITLE } from "@/components/ui/sheetChrome";
import { swapPairLabel } from "@/lib/live/liveChrome";
import { hapticSuccess } from "@/lib/haptics";

export interface SheetPair {
  /** The pair's place in the plan (its badge is index + 1). */
  index: number;
  offId: string;
  onId: string;
  /** Short names, as the tiles say them. */
  offName: string;
  onName: string;
  /** Whole names, for screen readers. */
  offFull: string;
  onFull: string;
  /** Where it happens, short ("BCK"). */
  where: string;
  /** Changed from Siren's pick. */
  edited: boolean;
}

export interface PairOption {
  id: string;
  name: string;
  /** Two letters for the chip ("ZQ"). */
  initials: string;
}

export interface PairsSheetProps {
  pairs: SheetPair[];
  /** The sub is due now. */
  due: boolean;
  /** ms to the next sub, for the eyebrow; null when it isn't counting. */
  msUntilDue: number | null;
  /** The period ends before the next sub: make it now or it carries to the break. */
  carry?: boolean;
  /** "Quarter", "Half". */
  periodWord?: string;
  /** Who else could take a side of pair `index`; omit to make the names plain. */
  options?: (index: number, side: "off" | "on") => PairOption[];
  /** "Take off instead (CENTRE)": the line the off side comes from. */
  offHeading?: (index: number) => string;
  onPick?: (index: number, side: "off" | "on", id: string) => void;
  onRevert?: (index: number) => void;
  onMakeOne?: (index: number) => void;
  onMakeAll: () => void;
  pending?: boolean;
  onClose: () => void;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function PairsSheet({
  pairs,
  due,
  msUntilDue,
  carry = false,
  periodWord = "Quarter",
  options,
  offHeading,
  onPick,
  onRevert,
  onMakeOne,
  onMakeAll,
  pending = false,
  onClose,
}: PairsSheetProps) {
  const titleId = useId();
  const [editing, setEditing] = useState<{ index: number; side: "off" | "on" } | null>(null);
  const canEdit = !!options && !!onPick;
  const eyebrow = due ? "Sub due" : msUntilDue !== null ? `Next sub in ${mmss(msUntilDue)}` : "Planned sub";
  const makeAllLabel = pairs.length === 1 ? "Make this swap" : `Make all ${pairs.length} swaps`;

  const nameButton = (p: SheetPair, side: "off" | "on") => {
    const isEditing = editing?.index === p.index && editing.side === side;
    return (
      <button
        type="button"
        data-testid={`swap-pair-${p.index}-${side}`}
        disabled={!canEdit}
        onClick={() => setEditing((cur) => (cur?.index === p.index && cur.side === side ? null : { index: p.index, side }))}
        aria-expanded={canEdit ? isEditing : undefined}
        aria-label={side === "off" ? `Change who comes off: ${p.offFull}` : `Change who goes on: ${p.onFull}`}
        className={`min-h-[44px] whitespace-nowrap rounded-[8px] px-[3px] font-display stretch-80 text-base font-extrabold text-ink ${
          canEdit ? "underline decoration-ink-mute decoration-dotted underline-offset-[3px] hover:bg-surface-alt" : ""
        } ${isEditing ? "bg-surface-alt" : ""}`}
      >
        {side === "off" ? p.offName : p.onName}
      </button>
    );
  };

  return (
    <Modal labelledBy={titleId} size="md" onClose={onClose} padding="px-[14px] pb-[12px] pt-[20px]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-[8px] flex-shrink-0">
          <p className={SHEET_EYEBROW}>{eyebrow}</p>
          <h2 id={titleId} className={SHEET_TITLE}>
            {plural(pairs.length, "swap")}
          </h2>
          {canEdit && (
            <p className="mt-[4px] text-[0.8125rem] text-ink-dim">
              Tap a name to change who. Siren picks whoever is owed time in each line.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {carry && (
            <p
              data-testid="swapcard-carry-hint"
              className="my-[6px] rounded-[12px] bg-hivis-soft px-[10px] py-[8px] text-[0.8125rem] text-ink"
            >
              <b>{periodWord} ending:</b> make these now or they carry to the break.
            </p>
          )}
          <ul className="flex flex-col gap-[6px]">
            {pairs.map((p) => {
              const opts = editing?.index === p.index && options ? options(p.index, editing.side) : [];
              return (
                <li
                  key={`${p.index}-${p.offId}`}
                  className={`rounded-[15px] bg-surface ${
                    due ? "shadow-[inset_0_0_0_2px_rgb(var(--c-hivis))]" : "shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-[8px] py-[6px] pl-[8px] pr-[6px]">
                    <span
                      aria-hidden
                      className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] font-display text-[0.875rem] font-black ${
                        due ? "bg-hivis text-hivis-ink" : "bg-primary text-on-primary"
                      }`}
                    >
                      {p.index + 1}
                    </span>
                    <span
                      data-testid={`swap-pair-${p.index}-where`}
                      className="flex-none rounded-[5px] bg-surface-alt px-[6px] py-[2px] font-display text-[0.625rem] font-extrabold tracking-[0.08em] text-ink"
                    >
                      {p.where}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-[2px]">
                      {nameButton(p, "off")}
                      <span aria-hidden className="text-ink-mute">
                        →
                      </span>
                      {nameButton(p, "on")}
                      {p.edited && onRevert && (
                        <button
                          type="button"
                          data-testid={`swap-pair-${p.index}-edited`}
                          onClick={() => {
                            setEditing(null);
                            onRevert(p.index);
                          }}
                          aria-label="Edited. Revert to Siren's pick"
                          className="ml-[4px] inline-flex min-h-[24px] items-center rounded-[7px] bg-primary px-[7px] font-display text-[0.6875rem] font-extrabold tracking-[0.04em] text-on-primary"
                        >
                          Edited ↺
                        </button>
                      )}
                    </span>
                    {onMakeOne && pairs.length > 1 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          void hapticSuccess();
                          onMakeOne(p.index);
                        }}
                        aria-label={swapPairLabel(p.offFull, p.onFull)}
                        className={`min-h-[44px] flex-none rounded-[11px] px-[11px] font-display text-[0.84375rem] font-extrabold disabled:opacity-30 ${
                          due ? "bg-hivis text-hivis-ink" : "bg-primary text-on-primary"
                        }`}
                      >
                        Make
                      </button>
                    )}
                  </div>
                  {editing?.index === p.index && (
                    <div className="border-t border-hairline px-[10px] py-[8px]">
                      <p className={`mb-[6px] ${SHEET_EYEBROW}`}>
                        {editing.side === "on" ? "Bring on instead" : offHeading ? offHeading(p.index) : "Take off instead"}
                      </p>
                      {opts.length === 0 ? (
                        <p className="text-[0.8125rem] text-ink-mute">No other option.</p>
                      ) : (
                        <div className="flex flex-wrap gap-[6px]">
                          {opts.map((o) => {
                            const chosen = editing.side === "on" ? p.onId === o.id : p.offId === o.id;
                            return (
                              <button
                                key={o.id}
                                type="button"
                                data-testid={`swap-option-${o.id}`}
                                onClick={() => {
                                  const side = editing.side;
                                  setEditing(null);
                                  onPick?.(p.index, side, o.id);
                                }}
                                className={`flex min-h-[44px] items-center gap-[6px] rounded-full px-[12px] text-[0.8125rem] font-semibold motion-safe:active:scale-[0.97] ${
                                  chosen ? "bg-brand-600 text-mark" : "bg-surface-alt text-ink hover:bg-hairline"
                                }`}
                              >
                                <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-ink/10 font-display text-[0.5625rem] font-black">
                                  {o.initials}
                                </span>
                                {o.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-[8px] flex flex-shrink-0 flex-col gap-[4px]">
          <button
            type="button"
            data-testid="swapcard-apply-all"
            disabled={pending || pairs.length === 0}
            onClick={() => {
              void hapticSuccess();
              onMakeAll();
            }}
            aria-label={makeAllLabel}
            className={`flex min-h-[54px] w-full flex-col items-start justify-center rounded-[15px] px-[12px] py-[8px] text-left disabled:opacity-60 ${
              due ? "bg-hivis text-hivis-ink" : "bg-primary text-on-primary"
            }`}
          >
            <span className="font-display stretch-85 text-[1.03125rem] font-extrabold leading-tight">
              {makeAllLabel}
              {due ? "" : " now"}
            </span>
            <span className="text-[0.75rem] opacity-85">
              {due ? "the sub clock restarts" : "early: the sub clock restarts from now"}
            </span>
          </button>
          <button type="button" onClick={onClose} className={SHEET_CANCEL}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
