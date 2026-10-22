-- ============================================================
-- Futsal, hockey, touch football and Oztag (four-sports plan,
-- phase 0: .planning/FOUR-SPORTS-PLAN.md).
--
-- A new sport is seed rows (0061 / 0062) plus teams.sport's CHECK,
-- the one list of sports. This migration holds everything all four
-- need, so the two build tracks that follow add none:
--   1. teams.sport takes 'futsal', 'hockey', 'touch' and 'oztag'.
--   2. Each sport's game event types, written out per sport rather
--      than copied from another's, so a type another sport gains later
--      isn't theirs by accident:
--        futsal, hockey  soccer's: swap, field_zone_swap (between lines
--                        or into goal), player_lock, goal /
--                        opponent_goal
--        touch           swap, field_zone_swap (between lanes),
--                        player_lock, roster_shrink (the field shrinks
--                        when a mixed team runs short of girls), try /
--                        opponent_try
--        oztag           touch's, plus girls_try / opponent_girls_try:
--                        a girl's try in a mixed game is worth 2 (ITF
--                        rule 4.3)
--      plus the eight every sport records.
--   3. Each sport's lines: futsal and hockey play soccer's (gk, def,
--      mid, att, and field for no lines); touch and Oztag play lanes
--      (middle, link, wing, and field for Minutes only).
--   4. A mixed team's rule (touch, Oztag): at most mixed_max_boys boys
--      on the field, at least mixed_min_girls girls and mixed_min_boys
--      boys. All three null = not a mixed team; only touch and Oztag
--      teams can have one.
--   5. teams.girls_try_double: Oztag only. Null = the sport's default
--      (a girl's try counts 2 on a mixed team).
--   6. players.mixed_group and game_fill_ins.mixed_group: who a kid
--      counts as under a mixed team's rule. Asked only on mixed teams
--      and shown nowhere else; RLS is the squad's.
--   7. teams.period_count also takes 1 (one continuous period, as
--      Newcastle's junior touch plays 25 minutes), for touch and Oztag
--      only.
-- Nothing in the app creates a team in these sports until each
-- track's live game lands.
-- ============================================================

alter table public.teams drop constraint if exists teams_sport_check;
alter table public.teams
  add constraint teams_sport_check
  check (sport in (
    'afl', 'netball', 'rugby_league', 'rugby_union', 'soccer', 'basketball',
    'futsal', 'hockey', 'touch', 'oztag'
  ));

insert into public.sport_event_types (sport, type) values
  -- Futsal: every sport's eight
  ('futsal', 'lineup_set'),
  ('futsal', 'quarter_start'),
  ('futsal', 'quarter_end'),
  ('futsal', 'game_finalised'),
  ('futsal', 'player_arrived'),
  ('futsal', 'injury'),
  ('futsal', 'player_loan'),
  ('futsal', 'score_undo'),
  -- Flying subs, moves between lines and into goal, holds
  ('futsal', 'swap'),
  ('futsal', 'field_zone_swap'),
  ('futsal', 'player_lock'),
  -- Goals, both sides
  ('futsal', 'goal'),
  ('futsal', 'opponent_goal'),

  -- Hockey: every sport's eight
  ('hockey', 'lineup_set'),
  ('hockey', 'quarter_start'),
  ('hockey', 'quarter_end'),
  ('hockey', 'game_finalised'),
  ('hockey', 'player_arrived'),
  ('hockey', 'injury'),
  ('hockey', 'player_loan'),
  ('hockey', 'score_undo'),
  -- Rolling subs, moves between lines and into goal, holds
  ('hockey', 'swap'),
  ('hockey', 'field_zone_swap'),
  ('hockey', 'player_lock'),
  -- Goals, both sides
  ('hockey', 'goal'),
  ('hockey', 'opponent_goal'),

  -- Touch: every sport's eight
  ('touch', 'lineup_set'),
  ('touch', 'quarter_start'),
  ('touch', 'quarter_end'),
  ('touch', 'game_finalised'),
  ('touch', 'player_arrived'),
  ('touch', 'injury'),
  ('touch', 'player_loan'),
  ('touch', 'score_undo'),
  -- Rolling subs, moves between lanes, holds, a mid-game shrink
  ('touch', 'swap'),
  ('touch', 'field_zone_swap'),
  ('touch', 'player_lock'),
  ('touch', 'roster_shrink'),
  -- Tries, both sides
  ('touch', 'try'),
  ('touch', 'opponent_try'),

  -- Oztag: every sport's eight
  ('oztag', 'lineup_set'),
  ('oztag', 'quarter_start'),
  ('oztag', 'quarter_end'),
  ('oztag', 'game_finalised'),
  ('oztag', 'player_arrived'),
  ('oztag', 'injury'),
  ('oztag', 'player_loan'),
  ('oztag', 'score_undo'),
  -- Rolling subs, moves between lanes, holds, a mid-game shrink
  ('oztag', 'swap'),
  ('oztag', 'field_zone_swap'),
  ('oztag', 'player_lock'),
  ('oztag', 'roster_shrink'),
  -- Tries and girls' tries, both sides
  ('oztag', 'try'),
  ('oztag', 'opponent_try'),
  ('oztag', 'girls_try'),
  ('oztag', 'opponent_girls_try')
on conflict do nothing;

insert into public.sport_lines (sport, line) values
  ('futsal', 'gk'),
  ('futsal', 'def'),
  ('futsal', 'mid'),
  ('futsal', 'att'),
  ('futsal', 'field'),
  ('hockey', 'gk'),
  ('hockey', 'def'),
  ('hockey', 'mid'),
  ('hockey', 'att'),
  ('hockey', 'field'),
  ('touch', 'middle'),
  ('touch', 'link'),
  ('touch', 'wing'),
  ('touch', 'field'),
  ('oztag', 'middle'),
  ('oztag', 'link'),
  ('oztag', 'wing'),
  ('oztag', 'field')
on conflict do nothing;

-- A mixed team's rule: all three set, or none. The second branch says
-- "is not null" outright: a CHECK passes when it comes out NULL, so a
-- range test alone would let one of the three be cleared.
alter table public.teams
  add column if not exists mixed_max_boys smallint,
  add column if not exists mixed_min_girls smallint,
  add column if not exists mixed_min_boys smallint,
  add column if not exists girls_try_double boolean;

alter table public.teams drop constraint if exists teams_mixed_rule_check;
alter table public.teams
  add constraint teams_mixed_rule_check
  check (
    (mixed_max_boys is null and mixed_min_girls is null and mixed_min_boys is null)
    or (
      sport in ('touch', 'oztag')
      and mixed_max_boys is not null
      and mixed_min_girls is not null
      and mixed_min_boys is not null
      and mixed_max_boys between 0 and 15
      and mixed_min_girls between 0 and 15
      and mixed_min_boys between 0 and mixed_max_boys
    )
  );

alter table public.teams drop constraint if exists teams_girls_try_double_check;
alter table public.teams
  add constraint teams_girls_try_double_check
  check (girls_try_double is null or sport = 'oztag');

comment on column public.teams.mixed_max_boys is
  'Touch and Oztag mixed teams: at most this many boys on the field (touch 3, Oztag 4). Null with mixed_min_girls and mixed_min_boys = not a mixed team.';
comment on column public.teams.mixed_min_girls is
  'Touch and Oztag mixed teams: at least this many girls on the field (touch 1, Oztag 1).';
comment on column public.teams.mixed_min_boys is
  'Touch and Oztag mixed teams: at least this many boys on the field (touch 1, Oztag 0).';
comment on column public.teams.girls_try_double is
  'Oztag mixed teams: a girl''s try counts 2 (ITF rule 4.3). Null = the sport''s default.';

-- Who a kid counts as under a mixed team's rule.
alter table public.players
  add column if not exists mixed_group text
  check (mixed_group is null or mixed_group in ('girl', 'boy'));

comment on column public.players.mixed_group is
  'Touch and Oztag mixed teams: who the kid counts as under the boys'' cap (girl or boy). Asked only on mixed teams and shown nowhere else.';

alter table public.game_fill_ins
  add column if not exists mixed_group text
  check (mixed_group is null or mixed_group in ('girl', 'boy'));

comment on column public.game_fill_ins.mixed_group is
  'As players.mixed_group: asked when a fill-in joins a mixed team''s game.';

-- One continuous period, for touch and Oztag (0069 allowed 2 or 4).
alter table public.teams drop constraint if exists teams_period_count_check;
alter table public.teams
  add constraint teams_period_count_check
  check (
    period_count is null
    or period_count in (2, 4)
    or (period_count = 1 and sport in ('touch', 'oztag'))
  );

comment on column public.teams.period_count is
  'Periods a game plays: 2 (halves) or 4 (quarters), or 1 (one continuous period) for touch and Oztag. Null = the age group''s.';
