"use client";

import { useRef, useState } from "react";
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
  // A long message opens as a preview (design review, Oct 2026: a game's
  // summary ran a whole screen of minutes per kid, and the result page
  // read as a text dump). The button still copies all of it.
  const long = text.split("\n").length > 8;
  const [expanded, setExpanded] = useState(false);
  const clipped = long && !expanded;

  return (
    <>
      {/* The button drops under the title when both don't fit, and is a
          44 px target (UX round 3, e4: at 200% text it ran off the screen,
          and it was 28 px tall). */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={() => copy(text, preRef.current)}
          className="inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-left text-xs font-semibold text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700 active:bg-brand-800"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <div className="relative">
        <pre
          id={textId}
          ref={preRef}
          className={`select-all whitespace-pre-wrap break-words rounded-md bg-surface-alt [overflow-wrap:anywhere] px-3 py-2.5 font-sans text-sm leading-relaxed text-ink-dim ${
            clipped ? "max-h-[11.5rem] overflow-hidden" : ""
          }`}
        >
          {text}
        </pre>
        {clipped && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-md bg-gradient-to-t from-surface-alt to-transparent" />
        )}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={textId}
          className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-700 hover:underline"
        >
          {expanded ? "Show less" : "Show the whole message"}
        </button>
      )}
      {caption ? (
        <p className="mt-2 text-xs text-ink-mute">{caption}</p>
      ) : null}
    </>
  );
}
