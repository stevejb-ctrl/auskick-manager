"use client";

import { useEffect, useState } from "react";
import { Eyebrow, SFCard } from "@/components/sf";
import { Toggle } from "@/components/ui/Toggle";
import { applyShareUsageData } from "@/lib/analytics/client";
import { readShareUsageData, writeShareUsageData } from "@/lib/analytics/usage-data";

/**
 * "Share usage data" on My account: the opt-out from PostHog product
 * analytics, per device. On by default. The privacy policy (§8)
 * points here.
 */
export function UsageDataSettings() {
  // null until the first effect reads localStorage, so the server and
  // client render the same thing.
  const [share, setShare] = useState<boolean | null>(null);

  useEffect(() => {
    setShare(readShareUsageData());
  }, []);

  function handleChange(next: boolean) {
    setShare(next);
    writeShareUsageData(next);
    applyShareUsageData(next);
  }

  return (
    <SFCard>
      <Eyebrow>Usage data</Eyebrow>
      <div className="mt-1.5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Share usage data</h2>
          <p className="mt-1 text-xs text-ink-dim">
            Which screens and buttons get used, so we can see what to fix. Never what&apos;s on
            screen: player names, scores and notes stay on your device. Applies to this device.
          </p>
        </div>
        <Toggle
          checked={share ?? true}
          disabled={share === null}
          onChange={handleChange}
          label="Share usage data"
        />
      </div>
    </SFCard>
  );
}
