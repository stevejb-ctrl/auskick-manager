-- Issue 2 (Steve 2026-06-02): "subs should line up to period lengths".
--
-- The sub-due reminder fired on a fixed interval (sub_interval_seconds)
-- measured from the last sub, so reminders drifted and never aligned to
-- the period. Coaches think in "N subs per quarter, spread evenly" — e.g.
-- 3 subs in a 12-min quarter at the 3/6/9 minute marks.
--
-- Add subs_per_quarter alongside the existing sub_interval_seconds (kept
-- for the legacy fixed-interval fallback). Default 3. The live timer
-- places the N subs at quarterMs * k/(N+1) for k = 1..N (see
-- src/lib/live/subDistribution.ts).

alter table games
  add column subs_per_quarter integer not null default 3
  check (subs_per_quarter between 1 and 10);

comment on column games.subs_per_quarter is
  'Number of within-period sub reminders, spread evenly across the period at k/(N+1) of the period length. Default 3 (→ 3/6/9 min of a 12-min quarter).';
