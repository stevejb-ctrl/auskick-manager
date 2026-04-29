# Coding Conventions

**Analysis Date:** 2026-04-29

## Language & Strictness

**TypeScript Configuration (`tsconfig.json`):**
- `strict: true` — all strict flags enabled (strictNullChecks, strictFunctionTypes, etc.)
- `noEmit: true` — type-checking only, no output generation (Next.js handles compilation)
- `jsx: "preserve"` — Next.js processes JSX
- Path aliases enabled: `@/*` → `./src/*`
- Exclude: `node_modules`, `e2e`, `playwright.config.ts`, `scripts`

**Enforcement:**
- `npx tsc --noEmit` must pass before committing (per CLAUDE.md)

## Naming Patterns

**Files:**
- React components: PascalCase in `src/components/` (e.g., `TagManager.tsx`, `TagChip.tsx`)
- Page components: `page.tsx`, `layout.tsx`, `loading.tsx` (Next.js convention)
- Server actions: `actions.ts` in the route directory (e.g., `src/app/(app)/admin/actions.ts`, `src/app/(app)/teams/[teamId]/games/actions.ts`)
- Utilities/functions: camelCase (e.g., `playerUtils.ts`, `fairness.ts`, `ageGroups.ts`)
- Tests: `*.test.ts` for unit tests, `*.spec.ts` for e2e specs
- Test helpers: descriptive names in fixtures (e.g., `supabase.ts`, `factories.ts`)

**Functions:**
- camelCase (e.g., `jerseyLabel()`, `suggestStartingLineup()`, `applyInjurySwap()`)
- Server actions are async exported functions (e.g., `createTag()`, `setAvailability()`, `addFillIn()`)
- Utility functions use `export function` or `export const`

**Variables & Constants:**
- camelCase for locals and module exports (e.g., `editingId`, `pending`, `setError()`)
- UPPER_SNAKE_CASE for module-level constants (e.g., `ALLOWED_COLORS`, `PLAYER_FIRST_NAMES`, `EXPECTED_DEFAULT_ON_FIELD`, `QUARTER_MS`)
- Design tokens as string constants: `const colorClasses: Record<string, string>`

**Types & Interfaces:**
- PascalCase for interfaces (e.g., `TagChipProps`, `MakeTeamOpts`, `LiveAuth`, `Profile`)
- Type aliases for discriminated unions (e.g., `type AgeGroup = "U8" | "U9" | ...`, `type PositionModel = "zones3" | "positions5"`)
- Database shapes documented with comments showing schema intent

## Code Style

**Formatting:**
- ESLint extends `next/core-web-vitals` (`.eslintrc.json`)
- No explicit Prettier config found — uses Next.js defaults (2-space indent, double quotes)
- Run `npm run lint` to check style compliance

**Line Length & Wrapping:**
- Comments use visual separators: `// ─── Section Name ───────────────────────────────────` (see `src/app/(app)/admin/actions.ts` and `src/lib/types.ts`)
- Long function signatures break at reasonable points, maintaining readability

## Import Organization

**Order (observed pattern):**
1. React/Next.js imports (`import { useState, useTransition } from "react"`, `import Link from "next/link"`)
2. Next.js specific (`import { redirect } from "next/navigation"`, `import { revalidatePath } from "next/cache"`)
3. Supabase/external libraries (`import { createClient } from "@supabase/supabase-js"`)
4. Internal `@/` path imports (`import { Button } from "@/components/ui/Button"`, `import type { ContactTag } from "@/lib/types"`)
5. Type imports grouped: `import type { ... } from "..."` after implementation imports

**Path Aliases:**
- `@/components/*` — UI components
- `@/lib/*` — utilities, types, stores
- `@/app/*` — route handlers and server actions

## Error Handling

**Server Actions Pattern (`ActionResult<T>`):**
- Standardized return type defined in `src/lib/types.ts`:
  ```typescript
  export type ActionResult<T = unknown> =
    | { success: true; data?: T }
    | { success: false; error: string };
  ```
