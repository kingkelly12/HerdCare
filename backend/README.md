# HerdCare backend (not yet built)

The frontend (`../frontend`) is fully functional without this — it is offline-first and
reads/writes directly to an on-device SQLite database via Drizzle ORM. Nothing in the app
blocks on a network request.

This folder is reserved for the future sync/backup service: a thin API that lets a farmer's
records follow them across devices and survive a lost phone. When it gets built, the plan is:

- A REST or tRPC API (Node.js) in front of a Postgres database, mirroring the same four
  tables as the frontend's local schema (`animals`, `breeding_events`, `birth_records`,
  `health_logs`) plus a `farm_id`/`user_id` for multi-tenancy.
- The frontend gains a sync module that pushes local writes (keyed by the same UUIDs already
  generated on-device) and pulls remote changes on a schedule or when connectivity returns —
  last-write-wins or a simple `updated_at` comparison, since conflicts should be rare for a
  single-farmer field-logging app.
- Auth (e.g. phone number + OTP, common for this user base) issuing a token the frontend
  stores and attaches to sync requests.

Until this exists, treat the frontend's local database as the source of truth.
