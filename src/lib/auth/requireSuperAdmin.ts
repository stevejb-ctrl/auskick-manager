import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Gate for /admin/* routes and admin server actions.
 *
 * - Reads the session via the anon client (RLS already allows own-profile read).
 * - Returns the authed user + their profile row when `is_super_admin` is true.
 * - Otherwise calls `notFound()` so non-admins get a clean 404 — no existence
 *   leak about which URLs exist.
 *
 * Call once at the top of any RSC, layout, or server action that needs
 * cross-tenant access, then proceed with `createAdminClient()` for reads/writes.
 */
export async function requireSuperAdmin(): Promise<{
  user: { id: string; email: string | null };
  profile: Profile;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || !(profile as Profile).is_super_admin) notFound();

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: profile as Profile,
  };
}
