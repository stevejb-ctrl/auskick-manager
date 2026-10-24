// "Paste a list" on the squad page (UX plan 2.2). UX audit 23 Oct 2026:
// a netball squad pasted from a club spreadsheet kept the jersey numbers
// in the names ("Sienna Brooks #1"), because netball has no jersey field
// and the paste took each line whole. The numbers are left off now, and
// the preview says so.
//
// Covers src/lib/squadPaste.ts and src/components/squad/BulkAddPlayers.tsx.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test("a netball paste leaves the jersey numbers off the names", async ({ page }) => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "go", name: `NB-Paste-${Date.now() % 1e6}` });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Paste a list" }).click({ timeout: 15_000 });
  await page.getByLabel(/paste your squad/i).fill("Sienna Brooks #1\n2 Ava Smith\nMia Chen, 7");

  const preview = page.getByText(/^3 players:/);
  await expect(preview).toContainText("Sienna Brooks, Ava Smith, Mia Chen");
  await expect(preview).not.toContainText("#");
  await expect(page.getByText(/numbers left off/i)).toBeVisible();

  await page.getByRole("button", { name: "Add 3 players" }).click();
  await expect(page.getByText("Added 3 players.")).toBeVisible({ timeout: 15_000 });
  const { data: rows } = await admin.from("players").select("full_name, jersey_number").eq("team_id", team.id).order("full_name");
  expect(rows).toEqual([
    { full_name: "Ava Smith", jersey_number: null },
    { full_name: "Mia Chen", jersey_number: null },
    { full_name: "Sienna Brooks", jersey_number: null },
  ]);
});
