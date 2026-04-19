-- PlayHQ fixture import: track which games originated from an external source
-- so re-imports update in-place rather than creating duplicates.

alter table public.games
  add column external_source text,
  add column external_id text;

create unique index games_external_source_id_unique
  on public.games(team_id, external_source, external_id)
  where external_source is not null;
