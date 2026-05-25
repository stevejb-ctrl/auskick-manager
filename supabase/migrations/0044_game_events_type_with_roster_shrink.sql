-- ============================================================
-- Fix: game_events.type CHECK must include `roster_shrink`
--      AND `league_position_change`
--
-- Migration 0042 (rugby_league) AND 0043 (rugby_league_position_
-- chips) both rebuilt the game_events.type CHECK whitelist from
-- scratch. Both were written from a branch that pre-dated 0040
-- (roster_shrink_event). Result: when either runs on a database
-- that has existing `roster_shrink` rows (e.g. prod where the
-- roster-shrink feature has already shipped), the ADD CONSTRAINT
-- fails because the new list doesn't include `roster_shrink`,
-- leaving the table with NO type validation at all (the prior
-- DROP succeeded; the ADD didn't).
--
-- Prod hit this on 0042. We patched the type list manually via
-- the SQL editor with both roster_shrink AND the RL types
-- (try / opponent_try / conversion_attempt / opponent_conversion
-- / kickoff_taken / vest_assigned / league_position_change).
--
-- This migration re-adds the constraint with the COMPLETE list —
-- AFL/netball events + roster_shrink + rugby league (incl.
-- league_position_change). Defensive DROP first so it's safe to
-- run whether 0042/0043 landed cleanly, partially, or not at
-- all. Idempotent.
--
-- Steve 2026-05-25.
-- ============================================================

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
    -- AFL mid-play rotation (rugby league also uses 'swap')
    'swap',
    'field_zone_swap',
    'player_loan',
    -- Netball period-break rotation
    'period_break_swap',
    -- Mid-quarter roster shrink (added in 0040)
    'roster_shrink',
    -- Rugby league scoring + rotations (added in 0042)
    'try',
    'opponent_try',
    'conversion_attempt',
    'opponent_conversion',
    'kickoff_taken',
    'vest_assigned',
    -- Rugby league forward↔back mid-game move (added in 0043)
    'league_position_change',
    -- Scoring (AFL + netball)
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'score_undo'
  ));
