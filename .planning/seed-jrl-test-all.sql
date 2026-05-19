-- Combined seed: teams + players + games + availability. Runs
-- against a freshly-reset local Supabase. Owner = super-admin seed
-- user; the AFTER INSERT trigger creates the membership row.

insert into public.teams (id, name, created_by, age_group, sport, track_scoring)
select gen_random_uuid(), 'JRL Test ' || age, '00000000-0000-0000-0000-00000000bbbb', age, 'rugby_league',
  case when age in ('U6', 'U7') then false else true end
from unnest(array['U6','U7','U8','U9','U10','U11','U12']) as t(age);

do $$
declare
  v_team record;
  v_jersey int;
  v_size int;
  v_names text[];
begin
  for v_team in select id, age_group from public.teams where name like 'JRL Test %' order by age_group loop
    if v_team.age_group in ('U6', 'U7') then v_size := 8;
    elsif v_team.age_group in ('U8', 'U9') then v_size := 10;
    elsif v_team.age_group in ('U10', 'U11') then v_size := 14;
    else v_size := 16;
    end if;

    case v_team.age_group
      when 'U6' then v_names := array['Jack','Olivia','Oliver','Ava','William','Mia','Henry','Charlotte','Charlie','Amelia','Max','Isla','Lucas','Grace','Thomas','Chloe'];
      when 'U7' then v_names := array['Noah','Sophie','Leo','Ruby','Ethan','Willow','Mason','Evie','Hudson','Lily','Jasper','Harper','Archie','Layla','Hugo','Zara'];
      when 'U8' then v_names := array['Felix','Quinn','Sam','Tilly','Theo','Indi','Cooper','Frankie','Banjo','Pippa','Jett','Sienna','Asher','Poppy','Beau','Mila'];
      when 'U9' then v_names := array['Kai','Daisy','Eli','Hazel','Bodhi','Esme','Otto','Nina','Levi','Aria','Finn','Iris','Caleb','Luna','Owen','Stella'];
      when 'U10' then v_names := array['Jack','Olivia','Oliver','Ava','William','Mia','Henry','Charlotte','Charlie','Amelia','Max','Isla','Lucas','Grace','Thomas','Chloe'];
      when 'U11' then v_names := array['Noah','Sophie','Leo','Ruby','Ethan','Willow','Mason','Evie','Hudson','Lily','Jasper','Harper','Archie','Layla','Hugo','Zara'];
      when 'U12' then v_names := array['Felix','Quinn','Sam','Tilly','Theo','Indi','Cooper','Frankie','Banjo','Pippa','Jett','Sienna','Asher','Poppy','Beau','Mila'];
    end case;

    for v_jersey in 1..v_size loop
      insert into public.players (team_id, full_name, jersey_number, chip, created_by)
      values (
        v_team.id,
        v_names[v_jersey],
        v_jersey,
        case ((v_jersey - 1) % 3) when 0 then 'a' when 1 then 'b' else null end,
        '00000000-0000-0000-0000-00000000bbbb'
      );
    end loop;
  end loop;
end $$;

-- One upcoming game per team (Round 1, next Saturday at 10am).
insert into public.games (
  id, team_id, opponent, scheduled_at, status,
  on_field_size, sub_interval_seconds, quarter_length_seconds,
  created_by, round_number
)
select
  gen_random_uuid(),
  t.id,
  'Rivals R1',
  date_trunc('day', now() + interval '7 days') + interval '10 hours',
  'upcoming',
  case
    when t.age_group in ('U6', 'U7') then 6
    when t.age_group in ('U8', 'U9') then 8
    when t.age_group in ('U10', 'U11') then 11
    else 13
  end,
  180,
  case
    when t.age_group in ('U6','U7','U8','U9') then 480
    else 1200
  end,
  '00000000-0000-0000-0000-00000000bbbb',
  1
from public.teams t
where t.name like 'JRL Test %';

-- Default-available rule: every active squad member starts marked available.
insert into public.game_availability (game_id, player_id, status, updated_by)
select g.id, p.id, 'available', '00000000-0000-0000-0000-00000000bbbb'
from public.games g
join public.teams t on t.id = g.team_id
join public.players p on p.team_id = t.id and p.is_active = true
where t.name like 'JRL Test %'
on conflict (game_id, player_id) do nothing;
