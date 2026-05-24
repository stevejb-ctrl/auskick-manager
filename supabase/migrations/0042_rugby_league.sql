-- ============================================================
-- Rugby League foundation.
--
-- Adds 'rugby_league' as a third sport alongside AFL and netball.
-- Additive + backwards-compatible: no existing rows touched, no
-- column shape changes — only the CHECK whitelists widen.
--
-- Two CHECK constraints to widen:
--
--   1. teams.sport — currently allows ('afl','netball'). Add
--      'rugby_league'. Existing rows are unaffected.
--
--   2. game_events.type — junior rugby league introduces six
--      new event types:
--
--        * try                 — our team scores a try (4 points).
--                                metadata: { kickerId omitted; player_id
--                                points to the scorer }.
--        * opponent_try        — opposition scores a try (4 points).
--        * conversion_attempt  — our team kicks at goal after a try,
--                                with metadata { made: boolean,
--                                tryEventId?: uuid, force?: boolean }.
--                                The "everyone on field must attempt
--                                before any player kicks twice" rotation
--                                rule is derived by replaying these
--                                events. `force: true` bypasses the
--                                rotation check for the rare fouled-in-
--                                act-of-scoring double-kick.
--        * opponent_conversion — opposition makes a conversion (2 pts).
--                                We don't track opposition rotations so
--                                no metadata beyond the period.
--        * kickoff_taken       — who kicked off to start a period.
--                                Junior Law §16 rotates kickoffs across
--                                the squad (1 per period, longer cycle
--                                than conversion rotation).
--        * vest_assigned       — coach assigns the FR (or DH at U9+)
--                                vest for a given period.
--                                metadata: { vest: "fr"|"dh", period,
--                                replacement?: boolean }. The "no player
--                                wears a vest twice in one match" rule
--                                is enforced server-side by reading
--                                prior vest_assigned events; the
--                                replacement flag is the law's
--                                "injured-player-vest-handed-to-
--                                replacement-for-period" carve-out.
--
--      All existing AFL + netball event types stay supported. RL reuses
--      the shared core (lineup_set, swap, injury, player_arrived,
--      game_finalised, score_undo, player_loan) since junior RL has
--      rolling subs just like AFL.
-- ============================================================

-- ─── teams.sport — widen whitelist ───────────────────────────
-- Drop the existing two-sport check (added by 0024) and re-add
-- with rugby_league included. Defensive: skip the drop if the
-- constraint doesn't exist (older DB / partial-apply scenarios).
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'teams'
      and constraint_name = 'teams_sport_check'
  ) then
    alter table public.teams drop constraint teams_sport_check;
  end if;
end $$;

alter table public.teams
  add constraint teams_sport_check
  check (sport in ('afl','netball','rugby_league'));

-- ─── game_events.type — widen for rugby league ───────────────
-- Same defensive drop-and-recreate pattern as 0024.
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
    -- Rugby league scoring
    'try',
    'opponent_try',
    'conversion_attempt',
    'opponent_conversion',
    -- Rugby league rotations
    'kickoff_taken',
    'vest_assigned',
    -- Scoring (AFL + netball)
    'goal',
    'behind',
    'opponent_goal',
    'opponent_behind',
    'score_undo'
  ));
