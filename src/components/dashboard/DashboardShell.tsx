"use client";

import { Suspense } from "react";
import type { Zone } from "@/lib/types";
import type {
  AttendanceRow,
  HeadToHeadRecord,
  PlayerChemistryPair,
  PlayerSeasonStats,
  PositionFitRow,
  QuarterScoringRow,
  Season,
  ZoneCombination,
} from "@/lib/dashboard/types";
import { SeasonSelector } from "./SeasonSelector";
import { PlayerStatsTable } from "./PlayerStatsTable";
import { WinningCombinations } from "./WinningCombinations";
import { MinutesEquity } from "./MinutesEquity";
import { PlayerChemistry } from "./PlayerChemistry";
import { PositionFit } from "./PositionFit";
import { HeadToHead } from "./HeadToHead";
import { QuarterScoring } from "./QuarterScoring";
import { AttendanceTable } from "./AttendanceTable";

interface DashboardShellProps {
  seasons: Season[];
  selectedYear: number;
  playerNames: Record<string, string>;

  // Section data
  playerStats: PlayerSeasonStats[];
  combosByZone: Partial<Record<Zone, ZoneCombination[]>>;
  chemistryPairs: PlayerChemistryPair[];
  positionFit: PositionFitRow[];
  headToHead: HeadToHeadRecord[];
  quarterScoring: QuarterScoringRow[];
  attendance: AttendanceRow[];
  totalGames: number;

  // Data availability flags
  hasZoneData: boolean;
  hasScoringData: boolean;
  hasAvailabilityData: boolean;
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function DashboardShell({
  seasons,
  selectedYear,
  playerNames,
  playerStats,
  combosByZone,
  chemistryPairs,
  positionFit,
  headToHead,
  quarterScoring,
  attendance,
  totalGames,
  hasZoneData,
  hasScoringData,
  hasAvailabilityData,
}: DashboardShellProps) {
  if (seasons.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center">
        <p className="text-sm font-medium text-gray-500">No completed games yet</p>
        <p className="mt-1 text-xs text-gray-400">
          Stats will appear here once the first game is played and finalised.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Season selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {totalGames} completed {totalGames === 1 ? "game" : "games"}
        </p>
        <Suspense fallback={null}>
          <SeasonSelector seasons={seasons} selectedYear={selectedYear} />
        </Suspense>
      </div>

      <div className="grid gap-6">
        {/* 1. Per-player stats */}
        <Section title="Player statistics">
          <PlayerStatsTable stats={playerStats} hasData={hasZoneData} />
        </Section>

        {/* 2. Winning combinations */}
        <Section title="Winning combinations">
          <WinningCombinations
            combosByZone={combosByZone}
            playerNames={playerNames}
            hasData={hasZoneData && hasScoringData}
          />
        </Section>

        {/* 3. Minutes equity */}
        <Section title="Minutes equity">
          <MinutesEquity stats={playerStats} hasData={hasZoneData} />
        </Section>

        {/* 4. Player chemistry */}
        <Section title="Player chemistry — top pairs">
          <PlayerChemistry
            pairs={chemistryPairs}
            playerNames={playerNames}
            hasData={hasZoneData && hasScoringData}
          />
        </Section>

        {/* 5. Position fit */}
        <Section title="Position fit">
          <PositionFit
            rows={positionFit}
            playerNames={playerNames}
            hasData={hasZoneData && hasScoringData}
          />
        </Section>

        {/* 6. Head-to-head */}
        <Section title="Head-to-head by opponent">
          <HeadToHead records={headToHead} hasData={totalGames > 0} />
        </Section>

        {/* 7. Quarter-by-quarter scoring */}
        <Section title="Quarter-by-quarter scoring">
          <QuarterScoring rows={quarterScoring} hasData={hasScoringData} />
        </Section>

        {/* 8. Attendance */}
        <Section title="Attendance">
          <AttendanceTable
            rows={attendance}
            totalGames={totalGames}
            hasData={hasAvailabilityData}
          />
        </Section>
      </div>
    </div>
  );
}
