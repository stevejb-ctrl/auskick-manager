"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface UserMenuProps {
  /** Display email; shown both in the trigger (sm+) and at the top of the dropdown. */
  email: string;
}

/**
 * Avatar dropdown in the (app) header. Replaces the previous
 * inline "email · Sign out" pair so account-level affordances
 * (My account, Sign out) live in one discoverable place.
 *
 * Click-outside + Escape both close the menu so it doesn't trap
 * focus on phones where users tend to tap outside rather than
 * hit a small close button.
 */
export function UserMenu({ email }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  // Initial — first letter of the local part of the email. Avatars
  // sit at 32px; one letter reads cleaner than two on that footprint.
  const initial = (email[0] ?? "?").toUpperCase();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-warm shadow-card transition-transform duration-fast ease-out-quart hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        data-testid="user-menu-trigger"
      >
        <span className="text-sm font-bold">{initial}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-md border border-hairline bg-surface shadow-pop"
        >
          <div className="border-b border-hairline px-3 py-2">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-micro text-ink-mute">
              Signed in as
            </p>
            <p className="mt-0.5 truncate text-sm text-ink">{email}</p>
          </div>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
          >
            My account
          </Link>
          {/* Always-available entry point for a parent who picks up a
              join code from a second coach after already being on
              another team. Lives next to My account in the avatar
              dropdown so they don't have to leave every existing team
              just to find the join surface again. */}
          <Link
            href="/join-team"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
          >
            Join a team
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="block w-full px-3 py-2.5 text-left text-sm text-ink transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
