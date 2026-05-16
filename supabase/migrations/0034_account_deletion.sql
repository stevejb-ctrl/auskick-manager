-- ============================================================
-- Account deletion (soft-delete with 30-day restore window).
--
-- Two-part change driven by Apple App Store guideline 5.1.1(v):
-- users must be able to delete their account from inside the app.
--
--   Part A: schedule columns on `profiles` — `deletion_requested_at`
--           and `deletion_scheduled_for`. When the user requests
--           deletion, both are set; a nightly purge job (Supabase
--           Edge Function `purge-deleted-accounts`) finds profiles
--           where `deletion_scheduled_for <= now()` and hard-deletes
--           the auth user. The user can restore before that runs by
--           nulling both columns from /account.
--
--   Part B: change every audit-trail FK to `profiles(id)` from the
--           default `ON DELETE RESTRICT` to `ON DELETE SET NULL` (and
--           drop `NOT NULL` where it's currently present). This is
--           necessary so `auth.admin.deleteUser(user.id)` actually
--           succeeds — without it, any team the user created, any
--           game they recorded events for, any invite they sent
--           blocks the cascade through `profiles`.
--
--           The columns affected are all "who did this" audit
--           pointers (`created_by`, `updated_by`, `invited_by`,
--           `accepted_by`, `assigned_by`, `author_id`). When the
--           referenced user is gone, the *row* is still meaningful —
--           the game still happened, the note was still written, the
--           invite was still accepted — we just no longer know who
--           did it. NULL is the correct semantic, not row deletion.
--
--           Resource ownership tables (teams, players) keep their
--           data alive too: when a sole-admin user deletes their
--           account, the application layer (purgeAccount in
--           src/lib/account/purge.ts) handles team teardown
--           explicitly so the team and all its children get
--           cascade-deleted via `team_id` FKs.
-- ============================================================

-- ─── Part A: schedule columns ──────────────────────────────────────
alter table public.profiles
  add column if not exists deletion_requested_at  timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

-- Index used by the nightly purge: WHERE deletion_scheduled_for <= now().
-- Partial index keeps it tiny (only rows actively scheduled).
create index if not exists profiles_deletion_scheduled_idx
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

-- ─── Part B: audit FKs → ON DELETE SET NULL ────────────────────────
-- Each block: drop the existing NOT NULL where present, drop the
-- existing FK by its conventional name, re-add with ON DELETE SET NULL.
--
-- The conventional FK name produced by Postgres for inline FK
-- declarations is `<table>_<column>_fkey`; that's what the original
-- migrations created, so we drop by that name.

-- teams.created_by ─────────────────────────────────────────────────
alter table public.teams alter column created_by drop not null;
alter table public.teams drop constraint if exists teams_created_by_fkey;
alter table public.teams
  add constraint teams_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- team_memberships.invited_by (already nullable) ───────────────────
alter table public.team_memberships
  drop constraint if exists team_memberships_invited_by_fkey;
alter table public.team_memberships
  add constraint team_memberships_invited_by_fkey
  foreign key (invited_by) references public.profiles(id) on delete set null;

-- players.created_by ───────────────────────────────────────────────
alter table public.players alter column created_by drop not null;
alter table public.players drop constraint if exists players_created_by_fkey;
alter table public.players
  add constraint players_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- games.created_by ─────────────────────────────────────────────────
alter table public.games alter column created_by drop not null;
alter table public.games drop constraint if exists games_created_by_fkey;
alter table public.games
  add constraint games_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- game_availability.updated_by (already nullable) ──────────────────
alter table public.game_availability
  drop constraint if exists game_availability_updated_by_fkey;
alter table public.game_availability
  add constraint game_availability_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

-- game_events.created_by (already nullable) ────────────────────────
alter table public.game_events
  drop constraint if exists game_events_created_by_fkey;
alter table public.game_events
  add constraint game_events_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- team_invites.created_by + accepted_by ────────────────────────────
alter table public.team_invites alter column created_by drop not null;
alter table public.team_invites
  drop constraint if exists team_invites_created_by_fkey;
alter table public.team_invites
  add constraint team_invites_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.team_invites
  drop constraint if exists team_invites_accepted_by_fkey;
alter table public.team_invites
  add constraint team_invites_accepted_by_fkey
  foreign key (accepted_by) references public.profiles(id) on delete set null;

-- profile_tags.assigned_by (CRM audit) ─────────────────────────────
alter table public.profile_tags
  drop constraint if exists profile_tags_assigned_by_fkey;
alter table public.profile_tags
  add constraint profile_tags_assigned_by_fkey
  foreign key (assigned_by) references public.profiles(id) on delete set null;

-- contact_notes.author_id (CRM audit) ──────────────────────────────
alter table public.contact_notes
  drop constraint if exists contact_notes_author_id_fkey;
alter table public.contact_notes
  add constraint contact_notes_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;

-- game_lineup_drafts.updated_by ────────────────────────────────────
alter table public.game_lineup_drafts
  drop constraint if exists game_lineup_drafts_updated_by_fkey;
alter table public.game_lineup_drafts
  add constraint game_lineup_drafts_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

-- Note: profiles.id → auth.users(id) ON DELETE CASCADE stays as-is.
-- That's the only path that should ever delete a profile row: the
-- auth user goes, the profile follows, and from there `team_memberships`
-- cascades via its own ON DELETE CASCADE on user_id. Everything else
-- becomes a benign NULL.
