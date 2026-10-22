"use client";

// ─── PeriodFormatSettings ─────────────────────────────────────
// Basketball's "Halves or quarters" card on the team Settings page
// (Season). Associations differ: VIC and WA play 2 × 20 halves, QLD and
// the ACT 4 × 10 quarters. New games follow it; the period-length card
// beside it resets to the format's length.
//
// Touch and Oztag use the same card for "Halves or one period"
// (Newcastle's juniors play 25 minutes straight): pass `format="touch"`.
//
// The same card, radio row and save pattern as the other Season cards.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeamPeriodCount } from "@/app/(app)/teams/[teamId]/settings/actions";
import { InlineAlert } from "@/components/ui/InlineAlert";

interface PeriodFormatSettingsProps {
  teamId: string;
  /** 4 = quarters (basketball), 1 = one period (touch); anything else halves. */
  initialCount: number | null;
  /** The age group's half, in minutes (2 × 20 → quarters of 10). */
  halfMinutes: number;
  /** Basketball's halves or quarters (the default), or touch's halves or one period. */
  format?: "basketball" | "touch";
  isAdmin?: boolean;
}

type Count = 1 | 2 | 4;

export function PeriodFormatSettings({ teamId, initialCount, halfMinutes, format = "basketball", isAdmin = false }: PeriodFormatSettingsProps) {
  const router = useRouter();
  const other: Count = format === "touch" ? 1 : 4;
  const [count, setCount] = useState<Count>(initialCount === other ? other : 2);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function choose(next: Count) {
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

  const options: { value: Count; label: string; detail: string }[] =
    format === "touch"
      ? [
          { value: 2, label: "Halves", detail: `2 × ${halfMinutes} min` },
          { value: 1, label: "One period", detail: `${halfMinutes * 2} min straight` },
        ]
      : [
          { value: 2, label: "Halves", detail: `2 × ${halfMinutes} min` },
          { value: 4, label: "Quarters", detail: `4 × ${halfMinutes / 2} min` },
        ];
  const title = format === "touch" ? "Halves or one period" : "Halves or quarters";

  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="text-xs text-ink-mute">
        {format === "touch"
          ? "Your competition's format. Most play two halves; some juniors play one period with no half-time (set its length below)."
          : <>Your competition&apos;s format. VIC and WA domestic play halves; QLD and the ACT play quarters.</>}
      </p>
      <div role="radiogroup" aria-label={title} className="mt-3 flex gap-2">
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
