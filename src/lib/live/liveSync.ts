// ─── Live sync: what one phone hears about the other ─────────
// A game can be run from two phones at once (the coach's, and a parent
// on the game-day link). Each used to refetch only after its own writes,
// so the coach's phone missed the runner's scores, period starts and
// full time until a reload (UX round 2, 24 Oct 2026). <LiveSync> (one
// per live page) watches the game and refreshes the page when the other
// phone changes it; this module is how the rest of the live code talks
// to it:
//
//   - announceLiveNotice: a line the phone should see even as the page
//     it was on gives way ("Another phone already started Q2").
//   - noteLiveResult: the same, from a server action's refusal.
//   - requestLiveSync: look now, don't wait for the next check.
//
// The stamp is the game as the server has it; liveSyncStamp.ts makes it.

import { create } from "zustand";

interface LiveNoticeState {
  notice: { id: number; text: string } | null;
  show(text: string): void;
  clear(id: number): void;
}

let noticeSeq = 0;

export const useLiveNotice = create<LiveNoticeState>((set) => ({
  notice: null,
  show: (text) => set({ notice: { id: ++noticeSeq, text } }),
  clear: (id) => set((s) => (s.notice?.id === id ? { notice: null } : s)),
}));

const syncListeners = new Set<() => void>();

/** Check the game now (a write was refused: the screen is behind). */
export function requestLiveSync(): void {
  syncListeners.forEach((l) => l());
}

export function onLiveSyncRequest(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

/** Show `text` over the live page, and catch up with the game. */
export function announceLiveNotice(text: string): void {
  useLiveNotice.getState().show(text);
  requestLiveSync();
}

/**
 * A server action's answer: when it was refused because another phone
 * had moved the game on, say so (the page is refreshing under it).
 */
export function noteLiveResult(result: { success: boolean; error?: string; stale?: boolean | true }): void {
  if (!result.success && result.stale && result.error) announceLiveNotice(result.error);
}
