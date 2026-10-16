-- ============================================================
-- Retire cohort chips (UX plan 5.8): what each coach meant by their
-- chips carries over into How we play, then the chips UI goes.
--
--   * A chip linked to a line (forward / centre / back) → a "home"
--     line pref for each chipped player (AFL fwd/mid/back, netball
--     thirds, league forwards/backs). For AFL open ages and netball, a
--     "stays home" Prefer rule lists them too, so the suggester keeps
--     leaning them that way (league's Preferred line reads the home
--     pref directly; zoned AFL ages rotate everyone by rule).
--   * A split chip → "keep apart" (Prefer) for its players.
--   * A group chip → "keep together" (Prefer).
--
-- Only labelled chips on active players count (an unlabelled chip was
-- hidden in the UI). The chip columns stay, read only, for one release
-- before they're dropped.
-- ============================================================

-- 1. Home line prefs from line-linked chips.
with chipped as (
  select
    p.id as player_id,
    p.team_id,
    coalesce(t.sport, 'afl') as sport,
    case p.chip when 'a' then t.chip_a_mode when 'b' then t.chip_b_mode else t.chip_c_mode end as mode,
    case p.chip when 'a' then t.chip_a_label when 'b' then t.chip_b_label else t.chip_c_label end as label
  from public.players p
  join public.teams t on t.id = p.team_id
  where p.chip is not null and p.is_active
)
insert into public.player_position_prefs (team_id, player_id, line, kind, rank)
select
  c.team_id,
  c.player_id,
  case c.sport
    when 'netball' then
      case c.mode when 'forward' then 'attack-third' when 'centre' then 'centre-third' else 'defence-third' end
    when 'rugby_league' then
      case c.mode when 'forward' then 'forwards' else 'backs' end
    else
      case c.mode when 'forward' then 'fwd' when 'centre' then 'mid' else 'back' end
  end,
  'home',
  0
from chipped c
where c.mode in ('forward', 'centre', 'back')
  and nullif(btrim(c.label), '') is not null
  and not (c.sport = 'rugby_league' and c.mode = 'centre')
  and not exists (
    select 1 from public.player_position_prefs x where x.player_id = c.player_id and x.kind = 'home'
  );

-- 2. Rules from chips: stays home (line-linked), apart (split), together (group).
with chipped as (
  select
    p.id as player_id,
    p.team_id,
    coalesce(t.sport, 'afl') as sport,
    t.age_group,
    p.chip,
    case p.chip when 'a' then t.chip_a_mode when 'b' then t.chip_b_mode else t.chip_c_mode end as mode,
    case p.chip when 'a' then t.chip_a_label when 'b' then t.chip_b_label else t.chip_c_label end as label
  from public.players p
  join public.teams t on t.id = p.team_id
  where p.chip is not null and p.is_active
),
labelled as (
  select * from chipped where nullif(btrim(label), '') is not null
),
home_rules as (
  select
    team_id,
    jsonb_build_object(
      'id', 'chips-home',
      'kind', 'stays-home',
      'params', jsonb_build_object('playerIds', jsonb_agg(player_id order by player_id)),
      'strength', 'prefer',
      'enabled', true,
      'source', 'chips'
    ) as rule
  from labelled
  where mode in ('forward', 'centre', 'back')
    and (sport = 'netball' or (sport = 'afl' and age_group not in ('U8', 'U9', 'U10')))
  group by team_id
),
group_rules as (
  select
    team_id,
    jsonb_build_object(
      'id', 'chip-' || chip,
      'kind', case mode when 'group' then 'keep-together' else 'keep-apart' end,
      'params', jsonb_build_object('playerIds', jsonb_agg(player_id order by player_id)),
      'strength', 'prefer',
      'enabled', true,
      'source', 'chips'
    ) as rule
  from labelled
  where mode in ('split', 'group')
  group by team_id, chip, mode
  having count(*) >= 2
),
all_rules as (
  select team_id, jsonb_agg(rule) as rules
  from (select * from home_rules union all select * from group_rules) r
  group by team_id
)
insert into public.team_playbooks (team_id, rules)
select team_id, rules from all_rules
on conflict (team_id) do update
  set rules = public.team_playbooks.rules || excluded.rules;
