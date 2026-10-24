-- ============================================================
-- Siren — the parent availability link (round 2 usability, 24 Oct 2026)
-- Run after 0071.
-- ============================================================

-- The setup wizard promised "Share availability with parents so you know
-- who's playing", but nothing could be shared. Each game now has its own
-- link, /availability/<availability_token>, that a coach posts in the
-- group chat. A parent opens it without an account and marks their child
-- In or Out, and nothing else.
--
-- It is NOT the game-day link (games.share_token), which runs the game.
-- Both are read and written only through the service-role client in
-- server code that checks the token, so no new RLS policy is needed: the
-- column sits on games, whose existing policies already cover it.
--
-- Every existing game gets a token from the default.
alter table public.games
  add column availability_token uuid not null default gen_random_uuid();

create unique index games_availability_token_key
  on public.games (availability_token);

-- When a parent answered, through the link or as a Parent member of the
-- team, so the coach sees who's replied ("3 of 12 replied"). Null for
-- the default "everyone's In" row a new game starts with, and for the
-- coach's own changes.
alter table public.game_availability
  add column replied_at timestamptz;
