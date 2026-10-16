// Rugby season stats show a column per law only where the age group has
// that law (rugby union plan, phase 1). The FR / DH columns followed
// "not international laws", so league U6–U7 (no vests) showed both
// and U8 (FR only) showed DH.

import { describe, expect, it } from "vitest";
import { leagueStatsColumns } from "@/lib/dashboard/leagueStatsColumns";
import { rugbyLeagueSport } from "@/lib/sports";
import type { AgeGroupConfig } from "@/lib/sports/types";

const byId = (id: string) => rugbyLeagueSport.ageGroups.find((a) => a.id === id)!;

describe("league stats columns", () => {
  it("shows a vest's column only where the age wears it", () => {
    for (const id of ["U6", "U7"]) expect(leagueStatsColumns(byId(id)), id).toMatchObject({ fr: false, dh: false });
    expect(leagueStatsColumns(byId("U8"))).toMatchObject({ fr: true, dh: false });
    for (const id of ["U9", "U10", "U12"]) expect(leagueStatsColumns(byId(id)), id).toMatchObject({ fr: true, dh: true });
    expect(leagueStatsColumns(byId("U13"))).toMatchObject({ fr: false, dh: false });
  });

  it("keeps league's junior and international columns", () => {
    expect(leagueStatsColumns(byId("U10"))).toEqual({ goals: false, fr: true, dh: true, kickoffs: true, unbroken: true });
    expect(leagueStatsColumns(byId("U13"))).toEqual({ goals: true, fr: false, dh: false, kickoffs: false, unbroken: false });
  });

  it("each column follows its own rule", () => {
    const none = { ...byId("U6"), goalsFromPlay: false, kickRotations: false, unbrokenPeriods: false } as AgeGroupConfig;
    const off = { goals: false, fr: false, dh: false, kickoffs: false, unbroken: false };
    expect(leagueStatsColumns(none)).toEqual(off);
    expect(leagueStatsColumns({ ...none, goalsFromPlay: true })).toEqual({ ...off, goals: true });
    expect(leagueStatsColumns({ ...none, vestRequirements: { fr: true, dh: false } })).toEqual({ ...off, fr: true });
    expect(leagueStatsColumns({ ...none, vestRequirements: { fr: false, dh: true } })).toEqual({ ...off, dh: true });
    expect(leagueStatsColumns({ ...none, kickRotations: true })).toEqual({ ...off, kickoffs: true });
    expect(leagueStatsColumns({ ...none, unbrokenPeriods: true })).toEqual({ ...off, unbroken: true });
  });
});
