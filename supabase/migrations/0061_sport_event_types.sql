-- ============================================================
-- Each sport records its own game events (cross-sport audit,
-- 14 Oct 2026).
--
-- game_events_type_check was one list for every sport, so the
-- database took a `behind` on a netball game or a `try` on an AFL
-- one, and each new type meant re-typing the whole list (0044 had
-- to restore one a rebuild dropped). sport_event_types is now the
-- one list, keyed by sport, and a trigger refuses an event type the
-- game's team's sport doesn't use.
--
-- The seed is every type each sport's live actions write:
--   afl           live/actions.ts
--   netball       live/netball-actions.ts, plus the shared
--                 late-arrival / injury / loan / hold / score-review
--                 actions in live/actions.ts
--   rugby_league  live/league-actions.ts, plus the shared
--                 late-arrival / injury / loan actions
-- A new event type is one insert here, and so is each of a new sport's
-- types: no constraint here lists the sports (teams.sport's CHECK does).
-- ============================================================

create table public.sport_event_types (
  sport text not null,
  type  text not null,
  primary key (sport, type)
);

comment on table public.sport_event_types is
  'The game_events.type values each sport records. game_events_type_for_sport refuses any other.';

-- Reference data: anyone may read it; only migrations change it.
alter table public.sport_event_types enable row level security;
create policy "sport_event_types: read"
  on public.sport_event_types for select
  using (true);

insert into public.sport_event_types (sport, type)
select s.sport, t.type
from (values ('afl'), ('netball'), ('rugby_league')) as s(sport)
cross join (values
  -- Every sport
  ('lineup_set'),
  ('quarter_start'),
  ('quarter_end'),
  ('game_finalised'),
  ('player_arrived'),
  ('injury'),
  ('player_loan'),
  ('score_undo')
) as t(type);

insert into public.sport_event_types (sport, type) values
  -- AFL: mid-play rotations, saved holds, a mid-quarter shrink,
  -- goals and behinds.
  ('afl', 'swap'),
  ('afl', 'field_zone_swap'),
  ('afl', 'player_lock'),
  ('afl', 'roster_shrink'),
  ('afl', 'goal'),
  ('afl', 'behind'),
  ('afl', 'opponent_goal'),
  ('afl', 'opponent_behind'),
  -- Netball: subs only at period breaks, saved holds (Keep in
  -- {position}), goals only.
  ('netball', 'period_break_swap'),
  ('netball', 'player_lock'),
  ('netball', 'goal'),
  ('netball', 'opponent_goal'),
  -- Rugby league: rolling subs, forward / back moves, a mid-game
  -- shrink, tries, kicks, kickoffs and vests.
  ('rugby_league', 'swap'),
  ('rugby_league', 'league_position_change'),
  ('rugby_league', 'roster_shrink'),
  ('rugby_league', 'try'),
  ('rugby_league', 'opponent_try'),
  ('rugby_league', 'conversion_attempt'),
  ('rugby_league', 'opponent_conversion'),
  ('rugby_league', 'penalty_goal'),
  ('rugby_league', 'field_goal'),
  ('rugby_league', 'opponent_penalty_goal'),
  ('rugby_league', 'opponent_field_goal'),
  ('rugby_league', 'kickoff_taken'),
  ('rugby_league', 'vest_assigned');

-- Security definer so the check sees the game's team whatever the
-- writer's RLS lets them read (a share-link runner writes through the
-- service role; a coach through their membership).
create or replace function public.game_events_type_for_sport()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sport text;
begin
  select t.sport into v_sport
    from public.games g
    join public.teams t on t.id = g.team_id
   where g.id = new.game_id;

  -- No game: leave it to the foreign key to refuse.
  if v_sport is null then
    return new;
  end if;

  if not exists (
    select 1 from public.sport_event_types
     where sport = v_sport and type = new.type
  ) then
    raise exception '% games don''t record "%" events', v_sport, new.type
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists game_events_type_for_sport on public.game_events;
create trigger game_events_type_for_sport
  before insert or update of type, game_id on public.game_events
  for each row execute function public.game_events_type_for_sport();

-- The trigger replaces the all-sports list.
alter table public.game_events drop constraint if exists game_events_type_check;
