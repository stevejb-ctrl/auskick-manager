// Player roles (UX plan §7.8 W3), stored as player_position_prefs rows:
// home / also / never / keep_on. The role sheet speaks only in positive
// terms (Steve, 21 Oct 2026): "Plays as" these spots, a main spot, and
// "Plays every minute". "Plays as" is stored as `never` rows for the
// spots left out, so old records read back positively and every engine
// reads the rows as before. What a role is made of depends
// on how the team plays — positions for set positions and partners,
// lines otherwise — so the sheet is driven by a RoleModel derived from
// the resolved playbook rather than per-sport UI.

import type { ResolvedPlaybook } from "@/lib/playbook/team";
import { isSoccer } from "@/lib/sports/registry";
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
  /** Offer a main spot — strategies with a home. */
  home: boolean;
  /** Offer "Plays as" (false where the strategy has nothing to place kids in). */
  playsAs: boolean;
  /**
   * The soccer family: the Keeper option (gk) is asked as "Takes a turn
   * in goal", and any others are outfield lines, asked as "Plays as".
   */
  keeper: boolean;
  /** The team names its own positions, so the sheet links to the editor. */
  addPositions: boolean;
}

/** The role sheet's positive view of a role. */
export interface RoleView {
  /** The spots a kid plays; empty means anywhere. */
  plays: string[];
  /** Their main spot, under strategies with a home. */
  main: string | null;
  keepOn: boolean;
  /**
   * An old "also plays" with nothing left out, shown ticked: saving
   * turns it into a restriction, so the sheet says so.
   */
  restrictNote: boolean;
}

export interface PlayerRole {
  home: string | null;
  also: string[];
  never: string[];
  keepOn: boolean;
  /**
   * Every spot, when the coach ticked them all as "Plays as". Nothing is
   * left out, so there are no never rows; these rows tell the sheet it
   * was every spot rather than nothing picked. The engines ignore them.
   */
  plays?: string[];
}

export const EMPTY_ROLE: PlayerRole = { home: null, also: [], never: [], keepOn: false };


/**
 * The role sheet for a team, or null where roles don't apply: AFL zoned
 * ages rotate every kid through every zone by rule.
 */
export function roleModelFor(resolved: ResolvedPlaybook): RoleModel | null {
  if (resolved.sport === "afl" && resolved.policy.zonesEnforced) return null;
  const { strategy, positionModel } = resolved;
  const withHome = strategy.usesPositions || strategy.roleHome === "position";
  const playsAs = strategy.rolePlaysAs !== false;
  // Every soccer-family sport keeps goal (soccer, futsal, hockey).
  const keeper = isSoccer(resolved.sport) && positionModel.lines.some((l) => l.id === KEEPER_KEY);
  if ((withHome || strategy.rolePositions) && resolved.positions.length > 0) {
    return {
      unit: "position",
      home: withHome,
      playsAs,
      keeper,
      addPositions: positionModel.canAddRemove && strategy.usesPositions,
      options: resolved.positions.map((p) => ({ key: p.key, label: p.label, name: p.name })),
    };
  }
  return {
    unit: "line",
    home: strategy.roleHome === "line",
    playsAs,
    keeper,
    addPositions: false,
    options: positionModel.lines.map((l) => ({ key: l.id, label: l.label, name: l.label })),
  };
}

/**
 * A stored role as the sheet shows it. `never` rows read back as the
 * spots left: never Forward is Plays as Centre, Back.
 */
export function viewFromRole(role: PlayerRole, model: RoleModel): RoleView {
  const keys = model.options.map((o) => o.key);
  const never = role.never.filter((k) => keys.includes(k));
  const main = model.home && role.home && keys.includes(role.home) ? role.home : null;
  if (never.length > 0) {
    return { plays: keys.filter((k) => !never.includes(k)), main, keepOn: role.keepOn, restrictNote: false };
  }
  // Every spot ticked, including any added since: nothing is left out.
  if (role.plays?.some((k) => keys.includes(k))) {
    return { plays: keys, main, keepOn: role.keepOn, restrictNote: false };
  }
  const also = model.home ? role.also.filter((k) => keys.includes(k)) : [];
  if (also.length > 0) {
    const plays = keys.filter((k) => k === main || also.includes(k));
    return { plays, main, keepOn: role.keepOn, restrictNote: plays.length < keys.length };
  }
  return { plays: [], main, keepOn: role.keepOn, restrictNote: false };
}

