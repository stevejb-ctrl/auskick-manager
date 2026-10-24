// Kids' names on small surfaces: a tile says "Jack S", a toast or the
// share text "Jack". Round 3 edge testing (24 Oct 2026) found that two
// kids who share it can't be told apart anywhere: four "Jack S" tiles,
// "Tries: Jack", two "Mia — 2:00" lines, "Ava → Olivia" with two Avas on
// the field. Wherever a short name clashes within the squad, more of
// the surname, then the jersey number, then a count tells them apart.
//
// Names are shortened from the first word with a letter in it, so
// "😀 Emoji Kid" is "Emoji", not "😀".

export interface NamedPlayer {
  id: string;
  full_name: string;
  jersey_number?: number | null;
}

/** "first": "Jack" (toasts, the share text). "initial": "Jack S" (tiles). */
export type NameStyle = "first" | "initial";

// Built at runtime: the project's TS target predates the `u` flag.
const LETTER = new RegExp("\\p{L}", "u");

/** The name's words that hold a letter (an emoji or "#3" isn't a name). */
function nameWords(full: string): string[] {
  const words = full.trim().split(/\s+/).filter(Boolean);
  const named = words.filter((w) => LETTER.test(w));
  return named.length > 0 ? named : words;
}

/** The first word with a letter in it, else the name as typed. */
export function firstName(full: string): string {
  return nameWords(full)[0] ?? full.trim();
}

/** The last word's letters ("S." → "S"), or "" with one word. */
function surname(full: string): string {
  const words = nameWords(full);
  if (words.length < 2) return "";
  return Array.from(words[words.length - 1]).filter((c) => LETTER.test(c)).join("");
}

function withSurname(first: string, sur: string): string {
  return sur ? `${first} ${sur}` : first;
}

/** One name, shortened with nothing to clash with. */
export function shortName(full: string, style: NameStyle = "first"): string {
  const first = firstName(full);
  if (style === "first") return first;
  return withSurname(first, Array.from(surname(full)).slice(0, 1).join(""));
}

const key = (s: string) => s.toLocaleLowerCase();

/**
 * Each kid's short name, told apart from the rest of the squad: more of
 * the surname until it differs ("Jack Sm", "Jack St"), else the jersey
 * number ("Jack S #5"), else a count in squad order ("Mia (2)").
 * `numberShown`: the surface prints the jersey number beside the name
 * already (the share text's "#5 Jack"), so a number isn't added again.
 */
export function shortNames(
  players: NamedPlayer[],
  style: NameStyle = "first",
  opts: { numberShown?: boolean } = {},
): Map<string, string> {
  const out = new Map<string, string>();
  const groups = new Map<string, NamedPlayer[]>();
  for (const p of players) {
    const k = key(shortName(p.full_name, style));
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const group of Array.from(groups.values())) {
    if (group.length === 1) {
      out.set(group[0].id, shortName(group[0].full_name, style));
      continue;
    }
    const surs = group.map((p) => Array.from(key(surname(p.full_name))));
    const unresolved: NamedPlayer[] = [];
    group.forEach((p, i) => {
      const mine = surs[i];
      const real = Array.from(surname(p.full_name));
      const longest = Math.max(...surs.map((s) => s.length));
      for (let k = 1; k <= longest; k++) {
        const at = mine.slice(0, k).join("");
        if (surs.every((other, j) => j === i || other.slice(0, k).join("") !== at)) {
          out.set(p.id, withSurname(firstName(p.full_name), real.slice(0, k).join("")));
          return;
        }
      }
      unresolved.push(p);
    });
    // A count only among the kids a number can't tell apart.
    const unnumbered = unresolved.filter((p) => p.jersey_number == null);
    for (const p of unresolved) {
      const base = shortName(p.full_name, style);
      if (p.jersey_number != null) out.set(p.id, opts.numberShown ? base : `${base} #${p.jersey_number}`);
      else if (unnumbered.length === 1) out.set(p.id, base);
      else out.set(p.id, `${base} (${unnumbered.indexOf(p) + 1})`);
    }
  }
  return out;
}

/**
 * Full names, with the jersey number (else a count) added where two
 * kids' full names are the same — for lists that show full names (the
 * season tables, the scorers card).
 */
export function distinctFullNames(players: NamedPlayer[]): Map<string, string> {
  const out = new Map<string, string>();
  const groups = new Map<string, NamedPlayer[]>();
  for (const p of players) {
    const k = key(p.full_name.trim().replace(/\s+/g, " "));
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const group of Array.from(groups.values())) {
    const unnumbered = group.filter((p) => p.jersey_number == null);
    for (const p of group) {
      const name = p.full_name.trim();
      if (group.length === 1) out.set(p.id, name);
      else if (p.jersey_number != null) out.set(p.id, `${name} #${p.jersey_number}`);
      else if (unnumbered.length === 1) out.set(p.id, name);
      else out.set(p.id, `${name} (${unnumbered.indexOf(p) + 1})`);
    }
  }
  return out;
}
