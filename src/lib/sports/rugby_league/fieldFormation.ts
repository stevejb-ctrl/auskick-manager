// ─── Field formation slot tables ──────────────────────────────
// Pure data + resolver for the pitch layout shown on the league
// live + lineup-picker surfaces. Lives in `lib/` (not the React
// component) so it can be unit-tested without spinning up JSX.
//
// Each age group has a DIFFERENT on-field size (Junior Laws §3):
//
//   U6 / U7   →  6 on field, no vests           (3 fwd + 3 back)
//   U8        →  8 on field, FR only            (4 fwd + 1 FR + 3 back)
//   U9        →  8 on field, FR + DH            (4 fwd + 2 vest + 2 back)
//   U10 / U11 → 11 on field, FR + DH            (5 fwd + 2 vest + 4 back)
//   U12       → 13 on field, FR + DH            (6 fwd + 2 vest + 5 back)
//   U13+      → 13 on field, no vests           (6 fwd + 7 back)
//
// One slot per on-field player; no extras. Steve flagged on
// 2026-05-19 that the old hard-coded 11-slot array rendered 5
// EMPTY tiles on a U6 game.
//
// Formations attack the TOP try line. `x` / `y` are percentages of
// the pitch (centre of each tile). Tiles are 26% wide → adjacent
// centres need ≥ 26% horizontal separation to avoid overlap;
// three-across rows use 22/50/78 (the tightest that still clears).

export type FieldSlotRole = "forward" | "fr" | "dh" | "back" | "fullback";

export interface FieldSlot {
  id: string;
  role: FieldSlotRole;
  x: number;
  y: number;
}

// ─── 6-player formation (U6 / U7) — no FR/DH ─────────────────
// 3 forwards across the top, 3 backs across the bottom (last
// becomes fullback). Tag rugby at U6/U7 is positionless but we
// keep a forward/back split so the chip-aware suggester routes
// players to the zone matching their chip.
const FIELD_SLOTS_6_NO_VESTS: FieldSlot[] = [
  { id: "fwd-1", role: "forward", x: 32, y: 22 },
  { id: "fwd-2", role: "forward", x: 68, y: 22 },
  { id: "fwd-3", role: "forward", x: 50, y: 38 },
  { id: "back-1", role: "back", x: 32, y: 62 },
  { id: "back-2", role: "back", x: 68, y: 62 },
  { id: "back-3", role: "fullback", x: 50, y: 82 },
];

// ─── 8-player formation, FR only (U8) ────────────────────────
// 4 forwards in 2 rows, FR alone in the middle, 2 backs + 1
// fullback at the rear. U8 plays without a dummy-half vest.
const FIELD_SLOTS_8_FR_ONLY: FieldSlot[] = [
  { id: "fwd-1", role: "forward", x: 30, y: 16 },
  { id: "fwd-2", role: "forward", x: 70, y: 16 },
  { id: "fwd-3", role: "forward", x: 22, y: 32 },
  { id: "fwd-4", role: "forward", x: 78, y: 32 },
  { id: "fr", role: "fr", x: 50, y: 50 },
  { id: "back-1", role: "back", x: 28, y: 68 },
  { id: "back-2", role: "back", x: 72, y: 68 },
  { id: "fullback", role: "fullback", x: 50, y: 86 },
];

// ─── 8-player formation, FR + DH (U9) ────────────────────────
// 4 forwards, DH + FR side-by-side in the middle, 1 back + 1
// fullback at the rear. The back-line is sparse on purpose — at
// U9 most of the squad is in the ruck.
const FIELD_SLOTS_8_FR_DH: FieldSlot[] = [
  { id: "fwd-1", role: "forward", x: 30, y: 16 },
  { id: "fwd-2", role: "forward", x: 70, y: 16 },
  { id: "fwd-3", role: "forward", x: 22, y: 32 },
  { id: "fwd-4", role: "forward", x: 78, y: 32 },
  { id: "dh", role: "dh", x: 32, y: 50 },
  { id: "fr", role: "fr", x: 68, y: 50 },
  { id: "back-1", role: "back", x: 50, y: 68 },
  { id: "fullback", role: "fullback", x: 50, y: 86 },
];

