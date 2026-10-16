-- ============================================================
-- League goals from play: game_events.type gains penalty and
-- field goals, for us and the opposition
--
-- League U13 and up plays international laws, where a penalty goal
-- is worth 2 and a field (drop) goal 1. The national 6-12 junior
-- laws allow neither (Law 17), so only those grades offer them:
--   penalty_goal / field_goal                  player_id = kicker,
--     metadata { quarter, elapsed_ms, sport }
--   opponent_penalty_goal / opponent_field_goal
--     metadata { quarter, elapsed_ms, sport }
-- score_undo takes them back like any other score.
--
-- Same defensive drop-and-re-add as 0044, with the complete list.
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
    -- Saved holds (added in 0057)
    'player_lock',
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
    -- Rugby league goals from play, U13+ international laws (added in 0058)
    'penalty_goal',
    'field_goal',
    'opponent_penalty_goal',
    'opponent_field_goal',
    -- Scoring (AFL + netball)
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'score_undo'
  ));
