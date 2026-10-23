"use client";

// ─── BasketballLineupPicker ──────────────────────────────────
// The basketball starting five, before tip-off. Mirrors soccer's and
// AFL's pickers: the shared breadcrumb and availability panel, a
// collapsible "Game settings" card, the court and bench drawn as the
// live game draws them, tap a kid then a second to swap, long-press for
// the shared player actions, and the shared footer with Save plan and
// "Start H1" (or Q1), which opens the shared StartQuarterModal.
//
// The suggestion comes from the basketball engine
// (suggestBasketballLineup), by the team's How we play rotation: the
// kids with the most season minutes on the bench, then lines or
// positions by season debt (or home line / position). Changing the size
// or the shape suggests again.

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
  saveBasketballLineupDraft,
  startBasketballGame,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/basketball-actions";
import type { LiveAuth, Player } from "@/lib/types";
import { BASKETBALL_POSITION_DEFS, basketballShapes } from "@/lib/sports/basketball";
import {
  basketballLineOf,
  basketballOnCourt,
  normalizeBasketballLineup,
  validateBasketballLineup,
  type BasketballLineup,
} from "@/lib/sports/basketball/lineup";
import {
  basketballShapeFor,
  suggestBasketballLineup,
  type BasketballPrefs,
  type BasketballSeasonBalance,
} from "@/lib/sports/basketball/suggest";
import {
  benchInBasketballLineup,
  placeInBasketballLineup,
  swapInBasketballLineup,
} from "@/lib/sports/basketball/live";
import {
  usesBasketballLines,
  usesBasketballPositions,
  type BasketballAgeGroupConfig,
  type BasketballLine,
  type BasketballStrategy,
} from "@/lib/sports/basketball/types";
import { BasketballCourt } from "./BasketballCourt";
import { BasketballBench } from "./BasketballBench";
import { BASKETBALL_LINE_LABEL } from "./BasketballPlayerTile";
import { basketballStrategyLabel } from "./basketballWords";
import { squadLoanAverage } from "@/lib/live/liveChrome";

const POSITION_LABEL = Object.fromEntries(BASKETBALL_POSITION_DEFS.map((p) => [p.key, p.label])) as Record<string, string>;

interface BasketballLineupPickerProps {
  auth: LiveAuth;
  gameId: string;
  /** Kids here today, in squad order. */
  players: Player[];
  /** The age group as the team plays it (halves or quarters). */
  ageGroup: BasketballAgeGroupConfig;
  /** The game's players on court (games.on_field_size). */
  onCourtSize: number;
  defaultSubMinutes: number;
  /** How we play: the rotation, roles and season balance. */
  strategy: BasketballStrategy;
  prefs?: BasketballPrefs;
  season?: BasketballSeasonBalance;
  initialDraft: { lineup: BasketballLineup; updated_at: string } | null;
  initialLoanedIds: string[];
  availabilityPanel?: React.ReactNode;
  availabilityHref?: string | null;
  /** Lent minutes in the season's other games, for the long-press sheet. */
  seasonLoanMinutes?: Record<string, number>;
}

