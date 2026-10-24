"use client";

// ─── useKeptSetting ──────────────────────────────────────────
// Game settings a coach changes on a lineup screen (sub interval,
// players on the field, the shape, suggested or manual) outlive a Who's
// here change. Every sport's picker is keyed on who's here, so marking a
// late kid In remounts it with a fresh suggestion; its settings were
// local state, so they went back to the game's own and the game started
// on 4-minute subs after the coach chose 3 (UX round 2, 24 Oct 2026).
//
// A drop-in for useState, kept per game and setting for this visit (in
// memory, not across a reload: a saved plan is the coach's way to keep
// them for later). A remount starts from what the coach chose; only the
// suggested lineup refreshes.

import { useCallback, useState } from "react";

const kept = new Map<string, Map<string, unknown>>();

/** What the coach last chose for a game's setting this visit, if anything. */
export function keptSetting<T>(gameId: string, key: string): T | undefined {
  const forGame = kept.get(gameId);
  return forGame?.has(key) ? (forGame.get(key) as T) : undefined;
}

function keepSetting(gameId: string, key: string, value: unknown) {
  const forGame = kept.get(gameId) ?? new Map<string, unknown>();
  forGame.set(key, value);
  kept.set(gameId, forGame);
}

/**
 * useState for a lineup screen's game setting. `initial` is the game's
 * own value; a value the coach set earlier this visit wins over it.
 * (Not for function values.)
 */
export function useKeptSetting<T>(
  gameId: string,
  key: string,
  initial: T | (() => T),
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const was = keptSetting<T>(gameId, key);
    if (was !== undefined) return was;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        keepSetting(gameId, key, v);
        return v;
      });
    },
    [gameId, key],
  );
  return [value, set];
}
