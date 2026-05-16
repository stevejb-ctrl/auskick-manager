interface PhonePlaceholderProps {
  /** Screen name shown on the placeholder (e.g. "Live game", "Stats"). */
  label: string;
}

/**
 * Placeholder fill for the PhoneFrame, used when a real product
 * screenshot isn't ready yet (per the Field Sunday spec: "a sport-
 * tinted header band with the screen name"). The header band picks up
 * the per-sport accent CSS variables so the same component reskins
 * across /(footy) and /netball.
 */
export function PhonePlaceholder({ label }: PhonePlaceholderProps) {
  return (
    <div className="flex h-full w-full flex-col bg-warm">
      {/* Accent header band */}
      <div className="relative flex h-24 items-end bg-accent px-5 pb-4">
        <span className="font-mono text-[11px] font-bold uppercase tracking-banner text-accent-ink/80">
          Siren
        </span>
      </div>

      {/* Body — slabs that suggest a stat list without committing to
          any specific UI. Soft hairlines, dimmed text, no real data. */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="font-mono text-[10px] font-bold uppercase tracking-banner text-ink-mute">
          {label}
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-hairline pb-3 last:border-0"
            >
              <div className="h-8 w-8 rounded-full bg-surface-alt" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 w-2/3 rounded bg-surface-alt" />
                <div className="h-1.5 w-1/3 rounded bg-surface-alt/60" />
              </div>
              <div className="h-2 w-6 rounded bg-accent-soft" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
