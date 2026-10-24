"use client";

// ─── TouchLineupPicker ───────────────────────────────────────
// The touch and Oztag starting side, before the start. Mirrors
// basketball's and AFL's pickers: the shared breadcrumb and availability
// panel, a collapsible "Game settings" card, the field and bench drawn
// as the live game draws them, tap a kid then a second to swap,
// long-press for the shared player actions, and the shared footer with
// Save plan and "Start H1", which opens the shared StartQuarterModal.
//
// The suggestion comes from the touch engine (suggestTouchLineup), by
// the team's How we play rotation. A mixed team (its rule) gets more:
//   - kids with no group are asked first ("Girl / Boy", one tap each),
//     and the game can't start until each has one;
//   - the side keeps the rule, each group's places to that group's kids;
//   - short of girls, "You can field 4: 3 boys and 1 girl";
//   - "Boys and girls are evened separately under the mixed rule."
//
// Above the field, the shared RuleCheckBar (as AFL's and netball's
// pickers) checks the side as it's built, with the break's rules: the
// lanes and places, and the mixed rule ("Too many boys on the field (4);
// the mixed rule allows 3."), so a coach sees a broken rule before
// Start, not after.

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
  saveTouchLineupDraft,
  setTouchMixedGroup,
  startTouchGame,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/touch-actions";
import type { LiveAuth, MixedGroup, Player } from "@/lib/types";
import {
  normalizeTouchLineup,
  touchLineOf,
  touchOnField,
  validateTouchLineup,
  type TouchLineup,
} from "@/lib/sports/touch/lineup";
import {
  suggestTouchLineup,
  touchFieldPlan,
  touchShapeFor,
  usesTouchLanes,
  type TouchMixed,
  type TouchPrefs,
  type TouchSeasonBalance,
} from "@/lib/sports/touch/suggest";
import { benchInTouchLineup, placeInTouchLineup, swapInTouchLineup } from "@/lib/sports/touch/live";
import { MIXED_FAIRNESS_NOTE, mixedFieldMessage, mixedRuleSummary } from "@/lib/sports/touch/mixed";
import { TOUCH_LANES, type MixedRule, type TouchAgeGroupConfig, type TouchLine, type TouchStrategy } from "@/lib/sports/touch/types";
import { MixedGroupPicker } from "@/components/squad/MixedGroupPicker";
import { RuleCheckBar } from "@/components/playbook/RuleCheckBar";
import { touchLineupRuleItems } from "@/lib/sports/touch/ruleCheck";
import { TouchField } from "./TouchField";
import { TouchBench } from "./TouchBench";
import { TOUCH_LINE_LABEL, TOUCH_LINE_ONE, touchStrategyLabel } from "./touchWords";
import { getSportConfig, type TouchSport } from "@/lib/sports/registry";
import { squadLoanAverage } from "@/lib/live/liveChrome";
import { noteLiveResult } from "@/lib/live/liveSync";

interface TouchLineupPickerProps {
  auth: LiveAuth;
  /** Touch or Oztag: the start's words come from its config. */
  sport: TouchSport;
  gameId: string;
  /** Kids here today, in squad order. */
  players: Player[];
  /** The age group as the team plays it (halves or one period). */
  ageGroup: TouchAgeGroupConfig;
  /** The game's players on the field (games.on_field_size). */
  onFieldSize: number;
  defaultSubMinutes: number;
  /** How we play: the rotation, roles and season balance. */
  strategy: TouchStrategy;
  prefs?: TouchPrefs;
  season?: TouchSeasonBalance;
  /** The team's mixed rule; null when it isn't a mixed team. */
  mixedRule: MixedRule | null;
  /** Who each kid here counts as (players.mixed_group, or the fill-in's). */
  initialGroups: Record<string, MixedGroup | null>;
  initialDraft: { lineup: TouchLineup; updated_at: string } | null;
  initialLoanedIds: string[];
  availabilityPanel?: React.ReactNode;
  availabilityHref?: string | null;
  /** Lent minutes in the season's other games, for the long-press sheet. */
  seasonLoanMinutes?: Record<string, number>;
}

