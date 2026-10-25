// Login reached from an invite or a team code (round 2 usability, 24 Oct
// 2026) told helpers and parents "New email? You'll be invited to set up
// a team" and "Parents don't need an account".

import { describe, expect, it } from "vitest";
import { loginContextFor } from "@/lib/auth/loginContext";

describe("loginContextFor", () => {
  it("knows an invite link", () => {
    expect(loginContextFor("/join/0b7c0a52-7a4e-4c1f-9b55-1d3b7b0c2a11")).toEqual({
      kind: "invite",
      token: "0b7c0a52-7a4e-4c1f-9b55-1d3b7b0c2a11",
    });
  });

  it("knows the team-code page", () => {
    expect(loginContextFor("/join-team")).toEqual({ kind: "code" });
  });

  it("is the coach's story everywhere else", () => {
    expect(loginContextFor("/dashboard")).toEqual({ kind: "default" });
    expect(loginContextFor("/join/not-a-token")).toEqual({ kind: "default" });
    expect(loginContextFor("/teams/abc")).toEqual({ kind: "default" });
  });
});
