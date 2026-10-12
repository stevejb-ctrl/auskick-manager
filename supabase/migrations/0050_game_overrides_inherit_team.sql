-- ============================================================
-- Per-game rugby league toggles inherit the team default.
--
-- 0046 / 0047 added games.enforce_unbroken_periods and
-- games.track_zone_time as NOT NULL DEFAULT false, but every reader
-- resolves them as `game ?? team ?? false` — "null = inherit the
-- team's standing preference". With a NOT NULL false default the
-- game value always won, so a coach who turned either setting on in
-- Team settings never saw it apply to a new game (UX plan H7).
--
-- Make both columns nullable with a null default. Existing `false`
-- rows become null: they were almost all the column default, and a
-- false game override only differs from inheriting when the team
-- default is on — which is exactly the case that never worked.
-- Explicit mid-game toggles keep writing true / false.
-- ============================================================

alter table public.games
  alter column enforce_unbroken_periods drop not null,
  alter column enforce_unbroken_periods set default null,
  alter column track_zone_time drop not null,
  alter column track_zone_time set default null;

update public.games set enforce_unbroken_periods = null where enforce_unbroken_periods = false;
update public.games set track_zone_time = null where track_zone_time = false;
