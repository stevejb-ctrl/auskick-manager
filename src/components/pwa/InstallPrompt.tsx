"use client";

import { useEffect, useState } from "react";
import { isAndroidChromium, isIos, isStandalone } from "@/lib/pwa";

// Soft "Add to Home Screen" banner. Two variants:
//
//   - iOS Safari: shows static instructions ("Tap Share, then Add to
//     Home Screen") because iOS does not expose a programmatic
//     install API.
//   - Android Chrome: captures the `beforeinstallprompt` event and
//     surfaces an Install button that triggers the native install
//     sheet via `.prompt()`.
//
// Hidden when already running standalone, when the user has dismissed
// it this session (sessionStorage so a fresh tab gets another chance
// — localStorage would be too sticky), or on non-mobile browsers.

const DISMISS_KEY = "siren:install-prompt:dismissed";

// `beforeinstallprompt` is non-standard, so the type isn't in lib.dom.
// Declaring locally rather than augmenting the global Event registry
// keeps the surface small and contained to this file.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallPrompt() {
  const [variant, setVariant] = useState<"ios" | "android" | null>(null);
  const [bipEvent, setBipEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {
      // sessionStorage can throw in private mode on some browsers —
      // treat as "not dismissed", the banner will just reappear.
    }

    if (isIos()) {
      setVariant("ios");
      return;
    }

    if (isAndroidChromium()) {
      const handler = (e: Event) => {
        // Prevents Chrome's mini-infobar so we control the surface.
        e.preventDefault();
        setBipEvent(e as BeforeInstallPromptEvent);
        setVariant("android");
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore — see useEffect note
    }
    setDismissed(true);
  };

  const install = async () => {
    if (!bipEvent) return;
    await bipEvent.prompt();
    const choice = await bipEvent.userChoice;
    // Either way, retire the banner: on "accepted" the standalone
    // launch will hide it; on "dismissed" we don't want to re-nag.
    dismiss();
  };

  if (dismissed || !variant) return null;

  return (
    <div
      // Defence in depth: even if conditions race, the [data-standalone]
      // marker on <html> hides this via globals.css when running PWA.
      data-pwa-hide-in-standalone
      role="dialog"
      aria-label="Install Siren"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-xl border border-hairline bg-surface px-4 py-3 shadow-modal"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">
          <p className="font-semibold text-ink">Add Siren to your home screen</p>
          {variant === "ios" ? (
            <p className="mt-1 leading-snug text-ink-dim">
              Tap the{" "}
              <span className="font-medium text-ink">Share</span> button, then{" "}
              <span className="font-medium text-ink">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-1 leading-snug text-ink-dim">
              One-tap access, runs fullscreen — feels like a native app.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {variant === "android" && (
            <button
              type="button"
              onClick={install}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              Install
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="rounded-md px-2 py-1 text-base leading-none text-ink-mute hover:bg-surface-alt hover:text-ink"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}
