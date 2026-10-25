// Vercel's crons (vercel.json) call their paths with only
// `Authorization: Bearer <CRON_SECRET>` and no session. The middleware
// sent every signed-out request outside its public list to /login, so
// both crons got a 307 and their handlers never ran: no PlayHQ fixture
// sync, and no production demo teams from seed-demo (found 18 Oct 2026).
//
// The paths come from vercel.json, so a cron added there without a
// middleware exemption fails here too.
//
// Covers: src/lib/supabase/middleware.ts (isPublicRoute)
//         + src/app/api/cron/sync-playhq/route.ts
//         + src/app/api/admin/seed-demo/route.ts

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAdminClient } from "../fixtures/supabase";

// Signed out, like the cron.
test.use({ storageState: { cookies: [], origins: [] } });

const cronPaths: string[] = JSON.parse(
  readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
).crons.map((c: { path: string }) => c.path);

function cronSecret(): string {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET must be set (it's in .env.test).");
  }
  return secret;
}

test("vercel.json schedules both crons", () => {
  expect(cronPaths).toEqual(
    expect.arrayContaining(["/api/cron/sync-playhq", "/api/admin/seed-demo"]),
  );
});

test("each cron path reaches its handler, which refuses a request without the secret", async ({ request }) => {
  for (const path of cronPaths) {
    const attempts: Record<string, string>[] = [{}, { authorization: "Bearer not-the-secret" }];
    for (const headers of attempts) {
      const res = await request.get(path, { headers, maxRedirects: 0 });
      expect(res.status(), `${path} ${JSON.stringify(headers)}`).toBe(401);
      expect(await res.json(), path).toEqual({ error: "Unauthorized" });
    }
  }
});

test("the exemption is only the cron paths: the rest of /api/admin still needs sign-in", async ({ request }) => {
  const res = await request.get("/api/admin/not-a-cron", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toContain("/login?next=");
});

test("seed-demo runs for the cron's bearer secret", async ({ request }) => {
  // The route gives any demo team it creates to the first super-admin
  // it finds, which on a shared local DB is any test run's. Delete the
  // ones this run makes, and leave those already there.
  const admin = createAdminClient();
  const demoTeamIds = async () => {
    const { data, error } = await admin.from("teams").select("id").eq("is_demo", true);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((t) => t.id as string));
  };
  const before = await demoTeamIds();

  try {
    const res = await request.get("/api/admin/seed-demo", {
      headers: { authorization: `Bearer ${cronSecret()}` },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // One entry per sport, each either already there or just made.
    const sports = Object.entries(body as Record<string, unknown>).filter(([k]) => k !== "ok");
    expect(sports.map(([k]) => k)).toEqual(expect.arrayContaining(["afl", "netball"]));
    for (const [sport, result] of sports) {
      const r = result as { teamId?: string; skipped?: boolean; players?: number };
      expect(r.teamId, sport).toBeTruthy();
      expect(r.skipped === true || (r.players ?? 0) > 0, sport).toBe(true);
    }
  } finally {
    const created = Array.from(await demoTeamIds()).filter((id) => !before.has(id));
    if (created.length > 0) {
      const { error } = await admin.from("teams").delete().in("id", created);
      if (error) console.warn(`[cron-routes] demo team cleanup: ${error.message}`);
    }
  }
});
