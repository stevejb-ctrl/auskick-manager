-- ============================================================
-- Rugby union (rugby union plan, phase 2).
--
-- A new sport is seed rows (0061 / 0062) plus teams.sport's CHECK,
-- the one list of sports:
--   1. teams.sport takes 'rugby_union'.
--   2. Union's game event types: the rugby engine's, without league's
--      junior laws (no kickoff rotation, no FR / DH vests). Written out
--      here rather than copied from league's, so a type league gains
--      later isn't union's by accident. A drop goal is `field_goal`.
--   3. Union's lines: forwards and backs (src/lib/sports/rugby/playbook.ts).
-- 0064 already refuses a vest strategy for any sport but league, and
-- 0043's chip seeding stays league's (union teams get theirs from
-- createTeam).
-- ============================================================

alter table public.teams drop constraint if exists teams_sport_check;
alter table public.teams
  add constraint teams_sport_check
  check (sport in ('afl', 'netball', 'rugby_league', 'rugby_union'));

insert into public.sport_event_types (sport, type) values
  -- Every sport
  ('rugby_union', 'lineup_set'),
  ('rugby_union', 'quarter_start'),
  ('rugby_union', 'quarter_end'),
  ('rugby_union', 'game_finalised'),
  ('rugby_union', 'player_arrived'),
  ('rugby_union', 'injury'),
  ('rugby_union', 'player_loan'),
  ('rugby_union', 'score_undo'),
  -- Rolling subs, forward / back moves, a mid-game shrink
  ('rugby_union', 'swap'),
  ('rugby_union', 'league_position_change'),
  ('rugby_union', 'roster_shrink'),
  -- Tries, conversions, penalty goals and drop goals, both sides
  ('rugby_union', 'try'),
  ('rugby_union', 'opponent_try'),
  ('rugby_union', 'conversion_attempt'),
  ('rugby_union', 'opponent_conversion'),
  ('rugby_union', 'penalty_goal'),
  ('rugby_union', 'field_goal'),
  ('rugby_union', 'opponent_penalty_goal'),
  ('rugby_union', 'opponent_field_goal')
on conflict do nothing;

insert into public.sport_lines (sport, line) values
  ('rugby_union', 'forwards'),
  ('rugby_union', 'backs')
on conflict do nothing;
