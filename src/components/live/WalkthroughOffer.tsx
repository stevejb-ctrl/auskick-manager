"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { SFButton } from "@/components/sf";
import { buildWalkthroughSteps, type WalkthroughStep } from "@/components/live/WalkthroughModal";
import { buildLeagueWalkthroughSteps } from "@/components/league/leagueWalkthroughSteps";

const WalkthroughModal = dynamic(
  () => import("@/components/live/WalkthroughModal").then((m) => m.WalkthroughModal),
  { ssr: false },
);

// ─── WalkthroughOffer ────────────────────────────────────────
// First-visit tour, offered inline on the pre-kickoff lineup screen.
// It used to auto-open as a modal the moment the live screen mounted —
// for AFL that was straight after Start Q1, over a running clock (UX
// plan H1, principle 1: nothing modal while the clock runs unless the
// coach asked for it). Now it's a card the coach can take or leave
// before the siren; the "?" in the live top bar still opens it any time.
//
// `storageKey` is the sport's existing "seen" flag, so a coach who has
// already done the tour (or dismissed it) never sees the card again.

interface WalkthroughOfferProps {
  storageKey: string;
  steps: WalkthroughStep[];
}

export function WalkthroughOffer({ storageKey, steps }: WalkthroughOfferProps) {
  // Starts hidden and checks storage after mount, so server and client
  // render the same markup and a returning coach never sees a flash.
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey)) setVisible(true);
    } catch {
      // Storage blocked (private mode) — skip the offer; "?" still works.
    }
  }, [storageKey]);

  function markSeen() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible && !open) return null;

  return (
    <>
      {visible && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-600/30 bg-brand-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">First game day with Siren?</p>
            <p className="text-xs text-ink-dim">
              A one-minute tour of the clock, subs and quarter breaks.
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <SFButton variant="ghost" size="sm" onClick={markSeen}>
              Not now
            </SFButton>
            <SFButton variant="accent" size="sm" onClick={() => setOpen(true)}>
              Show me
            </SFButton>
          </div>
        </div>
      )}
      {open && (
        <WalkthroughModal
          steps={steps}
          onClose={() => {
            setOpen(false);
            markSeen();
          }}
        />
      )}
    </>
  );
}

/** AFL offer — builds the AFL steps client-side for server pages. */
export function AflWalkthroughOffer({ trackScoring }: { trackScoring: boolean }) {
  const steps = useMemo(() => buildWalkthroughSteps(trackScoring), [trackScoring]);
  return <WalkthroughOffer storageKey="gm-walkthrough-seen" steps={steps} />;
}

/** Rugby league offer — builds the league steps client-side for server pages. */
export function LeagueWalkthroughOffer(
  opts: Parameters<typeof buildLeagueWalkthroughSteps>[0],
) {
  const key = JSON.stringify(opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildLeagueWalkthroughSteps(opts), [key]);
  return <WalkthroughOffer storageKey="league-walkthrough-seen" steps={steps} />;
}
