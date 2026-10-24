-- ============================================================
-- A clock pause is a game event, in every sport (round-2 usability
-- test, 24 Oct 2026).
--
-- The live clock is rebuilt from the period's quarter_start time, so a
-- pause kept only on the phone was lost on a reload: the clock came
-- back running, on by the stoppage, and the kids on the field were
-- credited minutes they sat through (AFL, soccer). Netball's clock ran
-- past the hooter and ended the quarter. Basketball and touch kept the
-- pause on the phone, so a second phone never saw it.
--
-- `clock_pause` is one pause or resume. Metadata:
--   { quarter, paused, elapsed_ms, at_ms }
-- paused false = the clock started again; elapsed_ms = the clock's
-- reading (game ms into the period); at_ms = the writing phone's wall
-- clock. Written by recordClockPause (live/actions.ts) for every sport.
-- ============================================================

insert into public.sport_event_types (sport, type) values
  ('afl', 'clock_pause'),
  ('netball', 'clock_pause'),
  ('rugby_league', 'clock_pause'),
  ('rugby_union', 'clock_pause'),
  ('soccer', 'clock_pause'),
  ('basketball', 'clock_pause'),
  ('futsal', 'clock_pause'),
  ('hockey', 'clock_pause'),
  ('touch', 'clock_pause'),
  ('oztag', 'clock_pause')
on conflict do nothing;
