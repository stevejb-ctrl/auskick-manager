-- Add an explicit enable/disable toggle for the team song.
-- Existing rows default to true so teams that already set a song keep playing it.
alter table public.teams
  add column song_enabled boolean not null default true;