export function BasketballLineupPicker({
  auth,
  gameId,
  players,
  ageGroup,
  onCourtSize: initialSize,
  defaultSubMinutes,
  strategy,
  prefs,
  season,
  initialDraft,
  initialLoanedIds,
  availabilityPanel,
  availabilityHref,
  seasonLoanMinutes = {},
}: BasketballLineupPickerProps) {
  const router = useRouter();
  const pickerRootRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loanedIds, setLoanedIds] = useState<Set<string>>(() => new Set(initialLoanedIds));
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const periodLetter = ageGroup.periodCount === 4 ? "Q" : "H";
  const periodWord = ageGroup.periodCount === 4 ? "quarter" : "half";

  const clampSize = (n: number) => Math.max(ageGroup.minOnFieldSize, Math.min(ageGroup.maxOnFieldSize, n));
  const [onCourtSize, setOnCourtSize] = useState(() => clampSize(initialSize));
  const playing = useMemo(() => players.filter((p) => !loanedIds.has(p.id)).map((p) => p.id), [players, loanedIds]);
  const [shapeId, setShapeId] = useState<string | null>(null);
  const size = Math.min(onCourtSize, playing.length || onCourtSize);
  const shape = basketballShapeFor(strategy, size, shapeId);
  const lineShapes = usesBasketballLines(strategy) && !usesBasketballPositions(strategy) ? basketballShapes(size) : [];

  const suggest = (n: number, shape: string | null, kids: string[]) =>
    suggestBasketballLineup({ onCourtSize: n, strategy, shapeId: shape, players: kids, prefs, season });

  const [lineup, setLineup] = useState<BasketballLineup>(() => {
    if (initialDraft) {
      const here = new Set(players.map((p) => p.id));
      const draft = normalizeBasketballLineup(initialDraft.lineup);
      const keep = (ids: string[]) => ids.filter((id) => here.has(id));
      const placed = new Set([...basketballOnCourt(draft), ...draft.bench]);
      const slots = draft.slots
        ? Object.fromEntries(Object.entries(draft.slots).filter(([pid]) => here.has(pid)))
        : undefined;
      return {
        lines: { guard: keep(draft.lines.guard), forward: keep(draft.lines.forward), court: keep(draft.lines.court) },
        // Kids marked here since the draft was saved join the bench.
        bench: [...keep(draft.bench), ...players.map((p) => p.id).filter((id) => !placed.has(id))],
        ...(slots ? { slots } : {}),
      };
    }
    return suggest(clampSize(initialSize), null, players.map((p) => p.id).filter((id) => !initialLoanedIds.includes(id))).lineup;
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fillLine, setFillLine] = useState<BasketballLine | null>(null);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialDraft?.updated_at ?? null);
  const [subMinInput, setSubMinInput] = useState(String(defaultSubMinutes));
  const subIntervalSeconds = Math.round(subMinutesFrom(subMinInput, defaultSubMinutes) * 60);

  const courtIds = basketballOnCourt(lineup);
  const positionLabels = lineup.slots
    ? Object.fromEntries(Object.entries(lineup.slots).map(([pid, pos]) => [pid, POSITION_LABEL[pos] ?? pos]))
    : undefined;

  function resuggest(n: number, s: string | null) {
    setLineup(suggest(n, s, playing).lineup);
    setSelectedId(null);
  }

  function handleTap(pid: string, line: BasketballLine | null) {
    setError(null);
    if (pid === "") {
      // An empty place: a selected kid goes there; otherwise pick from the bench.
      if (selectedId && line) {
        setLineup((lu) => placeInBasketballLineup(lu, selectedId, line));
        setSelectedId(null);
      } else if (line) {
        setFillLine(line);
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
    setLineup((lu) => swapInBasketballLineup(lu, selectedId, pid));
    setSelectedId(null);
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
    if (loaned) setLineup((lu) => benchInBasketballLineup(lu, pid));
    enqueueLiveAction("markLoan", [auth, gameId, { player_id: pid, loaned, quarter: 0, elapsed_ms: 0 }]);
  }

  async function handleSavePlan() {
    setSavePending(true);
    setError(null);
    const result = await saveBasketballLineupDraft(auth, gameId, lineup);
    setSavePending(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't save your plan.");
      return;
    }
    setSavedAt(new Date().toISOString());
    if (auth.kind === "team") router.push(`/teams/${auth.teamId}/games/${gameId}`);
  }

  function handleStartGame() {
    const check = validateBasketballLineup(lineup, ageGroup, Math.min(onCourtSize, playing.length));
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
      const result = await startBasketballGame(auth, gameId, lineup, onCourtSize, true, subIntervalSeconds);
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
  const actionOnCourt = actionPlayerId !== null && basketballLineOf(lineup, actionPlayerId) !== null;
  const settingsSummary = [
    `${onCourtSize} on court`,
    basketballStrategyLabel(strategy),
    ...(lineShapes.length > 1 ? [shape.id] : []),
    `Subs every ${Math.round((subIntervalSeconds / 60) * 10) / 10} min`,
    ...(lentPlayers.length > 0 ? [`${lentPlayers.length} lent`] : []),
  ].join(" · ");

  return (
    <div ref={pickerRootRef} role="region" aria-label="Starting lineup" className="space-y-4 pb-32">
      <LineupPickerBreadcrumb availabilityHref={availabilityHref ?? undefined} />
      {availabilityPanel}

      <header className="space-y-1 px-1">
        <h1 className="text-xl font-bold text-ink">{ageGroup.label} starting five</h1>
        <p className="text-xs text-ink-mute">
          Tap a player to select, tap a second to swap. Long-press for the bench or to lend a player.
        </p>
      </header>

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {/* Game settings (collapsible), as AFL's and soccer's pickers. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={settingsOpen}
          aria-controls="basketball-game-settings"
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
          <div id="basketball-game-settings" className="space-y-4 border-t border-hairline px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="basketball-on-court-size" className="text-xs">
                Players on court
              </Label>
              <select
                id="basketball-on-court-size"
                value={onCourtSize}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setOnCourtSize(n);
                  setShapeId(null);
                  resuggest(n, null);
                }}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
              >
                {sizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} on court
                  </option>
                ))}
              </select>
            </div>
            {lineShapes.length > 1 && (
              <div className="space-y-2">
                <Label className="text-xs">Guards and forwards</Label>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Guards and forwards">
                  {lineShapes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={s.id === shape.id}
                      onClick={() => {
                        setShapeId(s.id);
                        resuggest(onCourtSize, s.id);
                      }}
                      className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
                        s.id === shape.id
                          ? "border-ink bg-ink text-warm"
                          : "border-hairline bg-surface text-ink-dim hover:bg-surface-alt"
                      }`}
                    >
                      {s.lines.guard} G · {s.lines.forward} F
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="basketball-sub-interval" className="text-xs">
                Sub interval (minutes)
              </Label>
              <Input
                id="basketball-sub-interval"
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
              <p className="text-[11px] text-ink-mute">
                Subs go at a dead ball, through the table. Siren lines up the next ones every interval.
              </p>
            </div>
            <p className="text-[11px] text-ink-dim">
              Rotation: <strong>{basketballStrategyLabel(strategy)}</strong> — change it in How we play.
            </p>
            <SFButton variant="ghost" size="sm" onClick={() => resuggest(onCourtSize, shapeId)}>
              Suggest again
            </SFButton>
          </div>
        )}
      </div>

      <BasketballCourt
        lineup={lineup}
        lineCaps={shape.lines}
        playersById={playerById}
        onTap={(pid, line) => handleTap(pid, line)}
        onLongPress={setActionPlayerId}
        selectedPlayerId={selectedId}
        dimUnselected={false}
        positionLabels={positionLabels}
      />
      <BasketballBench
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
        onFieldCount={courtIds.length}
        benchCount={lineup.bench.length}
        onSavePlan={auth.kind === "team" ? () => void handleSavePlan() : undefined}
        savePending={savePending}
        savedAt={savedAt}
        savePlanDisabled={courtIds.length === 0 || isPending}
        onConfirm={handleStartGame}
        confirmLabel={`Start ${periodLetter}1`}
        confirmDisabled={courtIds.length === 0 || isPending}
        confirmLoading={isPending}
      />

      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={null}
          // The kid's line for the Switch hint, and the season's lent
          // minutes, as on the live screen.
          currentLine={(() => {
            const line = basketballLineOf(lineup, actionPlayer.id);
            return !line ? null : line === "court" ? "court" : BASKETBALL_LINE_LABEL[line];
          })()}
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
            setLineup((lu) => {
              if (basketballLineOf(lu, pid)) return benchInBasketballLineup(lu, pid);
              const line: BasketballLine = shape.lines.court > 0
                ? "court"
                : lu.lines.guard.length < shape.lines.guard
                  ? "guard"
                  : "forward";
              return placeInBasketballLineup(lu, pid, line);
            });
          }}
          onToggleLoan={() => {
            const pid = actionPlayer.id;
            setActionPlayerId(null);
            handleLend(pid, !loanedIds.has(pid));
          }}
          isOnField={actionOnCourt}
          onClose={() => setActionPlayerId(null)}
        />
      )}

      {fillLine && (
        <SlotFillSheet
          slotLabel={fillLine === "court" ? "spot" : `${BASKETBALL_LINE_LABEL[fillLine].toLowerCase().replace(/s$/, "")} spot`}
          candidates={lineup.bench
            .filter((id) => !loanedIds.has(id))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench."
          onPick={(pid) => {
            const line = fillLine;
            setFillLine(null);
            setLineup((lu) => placeInBasketballLineup(lu, pid, line));
          }}
          onCancel={() => setFillLine(null)}
        />
      )}

      {startModalOpen && (
        <StartQuarterModal
          quarter={1}
          periodLabel={periodWord}
          cue="ball goes up"
          loading={isPending}
          onStart={handleConfirmStart}
          onCancel={() => setStartModalOpen(false)}
        />
      )}
    </div>
  );
}
