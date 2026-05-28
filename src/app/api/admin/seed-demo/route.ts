import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// Reuse CRON_SECRET for lightweight admin-only access.
//
// Idempotent: each sport's demo team is created once and reused.
// POSTing again is safe — every sport is upserted independently
// and the response reports which were created vs already present.
//
// Wired in two places:
//   - POST /api/admin/seed-demo  (manual curl)
//   - GET  /api/admin/seed-demo  (Vercel cron — schedule in
//     vercel.json runs daily, idempotent so it just no-ops once
//     all sport demos exist)
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // We need a real user as owner — pick the first super admin.
  const { data: superAdmin } = await admin
    .from("profiles")
    .select("id")
    .eq("is_super_admin", true)
    .limit(1)
    .maybeSingle();

  if (!superAdmin) {
    return NextResponse.json(
      { error: "No super admin found to own demo team" },
      { status: 500 }
    );
  }

  // Seed each sport's demo in turn. The seedDemoTeam helper is
  // per-sport so callers can reseed individually too if needed.
  try {
    const aflResult = await seedDemoTeam(admin, superAdmin.id, "afl");
    const netballResult = await seedDemoTeam(admin, superAdmin.id, "netball");
    const leagueResult = await seedDemoTeam(
      admin,
      superAdmin.id,
      "rugby_league",
    );
    return NextResponse.json({
      ok: true,
      afl: aflResult,
      netball: netballResult,
      rugby_league: leagueResult,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Two methods, one handler. Vercel cron always sends GET; manual
// curl normally uses POST. Both share the same secret check + seed
// logic so re-runs are safe regardless of who triggered them.
export const GET = handle;
export const POST = handle;

interface SeedResult {
  teamId: string;
  skipped?: true;
  players?: number;
}

type SeedableSport = "afl" | "netball" | "rugby_league";

// Per-sport seed config. Centralised so adding a fourth sport (e.g.
// Rugby Union when it launches) is one entry, not a new branch.
const SPORT_SEED: Record<
  SeedableSport,
  {
    teamName: string;
    ageGroup: string;
    // Optional per-sport setting overrides on the teams table. Defaults
    // come from the DB column defaults; set values here only when the
    // demo experience should differ to showcase a sport-specific feature.
    settings: {
      track_zone_time?: boolean;
      enforce_unbroken_periods?: boolean;
    };
    players: ReadonlyArray<{ name: string; jersey: number | null }>;
  }
> = {
  // ─── AFL ────────────────────────────────────────────────────
  // U10, 15 players (≥ 11 on-field + bench). Mixed-unisex first
  // names, classic surnames — generic enough to read as any
  // junior AFL squad.
  afl: {
    teamName: "Demo Team",
    ageGroup: "U10",
    settings: {},
    players: [
      { name: "Alex Johnson", jersey: 1 },
      { name: "Blake Smith", jersey: 2 },
      { name: "Casey Brown", jersey: 3 },
      { name: "Dana Wilson", jersey: 4 },
      { name: "Eli Taylor", jersey: 5 },
      { name: "Finley Anderson", jersey: 6 },
      { name: "Harper Thomas", jersey: 7 },
      { name: "Indigo Martin", jersey: 8 },
      { name: "Jordan White", jersey: 9 },
      { name: "Kai Harris", jersey: 10 },
      { name: "Logan Clark", jersey: 11 },
      { name: "Morgan Lewis", jersey: 12 },
      { name: "Nat Robinson", jersey: 13 },
      { name: "Oakley Walker", jersey: 14 },
      { name: "Parker Hall", jersey: 15 },
    ],
  },

  // ─── Netball ────────────────────────────────────────────────
  // NetSetGO "Go" tier (8–10 yo) — the closest netball equivalent
  // to U10. 10 girls' names, single-name shorthand (matches the
  // Bondi Bandits roster shown in the netball marketing
  // screenshots). All unambiguously feminine per Steve's
  // direction — no unisex names that could read either way.
  netball: {
    teamName: "Demo Netball",
    ageGroup: "go",
    settings: {},
    players: [
      { name: "Amelia", jersey: null },
      { name: "Bella", jersey: null },
      { name: "Chloe", jersey: null },
      { name: "Daisy", jersey: null },
      { name: "Ella", jersey: null },
      { name: "Freya", jersey: null },
      { name: "Grace", jersey: null },
      { name: "Hazel", jersey: null },
      { name: "Isla", jersey: null },
      { name: "Juliet", jersey: null },
    ],
  },

  // ─── Rugby League ───────────────────────────────────────────
  // U10 modified tackle — 2 × 20-min halves, 11 on-field, FR + DH
  // vests rotated at every half. 13 players (= 11 + 2 bench) is
  // the typical match-day squad size.
  //
  // Settings tuned to *showcase* RL-specific features that
  // generic sub-timers miss:
  //   - track_zone_time = true  → the F/B time bar that
  //     visualises forward vs back equity is visible mid-game.
  //   - enforce_unbroken_periods = true → Junior Law §7's
  //     "every player must complete one unbroken half" rule
  //     enforces during the q-break suggester, so a visitor
  //     sees Siren reasoning about a real RL constraint.
  //
  // Forward/Back chips auto-seed via the
  // 0043_rugby_league_position_chips.sql trigger on team
  // INSERT — no explicit chip setup needed here.
  //
  // First/last names chosen to read as distinct from the AFL
  // demo roster (no name overlap).
  rugby_league: {
    teamName: "Demo League",
    ageGroup: "U10",
    settings: {
      track_zone_time: true,
      enforce_unbroken_periods: true,
    },
    players: [
      { name: "Tom Clarke", jersey: 1 },
      { name: "Jack Sullivan", jersey: 2 },
      { name: "Luke Davies", jersey: 3 },
      { name: "Sam Reilly", jersey: 4 },
      { name: "Owen Lambert", jersey: 5 },
      { name: "Riley Murphy", jersey: 6 },
      { name: "Mason Donovan", jersey: 7 },
      { name: "Felix Bennett", jersey: 8 },
      { name: "Charlie Fitzgerald", jersey: 9 },
      { name: "Henry Walsh", jersey: 10 },
      { name: "Cooper Reid", jersey: 11 },
      { name: "Bodhi Webb", jersey: 12 },
      { name: "Archie Lee", jersey: 13 },
    ],
  },
};

async function seedDemoTeam(
  admin: SupabaseClient,
  ownerId: string,
  sport: SeedableSport,
): Promise<SeedResult> {
  const cfg = SPORT_SEED[sport];

  // Idempotent: skip if a demo team for this sport already exists.
  const { data: existing } = await admin
    .from("teams")
    .select("id")
    .eq("is_demo", true)
    .eq("sport", sport)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { teamId: existing.id, skipped: true };
  }

  const { data: team, error: teamErr } = await admin
    .from("teams")
    .insert({
      name: cfg.teamName,
      age_group: cfg.ageGroup,
      sport,
      track_scoring: true,
      is_demo: true,
      created_by: ownerId,
      ...cfg.settings,
    })
    .select("id")
    .single();

  if (teamErr || !team) {
    throw new Error(
      `Failed to create ${sport} demo team: ${teamErr?.message ?? "unknown"}`,
    );
  }

  // Admin membership is auto-created by the handle_new_team()
  // trigger on the teams table — it inserts a (team_id, created_by,
  // 'admin') row at INSERT time. Explicitly inserting again here
  // would trip the team_memberships_team_id_user_id_key unique
  // constraint. The previous seed code did this and silently
  // worked because team_memberships INSERTs returning errors used
  // to be swallowed; the new code path catches it. No-op now —
  // membership is in place by the time we get here.

  const { error: playersErr } = await admin.from("players").insert(
    cfg.players.map((p) => ({
      team_id: team.id,
      full_name: p.name,
      jersey_number: p.jersey,
      is_active: true,
      created_by: ownerId,
    })),
  );

  if (playersErr) {
    throw new Error(
      `Failed to seed ${sport} demo players: ${playersErr.message}`,
    );
  }

  return { teamId: team.id, players: cfg.players.length };
}
