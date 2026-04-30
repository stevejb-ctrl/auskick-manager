// NETBALL-07 — Netball walkthrough first-visit, persistence, and
// track_scoring=false scoring-step gate.
//
// Existing Vitest coverage at src/lib/__tests__/netballWalkthroughSteps.test.ts
// proves buildNetballWalkthroughSteps respects the trackScoring flag at the
// pure-function layer. This spec proves the live shell ACTUALLY fires the
// modal on first visit, the localStorage key is correct
// (`nb-walkthrough-seen`), and the modal renders the expected steps.
//
// Per CONTEXT D-CONTEXT-walkthrough-localStorage-cleanup: every test
// MUST clear nb-walkthrough-seen via addInitScript BEFORE page.goto so
// the walkthrough fires deterministically. Without this, only the
// first run of any spec sees it; subsequent runs skip silently.
//
// NOTE on track_scoring=false coverage: NetballLiveGame.tsx currently
// hard-codes `trackScoring: true` when calling buildNetballWalkthroughSteps
// (line 801). Plan 04-04 wires the real prop through. Until that ships,
// the track_scoring=false test case in this spec is EXPECTED RED — it
// asserts the contract NETBALL-07 demands, which currently fails. This
// is intentional per the testing-is-part-of-done rule from CLAUDE.md
// ("Bug fixes must land with a regression test that fails against the
// pre-fix code — write the test first, watch it go red, then fix the
// bug and watch it go green").
//
// Covers: src/components/netball/NetballLiveGame.tsx walkthrough
//         effect; src/components/netball/netballWalkthroughSteps.ts
//         scoring-step gate.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function setupNetballGame(opts: { trackScoring: boolean }) {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "go",
    sport: "netball",
    name: `NB-WT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  // Flip track_scoring directly on the row so the live page reads the
  // correct value when it loads. The wizard does NOT auto-flip per
  // multi-sport-schema.spec.ts L4.
  await admin
    .from("teams")
    .update({ track_scoring: opts.trackScoring })
    .eq("id", team.id);

  // Netball squad = 9 players. Pass count: 9 explicitly because the
  // factory's default depends on AGE_GROUPS["go"] which doesn't exist
  // (AGE_GROUPS is AFL-shaped). Use ageGroup: "U10" on makePlayers to
  // dodge the AFL lookup — it's only used for the default count, not
  // any real netball logic. Single-word names per factory's pattern.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  return { team, players, game, ownerId, admin };
}

test("NETBALL-07: walkthrough fires on first visit when localStorage key is absent", async ({ page }) => {
  const { team, game } = await setupNetballGame({ trackScoring: true });

  // CRITICAL: addInitScript runs BEFORE the page's own scripts, so it
  // clears the localStorage entry before NetballLiveGame's mount-effect
  // checks for it. Without this, persisted state from prior runs would
  // suppress the walkthrough.
  await page.addInitScript(() => {
    try { localStorage.removeItem("nb-walkthrough-seen"); } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The walkthrough modal opens in a "welcome" phase first
  // (WalkthroughModal.tsx:82-117). Assert the welcome heading is
  // visible — that proves the walkthrough fired on first visit.
  await expect(
    page.getByRole("heading", { name: /welcome to game manager/i }),
  ).toBeVisible({ timeout: 5_000 });

  // Advance past welcome to the first step so we know the "steps"
  // phase actually renders.
  await page.getByRole("button", { name: /yes,?\s*show me/i }).click();
  await expect(
    page.getByRole("heading", { name: /starting the game/i }),
  ).toBeVisible({ timeout: 2_000 });
});

test("NETBALL-07: closing walkthrough persists nb-walkthrough-seen and a re-visit skips it", async ({ page }) => {
  const { team, game } = await setupNetballGame({ trackScoring: true });

  // SessionStorage-guarded clear: addInitScript runs on every navigation
  // (including reload), so a naive `localStorage.removeItem` would
  // re-clear the key after we've established persistence and the
  // walkthrough would re-open on reload. Guard with a sessionStorage
  // flag so the clear runs only on the first navigation in this tab.
  // sessionStorage survives reload but is cleared per-context, so each
  // test starts fresh.
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("nb-walkthrough-cleared")) {
        localStorage.removeItem("nb-walkthrough-seen");
        sessionStorage.setItem("nb-walkthrough-cleared", "1");
      }
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Walk past welcome -> through every step -> click the final close
  // affordance. WalkthroughModal opens on "welcome" phase
  // (WalkthroughModal.tsx:82-117); advance to "steps" first.
  await expect(page.getByRole("heading", { name: /welcome to game manager/i })).toBeVisible();
  await page.getByRole("button", { name: /yes,?\s*show me/i }).click();
  await expect(page.getByRole("heading", { name: /starting the game/i })).toBeVisible();

  // Click "Next" until we hit the final step, then click "Let's go!"
  // (the last-step close button per WalkthroughModal.tsx:164). Use a
  // bounded loop so a runaway never hangs the test. Some test runs may
  // dismiss via the "Skip walkthrough" link instead — either path
  // closes the modal and writes the localStorage key.
  for (let i = 0; i < 12; i++) {
    const next = page.getByRole("button", { name: /next/i });
    const done = page.getByRole("button", { name: /let.?s go|skip walkthrough/i });
    if (await done.isVisible().catch(() => false)) {
      await done.click();
      break;
    }
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      continue;
    }
    // Fallback: dismiss-by-Escape, which the modal supports via role="dialog".
    await page.keyboard.press("Escape");
    break;
  }

  // After close, the localStorage key must equal "1".
  await expect.poll(
    async () => page.evaluate(() => localStorage.getItem("nb-walkthrough-seen")),
    { timeout: 5_000 },
  ).toBe("1");

  // Reload — the modal must NOT re-appear.
  await page.reload();
  // Give the page a chance to mount + run the effect; if the modal were
  // going to fire it would do so on mount.
  await expect(
    page.getByRole("heading", { name: /starting the game/i }),
  ).not.toBeVisible({ timeout: 2_000 });

  // Bonus: confirm the "?" button in the top utility row CAN re-open
  // the walkthrough on demand (NETBALL-07 implicit behaviour — Phase 4
  // CONTEXT specifics). On re-open the modal has skipWelcome=true so
  // the first step is rendered directly.
  await page.getByRole("button", { name: /open walkthrough/i }).click();
  await expect(
    page.getByRole("heading", { name: /starting the game/i }),
  ).toBeVisible({ timeout: 2_000 });
});

test("NETBALL-07: track_scoring=true walkthrough INCLUDES the recording-scores step", async ({ page }) => {
  const { team, game } = await setupNetballGame({ trackScoring: true });

  await page.addInitScript(() => {
    try { localStorage.removeItem("nb-walkthrough-seen"); } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Advance past the welcome phase (WalkthroughModal.tsx:82-117) into
  // the steps phase before scanning step headings.
  await page.getByRole("button", { name: /yes,?\s*show me/i }).click();

  // Step through until we either find the scoring step or exhaust steps.
  // The step's title is "Recording scores" (per netballWalkthroughSteps.ts).
  let foundScoringStep = false;
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole("heading", { name: /recording scores/i }).isVisible().catch(() => false)) {
      foundScoringStep = true;
      break;
    }
    const next = page.getByRole("button", { name: /next/i });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
    } else {
      break;
    }
  }
  expect(foundScoringStep).toBe(true);
});

test("NETBALL-07: track_scoring=false walkthrough OMITS the recording-scores step", async ({ page }) => {
  // EXPECTED RED until plan 04-04 wires trackScoring through NetballLiveGame.
  // The hard-coded `trackScoring: true` at NetballLiveGame.tsx:801 makes
  // this test fail today — by design. Per CLAUDE.md "Bug fixes must land
  // with a regression test that fails against the pre-fix code."
  const { team, game } = await setupNetballGame({ trackScoring: false });

  await page.addInitScript(() => {
    try { localStorage.removeItem("nb-walkthrough-seen"); } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Advance past the welcome phase (WalkthroughModal.tsx:82-117) into
  // the steps phase. The "Recording scores" step is reachable only in
  // the steps phase.
  await page.getByRole("button", { name: /yes,?\s*show me/i }).click();

  // Step through every page; assert "Recording scores" never appears.
  // The loop's `done` regex matches ONLY the last-step "Let's go!" button.
  // We deliberately do NOT alternate against /skip walkthrough/ here:
  // the "Skip walkthrough" link renders on every non-last step
  // (WalkthroughModal.tsx:168), so an alternation would make the loop
  // exit at idx=0 and the assertion vacuous (it would never reach the
  // scoring step). The narrowed regex forces us to walk every step.
  for (let i = 0; i < 12; i++) {
    const scoringHeading = page.getByRole("heading", { name: /recording scores/i });
    expect(await scoringHeading.isVisible().catch(() => false)).toBe(false);
    const next = page.getByRole("button", { name: /next/i });
    const done = page.getByRole("button", { name: /let.?s go/i });
    if (await done.isVisible().catch(() => false)) break;
    if (await next.isVisible().catch(() => false)) {
      await next.click();
    } else {
      break;
    }
  }
});
