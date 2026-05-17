-- Per-game override for mid-quarter substitutions (netball).
--
-- Migration 0035 added `teams.allow_mid_quarter_subs` as a team-wide
-- default. This migration adds the matching per-game override so a
-- coach can flip the setting for ONE match without affecting the
-- team-level default. Same shape as the existing per-game
-- `quarter_length_seconds` override (migration 0027).
--
-- Resolution order at the live-page level:
--   1. `games.allow_mid_quarter_subs` (per-game override; NULL = inherit)
--   2. `teams.allow_mid_quarter_subs` (team default)
--   3. false (hard default)
--
-- AFL ignores this column — AFL has its own interchange flow that
-- doesn't read either column.
--
-- Default NULL: existing games inherit the team setting. Coaches
-- flip it for THIS match only via the netball pre-game Game
-- settings collapse.
alter table public.games
  add column allow_mid_quarter_subs boolean null;

comment on column public.games.allow_mid_quarter_subs is
  'Per-game override for the team-level allow_mid_quarter_subs flag. NULL means "use the team setting". Set in the netball pre-game Game settings drop-down for this match only.';
