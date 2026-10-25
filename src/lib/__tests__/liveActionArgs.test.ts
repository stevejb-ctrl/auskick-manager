// The write queue appends its idempotency key as the last argument, so
// enqueueLiveAction's args must fill every slot before it. Netball's and
// league's undos both lost the key to a skipped optional parameter
// (Stagehand round 2). `tsc --noEmit` checks these lines: each expected
// error below fails the typecheck if the guard stops catching it.

import { describe, expect, it } from "vitest";
import type { LiveActionArgs } from "@/lib/live/registerLiveActions";
import type { LiveAuth } from "@/lib/types";

const auth: LiveAuth = { kind: "team", teamId: "t1" };

// Every slot filled: fine. An optional slot can take undefined.
const full: LiveActionArgs<"recordConversionAttempt"> = [auth, "g1", "p1", true, 1, 0, {}];
// An undo names the score its strip shows (null: the latest standing).
const undo: LiveActionArgs<"undoLeagueScore"> = [auth, "g1", { key: "op-1" }];
const passUndefined: LiveActionArgs<"recordConversionAttempt"> = [auth, "g1", "p1", true, 1, 0, undefined];
// A handler with no key slot takes exactly its parameters.
const availability: LiveActionArgs<"setAvailability"> = [auth, "g1", "p1", "available"];

// @ts-expect-error a skipped optional slot would catch the key
const skipped: LiveActionArgs<"recordConversionAttempt"> = [auth, "g1", "p1", true, 1, 0];
// @ts-expect-error the caller never passes the key itself
const withKey: LiveActionArgs<"undoLeagueScore"> = [auth, "g1", null, "key"];
// @ts-expect-error an undo with no target slot would put the key there
const noTarget: LiveActionArgs<"undoLeagueScore"> = [auth, "g1"];

describe("enqueueLiveAction args", () => {
  it("are typed per action (see the @ts-expect-error lines)", () => {
    expect([full, undo, passUndefined, availability, skipped, withKey, noTarget]).toHaveLength(7);
  });
});
