# Ground Control — Field CRM

Single-file app: everything (markup, styles, logic) lives in `index.html`. No build step, no
package.json — it's deployed as a static site (Netlify) straight from this file.

For full project context (sales methodology, feature inventory, data model, "why this exists")
see **`PRD.md`** — this file is deliberately just the operational rules.

## Workflow

- Work directly on `main`. Push straight to `origin/main` — no feature branches, no PRs.
- Netlify auto-deploys on push to `main`.
- Test changes locally by opening `index.html` in a browser (or `python3 -m http.server`) before
  pushing.

## Cloud sync

The app connects to a Supabase project automatically — the URL and anon key are hardcoded as
module-level constants near the top of the `<script>` block (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`). There is no user-facing setup step; every device syncs the moment the app
loads.

Tables (all with the same open RLS policy, `using(true) with check(true)`):
- `leads` — the pipeline data. `deleted_at` is a soft-delete marker (never hard-deleted by the
  app); `sector` is a generated column auto-extracted from `area`; `first_contacted_at` is set
  the first time a lead's stage moves off `pipeline`.
- `app_admin` — a singleton row (`id=1`) holding the admin username + salted password hash for
  the login gate.
- `activity_log` — canonical create/update/delete/error audit trail across all leads. Written
  from every mutation path; text-field edits are diffed and coalesced on the same debounce as
  autosave so it isn't one row per keystroke. This is what the Metrics tab reads from.
- `daily_manual_stats` — one row per day, `doors`/`convos` counts logged manually from the
  Metrics tab (the two field-activity numbers that don't reliably produce a lead row).
- `push_subscriptions` — one row per device with reminder notifications turned on (open RLS,
  same as above).
- `app_secrets` — singleton row holding the Web Push VAPID keypair. RLS enabled with **no
  policies** — unlike everything else in this project, this one is intentionally not
  client-readable. Only the `send-reminders` edge function's service-role key can read it.

Full schema and the reasoning behind each column lives in `PRD.md` — this is just the list.

## PWA + background reminders

The app is installable (`manifest.webmanifest` + `service-worker.js` at the repo root, icons in
`icons/`) and pushes real background notifications for due/overdue follow-ups via a Supabase
Edge Function (`send-reminders`) on a 15-minute `pg_cron` schedule — this fires even with the
app fully closed, not just while it's open in a tab. See "PWA & background push reminders" in
`PRD.md` for the full mechanics. When touching this:
- The service worker only caches the app shell and handles `push`/`notificationclick` — it does
  not intercept Supabase or CDN requests. Keep it that way; don't make it a general request
  proxy.
- The VAPID private key lives only in the `app_secrets` table (service-role-only), never in
  client code or this repo. The public key is a real constant in `index.html` (`VAPID_PUBLIC_KEY`) —
  that's expected, VAPID public keys are meant to be public.
- Regenerating icons requires `@napi-rs/canvas` (`npm i @napi-rs/canvas` in a scratch dir, run
  `node scripts/generate-icons.js`, then delete `node_modules` again) — it's not a committed
  dependency since the site has no build step.

## Security scope — read this before assuming the login gate is "real" access control

The admin login (username + password, salted SHA-256 client-side) is an **app-level UI gate**
meant for normal day-to-day use by the field team — it stops someone from casually opening the
app and seeing the pipeline. It is **not hardened security**:

- The anon key is embedded in the client and the `leads`/`app_admin` RLS policies are both
  `using(true)` — wide open. Anyone with devtools access to the deployed site can read the
  Supabase URL + anon key out of the page source and query both tables directly over the
  Supabase REST API, completely bypassing the login screen.
- The login only gates the *UI*. It does not gate the *data*.
- This is an accepted, intentional tradeoff for an internal single-team tool — it's fine as long
  as nobody with "real technical intent" is a threat you're defending against.

**If real access control is ever needed**, the follow-up is proper Supabase Auth (real user
accounts) with RLS policies scoped to `auth.uid()` / authenticated roles instead of `using(true)`.
That's a meaningfully bigger change (server-side session verification, migrating the anon-key
model) — flag it as future work, don't build it speculatively.

## Data retention — this is a permanent archive, not just a pipeline

Nothing the app does is a hard delete. "Delete" on a lead is a soft delete (`deleted_at`) —
the lead is hidden from the default Board/Follow-ups view but stays recoverable via the
Archive toggle, since the whole point of this tool is to be a searchable lead/discovery bank,
not just an active-pipeline view. A genuine hard delete (GDPR request, duplicate cleanup) is a
manual SQL statement in the Supabase SQL editor, deliberately not exposed in the app.
