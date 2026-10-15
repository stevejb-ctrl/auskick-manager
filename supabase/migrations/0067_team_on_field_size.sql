-- ============================================================
-- A team's own players on the field (rugby union plan, phase 2; every
-- sport).
--
-- Competitions differ by state (junior union plays 10, 12 or 15 a side
-- at U10), and half length already has a team override
-- (teams.quarter_length_seconds); on-field size had only the per-game
-- setting. NULL means the age group's default. No CHECK: the range
-- lives in each sport's config, as quarter length's does, and the app
-- keeps the value inside the age group's range (newGameDefaults.ts),
-- re-clamping it when the age group changes.
-- ============================================================

alter table public.teams
  add column if not exists on_field_size integer;

comment on column public.teams.on_field_size is
  'The team''s own players on the field; NULL = the age group''s default. New games start from it.';
