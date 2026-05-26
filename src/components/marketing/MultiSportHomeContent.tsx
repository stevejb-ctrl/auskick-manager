"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MARKETING_SPORT,
  getMarketingSport,
  isMarketingSportId,
  type MarketingSportId,
} from "@/lib/sports/marketing-sports";
import {
  getMarketingCopy,
  SHARED_TRUST_BAND,
} from "@/lib/sports/marketing-copy";
import { MultiSportSection } from "@/components/marketing/MultiSportSection";
import { TrustBand } from "@/components/marketing/TrustBand";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";

const LS_KEY = "siren.sport";

/**
 * Client wrapper that owns the active-sport state for the multi-sport
 * homepage and threads it through every section that needs to swap
 * copy when the picker changes:
 *
 *   1. MultiSportSection — the picker itself (controlled).
 *   2. TrustBand         — per-sport stats strip.
 *   3. ScrollingFeatures — full feature scroll; `key` forces a clean
 *                          remount on sport change so the
 *                          IntersectionObserver doesn't carry a
 *                          stale activeIndex from the previous
 *                          sport's feature array.
 *   4. FinalCTA          — closing CTA + AppStoreBadge visibility
 *                          (badge is AFL-only in v1).
 *
 * State + localStorage persistence live here, lifted out of
 * MultiSportSection so the other sections can read the same source
 * of truth. Default = AFL on first load; picker selection persists
 * to `localStorage["siren.sport"]` so a returning visitor sees
 * their last pick.
 *
 * The hero stays out of this wrapper — it's host-resolved
 * server-side (sirenfooty.com.au → AFL hero, sirennetball.com.au →
 * netball hero) and shouldn't react to the picker. The picker is
 * for visitors exploring "what does Siren look like in OTHER
 * sports", not for swapping their landed-on context.
 */
export function MultiSportHomeContent() {
  const [sportId, setSportId] = useState<MarketingSportId>(
    DEFAULT_MARKETING_SPORT,
  );

  // Hydrate from localStorage after mount. Wrapped in try/catch
  // because Safari Private Browsing throws on localStorage access
  // when quota is zero. Coming-soon sports are filtered — a
  // returning visitor whose last pick was Union (now disabled)
  // falls back to the default rather than landing on a sport they
  // can no longer interact with via the picker.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_KEY);
      if (stored && isMarketingSportId(stored) && stored !== sportId) {
        const storedSport = getMarketingSport(stored);
        if (!storedSport.comingSoon) {
          setSportId(stored);
        }
      }
    } catch {
      // Silently fall back to the default — picker still works,
      // just doesn't survive page reloads for this user.
    }
    // Intentionally run once on mount; we don't want changes during
    // the session to trigger a re-read of localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSportChange = useCallback((next: MarketingSportId) => {
    setSportId(next);
    try {
      window.localStorage.setItem(LS_KEY, next);
    } catch {
      // No-op — see the read site above.
    }
  }, []);

  const copy = getMarketingCopy(sportId);

  return (
    <>
      <MultiSportSection sportId={sportId} onSportChange={handleSportChange} />
      {/* TrustBand uses SHARED_TRUST_BAND (platform-wide stats) not
          per-sport copy.trustBand — Steve 2026-05-26: "1,200+
          coaches, 38k games etc are the same across all sports". */}
      <TrustBand entries={SHARED_TRUST_BAND} />
      {/* Key forces a clean remount when the sport changes. Without
          it, ScrollingFeatures's IntersectionObserver hangs on to
          stale refs (one set of refs per feature index) from the
          previous sport's features array, and activeIndex can point
          past the end if the new sport has fewer features. */}
      <ScrollingFeatures
        key={sportId}
        features={copy.features}
        centerpiece={copy.centerpiece}
      />
      {/* AppStoreBadge stays on for every sport — Steve 2026-05-26:
          "Keep the Show in App store on all variants." iOS app is
          still footy-only in v1 (mobile/capacitor.config.ts) but the
          consistent badge presence wins over a sport-gated CTA. */}
      <FinalCTA copy={copy} showAppStoreBadge={true} />
    </>
  );
}
