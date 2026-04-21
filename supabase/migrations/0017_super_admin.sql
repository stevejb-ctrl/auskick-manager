-- Single-column super-admin flag on profiles. One column, no new tables,
-- no new query pattern — we already read profiles. Bootstrap in the Supabase
-- SQL editor afterwards:
--   update public.profiles set is_super_admin = true where email = '<you>';
alter table public.profiles
  add column is_super_admin boolean not null default false;

-- Partial index: only a handful of super-admins will ever exist, so skip
-- indexing the overwhelmingly-common `false` rows.
create index profiles_is_super_admin_idx
  on public.profiles (is_super_admin)
  where is_super_admin = true;
