// The parent availability link (round 2 usability, 24 Oct 2026; migration
// 0072). The wizard promised "Share availability with parents so you know
// who's playing", but nothing could be shared: no message, no link, and a
// parent who joined by code had no Availability button. Each game now has
// its own link (games.availability_token) that a parent opens from the
// group chat, without an account, to mark their child In or Out; the
// coach sees who answered (game_availability.replied_at).
//
// Covers: supabase/migrations/0072_parent_availability_link.sql
//         src/app/availability/[token]/* (the parent's page + answer action)
//         src/components/games/AskAvailabilityButton.tsx
//         src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx + availability/page.tsx
//         src/components/games/AvailabilityList.tsx (Replied, no Mark all in for parents)

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeGame, makePlayers, makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { anonPhone, coachId, coachPhone, newPerson, signedInPhone } from "../helpers/people";

test.describe.configure({ mode: "parallel" });

test("a coach shares a game's availability link; a parent marks their child Out without an account", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Kestrels" });
  // A new game starts everyone In (seedDefaultAvailability); the factory
  // doesn't, so seed one kid that way.
  await admin
    .from("game_availability")
    .insert({ game_id: game.id, player_id: players[0].id, status: "available", updated_by: ownerId });

  // The coach's game page: one button to ask, with the message and link.
  const { context: coachContext, page: coachPage } = await coachPhone(browser);
  await gotoStable(coachPage, `/teams/${team.id}/games/${game.id}`);
  await coachPage.getByRole("button", { name: /ask parents who.s in/i }).click();
  const ask = coachPage.getByRole("dialog", { name: /ask parents who.s in/i });
  await expect(ask).toContainText(`${team.name} v Kew Kestrels`);
  const url = await ask.getByRole("textbox", { name: /availability link/i }).inputValue();
  expect(url).toMatch(/\/availability\/[0-9a-f-]{36}$/);
  await expect(ask.getByRole("button", { name: /copy message/i })).toBeVisible();
  const path = new URL(url).pathname;

  // The parent's phone, signed out: the game, the kids, In or Out.
  const { context: parentContext, page: parentPage } = await anonPhone(browser);
  await gotoStable(parentPage, path);
  await waitForHydration(parentPage);
  await expect(parentPage.getByRole("heading", { level: 1 })).toContainText(`${team.name} v Kew Kestrels`);
  const kid = players[2].full_name;
  const kidRow = parentPage.getByRole("group", { name: `${kid} availability` });
  // Nobody's answered for this kid: neither In nor Out.
  await expect(kidRow.getByRole("button", { name: /^out$/i })).toHaveAttribute("aria-pressed", "false");
  await expect(kidRow.getByRole("button", { name: /^in$/i })).toHaveAttribute("aria-pressed", "false");
  await kidRow.getByRole("button", { name: /^out$/i }).click();
  await expect(kidRow.getByRole("button", { name: /^out$/i })).toHaveAttribute("aria-pressed", "true");
  // No coach tools on the parent's page.
  await expect(parentPage.getByRole("button", { name: /mark all in/i })).toHaveCount(0);
  await expect(parentPage.getByText(/add a fill-in|fill-in/i)).toHaveCount(0);

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_availability")
        .select("status, replied_at")
        .eq("game_id", game.id)
        .eq("player_id", players[2].id)
        .single();
      return data ? `${data.status}:${data.replied_at ? "replied" : "-"}` : null;
    }, { timeout: 10_000 })
    .toBe("unavailable:replied");

  // Confirming the In a new game starts with is an answer too.
  const seeded = parentPage.getByRole("group", { name: `${players[0].full_name} availability` });
  await expect(seeded.getByRole("button", { name: /^in$/i })).toHaveAttribute("aria-pressed", "true");
  await seeded.getByRole("button", { name: /^in$/i }).click();
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_availability")
        .select("status, replied_at")
        .eq("game_id", game.id)
        .eq("player_id", players[0].id)
        .single();
      return data ? `${data.status}:${data.replied_at ? "replied" : "-"}` : null;
    }, { timeout: 10_000 })
    .toBe("available:replied");

  // Still Out after a reload: it's saved, not just shown.
  await parentPage.reload();
  await expect(
    parentPage.getByRole("group", { name: `${kid} availability` }).getByRole("button", { name: /^out$/i }),
  ).toHaveAttribute("aria-pressed", "true");
  await parentContext.close();

  // The coach's availability list shows the answer and who replied.
  await gotoStable(coachPage, `/teams/${team.id}/games/${game.id}/availability`);
  const coachRow = coachPage.getByRole("listitem").filter({ hasText: kid });
  await expect(coachRow.getByRole("button", { name: /^out$/i })).toHaveAttribute("aria-pressed", "true");
  await expect(coachRow).toContainText(/replied/i);
  await expect(coachPage.getByText(/2 of 8 replied/i)).toBeVisible();
  await coachContext.close();
});

test("the link closes at kickoff, and a link that isn't a game's says so", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const { data: row } = await admin.from("games").select("availability_token").eq("id", game.id).single();
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  const { context, page } = await anonPhone(browser);
  await gotoStable(page, `/availability/${row!.availability_token}`);
  await expect(page.getByText(/this game has started/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^out$/i })).toHaveCount(0);

  await gotoStable(page, `/availability/${crypto.randomUUID()}`);
  await expect(page.getByText(/this link isn.t valid/i)).toBeVisible();
  await context.close();
});

test("a parent member marks availability from the game page, without Mark all in", async ({ browser }) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const parent = await newPerson(admin, "member-parent-avail", "Pat Parent");
  try {
    await admin.from("team_memberships").insert({ team_id: team.id, user_id: parent.id, role: "parent" });
    const { context, page } = await signedInPhone(browser, parent);
    await gotoStable(page, `/teams/${team.id}/games/${game.id}`);
    await page.getByRole("link", { name: /^availability$/i }).click();
    await page.waitForURL(/\/availability$/);
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: /mark all in/i })).toHaveCount(0);
    // A parent doesn't get the coach's share tools either.
    await expect(page.getByRole("button", { name: /ask parents who.s in/i })).toHaveCount(0);
    const kidRow = page.getByRole("group", { name: `${players[0].full_name} availability` });
    await kidRow.getByRole("button", { name: /^out$/i }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("game_availability")
          .select("status, replied_at")
          .eq("game_id", game.id)
          .eq("player_id", players[0].id)
          .single();
        return data ? `${data.status}:${data.replied_at ? "replied" : "-"}` : null;
      }, { timeout: 10_000 })
      .toBe("unavailable:replied");
    await context.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }
});
