-- ============================================================
-- Add enforce_unbroken_periods flag to teams + games.
--
-- Junior League §6 requires each player to complete two full
-- quarters (U6–U9) or one full half (U10–U12) without being
-- subbed out during that period. Many casual competitions don't
-- enforce this strictly, so the feature is opt-in and off by
-- default.
--
-- Two independent booleans:
--
--   teams.enforce_unbroken_periods  — team-level default, set in
--       Team Settings. Acts as the standing preference for that
--       team; coaches who always run §6-compliant rotations flip
--       this once and all future games inherit it when the game
--       creation flow is wired (follow-up phase).
--
--   games.enforce_unbroken_periods  — per-game override, editable
--       in the in-game "Game settings" sheet. Lets a coach keep
--       the team default off for training but flip it on for a
--       comp game, or vice-versa.
--
-- The live-game sub-rotation planner reads games.enforce_unbroken_periods
-- and ignores the §6 rule when it is false.
-- ============================================================

alter table public.teams
  add column if not exists enforce_unbroken_periods boolean not null default false;

alter table public.games
  add column if not exists enforce_unbroken_periods boolean not null default false;
