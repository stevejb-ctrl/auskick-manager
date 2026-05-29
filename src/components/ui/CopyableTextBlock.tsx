"use client";

import { useRef } from "react";
import { useCopyToClipboard } from "./useCopyToClipboard";

export interface CopyableTextBlockProps {
  /** Heading shown to the left of the copy button (e.g. "Game summary"). */
  title: string;
  /** The full text rendered in the selectable block and copied on tap. */
  text: string;
  /**
   * Optional id for the <pre>, kept for existing e2e selectors
   * (#netball-game-summary-text etc.). Omit for new surfaces.
   */
  textId?: string;
  /** Button label before copying. */
  copyLabel?: string;
  /** Button label for the brief confirmation after copying. */
  copiedLabel?: string;
  /** Helper caption under the block. Pass null to hide it. */
  caption?: string | null;
}

/**
 * The shared "copy this text into the group chat" block: a heading,
 * a brand copy button with a transient ✓ Copied! state, a selectable
 * monospace-wrapped text panel, and a helper caption.
 *
 * Renders a fragment (no wrapper) so it drops into an existing card
 * exactly where the hand-rolled markup used to live. Consumed by the
 * AFL / netball / rugby-league post-game summary cards and the
 * pre-game GamePlanModal.
 */
export function CopyableTextBlock({
  title,
  text,
  textId,
  copyLabel = "Copy for group chat",
  copiedLabel = "✓ Copied!",
  caption = "Tap the text to select it, or use the button above.",
}: CopyableTextBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const { copied, copy } = useCopyToClipboard();

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={() => copy(text, preRef.current)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700 active:bg-brand-800"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre
        id={textId}
        ref={preRef}
        className="select-all whitespace-pre-wrap rounded-md bg-surface-alt px-3 py-2.5 font-sans text-sm leading-relaxed text-ink-dim"
      >
        {text}
      </pre>
      {caption ? (
        <p className="mt-2 text-xs text-ink-mute">{caption}</p>
      ) : null}
    </>
  );
}
