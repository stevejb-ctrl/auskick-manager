-- ============================================================
-- How we play (UX plan §7.10, chunk 3.2).
--
-- A coach tailors Siren to how their team plays: the age group's
-- policy (with "our league is different" overrides inside the
-- allowed band), a rotation strategy, season balance, named
-- positions (AFL open ages) and per-player position preferences.
--
--   team_playbooks         one row per team; absent = the age
--                          group's defaults. strategy is validated in
--                          code against the sport's strategies.
--   team_positions         AFL open ages: the team's own named
--                          positions (≤ 4-char labels) on a line.
--   player_position_prefs  home / also / never / keep_on per player,
--                          keyed by team_positions.id (AFL), a fixed
--                          bib (netball) or a catalogue key (league),
--                          or by line.
--   games.playbook_snapshot
--                          the effective policy + strategy at kickoff,
--                          so later edits never rewrite history.
--
-- Existing toggles (enforce_unbroken_periods, allow_mid_quarter_subs,
-- track_zone_time) and chips keep working where they are; they move
-- into rules when the rule catalogue lands (Phase 4) and chips retire
-- with the role sheet (Phase 5.8).
--
-- RLS: team members read; team admins (coaches) write. Managers run
-- games but don't change how the team plays.
-- ============================================================

create table public.team_playbooks (
  team_id              uuid primary key references public.teams(id) on delete cascade,
  strategy             text,
  policy_overrides     jsonb not null default '{}'::jsonb,
  rules                jsonb not null default '[]'::jsonb,
  season_balance       text check (season_balance in ('off', 'light', 'balanced', 'strong')),
  season_balance_since timestamptz,
  updated_by           uuid references public.profiles(id) on delete set null,
  updated_at           timestamptz not null default now()
);

create table public.team_positions (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  label         text not null check (char_length(btrim(label)) between 1 and 4),
  name          text check (name is null or char_length(name) <= 40),
  line          text not null check (line in ('back', 'mid', 'fwd')),
  sort          smallint not null,
  on_field_size smallint,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index team_positions_team_idx
  on public.team_positions (team_id) where archived_at is null;

create table public.player_position_prefs (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  position_key text,
  line         text,
  kind         text not null check (kind in ('home', 'also', 'never', 'keep_on')),
  rank         smallint,
  created_at   timestamptz not null default now(),
  check (position_key is not null or line is not null or kind = 'keep_on')
);

create unique index player_position_prefs_uniq
  on public.player_position_prefs (player_id, kind, coalesce(position_key, line, ''));
create index player_position_prefs_team_idx
  on public.player_position_prefs (team_id);

alter table public.games add column if not exists playbook_snapshot jsonb;

-- ─── RLS ─────────────────────────────────────────────────────
alter table public.team_playbooks        enable row level security;
alter table public.team_positions        enable row level security;
alter table public.player_position_prefs enable row level security;

create policy "team_playbooks: read"
  on public.team_playbooks for select
  using (public.is_team_member(team_id));
create policy "team_playbooks: insert"
  on public.team_playbooks for insert
  with check (public.is_team_admin(team_id));
create policy "team_playbooks: update"
  on public.team_playbooks for update
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy "team_positions: read"
  on public.team_positions for select
  using (public.is_team_member(team_id));
create policy "team_positions: insert"
  on public.team_positions for insert
  with check (public.is_team_admin(team_id));
create policy "team_positions: update"
  on public.team_positions for update
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));
create policy "team_positions: delete"
  on public.team_positions for delete
  using (public.is_team_admin(team_id));

-- A pref's player must be on the pref's team, so a coach can't write
-- prefs for another team's player by naming their own team_id.
create policy "player_position_prefs: read"
  on public.player_position_prefs for select
  using (public.is_team_member(team_id));
create policy "player_position_prefs: insert"
  on public.player_position_prefs for insert
  with check (
    public.is_team_admin(team_id)
    and exists (
      select 1 from public.players p
      where p.id = player_id and p.team_id = player_position_prefs.team_id
    )
  );
create policy "player_position_prefs: update"
  on public.player_position_prefs for update
  using (public.is_team_admin(team_id))
  with check (
    public.is_team_admin(team_id)
    and exists (
      select 1 from public.players p
      where p.id = player_id and p.team_id = player_position_prefs.team_id
    )
  );
create policy "player_position_prefs: delete"
  on public.player_position_prefs for delete
  using (public.is_team_admin(team_id));
