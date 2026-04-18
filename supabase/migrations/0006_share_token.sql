-- ============================================================
-- Auskick Manager — Slice 6: public game-runner share token
-- Run in the Supabase SQL Editor after 0005.
-- ============================================================

-- Each game gets a secret token. Anyone with the token can run
-- the live game without logging in. The token is a uuid so it's
-- unguessable; distribute the share URL privately.
alter table public.games
  add column share_token uuid not null default gen_random_uuid();

create unique index idx_games_share_token on public.games (share_token);

-- Writes from the public runner go through server actions using the
-- service-role key (which bypasses RLS). RLS stays strict for
-- authed clients.
