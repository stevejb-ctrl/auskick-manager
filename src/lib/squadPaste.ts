// Parse a pasted squad list into players (UX plan 2.2 — adding 15–20
// kids one form at a time was the slowest part of setup). Accepts the
// shapes coaches actually paste: "Ava Smith #3", "3 Ava Smith",
// "Ava Smith, 3", "#3 Ava Smith", and spreadsheet rows split by tabs.

export interface ParsedPlayer {
  full_name: string;
  jersey_number: number | null;
}

export interface SquadPasteResult {
  players: ParsedPlayer[];
  /** One message per line that couldn't be used, with its line number. */
  errors: string[];
}

const NUM = /^#?(\d{1,3})$/;

function splitNameAndNumber(line: string): { name: string; num: string | null } {
  // Spreadsheet paste: columns split by tabs (or 2+ spaces).
  const cols = line.split(/\t| {2,}/).map((c) => c.trim()).filter(Boolean);
  if (cols.length > 1) {
    const numCol = cols.find((c) => NUM.test(c));
    const nameCols = cols.filter((c) => c !== numCol);
    return { name: nameCols.join(" "), num: numCol ? numCol.replace("#", "") : null };
  }
  let m = line.match(/^#?(\d{1,3})[\s.,:)-]+(.+)$/); // "3 Ava", "#3. Ava"
  if (m) return { name: m[2], num: m[1] };
  m = line.match(/^(.+?)[\s,]+#?(\d{1,3})$/); // "Ava #3", "Ava, 3", "Ava 3"
  if (m) return { name: m[1], num: m[2] };
  return { name: line, num: null };
}

export function parseSquadPaste(
  text: string,
  opts: { withJersey: boolean } = { withJersey: true },
): SquadPasteResult {
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();
  const seenJerseys = new Set<number>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const lineNo = i + 1;
    const { name: rawName, num } = opts.withJersey
      ? splitNameAndNumber(line)
      : { name: line, num: null };
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
      seenJerseys.add(jersey_number);
    }
    const key = full_name.toLowerCase();
    if (seenNames.has(key)) {
      errors.push(`Line ${lineNo}: ${full_name} is listed twice.`);
      return;
    }
    seenNames.add(key);
    players.push({ full_name, jersey_number });
  });

  return { players, errors };
}
