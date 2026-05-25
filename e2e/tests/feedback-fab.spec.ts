// Covers the always-visible feedback / presales FAB.
//
//   1. Authenticated coach taps the FAB on /dashboard → submits a
//      message → DB row has kind='feedback', user_id populated.
//   2. Anonymous marketing visitor taps the FAB on / → types email +
//      message → DB row has kind='presales', user_id IS NULL.
//   3. FAB is path-hidden on /live (every pixel matters mid-game).
//   4. Invalid email in the presales form surfaces an inline error and
//      no DB row is written.
//   5. Honeypot non-empty value silently succeeds with NO DB row +
//      no Telegram (bot gets a 200 but learns nothing).
//
// Telegram delivery is stubbed by the existing "env-unset = no-op"
// convention in src/lib/notifications/telegram.ts. .env.test leaves
// TELEGRAM_BOT_TOKEN unset, so sendTelegramNotification returns false
// without hitting the API — the DB persistence path is fully
// exercised. Same convention used by the signup + team-created tests.
//
// Covers: src/lib/feedback/actions.ts (submitFeedback)
//         + src/components/feedback/FeedbackFab.tsx
//         + mount in src/app/(app)/layout.tsx
//         + mount in src/app/(marketing)/layout.tsx
//         + migration 0045_feedback.sql

import { test, expect } from "@playwright/test";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
} from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

// Tag the message bodies with the test stamp so parallel cases never
// collide on the SELECT-by-message lookup. 5+ chars satisfies the
// MESSAGE_MIN bound in the server action.
function stamp(): string {
  return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("authenticated feedback: FAB submit persists kind='feedback' + user_id", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const sessionStamp = stamp();
  const user = await createTestUser(admin, {
    email: `fb-auth-${sessionStamp}@siren.test`,
    password: "fb-auth-test-pw-1234",
    fullName: "FB Auth Tester",
  });

  try {
    // Fresh context so we don't inherit the chromium project's
    // super-admin session — this case is specifically about a regular
    // authenticated user's feedback submission.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(user.email);
    await page.getByTestId("login-password").fill(user.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/(dashboard|teams\/new|welcome)/, {
      timeout: 15_000,
    });

    await page.goto("/dashboard");
    await page.getByTestId("feedback-fab-feedback").click();

    const message = `Loving the short-squad fix ${sessionStamp}`;
    await page.getByLabel(/^message$/i).fill(message);
    await page.getByRole("button", { name: /send feedback/i }).click();

    await expect(page.getByText(/thanks, steve has it/i)).toBeVisible({
      timeout: 5_000,
    });

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("feedback")
            .select("kind, user_id, email, page_url")
            .eq("message", message)
            .maybeSingle();
          return data;
        },
        { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
      )
      .toMatchObject({
        kind: "feedback",
        user_id: user.id,
        email: user.email,
        // /dashboard page_url. Don't pin the full string — Next.js may
        // strip or preserve a trailing slash across versions.
        page_url: expect.stringMatching(/^\/dashboard\/?$/),
      });

    await context.close();
  } finally {
    await admin.from("feedback").delete().eq("user_id", user.id);
    await deleteTestUser(admin, user.id);
  }
});

test("presales: anonymous visitor FAB submit persists kind='presales' with NULL user_id", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const sessionStamp = stamp();

  // Anonymous context — no Supabase session.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await page.getByTestId("feedback-fab-presales").click();

    const replyEmail = `prospect-${sessionStamp}@example.com`;
    const message = `Curious about rugby league support ${sessionStamp}`;

    await page.getByLabel(/your email/i).fill(replyEmail);
    await page.getByLabel(/^message$/i).fill(message);
    await page.getByRole("button", { name: /send question/i }).click();

    await expect(page.getByText(/thanks, we'?ll be in touch/i)).toBeVisible({
      timeout: 5_000,
    });

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("feedback")
            .select("kind, user_id, email")
            .eq("message", message)
            .maybeSingle();
          return data;
        },
        { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
      )
      .toMatchObject({
        kind: "presales",
        user_id: null,
        email: replyEmail,
      });
  } finally {
    await admin.from("feedback").delete().eq("email", `prospect-${sessionStamp}@example.com`);
    await context.close();
  }
});

