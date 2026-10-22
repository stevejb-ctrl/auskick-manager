// Tailwind classes for the break screen's zone colours (BreakZoneColor
// in lib/sports/types.ts). Zones 1–3 are the field's own zone-f / zone-c
// / zone-b; zone 4 (a keeper) and the bench were added with the break
// redesign. Literal class names so Tailwind keeps them.

import type { BreakZoneColor } from "@/lib/sports/types";

export type BreakColor = BreakZoneColor | "bench";

export const ZONE_SWATCH: Record<BreakColor, string> = {
  zone1: "bg-zone-f",
  zone2: "bg-zone-c",
  zone3: "bg-zone-b",
  zone4: "bg-zone-k",
  bench: "bg-zone-bench",
};

export const ZONE_TEXT: Record<BreakColor, string> = {
  zone1: "text-zone-f",
  zone2: "text-zone-c",
  zone3: "text-zone-b",
  zone4: "text-zone-k-text",
  bench: "text-zone-bench-text",
};
