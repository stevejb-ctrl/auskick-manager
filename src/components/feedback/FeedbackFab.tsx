"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { submitFeedback } from "@/lib/feedback/actions";

interface FeedbackFabProps {
  kind: "feedback" | "presales";
  /**
   * Path suffixes on which the FAB should NOT render. Default
   * `["/live"]` matches the AppHeaderShell convention — every pixel
   * counts during a live game, so the floating button stays out of
   * the way there. Pass `[]` (empty array) to show on every route
   * (used by the marketing layout, where there are no /live screens
   * anyway but the explicit empty array is self-documenting).
   */
  hiddenOnPathSuffixes?: string[];
}

const COPY = {
  feedback: {
    heading: "How are we doing?",
    subhead: "Bug, request, or just a thought — Steve reads everything.",
    messagePlaceholder:
      "What's working? What's not? Anything that surprised you?",
    submitLabel: "Send feedback",
    thanksHeading: "Thanks, Steve has it.",
    fabAriaLabel: "Send feedback",
  },
  presales: {
    heading: "Got a question?",
    subhead: "We'll get back to you ASAP.",
    messagePlaceholder:
      "Ask anything — pricing, supported sports, how the live game flow works…",
    submitLabel: "Send question",
    thanksHeading: "Thanks, we'll be in touch.",
    fabAriaLabel: "Ask a question",
  },
} as const;

/**
 * Always-visible floating action button. Single component used by
 * both the (app) and (marketing) layouts; `kind` swaps the copy +
 * required fields. Telegrams Steve, persists to the `feedback` table,
 * and dismisses with an inline thanks card.
 *
 * Path-hidden via a client-side `usePathname()` check so the parent
 * layouts can stay server components — mirrors AppHeaderShell.
 */
export function FeedbackFab({
  kind,
  hiddenOnPathSuffixes = ["/live"],
}: FeedbackFabProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot — visually hidden; real users leave blank, bots fill it.
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Auto-close the thanks card after 1.5s so the surface returns to
  // the default state — next tap of the FAB shows a fresh form.
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => {
      setOpen(false);
      // Slight delay before resetting so the close animation can play
      // against the thanks card, not against a blank form.
      window.setTimeout(() => {
        setSent(false);
        setMessage("");
        setEmail("");
      }, 300);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [sent]);

  // Path-hide must come AFTER the hooks above — React's rules-of-
  // hooks forbid conditional hooks. Returning null is fine.
  if (
    pathname &&
    hiddenOnPathSuffixes.some((suffix) => pathname.endsWith(suffix))
  ) {
    return null;
  }

  const copy = COPY[kind];

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await submitFeedback({
        kind,
        message,
        email: kind === "presales" ? email : undefined,
        pageUrl:
          typeof window !== "undefined" ? window.location.pathname : "",
        userAgent:
          typeof window !== "undefined" ? window.navigator.userAgent : "",
        website,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.fabAriaLabel}
        data-testid={`feedback-fab-${kind}`}
        // z-40 keeps the FAB above live sticky bars (z-30) but
        // below modals (z-50) so the modal still wins the hit test
        // once it opens. safe-area padding so the FAB clears the
        // iPhone home indicator on installed PWAs.
        className="fixed bottom-4 right-4 z-40 mb-[env(safe-area-inset-bottom)] inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-warm shadow-lg transition-colors duration-fast ease-out-quart hover:bg-brand-700 active:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        {/* Inline chat-bubble SVG — no equivalent in SFIcon set yet
            (closest is `more` which reads differently). 24px viewBox
            matches the rest of the iconography. */}
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

      {open && (
        <Modal>
          {sent ? (
            <div role="status" className="py-2 text-center">
              <h3 className="text-lg font-semibold text-ink">
                {copy.thanksHeading}
              </h3>
              <p className="mt-1 text-sm text-ink-dim">
                Closing in a moment…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  {copy.heading}
                </h3>
                <p className="mt-1 text-sm text-ink-dim">{copy.subhead}</p>
              </div>

              {kind === "presales" && (
                <div className="space-y-1">
                  <Label htmlFor="feedback-email">
                    Your email <span className="text-ink-mute">(so we can reply)</span>
                  </Label>
                  <Input
                    id="feedback-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="feedback-message">Message</Label>
                <textarea
                  id="feedback-message"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={copy.messagePlaceholder}
                  className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink shadow-card placeholder:text-ink-mute focus:border-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                />
              </div>

              {/* Honeypot — copy of the ContactForm pattern. Real users
                  never see this; bots that auto-fill every field
                  trigger the silent-success branch in submitFeedback. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden opacity-0"
              >
                <label htmlFor="feedback-website">
                  Website (leave blank)
                  <input
                    id="feedback-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={isPending}>
                  {copy.submitLabel}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
