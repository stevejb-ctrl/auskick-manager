import type { StateStorage } from "zustand/middleware";
import { isNative } from "@/lib/platform";

// ─── zustand persist storage adapter ──────────────────────────
//
// Three backends, picked at runtime:
//
//   - Native (Capacitor):  @capacitor/preferences. Survives app
//                          force-quit. Backed by NSUserDefaults
//                          (iOS) / SharedPreferences (Android).
//   - Web (browser):       localStorage. Survives tab close.
//                          ~5–10MB per origin which is plenty
//                          for the small slice of state we
//                          persist (lockedIds, zoneLockedPlayers
//                          and a few counters — kilobytes, not
//                          megabytes).
//   - SSR (server-side):   in-memory Map. The store rehydrates
//                          on the client once it mounts; the
//                          server-render fallback just needs to
//                          satisfy zustand's StateStorage type
//                          without throwing.
//
// All three share the same StateStorage shape, so the persist
// middleware doesn't care which is in play.

const memoryStorage = new Map<string, string>();

export const liveGameStorage: StateStorage = {
  getItem: async (name) => {
    if (typeof window === "undefined") {
      return memoryStorage.get(name) ?? null;
    }
    if (isNative()) {
      // Dynamic import — keeps @capacitor/preferences out of
      // the web bundle for users who never touch native.
      const { Preferences } = await import("@capacitor/preferences");
      const result = await Preferences.get({ key: name });
      return result.value;
    }
    return localStorage.getItem(name);
  },
  setItem: async (name, value) => {
    if (typeof window === "undefined") {
      memoryStorage.set(name, value);
      return;
    }
    if (isNative()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: name, value });
      return;
    }
    localStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    if (typeof window === "undefined") {
      memoryStorage.delete(name);
      return;
    }
    if (isNative()) {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key: name });
      return;
    }
    localStorage.removeItem(name);
  },
};
