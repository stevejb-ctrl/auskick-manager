-- ============================================================
-- AFL position changes on a big field (live v3, Phase 11).
--
-- From U13 an AFL side plays 15, 16 or 18 a side in named positions
-- (How we play's formation). On the live screen the coach taps two
-- kids on the field to trade their positions (CHB ↔ FB), or taps a kid
-- then an empty position to move them there. That's not a sub, so it's
-- its own event:
--
--   position_swap  player_id = player_a_id
--                  metadata { player_a_id, player_b_id (null: an empty
--                  position), position_a, position_b, zone_a, zone_b,
--                  quarter, elapsed_ms, undo? }
--
-- player_a moves to position_b; player_b (if any) moves to position_a.
-- Where the two positions are on different lines, the kids change
-- lines too, which replays as a field_zone_swap does.
--
-- Additive only: one sport_event_types row. game_events' insert policy
-- doesn't look at the type, so whoever can write a swap today (a team
-- admin, a game manager, a game-day link through the service role) can
-- write this.
-- ============================================================

insert into public.sport_event_types (sport, type) values
  ('afl', 'position_swap')
on conflict do nothing;
