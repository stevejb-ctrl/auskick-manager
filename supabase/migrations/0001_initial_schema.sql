-- ============================================================
-- Auskick Manager — Slice 1 initial schema
-- Run this in the Supabase SQL editor for your project.
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── profiles ────────────────────────────────────────────────
-- One row per auth.users entry. Created automatically by trigger.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── teams ───────────────────────────────────────────────────
create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── team_memberships ────────────────────────────────────────
create type public.team_role as enum ('admin', 'game_manager', 'parent');

create table public.team_memberships (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.team_role not null default 'parent',
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ─── players ─────────────────────────────────────────────────
create table public.players (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  full_name     text not null,
  jersey_number smallint not null check (jersey_number >= 1 and jersey_number <= 99),
  is_active     boolean not null default true,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (team_id, jersey_number)
);

-- ─── Trigger: auto-create profile on signup ──────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Trigger: auto-assign admin when creating a team ─────────
-- NOTE: Because this trigger runs AFTER INSERT, any server-side insert into
-- `teams` must NOT use RETURNING (i.e. no .select() chained to .insert()).
-- The SELECT policy (is_team_member) would be evaluated as part of RETURNING
-- before this trigger has added the membership row, causing an RLS violation.
-- Insert first, then fetch in a separate query.
create or replace function public.handle_new_team()
returns trigger language plpgsql security definer as $$
begin
  insert into public.team_memberships (team_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger trg_on_team_created
  after insert on public.teams
  for each row execute function public.handle_new_team();

-- ─── Trigger: enforce max 15 active players per team ─────────
create or replace function public.enforce_max_players()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from public.players
    where team_id = new.team_id and is_active = true
  ) >= 15 then
    raise exception 'A squad cannot exceed 15 active players';
  end if;
  return new;
end;
$$;

create trigger trg_max_players
  before insert on public.players
  for each row execute function public.enforce_max_players();

-- ─── Trigger: updated_at ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create trigger trg_players_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- ─── Enable RLS ───────────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.teams            enable row level security;
alter table public.team_memberships enable row level security;
alter table public.players          enable row level security;

-- ─── RLS helper functions ─────────────────────────────────────
create or replace function public.is_team_admin(p_team_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.team_memberships
    where team_id = p_team_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.team_memberships
    where team_id = p_team_id
      and user_id = auth.uid()
  );
$$;

-- ─── profiles policies ───────────────────────────────────────
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: read team members"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.team_memberships a
      join public.team_memberships b on a.team_id = b.team_id
      where a.user_id = auth.uid()
        and b.user_id = profiles.id
    )
  );

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid());

-- ─── teams policies ──────────────────────────────────────────
create policy "teams: create"
  on public.teams for insert
  with check (auth.uid() is not null and created_by = auth.uid());

create policy "teams: read"
  on public.teams for select
  using (public.is_team_member(id));

create policy "teams: update"
  on public.teams for update
  using (public.is_team_admin(id));

-- ─── team_memberships policies ───────────────────────────────
create policy "memberships: read"
  on public.team_memberships for select
  using (public.is_team_member(team_id));

create policy "memberships: insert"
  on public.team_memberships for insert
  with check (public.is_team_admin(team_id));

create policy "memberships: update"
  on public.team_memberships for update
  using (public.is_team_admin(team_id));

create policy "memberships: delete"
  on public.team_memberships for delete
  using (public.is_team_admin(team_id));

-- ─── players policies (no DELETE — soft delete only) ─────────
create policy "players: read"
  on public.players for select
  using (public.is_team_member(team_id));

create policy "players: insert"
  on public.players for insert
  with check (public.is_team_admin(team_id) and created_by = auth.uid());

create policy "players: update"
  on public.players for update
  using (public.is_team_admin(team_id));
