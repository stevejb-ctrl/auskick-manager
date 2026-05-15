// Coverage for the auth dedup primitive (src/lib/auth/userIdHeader.ts).
// Pins:
//   1. The exported header name matches what middleware sets on the
//      forwarded request — drift here would silently re-introduce
//      the second supabase.auth.getUser() round-trip (-150-400ms per
//      action).
//   2. `readValidatedUserId` returns the id when the header is set.
//   3. Returns null when the header is absent OR empty (so missing
//      middleware ⇒ "Unauthenticated" rather than a runtime crash).
//
// The middleware-side strip-then-set guarantee (preventing a client
// from smuggling an arbitrary user id) is enforced in middleware.ts
// itself; this test only covers the reader half of the contract.

import { describe, expect, test, vi, beforeEach } from "vitest";

// next/headers is a Next.js runtime stub at unit-test time. We mock
// it to feed in arbitrary header values per test.
const headerStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => headerStore.get(name.toLowerCase()) ?? null,
  }),
}));

import { SIREN_USER_ID_HEADER, readValidatedUserId } from "../userIdHeader";

beforeEach(() => {
  headerStore.clear();
});

describe("SIREN_USER_ID_HEADER", () => {
  test("is the literal string middleware writes", () => {
    // If you change this, update src/lib/supabase/middleware.ts in
    // the same commit — that's the only writer.
    expect(SIREN_USER_ID_HEADER).toBe("x-siren-user-id");
  });
});

describe("readValidatedUserId", () => {
  test("returns the user id when middleware has set it", () => {
    headerStore.set("x-siren-user-id", "user_abc123");
    expect(readValidatedUserId()).toBe("user_abc123");
  });

  test("returns null when the header is absent", () => {
    expect(readValidatedUserId()).toBeNull();
  });

  test("returns null when the header is empty (treats as no session)", () => {
    headerStore.set("x-siren-user-id", "");
    expect(readValidatedUserId()).toBeNull();
  });
});
