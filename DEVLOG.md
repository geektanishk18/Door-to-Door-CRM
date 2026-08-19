# Devlog

The "why" behind non-trivial decisions — tradeoffs made, approaches rejected, constraints hit.
Terse, dated entries. Distinct from CHANGELOG.md (the "what") and PRD.md (the current state).

## 2026-08-19 — Nerf semantics confirmed before building

Confirmed with the user that "nerf" means a manual deprioritize flag independent of `stage`,
not a new stage and not the same thing as `Lost`. Rejected folding it into `stage` because a
nerfed lead needs to keep its real pipeline position (still Warm, still Mockup Pending, etc.)
— the whole point is "stop bugging me about this one for now" without losing where it actually
sits in the funnel. Implemented as `nerfed`/`nerfed_at` columns plus a filter toggle that
mirrors the existing Archive toggle's UI pattern exactly, rather than inventing a new
interaction — one less thing for the user to learn.

## 2026-08-19 — Board hides nerfed leads by default, Follow-ups hides them unconditionally

Two different defaults, on purpose. On the Board, nerfed leads are hidden by default but
recoverable via a filter toggle (matches Archive) — you may still want to eyeball a nerfed
lead's card while reviewing a sector sweep. In Follow-ups and the due-count badges (header tab
+ bottom nav), nerfing is unconditional with no toggle to reveal them — the entire purpose of
nerf is "stop surfacing this in my follow-up queue," so giving it an override there would
defeat the feature. Push reminders (`send-reminders` edge function) follow the Follow-ups
behavior, not the Board's — same reasoning.

## 2026-08-19 — Call log and nerf actions log immediately, not via the generic diff

The app already has a generic per-field diff (`diffAndLogLead`/`FIELD_LABELS`) that logs
`activity_log` rows on a ~600ms debounce after a drawer edit settles — good for text fields,
wrong for discrete actions. Stage changes already bypass this (logged immediately in the click
handler); call log entries and nerf toggles follow the same convention rather than being added
to `FIELD_LABELS`, both because a debounced "call_attempts changed" message is useless
(doesn't say which outcome) and to avoid double-logging if a call is logged and then something
else in the drawer is edited within the same debounce window.

## 2026-08-19 — Call number display caps at "3+", storage doesn't

The spec's data shape hints `n: 1|2|3+`. Storing the literal string "3+" would make
`call_attempts.length` and any future "average calls to connect" analytics wrong. `n` is
always stored as a real sequential integer; only the drawer's "Log Call N" button label caps
its text at "Log Call 3+" once you're past the second attempt, since by then the exact number
matters less than "this lead has been called repeatedly."
