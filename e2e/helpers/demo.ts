// The demo teams the /demo picker plays: one is_demo team per sport,
// made if missing. The picker's server action refuses a sport with no
// demo team, and `npm run db:reset` seeds none. Moved here from
// demo-picker.spec.ts so the demo sign-up footer spec
// (stagehand-round11-followups-a) plays the same demos.

import { createAdminClient, ensureTestUser } from "../fixtures/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal rosters per sport — same shape the production seed-demo
// route creates, trimmed for test economy. Names match the prod
// seeds so test expectations carry over if we ever lock to a
// specific player.
export const TEST_DEMO_SEED = {
  afl: {
    name: "Demo Team",
    age_group: "U10",
    players: ["Alex Johnson", "Blake Smith", "Casey Brown", "Dana Wilson"],
  },
  netball: {
    name: "Demo Netball",
    age_group: "go",
    players: ["Amelia", "Bella", "Chloe", "Daisy"],
  },
  rugby_league: {
    name: "Demo League",
    age_group: "U10",
    players: ["Tom Clarke", "Jack Sullivan", "Luke Davies", "Sam Reilly"],
    settings: {
      track_zone_time: true,
      enforce_unbroken_periods: true,
    },
  },
  rugby_union: {
    name: "Demo Union",
    age_group: "U10",
    players: ["Hamish Grant", "Fraser Doyle", "Angus Byrne", "Lachie Moore"],
    settings: {
      track_zone_time: true,
    },
  },
  soccer: {
    name: "Demo Football",
    age_group: "U9",
    players: ["Mia Torres", "Leo Nguyen", "Zara Kowalski", "Noah Petrakis"],
  },
  basketball: {
    name: "Demo Basketball",
    age_group: "U10",
    players: ["Jayden Cruz", "Imogen Hart", "Marcus Odum", "Priya Shah"],
  },
  // Touch and Oztag demos are mixed teams on their sport's rule, as the
  // seed route makes them (TOUCH_MIXED_RULE / OZTAG_MIXED_RULE).
  touch: {
    name: "Demo Touch",
    age_group: "U10",
    players: ["Matilda Rees", "Lucas Ferreira", "Evie Callaghan", "Oscar Lindsay"],
    mixedGroups: ["girl", "boy", "girl", "boy"],
    settings: { mixed_max_boys: 3, mixed_min_girls: 1, mixed_min_boys: 1 },
  },
  oztag: {
    name: "Demo Oztag",
    age_group: "U10",
    players: ["Scarlett Byers", "Ryder Collins", "Harriet Vu", "Flynn Morrow"],
    mixedGroups: ["girl", "boy", "girl", "boy"],
    settings: { mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 },
  },
  hockey: {
    name: "Demo Hockey",
    age_group: "U10",
    players: ["Elsie Marsh", "Rohan Kapoor", "Tilly Beaumont", "Callum Pryce"],
  },
  futsal: {
    name: "Demo Futsal",
    age_group: "U10",
    players: ["Mateo Silva", "Lucia Romano", "Yusuf Demir", "Clara Novotny"],
  },
} as const;

// Every marketing sport id (the picker's test ids), with the app sport
// its demo plays.
export const DEMO_CARDS = [
  ["netball", "netball"],
  ["afl", "afl"],
  ["league", "rugby_league"],
  ["football", "soccer"],
  ["basketball", "basketball"],
  ["union", "rugby_union"],
  ["touch", "touch"],
  ["oztag", "oztag"],
  ["hockey", "hockey"],
  ["futsal", "futsal"],
] as const;

export type SeededSport = keyof typeof TEST_DEMO_SEED;

export async function seedDemoTeamIfMissing(
  admin: SupabaseClient,
  ownerId: string,
  sport: SeededSport,
): Promise<void> {
  const { data: existing } = await admin
    .from("teams")
    .select("id")
    .eq("is_demo", true)
    .eq("sport", sport)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const cfg = TEST_DEMO_SEED[sport];
  // handle_new_team() trigger auto-creates the (team, ownerId, admin)
  // membership row on INSERT — don't explicitly insert it here or the
  // unique constraint trips.
  const settings = "settings" in cfg ? cfg.settings : {};
  const mixedGroups: readonly string[] | null =
    "mixedGroups" in cfg ? cfg.mixedGroups : null;
  const { data: team, error: teamErr } = await admin
    .from("teams")
    .insert({
      name: cfg.name,
      age_group: cfg.age_group,
      sport,
      track_scoring: true,
      is_demo: true,
      created_by: ownerId,
      ...settings,
    })
    .select("id")
    .single();
  if (teamErr || !team) {
    throw new Error(
      `Failed to seed ${sport} demo team: ${teamErr?.message ?? "unknown"}`,
    );
  }

  const { error: playersErr } = await admin.from("players").insert(
    cfg.players.map((name, i) => ({
      team_id: team.id,
      full_name: name,
      jersey_number: null as number | null,
      mixed_group: mixedGroups?.[i] ?? null,
      is_active: true,
      created_by: ownerId,
    })),
  );
  if (playersErr) {
    throw new Error(
      `Failed to seed ${sport} demo players: ${playersErr.message}`,
    );
  }
}

/**
 * Every sport's demo team, made if missing. Idempotent; the owner is a
 * stable super-admin so the team_memberships trigger has a created_by.
 */
export async function ensureDemoTeams(): Promise<void> {
  const admin = createAdminClient();
  const owner = await ensureTestUser(admin, {
    email: "e2e-demo-owner@siren.test",
    password: "e2e-demo-owner-password-not-secret",
    fullName: "E2E Demo Owner",
    superAdmin: true,
  });
  for (const sport of Object.keys(TEST_DEMO_SEED) as SeededSport[]) {
    await seedDemoTeamIfMissing(admin, owner.id, sport);
  }
}
