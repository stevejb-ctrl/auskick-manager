-- ============================================================
-- Auskick Manager — add score_undo and field_zone_swap event types
--
-- score_undo       reverses the most recent goal/behind/opponent_goal/
--                  opponent_behind event for the game. metadata:
--                  {target_event_id, original_type, quarter}
--
-- field_zone_swap  two on-field players exchange zones without going
--                  to the bench. metadata:
--                  {player_a_id, zone_a, player_b_id, zone_b,
--                   quarter, elapsed_ms}
-- ============================================================

alter table public.game_events
  drop constraint game_events_type_check;

alter table public.game_events
  add constraint game_events_type_check check (type in (
    'lineup_set',
    'quarter_start',
    'quarter_end',
    'swap',
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'player_arrived',
    'game_finalised',
    'injury',
    'score_undo',
    'field_zone_swap'
  ));
