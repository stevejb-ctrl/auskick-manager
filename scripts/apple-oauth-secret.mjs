#!/usr/bin/env node
// ─── Apple OAuth secret JWT generator ─────────────────────────
//
// Supabase's Apple provider expects a JWT (not the raw .p8) as the
// "Secret Key" field. The JWT is signed ES256 with the Apple-issued
// .p8 private key and carries claims for the Services ID, Team ID,
// and Key ID. Apple caps the expiry at 6 months — after that the
// Sign in with Apple flow stops working and a fresh JWT must be
// pasted into Supabase Authentication → Providers → Apple → Secret
// Key. Re-run this script to rotate.
//
// Usage:
//   node scripts/apple-oauth-secret.mjs <path-to-AuthKey.p8>
//
// Stdout is the JWT only — pipe to clipboard or redirect to a file:
//   node scripts/apple-oauth-secret.mjs key.p8 > apple-jwt.txt
//
// Renewal checklist (every 6 months):
//   1. Re-run with the original .p8 (the .p8 itself is valid until
//      you revoke it in Apple Developer → Keys; only the JWT
//      expires).
//   2. Paste the new JWT into Supabase → Apple → Secret Key.
//   3. Save. Existing user sessions are unaffected; only new
//      Sign in with Apple logins use the secret.
//
// If the .p8 is rotated (e.g. compromised, someone left the team),
// update KEY_ID below to the new key's ID and re-run with the new
// .p8 path.

import crypto from "node:crypto";
import fs from "node:fs";

// ─── Project constants ────────────────────────────────────────
// These tie this script to a specific Apple Developer team + Sign
// in with Apple key. Update if rotating.
const TEAM_ID = "5XHSRMFBTZ"; // Apple Developer → Membership
const KEY_ID = "B92KKMX69A"; // Apple Developer → Keys → (this key) ID
const SERVICES_ID = "au.com.sirenfooty.app.signin"; // Identifiers → Services IDs

// 6 months — Apple's hard maximum. Anything longer and Apple
// rejects the secret with an opaque "invalid_client" error at
// OAuth time.
const LIFETIME_SECONDS = 60 * 60 * 24 * 180;

const keyPath = process.argv[2];
if (!keyPath) {
  console.error(
    "Usage: node scripts/apple-oauth-secret.mjs <path-to-AuthKey.p8>",
  );
  process.exit(1);
}

let privateKeyPem;
try {
  privateKeyPem = fs.readFileSync(keyPath, "utf8");
} catch (err) {
  console.error(`[error] Could not read ${keyPath}: ${err.message}`);
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const expiresAt = now + LIFETIME_SECONDS;

const header = { alg: "ES256", kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: expiresAt,
  aud: "https://appleid.apple.com",
  sub: SERVICES_ID,
};

const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const signingInput = `${headerB64}.${payloadB64}`;

// ES256 signatures must be raw r || s concatenation (IEEE P1363),
// not the DER encoding Node defaults to. dsaEncoding flips that.
const signature = crypto.sign(
  "SHA256",
  Buffer.from(signingInput),
  { key: privateKeyPem, dsaEncoding: "ieee-p1363" },
);

const signatureB64 = signature.toString("base64url");
const jwt = `${signingInput}.${signatureB64}`;

// JWT to stdout; expiry note to stderr so redirecting stdout to a
// file doesn't capture the metadata line.
process.stdout.write(jwt + "\n");
console.error(
  `\n[ok] Apple OAuth secret JWT generated.\n` +
    `     expires ${new Date(expiresAt * 1000).toISOString().slice(0, 10)} ` +
    `(${Math.round(LIFETIME_SECONDS / 86400)} days)`,
);
