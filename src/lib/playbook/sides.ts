import type { PositionDef } from "./types";

/**
 * Every default position gets its own name: a pair sharing a label
 * becomes left and right as drawn ("FP" → "LFP" / "RFP", "Forward
 * pocket" → "Left forward pocket"). The one further left on the field
 * is left; a tie keeps list order. Keys don't change, so saved roles
 * still point at the same spot. `short` trims a long label before the
 * side goes on (AFL's "HFF" → "LHF").
 */
export function sidedPositions(list: PositionDef[], short: Record<string, string> = {}): PositionDef[] {
  const byLabel = new Map<string, number[]>();
  list.forEach((p, i) => byLabel.set(p.label, [...(byLabel.get(p.label) ?? []), i]));
  const out = list.map((p) => ({ ...p }));
  byLabel.forEach((idx, label) => {
    if (idx.length !== 2) return;
    const [left, right] = [...idx].sort((a, b) => list[a].x - list[b].x || a - b);
    const base = short[label] ?? label;
    const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
    out[left] = { ...out[left], label: `L${base}`, name: `Left ${lower(list[left].name)}` };
    out[right] = { ...out[right], label: `R${base}`, name: `Right ${lower(list[right].name)}` };
  });
  return out;
}
