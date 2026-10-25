"use client";

// Game settings at the period break (handoff §2.2): the bottom sheet
// behind the status chip. It holds what the break's "Game settings" card
// used to — players on the field, lent and injured kids (and bringing
// them back), a kid who's turned up, a kid who has to leave — for every
// sport. A section shows when the sport hands over its handler; the
// pickers are the shared SlotFillSheet and InjuryReplacementModal.

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { SFButton } from "@/components/sf";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import type { Player } from "@/lib/types";

export interface BreakPlayer {
  id: string;
  name: string;
  jerseyNumber?: string | number | null;
}

export interface BreakSettingsProps {
  /** Players on the field this game. Absent: not changed at this sport's break. */
  size?: {
    value: number;
    options: number[];
    defaultValue: number;
    /** "Players on field" / "Players on court". */
    word: string;
    onChange: (n: number) => void;
    pending?: boolean;
    error?: string | null;
  };
  injured: {
    players: BreakPlayer[];
    candidates: BreakPlayer[];
    onToggle: (playerId: string, injured: boolean) => void;
  };
  lent?: {
    players: BreakPlayer[];
    candidates: BreakPlayer[];
    onToggle: (playerId: string, lent: boolean) => void;
  };
  arrived?: {
    candidates: BreakPlayer[];
    onAdd: (playerId: string) => void;
  };
  markOut?: {
    /** Kids on the field in the staged lineup. */
    candidates: BreakPlayer[];
    /** Bench kids who could come on, least played first. */
    replacements: InjuryReplacementCandidate[];
    /** Where the kid plays in the staged lineup ("FWD", "GS"); null on the bench. */
    spotLabel: (playerId: string) => string | null;
    player: (playerId: string) => Player | undefined;
    onOut: (playerId: string, replacementId: string | null) => void;
  };
  pending?: boolean;
  error?: string | null;
}

interface Props extends BreakSettingsProps {
  onClose: () => void;
}

const chipButton =
  "inline-flex min-h-[44px] items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-3 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60";

