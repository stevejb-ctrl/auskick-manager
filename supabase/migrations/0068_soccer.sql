-- ============================================================
-- Football (soccer) (soccer plan, phase 1).
--
-- A new sport is seed rows (0061 / 0062) plus teams.sport's CHECK,
-- the one list of sports:
--   1. teams.sport takes 'soccer'.
--   2. Soccer's game event types. No new type: soccer reuses the
--      types whose meaning matches, written out here rather than
--      copied from another sport's, so a type another sport gains
--      later isn't soccer's by accident:
--        swap             a sub
--        field_zone_swap  an on-field kid moves between lines or into
--                         goal
--        player_lock      a hold, such as the keeper's for the half
--        goal / opponent_goal
--      plus the eight every sport records.
--   3. Soccer's lines (src/lib/sports/soccer/types.ts): defence,
--      midfield and attack, `field` for 4 a side (no lines), and `gk`
--      for goal, where "keen keeper" and "not in goal" prefs sit.
-- 0064 already refuses a vest strategy for any sport but league.
-- Nothing in the app creates a soccer team until phase 2.
-- ============================================================

alter table public.teams drop constraint if exists teams_sport_check;
alter table public.teams
  add constraint teams_sport_check
  check (sport in ('afl', 'netball', 'rugby_league', 'rugby_union', 'soccer'));

insert into public.sport_event_types (sport, type) values
  -- Every sport
  ('soccer', 'lineup_set'),
  ('soccer', 'quarter_start'),
  ('soccer', 'quarter_end'),
  ('soccer', 'game_finalised'),
  ('soccer', 'player_arrived'),
  ('soccer', 'injury'),
  ('soccer', 'player_loan'),
  ('soccer', 'score_undo'),
  -- Rolling subs and window batches, moves between lines and into
  -- goal, holds (the keeper's for the half)
  ('soccer', 'swap'),
  ('soccer', 'field_zone_swap'),
  ('soccer', 'player_lock'),
  -- Goals, both sides
  ('soccer', 'goal'),
  ('soccer', 'opponent_goal')
on conflict do nothing;

insert into public.sport_lines (sport, line) values
  ('soccer', 'gk'),
  ('soccer', 'def'),
  ('soccer', 'mid'),
  ('soccer', 'att'),
  ('soccer', 'field')
on conflict do nothing;
