"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SFButton } from "@/components/sf";
import {
  KEEPER_KEY,
  normaliseRole,
  outfieldModel,
  roleFromView,
  viewFromRole,
  type PlayerRole,
  type RoleModel,
  type RoleOption,
  type RoleView,
} from "@/lib/playbook/roles";
import type { ActionResult } from "@/lib/types";
import { useRadioGroup, type RadioProps } from "@/components/ui/useRadioGroup";

interface PlayerRoleSheetProps {
  playerName: string;
  model: RoleModel;
  initial: PlayerRole;
  onSave: (role: PlayerRole) => Promise<ActionResult>;
  onClose: () => void;
  /** The team, for the "Add a position" link where the team names its own. */
  teamId?: string;
}

function OptionChip({
  option,
  active,
  role,
  onClick,
  radio,
}: {
  option: RoleOption;
  active: boolean;
  role: "radio" | "checkbox";
  onClick: () => void;
  /** A radio's roving tabindex and arrow keys (useRadioGroup). */
  radio?: RadioProps;
}) {
  return (
    <button
      {...radio}
      type="button"
      role={role}
      aria-checked={active}
      aria-label={option.name !== option.label ? `${option.name} (${option.label})` : option.label}
      onClick={onClick}
      className={`min-h-[44px] min-w-[44px] rounded-md border px-3 font-mono text-xs font-bold transition-colors duration-fast ease-out-quart active:scale-95 ${
        active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-hairline bg-surface text-ink-dim hover:border-ink-mute"
      }`}
    >
      {option.label}
    </button>
  );
}

/**
 * What's picked in a group, in full: chips are abbreviations ("LHB"),
 * so the sheet spells them out ("Left half-back flank").
 */
