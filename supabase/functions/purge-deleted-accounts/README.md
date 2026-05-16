# purge-deleted-accounts

Nightly purge of accounts whose 30-day soft-delete grace period has
elapsed. Required for Apple App Store guideline 5.1.1(v) — users
delete their account from inside the app, and the actual wipe must
happen within "a reasonable time" after that.

## What it does

For every `profiles` row where `deletion_scheduled_for <= now()`:

1. Walks the user's `admin` memberships. For teams where they are the
   sole admin, deletes the team (which cascades players, games,
   game_events, game_availability, game_lineup_drafts via FK
   `ON DELETE CASCADE`).
2. Hard-deletes the auth user via `auth.admin.deleteUser`. Profile +
   remaining memberships + device_tokens + CRM rows cascade through
   the auth → profiles foreign-key chain. Audit-trail pointers
   (`created_by`, `accepted_by`, …) get nulled out per migration
   `0034_account_deletion.sql`.

Logic mirrors `src/lib/account/purge.ts` (used by the Node-side
`scripts/purge-deleted-accounts.mjs` for ad-hoc runs).

## Deploy

```bash
supabase functions deploy purge-deleted-accounts
```

## Schedule

Daily at a quiet hour. Either:

- **Supabase Cron**: Dashboard → Database → Cron jobs → "Create".
  Schedule: `0 3 * * *` (03:00 UTC). HTTP target:
  `https://<project>.supabase.co/functions/v1/purge-deleted-accounts`,
  method `POST`, header `Authorization: Bearer <SERVICE_ROLE_KEY>`.

- **pg_cron + http extension**:

  ```sql
  select cron.schedule(
    'purge-deleted-accounts-daily',
    '0 3 * * *',
    $$ select net.http_post(
         url := 'https://<project>.supabase.co/functions/v1/purge-deleted-accounts',
         headers := jsonb_build_object(
           'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
         )
       ); $$
  );
  ```

## Manual run

```bash
curl -X POST "$SUPABASE_URL/functions/v1/purge-deleted-accounts" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Returns JSON summary: `{ ok, scanned, purged, errors, results }`.

## Auth model

`Authorization: Bearer <SERVICE_ROLE_KEY>` is the only accepted auth.
Requests without it return 401. No public surface — only Supabase's
cron infrastructure and ops/dev tooling can invoke this.
