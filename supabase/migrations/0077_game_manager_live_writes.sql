-- A game manager runs the game, so the game's own live writes must land
-- (Stagehand round 9, 29 Oct 2026). "games: update" is admin-only, so a
-- manager's kick-off (status, on-field size, sub interval, How we play
-- at kick-off), their Game settings changes and their Finish game all
-- updated nothing, with no error: the game read "Upcoming" all game and
-- never finished.
--
-- Managers may now update a team's games, but only the live columns. A
-- trigger refuses any other change from a manager with an error, so the
-- admin's edits (opponent, date, venue, links, per-game overrides) stay
-- the admin's, and a refused write says so instead of saving nothing.
-- The service role (game-day links, crons) and admins are unchanged.

create policy "games: manager live update"
  on public.games for update
  using (public.is_team_admin_or_manager(team_id))
  with check (public.is_team_admin_or_manager(team_id));

create or replace function public.games_manager_live_fields_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  live constant text[] := array[
    'status',
    'on_field_size',
    'sub_interval_seconds',
    'quarter_length_seconds',
    'playbook_snapshot',
    'track_zone_time',
    'updated_at'
  ];
begin
  if auth.uid() is null or public.is_team_admin(old.team_id) then
    return new;
  end if;
  if (to_jsonb(new) - live) is distinct from (to_jsonb(old) - live) then
    raise exception 'Only the team''s admin can change this game''s details.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_games_manager_live_fields_only
  before update on public.games
  for each row execute function public.games_manager_live_fields_only();
