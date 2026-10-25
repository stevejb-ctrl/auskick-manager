// ─── The Game plan's first period, away from the lineup ──────
// The game page's Game plan opens on the lineup the lineup screen will
// open on, so the night-before text is the plan the coach will start
// (UX round 2, 24 Oct 2026: it shared a different Q1 from the lineup,
// even after "Plan saved"). That's the saved plan's lineup, its kids
// still here; else, for AFL, the screen's own opening suggestion
// (aflOpeningLineup) over the kids not lent. Netball and league open on
// a saved plan; without one their plan is projected as before. Returns
// GamePlanModal's `anchor` (group id → player ids, + bench), or null.
// Pure.

import { seasonZoneMinutes, type ZoneCaps } from "@/lib/fairness";
import { zoneCapsFor } from "@/lib/ageGroups";
import { replayLocks } from "@/lib/live/locks";
import { aflPositionModel } from "@/lib/sports/afl";
import type { AflPlaybookInput } from "@/lib/sports/afl/engine";
import { aflOpeningLineup } from "@/lib/sports/afl/openingLineup";
import { isRugby } from "@/lib/sports/registry";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  normalizeLeagueLineup,
  normalizeLineup,
  type GameEvent,
  type Lineup,
  type Player,
  type Sport,
  type Zone,
} from "@/lib/types";

const ZONES: Zone[] = ["back", "hback", "mid", "hfwd", "fwd"];

export interface GamePlanAnchorInput {
  sport: Sport;
  /** The saved plan's lineup (game_lineup_drafts.lineup), if there is one. */
  draftLineup: unknown;
  /** The kids here for the game. */
  here: ReadonlySet<string>;
  /** The same kids, in the lineup screen's order (by number). */
  players: Player[];
  /** This game's events so far (loans and holds before kickoff). */
  thisGame: GameEvent[];
  /** The team's other games' events. */
  seasonEvents: GameEvent[];
  /** The game's own players on the field. */
  onFieldSize: number;
  ageGroup: AgeGroupConfig;
  fullPeriodMs: number;
  aflPlaybook?: AflPlaybookInput;
}

export function gamePlanAnchor(input: GamePlanAnchorInput): { groups: Record<string, string[]>; bench: string[] } | null {
  const keep = (ids: unknown): string[] =>
    Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && input.here.has(id)) : [];
  const draft = input.draftLineup && typeof input.draftLineup === "object" ? (input.draftLineup as Record<string, unknown>) : null;

  if (input.sport === "afl") {
    // The lineup screen's field: its zones at the game's own size.
    const caps: ZoneCaps = zoneCapsFor(input.onFieldSize, aflPositionModel(input.ageGroup));
    const anchorOf = (l: Lineup) => ({
      groups: Object.fromEntries(ZONES.filter((z) => caps[z] > 0).map((z) => [z, keep(l[z])])),
      bench: keep(l.bench),
    });
    if (draft) return anchorOf(normalizeLineup(draft as Partial<Lineup>));
    const lent = lentIds(input.thisGame);
    return anchorOf(
      aflOpeningLineup({
        players: input.players.filter((p) => !lent.has(p.id)),
        season: seasonZoneMinutes(input.seasonEvents),
        onFieldSize: input.onFieldSize,
        positionModel: aflPositionModel(input.ageGroup),
        locks: replayLocks(input.thisGame),
        fullPeriodMs: input.fullPeriodMs,
        aflPlaybook: input.aflPlaybook,
      }),
    );
  }
  if (!draft) return null;
  if (input.sport === "netball") {
    const positions = (draft.positions ?? {}) as Record<string, unknown>;
    return {
      groups: Object.fromEntries(Object.entries(positions).map(([pos, ids]) => [pos, keep(ids)])),
      bench: keep(draft.bench),
    };
  }
  if (isRugby(input.sport)) {
    const l = normalizeLeagueLineup(draft);
    return { groups: { forwards: keep(l.forwards), backs: keep(l.backs) }, bench: keep(l.bench) };
  }
  return null;
}

/** Kids lent before kickoff: each kid's latest player_loan, as the lineup screen reads them. */
function lentIds(events: GameEvent[]): Set<string> {
  const latest = new Map<string, { at: string; loaned: boolean }>();
  for (const e of events) {
    if (e.type !== "player_loan" || !e.player_id) continue;
    const loaned = (e.metadata as { loaned?: boolean } | null)?.loaned ?? true;
    const was = latest.get(e.player_id);
    if (!was || was.at < e.created_at) latest.set(e.player_id, { at: e.created_at, loaned });
  }
  return new Set(Array.from(latest.entries()).filter(([, v]) => v.loaned).map(([id]) => id));
}
