"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { FeedbackModal, type FeedbackKind } from "./FeedbackModal";

interface FeedbackFabProps {
  kind: FeedbackKind;
  /**
   * Path suffixes on which the FAB should NOT render. Default
   * `["/live"]` — the in-game UI has its own chrome-aware feedback
   * trigger inside `LiveTopBar` (FeedbackHeaderButton), so the
   * floating button stays out of the way mid-game where it was
   * overlapping the opposition +G/+B chips.
   *
   * Pass `[]` to show on every route (marketing layout uses this
   * since it has no /live screens anyway, but the explicit empty
   * array is self-documenting).
   */
  hiddenOnPathSuffixes?: string[];
}

const FAB_ARIA_LABEL: Record<FeedbackKind, string> = {
  feedback: "Send feedback",
  presales: "Ask a question",
};

/**
 * Always-visible floating-button trigger for the feedback modal.
 * Both (app) and (marketing) layouts mount one; `kind` swaps the copy
 * + required fields. Submission lives in `FeedbackModal`.
 *
 * Path-hidden via a client-side `usePathname()` check so the parent
 * layouts can stay server components — mirrors `AppHeaderShell`. The
 * in-game variant lives in `LiveTopBar`'s `FeedbackHeaderButton`
 * because the floating position overlapped the opposition score chip.
 */
export function FeedbackFab({
  kind,
  hiddenOnPathSuffixes = ["/live"],
}: FeedbackFabProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Path-hide must come AFTER the hook above — React's rules-of-hooks
  // forbid conditional hooks. Returning null is fine.
  if (
    pathname &&
    hiddenOnPathSuffixes.some((suffix) => pathname.endsWith(suffix))
  ) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={FAB_ARIA_LABEL[kind]}
        data-testid={`feedback-fab-${kind}`}
        // z-40 keeps the FAB above live sticky bars (z-30) but below
        // modals (z-50) so the modal still wins the hit test once it
        // opens. safe-area padding so the FAB clears the iPhone home
        // indicator on installed PWAs.
        className="fixed bottom-4 right-4 z-40 mb-[env(safe-area-inset-bottom)] inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-warm shadow-lg transition-colors duration-fast ease-out-quart hover:bg-brand-700 active:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        {/* Inline chat-bubble SVG — no equivalent in SFIcon set yet.
            24px viewBox matches the rest of the iconography. */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>

      <FeedbackModal
        kind={kind}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
