// A finished game seeded straight into the event log, for specs about
// what a coach reads after full time (the game page's summary, How we
// played, stats). Events are stamped with the team's sport and a second
// apart, in the order given; the game is "completed", scoring on.

import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import type { SportId } from "../../src/lib/sports";

export type SeedRow = { type: string; player_id?: string | null; metadata?: Record<string, unknown> };

export async function finishedGame(sport: SportId, count: number, rows: (ids: string[]) => SeedRow[]) {
  const admin = createAdminClient();
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const name = `Summary ${sport} ${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;
  const team = await makeTeam(admin, { ownerId, sport, name });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, scheduledAt: new Date(Date.now() - 3_600_000).toISOString() });
  const at = (s: number) => new Date(Date.now() - 1_800_000 + s * 1000).toISOString();
  const events = rows(players.map((p) => p.id)).map((r, i) => ({
    type: r.type,
    player_id: r.player_id ?? null,
    metadata: { ...(r.metadata ?? {}), sport },
    created_at: at(i + 1),
    game_id: game.id,
    created_by: ownerId,
  }));
  const { error } = await admin.from("game_events").insert(events);
  if (error) throw new Error(`finishedGame: ${error.message}`);
  const { error: statusError } = await admin.from("games").update({ status: "completed" }).eq("id", game.id);
  if (statusError) throw new Error(`finishedGame: ${statusError.message}`);
  return { admin, team, game, players, name };
}

/** Period `quarter` of play with `between` in it, ended at `ms`. */
export const playPeriod = (quarter: number, between: SeedRow[], ms = 600_000): SeedRow[] => [
  { type: "quarter_start", metadata: { quarter } },
  ...between,
  { type: "quarter_end", metadata: { quarter, elapsed_ms: ms } },
];

export const fullTime: SeedRow = { type: "game_finalised", metadata: {} };
