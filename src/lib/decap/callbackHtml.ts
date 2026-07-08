// Builds the HTML returned by the Decap CMS OAuth callback. Extracted from
// the route handler so the postMessage security contract is unit-testable
// without performing a real GitHub token exchange.
//
// SECURITY (audit 2026-07 — why this is its own function): the page receives
// a GitHub access token with `repo` scope and hands it to the CMS popup
// opener. It MUST therefore:
//   1. Ignore any inbound message whose origin is not our own origin, and
//   2. Post the token ONLY to our own origin (window.location.origin).
// An earlier version echoed the token to `e.origin` — the origin of whoever
// messaged the popup — and announced with "*". Because /api/decap/* is a
// public route, an attacker page could open this popup, complete the (silent,
// already-authorized) OAuth handshake, answer the popup's announcement, and
// receive the repo-scoped token → push access → repo/supply-chain takeover.
// The origin checks below close that hole. /cms and this callback are
// same-origin, so the opener is always our own origin and the handshake still
// works.

export function renderDecapCallbackHtml(successMessage: string): string {
  // JSON.stringify the message string before inlining so it round-trips
  // through HTML/JS safely (escapes quotes and slashes).
  const safeSuccessMessage = JSON.stringify(successMessage);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorising…</title></head>
<body>
<script>
(function () {
  var successMsg = ${safeSuccessMessage};
  function receiveMessage(e) {
    // Only trust a message from our own origin (the CMS parent). Reject any
    // foreign opener so the token is never handed to an attacker page.
    if (e.origin !== window.location.origin) return;
    if (!window.opener) return;
    window.opener.postMessage(successMsg, window.location.origin);
    // Defer close so the parent processes the message before the popup goes
    // away — some browsers tear down message ports synchronously on close().
    setTimeout(function () { window.close(); }, 0);
  }
  window.addEventListener("message", receiveMessage, false);
  // Start the handshake against our own origin. /cms and this callback share
  // an origin, so the CMS parent receives it; a cross-origin opener does not.
  if (window.opener) {
    window.opener.postMessage("authorizing:github", window.location.origin);
  } else {
    document.body.innerText =
      "No parent window. Close this tab and try again from /cms.";
  }
})();
</script>
<p>Authorising… You can close this window.</p>
</body></html>`;
}
