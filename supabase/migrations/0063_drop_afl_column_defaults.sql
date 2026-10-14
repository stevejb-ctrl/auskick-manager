-- ============================================================
-- No AFL-shaped column defaults (cross-sport audit, 14 Oct 2026).
--
-- A team or game written without these columns silently became an
-- AFL U10 one: sport 'afl', age group 'U10', 12 on the field and a
-- sub every 3 minutes — a netball game with 12 on court, a league
-- one with AFL's interval. Every writer now says what it means:
--   teams.sport, teams.age_group   the setup wizard, the demo seeder
--   games.on_field_size,
--   games.sub_interval_seconds     newGameDefaults(sport, age group)
--                                  in createGame, the PlayHQ import
--                                  and sync, and the demo game
-- so an insert that leaves one out is now refused (NOT NULL), not
-- quietly given AFL's.
-- ============================================================

alter table public.teams alter column sport drop default;
alter table public.teams alter column age_group drop default;

alter table public.games alter column on_field_size drop default;
alter table public.games alter column sub_interval_seconds drop default;
