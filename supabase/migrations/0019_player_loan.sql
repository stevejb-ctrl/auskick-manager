-- ============================================================
-- Auskick Manager — add player_loan event type
--
-- Sometimes the opposition is short on players and we lend one
-- of ours. The player stays off our field for the remainder of
-- the loan (like injury) and accumulates "loan minutes" toward
-- a season fairness tally so coaches can spread the favour.
--
-- Event metadata:
--   player_loan   {loaned: boolean, quarter, elapsed_ms}   -- player_id set
--                 loaned=true  starts the loan stint
--                 loaned=false ends the loan (player returns to bench)
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
    'field_zone_swap',
    'player_loan'
  ));
