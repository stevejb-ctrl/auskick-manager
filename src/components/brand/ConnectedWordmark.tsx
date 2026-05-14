"use client";

import { SirenWordmark } from "@/components/marketing/SirenWordmark";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { useReconciledOnline } from "@/lib/live/useReconciledOnline";

// ConnectedWordmark — the app-shell wordmark with a live reconcile
// pulse. Wraps the existing SirenWordmark in a SirenPulseHalo
// keyed off `useReconciledOnline`, so a one-shot brand halo fires
// around the wordmark when the device transitions from offline (or
// had pending writes) back to a stable online state.
//
// Why this matters: the OfflineBanner is a fear signal. When it
// disappears the user has to trust silently that their queued work
// landed. The reconcile halo gives them a positive confirmation
// they can glance up and see — without the visual noise of a
// "Your work is saved!" banner.
//
// Size / theme considerations:
//   - Wordmark size stays `sm` (matches the app shell header).
//   - Halo size is `sm` too — the wordmark is small, a `md` halo
//     would overflow the header rhythm.
//   - Hue follows the brand cascade (alarm-orange on AFL,
//     court-blue on netball). The reconcile is a positive moment
//     but using the brand colour keeps the wordmark visually
//     consistent — coaches recognise the halo as "Siren is doing
//     something", not "alarm fired".
//
// First-mount: useReconciledOnline returns null until the first
// dirty→clean transition; SirenPulseHalo treats null triggerKey
// as "render no halo". So the wordmark appears quietly on every
// page load — the pulse is reserved for actual reconcile events.
export function ConnectedWordmark({
  size = "sm",
}: {
  size?: "sm" | "md" | "lg";
}) {
  const reconcileKey = useReconciledOnline();
  return (
    <SirenPulseHalo triggerKey={reconcileKey} size="sm">
      <SirenWordmark size={size} />
    </SirenPulseHalo>
  );
}
