# Ground Control — PRD & Handoff Doc

This is the full-context onboarding document for Ground Control. Read this first if you're
picking this project up cold — collaborator, future session, whatever. For the short
day-to-day engineering rules (branch/push workflow, table list, security caveats), see
`CLAUDE.md` instead — this file is the "why" and "what", CLAUDE.md is the "how".

## What this is

Ground Control is a field sales CRM built for **FiguredoutAI**, a 2-person digital agency in
Noida (the founder + Dhruv) that sells websites and digital services (GMB setup, ads
management, WhatsApp automation, content, hosting/AMC) to local businesses via door-to-door
outreach. It's built to be used standing outside a shop, on a phone, seconds after a
conversation ends — not at a desk at night.

It doubles as a permanent **lead / notes / future-discovery bank**: nothing in it should ever
be silently lost. A business that says no today is a business worth re-approaching in six
months, and the whole point of the archive/search/logging layer described below is to make
that possible.

## The sales methodology it supports

- **Phone Flip opener** — the door-to-door hook used to start a conversation with a shop owner.
- **Same-day custom-domain mockups** as the close mechanic — instead of a generic pitch, a
  working mockup on the business's own name is shown same-visit or same-day, which is what
  actually moves a lead from warm to quoted.
- **Founding Batch pricing** — an intro-tier price point for the first cohort of a template
  category, tracked as an upsell line item (`webfound`, ₹8,999).
- **₹2,000 same-visit UPI token** — a small booking/slot-lock payment taken on the spot to
  convert interest into a committed lead before the mockup is even built (`token` upsell).
- **Day-0 → day-7 follow-up ladder** — the Follow-ups tab and the `next` field on every lead
  exist specifically to enforce this: every warm lead needs a next-contact date, and the
  Follow-ups view sorts into Overdue / Today / Upcoming so nothing goes cold by accident.
- **Daily KPI targets** — doors knocked, owner conversations, mockups sent, quotes issued,
  closes — live in Settings → Targets (`S.targets`, defaults in `DAILY_TARGETS`) and drive the
  "Today" strip on the dashboard and the Metrics tab's trend charts.

## Stack

- **Single static file.** `index.html` is the entire application — markup, CSS, and JS all in
  one file. No build step, no `package.json`, no bundler.
- **Backend:** Supabase Postgres, accessed via `@supabase/supabase-js@2` loaded from a CDN
  `<script>` tag (no npm install). Charts use Chart.js, also via CDN.
- **Background jobs:** one Supabase Edge Function (`send-reminders`, Deno) on a `pg_cron`
  schedule — see "PWA & background push reminders" below. Managed through the Supabase
  dashboard/MCP, not part of the static site build.
- **PWA shell:** `manifest.webmanifest` + `service-worker.js` at the repo root, icons under
  `icons/` (regenerate with `node scripts/generate-icons.js`, requires `npm i @napi-rs/canvas`
  locally first — that dependency is not committed).
- **Repo:** `geektanishk18/Door-to-Door-CRM` on GitHub.
- **Deploy:** Netlify, auto-deploying on push to `main` (or whichever branch is wired to the
  Netlify site — check the Netlify dashboard if unsure). Live at
  `ground-control-crm.netlify.app` (confirm current URL in Netlify if this drifts).
- **Local dev:** open `index.html` directly in a browser, or `python3 -m http.server` and hit
  `localhost:PORT/index.html`. No install step of any kind.

## Data model (current, as of this PRD)

### `leads` — the pipeline
| column | type | notes |
|---|---|---|
| id | text (PK) | client-generated (`uid()`) |
| biz | text | business name — the only required field |
| contact, phone, email | text | decision-maker contact info |
| cat | text | category, from `S.cats` (editable list) |
| area | text | free-text area/sector description |
| **sector** | text (generated) | auto-extracted number from `area` via regex — `Sector 63, H-Block` → `"63"`. Read-only, computed by Postgres. |
| maps | text | Google Maps link |
| batch | text | which bulk-import or door-run batch this came from |
| source | text | Walk-in / Cold call / Referral / Instagram DM / LinkedIn / Inbound |
| stage | text | one of the 8 funnel stages, see below |
| next | text (date) | next follow-up date |
| notes | text | free-form field notes |
| upsells | jsonb | array of upsell IDs from the `UPSELLS` catalog |
| sales | jsonb | array of `{item, amount, received}` — what was actually sold and collected |
| log | jsonb | short per-lead activity mirror, newest first — see Logging below |
| **deleted_at** | timestamptz, nullable | soft-delete marker. Non-null = archived, hidden from Board/Follow-ups by default, recoverable via the Archive toggle. **Nothing is ever hard-deleted by the app.** |
| **first_contacted_at** | timestamptz, nullable | set the first time a lead's stage moves away from `pipeline` — the real "when did outreach start" date, distinct from `created_at` (which for bulk-scraped leads is just when the row was added, often before anyone knocked). |
| created_at, updated_at | timestamptz | standard timestamps |

