-- ============================================================
-- Leave a team, delete a team (UX plan 2.3 — Team › Danger zone).
--
-- Help described "Delete team" but nothing in the app could do it, and
-- RLS only let an admin delete memberships, so a parent or manager had
-- no way to leave a team (UX plan H7).
--
--   1. Anyone can delete their OWN membership (leave).
--   2. A team admin can delete the team; memberships, players, games
--      and their events/availability already cascade.
--   3. A coach can't leave (or be removed) as the team's last admin
--      while the team still exists. Only enforced for signed-in users
--      acting through the API (auth.uid() set): account purges and
--      other service-role cascades are left alone.
-- ============================================================

create policy "memberships: leave"
  on public.team_memberships for delete
  using (user_id = auth.uid());

create policy "teams: delete"
  on public.teams for delete
  using (public.is_team_admin(id));

create or replace function public.guard_last_team_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return old;
  end if;
  if old.role = 'admin'
     and exists (select 1 from public.teams t where t.id = old.team_id)
     and not exists (
       select 1 from public.team_memberships m
       where m.team_id = old.team_id
         and m.role = 'admin'
         and m.user_id <> old.user_id
     ) then
    raise exception 'last_admin'
      using hint = 'Make someone else a coach, or delete the team.';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_last_team_admin on public.team_memberships;
create trigger guard_last_team_admin
  before delete on public.team_memberships
  for each row execute function public.guard_last_team_admin();
