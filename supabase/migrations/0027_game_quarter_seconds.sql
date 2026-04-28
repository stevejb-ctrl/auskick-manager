-- Per-game quarter-length override.
--
-- The team-level override (migration 0026) sets the default for every
-- game that team plays. Sometimes a single match runs to a non-
-- standard length — finals, double-header time slots, weather-
-- shortened games. This column lets a coach dial that in for the one
-- game without touching the team default. NULL = inherit the team
-- default (which itself may fall back to the age-group default).
--
-- Resolution at read time: game.quarter_length_seconds ??
-- team.quarter_length_seconds ?? ageGroup.periodSeconds.
alter table public.games
  add column quarter_length_seconds integer null;

comment on column public.games.quarter_length_seconds is
  'Per-game override for quarter duration in seconds. NULL = inherit the team default.';
