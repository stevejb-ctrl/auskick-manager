# Siren — Claude project instructions

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
