// ─── Stagehand round 11 follow-ups (a): Steve's calls ───────────────
// .planning/USABILITY-STAGEHAND-2026-11-ROUND11.md, "Friction for Steve".
// His decisions, 12 Nov 2026:
//
//   1. Demo games: "Add the signup footer." Five visitors looked for a
//      way to sign up from inside a demo game. Demo games only, and it
//      mustn't cover the bar a visitor plays the demo with.
//   2. "Add a custom validation" for Revoke invite and Remove song (and
//      every other window.confirm): the app's own confirm dialog.
//   3. Terms: "Make it free for the 2026 season." (sirenFacts.test.ts)
//   4. Email: "Put validation in." "new.coach@examplecom" was accepted
//      and "a link was sent".
//   5. Invites: "Allow it to be changed." A pending invite's role.
//
// Covers: src/components/marketing/DemoSignupFooter.tsx, src/app/run/[token]/layout.tsx
//         src/components/ui/ConfirmDialog.tsx, src/components/team/TeamMembersSettings.tsx,
//         src/components/team/TeamSongSettings.tsx
//         src/lib/email/validate.ts, LoginForm, ForgotPasswordForm, ContactForm
//         src/app/(app)/teams/[teamId]/settings/member-actions.ts (updateInviteRole)

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { aflGame, boxOf, focusInDialog, largeText, netballGame, skipHints } from "../helpers/a11y";
import { DEMO_CARDS, ensureDemoTeams } from "../helpers/demo";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { anonPhone, coachId, coachPhone, makeInvite, newPerson, signedInPhone } from "../helpers/people";
import { readTheme } from "../helpers/theme";

test.use({ viewport: { width: 390, height: 844 } });

/** A screenshot for Steve, when R11A_SHOTS names a folder. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.R11A_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

/** Fail on a native confirm/alert: the app answers in its own dialogs now. */
function noNativeDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on("dialog", (d) => {
    seen.push(`${d.type()}: ${d.message()}`);
    void d.dismiss();
  });
  return seen;
}

/** A live game on a team flagged as a demo, opened on its game-day link. */
async function liveDemo(page: Page, which: "afl" | "netball") {
  const made = which === "afl" ? await aflGame({ name: "R11A-DEMO-AFL" }) : await netballGame({ name: "R11A-DEMO-NB" });
  // The demos keep score, so the score bar is there to stay clear of.
  await made.admin.from("teams").update({ is_demo: true, track_scoring: true }).eq("id", made.team.id);
  await skipHints(page);
  await page.goto(`/run/${made.game.share_token}`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — /i }).first()).toBeVisible({ timeout: 20_000 });
  return made;
}

/** The footer sits on the bottom edge, and nothing the game pins is under it. */
async function expectFooterClear(page: Page) {
  const footer = page.getByTestId("demo-signup-footer");
  await expect(footer).toBeVisible();
  const create = footer.getByRole("link", { name: "Create your team" });
  await expect(create).toHaveAttribute("href", "/signup");
  const viewport = page.viewportSize()!;
  const foot = await boxOf(footer);
  const link = await boxOf(create);
  expect(foot.bottom).toBeGreaterThan(viewport.height - 2);
  expect(link.height, "Create your team is a 44 px target").toBeGreaterThanOrEqual(44);
  expect(link.left).toBeGreaterThanOrEqual(0);
  expect(link.right).toBeLessThanOrEqual(viewport.width);

  // Every bar the game pins (the live shell's foot, the top bar) ends
  // above the footer, and each score button is the thing a tap lands on.
  const covered = await page.evaluate((footTop) => {
    const box = document.querySelector("[data-testid=demo-game]")!;
    const out: string[] = [];
    for (const el of Array.from(box.querySelectorAll<HTMLElement>("*"))) {
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      if (r.bottom > footTop + 1) out.push(`${el.tagName}.${el.className.toString().slice(0, 60)} bottom ${Math.round(r.bottom)}`);
    }
    for (const b of Array.from(document.querySelectorAll<HTMLElement>("#live-scores button"))) {
      const r = b.getBoundingClientRect();
      if (r.height === 0) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !b.contains(hit)) out.push(`score button "${b.getAttribute("aria-label") ?? b.textContent}" is covered`);
    }
    return out;
  }, foot.top);
  expect(covered).toEqual([]);
  await expect(page.locator("#live-scores button").first()).toBeVisible();
}

