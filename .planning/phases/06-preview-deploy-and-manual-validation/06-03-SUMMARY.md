---
phase: 06-preview-deploy-and-manual-validation
plan: 03
subsystem: verification-script
tags: [deploy, verify-script, supabase, schema-acceptance, read-only]
requires:
  - "Plan 06-01 (06-DEPLOY-CHECKLIST.md §5 migration set, 76c70d3)"
  - "Plan 06-02 (06-DEPLOY-RUNBOOK.md Phase B + Phase E reference the script, b9a009c)"
provides:
  - "scripts/verify-prod-clone.mjs (read-only Phase 2 §6 acceptance probe; invoked by runbook §B + §E)"
affects:
  - "Closes the runtime side of SCHEMA-04 deferred from Phase 2 §6 — automated half (Q1 + Q3 + Q4 + Q5 existence) lands here; manual half (Q2 + Q5 resolution) lands in Plan 06-05"
tech-stack:
  added: []
  patterns: ["Node ESM script (matches scripts/e2e-setup.mjs convention with shebang)", "service-role @supabase/supabase-js client with autoRefreshToken=false + persistSession=false", "defensive PostgREST schema-traversal (WARN-not-FAIL on schema_migrations not-exposed edge)"]
key-files:
  created:
    - "scripts/verify-prod-clone.mjs"
  modified: []
decisions:
  - "Added shebang `#!/usr/bin/env node` to match the existing scripts/e2e-setup.mjs convention (the plan's <existing_script_pattern> said 'no shebang' but the live repo convention has one)"
  - "WARN-not-FAIL semantics for Q1 (PostgREST schema-exposure edge) and Q5-zero-tokens (prod-data assumption, not code-correctness)"
  - "Exit codes: 0=all-PASS-or-WARN, 1=any-FAIL, 2=env-var-validation-failed"
  - "Read-only by construction: zero .insert(/.update(/.delete(/.rpc( calls; verified by grep returning zero matches"
metrics:
  duration: "~7 min (read context + write script + verify gates)"
  completed: "2026-04-30"
  tasks: 1
  files: 1
---

# Phase 6 Plan 3: Read-only verify-prod-clone.mjs script — Summary

One-liner: Authored a 228-line read-only Node ESM script (`scripts/verify-prod-clone.mjs`) that connects via service-role and runs the Phase 2 §6 acceptance queries (Q1 migration count + Q3 no-null-sports + Q4 distinct-sport-includes-afl + Q5 share-token sample), with WARN-not-FAIL on PostgREST schema-exposure edge and zero-token edge.

## What landed

`scripts/verify-prod-clone.mjs` (228 lines, +228/-0 net). Structure:

- **Header doc-comment** — purpose, usage, invariants (READ-ONLY, no new deps), exit codes (0/1/2).
- **Env validation** — reads `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL` fallback) + `SUPABASE_SERVICE_ROLE_KEY`; exits 2 with usage hint if either missing.
- **Service-role client** — `createClient` with `auth: { autoRefreshToken: false, persistSession: false }` (matches `src/lib/supabase/admin.ts` pattern).
- **Q1 — Migration count** — `.schema('supabase_migrations').from('schema_migrations').select('*', {count:'exact', head:true})`. Defensive: WARN if PostgREST hasn't exposed the schema (operator falls back to `supabase migration list --linked` per runbook Phase B step 4); PASS if count=27; FAIL if count!=27.
- **Q3 — No null sports** — `.from('teams').select('*', {count:'exact', head:true}).is('sport', null)`. PASS if count=0; FAIL otherwise (signals 0024_multi_sport.sql backfill missed rows).
- **Q4 — Distinct sport includes 'afl'** — `.from('teams').select('sport')` then JS Set distinct. PASS if 'afl' present; logs stray non-afl values as a note (worth investigating on a fresh-from-prod clone since prod has only AFL teams).
- **Q5 — Share-token sample** — count + 1-row sample via `.from('share_tokens').select('token, game_id').limit(1)`. PASS emits `/run/<token>` URL for the human's manual smoke in Plan 06-05; WARN-not-FAIL on zero tokens (prod-data assumption).
- **Summary block** — names Q2 (load AFL team) and Q5-resolution-half as manual checks Plan 06-05 owns.
- **Exit handling** — `process.exit(1)` if any FAIL, otherwise `process.exit(0)`.

