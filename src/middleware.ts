import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // next.config.mjs turns off Next's own /page/ → /page redirect, because
  // PostHog's /ingest API paths end in "/". Do it here for everything
  // the matcher sees (which excludes /ingest), so each page keeps one URL.
  const { pathname, search } = request.nextUrl;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    // A plain URL: a cloned nextUrl puts the slash back once Next's own
    // redirect is off, and redirects to itself.
    const url = new URL(pathname.replace(/\/+$/, "") + search, request.url);
    return NextResponse.redirect(url, 308);
  }
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
  //   - any other .js file in /public (capacitor.js, next-pwa's
  //     swe-worker-*.js). These were redirected to /login for anyone
  //     signed out, so every public page ran the login HTML as a script
  //     and threw "Unexpected token '<'" (round 5 route crawl). No app
  //     route ends in .js.
  //   - /ingest: the PostHog proxy (next.config.mjs). Events come from
  //     signed-out visitors too, and a session lookup per event would
  //     be wasted work.
  matcher: [
    "/((?!ingest|_next/static|_next/image|favicon.ico|sw.js|workbox-|fallback-|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js)$).*)",
  ],
};
