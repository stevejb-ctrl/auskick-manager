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
  | "U16"
  | "U17";

export type PositionModel = "zones3" | "positions5";

export interface Team {
  id: string;
  name: string;
  track_scoring: boolean;
  age_group: AgeGroup;
  playhq_url: string | null;
  /** Public Supabase Storage URL for the team song, or null if none set. */
  song_url: string | null;
  /** Seconds into the song to start playback from (defaults to 0). */
  song_start_seconds: number;
  /** Whether goal-song playback is enabled. The URL is kept when disabled. */
  song_enabled: boolean;
  is_demo: boolean;
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
}

export interface Player {
  id: string;
  team_id: string;
  full_name: string;
  jersey_number: number;
  is_active: boolean;
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
  | "field_zone_swap";

export interface Lineup {
  back: string[];
  hback: string[];
  mid: string[];
  hfwd: string[];
  fwd: string[];
  bench: string[];
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
export type ActionResult =
  | { success: true; data?: unknown }
  | { success: false; error: string };
