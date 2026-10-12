-- ============================================================
-- player_game_time (UX plan §7.5 v2, chunk 4.5).
--
-- A per-game rollup of each player's time per unit — AFL zones,
-- netball bibs, league lines — so season balance and stats sum
-- ~1,500 rows a season instead of walking every game_event.
--
--   * Written when a game is finalised; deleted when a game is
--     restarted (its events go, so its time does too).
--   * Backfilled on read: stats derive and store rows for any
--     finalised game that has none (no separate backfill script).
--   * played_at = the game's first event, so a season-balance reset
--     (team_playbooks.season_balance_since) is a simple filter.
--
-- player_id has no FK: fill-in players live in game_fill_ins.
-- Members read; coaches and managers (who finalise games) write.
-- ============================================================

create table public.player_game_time (
  game_id   uuid not null references public.games(id) on delete cascade,
  team_id   uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null,
  unit_kind text not null check (unit_kind in ('zone', 'line', 'third', 'bib', 'position')),
  unit_key  text not null,
  ms        integer not null check (ms >= 0),
  periods   numeric(6, 2) not null default 0,
  played_at timestamptz not null,
  primary key (game_id, player_id, unit_kind, unit_key)
);

create index player_game_time_team_idx on public.player_game_time (team_id, played_at);

alter table public.player_game_time enable row level security;

create policy "player_game_time: read"
  on public.player_game_time for select
  using (public.is_team_member(team_id));
create policy "player_game_time: insert"
  on public.player_game_time for insert
  with check (
    public.is_team_admin_or_manager(team_id)
    and public.game_team_id(game_id) = team_id
  );
create policy "player_game_time: delete"
  on public.player_game_time for delete
  using (public.is_team_admin_or_manager(team_id));
