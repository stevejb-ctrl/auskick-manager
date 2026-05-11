-- Push-notification device registry. One row per (user, device-token)
-- pair. Populated by the native shell on first authenticated launch
-- once the user grants notification permission; consumed by the
-- send-push Edge Function which fans a payload out to every token
-- the recipient user has registered.
--
-- Tokens are platform-specific opaque strings:
--   android — FCM registration token (~150 chars, can rotate)
--   ios     — APNs device token (64 hex chars, stable per install)
--
-- Web users never end up with a row here — the registration code
-- short-circuits behind isNative().

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token text not null,
  created_at timestamptz not null default now(),
  -- Bumped on every successful registration so we can prune tokens
  -- that haven't checked in for, say, 60 days — those devices have
  -- almost certainly been wiped or the app uninstalled.
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

create index device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- Owner-only policies. The send-push Edge Function bypasses RLS via
-- the service-role key (it needs to read every recipient's tokens),
-- so the policies here cover client reads/writes only.
create policy "device_tokens: owner reads own"
  on public.device_tokens for select
  using (auth.uid() = user_id);

create policy "device_tokens: owner inserts own"
  on public.device_tokens for insert
  with check (auth.uid() = user_id);

create policy "device_tokens: owner updates own"
  on public.device_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "device_tokens: owner deletes own"
  on public.device_tokens for delete
  using (auth.uid() = user_id);
