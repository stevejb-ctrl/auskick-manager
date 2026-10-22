// The privacy policy has to name every service the code sends personal
// data to, and say who can see a squad. A copy audit (21 Oct 2026)
// found §5 missing Apple sign-in, Resend, Firebase and Telegram, and §3
// saying only admins and game managers can see players, though the
// players RLS policy (is_team_member) lets parents read them too.
//
// Covers: src/app/(marketing)/privacy/page.tsx.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const POLICY = readFileSync(
  fileURLToPath(new URL("../../app/(marketing)/privacy/page.tsx", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("privacy policy", () => {
  it("names every service that receives personal data", () => {
    // Where each one is used: supabase (everything), Vercel (hosting),
    // Google (sign-in, GA4), PostHog (analytics), Apple (sign-in),
    // Resend (src/lib/resend.ts), Firebase (supabase/functions/send-push),
    // Telegram (src/lib/notifications/telegram.ts).
    for (const service of [
      "Supabase",
      "Vercel",
      "Google (sign-in)",
      "Google Analytics 4",
      "PostHog",
      "Apple (sign-in)",
      "Resend",
      "Firebase Cloud Messaging",
      "Telegram",
    ]) {
      expect(POLICY, service).toContain(`<strong>${service}`);
    }
  });

  it("says parents on a team can see its players, as the database allows", () => {
    expect(POLICY).not.toContain("Only authorised team members (admins, game managers) can view");
    expect(POLICY).toContain("parents who join with the team&rsquo;s code");
    expect(POLICY).toContain("runner link");
  });
});
