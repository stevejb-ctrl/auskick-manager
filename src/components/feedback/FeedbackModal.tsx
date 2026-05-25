"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { submitFeedback } from "@/lib/feedback/actions";

export type FeedbackKind = "feedback" | "presales";

interface FeedbackModalProps {
  /** Controlled — caller decides when the modal opens. */
  open: boolean;
  /** Called when the user dismisses (Cancel button, post-submit auto-close). */
  onClose: () => void;
  /**
   * `feedback` for authenticated app users (server resolves email +
   * user_id off the session); `presales` for anonymous marketing
   * visitors (form asks for an email so we can reply).
   */
  kind: FeedbackKind;
}

const COPY = {
  feedback: {
    heading: "How are we doing?",
    subhead: "Bug, request, or just a thought. We read everything.",
    messagePlaceholder:
      "What's working? What's not? Anything that surprised you?",
    submitLabel: "Send feedback",
    thanksHeading: "Thanks, we have it.",
  },
  presales: {
    heading: "Got a question?",
    subhead: "We'll get back to you ASAP.",
    messagePlaceholder:
      "Ask anything: pricing, supported sports, how the live game flow works…",
    submitLabel: "Send question",
    thanksHeading: "Thanks, we'll be in touch.",
  },
} as const;

/**
 * Controlled feedback / presales modal. Extracted from FeedbackFab so
 * the same surface can be opened from multiple triggers (the floating
 * FAB on most routes, the header icon button inside LiveTopBar on
 * /live). State lives in this component — each trigger keeps its own
 * `open` boolean and routes to this modal.
 *
 * Submission flow lives entirely here: validation + server action call
 * + inline thanks card + auto-close. Both triggers get the same UX
 * for free.
 */
export function FeedbackModal({ open, onClose, kind }: FeedbackModalProps) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot — visually hidden; real users leave blank, bots fill it.
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Auto-close the thanks card after 1.5s so the surface returns to
  // the default state — next open shows a fresh form. The reset cascade
  // (close → reset internal state) is split with a 300ms gap so the
  // modal's exit doesn't flash a blank form before unmounting.
  useEffect(() => {
    if (!sent) return;
    const closeTimer = window.setTimeout(() => {
      onClose();
      const resetTimer = window.setTimeout(() => {
        setSent(false);
        setMessage("");
        setEmail("");
      }, 300);
      return () => window.clearTimeout(resetTimer);
    }, 1500);
    return () => window.clearTimeout(closeTimer);
  }, [sent, onClose]);

  if (!open) return null;

  const copy = COPY[kind];

  function handleCancel() {
    if (isPending) return;
    setError(null);
    onClose();
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
    <Modal>
      {sent ? (
        <div role="status" className="py-2 text-center">
          <h3 className="text-lg font-semibold text-ink">
            {copy.thanksHeading}
          </h3>
          <p className="mt-1 text-sm text-ink-dim">Closing in a moment…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-ink">{copy.heading}</h3>
            <p className="mt-1 text-sm text-ink-dim">{copy.subhead}</p>
          </div>

          {kind === "presales" && (
            <div className="space-y-1">
              <Label htmlFor="feedback-email">
                Your email{" "}
                <span className="text-ink-mute">(so we can reply)</span>
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

          {/* Honeypot — copy of the ContactForm pattern. Real users never
              see this; bots that auto-fill every field trigger the
              silent-success branch in submitFeedback. */}
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
              onClick={handleCancel}
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
  );
}
