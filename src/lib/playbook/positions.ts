// Editing a team's named positions (UX plan 3.4): AFL open ages and
// rugby's named-position ages. Lines are the sport's own (AFL
// back/mid/fwd, rugby forwards/backs), so drafts carry plain ids.

import type { LineDef, PositionDef } from "@/lib/playbook/types";

/** @deprecated AFL's line ids; drafts now carry any sport's line. */
export type AflLine = "back" | "mid" | "fwd";

export interface DraftPosition {
  /** team_positions.id, a default key ("chb", "bp1", "ru-9") or "new-…". */
  key: string;
  label: string;
  name: string;
  line: string;
}

export function toDraft(p: PositionDef): DraftPosition {
  return { key: p.key, label: p.label, name: p.name, line: p.line };
}

/**
 * Reset to the default formation, keeping a saved position's id where
 * its label matches a default, so kids' home positions survive.
 */
export function resetToDefaults(current: DraftPosition[], defaults: DraftPosition[]): DraftPosition[] {
  const unused = current.filter((p) => !defaults.some((d) => d.key === p.key));
  return defaults.map((d) => {
    const i = unused.findIndex((p) => p.label === d.label);
    if (i < 0) return d;
    const [match] = unused.splice(i, 1);
    return { ...d, key: match.key };
  });
}

/** The line with the fewest positions — where a new one goes first. */
export function sparsestLine(draft: DraftPosition[], lines: LineDef[]): string {
  const count = (line: string) => draft.filter((p) => p.line === line).length;
  return lines.map((l) => l.id).reduce((a, b) => (count(b) < count(a) ? b : a));
}
