-- ============================================================
-- Multi-sport foundation.
--
-- Adds a `sport` column to teams so each team declares which
-- sport config it follows (AFL, netball). Additive + backwards-
-- compatible: every existing row gets 'afl' on default.
--
-- Also relaxes two check constraints that are too AFL-specific:
--
--   1. teams.age_group — the existing CHECK limits values to
--      AFL's U8..U17. Netball age groups are `set`, `go`, `11u`,
--      `12u`, `13u`, `open`. We drop the CHECK and let the app
--      config enforce validity. The Team.age_group column stays
--      text for maximum flexibility.
--
--   2. game_events.type — the current enum whitelist is already
--      sport-specific. We keep the existing AFL types and add
--      the two new netball-relevant markers that don't already
--      overlap. (Netball re-uses goal / opponent_goal / swap /
--      lineup_set / quarter_start / quarter_end / player_arrived
--      / injury / game_finalised.)
-- ============================================================

-- ─── teams.sport ─────────────────────────────────────────────
alter table public.teams
  add column if not exists sport text not null default 'afl'
    check (sport in ('afl','netball'));

comment on column public.teams.sport is
  'Sport identifier. Drives the SportConfig lookup (positions, '
  'score types, substitution rule). See src/lib/sports/.';

-- Index so the dashboard can group by sport cheaply.
create index if not exists idx_teams_sport
  on public.teams (sport);

-- ─── teams.age_group — drop the AFL-only whitelist ──────────
-- Per-sport age-group validity is enforced by the app config
-- (SportConfig.ageGroups[].id). The column remains text, not null.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teams'
      and constraint_name = 'teams_age_group_check'
  ) then
    alter table public.teams drop constraint teams_age_group_check;
  end if;
end $$;

-- ─── game_events.type — widen for netball ────────────────────
-- Netball adds one new event type we don't already have:
--   * period_break_swap — snapshots the lineup about to take the
--     court at a quarter break (distinct from mid-play 'swap',
--     which netball never emits since subs are period-break only).
-- Re-create the check with both AFL and netball types. If the
-- constraint doesn't exist (older DB), skip the drop.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'game_events'
      and constraint_name = 'game_events_type_check'
  ) then
    alter table public.game_events drop constraint game_events_type_check;
  end if;
end $$;

alter table public.game_events
  add constraint game_events_type_check check (type in (
    -- Shared core
    'lineup_set',
    'quarter_start',
    'quarter_end',
    'game_finalised',
    'player_arrived',
    'injury',
    -- AFL mid-play rotation
    'swap',
    'field_zone_swap',
    'player_loan',
    -- Netball period-break rotation
    'period_break_swap',
    -- Scoring (shared — netball uses only goal/opponent_goal)
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'score_undo'
  ));
