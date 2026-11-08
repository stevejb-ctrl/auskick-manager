// ─── namesThatFit ────────────────────────────────────────────
// A one-line list of kids on a live banner ("Zara Q, Eli S, +2"): as
// many names as fit a budget of characters, then "+N" for the rest.
// The banner keeps to its lines at 390 px (rugby's §6 note, Phase 12);
// the full list is still said to a screen reader.

/** The names shown, and how many more there are. */
export interface NamesThatFit {
  shown: string[];
  more: number;
  /** "Zara Q, Eli S, +2". */
  text: string;
}

export function namesThatFit(names: readonly string[], budget: number): NamesThatFit {
  const shown: string[] = [];
  let used = 0;
  for (let i = 0; i < names.length; i++) {
    const add = (shown.length > 0 ? 2 : 0) + names[i].length;
    const left = names.length - i - 1;
    // Room for ", +N" after it when more are to come.
    const tail = left > 0 ? 3 + String(left).length : 0;
    // At least one name, however long.
    if (shown.length > 0 && used + add + tail > budget) break;
    shown.push(names[i]);
    used += add;
  }
  const more = names.length - shown.length;
  return { shown, more, text: [...shown, ...(more > 0 ? [`+${more}`] : [])].join(", ") };
}
