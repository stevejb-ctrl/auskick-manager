-- Demo team flag and clock multiplier for sped-up demo games.
alter table public.teams
  add column is_demo boolean not null default false;

alter table public.games
  add column clock_multiplier float8 not null default 1;
