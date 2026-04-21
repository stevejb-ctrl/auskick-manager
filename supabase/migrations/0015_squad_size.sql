-- Relax the on_field_size constraint to allow squads of 5–20.
-- The previous limit of 6–18 was tied to official AFL junior rules;
-- this gives coaches the flexibility to run games with whatever
-- number of players they actually have on the day.

alter table public.games
  drop constraint if exists games_on_field_size_check;

alter table public.games
  add constraint games_on_field_size_check
    check (on_field_size between 5 and 20);
