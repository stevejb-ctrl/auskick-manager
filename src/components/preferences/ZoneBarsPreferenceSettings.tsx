"use client";

import { useId } from "react";
import { SFCard, Eyebrow } from "@/components/sf";
import { Toggle } from "@/components/ui/Toggle";
import { useZoneBars, writeZoneBars } from "@/lib/live/zoneBars";

/**
 * The time bars on the live screen's kids, on or off for this phone, on
 * Account beside the theme and motion settings. The live game's menu has
 * the same switch (Hide / Show time bars); both write lib/live/zoneBars.
 */
export function ZoneBarsPreferenceSettings() {
  const on = useZoneBars();
  const headingId = useId();
  return (
    <SFCard>
      <Eyebrow>Live game</Eyebrow>
      <div className="mt-1.5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-ink">
            Time bars on players
          </h2>
          <p className="mt-1 text-xs text-ink-dim">
            A thin bar under each kid&apos;s name: their time in each area this game. Kept on this phone.
          </p>
        </div>
        <Toggle checked={on} onChange={writeZoneBars} label="Time bars on players" />
      </div>
    </SFCard>
  );
}
