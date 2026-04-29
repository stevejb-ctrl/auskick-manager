"use client";

import { Eyebrow, SFButton, SFIcon } from "@/components/sf";

interface LoginSentStateProps {
  /** The email the magic link was sent to. */
  email: string;
  /** Handler for the "Use a different email" button — resets to default state. */
  onBack: () => void;
  /** Handler for the "Resend" button — re-fires the magic-link request. */
  onResend: () => void;
  /** True while the resend request is in flight. */
  resending?: boolean;
  /** True after a successful resend, briefly. */
  resentNotice?: boolean;
}

/**
 * "Check your inbox" view — replaces the form once the magic link
 * has been sent. Mirrors the prototype's `<LoginSentState>`:
 *
 *   - Mono eyebrow
 *   - Headline with the user's email italic-serifed
 *   - Body copy explaining 15-min expiry + spam check
 *   - Faux email card (S monogram + sender + subject + mono caption)
 *   - Two ghost buttons: "← Use a different email" and "Resend"
 */
export function LoginSentState({
  email,
  onBack,
  onResend,
  resending = false,
  resentNotice = false,
}: LoginSentStateProps) {
  return (
    <div>
      <Eyebrow>Check your inbox</Eyebrow>
      <h1
        className="mt-1.5 text-[32px] font-bold tracking-tightest text-ink"
        style={{ lineHeight: 1.1 }}
      >
        Link sent to{" "}
        <span className="font-serif italic font-normal">
          {email || "your email"}
        </span>
      </h1>
      <p className="mt-3 mb-6 text-sm leading-relaxed text-ink-dim">
        Tap the link in the email to sign in. It expires in 15 minutes
        and only works once. If you don&apos;t see it, check spam.
        Magic links sometimes hide.
      </p>

      {/* Faux email card — matches the prototype */}
      <div className="mb-5 flex items-start gap-3.5 rounded-lg border border-hairline bg-surface p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink font-bold text-warm">
          <span style={{ fontSize: 16 }}>S</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">
            Siren Footy &lt;noreply@sirenfooty.com.au&gt;
          </div>
          <div className="mt-0.5 text-[13px] text-ink-dim">
            Your Siren Magic Link
          </div>
          <div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink-mute">
            Usually arrives in under 30 seconds
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SFButton
          variant="ghost"
          size="md"
          onClick={onBack}
          icon={<SFIcon.chevronLeft />}
        >
          Use a different email
        </SFButton>
        <SFButton
          variant="ghost"
          size="md"
          onClick={onResend}
          disabled={resending}
        >
          {resending ? "Resending…" : "Resend"}
        </SFButton>
        {resentNotice && (
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ok"
            role="status"
          >
            Resent
          </span>
        )}
      </div>
    </div>
  );
}
