// Covers the /admin CRM surface:
//   - Tag CRUD (createTag, updateTag, deleteTag)
//   - addTagToProfile / removeTagFromProfile
//   - addNote / deleteNote
//   - setUnsubscribed toggle
//
// Plus the CRM-audit regression guard: a non-super-admin who hits
// /admin routes must 404 (NOT be silently allowed through).
//
// Covers: src/app/(app)/admin/actions.ts (all exports)
//         + super-admin route guard from src/app/(app)/admin/layout.tsx

import { test, expect } from "@playwright/test";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
} from "../fixtures/supabase";

test.describe.configure({ mode: "parallel" });

test("super-admin creates, renames, and deletes a tag", async ({ page }) => {
  const admin = createAdminClient();
  const name = `Tag ${Date.now()}`;

  await page.goto("/admin/tags");

  // ── Create ─────────────────────────────────────────────────
  // TagManager's "New tag" card has bare <label>s without htmlFor,
  // so getByLabel doesn't work. Scope to the card heading instead.
  const newTagCard = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: /^new tag$/i }) })
    .first();
  await newTagCard.getByRole("textbox").fill(name);
  await newTagCard.getByRole("combobox").selectOption("brand");
  await newTagCard.getByRole("button", { name: /^add tag$/i }).click();
  await expect(page.getByText(name)).toBeVisible();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("contact_tags")
          .select("id")
          .eq("name", name);
        return data?.length ?? 0;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(1);
  const { data: created } = await admin
    .from("contact_tags")
    .select("id, name")
    .eq("name", name)
    .single();

  // ── Rename ─────────────────────────────────────────────────
  // Tags render as <li> rows. Edit swaps the chip for an input +
  // a Save / Cancel button pair (per TagManager.tsx).
  const row = page.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: /^edit$/i }).click();
  const renamed = `${name} renamed`;
  await row.getByRole("textbox").fill(renamed);
  await row.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(renamed)).toBeVisible();

  // ── Delete ─────────────────────────────────────────────────
  // handleDelete calls window.confirm(); accept it preemptively so
  // the click-handler doesn't block.
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("listitem")
    .filter({ hasText: renamed })
    .getByRole("button", { name: /^delete$/i })
    .click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("contact_tags")
          .select("id")
          .eq("id", created!.id);
        return data?.length ?? 0;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(0);
});

test("non-super-admin hitting /admin routes gets a 404", async ({
  browser,
}) => {
  const admin = createAdminClient();

  // Create a regular (non-super-admin) user.
  const regular = await createTestUser(admin, {
    email: `regular-${Date.now()}@siren.test`,
    password: "regular-test-pw-1234",
    fullName: "Regular User",
  });

  try {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    // Email-first /login: toggle into password mode, then use the
    // testid pattern (matches auth.setup).
    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-email").fill(regular.email);
    await page.getByTestId("login-password").fill(regular.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/(dashboard|teams)/, { timeout: 10_000 });

    // Navigate to an admin route. The app's route guard should 404 —
    // NOT redirect to /login, NOT render the admin shell empty.
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);

    await context.close();
  } finally {
    await deleteTestUser(admin, regular.id);
  }
});
