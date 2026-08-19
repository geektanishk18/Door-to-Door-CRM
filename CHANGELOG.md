# Changelog

All notable user-visible or schema-affecting changes to Ground Control are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/). One entry per commit
that ships something a user or maintainer would notice — routine/mechanical changes are
skipped.

## [Unreleased]

### Added
- **Call log widget** in the lead drawer — logs sequential call attempts (Call 1, Call 2, …)
  with a one-tap outcome picker (Connected / No answer / Voicemail / Bad number). Stored on
  `leads.call_attempts` (jsonb), never edited or removed after logging. The board card now
  shows a small "☎ N calls, last Xd ago" line, which turns amber after 5+ days of silence on
  a lead that's still open.
- **Nerf** — a manual "deprioritize this lead" toggle, independent of pipeline stage. A nerfed
  lead drops out of the Follow-ups tab, the due-count badges, and background push reminders,
  but stays visible (muted) on the Board behind a "Nerfed (N)" filter toggle — same interaction
  pattern as the existing Archive toggle. Backed by `leads.nerfed` / `leads.nerfed_at`.

### Changed
- The `send-reminders` background push function now excludes nerfed leads from its due/overdue
  query, so a nerfed lead can no longer trigger a push notification.
