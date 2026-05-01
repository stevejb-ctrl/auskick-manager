#!/usr/bin/env node
// scripts/verify-prod-clone.mjs
//
// Read-only Phase 6 acceptance probe. Connects to a Supabase env via the
// service-role key and runs the Phase 2 §6 acceptance queries from
// .planning/phases/02-schema-reconciliation/02-SCHEMA-PLAN.md §6.
//
// Exits 0 if every automated check passes (warnings tolerated); non-zero
// on any failure. See the per-query notes below for which queries are
// automated here vs which are manual (Plan 06-05 owns the manual half).
//
// Usage:
//   SUPABASE_URL=https://<clone>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \
//   node scripts/verify-prod-clone.mjs
//
// Invariants:
// - READ-ONLY. Zero INSERT / UPDATE / DELETE / RPC. Safe to run against any
//   Supabase env including production (though only the runbook calls it
//   against the prod clone). The reviewer can confirm via
//   `grep -E "\.(insert|update|delete|rpc)\(" scripts/verify-prod-clone.mjs`
//   returning zero matches.
// - No new npm dependencies. Uses @supabase/supabase-js (already in
//   package.json:dependencies at v2.45.4).
// - Defensive against PostgREST exposure drift — queries that hit a non-
//   exposed schema log a WARN and continue; only data-shape failures cause
//   non-zero exit.
//
// Exit codes:
//   0 — every PASS or WARN; no FAIL
//   1 — at least one FAIL (data-shape acceptance violated)
//   2 — env-var validation failed (configuration error, not data error)

import { createClient } from "@supabase/supabase-js";

// --- Env validation ------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set in env.",
  );
  console.error("Usage:");
  console.error("  SUPABASE_URL=https://<clone>.supabase.co \\");
  console.error("  SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \\");
  console.error("  node scripts/verify-prod-clone.mjs");
  process.exit(2);
}

// --- Client --------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Result accumulator --------------------------------------------------

const results = []; // { id, label, status: 'PASS' | 'FAIL' | 'WARN', detail }
let hadFailure = false;

function record(id, label, status, detail) {
  results.push({ id, label, status, detail });
  if (status === "FAIL") hadFailure = true;
  const icon = status === "PASS" ? "[PASS]" : status === "WARN" ? "[WARN]" : "[FAIL]";
  console.log(`${icon} ${id} ${label}: ${status}${detail ? ` - ${detail}` : ""}`);
}

console.log(`Verifying Supabase clone at ${SUPABASE_URL}\n`);

// --- Q1: Migration-list count = 27 (defensive — schema_migrations may not
//          be exposed via PostgREST; runbook Phase B step 4 documents the
//          manual `supabase migration list` fallback) ----------------------

try {
  const { count, error } = await supabase
    .schema("supabase_migrations")
    .from("schema_migrations")
    .select("*", { count: "exact", head: true });

  if (error) {
    record(
      "Q1",
      "Migration-list count = 27",
      "WARN",
      `schema_migrations not queryable via PostgREST (${error.message}); operator MUST verify manually via 'supabase migration list --linked'`,
    );
  } else if (count === 27) {
    record("Q1", "Migration-list count = 27", "PASS", `count=${count}`);
  } else {
    record("Q1", "Migration-list count = 27", "FAIL", `count=${count} (expected 27)`);
  }
} catch (e) {
  record(
    "Q1",
    "Migration-list count = 27",
    "WARN",
    `unexpected exception (${e.message}); operator MUST verify manually via 'supabase migration list --linked'`,
  );
}

// --- Q3: No null sports in teams ----------------------------------------

