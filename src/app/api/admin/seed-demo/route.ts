import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mixedRuleColumns } from "@/lib/sports/touch/mixed";
import { TOUCH_MIXED_RULE } from "@/lib/sports/touch";
import { OZTAG_MIXED_RULE } from "@/lib/sports/oztag";

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
    const results: Partial<Record<SeedableSport, SeedResult>> = {};
    for (const sport of Object.keys(SPORT_SEED) as SeedableSport[]) {
      results[sport] = await seedDemoTeam(admin, superAdmin.id, sport);
    }
    return NextResponse.json({ ok: true, ...results });
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

type SeedableSport =
  | "afl"
  | "netball"
  | "rugby_league"
  | "rugby_union"
  | "soccer"
  | "basketball"
  | "touch"
  | "oztag"
  | "hockey"
  | "futsal";

// Per-sport seed config. Centralised so adding a sport is one entry,
// not a new branch.
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
      // Touch and Oztag mixed teams: the sport's boys' cap.
      mixed_max_boys?: number | null;
      mixed_min_girls?: number | null;
      mixed_min_boys?: number | null;
    };
    players: ReadonlyArray<{
      name: string;
      jersey: number | null;
      // Who the kid counts as under a mixed team's rule.
      mixedGroup?: "girl" | "boy";
    }>;
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

  // ─── Rugby Union ────────────────────────────────────────────
  // U10 on the national pathway: 12 a side, 2 × 20-min halves,
  // forwards and backs (no vests, no kick rotations, no unbroken
  // rule). 15 players (= 12 + 3 bench). The F/B time bar is on to
  // show forward and back equity. Names distinct from the other
  // demos.
  rugby_union: {
    teamName: "Demo Union",
    ageGroup: "U10",
    settings: {
      track_zone_time: true,
    },
    players: [
      { name: "Hamish Grant", jersey: 1 },
      { name: "Fraser Doyle", jersey: 2 },
      { name: "Angus Byrne", jersey: 3 },
      { name: "Lachie Moore", jersey: 4 },
      { name: "Toby Quinn", jersey: 5 },
      { name: "Reuben Hayes", jersey: 6 },
      { name: "Ned Carroll", jersey: 7 },
      { name: "Jasper Kelly", jersey: 8 },
      { name: "Ollie Ryan", jersey: 9 },
      { name: "Harry Nolan", jersey: 10 },
      { name: "Xavier Price", jersey: 11 },
      { name: "Will Foley", jersey: 12 },
      { name: "Darcy Keane", jersey: 13 },
      { name: "Ethan Burke", jersey: 14 },
      { name: "Monty Shaw", jersey: 15 },
    ],
  },

  // ─── Football (soccer) ──────────────────────────────────────
  // MiniRoos U9: 7 a side with a keeper, 2 × 20-min halves, and
  // "Everyone has a turn in goal", so a visitor sees the keeper top
  // change hands at half-time. 10 players (= 7 + 3 bench). Scores on
  // to show the scorebug (MiniRoos itself keeps none). Names distinct
  // from the other demos.
  soccer: {
    teamName: "Demo Football",
    ageGroup: "U9",
    settings: {},
    players: [
      { name: "Mia Torres", jersey: 1 },
      { name: "Leo Nguyen", jersey: 2 },
      { name: "Zara Kowalski", jersey: 3 },
      { name: "Noah Petrakis", jersey: 4 },
      { name: "Ruby Okafor", jersey: 5 },
      { name: "Eli Haddad", jersey: 6 },
      { name: "Ava Lindqvist", jersey: 7 },
      { name: "Kian Patel", jersey: 8 },
      { name: "Sienna Rossi", jersey: 9 },
      { name: "Theo Barker", jersey: 10 },
    ],
  },

  // ─── Basketball ─────────────────────────────────────────────
  // U10: 5 on court, 2 × 20-min halves on a running clock, no
  // 3-pointers. 9 players (= 5 + 4 bench), so every rotation has
  // kids coming off. Names distinct from the other demos.
  basketball: {
    teamName: "Demo Basketball",
    ageGroup: "U10",
    settings: {},
    players: [
      { name: "Jayden Cruz", jersey: 4 },
      { name: "Imogen Hart", jersey: 5 },
      { name: "Marcus Odum", jersey: 6 },
      { name: "Priya Shah", jersey: 7 },
      { name: "Declan Frost", jersey: 8 },
      { name: "Layla Mendes", jersey: 9 },
      { name: "Hugo Brandt", jersey: 10 },
      { name: "Aria Novak", jersey: 11 },
      { name: "Kobe Ellis", jersey: 12 },
    ],
  },

  // ─── Touch football ─────────────────────────────────────────
  // U10 mixed: 5 on the field, 2 × 15-min halves, on touch's mixed
  // rule (at most 3 boys, at least 1 girl and 1 boy), so a visitor
  // sees the boys' cap at work. 10 players (= 5 + 5 interchange),
  // five girls and five boys.
  touch: {
    teamName: "Demo Touch",
    ageGroup: "U10",
    settings: mixedRuleColumns(TOUCH_MIXED_RULE),
    players: [
      { name: "Matilda Rees", jersey: 1, mixedGroup: "girl" },
      { name: "Lucas Ferreira", jersey: 2, mixedGroup: "boy" },
      { name: "Evie Callaghan", jersey: 3, mixedGroup: "girl" },
      { name: "Oscar Lindsay", jersey: 4, mixedGroup: "boy" },
      { name: "Willow Tran", jersey: 5, mixedGroup: "girl" },
      { name: "Max Delaney", jersey: 6, mixedGroup: "boy" },
      { name: "Poppy Ashford", jersey: 7, mixedGroup: "girl" },
      { name: "Zac Mahoney", jersey: 8, mixedGroup: "boy" },
      { name: "Lily Sorensen", jersey: 9, mixedGroup: "girl" },
      { name: "Jett Holloway", jersey: 10, mixedGroup: "boy" },
    ],
  },

  // ─── Oztag ──────────────────────────────────────────────────
  // U10 mixed: 8 on the field, 2 × 15-min halves, on Oztag's mixed rule (at
  // most 4 boys, at least 1 girl). A girl's try counts 2, the sport's
  // default. 12 players (= 8 + 4 interchange), six girls and six boys.
  oztag: {
    teamName: "Demo Oztag",
    ageGroup: "U10",
    settings: mixedRuleColumns(OZTAG_MIXED_RULE),
    players: [
      { name: "Scarlett Byers", jersey: 1, mixedGroup: "girl" },
      { name: "Ryder Collins", jersey: 2, mixedGroup: "boy" },
      { name: "Harriet Vu", jersey: 3, mixedGroup: "girl" },
      { name: "Flynn Morrow", jersey: 4, mixedGroup: "boy" },
      { name: "Ivy Pemberton", jersey: 5, mixedGroup: "girl" },
      { name: "Beau Kennedy", jersey: 6, mixedGroup: "boy" },
      { name: "Georgia Lam", jersey: 7, mixedGroup: "girl" },
      { name: "Austin Greer", jersey: 8, mixedGroup: "boy" },
      { name: "Maya Iqbal", jersey: 9, mixedGroup: "girl" },
      { name: "Spencer Wade", jersey: 10, mixedGroup: "boy" },
      { name: "Olive Chambers", jersey: 11, mixedGroup: "girl" },
      { name: "Hunter Bligh", jersey: 12, mixedGroup: "boy" },
    ],
  },

  // ─── Hockey ─────────────────────────────────────────────────
  // U10 half-field: 7 a side with a keeper, 2 × 20-min halves, and
  // turns in goal, so the keeper top changes hands at half-time.
  // 10 players (= 7 + 3 bench).
  hockey: {
    teamName: "Demo Hockey",
    ageGroup: "U10",
    settings: {},
    players: [
      { name: "Elsie Marsh", jersey: 1 },
      { name: "Rohan Kapoor", jersey: 2 },
      { name: "Tilly Beaumont", jersey: 3 },
      { name: "Callum Pryce", jersey: 4 },
      { name: "Quinn Albright", jersey: 5 },
      { name: "Nina Sato", jersey: 6 },
      { name: "Patrick Ung", jersey: 7 },
      { name: "Frankie Dunn", jersey: 8 },
      { name: "Sophie Laing", jersey: 9 },
      { name: "Arlo Whitfield", jersey: 10 },
    ],
  },

  // ─── Futsal ─────────────────────────────────────────────────
  // U10: 5 on court with a keeper, 2 × 20-min halves, turns in goal
  // and flying subs. 9 players (= 5 + 4 bench).
  futsal: {
    teamName: "Demo Futsal",
    ageGroup: "U10",
    settings: {},
    players: [
      { name: "Mateo Silva", jersey: 1 },
      { name: "Lucia Romano", jersey: 2 },
      { name: "Yusuf Demir", jersey: 3 },
      { name: "Clara Novotny", jersey: 4 },
      { name: "Dante Ricci", jersey: 5 },
      { name: "Amira Saleh", jersey: 6 },
      { name: "Sami Aziz", jersey: 7 },
      { name: "Rosa Baptiste", jersey: 8 },
      { name: "Tobias Engel", jersey: 9 },
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
      mixed_group: p.mixedGroup ?? null,
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
