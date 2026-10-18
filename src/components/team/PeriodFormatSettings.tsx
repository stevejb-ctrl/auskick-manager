"use client";

// ─── PeriodFormatSettings ─────────────────────────────────────
// Basketball's "Halves or quarters" card on the team Settings page
// (Season). Associations differ: VIC and WA play 2 × 20 halves, QLD and
// the ACT 4 × 10 quarters. New games follow it; the period-length card
// beside it resets to the format's length.
//
// The same card, radio row and save pattern as the other Season cards.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeamPeriodCount } from "@/app/(app)/teams/[teamId]/settings/actions";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface PeriodFormatSettingsProps {
  teamId: string;
  /** 4 = quarters; anything else halves. */
  initialCount: number | null;
  /** The age group's half, in minutes (2 × 20 → quarters of 10). */
  halfMinutes: number;
  isAdmin?: boolean;
}

export function PeriodFormatSettings({ teamId, initialCount, halfMinutes, isAdmin = false }: PeriodFormatSettingsProps) {
  const router = useRouter();
  const [count, setCount] = useState<2 | 4>(initialCount === 4 ? 4 : 2);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function choose(next: 2 | 4) {
    if (!isAdmin || next === count) return;
    const before = count;
    setError(null);
    setSaved(false);
    setCount(next);
    startTransition(async () => {
      const result = await setTeamPeriodCount(teamId, next);
      if (!result.success) {
        setCount(before);
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const options: { value: 2 | 4; label: string; detail: string }[] = [
    { value: 2, label: "Halves", detail: `2 × ${halfMinutes} min` },
    { value: 4, label: "Quarters", detail: `4 × ${halfMinutes / 2} min` },
  ];

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-medium text-ink">Halves or quarters</p>
      <p className="text-xs text-ink-mute">
        Your competition&apos;s format. VIC and WA domestic play halves; QLD and the ACT play quarters.
      </p>
      <div role="radiogroup" aria-label="Halves or quarters" className="mt-3 flex gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={count === o.value}
            disabled={isPending || !isAdmin}
            onClick={() => choose(o.value)}
            className={`flex flex-1 flex-col items-center rounded-md border px-3 py-2 text-sm transition-colors duration-fast ease-out-quart disabled:opacity-60 ${
              count === o.value ? "border-ink bg-ink text-warm" : "border-hairline bg-surface text-ink hover:bg-surface-alt"
            }`}
          >
            <span className="font-semibold">{o.label}</span>
            <span className={`text-xs ${count === o.value ? "text-warm/80" : "text-ink-mute"}`}>{o.detail}</span>
          </button>
        ))}
      </div>
      {saved && !error && <p className="mt-2 text-xs text-brand-700">Saved.</p>}
      {error && <InlineAlert className="mt-2">{error}</InlineAlert>}
    </div>
  );
}
