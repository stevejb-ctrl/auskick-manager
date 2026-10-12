"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SFButton } from "@/components/sf";
import { normaliseRole, type PlayerRole, type RoleModel, type RoleOption } from "@/lib/playbook/roles";
import type { ActionResult } from "@/lib/types";

interface PlayerRoleSheetProps {
  playerName: string;
  model: RoleModel;
  initial: PlayerRole;
  onSave: (role: PlayerRole) => Promise<ActionResult>;
  onClose: () => void;
}

function OptionChip({
  option,
  active,
  role,
  tone,
  onClick,
}: {
  option: RoleOption;
  active: boolean;
  role: "radio" | "checkbox";
  tone: "brand" | "danger";
  onClick: () => void;
}) {
  const on = tone === "danger" ? "border-danger bg-danger/10 text-danger" : "border-brand-600 bg-brand-50 text-brand-700";
  return (
    <button
      type="button"
      role={role}
      aria-checked={active}
      aria-label={option.name !== option.label ? `${option.name} (${option.label})` : option.label}
      onClick={onClick}
      className={`min-h-[44px] min-w-[44px] rounded-md border px-3 font-mono text-xs font-bold transition-colors duration-fast ease-out-quart active:scale-95 ${
        active ? on : "border-hairline bg-surface text-ink-dim hover:border-ink-mute"
      }`}
    >
      {option.label}
    </button>
  );
}

/**
 * A player's role for the season (UX plan §7.9 W3): home spot, also
 * plays, never plays, keep on. Options come from the team's role model,
 * so the same sheet serves AFL positions or lines, netball bibs or
 * thirds, and league lines or positions.
 */
export function PlayerRoleSheet({ playerName, model, initial, onSave, onClose }: PlayerRoleSheetProps) {
  const [role, setRole] = useState<PlayerRole>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const unitWord = model.unit === "line" ? "line" : "position";

  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  function save() {
    setError(null);
    const clean = normaliseRole(role, model.options.map((o) => o.key));
    startTransition(async () => {
      const res = await onSave(clean);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Modal label={`Role for ${playerName}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{playerName}</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mr-2 -mt-2 min-h-[44px] min-w-[44px] text-ink-mute hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 space-y-4 overflow-y-auto">
        {model.home && (
          <section>
            <p className="text-sm font-semibold text-ink">
              {model.unit === "line" ? "Preferred line" : "Home position"}
            </p>
            <div role="radiogroup" aria-label={model.unit === "line" ? "Preferred line" : "Home position"} className="mt-1.5 flex flex-wrap gap-1.5">
              {model.options.map((o) => (
                <OptionChip
                  key={o.key}
                  option={o}
                  role="radio"
                  tone="brand"
                  active={role.home === o.key}
                  onClick={() =>
                    setRole((r) => ({
                      ...r,
                      home: r.home === o.key ? null : o.key,
                      also: r.also.filter((k) => k !== o.key),
                      never: r.never.filter((k) => k !== o.key),
                    }))
                  }
                />
              ))}
            </div>
          </section>
        )}

        {model.home && (
          <section>
            <p className="text-sm font-semibold text-ink">Also plays</p>
            <div role="group" aria-label="Also plays" className="mt-1.5 flex flex-wrap gap-1.5">
              {model.options
                .filter((o) => o.key !== role.home)
                .map((o) => (
                  <OptionChip
                    key={o.key}
                    option={o}
                    role="checkbox"
                    tone="brand"
                    active={role.also.includes(o.key)}
                    onClick={() =>
                      setRole((r) => ({
                        ...r,
                        also: toggle(r.also, o.key),
                        never: r.never.filter((k) => k !== o.key),
                      }))
                    }
                  />
                ))}
            </div>
          </section>
        )}

        <section>
          <p className="text-sm font-semibold text-ink">Never plays</p>
          <p className="text-xs text-ink-mute">Siren won&apos;t suggest this {unitWord} for them.</p>
          <div role="group" aria-label="Never plays" className="mt-1.5 flex flex-wrap gap-1.5">
            {model.options
              .filter((o) => o.key !== role.home)
              .map((o) => (
                <OptionChip
                  key={o.key}
                  option={o}
                  role="checkbox"
                  tone="danger"
                  active={role.never.includes(o.key)}
                  onClick={() =>
                    setRole((r) => ({
                      ...r,
                      never: toggle(r.never, o.key),
                      also: r.also.filter((k) => k !== o.key),
                    }))
                  }
                />
              ))}
          </div>
        </section>

        <section className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Keep on</p>
            <p className="text-xs text-ink-mute">Plays as much as the rules allow.</p>
          </div>
          <Toggle label="Keep on" checked={role.keepOn} onChange={(keepOn) => setRole((r) => ({ ...r, keepOn }))} />
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
