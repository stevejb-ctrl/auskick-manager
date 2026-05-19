-- ============================================================
-- Auskick Manager — Email-driven team invites
-- Run in the Supabase SQL Editor after 0036.
-- ============================================================

-- Adds the columns needed to send an invite link via email from inside
-- the app. The existing copy-link flow stays intact: when the admin
-- leaves the email field blank, none of these columns are populated.
--
-- `email_hint` (added in 0017) is kept around so legacy invites still
-- display whatever the admin previously typed there. New invites
-- populate `invited_email` instead, and the UI prefers it.

create extension if not exists "citext";

alter table public.team_invites
  add column invited_email    citext,
  add column email_sent_at    timestamptz,
  add column email_send_count int not null default 0,
  add column last_email_error text;

-- Partial index — only rows where an email was actually attached. Lets
-- us look up pending invites by recipient address (e.g. "is there an
-- open invite already pending for this parent?") without indexing the
-- mass of legacy/link-only invites.
create index idx_team_invites_invited_email
  on public.team_invites (invited_email)
  where invited_email is not null;
