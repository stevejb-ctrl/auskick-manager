// Invite emails carry the team's own sport's brand (cross-sport audit,
// 14 Oct 2026): a netball or league team's invite said "Siren Footy"
// in the subject, body, sign-off and sender.

import { describe, expect, it } from "vitest";
import { buildInviteEmail, buildMemberAddedEmail } from "@/lib/email/inviteTemplate";
import { senderAs } from "@/lib/resend";

const base = { teamName: "Kotara Koalas", roleLabel: "Game manager", roleSummary: "Runs the game." };

describe("invite emails", () => {
  for (const brandName of ["Siren Netball", "Siren League"]) {
    it(`a ${brandName} invite never says Siren Footy`, () => {
      const invite = buildInviteEmail({ ...base, inviterName: "Sam", joinUrl: "https://x/join/t", brandName });
      const added = buildMemberAddedEmail({ ...base, adminName: "Sam", teamUrl: "https://x/teams/1/games", brandName });
      for (const email of [invite, added]) {
        expect(email.subject).toContain(brandName);
        expect(email.text).toContain(`— ${brandName}`);
        expect(email.html).toContain(`— ${brandName}`);
        expect(`${email.subject}${email.text}${email.html}`).not.toMatch(/footy/i);
      }
    });
  }

  it("sends as the brand from the configured address", () => {
    expect(senderAs("Siren Netball")).toMatch(/^Siren Netball <[^<>\s]+@[^<>\s]+>$/);
  });
});
