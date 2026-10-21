-- 0070 — a "plays" role row: the spots a coach ticked as "Plays as"
-- when they ticked every one.
--
-- Positive roles (21 Oct 2026) store "Plays as" as `never` rows for the
-- spots left out. Every spot ticked left nothing out, so it stored
-- nothing, the same as never having picked, and the sheet reopened blank
-- (Steve: "Selecting a player as both a guard and a forward does not
-- save either"). `plays` rows record those ticks. Every engine reads
-- only home / also / never / keep_on, so they still see no restriction.

alter table public.player_position_prefs
  drop constraint if exists player_position_prefs_kind_check;

alter table public.player_position_prefs
  add constraint player_position_prefs_kind_check
  check (kind in ('home', 'also', 'never', 'keep_on', 'plays'));
