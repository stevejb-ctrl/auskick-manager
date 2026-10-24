// Every size a sport offers on the field, the database takes (UX round 3,
// 24 Oct 2026). Futsal and MiniRoos U6/U7 go down to 3 a side, but
// games_on_field_size_check (0051) allowed 4–18: kicking off at 3 a side
// ran the clock while the status write was refused (the game stayed
// "Upcoming"), and a team set to 3 couldn't create a game at all.
// Reads the constraint from the newest migration that sets it.

import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { ALL_SPORTS } from "@/lib/sports/registry";

function dbRange(): { min: number; max: number; file: string } {
  const dir = path.resolve(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let found: { min: number; max: number; file: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    const re = /add constraint games_on_field_size_check\s+check \(on_field_size between (\d+) and (\d+)\)/gi;
    for (const m of Array.from(sql.matchAll(re))) found = { min: Number(m[1]), max: Number(m[2]), file };
  }
  if (!found) throw new Error("no games_on_field_size_check in the migrations");
  return found;
}

describe("games_on_field_size_check", () => {
  const db = dbRange();
  const ranges = ALL_SPORTS.flatMap((sport) =>
    [...sport.ageGroups, ...(sport.legacyAgeGroups ?? [])].map((a) => ({
      where: `${sport.id} ${a.id}`,
      min: a.minOnFieldSize,
      max: a.maxOnFieldSize,
    })),
  );

  it("takes every sport's fewest on the field", () => {
    const refused = ranges.filter((r) => r.min < db.min).map((r) => `${r.where} (${r.min})`);
    expect(refused, `${db.file} allows ${db.min}–${db.max}`).toEqual([]);
  });

  it("takes every sport's most on the field", () => {
    const refused = ranges.filter((r) => r.max > db.max).map((r) => `${r.where} (${r.max})`);
    expect(refused, `${db.file} allows ${db.min}–${db.max}`).toEqual([]);
  });
});
