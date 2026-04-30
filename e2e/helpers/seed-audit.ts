// Phase 4 — Kotara Koalas seed audit.
//
// TEST-05 acceptance gate: the netball test team Kotara Koalas
// (5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11, "Go" age group, 9 active
// players, 5 simulated games) must be queryable in local Supabase
// for ongoing netball validation.
//
// IMPORTANT — supabase/seed.sql does NOT seed Kotara Koalas (verified
// 2026-04-30: seed.sql is intentionally tiny; per-team data lives in
// dev-environment manual setup or factories.makeTeam fallbacks). So
// this helper REPORTS presence rather than ENFORCING it. Callers
// decide whether to:
//   • use the real Kotara seed for season-history-dependent assertions
//     (NETBALL-02 5-game history relies on real prior-game data), or
//   • fall back to a fresh `factories.makeTeam({ sport: 'netball' })`
//     team when the audit returns { present: false } — Phase 4 specs
//     overwhelmingly use this branch.
//
// Per CONTEXT D-CONTEXT-seed-strategy (locked): "Two-tier:
// 1. Kotara Koalas — verify presence via select on local DB at the
//    start of Phase 4 (TEST-05 acceptance). If absent, re-seed via the
//    netball-specific seed pathway. Use for season-history-dependent
//    assertions.
// 2. Fresh factories.makeTeam({ sport: 'netball' }) — for spec
//    isolation."

import type { SupabaseClient } from "@supabase/supabase-js";

export const KOTARA_KOALAS_TEAM_ID = "5ba1eb72-ee23-4b8e-9f9c-22a12fd0fc11";

export interface KotaraAuditResult {
  /** True iff a row exists in `teams` with id = KOTARA_KOALAS_TEAM_ID
   *  AND sport = 'netball'. False if the row is missing or the row
   *  exists but is not netball (data drift signal). */
  present: boolean;
  /** Count of `games` rows where team_id = KOTARA_KOALAS_TEAM_ID. 0
   *  when present === false. TEST-05 expects 5 simulated games when
   *  fully seeded — but this helper does NOT enforce the count; that's
   *  the caller's choice. */
  gameCount: number;
  /** Count of `players` rows where team_id = KOTARA_KOALAS_TEAM_ID
   *  AND is_active = true. 0 when present === false. TEST-05 expects 9
   *  active players when fully seeded. */
  playerCount: number;
  /** KOTARA_KOALAS_TEAM_ID echoed back for log clarity. */
  teamId: string;
}

/**
 * Probe the local Supabase for the Kotara Koalas seed without throwing.
 *
 * Returns a structured result so callers can branch on `.present` and
 * either log "Kotara Koalas seed verified for TEST-05" + use it, or
 * fall through to factories.makeTeam.
 *
 * Does NOT throw on missing-row, does NOT throw on wrong-sport. Throws
 * ONLY on actual network/RLS errors that would break the audit itself.
 */
export async function auditKotaraKoalas(
  admin: SupabaseClient,
): Promise<KotaraAuditResult> {
  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .select("id, sport")
    .eq("id", KOTARA_KOALAS_TEAM_ID)
    .maybeSingle();

  if (teamErr) {
    throw new Error(
      `auditKotaraKoalas: teams probe failed: ${teamErr.message}`,
    );
  }

  // Missing row OR row exists but is not netball — both classify as
  // "absent for the purpose of TEST-05". A non-netball row at this UUID
  // is a data-drift signal worth logging upstream, but we don't throw.
  if (!teamRow || teamRow.sport !== "netball") {
    return {
      present: false,
      gameCount: 0,
      playerCount: 0,
      teamId: KOTARA_KOALAS_TEAM_ID,
    };
  }

  const [
    { count: gameCount, error: gameErr },
    { count: playerCount, error: playerErr },
  ] = await Promise.all([
    admin
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("team_id", KOTARA_KOALAS_TEAM_ID),
    admin
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", KOTARA_KOALAS_TEAM_ID)
      .eq("is_active", true),
  ]);

  if (gameErr) {
    throw new Error(`auditKotaraKoalas: games probe failed: ${gameErr.message}`);
  }
  if (playerErr) {
    throw new Error(
      `auditKotaraKoalas: players probe failed: ${playerErr.message}`,
    );
  }

  return {
    present: true,
    gameCount: gameCount ?? 0,
    playerCount: playerCount ?? 0,
    teamId: KOTARA_KOALAS_TEAM_ID,
  };
}
