import { describe, it, expect } from "vitest";
import { renderDecapCallbackHtml } from "@/lib/decap/callbackHtml";

// Locks the Decap OAuth callback's postMessage security contract. These
// assertions fail against the pre-fix inline HTML (which posted the token to
// `e.origin` and announced with "*") and guard against a regression back to it.
describe("renderDecapCallbackHtml — OAuth token postMessage security", () => {
  const successMessage = `authorization:github:success:${JSON.stringify({
    token: "gho_faketoken1234567890",
    provider: "github",
  })}`;
  const html = renderDecapCallbackHtml(successMessage);

  it("ignores inbound messages that are not from our own origin", () => {
    expect(html).toContain("e.origin !== window.location.origin");
  });

  it("posts the token only to window.location.origin, never to e.origin", () => {
    expect(html).toContain(
      "window.opener.postMessage(successMsg, window.location.origin)",
    );
    expect(html).not.toContain("postMessage(successMsg, e.origin)");
  });

  it("never targets a wildcard origin anywhere in the page", () => {
    // The old code used postMessage("authorizing:github", "*").
    expect(html).not.toContain('"*"');
  });

  it("escapes the success message so it round-trips through HTML/JS", () => {
    expect(html).toContain(JSON.stringify(successMessage));
  });
});
