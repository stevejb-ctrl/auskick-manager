// The bench tile's "→ FWD" strip in a zone's colours, with its "#1" pair
// badge, in every sport (AFL's PlayerTile, the line sports' tiles,
// soccer's and basketball's, netball's bench). One token so they can't
// drift apart (there were six copies).
//
// The words are the zone's 900 shade: on the 15% tint, under the badge's
// 15% black, the zone's own colour was 2.5–3.8:1 (UX round 3, e4); the
// 900s are 5.4:1 and up. The colour still reads from the border and tint.
export const ZONE_STRIP = {
  f: "border-zone-f/40 bg-zone-f/15 text-zone-f-ink",
  c: "border-zone-c/40 bg-zone-c/15 text-zone-c-ink",
  b: "border-zone-b/40 bg-zone-b/15 text-zone-b-ink",
} as const;
