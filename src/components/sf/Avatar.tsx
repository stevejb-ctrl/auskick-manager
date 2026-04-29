interface AvatarProps {
  /** Up to 3 letters. Trim/uppercase happens here. */
  initials: string;
  /** Disc diameter in px. Default 36. */
  size?: number;
  className?: string;
}

/**
 * Initials disc — used in the TopBar user menu and on team-picker
 * cards. Surface-alt background with a hairline border so it reads
 * as a tile, not a button.
 */
export function Avatar({ initials, size = 36, className = "" }: AvatarProps) {
  const text = initials.trim().toUpperCase().slice(0, 3);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-alt font-bold tracking-tightest text-ink ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
