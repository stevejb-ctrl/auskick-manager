-- ============================================================
-- CRM foundation — tags, notes, contact preferences.
-- All tables are service-role only (RLS enabled, zero policies).
-- Access funnels through requireSuperAdmin() + createAdminClient().
-- ============================================================

-- ─── contact_tags ────────────────────────────────────────────
-- Freeform labels the super-admin attaches to profiles. The colour is
-- a short token (e.g. "brand", "warn", "ok") so the UI can render a chip
-- without persisting raw Tailwind classes.
create table public.contact_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default 'brand',
  created_at timestamptz not null default now()
);

-- ─── profile_tags ────────────────────────────────────────────
-- Many-to-many join between profiles and contact_tags.
create table public.profile_tags (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  tag_id      uuid not null references public.contact_tags(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (profile_id, tag_id)
);

create index profile_tags_tag_idx on public.profile_tags (tag_id);

-- ─── contact_notes ───────────────────────────────────────────
-- Admin notes against a profile. Append-only-ish — we expose delete
-- but not update from the UI to keep history honest.
create table public.contact_notes (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid references public.profiles(id),
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index contact_notes_profile_idx
  on public.contact_notes (profile_id, created_at desc);

-- ─── contact_preferences ────────────────────────────────────
-- Lazy-created: one row per profile, only when someone toggles something.
-- The unsubscribed_* columns are forward-looking for the eventual email layer.
-- Until email ships they're written by the manual unsubscribe toggle only.
create table public.contact_preferences (
  profile_id       uuid primary key references public.profiles(id) on delete cascade,
  unsubscribed_at  timestamptz,
  unsub_reason     text,
  updated_at       timestamptz not null default now()
);

-- ─── updated_at trigger for contact_preferences ─────────────
create trigger trg_contact_preferences_updated_at
  before update on public.contact_preferences
  for each row execute function public.set_updated_at();

-- ─── RLS: enabled, zero policies ────────────────────────────
-- All access is via the service role (createAdminClient) after the
-- requireSuperAdmin guard. Regular users cannot see these tables at all.
alter table public.contact_tags        enable row level security;
alter table public.profile_tags        enable row level security;
alter table public.contact_notes       enable row level security;
alter table public.contact_preferences enable row level security;
