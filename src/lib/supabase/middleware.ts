import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
    pathname.startsWith("/why-siren");

  if (!user && !isPublicRoute) {
    // Preserve the intended destination so sign-in lands the user back
    // where they were trying to go (e.g. deep links to a team page).
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const nextPath = pathname + (request.nextUrl.search || "");
    url.search = `?next=${encodeURIComponent(nextPath)}`;
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    // Honour ?next= so an already-signed-in user who clicked an invite
    // link and got sent to /login or /signup still ends up at the
    // invite page (or whatever deep link they wanted) instead of the
    // dashboard. Restrict to same-origin paths to prevent open redirect.
    const raw = request.nextUrl.searchParams.get("next");
    const safeNext =
      raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
    return NextResponse.redirect(new URL(safeNext, request.nextUrl.origin));
  }

  return supabaseResponse;
}
