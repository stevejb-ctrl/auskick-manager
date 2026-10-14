-- ============================================================
-- Drop games.subs_per_quarter (cross-sport audit, 14 Oct 2026).
--
-- 0048 added it so sub reminders could sit at k/(N+1) of a quarter.
-- The live screens went back to the configured interval
-- (games.sub_interval_seconds, see LiveGame's sub-due cadence), so
-- nothing has read it since; its only writer, setSubsPerQuarter, had
-- no callers. A "per quarter" count also meant nothing to league's
-- halves.
-- ============================================================

alter table public.games drop column if exists subs_per_quarter;
