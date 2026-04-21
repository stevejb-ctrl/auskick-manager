<!--
Every PR ticks through this list. If a box doesn't apply, leave the
box unchecked and add a line explaining why.
-->

## Summary

<!-- 1–3 bullets: what changed and why. -->

## Checklist

- [ ] Tests added/updated for user-facing changes (see `e2e/README.md`).
- [ ] `npx tsc --noEmit` passes locally.
- [ ] `npm test` passes locally (Vitest).
- [ ] `npm run e2e` passes locally (Playwright + local Supabase).
- [ ] If this fixes a bug: a regression test reproduces the bug *before* the fix.
- [ ] DB migration (if any) has a spec that exercises the new column/table end-to-end.
- [ ] No stray `.only` on tests.

## Test plan

<!-- How a reviewer can verify this change. Screenshots for UI work. -->
