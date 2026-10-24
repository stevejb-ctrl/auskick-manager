"use client";

// ─── SoccerLineupPicker ──────────────────────────────────────
// The soccer family's starting lineup, before kick-off (Football
// (soccer), futsal, hockey, each in its own words and on its own
// surface). Mirrors the AFL and league pickers: the shared breadcrumb
// and availability panel, a collapsible "Game settings" card, the pitch
// and bench drawn as the live game draws them, tap a kid then a second
// to swap, long-press for the shared player actions, and the shared
// footer with Save plan and "Start H1" (hockey's quarters: "Start Q1"),
// which opens the shared StartQuarterModal (two-step kick-off: only its
// Start writes anything).
//
// The suggestion comes from the family's engine (suggestSoccerLineup):
// the keeper by the age group's keeper strategy and season keeper
// minutes, the kids with the most season minutes on the bench, lines by
// season debt. Changing the size or the shape suggests again.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineupPickerBreadcrumb } from "@/components/lineup/LineupPickerBreadcrumb";
import { LineupPickerFooter } from "@/components/lineup/LineupPickerFooter";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SFButton } from "@/components/sf";
import { LockModal } from "@/components/live/LockModal";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { SUB_MINUTES_MAX, SUB_MINUTES_MIN, subMinutesFrom } from "@/lib/live/subCadence";
import {
  saveSoccerLineupDraft,
  startSoccerGame,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/soccer-actions";
import type { LiveAuth, Player } from "@/lib/types";
import { periodLabels, type SoccerSport } from "@/lib/sports";
import { soccerFormations } from "@/lib/sports/soccer";
import { soccerFamilyRules } from "@/lib/sports/soccer/family";
import {
  normalizeSoccerLineup,
  soccerOnField,
  soccerUnitOf,
  validateSoccerLineup,
  type SoccerLineup,
} from "@/lib/sports/soccer/lineup";
import { suggestSoccerLineup, type SoccerSeasonBalance } from "@/lib/sports/soccer/suggest";
import {
  benchInSoccerLineup,
  placeInSoccerLineup,
  swapInSoccerLineup,
} from "@/lib/sports/soccer/live";
import {
  SOCCER_OUTFIELD_LINES,
  type SoccerAgeGroupConfig,
  type SoccerFormation,
  type SoccerKeeperStrategy,
  type SoccerUnit,
} from "@/lib/sports/soccer/types";
import type { SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import { SoccerField } from "./SoccerField";
import { SoccerBench } from "./SoccerBench";
import { KeeperHandoverCard } from "./KeeperHandoverCard";
import { soccerKeeperNote, soccerSubModeNote } from "./soccerWords";
import { squadLoanAverage } from "@/lib/live/liveChrome";
import { onSurfaceLabel, playersOnSurfaceLabel } from "@/lib/sports/words";
import { noteLiveResult } from "@/lib/live/liveSync";

/**
 * Where a kid brought off the bench goes: the middle line when it has a
 * place left in the shape, else the first line (back to front) that
 * does. Futsal's 2-2 has no wings, so "the middle" alone would overfill
 * it.
 */
function lineWithRoom(lu: SoccerLineup, formation: SoccerFormation): SoccerUnit {
  const room = (line: (typeof SOCCER_OUTFIELD_LINES)[number]) => lu.lines[line].length < formation.lines[line];
  if (room("mid")) return "mid";
  return SOCCER_OUTFIELD_LINES.find(room) ?? "mid";
}

interface SoccerLineupPickerProps {
  auth: LiveAuth;
  /** The team's sport: its words, surface and lineup rules. */
  sport: SoccerSport;
  gameId: string;
  /** Kids here today, in squad order. */
  players: Player[];
  /** The team's age group, in its halves or quarters. */
  ageGroup: SoccerAgeGroupConfig;
  /** The game's players on the field (games.on_field_size). */
  onFieldSize: number;
  defaultSubMinutes: number;
  /** Season time per line and in goal, for the suggestion. */
  season?: SoccerSeasonBalance;
  /** How we play: who goes in goal, and who'd rather not. */
  keeperStrategy?: SoccerKeeperStrategy;
  keeperPrefs?: SoccerKeeperPrefs;
  initialDraft: { lineup: SoccerLineup; updated_at: string } | null;
  initialLoanedIds: string[];
  availabilityPanel?: React.ReactNode;
  availabilityHref?: string | null;
  /** Lent minutes in the season's other games, for the long-press sheet. */
  seasonLoanMinutes?: Record<string, number>;
}

export function SoccerLineupPicker({
  auth,
  sport,
  gameId,
  players,
  ageGroup,
  onFieldSize: initialSize,
  defaultSubMinutes,
  season,
  keeperStrategy,
  keeperPrefs,
  initialDraft,
  initialLoanedIds,
  availabilityPanel,
  availabilityHref,
  seasonLoanMinutes = {},
}: SoccerLineupPickerProps) {
  const router = useRouter();
  const pickerRootRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loanedIds, setLoanedIds] = useState<Set<string>>(() => new Set(initialLoanedIds));
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const rules = soccerFamilyRules(sport);
  const words = rules.lineLabels;
  const periodWord = periodLabels(sport, ageGroup).label;
  const firstPeriod = `${periodWord.charAt(0).toUpperCase()}1`;

  const clampSize = (n: number) => Math.max(ageGroup.minOnFieldSize, Math.min(ageGroup.maxOnFieldSize, n));
  const [onFieldSize, setOnFieldSize] = useState(() => clampSize(initialSize));
  const playing = useMemo(() => players.filter((p) => !loanedIds.has(p.id)).map((p) => p.id), [players, loanedIds]);
  const shapes = soccerFormations(ageGroup, Math.min(onFieldSize, playing.length || onFieldSize));

  const suggest = (size: number, shape: string | null, kids: string[]) =>
    suggestSoccerLineup({
      ageGroup,
      onFieldSize: size,
      formationId: shape,
      players: kids,
      season,
      keeperStrategy,
      prefs: keeperPrefs,
    });
  const [firstSuggestion] = useState(() =>
    initialDraft
      ? null
      : suggest(clampSize(initialSize), null, players.map((p) => p.id).filter((id) => !initialLoanedIds.includes(id))),
  );
  // The shape on the pitch: the coach's pick, else the suggestion's (the
  // first that fits every kid's "Plays as": futsal's diamond for a
  // Wings-only kid, never 2-2 with them up front).
  const [formationId, setFormationId] = useState<string | null>(firstSuggestion?.formation.id ?? null);
  const formation = shapes.find((f) => f.id === formationId) ?? shapes[0];

  const [lineup, setLineup] = useState<SoccerLineup>(() => {
    if (initialDraft) {
      const here = new Set(players.map((p) => p.id));
      const draft = normalizeSoccerLineup(initialDraft.lineup);
      const keep = (ids: string[]) => ids.filter((id) => here.has(id));
      const placed = new Set([...soccerOnField(draft), ...draft.bench]);
      return {
        keeper: draft.keeper && here.has(draft.keeper) ? draft.keeper : null,
        lines: {
          def: keep(draft.lines.def),
          mid: keep(draft.lines.mid),
          att: keep(draft.lines.att),
          field: keep(draft.lines.field),
        },
        // Kids marked here since the draft was saved join the bench.
        bench: [...keep(draft.bench), ...players.map((p) => p.id).filter((id) => !placed.has(id))],
      };
    }
    return firstSuggestion!.lineup;
  });
  const suggestedKeeper = useMemo(
    () => suggest(onFieldSize, formation.id, playing).lineup.keeper,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFieldSize, formation.id, playing],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fillUnit, setFillUnit] = useState<SoccerUnit | null>(null);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialDraft?.updated_at ?? null);
  const [subMinInput, setSubMinInput] = useState(String(defaultSubMinutes));
  const subIntervalSeconds = Math.round(subMinutesFrom(subMinInput, defaultSubMinutes) * 60);

  const fieldIds = soccerOnField(lineup);
  const lineCaps = formation.lines;

  function resuggest(size: number, shape: string | null) {
    const next = suggest(size, shape, playing);
    setLineup(next.lineup);
    // No shape picked: the suggestion's.
    if (shape === null) setFormationId(next.formation.id);
    setSelectedId(null);
  }

  function handleTap(pid: string, unit: SoccerUnit | null) {
    setError(null);
    if (pid === "") {
      // An empty place: a selected kid goes there; otherwise pick from the bench.
      if (selectedId && unit) {
        setLineup((lu) => placeInSoccerLineup(lu, selectedId, unit));
        setSelectedId(null);
      } else if (unit) {
        setFillUnit(unit);
      }
      return;
    }
    if (!selectedId) {
      setSelectedId(pid);
      return;
    }
    if (selectedId === pid) {
      setSelectedId(null);
      return;
    }
    setLineup((lu) => swapInSoccerLineup(lu, selectedId, pid));
    setSelectedId(null);
  }

  function pickKeeper(pid: string) {
    setLineup((lu) => {
      if (lu.keeper === pid) return lu;
      return lu.keeper ? swapInSoccerLineup(lu, lu.keeper, pid) : placeInSoccerLineup(lu, pid, "gk");
    });
  }

  function handleLend(pid: string, loaned: boolean) {
    setLoanedIds((prev) => {
      const next = new Set(prev);
      if (loaned) next.add(pid);
      else next.delete(pid);
      return next;
    });
    // A lent kid sits on the bench (marked LENT) until they're brought
    // back; the suggesters never pick them.
    if (loaned) setLineup((lu) => benchInSoccerLineup(lu, pid));
    enqueueLiveAction("markLoan", [auth, gameId, { player_id: pid, loaned, quarter: 0, elapsed_ms: 0 }]);
  }

  async function handleSavePlan() {
    setSavePending(true);
    setError(null);
    const result = await saveSoccerLineupDraft(auth, gameId, lineup);
    setSavePending(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't save your plan.");
      return;
    }
    setSavedAt(new Date().toISOString());
    if (auth.kind === "team") router.push(`/teams/${auth.teamId}/games/${gameId}`);
  }

  function handleStartGame() {
    const check = validateSoccerLineup(lineup, ageGroup, Math.min(onFieldSize, playing.length), rules);
    const firstError = check.issues.find((i) => i.kind === "error");
    if (firstError) {
      setError(firstError.message);
      return;
    }
    // Land the live view at the top (the /run demo's DeviceFrame scrolls).
    let el = pickerRootRef.current?.parentElement ?? null;
    while (el) {
      if (el.scrollTop > 0) el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    setError(null);
    setStartModalOpen(true);
  }

  function handleConfirmStart() {
    setError(null);
    startTransition(async () => {
      const result = await startSoccerGame(
        auth,
        gameId,
        lineup,
        onFieldSize,
        true,
        ageGroup.subMode.kind === "rolling" ? subIntervalSeconds : null,
      );
      // Refused because another phone already started: say so over the page.
      noteLiveResult(result);
      if (!result.success) {
        setError(result.error ?? "Couldn't start the game.");
        setStartModalOpen(false);
      }
    });
  }

  const sizeOptions = Array.from(
    { length: ageGroup.maxOnFieldSize - ageGroup.minOnFieldSize + 1 },
    (_, i) => ageGroup.minOnFieldSize + i,
  );
  const lentPlayers = players.filter((p) => loanedIds.has(p.id));
  const actionPlayer = actionPlayerId ? playerById.get(actionPlayerId) ?? null : null;
  const actionOnField = actionPlayerId !== null && soccerUnitOf(lineup, actionPlayerId) !== null;
  const settingsSummary = [
    `${onFieldSize} a side`,
    formation.keeper ? `${formation.id}` : "No lines",
    soccerSubModeNote(ageGroup.subMode, subIntervalSeconds, periodWord, rules.rollingSubs.label),
    ...(lentPlayers.length > 0 ? [`${lentPlayers.length} lent`] : []),
  ].join(" · ");

  return (
    <div ref={pickerRootRef} role="region" aria-label="Starting lineup" className="space-y-4 pb-32">
      <LineupPickerBreadcrumb availabilityHref={availabilityHref ?? undefined} />
      {availabilityPanel}

      <header className="space-y-1 px-1">
        <h1 className="text-xl font-bold text-ink">{ageGroup.label} starting lineup</h1>
        <p className="text-xs text-ink-mute">
          Tap a player to select, tap a second to swap. Long-press for the bench or to lend a player.
        </p>
      </header>

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {/* Game settings (collapsible), as AFL's and league's pickers. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={settingsOpen}
          aria-controls="soccer-game-settings"
        >
          <span className="flex flex-1 items-center gap-3 text-sm">
            <span className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute">Game settings</span>
            <span className="text-xs text-ink-mute">{settingsSummary}</span>
          </span>
          <span aria-hidden className="text-ink-mute">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className={`transition-transform duration-fast ease-out-quart ${settingsOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        {settingsOpen && (
          <div id="soccer-game-settings" className="space-y-4 border-t border-hairline px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="soccer-on-field-size" className="text-xs">
                {playersOnSurfaceLabel(sport)}
              </Label>
              <select
                id="soccer-on-field-size"
                value={onFieldSize}
                onChange={(e) => {
                  const size = parseInt(e.target.value, 10);
                  setOnFieldSize(size);
                  setFormationId(null);
                  resuggest(size, null);
                }}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
              >
                {sizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} a side
                  </option>
                ))}
              </select>
            </div>
            {shapes.length > 1 && (
              <div className="space-y-2">
                <Label className="text-xs">Shape</Label>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Shape">
                  {shapes.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={f.id === formation.id}
                      onClick={() => {
                        setFormationId(f.id);
                        resuggest(onFieldSize, f.id);
                      }}
                      className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
                        f.id === formation.id
                          ? "border-ink bg-ink text-warm"
                          : "border-hairline bg-surface text-ink-dim hover:bg-surface-alt"
                      }`}
                    >
                      {f.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ageGroup.subMode.kind === "rolling" ? (
              <div className="space-y-2">
                <Label htmlFor="soccer-sub-interval" className="text-xs">
                  Sub interval (minutes)
                </Label>
                <Input
                  id="soccer-sub-interval"
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  min={SUB_MINUTES_MIN}
                  max={SUB_MINUTES_MAX}
                  value={subMinInput}
                  onChange={(e) => setSubMinInput(e.target.value)}
                  onBlur={() => setSubMinInput(String(subMinutesFrom(subMinInput, defaultSubMinutes)))}
                  className="w-32"
                />
                <p className="text-[11px] text-ink-mute">{rules.rollingSubs.label}: {rules.rollingSubs.note}.</p>
              </div>
            ) : (
              <p className="text-xs text-ink-dim">{soccerSubModeNote(ageGroup.subMode, subIntervalSeconds, periodWord, rules.rollingSubs.label)}</p>
            )}
            <SFButton variant="ghost" size="sm" onClick={() => resuggest(onFieldSize, formation.id)}>
              Suggest again
            </SFButton>
          </div>
        )}
      </div>

      {formation.keeper && (
        <KeeperHandoverCard
          periodWord={periodWord}
          period={1}
          gear={rules.keeperGear}
          from={null}
          to={lineup.keeper ? playerById.get(lineup.keeper) ?? null : null}
          candidates={players.filter((p) => !loanedIds.has(p.id))}
          suggestedId={suggestedKeeper}
          strategyNote={soccerKeeperNote(keeperStrategy ?? ageGroup.keeper)}
          onPick={pickKeeper}
          pending={isPending}
        />
      )}

      <SoccerField
        words={words}
        surface={rules.surface}
        lineup={lineup}
        lineCaps={lineCaps}
        hasKeeper={formation.keeper}
        playersById={playerById}
        onTap={(pid, unit) => handleTap(pid, unit)}
        onLongPress={setActionPlayerId}
        selectedPlayerId={selectedId}
        dimUnselected={false}
      />
      <SoccerBench
        words={words}
        bench={lineup.bench}
        playersById={playerById}
        onTap={(pid) => handleTap(pid, null)}
        onLongPress={setActionPlayerId}
        selectedPlayerId={selectedId}
        dimUnselected={false}
        loanedIds={Array.from(loanedIds)}
      />

      {lentPlayers.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-3 py-2">
          <p className="text-xs font-semibold text-warn">Lent to the other team</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lentPlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleLend(p.id, false)}
                aria-label={`Bring ${p.full_name} back`}
                className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-surface px-2.5 py-1 text-xs font-medium text-warn transition-colors hover:bg-warn/15 motion-safe:active:scale-[0.97]"
              >
                <span>{p.full_name}</span>
                <span className="ml-0.5 text-[11px] font-semibold text-warn/80">Bring back</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <LineupPickerFooter
        onFieldCount={fieldIds.length}
        benchCount={lineup.bench.length}
        onFieldLabel={onSurfaceLabel(sport)}
        onSavePlan={auth.kind === "team" ? () => void handleSavePlan() : undefined}
        savePending={savePending}
        savedAt={savedAt}
        savePlanDisabled={fieldIds.length === 0 || isPending}
        onConfirm={handleStartGame}
        confirmLabel={`Start ${firstPeriod}`}
        confirmDisabled={fieldIds.length === 0 || isPending}
        confirmLoading={isPending}
      />

      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={null}
          // The kid's line for the Switch hint, and the season's lent
          // minutes, as on the live screen.
          currentLine={soccerUnitOf(lineup, actionPlayer.id) ? words[soccerUnitOf(lineup, actionPlayer.id)!].label : null}
          isInjured={false}
          isLoaned={loanedIds.has(actionPlayer.id)}
          seasonLoanMins={seasonLoanMinutes[actionPlayer.id] ?? 0}
          squadLoanMins={squadLoanAverage(seasonLoanMinutes)}
          onUnlock={() => setActionPlayerId(null)}
          onSwitch={() => {
            setActionPlayerId(null);
            setSelectedId(actionPlayer.id);
          }}
          onToggleBench={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            setLineup((lu) =>
              soccerUnitOf(lu, pid)
                ? benchInSoccerLineup(lu, pid)
                : placeInSoccerLineup(lu, pid, formation.keeper ? (lu.keeper ? lineWithRoom(lu, formation) : "gk") : "field"),
            );
          }}
          onToggleLoan={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            handleLend(pid, !loanedIds.has(pid));
          }}
          isOnField={actionOnField}
          onClose={() => setActionPlayerId(null)}
        />
      )}

      {fillUnit && (
        <SlotFillSheet
          slotLabel={`${words[fillUnit].label.toLowerCase()} spot`}
          candidates={lineup.bench
            .filter((id) => !loanedIds.has(id))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench."
          onPick={(pid) => {
            const unit = fillUnit;
            setFillUnit(null);
            setLineup((lu) => placeInSoccerLineup(lu, pid, unit));
          }}
          onCancel={() => setFillUnit(null)}
        />
      )}

      {startModalOpen && (
        <StartQuarterModal
          quarter={1}
          periodLabel={periodWord}
          cue="whistle goes"
          loading={isPending}
          onStart={handleConfirmStart}
          onCancel={() => setStartModalOpen(false)}
        />
      )}
    </div>
  );
}
