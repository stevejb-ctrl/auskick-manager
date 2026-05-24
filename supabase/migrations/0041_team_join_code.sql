-- ============================================================
-- Auskick Manager — Team join codes
-- Run in the Supabase SQL Editor after 0040.
-- ============================================================

-- Every team gets a short, human-friendly code (e.g. "AUSK-7QH3") that
-- the manager can hand to a parent verbally. The parent enters it on
-- the new /join-team page and lands as a `parent` membership. Solves
-- the "I signed up but couldn't find my coach's team" drop-off — no
-- email URLs to type, no /join/{token} link to lose.
--
-- The code is reusable until the manager hits Regenerate (which they
-- can do from team settings if it leaks). Single code per team —
-- per-invite codes would require the manager to issue one per parent,
-- which defeats the verbal-handoff use case.

create or replace function public.generate_team_join_code()
returns text language plpgsql as $$
declare
  -- Phone-typing safe alphabet: skips 0/O/1/I/L which look identical
  -- on a phone keypad. 31 chars × 8 positions = ~852 billion combos,
  -- so the unique-index collision probability for a real-world team
  -- count is essentially zero.
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  -- Hyphen at the midpoint so a coach reading it aloud has a natural
  -- pause and a parent typing it has a visible group.
  return substr(code, 1, 4) || '-' || substr(code, 5, 4);
end;
$$;

-- Nullable to start so the backfill UPDATE below has somewhere to land
-- for existing rows; flipped to NOT NULL after we've populated every
-- team.
alter table public.teams add column join_code text;

-- BEFORE INSERT trigger: any future team created via the app gets a
-- code automatically. The trigger only fires when join_code is null,
-- so the regenerate action (which sets it explicitly) is unaffected.
create or replace function public.set_team_join_code_if_missing()
returns trigger language plpgsql as $$
begin
  if new.join_code is null then
    new.join_code := public.generate_team_join_code();
  end if;
  return new;
end;
$$;

create trigger trg_team_join_code_default
  before insert on public.teams
  for each row execute function public.set_team_join_code_if_missing();

-- Backfill existing teams. If two random codes happen to collide in
-- the same statement (vanishingly unlikely for the AU coach
-- population), the unique-index creation below will fail loudly —
-- safer than silently retrying inside an UPDATE.
update public.teams set join_code = public.generate_team_join_code()
  where join_code is null;

alter table public.teams alter column join_code set not null;
create unique index idx_teams_join_code on public.teams (join_code);

-- RLS: teams already have admin-only update + member-readable select
-- policies in 0001, which cover join_code as a column. No new
-- policies needed — but joinTeamByCode bypasses RLS via the admin
-- client (the joining user isn't a member yet, so the read would
-- fail otherwise).