export function BreakSettingsSheet({ size, injured, lent, arrived, markOut, pending, error, onClose }: Props) {
  const [picker, setPicker] = useState<"lend" | "injure" | "arrive" | "out" | null>(null);
  const [outFor, setOutFor] = useState<{ playerId: string; spot: string } | null>(null);

  const pick = (candidates: BreakPlayer[]) =>
    candidates.map((p) => ({ id: p.id, name: p.name, jerseyNumber: p.jerseyNumber }));

  return (
    <Modal placement="sheet" label="Game settings" onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">Game settings</h2>
        <SFButton variant="ghost" size="sm" onClick={onClose}>
          Done
        </SFButton>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-5 overflow-y-auto">
        {size && (
          <div>
            <label htmlFor="break-on-field-size" className="block text-xs font-semibold text-ink">
              {size.word}
            </label>
            <select
              id="break-on-field-size"
              value={size.value}
              onChange={(e) => size.onChange(parseInt(e.target.value, 10))}
              disabled={size.pending || pending}
              className="mt-1 min-h-[44px] rounded-md border border-hairline bg-surface px-2 text-sm text-ink shadow-card focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-surface-alt"
            >
              {size.options.map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === size.defaultValue ? " (default)" : ""}
                </option>
              ))}
            </select>
            {size.error && (
              <p className="mt-1 text-xs text-danger" role="alert">
                {size.error}
              </p>
            )}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-ink">Injured / left early</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            Injured players sit out for the rest of the game until you bring them back.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {injured.players.map((p) => (
              <span
                key={p.id}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-danger/50 bg-danger/10 pl-3 text-xs font-medium text-danger"
              >
                {p.jerseyNumber != null && <span className="tabular-nums font-semibold">{p.jerseyNumber}</span>}
                <span>{p.name}</span>
                <button
                  type="button"
                  onClick={() => injured.onToggle(p.id, false)}
                  disabled={pending}
                  aria-label={`Mark ${p.name} fit`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-danger/80 hover:bg-danger/15 disabled:opacity-60"
                >
                  ×
                </button>
              </span>
            ))}
            <button type="button" onClick={() => setPicker("injure")} disabled={pending} className={chipButton}>
              <span aria-hidden>+</span>
              Mark injured
            </button>
          </div>
        </div>

        {lent && (
          <div>
            <p className="text-xs font-semibold text-ink">Lend a player</p>
            <p className="mt-0.5 text-xs text-ink-dim">
              Lent players sit out for the rest of the game until you bring them back.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {lent.players.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-warn/50 bg-warn-soft pl-3 text-xs font-medium text-ink"
                >
                  {p.jerseyNumber != null && <span className="tabular-nums font-semibold">{p.jerseyNumber}</span>}
                  <span>{p.name}</span>
                  <button
                    type="button"
                    data-testid={`break-recall-lent-${p.id}`}
                    onClick={() => lent.onToggle(p.id, false)}
                    disabled={pending}
                    aria-label={`Bring ${p.name} back`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-ink-dim hover:bg-warn/15 disabled:opacity-60"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => setPicker("lend")} disabled={pending} className={chipButton}>
                <span aria-hidden>+</span>
                Lend a player
              </button>
            </div>
          </div>
        )}

        {(arrived || markOut) && (
          <div>
            <p className="text-xs font-semibold text-ink">Manage availability</p>
            <p className="mt-0.5 text-xs text-ink-dim">
              Add a player who turned up at the break, or take one out of the game (a replacement comes on so the
              spot stays full).
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {arrived && (
                <button type="button" onClick={() => setPicker("arrive")} disabled={pending} className={chipButton}>
                  <span aria-hidden>+</span>
                  Add arrived player
                </button>
              )}
              {markOut && (
                <button type="button" onClick={() => setPicker("out")} disabled={pending} className={chipButton}>
                  <span aria-hidden>+</span>
                  Mark a player out
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {picker === "injure" && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark injured"
          subtitle="Pick a player to mark as injured / leaving early. Tap their chip to bring them back."
          emptyMessage="Everyone is already injured or lent."
          candidates={pick(injured.candidates)}
          onPick={(id) => {
            setPicker(null);
            injured.onToggle(id, true);
          }}
          onCancel={() => setPicker(null)}
          // Settings pickers: a stray tap just closes, nothing is lost.
          dismissOnBackdrop
        />
      )}
      {picker === "lend" && lent && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Lend"
          subtitle="Pick a player to lend to the opposition for the rest of the game. Tap their chip to bring them back."
          emptyMessage="Everyone is already lent or injured."
          candidates={pick(lent.candidates)}
          onPick={(id) => {
            setPicker(null);
            lent.onToggle(id, true);
          }}
          onCancel={() => setPicker(null)}
          // Settings pickers: a stray tap just closes, nothing is lost.
          dismissOnBackdrop
        />
      )}
      {picker === "arrive" && arrived && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Add arrived"
          subtitle="Pick a squad member who's turned up at the break. They'll join the bench and the next period can work them in."
          emptyMessage="Everyone in the squad is already in the game."
          candidates={pick(arrived.candidates)}
          onPick={(id) => {
            setPicker(null);
            arrived.onAdd(id);
          }}
          onCancel={() => setPicker(null)}
          // Settings pickers: a stray tap just closes, nothing is lost.
          dismissOnBackdrop
        />
      )}
      {picker === "out" && markOut && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark out"
          subtitle="Pick the on-field player who has to leave. A bench player comes on so the spot stays full."
          emptyMessage="No on-field players to take out."
          candidates={pick(markOut.candidates)}
          onPick={(id) => {
            setPicker(null);
            const spot = markOut.spotLabel(id);
            if (spot && markOut.replacements.length > 0) setOutFor({ playerId: id, spot });
            else markOut.onOut(id, null);
          }}
          onCancel={() => setPicker(null)}
          // Settings pickers: a stray tap just closes, nothing is lost.
          dismissOnBackdrop
        />
      )}
      {outFor &&
        markOut &&
        (() => {
          const out = markOut.player(outFor.playerId);
          if (!out) return null;
          return (
            <InjuryReplacementModal
              injuredPlayer={out}
              spotLabel={outFor.spot}
              candidates={markOut.replacements}
              onPickReplacement={(rid) => {
                setOutFor(null);
                markOut.onOut(outFor.playerId, rid);
              }}
              onSkipReplacement={() => {
                setOutFor(null);
                markOut.onOut(outFor.playerId, null);
              }}
              onCancel={() => setOutFor(null)}
            />
          );
        })()}
    </Modal>
  );
}
