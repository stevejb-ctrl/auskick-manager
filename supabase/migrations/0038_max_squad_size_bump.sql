-- ============================================================
-- Bump the active-squad hard cap from 15 to 20.
--
-- Migration 0001 added a trigger that raised an exception when a
-- team tried to onboard a 16th active player. The threshold of 15
-- was tied to a much older AFL Auskick assumption. In practice
-- multiple sport configs have been carrying a higher
-- `maxSquadSize` value (AFL U8-U17: 20-25; rugby league U10-U12:
-- now 20) and coaches running larger squads have been silently
-- capped at 15 by this trigger — the app-level error copy and
-- the "15-20 kids gives you plenty of cover" team-setup blurb
-- have been promising more than the DB allowed.
--
-- This raises the trigger threshold to 20 so the DB matches the
-- app-level promise. AFL U13+ sport configs still say `25` —
-- they're now consistently capped at 20 by this trigger, which
-- is the upper bound the squad-step copy advertises and the
-- highest realistic junior team size. A future migration can
-- relax this further if a club operates with a genuinely larger
-- roster.
-- ============================================================

create or replace function public.enforce_max_players()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from public.players
    where team_id = new.team_id and is_active = true
  ) >= 20 then
    raise exception 'A squad cannot exceed 20 active players';
  end if;
  return new;
end;
$$;

-- Trigger itself is unchanged; the function body just rebinds.
