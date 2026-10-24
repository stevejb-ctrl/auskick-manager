-- ============================================================
-- Allow three on the field.
--
-- 0051 set games.on_field_size to 4–18, but futsal (every age) and
-- MiniRoos U6/U7 allow a minimum of 3 (the sport configs'
-- minOnFieldSize). Kicking off a futsal game at 3 a side wrote the
-- lineup and started the clock, then this check refused the status
-- write, so the game stayed "Upcoming"; and a futsal team set to 3 on
-- court couldn't create a game at all (UX round 3, 24 Oct 2026).
-- src/lib/__tests__/onFieldSizeConstraint.test.ts keeps this range
-- wide enough for every sport.
--
-- Numbered 0074: 0072 is taken twice on unmerged branches
-- (clock_pause, parent_availability_link) and one of them will move to
-- 0073.
-- ============================================================

alter table public.games
  drop constraint if exists games_on_field_size_check;

alter table public.games
  add constraint games_on_field_size_check
    check (on_field_size between 3 and 18);
