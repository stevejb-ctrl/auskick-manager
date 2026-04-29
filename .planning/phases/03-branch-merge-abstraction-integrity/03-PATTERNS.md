# Phase 3: Branch merge + abstraction integrity — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 13 (1 new planning artifact + 7 conflict-resolution files + 3 post-merge implementation files + 2 verification-only files)
**Analogs found:** 12 / 13 (one file — 03-MERGE-LOG.md — is a planning doc with its analog in Phase 1)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `03-MERGE-LOG.md` (Cat A) | planning-audit | n/a | `01-MERGE-NOTES.md §8` | exact (same project, same author, same per-file rationale shape) |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` (Cat B) | route/page | request-response | `multi-sport:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | exact (target shape IS the multi-sport version) |
| `src/app/(app)/teams/[teamId]/games/page.tsx` (Cat B) | route/page | request-response | `multi-sport:src/app/(app)/teams/[teamId]/games/page.tsx` + main's additions | role-match (combine both) |
| `src/app/layout.tsx` (Cat B) | layout | request-response | `multi-sport:src/app/layout.tsx` (brand imports) + main (font vars, metadata) | role-match (creative merge) |
| `src/app/page.tsx` (Cat B) | route/page | request-response | `multi-sport:src/app/page.tsx` (dynamic features) + main (metadata canonical) | role-match (combine both) |
| `src/components/squad/PlayerList.tsx` (Cat B) | component | CRUD | `multi-sport:src/components/squad/PlayerList.tsx` | exact (target shape IS multi-sport's version) |
| `src/components/squad/PlayerRow.tsx` (Cat B) | component | CRUD | main's full version + `multi-sport:src/components/squad/PlayerRow.tsx` (showJersey prop) | role-match (main base + multi-sport prop) |
| `package.json` (Cat B, unmapped) | config | n/a | worktree HEAD `package.json` (union of both sides' scripts) | exact (set union of both sides) |
| `src/components/live/LiveGame.tsx` (Cat C) | component | event-driven | `multi-sport:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` (quarterMs computation) | partial (pattern source is the page that computes + passes quarterMs) |
| `src/lib/stores/liveGameStore.ts` (Cat C) | store | event-driven | `multi-sport:src/lib/stores/liveGameStore.ts` (same file, narrower change) | exact (same file, D-26 is a new param addition) |
| D-25 consumer patches (Cat C) | various | CRUD/request-response | `multi-sport:src/components/squad/PlayerList.tsx` (canonical D-25 pattern) | role-match |
| `supabase/migrations/0024_super_admin.sql` (Cat D) | migration | n/a | n/a — DELETE, no analog needed | n/a |
| `src/components/live/QuarterBreak.tsx` (Cat D) | component | event-driven | n/a — verify unchanged, no edit needed | n/a |

---

## Pattern Assignments

### Category A — New planning artifact

---

### `03-MERGE-LOG.md`
**Role:** planning-audit artifact
**Analog:** `.planning/phases/01-divergence-inventory-merge-plan/01-MERGE-NOTES.md`

**Section structure (mirror Phase 1 §8):**

Phase 1's §8 uses a simple per-row table format:

```markdown
| File | Rationale |
|------|-----------|
| `supabase/migrations/0017b_super_admin.sql` (rename/rename) | **Take multi-sport's `0025_super_admin.sql` filename. Delete main's `0024_super_admin.sql`.** ... |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | **Take multi-sport's structure.** ... |
```

**03-MERGE-LOG.md must have these six sections:**

```markdown
# Phase 3 Merge Log

## §1 Mapped-conflict resolutions (cite Phase 1 §8 verbatim per file)
| File | Resolution taken | Phase 1 §8 rationale (verbatim) | Any deviation? |
|------|-----------------|----------------------------------|----------------|
| ... |

## §2 Unmapped conflict surprises (D-24)
| File | Why surprising | Resolution | Rationale |
|------|---------------|------------|-----------|
| `package.json` | Phase 1 §3 said "clean-merge-likely"; Phase 2 added `e2e`/`db:*` scripts on this branch creating an overlapping-hunk conflict | Set union — keep all script additions from both sides | Mechanical additive conflict; no semantic conflict |

## §3 D-25 AgeGroup consumer patches
[Post-tsc list: file, line, before, after]

## §4 D-26 / D-27 redirect compliance
[Paste grep output from compliance commands in RESEARCH §4]

## §5 PROD-01..04 preservation evidence
[Per-feature results from RESEARCH §6 commands]

## §6 Hand-off to Phase 4 (netball verification)
[Merge state, open questions for Phase 4]
```

**Landmine:** The §1 table MUST cite Phase 1 §8 rationale verbatim (not paraphrased) and record any deviation from the rationale (e.g. the `Instrument_Serif` fix — see `src/app/layout.tsx` pattern below).

---

### Category B — Conflict-resolution files

---

### `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx`
**Role:** route/page (server component)
**Data flow:** request-response (DB reads → React render)
**Analog:** `multi-sport:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` — take this version as-is; main's "single edit" per Phase 1 §8 is actually in `actions.ts` (which auto-merges), not in `page.tsx`.

**Imports pattern** (multi-sport lines 1-17 — TARGET STATE):
```typescript
import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { LineupPicker } from "@/components/live/LineupPicker";
import { LiveGame } from "@/components/live/LiveGame";
import { NetballLiveGame } from "@/components/netball/NetballLiveGame";
import { GameInfoHeader } from "@/components/games/GameInfoHeader";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import {
  replayGame,
  seasonZoneMinutes,
  seasonLoanMinutes,
  zoneCapsFor,
} from "@/lib/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import { getEffectiveQuarterSeconds, getSportConfig, netballSport } from "@/lib/sports";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import type { FillIn, Game, GameEvent, Player, Sport } from "@/lib/types";
```

**DB select pattern** (multi-sport line 76 — TARGET STATE):
```typescript
.select("name, sport, track_scoring, age_group, quarter_length_seconds, song_url, song_start_seconds, song_duration_seconds, song_enabled")
```
Note: main's version omits `sport`, `track_scoring`, `quarter_length_seconds`. The merged version MUST include all five new fields.

**Sport dispatch pattern** (multi-sport lines 88-114 — TARGET STATE):
```typescript
const sport: Sport = (teamRow?.sport as Sport | undefined) ?? "afl";

// ─── Netball branch ───────────────────────────────────────
if (sport === "netball") {
  const ageCfgN = netballSport.ageGroups.find((a) => a.id === teamRow?.age_group)
    ?? netballSport.ageGroups.find((a) => a.id === "open")!;
  const quarterLengthSeconds = getEffectiveQuarterSeconds(
    { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
    ageCfgN,
    { quarter_length_seconds: g.quarter_length_seconds },
  );
  // ... netball data fetches + <NetballLiveGame> render
}

// ─── AFL branch (existing behaviour) ──────────────────────
const ageGroup = ageGroupOf(teamRow?.age_group);
const positionModel = AGE_GROUPS[ageGroup].positionModel;
const ageCfg = AGE_GROUPS[ageGroup];
```

**D-26 addition site** (NEW — not in either branch yet, added per D-27 after conflict resolution):
```typescript
// In the AFL branch, after line ~232 where ageCfg is defined:
import { getEffectiveQuarterSeconds } from "@/lib/sports"; // already imported above
const quarterMs = getEffectiveQuarterSeconds(
  { quarter_length_seconds: teamRow?.quarter_length_seconds ?? null },
  ageCfg,
  g,
) * 1000;
// Then pass: <LiveGame quarterMs={quarterMs} .../>
```

**Landmine:** `applyInjurySwap` — multi-sport's `LiveGame.tsx` does not visibly import it, but main's does (line 162: `const applyInjurySwap = useLiveGame((s) => s.applyInjurySwap)`). After conflict resolution, verify `applyInjurySwap` call in `LiveGame.tsx` is still present. The liveGameStore auto-merges so the function definition is in the store regardless.

---

### `src/app/(app)/teams/[teamId]/games/page.tsx`
**Role:** route/page (server component)
**Data flow:** request-response (DB reads → React render with filter)
**Analog:** `multi-sport:src/app/(app)/teams/[teamId]/games/page.tsx` for the sport-aware lookup; main's version for `GamesFilter`, `Eyebrow`, `searchParams`.

**Multi-sport's target imports** (lines 1-7):
```typescript
import { Suspense } from "react";
import { createClient, getUser } from "@/lib/supabase/server";
import { AddGameSection } from "@/components/games/AddGameSection";
import { GameList } from "@/components/games/GameList";
import { Spinner } from "@/components/ui/Spinner";
import { getAgeGroupConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";
```

**Main's additional imports (must survive the merge):**
```typescript
import { GamesFilter, type GamesFilterValue } from "@/components/games/GamesFilter";
import { Eyebrow } from "@/components/sf";
```

**Multi-sport's DB select pattern** (line 32 — TARGET — adds `sport`):
```typescript
.select("age_group, sport, playhq_url")
```
Main's version only selects `"age_group, playhq_url"` — must be expanded.

**D-25 resolution — replace main's AgeGroup cast with multi-sport's lookup:**
```typescript
// BEFORE (main's line 48 — DELETE this):
const ageGroup = (team?.age_group ?? "U10") as import("@/lib/types").AgeGroup;

// AFTER (multi-sport's pattern — use this):
const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
const ageGroupCfg = getAgeGroupConfig(sport, team?.age_group as string | null);
```

**Main's searchParams (must survive):**
```typescript
interface GamesPageProps {
  params: { teamId: string };
  searchParams?: { filter?: string };
}
function parseFilter(raw: string | undefined): GamesFilterValue {
  if (raw === "upcoming" || raw === "final") return raw;
  return "all";
}
```

**Resolution rule:** Take multi-sport's sport-aware lookup AND main's `GamesFilter`/`Eyebrow`/`searchParams` additions. Both are independent enhancements. Per Phase 1 §8: "combine via normal flow."

---

### `src/app/layout.tsx`
**Role:** layout (root server component)
**Data flow:** request-response
**Analog:** Multi-sport for brand wiring; main for font variables and canonical in page.tsx.

**CRITICAL LANDMINE — `Instrument_Serif` / `--font-instrument-serif`:**

`tailwind.config.ts` line 74:
```typescript
serif: ["var(--font-instrument-serif)", "Georgia", "serif"],
```

The `font-serif` Tailwind class is used in at least 7 files:
- `src/app/(app)/teams/[teamId]/page.tsx:326`
- `src/components/auth/LoginBrandPanel.tsx:15,55`
- `src/components/auth/LoginForm.tsx:136`
- `src/components/auth/LoginSentState.tsx:43`
- `src/components/games/GameRow.tsx:49`
- `src/components/sf/RoundNumeral.tsx:35`

Multi-sport's `layout.tsx` dropped `Instrument_Serif` and `GeistSans` from the imports but also dropped their variables from the `<html className>`. Multi-sport's html tag is:
```typescript
<html lang="en" className={`${sans.variable} ${mono.variable}`}>
```

Main's html tag is:
```typescript
<html lang="en" className={`${sans.variable} ${mono.variable} ${GeistSans.variable} ${instrumentSerif.variable}`}>
```

**Resolution:** Multi-sport's brand-module imports (`getBrand`, `getBrandCopy`) + dynamic `generateMetadata()` are the target pattern. BUT: `Instrument_Serif` and `GeistSans` variables MUST be kept in the `<html className>` because `--font-instrument-serif` and `--font-geist-sans` are referenced by downstream components. The font imports must therefore be kept even though multi-sport removed them.

**Target state for imports:**
```typescript
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import "./globals.css";
```

**Target state for metadata (multi-sport's dynamic pattern):**
```typescript
export function generateMetadata(): Metadata {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  return {
    title: copy.productName,
    description: copy.metaDescription,
  };
}
```
Note: main's `export const metadata = { metadataBase: new URL(SITE_URL), ... }` is REPLACED by the dynamic `generateMetadata()` from multi-sport. The `metadataBase` can be added inside `generateMetadata()` if needed for per-page canonical resolution.

**Target state for html tag (keep font variables):**
```typescript
<html lang="en" className={`${sans.variable} ${mono.variable} ${GeistSans.variable} ${instrumentSerif.variable}`}>
```

**This is a creative merge — neither side wins outright.** Take multi-sport's brand wiring + keep both font variable registrations that multi-sport dropped.

---

### `src/app/page.tsx`
**Role:** route/page (server component, landing page)
**Data flow:** request-response
**Analog:** `multi-sport:src/app/page.tsx` for dynamic brand-copy features; main's `export const metadata` canonical export.

**Multi-sport's target state (entire file — take as-is plus main's metadata):**
```typescript
import { MarketingBanner } from "@/components/marketing/MarketingBanner";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { ScrollingFeatures } from "@/components/marketing/ScrollingFeatures";
import { FinalCTA } from "@/components/marketing/FinalCTA";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getBrand } from "@/lib/brand";
import { getBrandCopy } from "@/lib/sports/brand-copy";

export default function Home() {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);

  return (
    <>
      <MarketingBanner />
      <MarketingHeader />
      <main>
        <Hero />
        <ScrollingFeatures features={copy.features} />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </>
  );
}
```

**Main's metadata export (must be added — missing from multi-sport):**
```typescript
import type { Metadata } from "next";

// Explicit canonical so Search Console doesn't flag the apex
// (`sirenfooty.com.au/`) and www variants as "Duplicate without
// user-selected canonical". Resolves against `metadataBase` set in
// the root layout.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};
```

**Resolution rule:** Multi-sport's dynamic `copy.features` replaces main's static `FEATURES` array. Main's `export const metadata` canonical export is additive — prepend it to the merged file.

---

### `src/components/squad/PlayerList.tsx`
**Role:** component (async server component)
**Data flow:** CRUD (DB read → render)
**Analog:** `multi-sport:src/components/squad/PlayerList.tsx` — this is the target shape.

**Multi-sport's target imports** (lines 1-6):
```typescript
import { createClient } from "@/lib/supabase/server";
import { SquadHeader } from "@/components/squad/SquadHeader";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { getAgeGroupConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";
```

Main uses `{ Eyebrow, SFCard } from "@/components/sf"` and `{ AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups"` — these REPLACE multi-sport's `getAgeGroupConfig` in multi-sport. Per Phase 1 §8 rationale: "Take main's most recent state; spot-check multi-sport's hunk." Research §5 clarified: multi-sport removed `SFCard`/`Eyebrow` in favour of plain divs; main kept them. Resolution should use multi-sport's sport logic (getAgeGroupConfig, showJersey) AND preserve main's SFCard/Eyebrow wrapper if they are additive.

**D-25 core pattern** (multi-sport lines 29-36):
```typescript
const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
const ageGroupCfg = getAgeGroupConfig(
  sport,
  (team as { age_group?: string | null } | null)?.age_group ?? null,
);
const maxPlayers = ageGroupCfg.maxSquadSize;
const showJersey = sport === "afl";
```

**DB select change** (multi-sport line 23 — adds `sport`):
```typescript
supabase.from("teams").select("age_group, sport").eq("id", teamId).single()
```
Main only selects `"age_group"` — must be expanded.

**showJersey prop pass-through** (multi-sport `<PlayerRow>` call):
```typescript
<PlayerRow
  key={player.id}
  player={player}
  teamId={teamId}
  takenJerseys={takenJerseys}
  canEdit={isAdmin}
  showJersey={showJersey}
/>
```

---

### `src/components/squad/PlayerRow.tsx`
**Role:** component (client component)
**Data flow:** CRUD (form submit → server action)
**Analog:** Main's full version (base) + `multi-sport:src/components/squad/PlayerRow.tsx` (adds `showJersey` prop only).

**Multi-sport's single addition — showJersey prop** (multi-sport lines 18-28):
```typescript
interface PlayerRowProps {
  player: Player;
  teamId: string;
  takenJerseys: number[];
  canEdit: boolean;
  /**
   * AFL teams use jersey numbers; netball doesn't. When false, the
   * jersey badge and edit input both disappear so coaches don't see a
   * field they're never going to use. Defaults true to preserve AFL
   * behaviour.
   */
  showJersey?: boolean;
}

export function PlayerRow({ player, teamId, takenJerseys, canEdit, showJersey = true }: PlayerRowProps) {
```

**Multi-sport's conditional rendering** (multi-sport lines 101-119 — wrap jersey elements):
```typescript
{showJersey && (
  // Jersey badge — Guernsey SVG
  <Guernsey num={player.jersey_number} size={36} />
)}
// ... (in edit mode)
{showJersey && (
  <Input ... /> // jersey number input
)}
```

**Resolution rule:** Take main's full file (Guernsey, edit/save/cancel UI, toggle, data-testid, all PROD-01 fixes). Apply multi-sport's `showJersey` prop addition: (1) add the prop to the interface, (2) add the `showJersey = true` default to the destructuring, (3) wrap the two jersey UI blocks with `{showJersey && (...)}`.

---

### `package.json` (unmapped conflict — D-24)
**Role:** config
**Analog:** Worktree HEAD `package.json` + `multi-sport:package.json` (union of both sides' scripts).

**Current worktree scripts** (HEAD — has Phase 2's `e2e` + `db:*` additions):
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "e2e": "node scripts/e2e-setup.mjs",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset --no-confirm",
  "db:status": "supabase status"
}
```

**Multi-sport's scripts** (adds `db:start`, `db:stop`, `db:reset`, `db:status` — identical to Phase 2's additions):
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset --no-confirm",
  "db:status": "supabase status"
}
```

**Resolution:** The worktree HEAD (this branch) already contains ALL scripts from both sides plus `typecheck` and `e2e`. Take the worktree HEAD's `scripts` block as the resolved state. The conflict is in the textual overlap of `db:*` additions — both sides added the same `db:*` commands, plus this branch added `e2e` and `typecheck`. Final merged state = worktree HEAD's complete scripts block.

**D-24 compliance:** Record in `03-MERGE-LOG.md §2` before resolving:
> "package.json: Phase 1 classified as clean-merge-likely. Phase 2 added `e2e`/`typecheck` scripts to this branch, creating an overlapping-hunk conflict with multi-sport's `db:*` additions (which are identical to Phase 2's db:* additions). Resolution: set union of all additions — take worktree HEAD's scripts block which already contains every script from both sides."

---

### Category C — Post-merge implementation files

---

### `src/components/live/LiveGame.tsx`
**Role:** component (client component, large — ~800 lines on HEAD)
**Data flow:** event-driven (clock tick → Zustand store → render)
**Analog:** `multi-sport:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` (for how `quarterMs` is computed and passed); this file itself (for where to add the prop and replace `QUARTER_MS`).

**File auto-merges (no conflict markers).** D-26 requires three targeted edits after the merge commit.

**Current QUARTER_MS usage sites (confirmed by reading HEAD source):**

Surface 1 — countdown display cap (HEAD line 657):
```typescript
// BEFORE:
const displayNowMs = Math.min(nowMs, QUARTER_MS);
// AFTER:
const displayNowMs = Math.min(nowMs, quarterMs);
```

Surface 2 — hooter trigger (HEAD lines 785-791, inside `maybeTrigger` useEffect):
```typescript
// BEFORE:
if (elapsed * clockMultiplier >= QUARTER_MS && quarterEndTriggeredRef.current !== currentQuarter) {
// AFTER:
if (elapsed * clockMultiplier >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {
```

**Props interface addition** (add to `interface LiveGameProps` around HEAD line 93):
```typescript
interface LiveGameProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  subIntervalSeconds: number;
  squadPlayers: Player[];
  initialState: GameState;
  season: PlayerZoneMinutes;
  seasonLoanMinutes: Record<string, number>;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  exitHref?: string;
  songUrl?: string | null;
  songStartSeconds?: number;
  songDurationSeconds?: number;
  clockMultiplier?: number;
  /** Effective quarter duration in milliseconds for this game/team/age-group. */
  quarterMs: number;    // ← ADD THIS
}
```

**Destructuring addition** (add to function signature):
```typescript
export function LiveGame({
  ...,
  clockMultiplier = 1,
  quarterMs,         // ← ADD THIS
}: LiveGameProps) {
```

**handleEndQuarter call site** (HEAD line 695 — update to pass quarterMs to store):
```typescript
// BEFORE:
endCurrentQuarter();
// AFTER:
endCurrentQuarter(quarterMs);
```

**Landmine L-4:** Two `// eslint-disable-next-line react-hooks/exhaustive-deps` comments must survive:
- HEAD line 272 (YouTube effect)
- HEAD line 395 (subBaseMs effect)

Run `npm run lint` after editing to confirm they're present.

**Landmine L-8:** `applyInjurySwap` must remain in the import list from the store. Verify by grep after merge resolution:
```bash
grep -n "applyInjurySwap" src/components/live/LiveGame.tsx
# Expected: at minimum line ~163 (useLiveGame selector) and line ~somewhere in handleInjury
```

---

### `src/lib/stores/liveGameStore.ts`
**Role:** store (Zustand)
**Data flow:** event-driven (action dispatch → state update)
**Analog:** `multi-sport:src/lib/stores/liveGameStore.ts` — identical to main's version; the D-26 change is a pure NEW implementation, not a conflict resolution.

**File auto-merges cleanly** (confirmed by `git merge-tree` output in RESEARCH §2). The QUARTER_MS constant and endCurrentQuarter are identical on both branches. D-26 adds one parameter.

**QUARTER_MS declaration** (both branches, line 17 — KEEP EXPORTED for clockElapsedMs/formatClock callers):
```typescript
export const QUARTER_MS = 12 * 60 * 1000;
```

**Interface change** (HEAD line 95 — update return type):
```typescript
// BEFORE:
endCurrentQuarter: () => void;
// AFTER:
endCurrentQuarter: (quarterMs: number) => void;
```

**Implementation change** (HEAD lines 339-348 — add param, replace constant):
```typescript
// BEFORE:
endCurrentQuarter: () =>
  set((prev) => {
    const now = Date.now();
    const rawAccumulated =
      prev.clockStartedAt === null
        ? prev.accumulatedMs
        : prev.accumulatedMs + (now - prev.clockStartedAt);
    // Cap at QUARTER_MS so that if the GM delays confirming end-of-quarter,
    // player stint durations don't leak past the hooter.
    const accumulated = Math.min(rawAccumulated, QUARTER_MS);

// AFTER:
endCurrentQuarter: (quarterMs: number) =>
  set((prev) => {
    const now = Date.now();
    const rawAccumulated =
      prev.clockStartedAt === null
        ? prev.accumulatedMs
        : prev.accumulatedMs + (now - prev.clockStartedAt);
    // Cap at quarterMs (passed by caller from getEffectiveQuarterSeconds)
    // so that if the GM delays confirming end-of-quarter, player stint
    // durations don't leak past the hooter.
    const accumulated = Math.min(rawAccumulated, quarterMs);
```

**Landmine L-3:** `liveGameStore.ts` is flagged FRAGILE in CONCERNS.md (3-layer architecture, 574 lines). Required test sequence:
1. Make ONLY this change (interface + implementation).
2. `npm test` — must be green before any other D-26 edit.
3. Only then proceed to `LiveGame.tsx` edits.

**Compliance grep post-redirect:**
```bash
grep -n "QUARTER_MS" src/lib/stores/liveGameStore.ts
# Expected post-redirect: line 17 (export declaration only); line 348 uses removed
grep -n "quarterMs" src/lib/stores/liveGameStore.ts
# Expected: line 95 (interface), line 339 (param), line 348 (usage in accumulated =)
```

---

### D-25 consumer patches (post-merge `tsc --noEmit` scan)
**Role:** various (server components, hooks)
**Data flow:** CRUD/request-response
**Analog:** `multi-sport:src/components/squad/PlayerList.tsx` — canonical example of the D-25 pattern.

**Discovery command (run after merge commit):**
```bash
npx tsc --noEmit 2>&1 | grep -E "(Type 'string' is not assignable to type 'AgeGroup'|Argument of type 'string' is not assignable to parameter of type 'AgeGroup')" | sort -u
```

**Pre-verified consumers from RESEARCH §3:**

| File | Consumer status | Action needed |
|------|----------------|---------------|
| `src/components/squad/PlayerList.tsx` | Resolved by conflict resolution (takes multi-sport's `getAgeGroupConfig` pattern) | None — verify via tsc |
| `src/app/(app)/teams/[teamId]/games/page.tsx` | Resolved by conflict resolution (takes multi-sport's `getAgeGroupConfig` call) | None — verify via tsc |
| `src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` | AFL branch continues using `ageGroupOf()` safely — within sport-dispatched AFL branch | No D-25 patch needed (research §3 Consumer 3) |

**Uniform patch pattern for any REMAINING tsc errors (D-25):**
```typescript
// 1. Import (if not already present):
import { getSportConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";

// 2. Replace any `team.age_group as AgeGroup` cast or `AGE_GROUPS[team.age_group]` lookup with:
const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
const ageGroupCfg = getSportConfig(sport).ageGroups.find(g => g.id === team.age_group)
  ?? getSportConfig(sport).ageGroups[0]; // fallback to first age group

// 3. Use ageGroupCfg.maxSquadSize / ageGroupCfg.periodSeconds etc. in place of AGE_GROUPS[ageGroup].field
```

**D-25 compliance grep (post-patch):**
```bash
grep -rn "as AgeGroup\|: AgeGroup\b" src/ | grep -v "types.ts\|ageGroups.ts"
# Should return zero matches outside type definition files
```

---

### Category D — Verification-only files (no edit pattern needed)

---

### `supabase/migrations/0024_super_admin.sql`
**Action:** DELETE during merge resolution (Phase 2 §2 file op #1).
**Command:** `git rm supabase/migrations/0024_super_admin.sql`
**Rationale:** Byte-identical to multi-sport's `0025_super_admin.sql` (sha256: `1761d4042751b82e3cd284d73ff5c9110741ca7686ceb10dcba2a74fb4693051` — verified Phase 2 §1).
**No edit pattern needed.** Only verification: `ls supabase/migrations/0024_* && ls supabase/migrations/0025_*` should show `0024_multi_sport.sql` and `0025_super_admin.sql`, NOT `0024_super_admin.sql`.

---

### `src/components/live/QuarterBreak.tsx`
**Action:** Verify unchanged post-merge. No D-26 edit needed.
**Rationale (RESEARCH §4 Surface 4):** Time bars are proportion-based (`zm[z] / total * 100%`), not compared against an absolute duration. QUARTER_MS not referenced. The `basePlayedZoneMs` values fed to QuarterBreak are already capped by `endCurrentQuarter` — fixing the cap at the store level (liveGameStore Surface 3) is sufficient.

**Verification command:**
```bash
grep -n "QUARTER_MS\|quarterMs" src/components/live/QuarterBreak.tsx
# Expected: zero matches (confirmed by RESEARCH §4)
```

**Landmine L-9:** After merge, verify `positionModel` prop is still passed from `LiveGame.tsx` to `<QuarterBreak>` (multi-sport's QuarterBreak may have a different prop set). Check around LiveGame.tsx lines 815-826 post-merge.

---

### `e2e/tests/multi-sport-schema.spec.ts`
**Action:** Verify it flips green post-merge (Phase 2 deliverable, per D-12).
**No edit expected.** Minor locator adjustments permitted only if merged DOM differs from Phase 2 §5's anticipations (CONTEXT.md Claude's discretion allows this).

**Verification command:**
```bash
npm run e2e -- e2e/tests/multi-sport-schema.spec.ts
# All 3 test cases must pass
```

---

## Shared Patterns

### Sport config lookup (D-25 pattern)
**Source:** `multi-sport:src/components/squad/PlayerList.tsx` lines 29-36
**Apply to:** Any consumer that surfaces a tsc error on `Team.age_group: string` after merge
```typescript
import { getAgeGroupConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";

const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
const ageGroupCfg = getAgeGroupConfig(
  sport,
  (team as { age_group?: string | null } | null)?.age_group ?? null,
);
```

### getEffectiveQuarterSeconds call (D-27 pattern)
**Source:** `multi-sport:src/app/(app)/teams/[teamId]/games/[gameId]/live/page.tsx` lines 104-112 (netball branch)
**Apply to:** AFL branch of `live/page.tsx` to compute `quarterMs` for LiveGame prop
```typescript
import { getEffectiveQuarterSeconds } from "@/lib/sports"; // post-merge path
const quarterMs = getEffectiveQuarterSeconds(
  { quarter_length_seconds: teamRow?.quarter_length_seconds ?? null },
  ageCfg,
  g,
) * 1000;
```

### DB select with sport field
**Source:** `multi-sport:src/components/squad/PlayerList.tsx` line 23; `multi-sport:src/app/(app)/teams/[teamId]/games/page.tsx` line 32
**Apply to:** Any server component that reads `team` and needs sport-aware dispatch
```typescript
supabase.from("teams").select("age_group, sport").eq("id", teamId).single()
// or for pages: .select("age_group, sport, playhq_url, ...")
```

### Test cadence (fragile file — liveGameStore.ts)
**Source:** CONCERNS.md "Live game state machine" + CONTEXT.md D-23
**Apply to:** Any edit touching `liveGameStore.ts`
- Make ONLY the targeted change.
- Run `npm test` immediately after — before any other edit.
- Run the full gauntlet only after ALL D-26 patches are in.

---

## No Analog Found

None. All files have analogs — the merge work's unique characteristic is that "the analog" for each conflict file IS the same file on the other branch (the target state).

---

## Metadata

**Analog search scope:** `multi-sport:src/`, `HEAD:src/`, worktree `src/`, `.planning/phases/01-*/`
**Files scanned (source reads):** 12 unique source files + 3 planning docs
**Pattern extraction date:** 2026-04-29

### Key Constraint Summary

| Constraint | Source | Impact |
|-----------|--------|--------|
| `font-serif` class used in 7 files — keep `Instrument_Serif` import + `instrumentSerif.variable` in `<html className>` even though multi-sport dropped it | `tailwind.config.ts:74`, confirmed 7 consumer files | `src/app/layout.tsx` resolution MUST deviate from "take multi-sport's version as-is" |
| `applyInjurySwap` may be missing from multi-sport's `LiveGame.tsx` import | RESEARCH §8 L-8 | After conflict resolution of `live/page.tsx`, verify `applyInjurySwap` is present in `LiveGame.tsx` |
| `liveGameStore.ts` flagged FRAGILE | CONCERNS.md | D-26 store edit must be isolated + `npm test` run before any other change |
| `eslint-disable` comments in `LiveGame.tsx` | CONCERNS.md; RESEARCH §8 L-4 | Lines ~272 and ~395 must survive the D-26 edits; `npm run lint` catches their absence |
| `package.json` conflict requires D-24 audit entry | RESEARCH §2 | Must add §2 entry to `03-MERGE-LOG.md` BEFORE resolving the conflict |
| QUARTER_MS export must be kept even after D-26 | RESEARCH §4 | `export const QUARTER_MS = 12 * 60 * 1000;` at liveGameStore.ts line 17 stays (used by `clockElapsedMs` and `formatClock` which don't cap) |
