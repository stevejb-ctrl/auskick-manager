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
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  track_scoring: boolean;
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

export type Zone = "back" | "mid" | "fwd";

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
  | "injury";

export interface Lineup {
  back: string[];
  mid: string[];
  fwd: string[];
  bench: string[];
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