function Picked({ keys, model, testId }: { keys: string[]; model: RoleModel; testId: string }) {
  const names = keys.map((k) => model.options.find((o) => o.key === k)?.name ?? k);
  return (
    <p className="mt-1 min-h-[1rem] text-xs text-ink-dim" data-testid={testId} aria-live="polite">
      {names.join(", ")}
    </p>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-dim">{hint}</p>
      </div>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

/**
 * A player's role for the season (UX plan §7.9 W3), in positive terms
 * only (Steve, 21 Oct 2026): the spots they play, their main spot, and
 * whether they play every minute. Options come from the team's role
 * model, so the same sheet serves AFL lines or positions, netball thirds
 * or bibs, rugby lines or positions, basketball lines or 1–5, and
 * the soccer family's goal and lines.
 */
export function PlayerRoleSheet({ playerName, model, initial, onSave, onClose, teamId }: PlayerRoleSheetProps) {
  // The soccer family asks about goal on its own (the keeper toggles,
  // on the stored role) and "Plays as" over the outfield lines.
  const lines = outfieldModel(model);
  const [view, setView] = useState<RoleView>(() => viewFromRole(initial, lines));
  const [keeperRole, setKeeperRole] = useState<PlayerRole>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const unitWord = model.unit === "line" ? "line" : "position";
  const keys = lines.options.map((o) => o.key);
  const gk = model.keeper ? KEEPER_KEY : null;

  function save() {
    setError(null);
    const role = model.keeper ? keeperAndLines() : roleFromView(view, model);
    startTransition(async () => {
      const res = await onSave(role);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  /** Goal from the keeper toggles, the lines from "Plays as". */
  function keeperAndLines(): PlayerRole {
    const out = roleFromView({ ...view, main: null }, lines);
    return normaliseRole(
      {
        home: keeperRole.home === KEEPER_KEY ? KEEPER_KEY : null,
        also: [],
        never: [...(keeperRole.never.includes(KEEPER_KEY) ? [KEEPER_KEY] : []), ...out.never],
        keepOn: keeperRole.keepOn,
        ...(out.plays ? { plays: out.plays } : {}),
      },
      model.options.map((o) => o.key),
    );
  }

  const togglePlay = (key: string) =>
    setView((v) => {
      const plays = v.plays.includes(key) ? v.plays.filter((k) => k !== key) : [...v.plays, key];
      const main = v.main && plays.length > 0 && !plays.includes(v.main) ? null : v.main;
      return { ...v, plays: keys.filter((k) => plays.includes(k)), main };
    });
  const mainChoices = model.options.filter((o) => view.plays.length === 0 || view.plays.includes(o.key));
  // Arrow keys choose a main spot; a tap on the chosen one still clears it.
  const mainRadio = useRadioGroup({
    values: mainChoices.map((o) => o.key),
    value: view.main,
    onChange: (key) => setView((v) => ({ ...v, main: key })),
  });
  const keepOn = model.keeper ? keeperRole.keepOn : view.keepOn;
  const setKeepOn = (on: boolean) =>
    model.keeper ? setKeeperRole((r) => ({ ...r, keepOn: on })) : setView((v) => ({ ...v, keepOn: on }));

  return (
    <Modal label={`Role for ${playerName}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{playerName}</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mr-2 -mt-2 min-h-[44px] min-w-[44px] text-ink-dim hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 space-y-4 overflow-y-auto">
        {model.keeper && gk && (
          <section className="space-y-3">
            <SwitchRow
              label="Takes a turn in goal"
              hint="Siren gives them a turn as keeper, like everyone else."
              checked={!keeperRole.never.includes(gk)}
              onChange={(on) =>
                setKeeperRole((r) => ({
                  ...r,
                  never: on ? r.never.filter((k) => k !== gk) : [gk],
                  home: on ? r.home : null,
                }))
              }
            />
            {model.home && (
              <SwitchRow
                label="Keen keeper"
                hint="Siren puts them in goal first."
                checked={keeperRole.home === gk}
                onChange={(on) =>
                  setKeeperRole((r) => ({
                    ...r,
                    home: on ? gk : null,
                    never: on ? r.never.filter((k) => k !== gk) : r.never,
                  }))
                }
              />
            )}
          </section>
        )}

        {lines.playsAs && lines.options.length > 0 && (
          <section>
            <p className="text-sm font-semibold text-ink">Plays as</p>
            <p className="text-xs text-ink-dim">
              Siren suggests them only here. Pick none and they play anywhere.
            </p>
            <div role="group" aria-label="Plays as" className="mt-1.5 flex flex-wrap gap-1.5">
              {lines.options.map((o) => (
                <OptionChip
                  key={o.key}
                  option={o}
                  role="checkbox"
                  active={view.plays.includes(o.key)}
                  onClick={() => togglePlay(o.key)}
                />
              ))}
            </div>
            <Picked keys={view.plays} model={lines} testId="role-picked-plays" />
            {view.restrictNote && view.plays.length > 0 && (
              <p className="mt-1 text-xs text-ink-dim" data-testid="role-restrict-note">
                Re-saving will keep them to these {unitWord}s.
              </p>
            )}
            {model.addPositions && teamId && (
              <Link
                href={`/teams/${teamId}/settings#positions`}
                className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-700 hover:underline"
              >
                + Add a position
              </Link>
            )}
          </section>
        )}

        {!model.keeper && model.home && model.options.length > 0 && (
          <section>
            <p className="text-sm font-semibold text-ink">Main {unitWord}</p>
            <div role="radiogroup" aria-label={`Main ${unitWord}`} className="mt-1.5 flex flex-wrap gap-1.5">
              {mainChoices.map((o) => (
                <OptionChip
                  key={o.key}
                  option={o}
                  role="radio"
                  radio={mainRadio.radioProps(o.key)}
                  active={view.main === o.key}
                  onClick={() => setView((v) => ({ ...v, main: v.main === o.key ? null : o.key }))}
                />
              ))}
            </div>
            <Picked keys={view.main ? [view.main] : []} model={model} testId="role-picked-main" />
          </section>
        )}

        <section className="border-t border-hairline pt-4">
          <SwitchRow
            label="Plays every minute"
            hint="Siren keeps them on as long as the rules allow, every game. For one game only, long-press them on the lineup."
            checked={keepOn}
            onChange={setKeepOn}
          />
        </section>
      </div>

      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}
      <div className="mt-5 flex flex-col gap-2">
        <SFButton variant="primary" size="md" loading={isPending} onClick={save}>
          Save role
        </SFButton>
        <SFButton variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
          Cancel
        </SFButton>
      </div>
    </Modal>
  );
}
