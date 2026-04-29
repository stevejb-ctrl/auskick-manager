"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Auth-aware CTA buttons for the marketing shell.
 *
 * Previously each caller (MarketingHeader, Hero, FinalCTA) ran an
 * `await getUser()` on the server, which forced the entire marketing
 * page to be rendered dynamically on every request. Moving the auth
 * check to a tiny client island lets the page ship as static HTML —
 * the shell hits the CDN, this component asks Supabase who's signed
 * in after mount, and swaps in the "Dashboard" CTA if they are.
 *
 * Default render is the signed-out state. Anonymous visitors are the
 * overwhelming majority on marketing pages, so they see the correct
 * buttons immediately; signed-in visitors briefly see "Sign in" links
 * that flip to "Dashboard" once Supabase's client SDK resolves (~100-
 * 200 ms after hydration). Acceptable — they're rarely looking at
 * marketing anyway, and both states are visually stable, not jumpy.
 */
type Variant = "header" | "hero" | "final";

interface MarketingAuthCTAsProps {
  variant: Variant;
}

export function MarketingAuthCTAs({ variant }: MarketingAuthCTAsProps) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(!!data.user);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (variant === "header") {
    return signedIn ? (
      <Link
        href="/dashboard"
        className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
      >
        Dashboard
      </Link>
    ) : (
      <>
        <Link
          href="/login"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
        >
          Sign in
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Start free
        </Link>
      </>
    );
  }

  if (variant === "hero") {
    return signedIn ? (
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-base font-medium text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
      >
        Go to dashboard
      </Link>
    ) : (
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-base font-medium text-warm shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-700"
      >
        Start free
      </Link>
    );
  }

  // variant === "final"
  return signedIn ? (
    <Link
      href="/dashboard"
      className="inline-flex items-center justify-center rounded-md bg-warm px-6 py-3 text-base font-semibold text-brand-800 shadow-card transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
    >
      Go to dashboard
    </Link>
  ) : (
    <>
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-md bg-warm px-6 py-3 text-base font-semibold text-brand-800 shadow-card transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
      >
        Create your team
      </Link>
      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-md border border-warm/30 px-6 py-3 text-base font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
      >
        Sign in
      </Link>
    </>
  );
}
