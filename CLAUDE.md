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

## Documentation & QA gate — before every push

Documentation and QA are part of the change, not follow-up work. Do both in the same commit
as the code, never a trailing commit.

**Docs:**
- `PRD.md` — data model / feature inventory. Update whenever a schema field, table, or
  user-facing feature changes. Must never drift from what's actually in `index.html`.
- `CLAUDE.md` — update only when the workflow, architecture, or security posture itself
  changes.
- `CHANGELOG.md` — one entry per commit that ships anything user-visible or schema-affecting
  (Keep-a-Changelog style). Skip pure formatting/typo fixes. Write for a reader with no memory
  of how the change came about.
- `DEVLOG.md` — for any non-trivial decision or rejected approach, a short dated "why" entry —
  distinct from CHANGELOG's "what."

**QA, before pushing:**
- Actually run the app (open `index.html` / `python3 -m http.server`) — don't rely on a
  read-through of the diff alone.
- Exercise the golden paths, not just the changed feature in isolation: login gate, board
  filters/sort/sector chips, lead drawer edit-and-persist, archive/restore, call log widget,
  the AI outreach layer including its failure state, Metrics charts, PWA install + push
  reminders. Zero tolerance for browser console errors — don't dismiss one as "harmless"
  without explaining why.
- Grep the diff for any new API key or secret hardcoded client-side. Only `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, and `VAPID_PUBLIC_KEY` are allowed to be public — everything else
  (Groq, Places, or any other provider key) must live server-side in an Edge Function, same
  rule that already governs the VAPID private key in `app_secrets`.
- Re-check PRD.md's feature inventory for regressions beyond the immediate diff.
- End with a verdict — SHIP / DO NOT SHIP / SHIP WITH CAVEATS — and list any bugs found. If a
  browser smoke test genuinely couldn't be run (environment limitation), say so explicitly
  rather than implying it was verified.

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