/**
 * The rows a view saves: the spots not ticked as `never`, the main spot
 * as home and the other ticks as `also`. Nothing or everything ticked
 * is no restriction, so a position added later is open to every kid.
 */
export function roleFromView(view: Omit<RoleView, "restrictNote">, model: RoleModel): PlayerRole {
  const keys = model.options.map((o) => o.key);
  const plays = keys.filter((k) => view.plays.includes(k));
  const restricted = plays.length > 0 && plays.length < keys.length;
  const everySpot = keys.length > 0 && plays.length === keys.length;
  const main =
    model.home && view.main && keys.includes(view.main) && (!restricted || plays.includes(view.main))
      ? view.main
      : null;
  return {
    home: main,
    also: model.home && restricted ? plays.filter((k) => k !== main) : [],
    never: restricted ? keys.filter((k) => !plays.includes(k)) : [],
    keepOn: view.keepOn,
    ...(everySpot ? { plays } : {}),
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
    if (p.kind === "plays") {
      const at = unit === "position" ? p.position_key : p.position_key ? null : p.line;
      if (at) (role.plays ??= []).push(at);
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

/** A role with overlaps removed: home wins, then "also", then "never". */
export function normaliseRole(role: PlayerRole, validKeys: string[]): PlayerRole {
  const valid = new Set(validKeys);
  const home = role.home && valid.has(role.home) ? role.home : null;
  const also = Array.from(new Set(role.also)).filter((k) => valid.has(k) && k !== home);
  const never = Array.from(new Set(role.never)).filter(
    (k) => valid.has(k) && k !== home && !also.includes(k),
  );
  // Every spot ticked means nothing is left out.
  const plays = never.length === 0 ? Array.from(new Set(role.plays ?? [])).filter((k) => valid.has(k)) : [];
  return { home, also, never, keepOn: role.keepOn, ...(plays.length > 0 ? { plays } : {}) };
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
  role.plays?.forEach((k) => rows.push({ kind: "plays", ...at(k), rank: null }));
  if (role.keepOn) rows.push({ kind: "keep_on", position_key: null, line: null, rank: null });
  return rows;
}

/** The soccer family's goal option. */
export const KEEPER_KEY = "gk";

/**
 * The outfield half of a keeper model: its lines, asked as "Plays as".
 * The keeper's home row is a keen keeper, so the lines offer no main.
 */
export function outfieldModel(model: RoleModel): RoleModel {
  if (!model.keeper) return model;
  return { ...model, keeper: false, home: false, options: model.options.filter((o) => o.key !== KEEPER_KEY) };
}

/** One line for the squad list: "Plays FF, CHF · main FF · every minute". */
export function describeRole(role: PlayerRole | undefined, model: RoleModel): string {
  if (!role) return "";
  const label = (k: string) => model.options.find((o) => o.key === k)?.label ?? k;
  const parts: string[] = [];
  if (model.keeper) {
    if (role.home === KEEPER_KEY) parts.push("Keen keeper");
    else if (role.never.includes(KEEPER_KEY)) parts.push("No turns in goal");
    const out = outfieldModel(model);
    const plays = viewFromRole(role, out).plays;
    if (plays.length > 0) parts.push(`plays ${plays.map(label).join(", ")}`);
  } else {
    const view = viewFromRole(role, model);
    if (view.plays.length > 0) parts.push(`Plays ${view.plays.map(label).join(", ")}`);
    if (view.main) parts.push(`main ${label(view.main)}`);
  }
  if (role.keepOn) parts.push("every minute");
  const text = parts.join(" · ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
