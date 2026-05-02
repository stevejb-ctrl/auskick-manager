"use client";

// ─── Slot Fill Sheet ─────────────────────────────────────────
// Modal sheet that opens when a coach taps an empty slot in the
// lineup picker (pre-game OR quarter-break, AFL OR netball). Lists
// the candidates — usually bench / unassigned players — so the coach
// can place someone in one tap. Replaces the older two-tap path
// where the coach had to select a player first, then tap the empty
// slot.
//
// Keeps the same bottom-sheet-on-mobile / centered-on-desktop frame
// as PickReplacementSheet so the modal language stays consistent
// across surfaces.

interface Candidate {
  id: string;
  name: string;
  /** AFL squad number — rendered as a small chip if provided. */
  jerseyNumber?: string | number | null;
  /** Sub-label rendered under the name (e.g. "Last quarter: GA"). */
  subLabel?: string;
}

interface Props {
  /** Short label of the slot being filled — "FWD", "GA", "Bench". */
  slotLabel: string;
  /** Players the coach can pick from. Empty list → "no players" copy. */
  candidates: Candidate[];
  onPick: (playerId: string) => void;
  onCancel: () => void;
  /**
   * Optional title verb override. Defaults to "Fill". Useful for
   * surfaces that want a more specific verb ("Place", "Assign").
   */
  titleVerb?: string;
}

export function SlotFillSheet({
  slotLabel,
  candidates,
  onPick,
  onCancel,
  titleVerb = "Fill",
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slot-fill-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-lg sm:rounded-lg border border-hairline bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-hairline px-5 py-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">
            {titleVerb}
          </p>
          <h2
            id="slot-fill-title"
            className="text-base font-semibold text-ink"
          >
            {titleVerb} {slotLabel}
          </h2>
          <p className="mt-1 text-xs text-ink-mute">
            Pick a player to place in the {slotLabel} slot.
          </p>
        </div>

        {candidates.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mute">
            Nobody available — every player is already on field.
          </p>
        ) : (
          <ul className="max-h-72 divide-y divide-hairline overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c.id)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm text-ink hover:bg-surface-alt"
                >
                  {c.jerseyNumber != null && c.jerseyNumber !== "" && (
                    <span
                      aria-hidden="true"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-alt font-mono text-[11px] font-bold tabular-nums text-ink"
                    >
                      {c.jerseyNumber}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">
                      {c.name}
                    </span>
                    {c.subLabel && (
                      <span className="block truncate text-[11px] text-ink-mute">
                        {c.subLabel}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-alt"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