## Verification gates at execute time

| Gate | Command | Result |
|------|---------|--------|
| Parses as valid ESM | `node --check scripts/verify-prod-clone.mjs` | exit 0 |
| Read-only (no mutating verbs) | `grep -nE "\.insert\(\|\.update\(\|\.delete\(\|\.rpc\(" scripts/verify-prod-clone.mjs` | zero matches |
| Env-error path reachable | `node scripts/verify-prod-clone.mjs` (no env vars set) | exit 2 + clean ERROR + Usage block |
| Line count in target window | `wc -l scripts/verify-prod-clone.mjs` | 228 (target 150–260) |
| package.json unchanged (no new deps) | `git diff --stat package.json` | empty diff |
| `npx tsc --noEmit` exit 0 | `npx tsc --noEmit` | exit 0 |
| `npm run lint` exit 0 | `npm run lint` | exit 0 (3 pre-existing warnings unchanged from Phase 5) |
| `git status` shows only the new script | `git status -- src/ supabase/ e2e/ package.json vercel.json next.config.mjs` | clean |

## Deviations from Plan

**1. [Rule 3 — Convention drift] Added shebang to match repo convention**

- **Found during:** Task 1, while reading `scripts/e2e-setup.mjs` for pattern alignment.
- **Issue:** The plan's `<existing_script_pattern>` block claimed "Top-of-file shebang OPTIONAL (none of the existing scripts use one)". This contradicts reality — `scripts/e2e-setup.mjs` line 1 is `#!/usr/bin/env node`.
- **Fix:** Added `#!/usr/bin/env node` shebang to `verify-prod-clone.mjs` to match the actual repo convention. This is a Rule 3 (blocking-issue auto-fix) since shipping a script that violates repo convention would be a small but obvious inconsistency for any future executor.
- **Files modified:** `scripts/verify-prod-clone.mjs` (single line — first line).
- **Commit:** `ff37c2b` (rolled into the main script commit; not a separate commit since the shebang is a 1-line cosmetic that doesn't merit splitting).

No other deviations.

## Self-Check

- [x] File exists at canonical path
- [x] `node --check` exit 0
- [x] Imports `@supabase/supabase-js` (no new dep — already in `package.json:dependencies` at ^2.45.4)
- [x] Reads `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY`
- [x] Read-only: zero `.insert(`, `.update(`, `.delete(`, `.rpc(` matches
- [x] All five Phase 2 §6 acceptance touchpoints addressed (Q1+Q3+Q4+Q5 automated; Q2 + Q5-manual-half explicitly named as Plan 06-05's responsibility)
- [x] Env-error path returns exit 2 with the documented usage hint
- [x] Line count 228 (within 150–260 target)
- [x] `npx tsc --noEmit` exit 0
- [x] `npm run lint` exit 0 (3 pre-existing warnings unchanged)
- [x] Source/migration/e2e tree unchanged
- [x] `package.json` unchanged
- [x] Commit `ff37c2b` recorded

## Self-Check: PASSED

## Hand-off

- **Plan 06-04 (deploy execute, BLOCKED on user creds)** invokes this script in runbook §B (post-migration acceptance gate) + §E (smoke check). The script's exit code is the gate.
- **Plan 06-05 (manual validation, BLOCKED on user creds)** reads the Q5 PASS line's emitted sample `/run/<token>` URL and walks the user through opening it on the live preview to close the manual half of Phase 2 §6 query 5.
- **DEPLOY-01 + SCHEMA-04 (runtime side):** This script automates the schema-acceptance probes that Phase 2 §6 deferred to Phase 6. Plan 06-04 closes DEPLOY-01 by running the runbook end-to-end; Plan 06-05 closes the SCHEMA-04 manual half by walking the Q2 + /run/[token] checks against live data.

## Commit

- `ff37c2b` — `feat(06-03): scripts/verify-prod-clone.mjs — read-only Phase 2 §6 acceptance probe`
