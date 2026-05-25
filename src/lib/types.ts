// ─── Database type scaffold ───────────────────────────────────
// After running `npx supabase gen types typescript` you can replace
// this with the generated file. These types mirror the schema exactly.

// Identity passed to live-game server actions. Authed path uses
// teamId + RLS; public runner path uses a share_token that server
// actions validate before writing via the admin client.
export type LiveAuth =
  | { kind: "team"; teamId: string }
  | { kind: "token"; token: string };

export type TeamRole = "admin" | "game_manager" | "parent";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  /** Cross-tenant admin flag. Gates access to /admin/*. */
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

// ─── CRM / super-admin types ──────────────────────────────────
// These tables are service-role only (see migration 0018). UI access
// funnels through requireSuperAdmin() + createAdminClient().

export interface ContactTag {
  id: string;
  name: string;
  /** Design-token colour key (e.g. "brand", "warn", "ok"). */
  color: string;
  created_at: string;
}

export interface ProfileTag {
  profile_id: string;
  tag_id: string;
  assigned_by: string | null;
  assigned_at: string;
}

export interface ContactNote {
  id: string;
  profile_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface ContactPreference {
  profile_id: string;
  unsubscribed_at: string | null;
  unsub_reason: string | null;
  updated_at: string;
}

export type AgeGroup =
  | "U8"
  | "U9"
  | "U10"
  | "U11"
  | "U12"
  | "U13"
  | "U14"
  | "U15"
  // Steve 2026-05-20: U16+ splits by gender — Boys play 18-a-side,
  // Girls play 16-a-side per AFL Junior Match Policy. The unsplit
  // "U16" / "U17" IDs stay in the union as legacy aliases (older
  // teams created before the split was added) and resolve to the
  // boys config; the new-team picker only surfaces the explicit
  // gendered IDs.
  | "U16"
  | "U16_boys"
  | "U16_girls"
  | "U17"
  | "U17_boys"
  | "U17_girls"
  | "U18_boys"
  | "U18_girls";

export type PositionModel = "zones3" | "positions5";

/** Sport identifier stored on Team. Drives SportConfig lookup. */
export type Sport = "afl" | "netball" | "rugby_league";

export interface Team {
  id: string;
  name: string;
  /** Sport config identifier — "afl" or "netball". Legacy rows default to "afl". */
  sport: Sport;
  track_scoring: boolean;
  /** Opaque age-group id. Valid values depend on `sport` (SportConfig.ageGroups). */
  age_group: string;
  playhq_url: string | null;
  /** Public Supabase Storage URL for the team song, or null if none set. */
  song_url: string | null;
  /** Seconds into the song to start playback from (defaults to 0). */
  song_start_seconds: number;
  /** Whether goal-song playback is enabled. The URL is kept when disabled. */
  song_enabled: boolean;
  /**
   * Per-team override for quarter duration in seconds. NULL means
   * "use the age-group default from the sport config". Set when a
   * coach's league plays a non-standard quarter length (common in
   * junior netball where regions vary widely).
   */
  quarter_length_seconds: number | null;
  /** Marks the shared demo team — page at /demo uses this flag to find it. */
  is_demo: boolean;
  /** Optional human labels for the three player chip slots. Coach
   *  decides what each chip means; suggester just balances the keys. */
  chip_a_label: string | null;
  chip_b_label: string | null;
  chip_c_label: string | null;
  /** Per-chip behaviour: "split" spreads chip-mates across zones,
   *  "group" funnels them into the same zone. Defaults to "split"
   *  on existing teams (Phase D launched behaviour). */
  chip_a_mode: import("@/lib/chips").ChipMode;
  chip_b_mode: import("@/lib/chips").ChipMode;
  chip_c_mode: import("@/lib/chips").ChipMode;
  /**
   * Short, phone-typing-friendly code the manager can hand to a
   * parent verbally. Parent enters it on /join-team to land as a
   * `parent` membership. Migration 0041. Format: "ABCD-EFGH" from a
   * 31-char alphabet (no 0/O/1/I/L). Reusable until the manager
   * regenerates it from team settings.
   */
  join_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMembership {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  invited_by: string | null;
  created_at: string;
}

export interface TeamInvite {
  id: string;
  team_id: string;
  token: string;
  role: TeamRole;
  email_hint: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  // Email-driven invites (migration 0039). When `invited_email` is null
  // the row represents a legacy copy-link-only invite and the remaining
  // fields stay null/0 forever.
  invited_email: string | null;
  email_sent_at: string | null;
  email_send_count: number;
  last_email_error: string | null;
}

/**
 * Player cohort chip — one of three coach-labeled tags. Used by the
 * fairness suggester to spread chips evenly across zones (e.g. so
 * a coach who marked "older / younger" gets a mix in each line).
 * The semantic meaning of A/B/C lives on the team (chip_a_label etc).
 */
export type PlayerChip = "a" | "b" | "c";

export interface Player {
  id: string;
  team_id: string;
  full_name: string;
  jersey_number: number | null;
  is_active: boolean;
  /**
   * Optional cohort tag — see PlayerChip + Team.chip_*_label.
   * Optional in the type so existing test fixtures (and rows from
   * before migration 0030) don't have to specify it. At runtime the
   * DB column returns null when unset; treat undefined identically.
   */
  chip?: PlayerChip | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Per-game "fill in" — not on the permanent squad but added on the day.
// Stats aggregation collapses every fill-in into a single synthetic row
// (see FILL_IN_STATS_ID below) so they don't pollute season totals.
export interface FillIn {
  id: string;
  game_id: string;
  full_name: string;
  jersey_number: number | null;
  created_by: string | null;
  created_at: string;
}

/** Synthetic player id used when aggregating fill-in stats across a season. */
export const FILL_IN_STATS_ID = "__fill_in__";

export type GameStatus = "upcoming" | "in_progress" | "completed";
export type AvailabilityStatus = "available" | "unavailable" | "unknown";

export interface Game {
  id: string;
  team_id: string;
  opponent: string;
  scheduled_at: string;
  location: string | null;
  round_number: number | null;
  notes: string | null;
  status: GameStatus;
  sub_interval_seconds: number;
  share_token: string;
  on_field_size: number;
  /**
   * Junior Rugby League §6 opt-in. When true, the sub-rotation
   * planner enforces the "each player must complete an unbroken
   * quarter/half" rule. False = rule ignored (default for casual
   * comps). Editable per-game via Game Settings; team-level
   * default lives on `teams.enforce_unbroken_periods`.
   * Optional: column added in migration 0046; defaults to false.
   */
  enforce_unbroken_periods?: boolean;
  /**
   * Rugby-league only. When true, every LeaguePlayerTile renders the
   * AFL-style F/C/B stacked time bar showing the share of game time
   * each player spent in forwards / centre / backs. "Centre" maps to
   * time wearing the FR or DH vest (no native centre zone in junior
   * RL). Editable per-game via Game Settings; team-level default
   * lives on `teams.track_zone_time`.
   * Optional: column added in migration 0047; defaults to false.
   */
  track_zone_time?: boolean;
  /**
   * Per-game override for quarter duration in seconds. NULL =
   * inherit the team default (which itself may fall back to the
   * age-group default). Set at game start so a single week's
   * non-standard match length doesn't need to touch team config.
   */
  quarter_length_seconds: number | null;
  /** Multiplier applied to the clock for demo games (1 = real-time, 6 = 6× speed). */
  clock_multiplier: number;
  external_source: string | null;
  external_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GameAvailability {
  id: string;
  game_id: string;
  player_id: string;
  status: AvailabilityStatus;
  updated_by: string | null;
  updated_at: string;
}

export type Zone = "back" | "hback" | "mid" | "hfwd" | "fwd";

export type GameEventType =
  | "lineup_set"
  | "quarter_start"
  | "quarter_end"
  | "swap"
  | "goal"
  | "behind"
  | "opponent_goal"
  | "opponent_behind"
  | "player_arrived"
  | "game_finalised"
  | "injury"
  | "score_undo"
  | "field_zone_swap"
  | "player_loan"
  // Mid-quarter on-field-size REDUCTION. Metadata:
  //   { remove_player_ids: string[], new_size, quarter, elapsed_ms }
  // Replays as: close each removed player's open stint, drop them
  // from their zone, push them to bench. Used by
  // LiveGameSettingsModal when the coach shrinks field count
  // mid-quarter. Growing doesn't need an event — the
  // games.on_field_size update + displayZoneCaps suffices and
  // the coach drags via existing swap UI (Steve 2026-05-20).
  | "roster_shrink"
  // Netball: subs only happen at period breaks, so we emit a single
  // lineup-snapshot event per break instead of per-player `swap`s.
  | "period_break_swap"
  // Rugby league scoring (try = 4, conversion = 2, opp variants).
  // conversion_attempt metadata: { made: boolean, force?: boolean, tryEventId?: string }.
  | "try"
  | "opponent_try"
  | "conversion_attempt"
  | "opponent_conversion"
  // Rugby league rotations. Junior Laws §15 (goal-kick) and §16 (kickoff)
  // both rotate per-team; junior Laws §12 vests rotate per-period with
  // a "no vest worn twice in one match" rule. All three are derived by
  // replaying the event log — no separate state table.
  | "kickoff_taken"
  | "vest_assigned"
  // Rugby league forward↔back position swap during live play. The
  // coach long-presses a player tile and picks "Move to backs" /
  // "Move to forwards"; we emit this event with metadata
  // { to_zone: "forward" | "back" }. The replayer moves the player
  // between the lineup.forwards and lineup.backs buckets without
  // changing field membership. Single-player (no paired swap).
  | "league_position_change";

export interface Lineup {
  back: string[];
  hback: string[];
  mid: string[];
  hfwd: string[];
  fwd: string[];
  bench: string[];
}

// Pre-game saved lineup. One per game; deleted at kickoff so the
// lineup_set event takes over as the source of truth.
export interface LineupDraft {
  game_id: string;
  lineup: Lineup;
  on_field_size: number;
  sub_interval_seconds: number;
  updated_by: string | null;
  updated_at: string;
}

// Normalise a lineup read from event metadata — legacy events only have
// back/mid/fwd/bench. Ensures hback/hfwd are always present arrays.
export function normalizeLineup(l: Partial<Lineup> | null | undefined): Lineup {
  return {
    back: l?.back ? [...l.back] : [],
    hback: l?.hback ? [...l.hback] : [],
    mid: l?.mid ? [...l.mid] : [],
    hfwd: l?.hfwd ? [...l.hfwd] : [],
    fwd: l?.fwd ? [...l.fwd] : [],
    bench: l?.bench ? [...l.bench] : [],
  };
}

export function emptyLineup(): Lineup {
  return { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
}

// ─── Rugby league lineup ─────────────────────────────────────
// Two on-field buckets — forwards and backs — plus a bench. The
// forward/back split is optional but coaches who lean on it get a
// chip-driven auto-suggester that keeps forwards-with-forwards and
// backs-with-backs. Vested roles (FR / DH) are still tracked
// separately via vest_assigned events; a vest wearer is either a
// forward or a back depending on which pool they sit in.
//
// Migration note: the original RL shape was `{ field, bench }`. We
// keep `normalizeLeagueLineup` permissive so any legacy `field`
// payloads collapse into `forwards` (best-guess), keeping replay of
// old draft rows alive during the position-aware rollout.
export interface LeagueLineup {
  forwards: string[];
  backs: string[];
  bench: string[];
}

export type LeagueZone = "forward" | "back";

export function emptyLeagueLineup(): LeagueLineup {
  return { forwards: [], backs: [], bench: [] };
}

export function normalizeLeagueLineup(
  l: Partial<LeagueLineup> | (Partial<LeagueLineup> & { field?: string[] }) | null | undefined,
): LeagueLineup {
  const legacyField = (l as { field?: string[] } | null | undefined)?.field;
  // Pre-zone payloads stored everyone in `field`. Migrate by stuffing
  // them all into `forwards` — the coach can rebalance from the
  // picker. Without this fallback, a draft saved before the zone
  // rollout would lose its on-field players.
  return {
    forwards: l?.forwards
      ? [...l.forwards]
      : legacyField
        ? [...legacyField]
        : [],
    backs: l?.backs ? [...l.backs] : [],
    bench: l?.bench ? [...l.bench] : [],
  };
}

/** All on-field player ids (forwards + backs), in display order. */
export function leagueOnField(lineup: LeagueLineup): string[] {
  return [...lineup.forwards, ...lineup.backs];
}

export interface GameEvent {
  id: string;
  game_id: string;
  type: GameEventType;
  player_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// ─── Supabase database shape (minimal — expand as schema grows) ───
// Shape required by @supabase/supabase-js v2.45+. Each table needs
// Row/Insert/Update/Relationships; CompositeTypes must be present.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, "id" | "created_at">>;
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: Omit<Team, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Team, "id" | "created_at">>;
        Relationships: [];
      };
      team_memberships: {
        Row: TeamMembership;
        Insert: Omit<TeamMembership, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<TeamMembership, "id" | "created_at">>;
        Relationships: [];
      };
      players: {
        Row: Player;
        Insert: Omit<Player, "id" | "created_at" | "updated_at"> & {
          id?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Player, "id" | "created_at">>;
        Relationships: [];
      };
      games: {
        Row: Game;
        Insert: Omit<Game, "id" | "created_at" | "updated_at" | "status"> & {
          id?: string;
          status?: GameStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Game, "id" | "created_at">>;
        Relationships: [];
      };
      game_availability: {
        Row: GameAvailability;
        Insert: Omit<GameAvailability, "id" | "updated_at" | "status"> & {
          id?: string;
          status?: AvailabilityStatus;
          updated_at?: string;
        };
        Update: Partial<Omit<GameAvailability, "id">>;
        Relationships: [];
      };
      game_events: {
        Row: GameEvent;
        Insert: Omit<GameEvent, "id" | "created_at" | "metadata"> & {
          id?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      game_fill_ins: {
        Row: FillIn;
        Insert: Omit<FillIn, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<FillIn, "id" | "game_id" | "created_at">>;
        Relationships: [];
      };
      team_invites: {
        Row: TeamInvite;
        Insert: Omit<
          TeamInvite,
          "id" | "token" | "created_at" | "expires_at" | "accepted_at" | "accepted_by" | "revoked_at"
        > & {
          id?: string;
          token?: string;
          created_at?: string;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
        };
        Update: Partial<Omit<TeamInvite, "id" | "team_id" | "token" | "created_at">>;
        Relationships: [];
      };
      contact_tags: {
        Row: ContactTag;
        Insert: Omit<ContactTag, "id" | "created_at" | "color"> & {
          id?: string;
          color?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ContactTag, "id" | "created_at">>;
        Relationships: [];
      };
      profile_tags: {
        Row: ProfileTag;
        Insert: Omit<ProfileTag, "assigned_at"> & {
          assigned_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      contact_notes: {
        Row: ContactNote;
        Insert: Omit<ContactNote, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      contact_preferences: {
        Row: ContactPreference;
        Insert: Omit<ContactPreference, "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<Omit<ContactPreference, "profile_id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      team_role: TeamRole;
    };
    CompositeTypes: Record<string, never>;
  };
};

// ─── Action result type ───────────────────────────────────────
// Generic so callers that return real data (e.g. createTag returning the
// inserted row so the client can replace its temp-id placeholder) get
// proper type narrowing on `.data`. Defaults to `unknown` for the bulk
// of actions that just signal success/failure.
export type ActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string };
