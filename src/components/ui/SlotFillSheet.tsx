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
  /**
   * Optional override for the small instruction line under the
   * heading. Defaults to "Pick a player to place in the {slotLabel}
   * slot." Pass a custom string for non-positional uses (e.g. "Pick
   * a player to lend to the opposition.").
   */
  subtitle?: string;
  /**
   * Optional override for the empty-state message. Defaults to
   * "Nobody available — every player is already on field." Pass a
   * custom string when the default doesn't fit (e.g. "Everyone is
   * already lent or injured.").
   */
  emptyMessage?: string;
  /**
   * Whether tapping the dimmed backdrop calls `onCancel`. Default
   * `true` — matches the natural-feeling bottom-sheet behaviour
   * for slot-filling flows. Set `false` when an accidental tap-
   * outside would lose substantive state — e.g. the score-
   * attribution picker on the live scorebug, where dismissing
   * silently when the coach taps the next +G chip caused the
   * goal-attribution to vanish without feedback (Stagehand
   * exploration 2026-05-09). The X/Cancel button remains the
   * only dismissal path in that mode.
   */
  dismissOnBackdrop?: boolean;
  /**
   * Optional non-player option rendered as a row above the player
   * list. Used by the score-attribution picker for AFL rushed
   * behinds — the ball deflects through off the opposition and the
   * behind counts for our team but has no scorer. The handler is
   * separate from `onPick` so the caller doesn't have to magic-
   * string a sentinel id.
   */
  extraOption?: {
    label: string;
    subLabel?: string;
    onSelect: () => void;
  };
}

export function SlotFillSheet({
  slotLabel,
  candidates,
  onPick,
  onCancel,
  titleVerb = "Fill",
  subtitle,
  emptyMessage,
  dismissOnBackdrop = true,
  extraOption,
}: Props) {
  return (
    <div
      // z-60 (one step above Modal's z-50) because SlotFillSheet is
      // the player-picker that frequently opens FROM INSIDE another
      // modal — most notably QuarterEndModal's embedded "+G/+B"
      // mini-scorebug, which fires this picker for scorer
      // attribution. With both at z-50 the tap routing was a
      // coin-flip and the modal backdrops visually overlapped,
      // making it look like Mike was "two modals deep" with a
      // stray-tap risk that could lose the goal. Bumping the
      // picker to z-60 means it always paints cleanly above any
      // underlying Modal, and the modal's own dimmed backdrop
      // stays visible underneath as context. Steve 2026-05-13
      // usability test (Mike B5).
      //
      // P0-5 (2026-05-15): the backdrop fades in (350ms) so the
      // dim arrives gracefully rather than slamming on. The inner
      // sheet has its own entrance animation below.
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/60 p-4 motion-safe:animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slot-fill-title"
      onClick={dismissOnBackdrop ? onCancel : undefined}
    >
      <div
        // Inner sheet entrance — mobile rides up from the bottom
        // edge (240ms, full sheet height); desktop pops in place
        // (200ms, scale 0.96 → 1 + fade). The two animations
        // share the same `ease-out-quart` curve so the bottom-
        // anchored mobile sheet and centered desktop sheet read
        // as the same component with the right geometry for each
        // form factor. P0-5 in
        // .planning/MICRO-INTERACTIONS-PLAN.md.
        className="w-full max-w-md rounded-t-lg sm:rounded-lg border border-hairline bg-surface shadow-modal motion-safe:animate-sheet-up-mobile sm:motion-safe:animate-pop-in"
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
            {subtitle ?? `Pick a player to place in the ${slotLabel} slot.`}
          </p>
        </div>

        {extraOption && (
          <button
            type="button"
            onClick={extraOption.onSelect}
            className="flex w-full items-center gap-3 border-b border-hairline bg-surface-alt px-5 py-3 text-left text-sm hover:bg-surface"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute"
            >
              —
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">
                {extraOption.label}
              </span>
              {extraOption.subLabel && (
                <span className="block truncate text-[11px] text-ink-mute">
                  {extraOption.subLabel}
                </span>
              )}
            </span>
          </button>
        )}

        {candidates.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mute">
            {emptyMessage ?? "Nobody available — every player is already on field."}
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
