// Shared constants + reader for the validated-user-id header that
// middleware sets after supabase.auth.getUser() succeeds. Lets server
// actions skip a second auth round-trip per call (~150-400ms on 3G).
//
// SECURITY: the header is stripped from EVERY inbound request in
// middleware (lib/supabase/middleware.ts) and only re-set after the
// JWT is validated. A client cannot smuggle it in — by the time any
// code outside middleware reads it, only middleware could have set
// it on this request.

import { headers } from "next/headers";

export const SIREN_USER_ID_HEADER = "x-siren-user-id";

/**
 * Read the validated user id from the forwarded request headers.
 * Returns null if no middleware-validated session is present (e.g.
 * the request was made to a route the middleware matcher excludes,
 * or the user wasn't logged in).
 *
 * Call sites that need the user id (e.g. `resolveWriter` in
 * live/actions.ts) should prefer this over `supabase.auth.getUser()`
 * — it's free, since middleware already paid for the validation.
 */
export function readValidatedUserId(): string | null {
  const id = headers().get(SIREN_USER_ID_HEADER);
  return id && id.length > 0 ? id : null;
}
