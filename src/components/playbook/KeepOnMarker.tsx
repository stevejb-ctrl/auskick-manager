// A kid with a season "Plays every minute" role (UX plan 3.5). Shown on
// lineup tiles in all three sports so the role is visible where it acts
// (Stagehand: a coach set it from the long-press and nothing showed).
// Same badge vocabulary as INJ / LENT. `corner` floats it top-right on a
// tile; inline sits it after a name (netball's bench chips).

export function KeepOnMarker({ corner = true }: { corner?: boolean }) {
  return (
    <span
      className={`${
        corner ? "absolute -right-1 -top-1.5 z-10 shadow-card" : "ml-1 align-middle"
      } inline-flex items-center rounded-xs bg-brand-700 px-1 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-micro text-white`}
      aria-label="Plays every minute"
      title="Plays every minute"
    >
      Keep
    </span>
  );
}

/** Player ids whose season role keeps them on every game. */
export function keepOnIds(roles: Record<string, { keepOn: boolean }> | undefined): Set<string> {
  return new Set(Object.entries(roles ?? {}).filter(([, r]) => r.keepOn).map(([id]) => id));
}
