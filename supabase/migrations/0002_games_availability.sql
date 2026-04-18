-- ============================================================
-- Auskick Manager — Slice 2: games + player availability
-- Run this in the Supabase SQL Editor after 0001_initial_schema.sql
-- ============================================================

-- ─── games ───────────────────────────────────────────────────
create table public.games (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  opponent     text not null,
  scheduled_at timestamptz not null,
  location     text,
  round_number smallint,
  notes        text,
  status       text not null default 'upcoming'
               check (status in ('upcoming', 'in_progress', 'completed')),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_games_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- ─── game_availability ───────────────────────────────────────
-- One row per (game, player) pair. Rows are created lazily on first toggle.
-- status defaults to 'unknown' — rows not yet created are treated as unknown.
create table public.game_availability (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  status     text not null default 'unknown'
             check (status in ('available', 'unavailable', 'unknown')),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (game_id, player_id)
);

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.games             enable row level security;
alter table public.game_availability enable row level security;

-- Helper: true if calling user is admin OR game_manager of this team
create or replace function public.is_team_admin_or_manager(p_team_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.team_memberships
    where team_id = p_team_id
      and user_id = auth.uid()
      and role in ('admin', 'game_manager')
  );
$$;

-- Helper: look up a game's team_id (used in availability RLS)
create or replace function public.game_team_id(p_game_id uuid)
returns uuid language sql security definer stable as $$
  select team_id from public.games where id = p_game_id;
$$;

-- ─── games policies ──────────────────────────────────────────
create policy "games: read"
  on public.games for select
  using (public.is_team_member(team_id));

-- Safe to use .insert().select() for games — no AFTER INSERT trigger
-- that creates rows the SELECT policy depends on (unlike teams).
create policy "games: insert"
  on public.games for insert
  with check (public.is_team_admin(team_id) and created_by = auth.uid());

create policy "games: update"
  on public.games for update
  using (public.is_team_admin(team_id));

-- ─── game_availability policies ──────────────────────────────
create policy "availability: read"
  on public.game_availability for select
  using (public.is_team_member(public.game_team_id(game_id)));

create policy "availability: insert"
  on public.game_availability for insert
  with check (
    public.is_team_admin_or_manager(public.game_team_id(game_id))
    and updated_by = auth.uid()
  );

create policy "availability: update"
  on public.game_availability for update
  using (public.is_team_admin_or_manager(public.game_team_id(game_id)));
