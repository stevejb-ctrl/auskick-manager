"use client";

// ─── LendSetting ─────────────────────────────────────────────
// Game settings' "Lend a player" before kickoff. The pickers each drew
// lent kids here as amber chips with a ×, and the same kids again over
// the field; the kids now show once, in LentList over the field (each
// with Bring back), and this is just the way to lend one, worded and
// shaped the same in every sport.

import { SFButton } from "@/components/sf";

export function LendSetting({
  lentCount,
  onLend,
  pending = false,
  error,
}: {
  lentCount: number;
  onLend: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink">Lend a player</p>
      <p className="mt-0.5 text-xs text-ink-mute">
        Lent players sit out for the rest of the game until you bring them back
        {lentCount > 0 ? ` (${lentCount} lent: see Lent to the other team, above the field).` : "."}
      </p>
      <SFButton variant="subtle" size="sm" className="mt-2 min-h-[44px]" disabled={pending} onClick={onLend}>
        + Lend a player
      </SFButton>
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
