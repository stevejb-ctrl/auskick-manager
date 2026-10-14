-- ============================================================
-- Vests are a rugby league rule (cross-sport audit, 14 Oct 2026).
--
-- 0055 added team_playbooks.vest_strategy NOT NULL DEFAULT 'auto', so
-- every AFL and netball How we play carried a vest strategy for vests
-- they never wear. Now:
--   rugby_league  never null: a playbook written without one gets
--                 'auto' (0055's default, still the fairness pick)
--   afl, netball  always null: a vest strategy is refused
-- Readers already treat a missing strategy as 'auto' (lib/playbook/
-- load.ts), and only the league Vests card writes one.
-- ============================================================

alter table public.team_playbooks
  alter column vest_strategy drop not null,
  alter column vest_strategy drop default;

update public.team_playbooks tp
   set vest_strategy = null
  from public.teams t
 where t.id = tp.team_id
   and t.sport <> 'rugby_league'
   and tp.vest_strategy is not null;

-- Security definer so the check sees the team whatever the writer's
-- RLS lets them read.
create or replace function public.team_playbooks_vest_strategy_for_sport()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sport text;
begin
  select sport into v_sport from public.teams where id = new.team_id;

  if v_sport = 'rugby_league' then
    new.vest_strategy := coalesce(new.vest_strategy, 'auto');
  elsif v_sport is not null and new.vest_strategy is not null then
    raise exception 'Vests are a rugby league rule; % teams have no vest strategy', v_sport
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists team_playbooks_vest_strategy_for_sport on public.team_playbooks;
create trigger team_playbooks_vest_strategy_for_sport
  before insert or update of vest_strategy, team_id on public.team_playbooks
  for each row execute function public.team_playbooks_vest_strategy_for_sport();
