"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SFButton } from "@/components/sf";
import {
  newRule,
  ruleDef,
  ruleSentence,
  type LockedRule,
  type RuleDef,
  type RuleInstance,
  type RuleKind,
  type RuleStrength,
  type RuleWords,
} from "@/lib/playbook/rules";
import type { ActionResult } from "@/lib/types";

interface RulesEditorProps {
  locked: LockedRule[];
  catalogue: RuleDef[];
  words: RuleWords;
  players: { id: string; name: string }[];
  initial: RuleInstance[];
  /** Local rule packs the coach can add in one tap. */
  packs?: { id: string; title: string; blurb: string }[];
  disabled?: boolean;
  onSave: (rules: RuleInstance[]) => Promise<ActionResult>;
  onAddPack?: (packId: string) => Promise<ActionResult<{ rules: RuleInstance[] }>>;
}

const STRENGTHS: { id: RuleStrength; label: string }[] = [
  { id: "must", label: "Must" },
  { id: "prefer", label: "Prefer" },
];

/**
 * How we play › Rules (UX plan §7.9 W4). Locked rules first, with their
 * source; then the coach's own, each a sentence with its values, a
 * Must / Prefer strength and a remove. Changes save straight away.
 */
export function RulesEditor({
  locked,
  catalogue,
  words,
  players,
  initial,
  packs = [],
  disabled = false,
  onSave,
  onAddPack,
}: RulesEditorProps) {
  const [rules, setRules] = useState<RuleInstance[]>(initial);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const names = (ids: string[]) => {
    const list = ids.map((id) => nameOf.get(id) ?? "?");
    return list.length <= 2 ? list.join(" and ") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  };

  function commit(next: RuleInstance[]) {
    const previous = rules;
    setRules(next);
    setError(null);
    startTransition(async () => {
      const res = await onSave(next);
      if (!res.success) {
        setRules(previous);
        setError(res.error);
      }
    });
  }
  const update = (id: string, patch: Partial<RuleInstance>) =>
    commit(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addable = catalogue.filter((d) => d.repeatable || !rules.some((r) => r.kind === d.kind));
  const pickingRule = rules.find((r) => r.id === picking) ?? null;

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">Rules</p>
      <ul className="mt-2 space-y-2" aria-label="Rules">
        {locked.map((r) => (
          <li key={r.id} className="flex gap-2 rounded-md bg-surface-alt px-3 py-2 text-sm text-ink-dim">
            <span aria-hidden>🔒</span>
            <span className="min-w-0">
              {r.text}
              <span className="block text-[11px] text-ink-mute">{r.source}</span>
            </span>
          </li>
        ))}
        {rules.map((r) => {
          const def = ruleDef(r.kind);
          return (
            <li key={r.id} className="rounded-md border border-hairline px-3 py-2" data-testid={`rule-${r.kind}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm text-ink">{ruleSentence(r, words, names)}</p>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove rule: ${ruleSentence(r, words, names)}`}
                    className="-mr-2 -mt-1 min-h-[44px] min-w-[44px] shrink-0 text-ink-mute hover:text-danger"
                    onClick={() => commit(rules.filter((x) => x.id !== r.id))}
                  >
                    ✕
                  </button>
                )}
              </div>
              {r.source?.startsWith("pack:") && (
                <p className="text-[11px] text-ink-mute">Local rules (added by you)</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {def.countRange && (
                  <select
                    aria-label="How many"
                    disabled={disabled}
                    value={r.params.count}
                    onChange={(e) => update(r.id, { params: { ...r.params, count: Number(e.target.value) } })}
                    className="min-h-[44px] rounded-md border border-hairline bg-surface px-3 text-sm text-ink"
                  >
                    {Array.from(
                      { length: def.countRange[1] - def.countRange[0] + 1 },
                      (_, i) => def.countRange![0] + i,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
                {def.needsPlayers && !disabled && (
                  <SFButton variant="ghost" size="sm" onClick={() => setPicking(r.id)}>
                    {r.params.playerIds?.length ? "Change players" : "Choose players"}
                  </SFButton>
                )}
                <div className="ml-auto w-40">
                  <SegmentedControl
                    label="Strength"
                    options={STRENGTHS}
                    value={r.strength}
                    disabled={disabled}
                    onChange={(strength) => update(r.id, { strength })}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}

      {!disabled && (
        <div className="mt-3 flex flex-wrap gap-2">
          <SFButton variant="ghost" size="md" onClick={() => setAdding(true)} disabled={isPending}>
            + Add a rule
          </SFButton>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-mute">
        Must: Siren never breaks it. Prefer: Siren leans that way when it can.
      </p>

      {adding && (
        <Modal>
          <h2 className="text-lg font-bold text-ink">Add a rule</h2>
          <div className="mt-3 space-y-2" role="list">
            {addable.map((d) => (
              <button
                key={d.kind}
                type="button"
                role="listitem"
                className="flex min-h-[44px] w-full items-center rounded-md border border-hairline px-3 text-left text-sm text-ink hover:border-ink-mute active:bg-surface-alt"
                onClick={() => {
                  const rule = newRule(d.kind as RuleKind);
                  setAdding(false);
                  commit([...rules, rule]);
                  if (d.needsPlayers) setPicking(rule.id);
                }}
              >
                {d.title}
              </button>
            ))}
            {addable.length === 0 && <p className="text-sm text-ink-mute">Every rule is already on.</p>}
          </div>
          {packs.length > 0 && onAddPack && (
            <div className="mt-4 border-t border-hairline pt-3">
              <p className="text-sm font-semibold text-ink">Local rule packs</p>
              <p className="text-xs text-ink-mute">A few rules in one tap. Edit them after.</p>
              <div className="mt-2 space-y-2">
                {packs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex min-h-[44px] w-full flex-col items-start rounded-md border border-hairline px-3 py-2 text-left hover:border-ink-mute active:bg-surface-alt"
                    onClick={() => {
                      setAdding(false);
                      setError(null);
                      startTransition(async () => {
                        const res = await onAddPack(p.id);
                        if (!res.success) setError(res.error);
                        else if (res.data) setRules(res.data.rules);
                      });
                    }}
                  >
                    <span className="text-sm font-semibold text-ink">{p.title}</span>
                    <span className="text-xs text-ink-dim">{p.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5">
            <SFButton variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </SFButton>
          </div>
        </Modal>
      )}

      {pickingRule && (
        <PlayerPicker
          players={players}
          initial={pickingRule.params.playerIds ?? []}
          onCancel={() => setPicking(null)}
          onDone={(ids) => {
            setPicking(null);
            update(pickingRule.id, { params: { ...pickingRule.params, playerIds: ids } });
          }}
        />
      )}
    </div>
  );
}

function PlayerPicker({
  players,
  initial,
  onCancel,
  onDone,
}: {
  players: { id: string; name: string }[];
  initial: string[];
  onCancel: () => void;
  onDone: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  return (
    <Modal>
      <h2 className="text-lg font-bold text-ink">Choose players</h2>
      {players.length === 0 ? (
        <p className="mt-3 text-sm text-ink-mute">Add your squad first.</p>
      ) : (
        <div role="group" aria-label="Players" className="mt-3 flex max-h-[50vh] flex-wrap gap-1.5 overflow-y-auto">
          {players.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setPicked((x) => (on ? x.filter((i) => i !== p.id) : [...x, p.id]))}
                className={`min-h-[44px] rounded-md border px-3 text-sm transition-colors duration-fast ease-out-quart ${
                  on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-hairline bg-surface text-ink-dim"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <SFButton variant="primary" size="md" onClick={() => onDone(picked)}>
          Done
        </SFButton>
        <SFButton variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </SFButton>
      </div>
    </Modal>
  );
}
