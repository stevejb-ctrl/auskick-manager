"use client";

import { SFButton } from "@/components/sf";
import { Modal } from "@/components/ui/Modal";
import { shortSideNote, type ShortSide } from "@/lib/live/shortSide";

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
   * The period's name in full, over the abbreviation: the period
   * break's "Q3" or "2nd half" (lib/sports/break.ts).
   */
  periodName?: string;
  /**
   * What the coach waits for before starting the clock, from the
   * sport's config (`words.startCue`): AFL's "siren goes", netball's
   * "umpire calls play". No default: league was told to wait for a
   * siren it doesn't have.
   */
  cue: string;
  /**
   * Rules the lineup breaks (the period break). Any at all turns this
   * into "Start with N rules broken?": Start anyway, or Fix first (back
   * to the lineup). Never a block.
   */
  brokenRules?: string[];
  /** Rise from the bottom as a sheet (the period break) rather than centre. */
  sheet?: boolean;
  /**
   * Kickoff's side: fewer on than the side's size reads "Playing 6 of
   * 7" (more firmly under the age group's minimum). Never a block.
   */
  shortSide?: ShortSide;
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
  periodName,
  cue,
  brokenRules = [],
  sheet = false,
  shortSide,
}: StartQuarterModalProps) {
  const name = periodName ?? `${periodLabel.charAt(0).toUpperCase()}${quarter}`;
  const broken = brokenRules.length;
  const short = shortSide ? shortSideNote(shortSide) : null;
  return (
    <Modal placement={sheet ? "sheet" : "center"} label={broken ? `Start with ${broken} broken` : `Start ${name}`}>
      {/* The action keeps its name through the whole flow (UI polish
          audit §15): the button that opened this modal says "Start
          Q{n}" and the primary here used to rename itself to "Start
          clock". Now it's "Start Q{n} now" — same action name, and
          "now" is the moment ("tap when the siren goes"), rhyming
          with the clock menu's "End Q{n} now". The suffix also keeps
          the accessible name unique against the CTA behind the
          scrim. */}
      <h2 className="text-center text-lg font-bold text-ink">
        {broken ? `Start with ${broken} rule${broken === 1 ? "" : "s"} broken?` : `Start ${name}`}
      </h2>
      {broken > 0 && (
        <ul className="mt-2 space-y-1 text-center text-sm font-semibold text-danger">
          {brokenRules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {short && (
        <p
          className={`mt-2 text-center text-sm font-semibold ${short.belowMin ? "text-danger" : "text-warn"}`}
          data-testid="short-side"
        >
          {short.text}
        </p>
      )}
      <p className="mt-1 text-center text-sm text-ink-dim">
        Tap when the {cue} — the clock starts then.
      </p>
      <div className="mt-4 space-y-2">
        <SFButton variant="accent" size="lg" full onClick={onStart} loading={loading}>
          {broken ? "Start anyway" : `Start ${name} now`}
        </SFButton>
        {onCancel && (
          <SFButton variant="ghost" size="md" full onClick={onCancel} disabled={loading}>
            {broken ? "Fix first" : "Back to lineup"}
          </SFButton>
        )}
      </div>
    </Modal>
  );
}