test("FAB is hidden on /live routes (every pixel matters mid-game)", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const sessionStamp = stamp();
  const user = await createTestUser(admin, {
    email: `fb-live-${sessionStamp}@siren.test`,
    password: "fb-live-test-pw-1234",
    fullName: "FB Live Tester",
  });

  try {
    const team = await makeTeam(admin, { ownerId: user.id });
    await makePlayers(admin, { teamId: team.id, ownerId: user.id });
    const game = await makeGame(admin, { teamId: team.id, ownerId: user.id });

    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(user.email);
    await page.getByTestId("login-password").fill(user.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/(dashboard|teams\/new|welcome)/, {
      timeout: 15_000,
    });

    // Confirm the FAB IS visible on /dashboard first — guards against
    // a false-negative on the /live assertion (e.g. component name
    // typo would silently make this test pass).
    await page.goto("/dashboard");
    await expect(page.getByTestId("feedback-fab-feedback")).toBeVisible({
      timeout: 5_000,
    });

    // Navigate to the live page. Even before lineup_set fires the page
    // renders SOMETHING (the LineupPicker); the FAB's path-hide runs
    // off pathname only, so we don't need a fully-set-up game.
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    // Wait for hydration so the client-side `usePathname` check has
    // had a chance to run and remove the FAB from the DOM.
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("feedback-fab-feedback")).toHaveCount(0);

    await context.close();
  } finally {
    // Game cascade-deletes game_events; explicit team cleanup is fine.
    await admin.from("feedback").delete().eq("user_id", user.id);
    await deleteTestUser(admin, user.id);
  }
});

test("presales: invalid email surfaces inline error, no DB row", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const sessionStamp = stamp();

  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await page.getByTestId("feedback-fab-presales").click();

    const badEmail = "not-an-email";
    const message = `Should never persist ${sessionStamp}`;

    // Bypass the browser's built-in HTML5 email validator so the click
    // actually reaches the server action — that's the layer we want to
    // assert the error message from. `required` attribute is still
    // there for real users; this is just to drive the path we care
    // about under test.
    await page.getByLabel(/your email/i).evaluate(
      (el, value) => ((el as HTMLInputElement).value = value),
      badEmail,
    );
    await page.getByLabel(/^message$/i).fill(message);
    await page.getByLabel(/your email/i).evaluate((el) => {
      (el as HTMLInputElement).setAttribute("type", "text");
    });
    await page.getByRole("button", { name: /send question/i }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /valid email/i }),
    ).toBeVisible({ timeout: 5_000 });

    // No DB row should exist for this message.
    const { data: rows } = await admin
      .from("feedback")
      .select("id")
      .eq("message", message);
    expect(rows ?? []).toHaveLength(0);
  } finally {
    await context.close();
  }
});

test("honeypot: filled `website` field silently succeeds with NO DB row", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const sessionStamp = stamp();

  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await page.getByTestId("feedback-fab-presales").click();

    const replyEmail = `bot-${sessionStamp}@example.com`;
    const message = `Bot trap ${sessionStamp}`;

    await page.getByLabel(/your email/i).fill(replyEmail);
    await page.getByLabel(/^message$/i).fill(message);
    // Honeypot: bots auto-fill every field including the hidden one.
    // Simulate that by setting the input's value directly (it's not
    // visible to users, but it IS in the DOM).
    await page.locator("#feedback-website").evaluate((el) => {
      (el as HTMLInputElement).value = "http://spammy.example";
    });
    await page.getByRole("button", { name: /send question/i }).click();

    // Bot sees "success" — we want the bot to think the post worked.
    await expect(page.getByText(/thanks, we'?ll be in touch/i)).toBeVisible({
      timeout: 5_000,
    });

    // …but the DB has no record of it.
    const { data: rows } = await admin
      .from("feedback")
      .select("id")
      .eq("email", replyEmail);
    expect(rows ?? []).toHaveLength(0);
  } finally {
    await context.close();
  }
});
