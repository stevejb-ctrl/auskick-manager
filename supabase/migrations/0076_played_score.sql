-- ============================================================
-- A game marked played keeps its final score.
--
-- "Mark played" (a game that happened without Siren: round 3 edge
-- testing, 24 Oct 2026) moved it to Completed with no events, so it had
-- no score, and the season record and Stats left it out. The coach now
-- enters our score and theirs as they mark it played, kept here:
--
--   { "us": 12, "them": 9 }                       every sport
--   { "us": 34, "them": 20, "usGoals": 5, "usBehinds": 4,
--     "themGoals": 3, "themBehinds": 2 }          AFL
--
-- Null for every other game: a game run in Siren takes its score from
-- its events, and a game marked played without a score has no result
-- (never a 0–0 draw). src/lib/games/playedScore.ts reads and checks it.
-- ============================================================

alter table public.games
  add column if not exists played_score jsonb;

alter table public.games
  drop constraint if exists games_played_score_check;

alter table public.games
  add constraint games_played_score_check check (
    played_score is null
    or (
      jsonb_typeof(played_score) = 'object'
      and jsonb_typeof(played_score -> 'us') = 'number'
      and jsonb_typeof(played_score -> 'them') = 'number'
      and (played_score ->> 'us')::numeric between 0 and 999
      and (played_score ->> 'them')::numeric between 0 and 999
    )
  );