RLS: `using(true) with check(true)` — fully open. See Security scope below.

### `app_admin` — singleton login row
`id` (always 1), `username`, `password_hash`, `password_salt`, `updated_at`. Same open RLS.
Client-side salted SHA-256 password hashing — see CLAUDE.md.

### `activity_log` — canonical cross-lead audit trail
| column | notes |
|---|---|
| id | bigint identity PK |
| lead_id | FK → `leads.id`, `on delete set null` (so a hard-deleted lead's history survives) |
| biz | snapshot of the business name at the time of the event — survives the lead itself changing or being archived |
| action | `create` \| `update` \| `delete` \| `error` |
| field | which field changed, for `update` rows (e.g. `stage`, `notes`, `upsells`) — null for create/delete/error |
| old_value, new_value | stringified before/after — arrays are JSON-stringified |
| message | human-readable summary, or the raw error text for `error` rows |
| created_at | when it happened |

This is the source of truth the Metrics tab reads from — stage-change rows in particular
(`field='stage'`, `new_value` in `mockup`/`quoted`/`won`) are what the trend charts and
funnel/revenue charts are built on. See "Logging" below for exactly what triggers a row.

### `daily_manual_stats` — the two numbers that don't come from a lead row
| column | notes |
|---|---|
| date | PK, one row per calendar day |
| doors | doors knocked that day (manually logged) |
| convos | owner conversations that day (manually logged) |
| updated_at | last edit time |

"Doors knocked" and "owner conversations" are raw field activity that doesn't always produce
a lead row (a closed door, a no-show, a five-second brushoff), so they can't be derived from
`leads`/`activity_log` the way mockups/quotes/closes can. The Metrics tab has a small
today-only input at the top that upserts into this table.

### `push_subscriptions` — one row per device with reminders turned on
| column | notes |
|---|---|
| id | uuid PK |
| endpoint | unique — the browser's push endpoint URL, identifies the device/browser install |
| p256dh, auth | the device's Web Push encryption keys, from `PushSubscription.toJSON().keys` |
| ua | `navigator.userAgent`, for debugging which device a row belongs to |
| created_at, last_seen_at | timestamps |

Same open RLS as everything else. Written by the client (`subscribePush()` in `index.html`)
when someone turns on reminders in the Data tab or the header bell icon; read only by the
`send-reminders` edge function. Rows for endpoints that start rejecting pushes (410/404,
i.e. the browser un-registered the subscription) are deleted automatically by that function.

### `app_secrets` — server-only, id=1 singleton
Holds `vapid_public` / `vapid_private`, the Web Push VAPID keypair. RLS is enabled with **no
policies at all**, so it is unreachable from the client via PostgREST/anon key — only the
`send-reminders` edge function's service-role key (which bypasses RLS) can read it. This is
the one table in this project that is deliberately *not* open — see Security scope in
CLAUDE.md for why everything else is.

### `leads.last_reminder_pushed_on`
Extra column on `leads` (date, nullable). Set by `send-reminders` to today's date once a push
has gone out for that lead's due/overdue follow-up, so the cron job doesn't re-notify for the
same lead on every 15-minute run. Cleared implicitly the next day (comparison is `!== today`).

## PWA & background push reminders

Ground Control is installable (Add to Home Screen on iOS Safari / Chrome's install prompt on
Android/desktop) via `manifest.webmanifest` + `service-worker.js` at the repo root, both
referenced from `index.html`'s `<head>`. The service worker's only jobs are caching the app
shell for instant/offline load and receiving `push` events — it does not intercept Supabase or
CDN requests, so sync/auth behavior is unaffected.

Reminders are real background push, not just an in-app banner: a Supabase Edge Function
(`send-reminders`) runs on a `pg_cron` schedule every 15 minutes, finds leads whose follow-up
is due today or overdue, and sends a Web Push notification (via the `web-push` npm package,
VAPID-signed) to every subscribed device — this fires even if the app/browser is fully closed,
as long as it was installed and reminders were turned on once. See the table docs above for
`push_subscriptions` / `app_secrets` / `last_reminder_pushed_on`, and
`supabase/migrations` (applied via the Supabase MCP, not checked into this repo as files) for
the exact cron/extension setup. Local notifications (falling back to nothing when a device
lacks Push API support, e.g. very old iOS) are the honest limitation here — flag it if a device
turns out not to support it.

## The 8-stage funnel

1. **Pipeline** — added but not yet contacted.
2. **Outreached** — first contact made.
3. **Warm** — genuine interest, needs nurturing / a next follow-up.
4. **Mockup Pending** — a custom-domain mockup has been promised or delivered; this is the
   core close mechanic.
5. **Quoted** — a formal quotation has been issued (Quotation Builder tab, PDF export).
6. **Closed (won)** — deal signed, at least one sale recorded.
7. **Upsold** — a won lead that has since bought an additional service.
8. **Lost** — dead, but never removed — stays searchable, stays in the funnel for reference.

Note: `Lost` is a normal stage and is visible by default (not the same thing as
`deleted_at` — see Soft delete below). A lead only disappears from the default Board/Follow-up
view if it's been explicitly archived (soft-deleted), never just because it's Lost.

## Feature inventory

- **Money rail** — top-of-dashboard bar chart of closed value / quoted value / pipeline
  potential value.
- **KPI strip ("Today")** — doors/owner-talks/mockups/quotes/closes today vs. `S.targets`.
- **Snapshot panel** — always-on analytics row at the top of the Pipeline tab (below the KPI
  strip, above the filters): a funnel bar-list (count per stage), a category donut, a
  won/active/lost donut, and a 7-day doors-vs-closes trend line. Stage/category/win-loss
  figures compute instantly from `S.leads` in memory; only the trend hits Supabase, cached
  60s so re-rendering the board while typing a search doesn't re-fetch. Rendering is debounced
  (`renderSnapshotPanel`) since `viewBoard()` rebuilds wholesale on each keystroke. This is the
  at-a-glance summary — the Metrics tab remains the full-depth view.
- **Board (Pipeline tab)** — kanban-style card list, filterable by stage/category/batch/sector,
  sortable (see Sorting & filtering below), searchable across business/owner/area/notes/phone
  and each lead's own activity log.
- **Follow-ups tab** — Overdue / Today / Upcoming, driven by `next`.
- **Template vault** — 5 live Vercel-hosted template sites (salon, travel, hotel, real estate,
  interior design), each with a preview thumbnail, shown on the phone during a pitch.
- **Quotation builder** — line-item builder with presets from the `UPSELLS` catalog, PDF export
  via `window.print()`, saves to the attached lead's `sales`/log.
- **Metrics tab** — KPI trend charts (Chart.js): daily doors/convos/mockups/quotes/closes
  (14d/30d toggle), funnel snapshot bar chart, cumulative revenue line chart, this-week-vs-floor
  readout. All computed live from `activity_log` + `daily_manual_stats` + `leads` — nothing is
  double-counted by hand.
- **Bulk import** — paste a JSON array of leads (matches the schema a Chrome-extension /
  Claude-in-Chrome research prompt is expected to produce), dedups by business+area, tags with
  a batch name, lands everything in `pipeline`.
- **Cloud sync** — automatic, no setup screen. See CLAUDE.md.
- **Admin login** — single shared username/password gate. See CLAUDE.md for the honest scope.
- **Sorting & filtering** — stage/category/batch/sector filters, an Archive toggle (see below),
  and a sort dropdown: Stage (default funnel order), Recently updated, Date added (new/old),
  First contacted (new/old), Follow-up soonest-first, Name A–Z, Sector. Filter state persists
  to `localStorage` across reloads (key `groundcontrol_filters_v1`); a "Clear filters" button
  appears whenever any filter differs from default.
- **Sector chips** — a compact chip row above the stage chips (e.g. "Sector 18 · 6"), auto-built
  from the `sector` generated column, for the "I'm standing in Sector 18 again" use case —
  one tap to see everything there regardless of stage.

## Logging — what writes an `activity_log` row

- **Create** — a lead's first successful save (manual add or bulk import). Bulk import also
  writes one summary row per batch (`field='batch_summary'`) noting the batch name and count.
- **Update** — any field edit (notes, contact, phone, area, upsells, sales, etc.), including
  stage changes. Text-field edits are diffed against a per-drawer-session baseline and
  coalesced on the same ~600ms debounce as autosave, so typing doesn't spam one row per
  keystroke — one row is written per field that actually changed once things settle. Stage
  changes are logged immediately (not debounced) since they're discrete button clicks.
- **Delete** — archiving a lead ("Archive" button in the drawer, formerly "Delete"), and
  triggering "Reset everything" in Settings (which logs before wiping local state, even though
  Reset itself doesn't touch Supabase rows — see Soft delete below for why this is safe).
- **Error** — any Supabase read/write failure (cloud push/pull, admin login/setup/password
  change, daily-stats save). Deduplicated so a long offline stretch doesn't write one error row
  per retry — one row per failure episode, reset on the next successful call.

A short mirror of update/create/delete events is also appended to the lead's own `log` jsonb
array (e.g. "Notes updated", "Stage → Warm") so its drawer shows history instantly without a
join — `activity_log` stays the canonical, cross-lead source for the Metrics tab and for
searching across leads.

## Soft delete — nothing the app does is irreversible

There is no hard-delete path in the UI. "Delete" in the lead drawer was renamed **Archive**:
it sets `deleted_at` and logs an activity row: the row stays in Postgres, just hidden from the
default Board/Follow-ups view. An **Archive** toggle in the Board filters bar shows everything,
archived or not, when switched on — and a lead viewed while archived shows a **Restore** button
instead of Archive in its drawer.

"Reset everything" in Settings still wipes local app state (leads/templates/quotes on that
device) — that's a pre-existing, intentionally-destructive local action distinct from the
per-lead soft delete, and it's now logged to `activity_log` before it runs, which it wasn't
before. It does not delete rows in Supabase (the sync layer only ever upserts, never deletes),
so cloud data survives a local reset and repopulates on the next pull.

If a lead genuinely needs to be purged from Postgres (GDPR-style request, duplicate cleanup,
whatever), that's a manual `delete from leads where id = '...'` in the Supabase SQL editor —
deliberately not exposed in the app.

## Known limitations — stated plainly, not oversights

- **`leads`, `activity_log`, `daily_manual_stats`, and `app_admin` RLS policies are all fully
  open** (`using(true) with check(true)`). The admin login is an **app-level UI gate**, not
  real access control — see CLAUDE.md's Security scope section for the full explanation.
  Anyone with the anon key (visible in page source on the deployed site) can read/write all
  four tables directly over the Supabase REST API, bypassing the login screen entirely.
- **Single shared admin identity**, not multi-user. There's one username/password for the
  whole team, not per-person accounts. Activity log rows aren't attributed to an individual —
  `biz`/`message` tell you *what* happened, not *who* did it.
- **This is intentional scope** for a 2-person internal tool being used by people who trust
  each other. It is not hardened for a larger team, a public-facing product, or an adversarial
  environment. If that ever changes, the fix is proper Supabase Auth + RLS scoped to
  `auth.uid()` — flagged as future work in CLAUDE.md, not built speculatively.

## Where to look for what

- Business/pricing/stage logic, upsell catalog, default categories → top of the `<script>`
  block in `index.html` (`UPSELLS`, `STAGES`, `DEFAULT_CATS`, `DAILY_TARGETS`).
- Cloud sync + activity logging plumbing → the `CLOUD SYNC` and `ACTIVITY LOG` sections of the
  script, right after the state block.
- Admin login → `ADMIN LOGIN` section.
- Board rendering, filters, sort comparators → `viewBoard()`, `SORTERS`, `SORT_LABELS`, near the
  bottom third of the render functions.
- Metrics/charts → `viewMetrics()` / `renderMetricsCharts()`, just above `viewData()`.
- Snapshot panel (Pipeline home) → the `SNAPSHOT` section just above `viewData()`:
  `renderSnapshotPanel()` plus `renderSnapshotFunnel/Category/WinLoss/Trend()` and the shared
  `renderDonut()` helper; its markup is emitted at the top of `viewBoard()`.
- Day-to-day workflow rules (branch/push, table list, security caveats) → `CLAUDE.md`.
