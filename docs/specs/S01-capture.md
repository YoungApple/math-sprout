# S01 — Single-problem capture

- Phase: P1 · Status: Implemented (MVP)

## User story
As a parent, I want to photograph one wrong problem with my phone and have it saved with a timestamp, so that capturing costs less than 15 seconds.

## Behaviour
```
Given I open /capture on a phone
When I tap the capture area
Then the rear camera opens directly (input capture="environment")
And the photo is downscaled client-side to ≤1600px JPEG before upload
And optional "source" and "note to AI" fields are available but never required

Given the upload succeeds
Then I land on the mistake detail page within ~15s with diagnosis rendered
```

## Data & API
- `POST /api/mistakes` multipart `{image, note?, source?, term?}` → `{id, diagnosis}`.
- Photo stored under `<yyyy-mm-dd>/<uuid>.jpg` (local disk or GCS); served only via `/api/images/*`.

## Acceptance checks
- [x] iOS Safari and Android Chrome open the camera without an intermediate picker.
- [x] 12 MP photo uploads as < 500 KB.
- [x] Errors (no key, model failure) are shown inline with a retry path.
