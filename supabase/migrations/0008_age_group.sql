-- Multi age-group support.
--   • teams.age_group: U8..U17, drives defaults for new games.
--   • games.on_field_size: widened from 6-12 to 6-18 so U11+ age groups can
--     field up to 15 or 18 players.
-- Existing teams default to U10 (current app behaviour). Existing games keep
-- their on_field_size unchanged.

alter table public.teams
  add column if not exists age_group text not null default 'U10'
    check (age_group in (
      'U8','U9','U10','U11','U12','U13','U14','U15','U16','U17'
    ));

alter table public.games
  drop constraint if exists games_on_field_size_check;

alter table public.games
  add constraint games_on_field_size_check
    check (on_field_size between 6 and 18);