test.describe("1. the demo game's sign-up footer", () => {
  test.describe.configure({ mode: "serial" });

  test("AFL: under the live game, clear of the score bar, and it goes to sign-up", async ({ page }) => {
    const { admin, team } = await liveDemo(page, "afl");
    try {
      await expectFooterClear(page);
      await expect(page.getByTestId("demo-signup-footer")).toContainText(/free for the 2026 season/i);
      await shot(page, "1-demo-footer-afl");
      await page.getByTestId("demo-signup-footer").getByRole("link", { name: "Create your team" }).click();
      // /signup is sign-in's page; this browser is the suite's signed-in
      // coach, so it goes on to the dashboard. A visitor stops at /login.
      await page.waitForURL((u) => /^\/(login|dashboard)/.test(u.pathname), { timeout: 30_000 });
    } finally {
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("netball: the same footer, clear of the bar, at 200% text too", async ({ page }) => {
    const { admin, team } = await liveDemo(page, "netball");
    try {
      await expectFooterClear(page);
      await shot(page, "1-demo-footer-netball");
      await largeText(page, 200);
      await expectFooterClear(page);
      await shot(page, "1-demo-footer-netball-200");
    } finally {
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("at 320 wide and in the dark theme it fits and reads", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 640 }, colorScheme: "dark", storageState: undefined });
    const page = await context.newPage();
    const { admin, team } = await liveDemo(page, "afl");
    try {
      await expectFooterClear(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      const theme = await readTheme(page, "[data-testid=demo-signup-footer]");
      expect(theme.colorScheme).toContain("dark");
      expect(theme.sampled).toBeGreaterThan(0);
      expect(theme.failures).toEqual([]);
      await shot(page, "1-demo-footer-afl-320-dark");
    } finally {
      await admin.from("teams").delete().eq("id", team.id);
      await context.close();
    }
  });

  test("a real team's game-day link has no footer", async ({ page }) => {
    const { admin, team, game } = await aflGame({ name: "R11A-REAL" });
    try {
      await skipHints(page);
      await page.goto(`/run/${game.share_token}`);
      await waitForHydration(page);
      await expect(page.getByRole("button", { name: /^clock — /i }).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("demo-signup-footer")).toHaveCount(0);
      await expect(page.getByTestId("demo-game")).toHaveCount(0);
    } finally {
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("every sport's demo from the picker has it", async ({ page }) => {
    test.setTimeout(300_000);
    await ensureDemoTeams();
    for (const [id] of DEMO_CARDS) {
      await page.goto("/demo");
      await page.getByTestId(`demo-card-${id}`).click();
      await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 30_000 });
      await expect(page.getByText(/you're running today's game/i), id).toBeVisible({ timeout: 20_000 });
      const footer = page.getByTestId("demo-signup-footer");
      await expect(footer, id).toBeVisible();
      await expect(footer.getByRole("link", { name: "Create your team" }), id).toHaveAttribute("href", "/signup");
      const viewport = page.viewportSize()!;
      expect((await boxOf(footer)).bottom, id).toBeGreaterThan(viewport.height - 2);
    }
  });
});

test.describe("2. the app's own confirm dialog", () => {
  test("Revoke invite asks in a dialog that holds focus, cancels on Escape, then revokes", async ({ browser }) => {
    const admin = createAdminClient();
    const ownerId = await coachId(admin);
    const team = await makeTeam(admin, { ownerId, sport: "hockey" });
    const token = await makeInvite(admin, { teamId: team.id, createdBy: ownerId });
    const { context, page } = await coachPhone(browser);
    const native = noNativeDialogs(page);
    try {
      await gotoStable(page, `/teams/${team.id}/settings#people`);
      const revoke = page.getByRole("button", { name: /^revoke$/i });
      await revoke.click();
      const dialog = page.getByRole("dialog", { name: "Revoke this invite?" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(/stops working straight away/i);
      await expect.poll(() => focusInDialog(page), { message: "focus moved into the dialog" }).toBe(true);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        expect(await focusInDialog(page), `Tab ${i + 1} left the dialog`).toBe(true);
      }
      await shot(page, "2-confirm-revoke-invite");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(revoke).toBeFocused();
      const { data: still } = await admin.from("team_invites").select("revoked_at").eq("token", token).single();
      expect(still?.revoked_at).toBeNull();

      await revoke.click();
      await dialog.getByRole("button", { name: "Revoke invite" }).click();
      await expect
        .poll(async () => (await admin.from("team_invites").select("revoked_at").eq("token", token).single()).data?.revoked_at, {
          timeout: 15_000,
        })
        .not.toBeNull();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: /^revoke$/i })).toHaveCount(0, { timeout: 10_000 });
      expect(native).toEqual([]);
    } finally {
      await context.close();
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("Remove team song asks in the app's dialog, and Cancel keeps the song", async ({ browser }) => {
    const admin = createAdminClient();
    const ownerId = await coachId(admin);
    const team = await makeTeam(admin, { ownerId, sport: "afl" });
    await admin.from("teams").update({ song_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }).eq("id", team.id);
    const { context, page } = await coachPhone(browser);
    const native = noNativeDialogs(page);
    try {
      await gotoStable(page, `/teams/${team.id}/settings#game-day`);
      const card = page
        .getByRole("heading", { name: /^team song$/i })
        .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
      await card.getByRole("button", { name: /^remove$/i }).click();
      const dialog = page.getByRole("dialog", { name: "Remove the team song?" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Remove song" })).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      const { data: kept } = await admin.from("teams").select("song_url").eq("id", team.id).single();
      expect(kept?.song_url).not.toBeNull();

      await card.getByRole("button", { name: /^remove$/i }).click();
      await dialog.getByRole("button", { name: "Remove song" }).click();
      await expect(page.getByText("Song removed.")).toBeVisible({ timeout: 10_000 });
      const { data: removed } = await admin.from("teams").select("song_url").eq("id", team.id).single();
      expect(removed?.song_url).toBeNull();
      expect(native).toEqual([]);
    } finally {
      await context.close();
      await admin.from("teams").delete().eq("id", team.id);
    }
  });
});

test.describe("4. a typo'd email gets a reason, not a sent link", () => {
  test("sign-in: no dot in the domain, or a space, says so under the field", async ({ browser }) => {
    const { context, page } = await anonPhone(browser);
    try {
      await gotoStable(page, "/login");
      await waitForHydration(page);
      const email = page.getByTestId("login-email");
      await email.fill("new.coach@examplecom");
      await page.getByTestId("login-submit").click();
      await expect(page.getByRole("alert").filter({ hasText: /part after the @ needs a dot, like gmail\.com/i })).toBeVisible();
      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByText(/check your inbox/i)).toHaveCount(0);
      await shot(page, "4-email-error-login");

      await email.fill("coach @gmail.com");
      await expect(page.getByRole("alert").filter({ hasText: /needs a dot/i })).toHaveCount(0);
      await page.getByTestId("login-submit").click();
      await expect(page.getByRole("alert").filter({ hasText: /can't have spaces/i })).toBeVisible();
      await expect(page.getByText(/check your inbox/i)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("forgot password and the contact form check it too", async ({ browser }) => {
    const { context, page } = await anonPhone(browser);
    try {
      await gotoStable(page, "/forgot-password");
      await waitForHydration(page);
      await page.getByLabel("Email").fill("coach@gmail");
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(page.getByRole("alert").filter({ hasText: /needs a dot/i })).toBeVisible();
      await expect(page.getByText(/check your inbox/i)).toHaveCount(0);

      await gotoStable(page, "/contact");
      await waitForHydration(page);
      await page.getByLabel("Your name").fill("Coach Typo");
      await page.getByLabel("Email").fill("coach@gmail");
      await page.getByLabel("Message").fill("Does Siren do under 7s?");
      await page.getByRole("button", { name: /send message/i }).click();
      await expect(page.getByRole("alert").filter({ hasText: /needs a dot/i })).toBeVisible();
      await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByText(/thanks, message sent/i)).toHaveCount(0);
      await shot(page, "4-email-error-contact");
    } finally {
      await context.close();
    }
  });
});

test.describe("5. a pending invite's role can change", () => {
  test("the coach makes a Manager invite a Parent one, and it joins as Parent", async ({ browser }) => {
    test.setTimeout(120_000);
    const admin = createAdminClient();
    const ownerId = await coachId(admin);
    const team = await makeTeam(admin, { ownerId, sport: "netball" });
    const token = await makeInvite(admin, { teamId: team.id, createdBy: ownerId, role: "game_manager" });
    const person = await newPerson(admin, "r11a-invitee", "Pat Parent");
    const { context, page } = await coachPhone(browser);
    try {
      await gotoStable(page, `/teams/${team.id}/settings#people`);
      const picker = page.getByLabel(/^role for the invite/i);
      await expect(picker).toHaveValue("game_manager");
      await picker.selectOption("parent");
      await expect(page.getByRole("status").filter({ hasText: "The link now joins as Parent." })).toBeVisible({ timeout: 10_000 });
      await shot(page, "5-invite-role-change");
      await expect
        .poll(async () => (await admin.from("team_invites").select("role").eq("token", token).single()).data?.role)
        .toBe("parent");

      await page.reload();
      await waitForHydration(page);
      await expect(page.getByLabel(/^role for the invite/i)).toHaveValue("parent");

      // The link says, and joins as, the new role.
      const { context: joinContext, page: joinPage } = await signedInPhone(browser, person);
      await gotoStable(joinPage, `/join/${token}`);
      await expect(joinPage.getByText(/as parent/i).first()).toBeVisible({ timeout: 10_000 });
      await joinPage.getByRole("button", { name: /accept.*join team/i }).click();
      await expect
        .poll(
          async () =>
            (await admin.from("team_memberships").select("role").eq("team_id", team.id).eq("user_id", person.id).maybeSingle())
              .data?.role,
          { timeout: 20_000 },
        )
        .toBe("parent");
      await joinContext.close();

      // A used invite leaves the list, and its role can't change.
      await page.reload();
      await waitForHydration(page);
      await expect(page.getByLabel(/^role for the invite/i)).toHaveCount(0);
    } finally {
      await context.close();
      await deleteTestUser(admin, person.id);
      await admin.from("teams").delete().eq("id", team.id);
    }
  });

  test("a Manager on the team sees no invites to change", async ({ browser }) => {
    const admin = createAdminClient();
    const ownerId = await coachId(admin);
    const team = await makeTeam(admin, { ownerId, sport: "touch" });
    await makeInvite(admin, { teamId: team.id, createdBy: ownerId, role: "parent" });
    const helper = await newPerson(admin, "r11a-manager", "Mo Manager");
    try {
      await admin.from("team_memberships").insert({ team_id: team.id, user_id: helper.id, role: "game_manager" });
      const { context, page } = await signedInPhone(browser, helper);
      await gotoStable(page, `/teams/${team.id}/settings`);
      await expect(page.getByRole("heading", { name: /team members/i })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel(/^role for the invite/i)).toHaveCount(0);
      // RLS keeps the row from a manager too: an update through their
      // own session changes nothing (team_invites_update_admin).
      const asHelper = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await asHelper.auth.signInWithPassword({ email: helper.email, password: helper.password });
      await asHelper.from("team_invites").update({ role: "admin" }).eq("team_id", team.id);
      const { data: invites } = await admin.from("team_invites").select("role").eq("team_id", team.id);
      expect(invites?.map((i) => i.role)).toEqual(["parent"]);
      await context.close();
    } finally {
      await deleteTestUser(admin, helper.id);
      await admin.from("teams").delete().eq("id", team.id);
    }
  });
});