// ─── 11-player formation, FR + DH (U10 / U11) ────────────────
// 5 forwards (2 outer + 1 inner row-1, 2 row-2), DH + FR mid,
// 4 backs in 2 rows, fullback alone. forwardCount=5 in the
// AgeGroupConfig — we now have 5 forward slots instead of 4 so
// the suggester's chip-routing doesn't overflow.
const FIELD_SLOTS_11_FR_DH: FieldSlot[] = [
  { id: "fwd-1", role: "forward", x: 32, y: 16 },
  { id: "fwd-2", role: "forward", x: 68, y: 16 },
  { id: "fwd-3", role: "forward", x: 22, y: 30 },
  { id: "fwd-4", role: "forward", x: 50, y: 30 },
  { id: "fwd-5", role: "forward", x: 78, y: 30 },
  { id: "dh", role: "dh", x: 28, y: 47 },
  { id: "fr", role: "fr", x: 72, y: 53 },
  { id: "back-1", role: "back", x: 24, y: 67 },
  { id: "back-2", role: "back", x: 76, y: 67 },
  { id: "back-3", role: "back", x: 32, y: 79 },
  { id: "back-4", role: "fullback", x: 68, y: 79 },
];

// ─── 13-player formation, FR + DH (U12) ──────────────────────
// Senior-shape: 6 forwards (3+3), DH + FR mid, 4 backs in 2
// rows, fullback alone. Mirrors the traditional 13-man jersey
// numbering — 1 fullback, 2 wingers, 3-4 centres, 5-6-7 halves
// area, 8-13 pack.
const FIELD_SLOTS_13_FR_DH: FieldSlot[] = [
  { id: "fwd-1", role: "forward", x: 22, y: 13 },
  { id: "fwd-2", role: "forward", x: 50, y: 13 },
  { id: "fwd-3", role: "forward", x: 78, y: 13 },
  { id: "fwd-4", role: "forward", x: 22, y: 27 },
  { id: "fwd-5", role: "forward", x: 50, y: 27 },
  { id: "fwd-6", role: "forward", x: 78, y: 27 },
  { id: "dh", role: "dh", x: 30, y: 44 },
  { id: "fr", role: "fr", x: 70, y: 50 },
  { id: "back-1", role: "back", x: 22, y: 64 },
  { id: "back-2", role: "back", x: 78, y: 64 },
  { id: "back-3", role: "back", x: 32, y: 78 },
  { id: "back-4", role: "back", x: 68, y: 78 },
  { id: "fullback", role: "fullback", x: 50, y: 90 },
];

// U13+ (international laws): the same 13-a-side shape, the two vest
// spots played by backs (dummy half / first receiver become halves).
const FIELD_SLOTS_13_NO_VESTS: FieldSlot[] = FIELD_SLOTS_13_FR_DH.map((s) =>
  s.role === "dh"
    ? { ...s, id: "back-5", role: "back" }
    : s.role === "fr"
      ? { ...s, id: "back-6", role: "back" }
      : s,
);

/** The hand-made layouts, by vest shape, smallest first. */
function layoutsFor(fr: boolean, dh: boolean): FieldSlot[][] {
  if (fr && dh) return [FIELD_SLOTS_8_FR_DH, FIELD_SLOTS_11_FR_DH, FIELD_SLOTS_13_FR_DH];
  if (fr) {
    // FR only past 8 a side: the 13 shape with the DH spot played by a forward.
    return [
      FIELD_SLOTS_8_FR_ONLY,
      FIELD_SLOTS_13_FR_DH.map((s) => (s.role === "dh" ? { ...s, id: "fwd-7", role: "forward" as const } : s)),
    ];
  }
  if (dh) {
    return [FIELD_SLOTS_13_FR_DH.map((s) => (s.role === "fr" ? { ...s, id: "back-5", role: "back" as const } : s))];
  }
  return [FIELD_SLOTS_6_NO_VESTS, FIELD_SLOTS_13_NO_VESTS];
}

/**
 * Resolve the formation slot array for the given on-field size +
 * vest requirements: EXACTLY one slot per on-field player, the vest
 * slots iff the grade wears vests, one fullback. Each age group's
 * usual size has a hand-made layout; a coach can also play short
 * ("Players on field", a short squad, a kid lent so both sides play
 * one down), so any other size starts from the closest larger layout
 * and gives up plain forward / back spots, from whichever line has
 * more, until it fits. (Those sizes used to get the 11-slot layout:
 * 12 a side drew 11 spots and hid a kid on the field.)
 */
export function getFieldSlots(
  onFieldSize: number,
  vestRequirements?: { fr: boolean; dh: boolean },
): FieldSlot[] {
  const fr = vestRequirements?.fr === true;
  const dh = vestRequirements?.dh === true;
  const layouts = layoutsFor(fr, dh);
  const base = layouts.find((l) => l.length >= onFieldSize) ?? layouts[layouts.length - 1];
  const slots = [...base];
  while (slots.length > Math.max(onFieldSize, 1)) {
    const forwards = slots.filter((s) => s.role === "forward").length;
    const backs = slots.filter((s) => s.role === "back").length;
    if (forwards === 0 && backs === 0) break;
    const drop: FieldSlotRole = forwards > backs ? "forward" : "back";
    let i = slots.length - 1;
    while (slots[i].role !== drop) i--;
    slots.splice(i, 1);
  }
  return slots;
}

