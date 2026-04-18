-- ============================================================
-- Auskick Manager — Slice 3 addendum: injury event
-- Allow marking a player injured (or recovered) mid-game so
-- they're excluded from sub rotation.
--
-- Event metadata:
--   injury   {injured: boolean, quarter, elapsed_ms}   -- player_id set
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
    'injury'
  ));
