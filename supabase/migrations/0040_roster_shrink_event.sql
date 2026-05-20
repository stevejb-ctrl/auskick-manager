-- ============================================================
-- Add `roster_shrink` to the game_events.type CHECK constraint.
--
-- Steve 2026-05-20: mid-quarter on-field-size reductions need a
-- dedicated event type. Today the on_field_size is stored on the
-- games row only; replay reads it directly. That's fine when the
-- size only changes at Q-break (the next quarter's lineup_set
-- carries the new shape). For mid-quarter reductions, though, we
-- also need to move N players from a zone to the bench at a
-- specific elapsed_ms — and the existing `swap` event can't
-- express "remove one player, no replacement" without stretching
-- its (off, on) semantics.
--
-- Event shape:
--   type:      'roster_shrink'
--   player_id: NULL (the event removes multiple players; the
--              affected list lives in metadata)
--   metadata:  {
--     "remove_player_ids": ["uuid", "uuid", ...],
--     "new_size": number,
--     "quarter": number,
--     "elapsed_ms": number
--   }
--
-- Replay treats each remove_player_id like an injury-style off-
-- field move: close that player's open stint at their current
-- zone, drop them from the zone array, push them onto bench.
-- The games.on_field_size row is updated by the same server
-- action that writes the event (atomic via Supabase txn). Growing
-- the field doesn't need an event — the games.on_field_size
-- update is enough; empty slots appear via displayZoneCaps and
-- the coach drags players in with the existing swap UI.
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
    -- AFL mid-play rotation
    'swap',
    'field_zone_swap',
    'player_loan',
    'roster_shrink',
    -- Netball period-break rotation
    'period_break_swap',
    -- Scoring (shared — netball uses only goal/opponent_goal)
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'score_undo'
  ));
