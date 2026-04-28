-- Per-team quarter-length override.
--
-- Sport configs ship a default `periodSeconds` per age group, but
-- coaches' actual leagues vary so widely (especially in junior
-- netball) that the age-group default rarely fits everyone. This
-- column lets each team override the duration without changing the
-- shared sport config — NULL means "use the age group default".
--
-- No CHECK constraint: any positive integer is allowed (we let the
-- form validate sane ranges like 1–30 minutes).
alter table public.teams
  add column quarter_length_seconds integer null;

comment on column public.teams.quarter_length_seconds is
  'Per-team override for quarter duration in seconds. NULL = use the age group default from sports config.';
