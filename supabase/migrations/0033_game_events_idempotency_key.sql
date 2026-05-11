-- Idempotency keys on game_events.
--
-- Slice 5 of the offline-live-game work. Once the native shell goes
-- offline mid-quarter, the Capacitor shell will queue events locally
-- and replay them on reconnect. If the network blips during the
-- replay (or the device retries because the response was lost), we
-- need a way to prevent the same event being inserted twice.
--
-- The client generates a UUID v4 per action and sends it alongside
-- the event payload. The server's insertEvent() helper passes it
-- through. The unique index below enforces de-duplication; any
-- replay collides and the helper returns success-already-applied.
--
-- Backward-compatible: column is nullable, the unique index is
-- partial (only when idempotency_key IS NOT NULL). Existing rows
-- and new rows from callers that don't supply a key keep working
-- exactly as before. The web app's online-only flow will start
-- supplying keys later in slice 5; the native shell will from
-- day one of phase 5d.

alter table public.game_events
  add column idempotency_key uuid;

-- Partial unique index — only enforced when the column is set.
-- Lets pre-existing rows (NULL keys) co-exist with new keyed rows.
create unique index game_events_idempotency_key_uq
  on public.game_events (idempotency_key)
  where idempotency_key is not null;
