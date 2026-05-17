-- Per-team toggle for mid-quarter substitutions (netball).
--
-- Netball is overwhelmingly a "subs at the break" sport — coaches
-- swap their bench in only at the end of each quarter, and the
-- default UI hides the mid-quarter sub affordance to keep things
-- simple. But a small fraction of teams (often older Open / mixed
-- competitions) do allow rolling subs mid-quarter, and the existing
-- code path for that (`midQuarterSubs` state in NetballLiveGame +
-- the "🔄 Switch player" entry in NetballPlayerActions) just needs
-- a gate so it's hidden by default and surfaces only when the team
-- opts in via Settings.
--
-- AFL is unaffected — AFL allows interchanges by sport definition
-- and has its own swap-card flow that doesn't read this column.
--
-- Default false: existing netball teams keep their break-only sub
-- behaviour. A team that wants mid-Q subs flips this on in their
-- settings page (admin-only).
alter table public.teams
  add column allow_mid_quarter_subs boolean not null default false;

comment on column public.teams.allow_mid_quarter_subs is
  'Netball: when true, the long-press actions menu surfaces a "Switch player" affordance for mid-quarter subs. Default false (subs at the break, like every junior league plays). AFL ignores this column.';
