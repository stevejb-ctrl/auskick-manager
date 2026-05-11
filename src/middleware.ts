import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Excludes:
  //   - Next's static/image internals
  //   - favicons + raster/vector image files
  //   - sw.js, workbox-*.js, fallback-*.js, manifest.webmanifest:
  //     the service-worker bundle next-pwa generates into /public/.
  //     Without this skip, the middleware's /login redirect for
  //     unauthenticated requests fires on every SW fetch and the
  //     SW ends up caching login HTML instead of itself.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|workbox-|fallback-|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
