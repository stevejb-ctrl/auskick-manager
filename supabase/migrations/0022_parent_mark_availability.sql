-- Let any team member (parent included) mark availability.
--
-- Previously the game_availability insert/update policies required
-- admin or game_manager. That meant parents could see availability
-- but not flip it, forcing coaches to chase down RSVPs manually.
-- Widening to `is_team_member` is safe: the data is low-risk, the
-- team is a small trusted group (invite-only membership), and
-- `updated_by` still records who made each change. Fill-in add/remove
-- (game_fill_ins) stays admin/game_manager — that's a squad change,
-- not a self-RSVP.

drop policy if exists "availability: insert" on public.game_availability;
drop policy if exists "availability: update" on public.game_availability;

create policy "availability: insert"
  on public.game_availability for insert
  with check (
    public.is_team_member(public.game_team_id(game_id))
    and updated_by = auth.uid()
  );

create policy "availability: update"
  on public.game_availability for update
  using (public.is_team_member(public.game_team_id(game_id)));
