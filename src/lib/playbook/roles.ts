// Player roles (UX plan §7.8 W3): home / also plays / not here / keep
// on, stored as player_position_prefs. What a role is made of depends
// on how the team plays — positions for set positions and partners,
// lines otherwise — so the sheet is driven by a RoleModel derived from
// the resolved playbook rather than per-sport UI.

import type { ResolvedPlaybook } from "@/lib/playbook/team";
import type { PlayerPositionPrefRow, PositionPrefKind } from "@/lib/playbook/types";

export type RoleUnit = "position" | "line";

export interface RoleOption {
  key: string;
  label: string;
  name: string;
}

export interface RoleModel {
  unit: RoleUnit;
  options: RoleOption[];
  /** Offer a home spot (and "also plays") — strategies with a home. */
  home: boolean;
}

export interface PlayerRole {
  home: string | null;
  also: string[];
  never: string[];
  keepOn: boolean;
}

export const EMPTY_ROLE: PlayerRole = { home: null, also: [], never: [], keepOn: false };


/**
 * The role sheet for a team, or null where roles don't apply: AFL zoned
 * ages rotate every kid through every zone by rule.
 */
export function roleModelFor(resolved: ResolvedPlaybook): RoleModel | null {
  if (resolved.sport === "afl" && resolved.policy.zonesEnforced) return null;
  const { strategy, positionModel } = resolved;
  const byPosition =
    (strategy.usesPositions || strategy.roleHome === "position") && resolved.positions.length > 0;
  if (byPosition) {
    return {
      unit: "position",
      home: true,
      options: resolved.positions.map((p) => ({ key: p.key, label: p.label, name: p.name })),
    };
  }
  return {
    unit: "line",
    home: strategy.roleHome === "line",
    options: positionModel.lines.map((l) => ({ key: l.id, label: l.label, name: l.label })),
  };
}

type PrefLike = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;

/** Each player's role for the given unit, from their stored prefs. */
export function rolesFromPrefs(prefs: PrefLike[], unit: RoleUnit): Record<string, PlayerRole> {
  const out: Record<string, PlayerRole> = {};
  const sorted = [...prefs].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  for (const p of sorted) {
    const role = (out[p.player_id] ??= { home: null, also: [], never: [], keepOn: false });
    if (p.kind === "keep_on") {
      role.keepOn = true;
      continue;
    }
    // Line roles ignore position rows and vice versa.
    const key = unit === "position" ? p.position_key : p.position_key ? null : p.line;
    if (!key) continue;
    if (p.kind === "home") role.home = key;
    else if (p.kind === "also") role.also.push(key);
    else if (p.kind === "never") role.never.push(key);
  }
  return out;
}

/** A role with overlaps removed: home wins, then "also", then "not here". */
export function normaliseRole(role: PlayerRole, validKeys: string[]): PlayerRole {
  const valid = new Set(validKeys);
  const home = role.home && valid.has(role.home) ? role.home : null;
  const also = Array.from(new Set(role.also)).filter((k) => valid.has(k) && k !== home);
  const never = Array.from(new Set(role.never)).filter(
    (k) => valid.has(k) && k !== home && !also.includes(k),
  );
  return { home, also, never, keepOn: role.keepOn };
}

/** The rows that store a role (replace the player's rows for this unit). */
export function prefsFromRole(
  role: PlayerRole,
  unit: RoleUnit,
): { kind: PositionPrefKind; position_key: string | null; line: string | null; rank: number | null }[] {
  const at = (key: string) => (unit === "position" ? { position_key: key, line: null } : { position_key: null, line: key });
  const rows: ReturnType<typeof prefsFromRole> = [];
  if (role.home) rows.push({ kind: "home", ...at(role.home), rank: 0 });
  role.also.forEach((k, i) => rows.push({ kind: "also", ...at(k), rank: i + 1 }));
  role.never.forEach((k) => rows.push({ kind: "never", ...at(k), rank: null }));
  if (role.keepOn) rows.push({ kind: "keep_on", position_key: null, line: null, rank: null });
  return rows;
}

/** One line for the squad list: "Home FF · also CHF, HFF · not R · keep on". */
export function describeRole(role: PlayerRole | undefined, model: RoleModel): string {
  if (!role) return "";
  const label = (k: string) => model.options.find((o) => o.key === k)?.label ?? k;
  const parts: string[] = [];
  if (role.home) parts.push(`${model.unit === "line" ? "Prefers" : "Home"} ${label(role.home)}`);
  if (role.also.length) parts.push(`also ${role.also.map(label).join(", ")}`);
  if (role.never.length) parts.push(`not ${role.never.map(label).join(", ")}`);
  if (role.keepOn) parts.push("keep on");
  const text = parts.join(" · ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
