# Ground Control — Field CRM

Single-file app: everything (markup, styles, logic) lives in `index.html`. No build step, no
package.json — it's deployed as a static site (Netlify) straight from this file.

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

Tables:
- `leads` — the pipeline data. RLS policy is `using(true) with check(true)` (fully open to anyone
  holding the anon key).
- `app_admin` — a singleton row (`id=1`) holding the admin username + salted password hash for
  the login gate. Same open RLS policy.

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
