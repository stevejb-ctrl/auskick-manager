-- Add configurable play duration for the team song (default 15 s, min 5 s)
alter table public.teams
  add column song_duration_seconds integer not null default 15;
