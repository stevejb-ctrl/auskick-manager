"use client";

import { useCallback, useState } from "react";

/**
 * Copy-to-clipboard with a graceful fallback, shared by every
 * "copy this text into the group chat" surface (post-game summaries
 * for all three sports, and the pre-game plan).
 *
 * `copy(text, fallbackEl)` writes to the async Clipboard API and flips
 * `copied` true for `resetMs`. When the Clipboard API is unavailable
 * (older in-app webviews, insecure contexts) it falls back to selecting
 * the contents of `fallbackEl` so the coach can long-press → Copy.
 *
 * Extracted from the three GameSummaryCard variants, which each carried
 * an identical hand-rolled copy of this (CLAUDE.md: reuse before fork).
 */
export function useCopyToClipboard(resetMs = 2500): {
  copied: boolean;
  copy: (text: string, fallbackEl?: HTMLElement | null) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string, fallbackEl?: HTMLElement | null) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
      } catch {
        // Clipboard API not available — select the rendered text so the
        // coach can long-press and copy manually.
        if (fallbackEl) {
          const range = document.createRange();
          range.selectNodeContents(fallbackEl);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    },
    [resetMs],
  );

  return { copied, copy };
}