try {
  const { count, error } = await supabase
    .from("teams")
    .select("*", { count: "exact", head: true })
    .is("sport", null);

  if (error) {
    record("Q3", "select count(*) from teams where sport is null = 0", "FAIL", error.message);
  } else if (count === 0) {
    record("Q3", "select count(*) from teams where sport is null = 0", "PASS", "count=0");
  } else {
    record(
      "Q3",
      "select count(*) from teams where sport is null = 0",
      "FAIL",
      `count=${count} - backfill (0024_multi_sport.sql DEFAULT 'afl') did not populate every row`,
    );
  }
} catch (e) {
  record("Q3", "select count(*) from teams where sport is null = 0", "FAIL", e.message);
}

// --- Q4: Distinct sport contains 'afl' ----------------------------------

try {
  const { data, error } = await supabase.from("teams").select("sport");

  if (error) {
    record("Q4", "select distinct sport from teams contains 'afl'", "FAIL", error.message);
  } else {
    const distinct = [...new Set((data ?? []).map((r) => r.sport))].sort();
    if (distinct.includes("afl")) {
      record(
        "Q4",
        "select distinct sport from teams contains 'afl'",
        "PASS",
        `distinct=[${distinct.join(", ")}]`,
      );
      // Surface unexpected non-afl values for the operator's awareness — not
      // a fail, but worth noting on a fresh clone (prod has only AFL teams)
      const stray = distinct.filter((s) => s !== "afl");
      if (stray.length > 0) {
        console.log(
          `       (note: distinct sports also include [${stray.join(", ")}] - expected on a clone that's seen prior testing; investigate if this is a fresh-from-prod clone since prod has only AFL teams)`,
        );
      }
    } else {
      record(
        "Q4",
        "select distinct sport from teams contains 'afl'",
        "FAIL",
        `distinct=[${distinct.join(", ")}] - no AFL rows present, but prod clone should have AFL data`,
      );
    }
  }
} catch (e) {
  record("Q4", "select distinct sport from teams contains 'afl'", "FAIL", e.message);
}

// --- Q5: Share-token sample (existence + sample for manual /run/[token]
//          check by the human in Plan 06-05) ------------------------------

try {
  const { count: tokenCount, error: countError } = await supabase
    .from("share_tokens")
    .select("*", { count: "exact", head: true });

  if (countError) {
    record("Q5", "share_tokens table queryable", "FAIL", countError.message);
  } else if (tokenCount === 0) {
    record(
      "Q5",
      "share_tokens table queryable",
      "WARN",
      "0 rows - prod clone has no historical share tokens to validate /run/[token] against; manual smoke skips Q2-related share-link check",
    );
  } else {
    const { data: sample, error: sampleError } = await supabase
      .from("share_tokens")
      .select("token, game_id")
      .limit(1);

    if (sampleError) {
      record("Q5", "share_tokens table queryable", "FAIL", sampleError.message);
    } else {
      const tok = sample?.[0]?.token;
      record(
        "Q5",
        "share_tokens table queryable",
        "PASS",
        `${tokenCount} token(s); sample: /run/${tok} (manual: open this URL on the preview to confirm it resolves without RLS errors)`,
      );
    }
  }
} catch (e) {
  record("Q5", "share_tokens table queryable", "FAIL", e.message);
}

// --- Summary ------------------------------------------------------------

console.log("");
console.log("Manual checks NOT covered by this script (Plan 06-05 owns):");
console.log(
  "  Q2 - Load a pre-existing AFL team through the merged code; no RLS errors, no null-sport panics",
);
console.log(
  "  Q5 (manual half) - Open /run/<sample-token> on the preview deploy; confirms /run/[token] resolves without RLS error",
);
console.log("");

const passes = results.filter((r) => r.status === "PASS").length;
const warns = results.filter((r) => r.status === "WARN").length;
const fails = results.filter((r) => r.status === "FAIL").length;
console.log(`Result: ${passes} PASS, ${warns} WARN, ${fails} FAIL\n`);

if (hadFailure) {
  console.error(
    "FAILED - clone does not satisfy Phase 2 §6 acceptance. Investigate before continuing Phase 6.",
  );
  process.exit(1);
}

console.log("OK - Phase 2 §6 automated acceptance criteria satisfied.");
process.exit(0);
