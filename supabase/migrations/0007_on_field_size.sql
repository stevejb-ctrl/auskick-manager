-- ============================================================
-- Auskick Manager — Slice 7: configurable on-field size
-- Run in the Supabase SQL Editor after 0006.
--
-- Allows teams with fewer players (or a short-handed agreement)
-- to run a game with 9, 10, or 11 on the field instead of 12.
-- Zones auto-distribute (e.g. 11 = 4 back / 4 mid / 3 fwd).
-- ============================================================

alter table public.games
  add column on_field_size smallint not null default 12
    check (on_field_size between 6 and 12);
