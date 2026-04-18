"use client";

import { useState } from "react";

interface ShareRunnerLinkProps {
  token: string;
}

export function ShareRunnerLink({ token }: ShareRunnerLinkProps) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/run/${token}`
      : `/run/${token}`;

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
      <button
        type="button"
        onClick={() => setShow(true)}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        Share gameday link
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
      <p className="font-semibold text-amber-900">
        Anyone with this link can run this game — no login needed. Share
        privately.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={copy}
          className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
