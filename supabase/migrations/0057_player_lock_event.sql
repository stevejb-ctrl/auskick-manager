-- ============================================================
-- Saved holds: game_events.type gains 'player_lock'
--
-- A coach's Keep on / Keep in {zone} (AFL) and Keep in {position}
-- (netball) used to live only on the phone that set them (browser
-- storage for AFL, page state for netball), so a reload or a
-- co-manager's phone lost them. They're now events like player_loan:
--   player_lock  player_id, metadata { lock, quarter, elapsed_ms }
-- where lock is { kind: 'field' } | { kind: 'zone', zone } |
-- { kind: 'position', position }, or null to clear (UX plan §6).
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
    -- Scoring (AFL + netball)
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'score_undo'
  ));
