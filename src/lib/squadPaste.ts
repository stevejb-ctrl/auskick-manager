// Parse a pasted squad list into players (UX plan 2.2 — adding 15–20
// kids one form at a time was the slowest part of setup). Accepts the
// shapes coaches actually paste: "Ava Smith #3", "3 Ava Smith",
// "Ava Smith, 3", "#3 Ava Smith", and spreadsheet rows split by tabs.
// A sport with no jersey numbers (netball) reads the same shapes and
// leaves the numbers off the names (UX audit 23 Oct 2026: "Sienna
// Brooks #1"), except a bare trailing number ("Mia 2"), which may be how
// the coach tells two Mias apart.

export interface ParsedPlayer {
  full_name: string;
  jersey_number: number | null;
}

/** A kid already on the squad, active or not (names and numbers to check against). */
export interface SquadKid {
  full_name: string;
  jersey_number: number | null;
  is_active: boolean;
}

export interface SquadPasteResult {
  players: ParsedPlayer[];
  /** One message per line that couldn't be used, with its line number. */
  errors: string[];
  /**
   * Lines that were kept but may be a mistake: a name listed twice or
   * already on the squad. The single add warns the same way (round 3
   * edge testing, 24 Oct 2026: one path took a duplicate silently, the
   * other refused it).
   */
  warnings: string[];
  /**
   * Lines that aren't a kid: a group-chat message's greeting, headings,
   * links, emoji and sign-off (round 3 edge testing, 24 Oct 2026: they
   * became "players", and a phone number became jersey #678).
   */
  skipped: SkippedLine[];
  /** Numbers left off the names (the sport has no jersey numbers). */
  numbersLeftOff: number;
}

export interface SkippedLine {
  line: number;
  text: string;
  /** "a heading", "a link", "a phone number", "no name", "a greeting", "too many words". */
  why: string;
}

const NUM = /^#?(\d{1,3})$/;

// Built at runtime: the project's TS target predates the `u` flag.
const LETTER = new RegExp("\\p{L}", "u");
const NOT_LETTER = new RegExp("[^\\p{L}\\s']", "gu");

/** Whole lines a group-chat message carries that are never a kid. */
const CHAT_WORDS = new Set([
  "hi", "hello", "hey", "hiya", "g'day", "hi all", "hi everyone", "hey all", "hello all",
  "thanks", "thank you", "thanks all", "thanks everyone", "ta", "cheers", "regards", "kind regards",
  "see you", "see you saturday", "see you sunday", "go team",
  "team", "squad", "players", "list", "the team", "our team",
  "forwards", "backs", "mids", "midfield", "defence", "attack", "reserves", "subs", "bench",
  "coach", "coaches", "manager", "managers",
]);

/** Why a pasted line isn't a kid, or null when it may be one. */
function junkReason(line: string): string | null {
  if (!LETTER.test(line)) return "no name";
  if (/https?:\/\/|www\./i.test(line)) return "a link";
  if (/:\s*$/.test(line)) return "a heading";
  if ((line.match(/\d/g) ?? []).length >= 8) return "a phone number";
  const words = line.replace(NOT_LETTER, " ").trim().toLocaleLowerCase().split(/\s+/);
  const bare = words.join(" ");
  // "Thanks 🙏", "Cheers", "Reserves"; or "Hi all, …" ("Hi Nguyen" is a kid).
  if (CHAT_WORDS.has(bare) || (/^(hi|hey|hello|g'day)\b/.test(bare) && words.length > 1 && /[,!]/.test(line))) {
    return "a greeting";
  }
  if (words.length > 5) return "too many words";
  return null;
}

function splitNameAndNumber(line: string): { name: string; num: string | null; bareTrailing?: boolean } {
  // Spreadsheet paste: columns split by tabs (or 2+ spaces).
  const cols = line.split(/\t| {2,}/).map((c) => c.trim()).filter(Boolean);
  if (cols.length > 1) {
    const numCol = cols.find((c) => NUM.test(c));
    const nameCols = cols.filter((c) => c !== numCol);
    return { name: nameCols.join(" "), num: numCol ? numCol.replace("#", "") : null };
  }
  let m = line.match(/^#?(\d{1,3})[\s.,:)-]+(.+)$/); // "3 Ava", "#3. Ava"
  if (m) return { name: m[2], num: m[1] };
  m = line.match(/^(.+?)([\s,]+)(#?)(\d{1,3})$/); // "Ava #3", "Ava, 3", "Ava 3"
  if (m) return { name: m[1], num: m[4], bareTrailing: m[3] === "" && !m[2].includes(",") };
  return { name: line, num: null };
}

export function parseSquadPaste(
  text: string,
  opts: { withJersey: boolean; squad?: SquadKid[] } = { withJersey: true },
): SquadPasteResult {
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const skipped: SkippedLine[] = [];
  const seenNames = new Set<string>();
  const seenJerseys = new Set<number>();
  const squad = opts.squad ?? [];
  const squadNames = new Set(squad.map((k) => nameKey(k.full_name)));
  let numbersLeftOff = 0;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const lineNo = i + 1;
    const why = junkReason(line);
    if (why) {
      skipped.push({ line: lineNo, text: line, why });
      return;
    }
    const split = splitNameAndNumber(line);
    let rawName = split.name;
    let num = split.num;
    if (!opts.withJersey) {
      // No jerseys: "Mia 2" stays whole; any other number is left off.
      if (num !== null && split.bareTrailing) rawName = line;
      else if (num !== null) numbersLeftOff++;
      num = null;
    }
    const full_name = rawName.replace(/[\s,]+$/, "").replace(/\s+/g, " ").trim();

    if (!full_name) {
      errors.push(`Line ${lineNo}: no name.`);
      return;
    }
    let jersey_number: number | null = null;
    if (num !== null) {
      jersey_number = Number(num);
      if (jersey_number < 1 || jersey_number > 99) {
        errors.push(`Line ${lineNo}: jersey #${num} must be 1–99.`);
        return;
      }
      if (seenJerseys.has(jersey_number)) {
        errors.push(`Line ${lineNo}: jersey #${jersey_number} is listed twice.`);
        return;
      }
      // The number is the squad's already (the database refuses it, and
      // the coach needs to know whose).
      const owner = squad.find((k) => k.jersey_number === jersey_number);
      if (owner) {
        errors.push(`Line ${lineNo}: #${jersey_number} is ${owner.full_name}'s${owner.is_active ? "" : " (inactive)"}.`);
        return;
      }
      seenJerseys.add(jersey_number);
    }
    const key = nameKey(full_name);
    if (seenNames.has(key)) warnings.push(`Line ${lineNo}: ${full_name} is listed twice.`);
    else if (squadNames.has(key)) warnings.push(`Line ${lineNo}: there's already a ${full_name} on the squad.`);
    seenNames.add(key);
    players.push({ full_name, jersey_number });
  });

  return { players, errors, warnings, skipped, numbersLeftOff };
}

/** A name to compare: case and spacing don't count. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
