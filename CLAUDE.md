# Siren — Claude project instructions

## Reuse before you fork — cross-sport consistency

Siren ships three sports (AFL, netball, rugby league) that share the
same coach. Anywhere the UX rule is the same across sports, the
component MUST be shared — coaches who run a footy team AND a league
team should feel muscle memory, not a re-skin.

**Before adding any new component under `src/components/<sport>/`,
search `src/components/{live,lineup,quarter-break,sf,ui}/` and the
two sibling sport directories first.** If a near-fit already exists,
reuse it (extend its props if needed). Only fork when the behaviour
genuinely diverges.

Examples of shared chrome that MUST be consumed verbatim:
- `LiveTopBar`, `LiveStickyScoreBar`, `LiveAdminUtilityRow`
- `ScoreRecordingDock`, `SubDueModal`, `ManualEndQuarterConfirm`
- `LockModal` (long-press player actions — switch / injure / lend)
- `LineupPickerBreadcrumb`, `LineupPickerFooter`
- `LongPressHint`, `WalkthroughModal`, `LateArrivalMenu`,
  `InjuryReplacementModal`
- `sf/*` design primitives (`SFButton`, `SFCard`, `Guernsey`, etc.)

Where sport-specific surfaces wrap shared chrome (e.g. `LeagueScoreBug`
inside `LiveStickyScoreBar`), the wrapper must match the visual rhythm
of its AFL/netball sibling — same token palette, same column counts,
same badge positions. AFL is the reference implementation; deviate
only with a clear reason and call it out in a comment.

Anti-patterns to catch yourself doing:
- Building a new modal component when `LockModal` would have done it.
- Custom score chips when `GameHeader`'s `+G`/`+B` chip token works.
- Horizontal-scroll benches when AFL's `grid-cols-4` already exists.
- Forking `PlayerTile`'s layout instead of mirroring its row order.

If the user has to ask "make it consistent with AFL", that's a bug —
fix the component this session AND extract a shared primitive if the
seam is wide enough to be re-violated.

## Testing is part of "done"

When implementing a feature or fixing a bug that touches user-facing
code (routes, server actions, live-game logic, UI affordances), the
task is **not complete** until:

1. The relevant spec under `e2e/tests/*.spec.ts` has been updated or
   added. See `e2e/README.md` for the "when to add a test" table.
2. `npm run e2e` has been run locally and passes.
3. `npx tsc --noEmit` passes.
4. `npm test` (Vitest unit tests) passes.

**Bug fixes** must land with a regression test that fails against the
pre-fix code — write the test first, watch it go red, then fix the
bug and watch it go green. This is non-negotiable: without the
regression test, the same bug will ship again.

**Schema migrations** must be accompanied by a spec that exercises
the new column/table end-to-end through the UI, not just the DB.

## Commit style

Small, reviewable commits. Each commit should stand on its own —
if a reviewer reads only the commit message + diff, the intent
should be clear. Prefer shipping a feature as 3–5 focused commits
over one megacommit.

## Quick commands

```bash
npm run dev              # dev server
npm test                 # Vitest (pure functions)
npm run e2e              # Playwright (end-to-end)
npm run e2e:ui           # Playwright inspector
npx tsc --noEmit         # typecheck
npm run lint             # eslint
npm run db:reset         # reset local Supabase DB
```
