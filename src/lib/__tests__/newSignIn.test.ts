// /auth/callback tells a new account from a returning one by the auth
// user's timestamps: signup_completed (analytics) and the Telegram
// sign-up ping both hang off it.
import { describe, expect, it } from "vitest";
import { isNewSignIn, signupMethod } from "@/lib/auth/newSignIn";

const T = "2026-10-20T08:00:00.000Z";
const plus = (ms: number) => new Date(Date.parse(T) + ms).toISOString();

describe("isNewSignIn", () => {
  it("knows a first Google or Apple sign-in: made and signed in together", () => {
    expect(isNewSignIn({ created_at: T, email_confirmed_at: T, last_sign_in_at: plus(400) })).toBe(true);
  });

  it("knows a first magic-link sign-in, clicked minutes after the email was sent", () => {
    // The user row is made when the link is sent; the click confirms
    // the address and signs in. The old created_at-only check missed it.
    expect(
      isNewSignIn({ created_at: T, email_confirmed_at: plus(4 * 60_000), last_sign_in_at: plus(4 * 60_000 + 300) }),
    ).toBe(true);
  });

  it("knows a returning coach", () => {
    expect(
      isNewSignIn({ created_at: T, email_confirmed_at: plus(60_000), last_sign_in_at: plus(30 * 86_400_000) }),
    ).toBe(false);
  });

  it("says no when the stamps are missing", () => {
    expect(isNewSignIn({ created_at: T })).toBe(false);
    expect(isNewSignIn({ last_sign_in_at: T })).toBe(false);
  });
});

describe("signupMethod", () => {
  it("names the three ways in, and nothing else", () => {
    expect(signupMethod("email")).toBe("email");
    expect(signupMethod("google")).toBe("google");
    expect(signupMethod("apple")).toBe("apple");
    expect(signupMethod("github")).toBeNull();
    expect(signupMethod(undefined)).toBeNull();
  });
});
