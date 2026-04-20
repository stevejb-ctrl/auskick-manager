-- ============================================================
-- Auskick Manager — game-day fill-in players
--
-- On match day a team may have a fill-in who isn't on the regular
-- squad. These are one-off, per-game records: they show up as a
-- normal player-shaped tile in the live UI, but stats aggregation
-- buckets every fill-in into a single synthetic "Fill-In" row so
-- the season dashboard doesn't grow a new entry for every casual
-- appearance.
--
-- Notes:
--   * Their ids are UUIDs just like permanent players — event
--     metadata references them directly in game_events.player_id.
--   * To allow that, we drop the FK on game_events.player_id: it
--     referenced players(id) and would reject fill-in ids. The
--     SET NULL-on-delete behaviour was cosmetic (we keep events
--     forever anyway), so dropping it loses nothing.
-- ============================================================

create table if not exists public.game_fill_ins (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  full_name text not null,
  jersey_number int,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists game_fill_ins_game_id_idx
  on public.game_fill_ins (game_id);

alter table public.game_fill_ins enable row level security;

create policy "game_fill_ins: read"
  on public.game_fill_ins for select
  using (public.is_team_member(public.game_team_id(game_id)));

create policy "game_fill_ins: insert"
  on public.game_fill_ins for insert
  with check (
    public.is_team_admin_or_manager(public.game_team_id(game_id))
  );

create policy "game_fill_ins: update"
  on public.game_fill_ins for update
  using (public.is_team_admin_or_manager(public.game_team_id(game_id)));

create policy "game_fill_ins: delete"
  on public.game_fill_ins for delete
  using (public.is_team_admin_or_manager(public.game_team_id(game_id)));

-- Drop the players FK on game_events.player_id so fill-in ids can
-- be written there. Integrity of the reference is now enforced at
-- the application layer (fill-in ids live in game_fill_ins, squad
-- player ids live in players — both are valid).
alter table public.game_events
  drop constraint if exists game_events_player_id_fkey;
