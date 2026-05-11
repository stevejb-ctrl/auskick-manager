"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { publicOrigin } from "@/lib/platform";

interface ShareRunnerLinkProps {
  token: string;
}

export function ShareRunnerLink({ token }: ShareRunnerLinkProps) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);

  // publicOrigin() returns window.location.origin on web (brand-aware
  // between sirenfooty.com.au and sirennetball.com.au) and the
  // configured canonical host inside the Capacitor shell, where the
  // raw `capacitor://` origin would be useless in a shared link.
  const url = `${publicOrigin()}/run/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!show) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setShow(true)}
      >
        Share gameday link
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warn/30 bg-warn-soft p-3 text-xs">
      <p className="font-semibold text-warn">
        Anyone with this link can run this game — no login needed. Share
        privately.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 rounded border border-hairline bg-surface px-2 py-1 font-mono text-xs text-ink"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button type="button" size="sm" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
