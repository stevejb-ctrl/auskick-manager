import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { resolveBrandFromHost, BRAND_HEADER_NAME, BRAND_COOKIE_NAME } from "@/lib/brand";
import { NATIVE_COOKIE_NAME } from "@/lib/platform";
import { SIREN_USER_ID_HEADER } from "@/lib/auth/userIdHeader";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  // Strip any inbound `x-siren-user-id` so a client can't smuggle a
  // forged id past the auth dedup path. We re-set it below ONLY after
  // supabase.auth.getUser() validates the JWT.
  request.headers.delete(SIREN_USER_ID_HEADER);

  // ─── Brand routing ─────────────────────────────────────────
  // Read the host and pick a brand. In dev, `?brand=netball` or
  // NEXT_PUBLIC_DEFAULT_BRAND override. Result is stashed on the
  // request headers so downstream RSC can read it via `headers()`.
  const override =
    request.nextUrl.searchParams.get("brand") ??
    process.env.NEXT_PUBLIC_DEFAULT_BRAND ??
    request.cookies.get(BRAND_COOKIE_NAME)?.value ??
    null;
  const brand = resolveBrandFromHost(request.headers.get("host"), override);
  request.headers.set(BRAND_HEADER_NAME, brand.brand.id);

  let supabaseResponse = NextResponse.next({ request });

  // Propagate brand header onto the response too, and stick the
  // dev override into a cookie so deep-page navigations keep the
  // override without the query param.
  supabaseResponse.headers.set(BRAND_HEADER_NAME, brand.brand.id);
  if (override) {
    supabaseResponse.cookies.set(BRAND_COOKIE_NAME, brand.brand.id, {
      path: "/",
      sameSite: "lax",
    });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Stash the validated user id on the forwarded request headers so
  // server actions can skip the second `getUser()` round-trip. Perf:
  // each Supabase auth round-trip is ~150-400ms on 3G; `resolveWriter`
  // previously made it once per action. Strip-then-set above prevents
  // a client smuggling the header — only this codepath, AFTER the
  // JWT was validated by supabase, can set it.
  if (user) {
    request.headers.set(SIREN_USER_ID_HEADER, user.id);
    // Re-bake the response so the mutated request header is what
    // downstream route handlers / server actions see. The cookies
    // captured during getUser()'s setAll callback must be preserved.
    const carryCookies = supabaseResponse.cookies.getAll();
    supabaseResponse = NextResponse.next({ request });
    supabaseResponse.headers.set(BRAND_HEADER_NAME, brand.brand.id);
    if (override) {
      supabaseResponse.cookies.set(BRAND_COOKIE_NAME, brand.brand.id, {
        path: "/",
        sameSite: "lax",
      });
    }
    for (const c of carryCookies) {
      supabaseResponse.cookies.set(c);
    }
  }

  const { pathname } = request.nextUrl;

  // Routes where we handle auth inline (forms, callbacks) — logged-in
  // users on these get bounced to /dashboard.
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  // Routes that don't require a session. Marketing landing, auth
  // flows, the public run-token, and the OAuth / magic-link callback.
  // Also the static-ish SEO files (sitemap, robots), the public
  // marketing content pages (contact, privacy, terms), and the invite
  // landing page (/join/<token> — it renders a Sign in / Create account
  // CTA itself for anonymous viewers, and bouncing them to /login here
  // would drop the token and break the invite flow entirely).
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    isAuthRoute ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/run/") ||
    pathname.startsWith("/join/") ||
    pathname.startsWith("/help") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/why-siren") ||
    // /admin/* — Decap CMS static assets (index.html, config.yml).
    // The page LOADS unauthenticated; actual editing is gated by
    // GitHub OAuth via /api/decap/* (Decap can't write to the repo
    // without a valid GitHub access token). Without this exemption
    // middleware redirects /admin/config.yml → /login and the CMS
    // boots with "Failed to load config.yml (404)".
    // Note: /api/admin/* (e.g. /api/admin/seed-demo) is a different
    // prefix and still goes through the auth gate.
    pathname.startsWith("/admin") ||
    // /api/decap/* — Decap CMS OAuth proxy. These endpoints run the
    // GitHub OAuth dance on behalf of an unauthenticated visitor;
    // they can't require a Siren session because the visitor isn't
    // signed into Siren — they're signing into GitHub.
    pathname.startsWith("/api/decap/") ||
    // /dev/* — local-only auth bypass shortcuts. The route handlers
    // themselves 404 in production (NODE_ENV check + host check),
    // but the middleware needs to LET them run for the auth
    // shortcut to work; otherwise the redirect-to-/login fires
    // first and the user never reaches the sign-in handler.
    pathname.startsWith("/dev/");

  if (!user && !isPublicRoute) {
    // Preserve the intended destination so sign-in lands the user back
    // where they were trying to go (e.g. deep links to a team page).
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const nextPath = pathname + (request.nextUrl.search || "");
    url.search = `?next=${encodeURIComponent(nextPath)}`;
    return NextResponse.redirect(url);
  }

  // Native shell never shows the marketing site.
  //
  // The Capacitor app opens the live URL in a WebView. Once the
  // NativeCookieBridge has set `siren-native=1`, every "/" request
  // from that WebView lands here and we 302 to /login server-side.
  // No client-side routing involved — this is the entire mechanism.
  //
  // Web visitors never have this cookie set, so their experience is
  // unchanged. Authed-user-on-"/" still falls through to the home
  // page's existing server redirect to /dashboard.
  //
  // The previous iteration of this fix paired the middleware
  // redirect with a client-side `router.replace("/login")` fallback
  // for first-launch flash. That combination produced a white
  // screen on installed Capacitor shells when the service worker
  // was stale. Dropping the client bounce + tightening the SW
  // caching strategy is what makes this iteration safe.
  const isNativeShell =
    request.cookies.get(NATIVE_COOKIE_NAME)?.value === "1";
  if (!user && pathname === "/" && isNativeShell) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Track the team the user last visited so the post-login bounce
  // (and the marketing-/ → app redirect) can land them on the team
  // home instead of the multi-team "My teams" list. Steve 2026-05-13:
  // most users only have one team, so dropping them in the list
  // first is a wasted tap. Cookie set on every /teams/[id]/* visit;
  // expires after a year. /teams/new is the create-team form, not a
  // real team id, so skip it.
  const LAST_TEAM_COOKIE = "siren-last-team";
  const teamPathMatch = pathname.match(/^\/teams\/([^/]+)(?:\/|$)/);
  if (teamPathMatch) {
    const teamId = teamPathMatch[1];
    if (teamId && teamId !== "new") {
      supabaseResponse.cookies.set(LAST_TEAM_COOKIE, teamId, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  if (user && isAuthRoute) {
    // Honour ?next= so an already-signed-in user who clicked an invite
    // link and got sent to /login or /signup still ends up at the
    // invite page (or whatever deep link they wanted). Restrict to
    // same-origin paths to prevent open redirect.
    const raw = request.nextUrl.searchParams.get("next");
    const safeNext =
      raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
    let target = safeNext;
    if (!target) {
      // No explicit `?next=` — prefer the last-accessed-team cookie
      // over the dashboard list. If the user has lost access to that
      // team, /teams/[id] will redirect them back out via its own
      // membership check; the fallback is /dashboard either way.
      const lastTeam = request.cookies.get(LAST_TEAM_COOKIE)?.value;
      target = lastTeam ? `/teams/${lastTeam}` : "/dashboard";
    }
    return NextResponse.redirect(new URL(target, request.nextUrl.origin));
  }

  return supabaseResponse;
}
