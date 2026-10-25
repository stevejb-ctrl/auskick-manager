// ─── The rugby field draws each kid in their own line ────────
// UX audit 23 Oct 2026 (league P1): with both vests on forwards, the
// U10 field drew two backs in the forward rows (the game plan said
// Forwards 5 / Backs 6). The formation reserved five plain forward
// spots whoever wore the vests, so the backs' surplus spilled into the
// empty forward spots. The field now lays its spots out from the
// lineup's own lines when the hand-made shape can't hold them.

import { describe, expect, it } from "vitest";
import { arrangeLeagueField, type FieldSlot } from "@/lib/sports/rugby_league/fieldFormation";

const kid = (id: string) => ({ id });
const kids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => kid(`${prefix}${i + 1}`));

const lineOf = (slot: FieldSlot) => (slot.role === "forward" || slot.role === "dh" ? "forwards" : "backs");
const VESTS = { fr: true, dh: true };

function arrange(forwards: { id: string }[], backs: { id: string }[], vests: Record<string, "fr" | "dh">, size = 11) {
  return arrangeLeagueField({
    size,
    vestRequirements: VESTS,
    players: [...forwards, ...backs],
    forwardPlayers: forwards,
    backPlayers: backs,
    vestByPlayer: vests,
  });
}

/** Every kid placed once, and every plain spot in the kid's own line. */
function expectInLine(rows: ReturnType<typeof arrange>, forwards: string[], backs: string[], vestIds: string[]) {
  const placed = rows.filter((r) => r.player).map((r) => r.player!.id);
  expect(placed.sort()).toEqual([...forwards, ...backs].sort());
  for (const { slot, player } of rows) {
    if (!player || vestIds.includes(player.id)) continue;
    expect(lineOf(slot), `${player.id} in ${slot.id}`).toBe(forwards.includes(player.id) ? "forwards" : "backs");
  }
  // Forward spots above the halfway, back spots below them.
  const ys = (line: string) => rows.filter((r) => r.slot.role !== "fr" && r.slot.role !== "dh" && lineOf(r.slot) === line).map((r) => r.slot.y);
  expect(Math.max(...ys("forwards"))).toBeLessThan(Math.min(...ys("backs")));
}

describe("arrangeLeagueField — U10, 5 forwards and 6 backs", () => {
  const forwards = kids("F", 5);
  const backs = kids("B", 6);

  it("both vests on forwards: no back is drawn in a forward spot", () => {
    const rows = arrange(forwards, backs, { F1: "fr", F2: "dh" });
    expect(rows).toHaveLength(11);
    expectInLine(rows, forwards.map((p) => p.id), backs.map((p) => p.id), ["F1", "F2"]);
    expect(rows.find((r) => r.slot.role === "fr")?.player?.id).toBe("F1");
    expect(rows.find((r) => r.slot.role === "dh")?.player?.id).toBe("F2");
  });

  it("the dummy half a forward and the first receiver a back", () => {
    const rows = arrange(forwards, backs, { B1: "fr", F1: "dh" });
    expectInLine(rows, forwards.map((p) => p.id), backs.map((p) => p.id), ["B1", "F1"]);
  });

  it("both vests on backs: the hand-made shape, unchanged", () => {
    const rows = arrange(forwards, backs, { B1: "fr", B2: "dh" });
    expectInLine(rows, forwards.map((p) => p.id), backs.map((p) => p.id), ["B1", "B2"]);
    expect(rows.map((r) => r.slot.id)).toEqual([
      "fwd-1", "fwd-2", "fwd-3", "fwd-4", "fwd-5", "dh", "fr", "back-1", "back-2", "back-3", "back-4",
    ]);
  });

  it("a kid short (one lent): every kid in line and a spot left empty", () => {
    const rows = arrange(forwards, backs.slice(0, 5), { F1: "fr", F2: "dh" });
    expect(rows).toHaveLength(11);
    expect(rows.filter((r) => !r.player)).toHaveLength(1);
    expectInLine(rows, forwards.map((p) => p.id), backs.slice(0, 5).map((p) => p.id), ["F1", "F2"]);
  });
});

describe("arrangeLeagueField — no vests (U13, 13 a side)", () => {
  it("a forward moved to the backs is drawn with the backs", () => {
    const forwards = kids("F", 5);
    const backs = kids("B", 8);
    const rows = arrangeLeagueField({
      size: 13,
      vestRequirements: { fr: false, dh: false },
      players: [...forwards, ...backs],
      forwardPlayers: forwards,
      backPlayers: backs,
      vestByPlayer: {},
    });
    expectInLine(rows, forwards.map((p) => p.id), backs.map((p) => p.id), []);
  });
});

describe("arrangeLeagueField — union (no vests, its own split)", () => {
  it("a back moved up to the forwards is drawn with the forwards", () => {
    const forwards = kids("F", 9);
    const backs = kids("B", 6);
    const rows = arrangeLeagueField({
      size: 15,
      forwardsBySize: { 15: 8 },
      players: [...forwards, ...backs],
      forwardPlayers: forwards,
      backPlayers: backs,
      vestByPlayer: {},
    });
    expect(rows).toHaveLength(15);
    expectInLine(rows, forwards.map((p) => p.id), backs.map((p) => p.id), []);
  });
});
