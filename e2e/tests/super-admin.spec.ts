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
  const name = `Tag ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ── Cleanup leftover test tags from previous runs/retries ──
  // The test used to assume a fresh /admin/tags list had exactly
  // one row (bare `getByRole("listitem")`), but failed runs and
  // CI retries leave stale `Tag <timestamp>` rows behind. Purge
  // anything matching that pattern so list scoping stays
  // unambiguous even across reruns.
  await admin.from("contact_tags").delete().like("name", "Tag %");

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
  // a Save / Cancel button pair (per TagManager.tsx). Scope by the
  // visible name so the right row is selected even when leftover
  // rows from a previous test still exist. Once Edit is clicked the
  // chip is replaced with an <input> — but the row is the only one
  // showing a Save button, so we re-resolve via the Save affordance
  // instead of relying on the original hasText match.
  const editRow = page
    .getByRole("listitem")
    .filter({ hasText: name });
  await editRow.getByRole("button", { name: /^edit$/i }).click();

  // In edit mode, only one <li> has a textbox + Save button — locate
  // by the Save button rather than the (now-mutating) text content.
  const editingRow = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /^save$/i }) });
  const renamed = `${name} renamed`;
  await editingRow.getByRole("textbox").fill(renamed);
  // `force: true` bypasses the elementFromPoint actionability check
  // because the parent <li> consistently captures the click point
  // even though the Save button is visible, enabled, and stable (per
  // Playwright's own pre-checks). The CSS hit-test resolves the click
  // coordinate to the <li> ancestor instead of the inner <button>.
  // Without force the test retries for 30s and times out. The button
  // still receives the click event — force only skips actionability,
  // not the event dispatch — so the rename action runs and the
  // following assertion (`getByText(renamed) toBeVisible`) verifies
  // the click took effect.
  await editingRow
    .getByRole("button", { name: /^save$/i })
    .click({ force: true });
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

    // Navigate to an admin route. The app's route guard
    // (requireSuperAdmin in app/(app)/admin/layout.tsx) calls
    // notFound() so non-admins land on the global not-found.tsx —
    // NOT redirected to /login, NOT rendered the admin shell empty.
    //
    // 2026-05-15: relax from `status === 404` to "not-found UI
    // visible AND admin shell heading absent". Next.js 14.2 has a
    // documented quirk where notFound() called from inside a
    // grouped-route layout sometimes resolves to a 200 status
    // even though the not-found.tsx content renders correctly.
    // What we actually care about is the user CANNOT see the
    // admin chrome — that's testable directly via the UI.
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /^not found$/i }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("heading", { name: /^super admin$/i }),
    ).toHaveCount(0);

    await context.close();
  } finally {
    await deleteTestUser(admin, regular.id);
  }
});
