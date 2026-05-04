-- Widen the on_field_size constraint so it accommodates every age
-- group across every sport. The original `between 6 and 12` was AFL
-- U10-shaped and rejects netball's smaller setups + AFL U13+ (up to
-- 18 on the field).
--
-- App-level validation in startGame / setOnFieldSize clamps the value
-- to the team's actual sport+age min/max via getAgeGroupConfig — this
-- DB check is just a sanity floor/ceiling.

alter table public.games
  drop constraint if exists games_on_field_size_check;

alter table public.games
  add constraint games_on_field_size_check
    check (on_field_size between 5 and 18);
