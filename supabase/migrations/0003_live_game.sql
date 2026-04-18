-- ============================================================
-- Auskick Manager — Slice 3: live game + event log
-- Run this in the Supabase SQL Editor after 0002.
-- ============================================================

-- ─── teams.track_scoring ─────────────────────────────────────
-- Admin opt-in: when false, live UI hides goal/behind buttons.
alter table public.teams
  add column track_scoring boolean not null default false;

-- ─── game_events ─────────────────────────────────────────────
-- Append-only event log for a live game. Client replays these
-- to compute zone-minutes, current lineup, and score.
--
-- Event types and their metadata shape:
--   lineup_set        {lineup: {back:[uuid×4], mid:[uuid×4], fwd:[uuid×4], bench:[uuid...]}}
--   quarter_start     {quarter: 1-4}
--   quarter_end       {quarter: 1-4, elapsed_ms: number}
--   swap              {off_player_id, on_player_id, zone, quarter, elapsed_ms}
--   goal              {quarter, elapsed_ms}  -- player_id set
--   behind            {quarter, elapsed_ms}  -- player_id set
--   opponent_goal     {quarter, elapsed_ms}
--   opponent_behind   {quarter, elapsed_ms}
--   player_arrived    {quarter, elapsed_ms}  -- player_id set; adds to bench
--   game_finalised    {team_score, opponent_score}
create table public.game_events (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  type       text not null check (type in (
               'lineup_set',
               'quarter_start',
               'quarter_end',
               'swap',
               'goal',
               'behind',
               'opponent_goal',
               'opponent_behind',
               'player_arrived',
               'game_finalised'
             )),
  player_id  uuid references public.players(id) on delete set null,
  metadata   jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_game_events_game_id_created_at
  on public.game_events (game_id, created_at);

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.game_events enable row level security;

create policy "game_events: read"
  on public.game_events for select
  using (public.is_team_member(public.game_team_id(game_id)));

create policy "game_events: insert"
  on public.game_events for insert
  with check (
    public.is_team_admin_or_manager(public.game_team_id(game_id))
    and (created_by is null or created_by = auth.uid())
  );

-- No update/delete: events are immutable. To correct a mistake,
-- insert a compensating event (e.g. a second swap).
