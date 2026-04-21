import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only follow `next` if it's a same-origin path — never an absolute URL.
// Mirrors the client-side safeNext() in LoginForm/SignupForm so the server
// route can't be used as an open redirect even if a caller hand-crafts the URL.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
