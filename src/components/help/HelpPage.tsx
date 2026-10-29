import Image from "next/image";
import Link from "next/link";
import { HELP_SCREENSHOTS, type HelpScreenshotPath } from "@/lib/help/screenshots";

interface HelpPageProps {
  children: React.ReactNode;
  /** Optional: show a "Back" breadcrumb. Defaults to /help. */
  backHref?: string;
  backLabel?: string;
}

export function HelpPage({
  children,
  backHref = "/help",
  backLabel = "Help",
}: HelpPageProps) {
  return (
    <article className="prose-help">
      <div className="mb-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {backLabel}
        </Link>
      </div>
      {children}
    </article>
  );
}

/**
 * A help screenshot, by its public path. next/image serves it resized
 * (WebP, lazy-loaded) at the size src/lib/help/screenshots.ts gives; a
 * path not listed there doesn't compile.
 */
export function HelpFigure({
  src,
  alt,
  caption,
}: {
  src: HelpScreenshotPath;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="help-figure my-6 overflow-hidden rounded-lg border border-hairline shadow-card">
      <Image
        src={src}
        width={HELP_SCREENSHOTS[src].width}
        height={HELP_SCREENSHOTS[src].height}
        alt={alt}
        // The article column: full width on phones, about 760px beside
        // the help sidebar from md up.
        sizes="(min-width: 768px) 760px, 100vw"
        className="h-auto w-full"
      />
      <figcaption className="border-t border-hairline bg-surface-alt px-4 py-2 text-sm text-ink-dim">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Inline callout box for tips, gestures, or keyboard shortcuts. */
export function HelpCallout({
  type = "tip",
  children,
}: {
  type?: "tip" | "note" | "warning";
  children: React.ReactNode;
}) {
  const styles = {
    tip: "border-brand-200 bg-brand-50 text-brand-700",
    note: "border-hairline bg-surface-alt text-ink-dim",
    warning: "border-warn-soft bg-warn-soft text-warn-ink",
  } as const;

  const icons = {
    tip: "💡",
    note: "ℹ️",
    warning: "⚠️",
  } as const;

  return (
    <div className={`my-4 flex gap-3 rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>
      <span className="mt-0.5 shrink-0">{icons[type]}</span>
      <div>{children}</div>
    </div>
  );
}
