"use client";

// ─── Vest plan UI primitives ─────────────────────────────────
// Two small pieces used by `LeagueLineupPicker` (and any future
// sibling picker that wants the same UX):
//
//   * `VestPlanPill` — one clickable chip showing a planned FR / DH
//     wearer for a single period. Empty state surfaces "Pick…" so
//     it reads as editable. Editing state shows a brand-coloured
//     ring.
//
//   * `VestPlanCandidatePicker` — inline expanding picker that
//     drops under the pill. Lists on-field players who haven't
//     already been used for ANY vest in another planned period
//     (any-vest-once rule — once you've worn FR in H1 you're out
//     of FR AND DH for H2) and aren't wearing the OTHER vest in
//     the same period.

import type { Player } from "@/lib/types";

interface VestPlanPillProps {
  vest: "fr" | "dh";
  /** Short label — "FR" or "DH". */
  label: string;
  playerName: string | null;
  isEditing: boolean;
  onToggle: () => void;
  /** Optional — disable the pill (e.g. period 1 in the formation
   *  picker, where FR/DH are set by long-press on the field
   *  instead). When true, the pill renders read-only. */
  readOnly?: boolean;
}

export function VestPlanPill({
  vest,
  label,
  playerName,
  isEditing,
  onToggle,
  readOnly = false,
}: VestPlanPillProps) {
  const tagBg
    = vest === "fr"
      ? "bg-warn/15 text-warn"
      : "bg-brand-600/15 text-brand-700";
  return (
    <button
      type="button"
      onClick={readOnly ? undefined : onToggle}
      disabled={readOnly}
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
        isEditing
          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500"
          : readOnly
            ? "cursor-default border-hairline bg-surface-alt"
            : "border-hairline bg-surface hover:border-brand-500/40 hover:bg-surface-alt"
      }`}
    >
      <span
        className={`rounded-sm px-1 font-mono text-[9px] font-bold uppercase tracking-micro ${tagBg}`}
      >
        {label}
      </span>
      <span className="min-w-0 truncate font-medium text-ink">
        {playerName ?? <span className="text-ink-mute italic">Pick…</span>}
      </span>
    </button>
  );
}

interface VestPlanCandidatePickerProps {
  vest: "fr" | "dh";
  currentPickId: string | null;
  /** On-field player ids — eligibility pool for the picker. */
  fieldIds: readonly string[];
  playerById: Map<string, Player>;
  /** Player ids ineligible for this slot (other-period dupes + same-period mutual exclusion). */
  excludeIds: Set<string>;
  /**
   * Per-player season vest tallies. When supplied, each candidate
   * row surfaces "FR 3 · DH 1" so the coach can see at a glance
   * who's worn what (and how often) before manually overriding
   * the auto-pick. Steve 2026-05-19.
   */
  seasonVestCounts?: Record<string, { fr: number; dh: number }>;
  onPick: (playerId: string) => void;
  onClear: () => void;
}

export function VestPlanCandidatePicker({
  vest,
  currentPickId,
  fieldIds,
  playerById,
  excludeIds,
  seasonVestCounts,
  onPick,
  onClear,
}: VestPlanCandidatePickerProps) {
  const candidates = fieldIds
    .filter((id) => !excludeIds.has(id))
    .map((id) => playerById.get(id))
    .filter((p): p is Player => Boolean(p));
  return (
    <div className="mt-2 rounded-md border border-hairline bg-surface-alt/60 p-2">
      {candidates.length === 0 ? (
        <p className="px-2 py-1 text-xs text-ink-mute">
          Nobody eligible — every other field player has already worn the{" "}
          {vest === "fr" ? "FR" : "DH"} vest this game.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {candidates.map((p) => {
            const isCurrent = p.id === currentPickId;
            const counts = seasonVestCounts?.[p.id];
            // Highlight the vest that matters for the slot being
            // edited — bold = this vest, faded = the other. Hidden
            // entirely if counts aren't supplied OR the player has
            // worn neither vest this season (clean slate).
            const showCounts
              = counts && (counts.fr > 0 || counts.dh > 0);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  className={`flex w-full flex-col items-stretch gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                    isCurrent
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-hairline bg-surface hover:border-brand-500/40"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {isCurrent && (
                      <span aria-hidden className="text-[10px]">
                        ✓
                      </span>
                    )}
                    <span className="min-w-0 truncate font-medium text-ink">
                      {p.full_name}
                    </span>
                  </span>
                  {showCounts && (
                    <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-micro text-ink-mute">
                      <span
                        className={
                          vest === "fr" ? "font-bold text-warn" : ""
                        }
                      >
                        FR {counts?.fr ?? 0}
                      </span>
                      <span aria-hidden>·</span>
                      <span
                        className={
                          vest === "dh"
                            ? "font-bold text-brand-700"
                            : ""
                        }
                      >
                        DH {counts?.dh ?? 0}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {currentPickId && (
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-ink-mute underline-offset-2 hover:text-ink hover:underline"
          >
            Clear pick
          </button>
        </div>
      )}
    </div>
  );
}
