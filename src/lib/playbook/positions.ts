// AFL open ages: editing a team's named positions (UX plan 3.4).

import type { PositionDef } from "@/lib/playbook/types";

export type AflLine = "back" | "mid" | "fwd";

export interface DraftPosition {
  /** team_positions.id, a default key ("chb", "bp1") or "new-…". */
  key: string;
  label: string;
  name: string;
  line: AflLine;
}

export function toDraft(p: PositionDef): DraftPosition {
  return { key: p.key, label: p.label, name: p.name, line: p.line as AflLine };
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
export function sparsestLine(draft: DraftPosition[]): AflLine {
  const count = (line: AflLine) => draft.filter((p) => p.line === line).length;
  return (["fwd", "mid", "back"] as const).reduce((a, b) => (count(b) < count(a) ? b : a));
}
