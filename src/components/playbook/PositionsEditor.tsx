"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PositionsField } from "@/components/playbook/PositionsField";
import { SFButton } from "@/components/sf";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { saveTeamPositions } from "@/app/(app)/teams/[teamId]/settings/howWePlayActions";
import {
  resetToDefaults,
  sparsestLine,
  type DraftPosition,
} from "@/lib/playbook/positions";
import type { LineDef, PositionDef } from "@/lib/playbook/types";

interface PositionsEditorProps {
  initial: DraftPosition[];
  defaults: DraftPosition[];
  teamId: string;
  onFieldSize: number;
  maxPositions: number;
  /** The sport's lines, in display order (AFL F/C/B, rugby forwards/backs). */
  lines: LineDef[];
  /** Lays the draft out on the sport's field (the model's own layout). */
  layout: (list: Omit<PositionDef, "x" | "y">[]) => PositionDef[];
  /** The sport's full name for a standard label ("CHB" → "Centre half back"). */
  positionName: (label: string) => string;
  /** Which field to draw behind the spots. */
  field: "afl" | "rugby";
  disabled?: boolean;
}

/**
 * Name the team's positions on the field (UX plan §7.9 W2): AFL open
 * ages and rugby's named-position ages (Steve 2026-10-16). Tap a spot
 * to rename it (≤ 4 characters), give it a full name or move it to
 * another line; add or remove spots; reset to the sport's standard
 * list for the team's on-field size.
 */
export function PositionsEditor({
  initial,
  defaults,
  teamId,
  onFieldSize,
  maxPositions,
  lines,
  layout,
  positionName,
  field,
  disabled = false,
}: PositionsEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftPosition[]>(initial);
  const [saved, setSaved] = useState<DraftPosition[]>(initial);
  const [editing, setEditing] = useState<{ index: number; value: DraftPosition; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // "Positions saved." until the next change: a greyed-out button alone
  // left coaches unsure the save had worked.
  const [justSaved, setJustSaved] = useState(false);
  // Until the coach starts typing, a tap on the label selects it all.
  const labelTyped = useRef(false);
  const [nextId, setNextId] = useState(1);

  const laidOut = useMemo(() => layout(draft), [layout, draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const diff = draft.length - onFieldSize;

  function openNew() {
    const line = sparsestLine(draft, lines);
    setEditing({ index: draft.length, value: { key: `new-${nextId}`, label: "", name: "", line }, isNew: true });
    setNextId((n) => n + 1);
  }

  function commitEdit() {
    if (!editing) return;
    const label = editing.value.label.trim().toUpperCase();
    if (!label) return;
    const value = { ...editing.value, label, name: editing.value.name.trim() };
    setDraft((d) => {
      const next = [...d];
      if (editing.isNew) next.push(value);
      else next[editing.index] = value;
      return next;
    });
    setEditing(null);
  }

  function remove() {
    if (!editing || editing.isNew) return;
    setDraft((d) => d.filter((_, i) => i !== editing.index));
    setEditing(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveTeamPositions(
        teamId,
        draft.map((p) => ({ key: p.key, label: p.label, name: p.name, line: p.line })),
      );
      if (!res.success) {
        setError(res.error);
        return;
      }
      const ids = res.data?.ids ?? [];
      const next = draft.map((p, i) => ({ ...p, key: ids[i] ?? p.key }));
      setDraft(next);
      setSaved(next);
      setJustSaved(true);
      router.refresh();
    });
  }

  return (
    <div id="positions" className="scroll-mt-4 rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Positions</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            Tap a spot to rename it or move it to another line.
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            className="min-h-[44px] shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700"
            onClick={() => setDraft(resetToDefaults(draft, defaults))}
          >
            Reset to default
          </button>
        )}
      </div>

      <div className="mx-auto mt-3 max-w-sm">
        <PositionsField
          ariaLabel="Team positions"
          positions={laidOut}
          field={field}
          lines={lines}
          renderPosition={(p) => {
            const index = draft.findIndex((d) => d.key === p.key);
            return (
              <button
                type="button"
                disabled={disabled}
                aria-label={`${p.name || positionName(p.label)} (${p.label})`}
                onClick={() => setEditing({ index, value: draft[index], isNew: false })}
                className="min-h-[44px] min-w-[44px] rounded-md bg-surface/95 px-2 font-mono text-xs font-bold text-ink shadow-card transition-transform duration-fast ease-out-quart active:scale-95 disabled:cursor-default"
              >
                {p.label}
              </button>
            );
          }}
        />
      </div>

      <p className={`mt-3 text-xs ${diff === 0 ? "text-ink-mute" : "text-warn"}`}>
        {draft.length} positions · {onFieldSize} on the field
        {diff < 0 && `. Add ${-diff} more so everyone on the field has a spot.`}
        {diff > 0 && `. ${diff} more than the players on the field; extras stay empty.`}
      </p>

      {error && <InlineAlert className="mt-3">{error}</InlineAlert>}

      {!disabled && (
        <div className="mt-3 flex flex-wrap gap-2">
          <SFButton variant="ghost" size="md" onClick={openNew} disabled={draft.length >= maxPositions}>
            + Add position
          </SFButton>
          <SFButton variant="primary" size="md" onClick={save} disabled={!dirty} loading={isPending}>
            Save positions
          </SFButton>
          <p className="self-center text-xs text-ink-mute" aria-live="polite">
            {justSaved && !dirty ? "Positions saved." : ""}
          </p>
        </div>
      )}

      {editing && (
        <Modal label={editing.isNew ? "New position" : "Edit position"} onClose={() => setEditing(null)}>
          <h2 className="text-lg font-bold text-ink">{editing.isNew ? "New position" : "Edit position"}</h2>
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="position-label">Short label (up to 4 letters)</Label>
              <Input
                id="position-label"
                value={editing.value.label}
                maxLength={4}
                autoComplete="off"
                autoFocus
                // Typing replaces the label rather than adding to it, even
                // after a tap moves the cursor ("CHB" + "KEY" was "CHBK").
                onFocus={(e) => {
                  labelTyped.current = false;
                  e.currentTarget.select();
                }}
                onClick={(e) => {
                  if (labelTyped.current) return;
                  // A tap places the cursor after this handler on phones, so
                  // select on the next frame.
                  const input = e.currentTarget;
                  requestAnimationFrame(() => input.setSelectionRange(0, input.value.length));
                }}
                onChange={(e) => {
                  labelTyped.current = true;
                  setEditing({ ...editing, value: { ...editing.value, label: e.target.value.toUpperCase() } });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="position-name">Full name (optional)</Label>
              <Input
                id="position-name"
                value={editing.value.name}
                maxLength={40}
                placeholder={editing.value.label ? positionName(editing.value.label.toUpperCase()) : ""}
                autoComplete="off"
                onChange={(e) => setEditing({ ...editing, value: { ...editing.value, name: e.target.value } })}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">Line</p>
              <SegmentedControl
                label="Line"
                options={lines.map((l) => ({ id: l.id, label: l.label }))}
                value={editing.value.line}
                onChange={(line) => setEditing({ ...editing, value: { ...editing.value, line } })}
              />
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <SFButton variant="primary" size="md" onClick={commitEdit} disabled={!editing.value.label.trim()}>
              Done
            </SFButton>
            {!editing.isNew && draft.length > 1 && (
              <SFButton variant="danger" size="md" onClick={remove}>
                Remove position
              </SFButton>
            )}
            <SFButton variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </SFButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
