// ─── A neutral order for the group chat ──────────────────────
// The share text goes to every parent, so its game time lists kids by
// number, or by name where the sport has no numbers: never by minutes,
// which put the kids who sat most at the bottom of the message (round 2
// usability, 24 Oct 2026).

export interface NamedKid {
  full_name?: string | null;
  jersey_number?: number | null;
}

/** A comparator: by number, then by name; kids with no number last. */
export function byJerseyThenName<T>(kidOf: (row: T) => NamedKid | undefined) {
  return (a: T, b: T): number => {
    const ka = kidOf(a);
    const kb = kidOf(b);
    const ja = ka?.jersey_number ?? null;
    const jb = kb?.jersey_number ?? null;
    if (ja !== jb) {
      if (ja === null) return 1;
      if (jb === null) return -1;
      return ja - jb;
    }
    return (ka?.full_name ?? "").localeCompare(kb?.full_name ?? "", "en", { sensitivity: "base" });
  };
}