- Every server action returns `Promise<ActionResult<T>>` or `Promise<ActionResult>`
- Generic `data` field allows typed returns (e.g., `createTag` returns the inserted `ContactTag` row so clients can replace temp-id placeholders)
- Error strings are user-facing and concise (e.g., `"Name required."`, `"Name too long (40 chars max)."`, `"Unauthenticated."`)

**Patterns observed:**
- Input validation before Supabase calls (see `createTag` in `src/app/(app)/admin/actions.ts`)
- Auth checks via `requireSuperAdmin()` helper or manual membership lookups
- Supabase errors extracted and passed through the `ActionResult` envelope
- `revalidatePath()` called after mutations to invalidate cached pages

## Logging

**Approach:**
- No explicit logging framework found — console/built-in error handling only
- Error messages bubble up through `ActionResult.error` to the UI
- Test helpers log via console in Node environment

## Comments

**JSDoc / TSDoc:**
- Selective documentation for non-obvious functions (see `jerseyLabel()` in `src/lib/playerUtils.ts`)
- Function-level comments explain intent and rationale (see `createTag` comments on temp-id swapping)
- Section separators (`// ─── Section Name ───────────────────────────────────`) used to group related code

**Inline Comments:**
- Used sparingly for complex logic (e.g., zone-minute accumulation in `applyInjurySwap`)
- Emphasis on self-documenting code — clear variable names over noisy comments

## Component & Function Design

**React Components:**
- Functional components with hooks (`useState`, `useTransition`)
- Props typed via interfaces: `interface TagManagerProps { ... }` (see `src/components/admin/TagManager.tsx`)
- Client components marked with `"use client"` (see top of `TagManager.tsx`)
- Prefer semantic HTML: `getByRole`, `getByLabel` over `getByTestId` in tests

**Server Actions:**
- Marked with `"use server"` at the top
- Always async
- Receive input as function parameters
- Return `ActionResult<T>`
- Validate input before DB calls
- Call `revalidatePath()` or `revalidateTag()` after mutations

**Pure Functions:**
- Stateless, single-responsibility (e.g., `zoneCapsFor()`, `suggestStartingLineup()`, `normalizeLineup()`)
- Used for domain logic not tied to React or server operations
- Heavily tested via Vitest unit tests

## Supabase Integration

**Clients:**
- Server-side: `createClient()` from `@/lib/supabase/server` (uses SSR cookie management)
- Admin operations: `createAdminClient()` from `@/lib/supabase/admin` (uses service-role key)
- Test fixtures: service-role client from `@supabase/supabase-js` directly (see `e2e/fixtures/supabase.ts`)

**Insert/Select Pattern:**
- **Critical**: Never chain `.select()` directly to `.insert()` when an AFTER INSERT trigger creates rows the SELECT policy depends on (documented in `e2e/fixtures/factories.ts:makeTeam()`)
- Two-step approach: insert, then separate `.select()` query
- Reason: AFTER INSERT triggers run after the insert completes but before SELECT policy evaluation

**RLS (Row-Level Security):**
- Enforced on team tables (service-role client needed for admin queries)
- Documented in type comments (see `src/lib/types.ts` "service-role only" notes)
- Auth checks in server actions gate access before Supabase calls

## Optimistic Updates

**Pattern (observed in TagManager):**
- Append returned data from server action to local state immediately
- Example: `createTag()` returns the inserted `ContactTag`; TagManager appends it via `setTags((prev) => [...prev, created])`
- Reason: `useState(initialTags)` doesn't sync to prop changes, so temp-id placeholders would stick around forever
- Real database ID is stored immediately, preventing edit stalls

## Form & Input Validation

**Client-side:**
- Trim and validate before posting (e.g., `const trimmed = name.trim()`)
- Check lengths and required fields (e.g., `if (trimmed.length === 0) return`)
- Display errors via `setError()` in component state

**Server-side:**
- Duplicate validation on server (defense in depth)
- Use `ActionResult.error` to communicate failures
- Sanitize inputs (e.g., `sanitizeColor()` in `src/app/(app)/admin/actions.ts`)

---

*Convention analysis: 2026-04-29*
