// ─── announce ────────────────────────────────────────────────
// Something a screen reader should say: a score, a sub, the end of a
// period. Said into the one polite live region that's always on the
// page (LiveAnnouncer, in the root layout). UX round 3 (e4, 24 Oct
// 2026): the undo strip and swap toast were live regions mounted with
// their text already inside, which NVDA, JAWS and VoiceOver often skip,
// and the end of a quarter said nothing at all.
//
// What's said in the same moment (a goal's "Roos goal — Mia" and the
// new score) goes out as one message, highest priority first, and the
// same words twice in one moment are said once.

type Listener = (text: string) => void;

let listener: Listener | null = null;
let pending: { text: string; priority: number }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** How long to gather what's said together (a score and its total). */
const GATHER_MS = 120;

export function announce(text: string, opts: { priority?: number } = {}): void {
  const said = text.trim();
  if (!said || typeof window === "undefined") return;
  if (pending.some((p) => p.text === said)) return;
  pending.push({ text: said, priority: opts.priority ?? 0 });
  if (timer === null) timer = setTimeout(flush, GATHER_MS);
}

function flush(): void {
  timer = null;
  const batch = pending.slice().sort((a, b) => b.priority - a.priority);
  pending = [];
  listener?.(joinSaid(batch.map((p) => p.text)));
}

/** The region that says it. One at a time: the last to mount wins. */
export function setAnnouncer(next: Listener | null): void {
  listener = next;
}

/** "Roos goal — Mia" + "Roos 7, Hawks 3" → "Roos goal — Mia. Roos 7, Hawks 3." */
export function joinSaid(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(" ");
}

/** A swap toast in words: "Leo → Ava" is "Leo off, Ava on"; "Ava ⇄ Leo" is "Ava and Leo swapped". */
export function swapSaid(toast: string): string {
  const off = toast.match(/^(.+?)\s*→\s*(.+)$/);
  if (off) return `${off[1]} off, ${off[2]} on`;
  const swap = toast.match(/^(.+?)\s*⇄\s*(.+)$/);
  if (swap) return `${swap[1]} and ${swap[2]} swapped`;
  return toast;
}
