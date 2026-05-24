// Covers the App Store guideline 5.1.1(v) account-deletion flow:
//
//   1. Sign-up + create team + player + game (so there's real data to wipe).
//   2. Visit /account → open delete modal → type-to-confirm.
//   3. Assert: deletion_scheduled_for set ~30 days out; banner visible
//      across (app) routes.
//   4. Click Restore → both schedule columns null again, banner gone.
//   5. Schedule again, fast-forward `deletion_scheduled_for` to the
//      past, run the purge logic directly (mirrors what the nightly
//      Edge Function does).
//   6. Assert hard delete:
//        - Auth login with same credentials fails.
//        - The team they solely admin'd is gone.
//        - Audit rows that referenced the user (game.created_by) now
//          have NULL there (migration 0034 — covers the schema half
//          of "ship the migration with a UI-level test", per CLAUDE.md).

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { purgeUserAccount } from "../../src/lib/account/purge";
import { GRACE_DAYS } from "../../src/lib/account/constants";

test.describe.configure({ mode: "parallel" });

test("user schedules deletion, restores, then is purged after grace period", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  const admin = createAdminClient();

  const stamp = Date.now();
  const email = `deletion-${stamp}@siren.test`;
  const password = "deletion-test-pw-1234";
  let userId: string | null = null;
  let teamId: string | null = null;

  try {
    // ── Provision user + sign in ────────────────────────────────────
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    userId = created.user!.id;

    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/(dashboard|teams\/new|welcome)/, {
      timeout: 15_000,
    });

    // ── Create a team so the modal has consequences to surface ──────
    // The team will be deleted as part of the purge (sole admin).
    if (!page.url().includes("/teams/new")) {
      await page.goto("/teams/new");
    }
    await page
      .getByLabel(/team name/i)
      .fill(`Goners ${stamp}`);
    await page.getByLabel(/age group/i).selectOption("U10");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 });
    teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];

    // Seed a game so a `games.created_by = userId` row exists. Used in
    // step 6 to verify the SET NULL behaviour from migration 0034.
    const { error: gameErr } = await admin.from("games").insert({
      team_id: teamId,
      opponent: "Audit Trail FC",
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      round_number: 1,
      on_field_size: 9,
      created_by: userId,
    });
    if (gameErr) throw new Error(`seed game: ${gameErr.message}`);

    // ── Open /account and the delete modal ──────────────────────────
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: /my account/i }),
    ).toBeVisible();
    await page.getByTestId("open-delete-account-modal").click();

    const modal = page.getByRole("dialog", { name: /delete your account/i });
    await expect(modal).toBeVisible();
    await expect(
      modal.getByText(new RegExp(`${GRACE_DAYS} days`)),
    ).toBeVisible();
    // Sole-admin team should be listed by name.
    await expect(modal.getByText(`Goners ${stamp}`)).toBeVisible();

    // Schedule button is disabled until "delete" is typed.
    const scheduleBtn = modal.getByRole("button", {
      name: /schedule deletion/i,
    });
    await expect(scheduleBtn).toBeDisabled();

    await modal
      .getByLabel(/type delete to confirm/i)
      .fill("delete");
    await expect(scheduleBtn).toBeEnabled();
    await scheduleBtn.click();

    // Wait for the modal to close. handleSubmit calls onClose() AFTER
    // the server action returns, so a closed modal proves the action
    // settled and router.refresh() has been kicked off. Without this
    // wait, the very next page.goto could collide with the in-flight
    // RSC refresh and surface as net::ERR_ABORTED in CI.
    await expect(modal).toBeHidden({ timeout: 10_000 });

    // ── Assert: schedule columns set, banner visible ────────────────
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("profiles")
            .select("deletion_scheduled_for, deletion_requested_at")
            .eq("id", userId!)
            .maybeSingle();
          return data?.deletion_scheduled_for ?? null;
        },
        { timeout: 5_000 },
      )
      .not.toBeNull();

    // Banner should be visible across the app — confirm both on the
    // /account view (already here) and on the dashboard.
    await expect(
      page.getByTestId("deletion-scheduled-banner"),
    ).toBeVisible();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("deletion-scheduled-banner"),
    ).toBeVisible();

    // ── Restore → schedule columns clear, banner gone ───────────────
    // Use domcontentloaded to avoid waiting on long-tail RSC prefetch
    // chatter under CI load, which was tripping net::ERR_ABORTED.
    await page.goto("/account", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /restore account/i }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("profiles")
          .select("deletion_scheduled_for")
          .eq("id", userId!)
          .maybeSingle();
        return data?.deletion_scheduled_for;
      })
      .toBeNull();
    // After router.refresh the section flips back to the danger card.
    await expect(
      page.getByTestId("open-delete-account-modal"),
    ).toBeVisible({ timeout: 5_000 });

    // ── Schedule again, then fast-forward the purge ─────────────────
    await page.getByTestId("open-delete-account-modal").click();
    await page
      .getByRole("dialog", { name: /delete your account/i })
      .getByLabel(/type delete to confirm/i)
      .fill("delete");
    await page
      .getByRole("button", { name: /schedule deletion/i })
      .click();

    // Pretend the cron just ran 30 days later: shift the schedule
    // column to a past timestamp.
    const pastIso = new Date(Date.now() - 1000).toISOString();
    const { error: backdateErr } = await admin
      .from("profiles")
      .update({ deletion_scheduled_for: pastIso })
      .eq("id", userId!);
    if (backdateErr) throw new Error(`backdate: ${backdateErr.message}`);

    // Run the same logic the Edge Function would.
    const result = await purgeUserAccount(admin, userId!);
    expect(result.deletedTeamIds).toContain(teamId);

    // ── Assert: hard delete is real ────────────────────────────────
    // Profile gone (cascade from auth.users delete).
    const { data: profileAfter } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId!)
      .maybeSingle();
    expect(profileAfter).toBeNull();

    // Sole-admin team gone.
    const { data: teamAfter } = await admin
      .from("teams")
      .select("id")
      .eq("id", teamId!)
      .maybeSingle();
    expect(teamAfter).toBeNull();

    // Sign-in fails — credentials no longer valid.
    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();
    // We stay on /login (no redirect to /dashboard) — assert by URL
    // rather than fishing for a specific error string, since Supabase
    // worded errors have moved around between versions.
    await page.waitForTimeout(1500);
    expect(page.url()).toMatch(/\/login/);

    // Don't double-delete in finally — the user is already gone.
    userId = null;
  } finally {
    if (userId) await deleteTestUser(admin, userId);
    await context.close();
  }
});

