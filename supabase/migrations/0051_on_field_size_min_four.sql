-- ============================================================
-- Allow four on the field.
--
-- 0015 set games.on_field_size to 5–18, but NetSetGO Set and rugby
-- league U6/U7 allow a minimum of 4 (sport configs' minOnFieldSize),
-- so a short-squad game at those ages was rejected by the database
-- at kickoff (UX plan M10).
-- ============================================================

alter table public.games
  drop constraint if exists games_on_field_size_check;

alter table public.games
  add constraint games_on_field_size_check
    check (on_field_size between 4 and 18);
