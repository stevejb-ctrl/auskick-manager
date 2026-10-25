"use client";

import { useEffect } from "react";
import { LiveAnnouncer } from "@/components/ui/LiveAnnouncer";
import { trackFocus } from "@/components/ui/useDialogFocus";

// ─── A11yRoot ────────────────────────────────────────────────
// What every page needs for screen readers and the keyboard, mounted once
// in the root layout: the polite live region things are said into, and
// the focus history a dialog falls back on when the control that opened
// it has gone (UX round 3, e4).

export function A11yRoot() {
  useEffect(() => trackFocus(), []);
  return <LiveAnnouncer />;
}
