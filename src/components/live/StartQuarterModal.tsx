"use client";

import { SFButton } from "@/components/sf";
import { Modal } from "@/components/ui/Modal";

interface StartQuarterModalProps {
  quarter: number;
  loading?: boolean;
  onStart: () => void;
  /**
   * Optional Back/Cancel — dismisses the modal so the coach can adjust
   * the lineup before kickoff. The modal is hosted by the lineup
   * picker (Q1) or the quarter break, and the writes (lineup_set,
   * quarter_start, period_break_swap) only fire on `onStart`, so
   * dismissing changes nothing on the server.
   */
  onCancel?: () => void;
  /**
   * Period word — "quarter" (default, AFL/netball) or "half"
   * (RL U10–U12). First letter uppercased becomes the abbreviation
   * ("Q" or "H"). Matches `ManualEndQuarterConfirm`.
   */
  periodLabel?: "quarter" | "half" | "period";
  /**
   * What the coach waits for before starting the clock. AFL and
   * league: the siren. Netball passes "umpire calls play".
   */
  cue?: string;
}

/**
 * The one confirm between "Start Q{n}" on the lineup / break screen and
 * the clock running — shared by AFL, netball and rugby league (netball
 * used to fork its own copy). UX plan glossary: the action is "Start
 * Q{n}"; the old separate "Ready for Q{n}" step name is retired.
 */
export function StartQuarterModal({
  quarter,
  loading,
  onStart,
  onCancel,
  periodLabel = "quarter",
  cue = "siren goes",
}: StartQuarterModalProps) {
  const abbr = periodLabel.charAt(0).toUpperCase();
  return (
    <Modal>
      {/* The action keeps its name through the whole flow (UI polish
          audit §15): the button that opened this modal says "Start
          Q{n}" and the primary here used to rename itself to "Start
          clock". Now it's "Start Q{n} now" — same action name, and
          "now" is the moment ("tap when the siren goes"), rhyming
          with the clock menu's "End Q{n} now". The suffix also keeps
          the accessible name unique against the CTA behind the
          scrim. */}
      <h2 className="text-center text-lg font-bold text-ink">
        Start {abbr}{quarter}
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        Tap when the {cue} — the clock starts then.
      </p>
      <div className="mt-4 space-y-2">
        <SFButton variant="accent" size="lg" full onClick={onStart} loading={loading}>
          Start {abbr}{quarter} now
        </SFButton>
        {onCancel && (
          <SFButton variant="ghost" size="md" full onClick={onCancel} disabled={loading}>
            Back to lineup
          </SFButton>
        )}
      </div>
    </Modal>
  );
}
