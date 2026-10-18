-- ============================================================
-- Basketball (basketball plan, phase 1).
--
-- A new sport is seed rows (0061 / 0062) plus teams.sport's CHECK,
-- the one list of sports:
--   1. teams.sport takes 'basketball'.
--   2. Basketball's game event types, written out here rather than
--      copied from another sport's, so a type another sport gains
--      later isn't basketball's by accident:
--        swap             a sub (rolling, at a dead ball)
--        field_zone_swap  a kid on court moves between guards and
--                         forwards, or two swap positions
--        player_lock      a hold (Keep on, Keep in a line)
--        free_throw / two_pointer / three_pointer, and the opponent's
--                         baskets: 1, 2 and 3 points
--        foul             the coach's tally of a kid's fouls
--        sit_out          a timed sit-out (the 5-minute sin bin)
--      plus the eight every sport records. A foul-out is an `injury`
--      with reason "fouled_out": out for the game.
--   3. Basketball's lines (src/lib/sports/basketball/types.ts): guards,
--      forwards, and `court` for Equal minutes (no positions).
--   4. teams.period_count: halves (2, the default) or quarters (4).
--      Null plays the age group's periods. Only basketball reads it
--      today; the column says nothing sport-specific.
-- ============================================================

alter table public.teams drop constraint if exists teams_sport_check;
alter table public.teams
  add constraint teams_sport_check
  check (sport in ('afl', 'netball', 'rugby_league', 'rugby_union', 'soccer', 'basketball'));

insert into public.sport_event_types (sport, type) values
  -- Every sport
  ('basketball', 'lineup_set'),
  ('basketball', 'quarter_start'),
  ('basketball', 'quarter_end'),
  ('basketball', 'game_finalised'),
  ('basketball', 'player_arrived'),
  ('basketball', 'injury'),
  ('basketball', 'player_loan'),
  ('basketball', 'score_undo'),
  -- Rolling subs, moves between lines and positions, holds
  ('basketball', 'swap'),
  ('basketball', 'field_zone_swap'),
  ('basketball', 'player_lock'),
  -- Baskets, both sides
  ('basketball', 'free_throw'),
  ('basketball', 'two_pointer'),
  ('basketball', 'three_pointer'),
  ('basketball', 'opponent_free_throw'),
  ('basketball', 'opponent_two_pointer'),
  ('basketball', 'opponent_three_pointer'),
  -- Fouls and sit-outs
  ('basketball', 'foul'),
  ('basketball', 'sit_out')
on conflict do nothing;

insert into public.sport_lines (sport, line) values
  ('basketball', 'guard'),
  ('basketball', 'forward'),
  ('basketball', 'court')
on conflict do nothing;

alter table public.teams
  add column if not exists period_count smallint
  check (period_count is null or period_count in (2, 4));

comment on column public.teams.period_count is
  'Periods a game plays: 2 (halves) or 4 (quarters). Null = the age group''s. Basketball reads it (2 × 20 or 4 × 10).';
