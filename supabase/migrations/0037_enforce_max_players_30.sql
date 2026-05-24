-- Bump the per-team active-players cap from 15 → 30.
--
-- The old cap (set in migration 0001) was tuned for AFL U10 — 12
-- on-field + 3 bench fits inside 15 comfortably. But as the
-- product expanded to AFL U13+ (default 18 on-field) and netball
-- (5-7 on-field but real squads carry rotating attendees), 15
-- became too tight:
--   - AFL U13+ squads can't fill their default lineup
--   - Junior netball coaches with 12-15 names on the team list
--     hit the cap when they want to add late arrivals as fill-ins
--
-- 30 is generous enough to cover every real-world junior squad
-- size without being so high that bulk-create-data abuse stops
-- being noticeable. If we ever need true squad-size variance per
-- age group (e.g. "AFL U17 capped at 25, netball go capped at
-- 14") the right move is to make the trigger age-group-aware
-- rather than bumping again — but a flat 30 is the right minimal
-- change for today.
--
-- This is a TRIGGER replacement, not a CHECK constraint, so it
-- only affects future inserts. Existing teams over the old cap
-- (none today, since the old cap blocked them) are unaffected.
--
-- Steve 2026-05-20.

create or replace function public.enforce_max_players()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from public.players
    where team_id = new.team_id and is_active = true
  ) >= 30 then
    raise exception 'A squad cannot exceed 30 active players';
  end if;
  return new;
end;
$$;
