import Link from "next/link";

// Numeric Apple ID is permanent (App Store refuses renames). The /au/
// path matches the Australian-first audience; Apple auto-redirects
// non-AU visitors to their local store, so a US user clicking from
// the marketing site still lands on the US listing.
export const APP_STORE_URL =
  "https://apps.apple.com/au/app/siren-footy/id6768541987";

interface AppStoreBadgeProps {
  /**
   * `light` = black badge with white text (use on light/cream bg).
   * `dark`  = white badge with black text (use on the FinalCTA ink bg).
   * Apple's marketing guidelines ship both colour treatments so the
   * badge stays high-contrast on either background.
   */
  theme?: "light" | "dark";
  className?: string;
}

export function AppStoreBadge({
  theme = "light",
  className = "",
}: AppStoreBadgeProps) {
  const isDark = theme === "dark";
  const palette = isDark
    ? "bg-warm text-ink border-warm hover:bg-surface-alt"
    : "bg-ink text-warm border-ink hover:bg-ink/85";
  return (
    <Link
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Siren Footy on the App Store"
      className={`inline-flex items-center gap-2.5 rounded-md border px-4 py-2 leading-none transition-colors duration-fast ease-out-quart ${palette} ${className}`}
    >
      <AppleMark className="h-7 w-7 shrink-0" />
      <span className="flex flex-col">
        <span className="text-[10px] font-medium tracking-wide">
          Download on the
        </span>
        <span className="mt-1 text-lg font-semibold tracking-tight">
          App Store
        </span>
      </span>
    </Link>
  );
}

function AppleMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282Z" />
    </svg>
  );
}