// ─── Chip-aware overflow placement ───────────────────────────
// When the formation has more slots in a zone than the lineup
// has players for that zone, the leftover players from the
// OTHER zone fill the empties. This used to happen in declaration
// order, which shoved strongly-chipped players (e.g. a B-chip
// labelled "Back") into wrong-zone slots even when an unchipped
// player was available. Steve 2026-05-23 hit this on a U10 game
// where DH + FR were both drawn from the forwards bucket, leaving
// 2 forward slots to fill from the backs surplus.
//
// `slotMismatchScore` ranks a chip's fit for a target slot zone:
//   0 → no chip / right zone chip   (preferred for that slot)
//   1 → wrong zone chip             (mismatch, last resort)
// `pickBestForSlot` mutates the pool: removes and returns the
// lowest-scoring (best-fit) player, or null if empty.

export type ChipForSlot = string | null | undefined;
export type SlotZoneTarget = "forward" | "back";

export function slotMismatchScore(
  chip: ChipForSlot,
  slotZone: SlotZoneTarget,
): number {
  if (!chip) return 0;
  if (slotZone === "forward" && chip === "a") return 0;
  if (slotZone === "back" && chip === "b") return 0;
  return 1;
}

export function pickBestForSlot<T extends { chip?: ChipForSlot }>(
  pool: T[],
  slotZone: SlotZoneTarget,
): T | null {
  if (pool.length === 0) return null;
  let bestIdx = 0;
  let bestScore = slotMismatchScore(pool[0].chip, slotZone);
  for (let i = 1; i < pool.length; i++) {
    const s = slotMismatchScore(pool[i].chip, slotZone);
    if (s < bestScore) {
      bestIdx = i;
      bestScore = s;
    }
  }
  return pool.splice(bestIdx, 1)[0];
}

// ─── Union: a field for any size it plays ─────────────────────
// League draws hand-made shapes up to 13 a side. Union plays 5 to 15
// with its own forward / back split at each size (rugbyForwards), and no
// vests, so its field is laid out from the split: forwards in rows of
// up to three across the top, backs in rows below, the last back alone
// as the fullback. Rows share the pitch evenly, so even six rows (15 a
// side) keep tiles a row apart.

function rowSizes(count: number): number[] {
  if (count <= 0) return [];
  const rows = Math.ceil(count / 3);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

const ROW_XS: Record<number, number[]> = { 1: [50], 2: [32, 68], 3: [22, 50, 78] };

/**
 * One spot per player: `forwards` forwards, the rest backs, a fullback
 * last in the list. When the backs (fullback included) fill rows of three,
 * the fullback stands in the middle of the last row (12 a side: left wing,
 * fullback, right wing — Steve, 17 Oct 2026); otherwise alone behind them.
 */
export function unionFieldSlots(onFieldSize: number, forwards: number): FieldSlot[] {
  const size = Math.max(1, Math.round(onFieldSize));
  const fwd = Math.max(0, Math.min(size - 1, Math.round(forwards)));
  const backCount = size - fwd;
  const fullbackInRow = backCount >= 3 && backCount % 3 === 0;
  const forwardRows = rowSizes(fwd);
  const backRows = fullbackInRow ? rowSizes(backCount) : rowSizes(backCount - 1);
  const rowCount = forwardRows.length + backRows.length + (fullbackInRow ? 0 : 1);
  const yOf = (row: number) => (rowCount === 1 ? 50 : 13 + ((90 - 13) * row) / (rowCount - 1));
  const slots: FieldSlot[] = [];
  let row = 0;
  let f = 0;
  for (const n of forwardRows) {
    for (const x of ROW_XS[n]) slots.push({ id: `fwd-${++f}`, role: "forward", x, y: yOf(row) });
    row++;
  }
  let b = 0;
  let fullback: FieldSlot = { id: "fullback", role: "fullback", x: 50, y: yOf(row + backRows.length) };
  backRows.forEach((n, r) => {
    const last = r === backRows.length - 1;
    for (const x of ROW_XS[n]) {
      if (fullbackInRow && last && x === 50) fullback = { id: "fullback", role: "fullback", x, y: yOf(row) };
      else slots.push({ id: `back-${++b}`, role: "back", x, y: yOf(row) });
    }
    row++;
  });
  slots.push(fullback);
  return slots;
}
