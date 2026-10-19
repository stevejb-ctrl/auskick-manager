"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";
import { gaDisableKey, isGaAllowed } from "@/lib/analytics/ga-routes";

/**
 * Loads Google Analytics on public pages only, and keeps it switched
 * off everywhere else (see src/lib/analytics/ga-routes.ts).
 *
 * It sits in the root layout, not in the public layouts, because it
 * has to see every navigation. Once gtag.js has loaded it stays
 * loaded for the life of the tab, and it reports each client-side
 * URL change as a page view. So moving from help into the app, or
 * from login into an invite, would still send the app URL. GA's own
 * opt-out flag, window['ga-disable-<id>'], stops that. It's set while
 * the new route renders, before the router pushes the URL that
 * gtag's history listener reports.
 */
export function GoogleAnalyticsGate({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allowed = isGaAllowed(pathname, searchParams);

  // Load gtag.js the first time a public page shows. A page that
  // starts on an app or token route never loads it.
  const [loaded, setLoaded] = useState(allowed);
  if (allowed && !loaded) setLoaded(true);

  if (typeof window !== "undefined") setGaDisabled(gaId, !allowed);

  // Re-sync after commit, in case React threw a render away.
  useEffect(() => {
    setGaDisabled(gaId, !allowed);
  }, [gaId, allowed]);

  // Back and forward change the URL before React renders the new
  // route, so set the flag from the popstate as well. This listener
  // goes on at hydration, ahead of the one gtag.js adds.
  useEffect(() => {
    const onPopState = () => {
      const { pathname: path, search } = window.location;
      setGaDisabled(gaId, !isGaAllowed(path, new URLSearchParams(search)));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [gaId]);

  return loaded ? <GoogleAnalytics gaId={gaId} /> : null;
}

function setGaDisabled(gaId: string, disabled: boolean) {
  (window as unknown as Record<string, boolean>)[gaDisableKey(gaId)] = disabled;
}
