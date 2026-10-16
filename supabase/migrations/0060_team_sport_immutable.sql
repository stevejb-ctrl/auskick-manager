-- ============================================================
-- A team's sport never changes (cross-sport audit, 14 Oct 2026).
--
-- A team's games, events, lineups and How we play are all in its
-- sport's terms; switching teams.sport would replay AFL events as
-- netball (or worse) and leave rules no engine understands. Nothing
-- in the app changes a sport after creation (the Basics step shows it
-- read-only); this makes the database refuse it too.
-- ============================================================

create or replace function public.teams_sport_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.sport is distinct from old.sport then
    raise exception 'A team''s sport can''t change once it''s created'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists teams_sport_immutable on public.teams;
create trigger teams_sport_immutable
  before update of sport on public.teams
  for each row execute function public.teams_sport_immutable();
