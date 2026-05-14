// ─── InlineAlert ─────────────────────────────────────────────
// Shared inline-alert pattern — a single-line boxed message that
// surfaces errors / warnings without stealing focus (no modal,
// no toast). Sized for sit-above-CTA contexts in pickers,
// Q-breaks, and forms.
//
// Two kinds:
//   - "danger" (default): bg-danger/10 + text-danger. Used by
//     pre-game pickers, Q-break, and form-submit failure paths.
//   - "warn":              bg-warn-soft + text-warn. Used by
//     LiveGame's "lineup stale, refreshing" advisory.
//
// `role="alert"` makes the message screen-reader-announced when it
// mounts — appropriate for fail paths the user needs to recover
// from, not for ambient state changes.
//
// Steve 2026-05-15: extracted as part of Phase 3c of the shell
// refactor. Four identical "rounded-md bg-danger/10 px-3 py-2 text-
// sm text-danger" `<p>` tags existed across AFL/netball lineup +
// Q-break — this primitive ends the duplication and gives future
// alert tweaks one place to land.

import type { ReactNode } from "react";

type InlineAlertKind = "danger" | "warn";

interface InlineAlertProps {
  kind?: InlineAlertKind;
  children: ReactNode;
  /** Optional extra classes (e.g. spacing the caller wants). */
  className?: string;
}

const kindClasses: Record<InlineAlertKind, string> = {
  danger: "bg-danger/10 text-danger",
  warn: "bg-warn-soft text-warn",
};

export function InlineAlert({
  kind = "danger",
  children,
  className = "",
}: InlineAlertProps) {
  return (
    <p
      role="alert"
      className={`rounded-md px-3 py-2 text-sm ${kindClasses[kind]} ${className}`.trim()}
    >
      {children}
    </p>
  );
}
