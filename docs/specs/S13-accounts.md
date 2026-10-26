# S13 — Accounts & multi-child profiles

- Phase: P3 · Status: Proposed

## User story
As a parent with two children, I want separate profiles under one family login, so that queues and reports do not mix.

## Behaviour
- Replace FAMILY_PASSCODE with magic-link email auth (Auth.js) once more than one family uses the app.
- `child_id` on mistakes/attempts; profile switcher in the header.

## Acceptance checks
- [ ] Migration script for existing single-profile data.
