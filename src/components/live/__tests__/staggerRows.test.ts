// A crowd on one line stands in rows of three and two (Oztag's eight:
// 3, 2, 3), so they spread across the field (Steve, 10 Nov 2026).

import { describe, expect, it } from "vitest";
import { spreadRows, staggerRows } from "@/components/live/staggerRows";

const n = (k: number) => Array.from({ length: k }, (_, i) => i);
const sizes = (k: number) => staggerRows(n(k)).map((r) => r.length);

describe("staggerRows", () => {
  it("keeps four or fewer on one row", () => {
    expect(sizes(4)).toEqual([4]);
    expect(sizes(1)).toEqual([1]);
  });
  it("staggers more in threes and twos, in order", () => {
    expect(sizes(5)).toEqual([3, 2]);
    expect(sizes(7)).toEqual([3, 2, 2]);
    expect(sizes(8)).toEqual([3, 2, 3]);
    expect(staggerRows(n(8)).flat()).toEqual(n(8));
  });
});

describe("spreadRows: a crowd's line shape, in play and at the break", () => {
  it("leaves four or fewer a plain grid", () => {
    expect(spreadRows(n(4))).toEqual({});
  });
  it("spreads more down the line in staggered rows", () => {
    expect(spreadRows(n(8))).toEqual({ rows: staggerRows(n(8)), rowsAlign: "spread" });
  });
});
