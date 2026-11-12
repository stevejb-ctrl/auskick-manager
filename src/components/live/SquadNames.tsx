"use client";

// ─── SquadNames ──────────────────────────────────────────────
// The squad's short names, told apart (lib/names.ts), for every tile,
// sub card, scorer sheet and toast under a live or lineup screen. The
// live route's layout (and the game-day link's) provides the squad once,
// so no screen has to thread it to each tile. Outside a provider a name
// is shortened on its own, as before.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { distinctFullNames, shortName, shortNames, type NamedPlayer } from "@/lib/names";

interface SquadNameMaps {
  tile: Map<string, string>;
  first: Map<string, string>;
  full: Map<string, string>;
}

const SquadNamesContext = createContext<SquadNameMaps | null>(null);

export function SquadNamesProvider({ players, children }: { players: NamedPlayer[]; children: ReactNode }) {
  const maps = useMemo(
    () => ({
      tile: shortNames(players, "initial"),
      first: shortNames(players, "first"),
      full: distinctFullNames(players),
    }),
    [players],
  );
  return <SquadNamesContext.Provider value={maps}>{children}</SquadNamesContext.Provider>;
}

type Named = { id: string; full_name: string };

export interface SquadNames {
  /** A tile's "Jack S" ("Jack Sm" beside a Jack Stone). */
  tile(p: Named): string;
  /** A toast's or sheet's "Jack" ("Jack S" beside another Jack). */
  first(p: Named): string;
  /** The full name, with a number where two kids share it. */
  full(p: Named): string;
  /** A notice's "Jack" by the kid's id, or null for a kid not in the squad. */
  byId(id: string): string | null;
}

export function useSquadNames(): SquadNames {
  const maps = useContext(SquadNamesContext);
  return useMemo(
    () => ({
      tile: (p) => maps?.tile.get(p.id) ?? shortName(p.full_name, "initial"),
      first: (p) => maps?.first.get(p.id) ?? shortName(p.full_name, "first"),
      full: (p) => maps?.full.get(p.id) ?? p.full_name,
      byId: (id) => maps?.first.get(id) ?? null,
    }),
    [maps],
  );
}
