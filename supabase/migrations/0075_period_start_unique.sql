-- ============================================================
-- One start per period, one Finish per game.
--
-- Two phones run one game (the coach's, and a parent's on the game-day
-- link). The live actions check the game's events before they write a
-- period start or a Finish (src/lib/live/periodGuard.ts), but that's
-- check-then-insert: two phones tapping Start within ~100 ms both pass
-- the check, and both starts land. A period with two starts counts its
-- minutes twice (UX round 2, 24 Oct 2026). These indexes close it in
-- the database: the second insert fails with 23505 naming the index, and
-- the action answers as the check would ("Another phone already started
-- Q2"; a second Finish is done) — liveWriteGuard.ts raceVerdictOf.
--
-- Every sport keeps its period in metadata.quarter (halves, quarters
-- and periods alike; rugby's, soccer's and the rest add a `sport` key
-- beside it), a whole number. The index is on the text of it, not a
-- cast to int, so an odd value can only fail to be unique, never fail
-- the insert. A quarter_start without a quarter (a few old test rows)
-- has a null key and isn't constrained.
--
-- Flows that write a period's start again:
--   - Restart (resetGame) deletes the game's events first.
--   - A retried write carries the same idempotency key; the guard finds
--     it landed and succeeds without writing (and 0033's index backs
--     that up).
-- Neither writes a second start alongside the first.
--
-- If this fails on existing duplicates, find them with:
--   select game_id, metadata->>'quarter', count(*) from game_events
--   where type = 'quarter_start' group by 1, 2 having count(*) > 1;
-- ============================================================

create unique index if not exists game_events_one_start_per_period
  on public.game_events (game_id, (metadata ->> 'quarter'))
  where type = 'quarter_start';

create unique index if not exists game_events_one_finalised
  on public.game_events (game_id)
  where type = 'game_finalised';
