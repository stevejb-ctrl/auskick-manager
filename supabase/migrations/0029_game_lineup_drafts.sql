-- Save the starting lineup ahead of game day.
--
-- One row per game (PK = game_id). The coach builds their planned
-- starting roster the night before from the LineupPicker, hits "Save
-- plan", and on game day the picker pre-populates with what they
-- saved. Hitting "Start game" deletes the draft — the lineup_set
-- event becomes the source of truth from kickoff onward.
--
-- Sport-agnostic: the lineup jsonb shape varies by sport's position
-- model (AFL 3-zone or 5-position; netball 7-position) but the row
-- schema is identical across both. RLS reuses the same is_team_*
-- helpers as game_events / availability so a coach who can run a
-- game can save its plan, and any team member can read it.

create table public.game_lineup_drafts (
  game_id              uuid primary key references public.games(id) on delete cascade,
  lineup               jsonb not null,
  on_field_size        smallint not null,
  sub_interval_seconds integer not null,
  updated_by           uuid references public.profiles(id),
  updated_at           timestamptz not null default now()
);

alter table public.game_lineup_drafts enable row level security;

create policy "lineup_drafts: read"
  on public.game_lineup_drafts for select
  using (public.is_team_member(public.game_team_id(game_id)));

create policy "lineup_drafts: write"
  on public.game_lineup_drafts for all
  using (public.is_team_admin_or_manager(public.game_team_id(game_id)))
  with check (public.is_team_admin_or_manager(public.game_team_id(game_id)));
