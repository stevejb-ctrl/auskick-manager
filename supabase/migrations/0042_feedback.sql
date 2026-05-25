-- ============================================================
-- Auskick Manager — In-app feedback / presales capture
-- Run in the Supabase SQL Editor after 0041.
-- ============================================================

-- Backs the always-visible feedback FAB. Two surfaces feed one table:
--
--   • Authenticated app (coaches/parents already in product)
--     → kind = 'feedback', user_id + email auto-populated.
--   • Marketing site (visitors evaluating Siren)
--     → kind = 'presales', user_id NULL, email typed by visitor so
--       Steve can reply.
--
-- Telegram delivery (sendTelegramNotification at src/lib/notifications/
-- telegram.ts) is the primary "Steve sees it" channel; this table is
-- the safety net + future audit log for an /admin/feedback inbox view.
-- telegram_ok is updated best-effort after the action returns so we
-- can later report on delivery failures.

create type public.feedback_kind as enum ('feedback', 'presales');

create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  kind         public.feedback_kind not null,
  -- NULL for anonymous presales submissions; SET NULL on user deletion
  -- so an account purge doesn't take historical feedback with it
  -- (mirrors the audit-trail FK pattern from migration 0034).
  user_id      uuid references auth.users(id) on delete set null,
  -- Auth: copied from profile at submit time. Anon: typed by visitor.
  -- Stored as plain text rather than citext because we don't lookup
  -- by email here — it's purely for Steve's eyes when replying.
  email        text,
  page_url     text,
  -- 5..5000 char bounds match the contact form's existing MESSAGE_MIN/
  -- MESSAGE_MAX (src/app/(marketing)/contact/actions.ts) so the two
  -- input surfaces have the same accepted shape.
  message      text not null check (char_length(message) between 5 and 5000),
  user_agent   text,
  -- iOS app version when submitted via the Capacitor shell; NULL on web.
  -- Lets a future inbox view filter "1.0.2 bugs only" once 1.0.2 ships.
  app_version  text,
  -- Nullable tri-state: NULL = send still in flight, true = Telegram
  -- 200, false = Telegram rejected or threw. submitFeedback fires the
  -- Telegram call fire-and-forget then updates this column without
  -- blocking the action's return.
  telegram_ok  boolean,
  created_at   timestamptz not null default now()
);

create index idx_feedback_created_at on public.feedback (created_at desc);
create index idx_feedback_kind on public.feedback (kind);

alter table public.feedback enable row level security;

-- Anyone can submit feedback — anon for presales, authenticated for
-- in-app feedback. No `using` clause needed on INSERT policies; the
-- with-check governs what columns the inserter can set, and we don't
-- restrict any (server action validates).
create policy "anyone inserts feedback"
  on public.feedback for insert
  to anon, authenticated
  with check (true);

-- Only super-admins can read. Same pattern as the contact_tags admin
-- surface (super-admin gate via profiles.is_super_admin). Backs a
-- future /admin/feedback inbox view; for now SELECT is admin-only so
-- no UI accidentally surfaces other users' submissions.
create policy "super-admins read feedback"
  on public.feedback for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

-- UPDATE policy — needed for the server action's post-send
-- telegram_ok backfill. The action runs under service-role at the
-- backfill step (no user context required) so this policy is purely
-- defensive: only super-admins can update via user-context queries,
-- which prevents a logged-in user from overwriting another user's
-- delivery status from the client.
create policy "super-admins update feedback"
  on public.feedback for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

grant insert on public.feedback to anon, authenticated;
grant select, update on public.feedback to authenticated;
