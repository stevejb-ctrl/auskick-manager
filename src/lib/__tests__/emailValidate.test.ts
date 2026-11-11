// The one email check every form and server action uses
// (src/lib/email/validate.ts). Stagehand round 11: a typo with no dot in
// the domain ("new.coach@examplecom") was accepted and "a link was sent".
import { describe, expect, it } from "vitest";
import { emailError, isEmail } from "@/lib/email/validate";

describe("emailError", () => {
  it.each([
    "coach@gmail.com",
    "new.coach@example.com.au",
    "first+team@sub.example.org",
    "  padded@example.com  ",
    "o'brien@example.ie",
    "x@xn--80ak6aa92e.com",
    "a@b.co",
  ])("accepts %s", (email) => {
    expect(emailError(email)).toBeNull();
    expect(isEmail(email)).toBe(true);
  });

  it.each([
    ["coach@gmail", /needs a dot, like gmail\.com/],
    ["new.coach@examplecom", /needs a dot/],
    ["a@b", /needs a dot/],
    ["coach @gmail.com", /can't have spaces/],
    ["coach@gm ail.com", /can't have spaces/],
    ["coachgmail.com", /one @/],
    ["coach@@gmail.com", /one @/],
    ["a@b@c.com", /one @/],
    ["@gmail.com", /name before the @/],
    ["coach@", /domain after the @/],
    ["coach@gmail.c", /doesn't look like an email/],
    ["coach@gmail..com", /doesn't look like an email/],
    ["coach@.gmail.com", /doesn't look like an email/],
    ["coach@gmail.com.", /doesn't look like an email/],
    ["coach@-gmail.com", /doesn't look like an email/],
    ["coach@gmail.123", /doesn't look like an email/],
    [".coach@gmail.com", /doesn't look like an email/],
    ["co..ach@gmail.com", /doesn't look like an email/],
    ["coach,1@gmail.com", /doesn't look like an email/],
    [`${"a".repeat(250)}@example.com`, /doesn't look like an email/],
  ])("rejects %s", (email, message) => {
    expect(emailError(email)).toMatch(message);
    expect(isEmail(email)).toBe(false);
  });

  it("asks for an address when there isn't one", () => {
    expect(emailError("")).toBe("Enter an email address.");
    expect(emailError("   ")).toBe("Enter an email address.");
    expect(emailError(null)).toBe("Enter an email address.");
    expect(isEmail(undefined)).toBe(false);
  });
});
