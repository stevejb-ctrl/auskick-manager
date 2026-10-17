// Union's field with named positions (Steve, 17 Oct 2026): each kid
// stands in their position's spot, row by row in the order the
// positions are listed, so a U11 backline reads Halfback / Centre /
// Five-eighth, then Left wing / Fullback / Right wing. The tiles used to
// fill in lineup order, so a kid labelled FB15 could stand on a wing.

import { describe, expect, it } from "vitest";
import { unionFieldSlots } from "@/lib/sports/rugby_league/fieldFormation";
import { placeByPosition } from "@/lib/sports/rugby/fieldPositions";
import { unionCatalogue } from "@/lib/sports/rugby_union/playbook";

const order = {
  forwards: unionCatalogue(12).filter((p) => p.line === "forwards").map((p) => p.label),
  backs: unionCatalogue(12).filter((p) => p.line === "backs").map((p) => p.label),
};
const slots = unionFieldSlots(12, 6);
const spot = (placed: Record<string, string | null>, id: string) => {
  const slotId = Object.keys(placed).find((s) => placed[s] === id);
  return slotId ? slots.find((s) => s.id === slotId)! : null;
};

describe("placeByPosition", () => {
  // Lineup order deliberately scrambled against the positions.
  const forwards = ["f8", "f1", "f5", "f2", "f4", "f3"];
  const backs = ["fb", "rw", "hb", "lw", "c", "fe"];
  const labels: Record<string, string> = {
    f1: "LHP1", f2: "HK2", f3: "THP3", f4: "2R4", f5: "2R5", f8: "N8",
    hb: "HB9", c: "C12", fe: "FE10", lw: "LW11", fb: "FB15", rw: "RW14",
  };

  it("puts each kid in their position's spot, rows read left to right", () => {
    const placed = placeByPosition(slots, forwards, backs, labels, order);
    const row = (ids: string[]) => ids.map((id) => spot(placed, id)!);
    const [hb, c, fe] = row(["hb", "c", "fe"]);
    expect([hb.y, c.y]).toEqual([fe.y, fe.y]);
    expect([hb.x, c.x, fe.x]).toEqual([22, 50, 78]);
    const [lw, fb, rw] = row(["lw", "fb", "rw"]);
    expect([lw.y, fb.y]).toEqual([rw.y, rw.y]);
    expect(lw.y).toBeGreaterThan(hb.y);
    expect([lw.x, fb.x, rw.x]).toEqual([22, 50, 78]);
    expect(fb.role).toBe("fullback");
    const [lhp, hk, thp, r4, r5, n8] = row(["f1", "f2", "f3", "f4", "f5", "f8"]);
    expect([lhp.x, hk.x, thp.x]).toEqual([22, 50, 78]);
    expect([r4.x, r5.x, n8.x]).toEqual([22, 50, 78]);
    expect(r4.y).toBeGreaterThan(lhp.y);
  });

  it("leaves a position's spot empty when its kid is off, and nobody shuffles", () => {
    // The centre was lent: the five other backs keep their spots.
    const placed = placeByPosition(slots, forwards, backs.filter((id) => id !== "c"), labels, order);
    expect(spot(placed, "fe")!.x).toBe(78);
    expect(spot(placed, "fb")!.role).toBe("fullback");
    const empty = Object.keys(placed).filter((s) => placed[s] === null);
    expect(empty).toHaveLength(1);
    expect(slots.find((s) => s.id === empty[0])).toMatchObject({ x: 50, role: "back" });
  });

  it("puts a kid with no position in a spot still free, and an extra one in the other line", () => {
    const placed = placeByPosition(slots, ["f1", "f2", "f3", "f4", "f5"], [...backs, "new"], labels, order);
    // Six backs' spots are taken by position; the seventh back has none,
    // so stands in the forwards' free spot.
    expect(spot(placed, "new")!.role).toBe("forward");
    expect(Object.values(placed).filter((v) => v === null)).toHaveLength(0);
  });
});