test("SET NULL: audit-trail FKs survive user deletion (migration 0034)", async () => {
  // Two users, co-admin scenario: user B's data should survive when
  // user A is purged. Specifically `games.created_by` should be NULL,
  // not cascade-deleted along with user A.
  const admin = createAdminClient();
  const stamp = Date.now();

  const userA = await admin.auth.admin.createUser({
    email: `audit-a-${stamp}@siren.test`,
    password: "audit-test-pw-1234",
    email_confirm: true,
  });
  const userB = await admin.auth.admin.createUser({
    email: `audit-b-${stamp}@siren.test`,
    password: "audit-test-pw-1234",
    email_confirm: true,
  });
  const uA = userA.data.user!.id;
  const uB = userB.data.user!.id;

  try {
    // B owns a team, A is a co-admin.
    const { error: tErr } = await admin.from("teams").insert({
      name: `Audit Team ${stamp}`,
      age_group: "U10",
      created_by: uB,
    });
    if (tErr) throw new Error(`team: ${tErr.message}`);
    const { data: team } = await admin
      .from("teams")
      .select("id")
      .eq("name", `Audit Team ${stamp}`)
      .single();
    const tId = team!.id;
    await admin
      .from("team_memberships")
      .insert({ team_id: tId, user_id: uA, role: "admin" });

    // A creates a game on B's team. games.created_by = A.
    const { error: gErr } = await admin.from("games").insert({
      team_id: tId,
      opponent: "FK Survives FC",
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      round_number: 7,
      on_field_size: 9,
      created_by: uA,
    });
    if (gErr) throw new Error(`game: ${gErr.message}`);

    // Purge A. Team should survive (B is also admin); the game row
    // stays and its `created_by` becomes NULL.
    await purgeUserAccount(admin, uA);

    const { data: teamStill } = await admin
      .from("teams")
      .select("id")
      .eq("id", tId)
      .maybeSingle();
    expect(teamStill).not.toBeNull();

    const { data: gameStill } = await admin
      .from("games")
      .select("id, created_by, opponent")
      .eq("team_id", tId)
      .eq("opponent", "FK Survives FC")
      .maybeSingle();
    expect(gameStill).not.toBeNull();
    expect(gameStill!.created_by).toBeNull();
  } finally {
    await admin.from("teams").delete().eq("name", `Audit Team ${stamp}`);
    await deleteTestUser(admin, uB);
    await deleteTestUser(admin, uA);
  }
});

