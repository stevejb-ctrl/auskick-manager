# send-push

Service-role Edge Function that fans a push notification out to every
device a user has registered in `device_tokens`.

## Required secrets

| Secret                           | Source                                           |
| -------------------------------- | ------------------------------------------------ |
| `SUPABASE_URL`                   | auto-populated by the Functions runtime          |
| `SUPABASE_SERVICE_ROLE_KEY`      | auto-populated by the Functions runtime          |
| `FIREBASE_SERVICE_ACCOUNT_JSON`  | full Firebase service-account JSON, single line  |

Set the Firebase secret with:

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat firebase-sa.json)"
```

The JSON comes from **Firebase Console → Project settings → Service
accounts → Generate new private key**. Treat it as a credential —
it grants full FCM send access.

## Invocation

Service-role only. The function rejects callers whose
`Authorization` header isn't `Bearer <service-role-key>`. Typical
caller is a Vercel server action that already has access to
`SUPABASE_SERVICE_ROLE_KEY`:

```ts
await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    user_id: recipient.id,
    title: "Invite accepted",
    body: `${name} joined ${teamName} as ${role}.`,
    data: { team_id: teamId },
  }),
});
```

## Response shape

```json
{ "ok": true, "sent": 2, "failed": 0 }
```

`sent` counts successful FCM API calls. `failed` counts errors. If
FCM reports a token as `UNREGISTERED` or `INVALID_ARGUMENT`, the
function deletes that row from `device_tokens` so subsequent calls
skip the dead device.

## Deploying

```bash
supabase functions deploy send-push --project-ref <project-ref>
```

CI deploy is a future task — for now it's a manual step on a fresh
deploy or after edits.

## Limitations (slice 4 v1)

- iOS rows are skipped. APNs HTTP/2 lands when iOS scaffolds.
- No retry logic. A network blip on the FCM call surfaces as
  `failed: 1` in the response; the caller decides whether to retry.
- No batching. Each device token is one FCM POST. Fine for users
  with 1–3 devices; revisit if we ever hit the 500-token-per-batch
  size that justifies FCM's `messages:batch` endpoint.
