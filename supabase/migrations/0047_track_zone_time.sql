-- ============================================================
-- Add track_zone_time flag to teams + games (rugby league only).
--
-- AFL ships a stacked per-player time bar on every player tile
-- showing the share of game minutes spent in Back / Centre / Fwd
-- zones. Rugby League has no native "centre" zone — the forwards
-- and backs split the field — but the FR and DH vests act as the
-- functional middle: coaches want to see how much of each player's
-- game time they spent wearing a vest vs. playing in the forwards
-- or backs.
--
-- The display is opt-in because the bar only carries useful signal
-- once a team buys into rotating the vest as a real position. Many
-- teams that don't use vest rotation seriously will leave it off.
--
-- Two independent booleans:
--
--   teams.track_zone_time  — team-level default. Future game-create
--       flows inherit this so a team that turns it on once gets the
--       bar on every subsequent game by default.
--
--   games.track_zone_time  — per-game override, editable in the
--       in-game Game settings sheet. Lets a coach toggle the bar
--       on or off for a specific game without changing the team
--       standing preference.
--
-- The live UI renders the bar in every LeaguePlayerTile when the
-- per-game value is true; the team value drives the inherited
-- default but otherwise has no runtime effect.
-- ============================================================

alter table public.teams
  add column if not exists track_zone_time boolean not null default false;

alter table public.games
  add column if not exists track_zone_time boolean not null default false;
