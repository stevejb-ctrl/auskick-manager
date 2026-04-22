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
