import {
  createServerClient as _createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// React.cache deduplicates calls within a single render pass — multiple
// server components calling getUser() in the same request share one
// network round-trip to Supabase auth instead of N independent ones.
export const getUser = cache(() => createClient().auth.getUser());

/**
 * Membership lookup cached for the lifetime of a single request. The
 * pre-cache flow had the live page render querying `team_memberships`
 * once, then any server action invoked from that page re-querying the
 * same row in its own `resolveWriter` — a duplicate round-trip per
 * (render, action) pair. Server-action handling and the post-action
 * RSC re-render share a request context, so `React.cache` collapses
 * them to a single query.
 *
 * Returns the membership row or null. Callers interpret the role.
 */
export const getMembership = cache(
  async (teamId: string, userId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .single();
    return data as { role: string } | null;
  },
);

export function createClient() {
  const cookieStore = cookies();
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — can be ignored
            // if middleware is refreshing user sessions
          }
        },
      },
    }
  );
}
