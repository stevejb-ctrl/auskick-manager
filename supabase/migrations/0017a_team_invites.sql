-- ============================================================
-- Auskick Manager — Slice 11: team invites (shareable links)
-- Run in the Supabase SQL Editor after 0010.
-- ============================================================

-- Single-use(-ish) invite tokens. An admin generates a link; the
-- invitee opens it, signs up or logs in, and the accept flow adds
-- them to team_memberships with the pre-selected role.
--
-- Writes and reads during acceptance go through the service-role
-- admin client (bypassing RLS), so the invitee doesn't need to be
-- a member yet. Admin-facing reads/writes use these policies.
create table public.team_invites (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  token       uuid not null unique default gen_random_uuid(),
  role        public.team_role not null,
  email_hint  text,                          -- optional label for the admin
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  revoked_at  timestamptz
);

create index idx_team_invites_team_id on public.team_invites (team_id);

alter table public.team_invites enable row level security;

-- Admins can see, create, and update (revoke) invites for their team.
-- Acceptance reads/writes via admin client, so no public SELECT policy.
create policy team_invites_select_admin on public.team_invites for select
  using (public.is_team_admin(team_id));

create policy team_invites_insert_admin on public.team_invites for insert
  with check (public.is_team_admin(team_id));

create policy team_invites_update_admin on public.team_invites for update
  using (public.is_team_admin(team_id));
