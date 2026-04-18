-- ============================================================
-- Auskick Manager — Slice 3 addendum: sub interval per game
-- ============================================================

alter table public.games
  add column sub_interval_seconds integer not null default 180
  check (sub_interval_seconds between 30 and 900);
