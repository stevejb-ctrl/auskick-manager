import { describe, expect, it } from "vitest";
import { authErrorText } from "@/lib/auth/authErrorText";

describe("authErrorText", () => {
  it("keeps auth's own readable refusals", () => {
    expect(authErrorText({ message: "Invalid login credentials", status: 400 }, "sign-in")).toBe(
      "Invalid login credentials",
    );
  });

  it.each([
    [{ message: "{}", status: 504 }],
    [{ message: "{}", status: 0 }],
    [{ message: "", status: undefined }],
    [{ message: '{"error":"upstream"}', status: 502 }],
    [{ message: "Gateway Timeout", status: 504 }],
  ])("a gateway's body %j becomes words", (error) => {
    const text = authErrorText(error, "send");
    expect(text).toMatch(/couldn't send the link/i);
    expect(text).not.toContain("{");
  });

  it("names a sign-in failure as a sign-in", () => {
    expect(authErrorText({ message: "{}", status: 504 }, "sign-in")).toMatch(/couldn't sign you in/i);
  });

  it("says to wait when there have been too many", () => {
    expect(authErrorText({ message: "email rate limit exceeded", status: 429 }, "send")).toMatch(/wait a minute/i);
    expect(authErrorText({ message: "For security purposes, you can only request this after 60 seconds.", status: 429 }, "send")).toMatch(/wait a minute/i);
  });
});