export function TouchLineupPicker({
  auth,
  sport,
  gameId,
  players,
  ageGroup,
  onFieldSize: initialSize,
  defaultSubMinutes,
  strategy,
  prefs,
  season,
  mixedRule,
  initialGroups,
  initialDraft,
  initialLoanedIds,
  availabilityPanel,
  availabilityHref,
  seasonLoanMinutes = {},
}: TouchLineupPickerProps) {
  const router = useRouter();
  const pickerRootRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loanedIds, setLoanedIds] = useState<Set<string>>(() => new Set(initialLoanedIds));
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const onePeriod = ageGroup.periodCount === 1;
  const periodLetter = onePeriod ? "P" : "H";

  // Who counts as a girl or a boy, as the coach answers the prompt.
  const [groups, setGroups] = useState<Record<string, MixedGroup | null>>(initialGroups);
  const mixed: TouchMixed | undefined = useMemo(
    () => (mixedRule ? { rule: mixedRule, groupOf: (id: string) => groups[id] ?? null } : undefined),
    [mixedRule, groups],
  );
  const [groupPending, setGroupPending] = useState<string | null>(null);

  const clampSize = (n: number) => Math.max(ageGroup.minOnFieldSize, Math.min(ageGroup.maxOnFieldSize, n));
  const [onFieldSize, setOnFieldSize] = useState(() => clampSize(initialSize));
  const playing = useMemo(() => players.filter((p) => !loanedIds.has(p.id)).map((p) => p.id), [players, loanedIds]);
  const plan = touchFieldPlan(onFieldSize, playing, mixed);
  const size = Math.min(plan?.size ?? onFieldSize, playing.length || onFieldSize);
  const [shapeId, setShapeId] = useState<string | null>(null);
  const shape = touchShapeFor(ageGroup, strategy, size, shapeId);
  const laneShapes = usesTouchLanes(strategy) ? (ageGroup.shapes[size] ?? []) : [];

  const suggest = (n: number, s: string | null, kids: string[], m: TouchMixed | undefined = mixed) =>
    suggestTouchLineup({ ageGroup, onFieldSize: n, strategy, shapeId: s, players: kids, prefs, season, mixed: m });

  const [lineup, setLineup] = useState<TouchLineup>(() => {
    if (initialDraft) {
      const here = new Set(players.map((p) => p.id));
      const draft = normalizeTouchLineup(initialDraft.lineup);
      const keep = (ids: string[]) => ids.filter((id) => here.has(id));
      const placed = new Set([...touchOnField(draft), ...draft.bench]);
      return {
        lines: { middle: keep(draft.lines.middle), link: keep(draft.lines.link), wing: keep(draft.lines.wing), field: keep(draft.lines.field) },
        // Kids marked here since the draft was saved join the bench.
        bench: [...keep(draft.bench), ...players.map((p) => p.id).filter((id) => !placed.has(id))],
      };
    }
    return suggest(clampSize(initialSize), null, players.map((p) => p.id).filter((id) => !initialLoanedIds.includes(id))).lineup;
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fillLine, setFillLine] = useState<TouchLine | null>(null);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initialDraft?.updated_at ?? null);
  const [subMinInput, setSubMinInput] = useState(String(defaultSubMinutes));
  const subIntervalSeconds = Math.round(subMinutesFrom(subMinInput, defaultSubMinutes) * 60);

  const fieldIds = touchOnField(lineup);
  const ungrouped = mixedRule ? players.filter((p) => !groups[p.id]) : [];

  function resuggest(n: number, s: string | null, m: TouchMixed | undefined = mixed) {
    setLineup(suggest(n, s, playing, m).lineup);
    setSelectedId(null);
    // A new side: an error about the old one no longer applies.
    setError(null);
  }

  async function answerGroup(pid: string, group: MixedGroup) {
    setGroupPending(pid);
    setError(null);
    const result = await setTouchMixedGroup(auth, gameId, pid, group);
    setGroupPending(null);
    if (!result.success) {
      setError(result.error ?? "That didn't save. Try again.");
      return;
    }
    const next = { ...groups, [pid]: group };
    setGroups(next);
    // Suggest again with the rule now knowing this kid.
    if (mixedRule) resuggest(onFieldSize, shapeId, { rule: mixedRule, groupOf: (id) => next[id] ?? null });
  }

  function handleTap(pid: string, line: TouchLine | null) {
    setError(null);
    if (pid === "") {
      // An empty place: a selected kid goes there; otherwise pick from the bench.
      if (selectedId && line) {
        setLineup((lu) => placeInTouchLineup(lu, selectedId, line));
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
    setLineup((lu) => swapInTouchLineup(lu, selectedId, pid));
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
    if (loaned) setLineup((lu) => benchInTouchLineup(lu, pid));
    enqueueLiveAction("markLoan", [auth, gameId, { player_id: pid, loaned, quarter: 0, elapsed_ms: 0 }]);
  }

  async function handleSavePlan() {
    setSavePending(true);
    setError(null);
    const result = await saveTouchLineupDraft(auth, gameId, lineup);
    setSavePending(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't save your plan.");
      return;
    }
    setSavedAt(new Date().toISOString());
    if (auth.kind === "team") router.push(`/teams/${auth.teamId}/games/${gameId}`);
  }

  function handleStartGame() {
    if (ungrouped.length > 0) {
      setError("Mark Girl or Boy for every player on a mixed team.");
      return;
    }
    const check = validateTouchLineup(lineup, ageGroup, size, mixed ? { rule: mixed.rule, groupOf: mixed.groupOf } : null);
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
      const result = await startTouchGame(auth, gameId, lineup, onFieldSize, true, subIntervalSeconds);
      // Refused because another phone already started: say so over the page.
      noteLiveResult(result);
      if (!result.success) {
        setError(result.error ?? "Couldn't start the game.");
        setStartModalOpen(false);
      }
    });
  }

  // The side's rules as it's built (the break's check): lanes and places, the mixed rule.
  const ruleItems = useMemo(() => touchLineupRuleItems({ lineup, ageGroup, size, mixed }), [lineup, ageGroup, size, mixed]);

  const sizeOptions = Array.from({ length: ageGroup.maxOnFieldSize - ageGroup.minOnFieldSize + 1 }, (_, i) => ageGroup.minOnFieldSize + i);
  const lentPlayers = players.filter((p) => loanedIds.has(p.id));
  const actionPlayer = actionPlayerId ? (playerById.get(actionPlayerId) ?? null) : null;
  const actionOnField = actionPlayerId !== null && touchLineOf(lineup, actionPlayerId) !== null;
  const settingsSummary = [
    `${onFieldSize} on the field`,
    touchStrategyLabel(strategy),
    ...(laneShapes.length > 1 ? [shape.id] : []),
    `Subs every ${Math.round((subIntervalSeconds / 60) * 10) / 10} min`,
    ...(lentPlayers.length > 0 ? [`${lentPlayers.length} lent`] : []),
  ].join(" · ");

  return (
    <div ref={pickerRootRef} role="region" aria-label="Starting lineup" className="space-y-4 pb-32">
      <LineupPickerBreadcrumb availabilityHref={availabilityHref ?? undefined} />
      {availabilityPanel}

      <header className="space-y-1 px-1">
        <h1 className="text-xl font-bold text-ink">{ageGroup.label} starting side</h1>
        <p className="text-xs text-ink-mute">Tap a player to select, tap a second to swap. Long-press for the bench or to lend a player.</p>
      </header>

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {/* A mixed team asks who counts as a girl or a boy, once per kid. */}
      {ungrouped.length > 0 && (
        <section
          data-testid="touch-mixed-prompt"
          className="rounded-md border border-warn/40 bg-warn-soft/60 p-3"
          aria-label="Mixed rule: who counts as a girl or a boy"
        >
          <p className="text-sm font-semibold text-ink">For the mixed rule, counts as:</p>
          <p className="mt-0.5 text-[11px] text-ink-dim">
            Siren needs this to keep the boys&rsquo; cap. It&rsquo;s only used for the rule, and shows nowhere else.
          </p>
          <ul className="mt-2 space-y-1.5">
            {ungrouped.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-ink">{p.full_name}</span>
                <MixedGroupPicker
                  compact
                  value={null}
                  onChange={(g) => void answerGroup(p.id, g)}
                  disabled={groupPending !== null}
                  playerName={p.full_name}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan && (plan.short || plan.belowMinimum) && (
        <InlineAlert kind="warn">
          <span data-testid="touch-field-size-banner">
            {plan.belowMinimum && mixedRule && plan.girls < mixedRule.minGirls
              ? `The mixed rule needs at least ${mixedRule.minGirls} ${mixedRule.minGirls === 1 ? "girl" : "girls"} on the field. `
              : ""}
            {mixedFieldMessage(plan)}.
          </span>
        </InlineAlert>
      )}

      {/* Game settings (collapsible), as AFL's and basketball's pickers. */}
      <div className="rounded-md border border-hairline bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
          aria-expanded={settingsOpen}
          aria-controls="touch-game-settings"
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
          <div id="touch-game-settings" className="space-y-4 border-t border-hairline px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="touch-on-field-size" className="text-xs">
                Players on the field
              </Label>
              <select
                id="touch-on-field-size"
                value={onFieldSize}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setOnFieldSize(n);
                  setShapeId(null);
                  resuggest(n, null);
                }}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
              >
                {sizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} on the field
                  </option>
                ))}
              </select>
            </div>
            {laneShapes.length > 1 && (
              <div className="space-y-2">
                <Label className="text-xs">Lanes</Label>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Lanes">
                  {laneShapes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={s.id === shape.id}
                      onClick={() => {
                        setShapeId(s.id);
                        resuggest(onFieldSize, s.id);
                      }}
                      className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
                        s.id === shape.id ? "border-ink bg-ink text-warm" : "border-hairline bg-surface text-ink-dim hover:bg-surface-alt"
                      }`}
                    >
                      {s.lines.middle} M · {s.lines.link} L · {s.lines.wing} W
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="touch-sub-interval" className="text-xs">
                Sub interval (minutes)
              </Label>
              <Input
                id="touch-sub-interval"
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
                Subs roll on and off through the interchange. Siren lines up the next ones every interval; make the change when you
                have the ball.
              </p>
            </div>
            <p className="text-[11px] text-ink-dim">
              Rotation: <strong>{touchStrategyLabel(strategy)}</strong> — change it in How we play.
            </p>
            {mixedRule && (
              <p className="text-[11px] text-ink-dim">
                Mixed rule: <strong>{mixedRuleSummary(mixedRule)}</strong> {MIXED_FAIRNESS_NOTE}
              </p>
            )}
            <SFButton variant="ghost" size="sm" onClick={() => resuggest(onFieldSize, shapeId)}>
              Suggest again
            </SFButton>
          </div>
        )}
      </div>

      {/* Rule check, as AFL's lineup: the side against the rules before Start. */}
      <RuleCheckBar items={ruleItems} />

      <TouchField
        lineup={lineup}
        lineCaps={shape.lines}
        playersById={playerById}
        onTap={(pid, line) => handleTap(pid, line)}
        onLongPress={setActionPlayerId}
        selectedPlayerId={selectedId}
        dimUnselected={false}
      />
      <TouchBench
        bench={lineup.bench}
        playersById={playerById}
        onTap={(pid) => handleTap(pid, null)}
        onLongPress={setActionPlayerId}
        selectedPlayerId={selectedId}
        dimUnselected={false}
        loanedIds={Array.from(loanedIds)}
      />
      {mixedRule && <p className="px-1 text-[11px] text-ink-mute">{MIXED_FAIRNESS_NOTE}</p>}

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
        onFieldLabel="on field"
        onSavePlan={auth.kind === "team" ? () => void handleSavePlan() : undefined}
        savePending={savePending}
        savedAt={savedAt}
        savePlanDisabled={fieldIds.length === 0 || isPending}
        onConfirm={handleStartGame}
        confirmLabel={`Start ${periodLetter}1`}
        confirmDisabled={fieldIds.length === 0 || isPending}
        confirmLoading={isPending}
      />

      {actionPlayer && (
        <LockModal
          player={actionPlayer}
          currentLock={null}
          // The kid's lane, and the season's lent minutes, as in play.
          currentLine={touchLineOf(lineup, actionPlayer.id) ? TOUCH_LINE_LABEL[touchLineOf(lineup, actionPlayer.id)!] : null}
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
              if (touchLineOf(lu, pid)) return benchInTouchLineup(lu, pid);
              const line: TouchLine =
                shape.lines.field > 0 ? "field" : (TOUCH_LANES.find((l) => lu.lines[l].length < shape.lines[l]) ?? "link");
              return placeInTouchLineup(lu, pid, line);
            });
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

      {fillLine && (
        <SlotFillSheet
          slotLabel={fillLine === "field" ? "spot" : `${TOUCH_LINE_ONE[fillLine]} spot`}
          candidates={lineup.bench
            .filter((id) => !loanedIds.has(id))
            .map((id) => playerById.get(id))
            .filter((p): p is Player => Boolean(p))
            .map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench."
          onPick={(pid) => {
            const line = fillLine;
            setFillLine(null);
            setLineup((lu) => placeInTouchLineup(lu, pid, line));
          }}
          onCancel={() => setFillLine(null)}
        />
      )}

      {startModalOpen && (
        <StartQuarterModal
          quarter={1}
          periodLabel={onePeriod ? "period" : "half"}
          cue={getSportConfig(sport).words.startCue}
          loading={isPending}
          onStart={handleConfirmStart}
          onCancel={() => setStartModalOpen(false)}
        />
      )}
    </div>
  );
}
