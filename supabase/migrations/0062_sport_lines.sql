-- ============================================================
-- Positions and prefs sit on their own sport's lines (cross-sport
-- audit, 14 Oct 2026).
--
-- team_positions.line was CHECKed against AFL's lines only, and
-- player_position_prefs.line wasn't checked at all, so a league pref
-- could name an AFL line no league engine reads. sport_lines lists
-- each sport's lines (the ids in src/lib/sports/*/playbook.ts), and
-- one trigger on both tables refuses a line the team's sport doesn't
-- have:
--   afl           back / mid / fwd
--   netball       attack-third / centre-third / defence-third
--   rugby_league  forwards / backs
-- A pref with no line (keyed by position, or keep_on) is untouched.
-- A new sport's lines are inserts here: no constraint here lists the
-- sports (teams.sport's CHECK does).
-- ============================================================

create table public.sport_lines (
  sport text not null,
  line  text not null,
  primary key (sport, line)
);

comment on table public.sport_lines is
  'Each sport''s lines. position_line_for_sport refuses any other on team_positions / player_position_prefs.';

-- Reference data: anyone may read it; only migrations change it.
alter table public.sport_lines enable row level security;
create policy "sport_lines: read"
  on public.sport_lines for select
  using (true);

insert into public.sport_lines (sport, line) values
  ('afl', 'back'),
  ('afl', 'mid'),
  ('afl', 'fwd'),
  ('netball', 'attack-third'),
  ('netball', 'centre-third'),
  ('netball', 'defence-third'),
  ('rugby_league', 'forwards'),
  ('rugby_league', 'backs');

-- Security definer so the check sees the team whatever the writer's
-- RLS lets them read.
create or replace function public.position_line_for_sport()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sport text;
begin
  if new.line is null then
    return new;
  end if;

  select sport into v_sport from public.teams where id = new.team_id;

  -- No team: leave it to the foreign key to refuse.
  if v_sport is null then
    return new;
  end if;

  if not exists (
    select 1 from public.sport_lines
     where sport = v_sport and line = new.line
  ) then
    raise exception '% teams have no "%" line', v_sport, new.line
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists team_positions_line_for_sport on public.team_positions;
create trigger team_positions_line_for_sport
  before insert or update of line, team_id on public.team_positions
  for each row execute function public.position_line_for_sport();

drop trigger if exists player_position_prefs_line_for_sport on public.player_position_prefs;
create trigger player_position_prefs_line_for_sport
  before insert or update of line, team_id on public.player_position_prefs
  for each row execute function public.position_line_for_sport();

-- The trigger replaces AFL's lines as the only lines.
alter table public.team_positions drop constraint if exists team_positions_line_check;
