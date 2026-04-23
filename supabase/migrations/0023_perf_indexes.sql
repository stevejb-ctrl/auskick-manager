-- Performance indexes on hot query paths.
--
-- None of these add new functionality — they just stop the planner
-- from falling back to seq-scans (or worse, scanning a composite
-- index by its non-leading column) on queries we run on every page
-- load.  All created with `if not exists` so the migration is safe
-- to re-run against environments that may have one or two of these
-- already in place.

-- Dashboard lists every team a user belongs to:
--   select ... from team_memberships where user_id = $1
-- The existing `unique(team_id, user_id)` constraint's backing index
-- has team_id as the leading column, so a user_id-only predicate
-- can't use it efficiently. Add a dedicated single-column index.
create index if not exists idx_team_memberships_user_id
  on public.team_memberships (user_id);

-- Team game lists and team detail pages filter games by team_id:
--   select ... from games where team_id = $1
-- Postgres does not auto-create indexes on FK columns, so this was
-- a seq scan on the full games table.
create index if not exists idx_games_team_id
  on public.games (team_id);

-- Live page + availability list repeatedly filter for "available"
-- RSVPs only:
--   select ... from game_availability where game_id = $1 and status = 'available'
-- Partial index matches the exact predicate so reads are tight and
-- writes don't pay index-maintenance cost on unrelated rows.
create index if not exists idx_game_availability_game_status_available
  on public.game_availability (game_id)
  where status = 'available';

-- Squad, live, stats pages all fetch active roster:
--   select ... from players where team_id = $1 and is_active = true
-- The existing `unique(team_id, jersey_number)` is wider than we need
-- for this scan; a partial index on `is_active = true` is ~1/3 the
-- size and covers the hot path exactly.
create index if not exists idx_players_team_active
  on public.players (team_id)
  where is_active;
