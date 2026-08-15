-- Security fix (audit 2026-07): prevent privilege escalation through the
-- profiles UPDATE path.
--
-- The "profiles: update own" policy (0001) has only a USING clause
-- (id = auth.uid()) and NO WITH CHECK. Postgres then reuses USING as the
-- check, which constrains WHICH ROW a user may update but NOT which columns.
-- So a normal authenticated user can PATCH their own profile row and set
-- is_super_admin = true (added in 0025 with no column-level protection),
-- granting themselves the app's super-admin gate: read of every profile +
-- email, the feedback inbox, and the whole /admin CRM across all tenants.
--
-- Column-level REVOKE can't fix this reliably: Supabase grants the
-- authenticated/anon roles table-level UPDATE, and a table-level grant covers
-- every column regardless of a column-level REVOKE. So enforce at the row
-- level with a BEFORE UPDATE trigger. The trigger runs as the role that fired
-- it (NOT security definer — mirroring set_updated_at), so current_user is the
-- real request role. Any attempt by the client roles (authenticated/anon) to
-- change is_super_admin is silently pinned back to the stored value; a normal
-- profile edit that leaves the flag untouched is unaffected. Promotion stays a
-- service-role / SQL-editor operation, exactly as the 0025 bootstrap documents
-- (there is no app UI for it).

create or replace function public.protect_super_admin_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- PostgREST switches the DB role to authenticated/anon for client requests
  -- (anon key / user JWT). The service-role key and direct SQL run as other
  -- roles (service_role / postgres) and remain trusted.
  if new.is_super_admin is distinct from old.is_super_admin
     and current_user in ('authenticated', 'anon') then
    new.is_super_admin := old.is_super_admin;
  end if;
  return new;
end;
$$;

create trigger trg_protect_super_admin
  before update on public.profiles
  for each row
  execute function public.protect_super_admin_flag();
