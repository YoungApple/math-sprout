# S06 — Whole-page homework check & auto-segmented mistake import

- Phase: P2 · Status: Implemented

## User story
As a parent, I want to photograph a whole homework or test page, see an instant problem-by-problem grading report (`CORRECT` / `WRONG` / `BLANK`) with bounding-box overlays, and batch-import selected wrong/blank problems into the mistake notebook with rich curriculum categorization, so that a page with multiple problems takes one photo instead of five.

## Behaviour
```
Given a full-page homework/test photo (or 1-click zero-Gemini demo via ?sample=1)
When checkHomeworkPage runs (Gemini Vision structured output + deterministic sanitizeHomeworkCheck double-guard)
Then every problem is extracted with normalized box_2d [ymin, xmin, ymax, xmax] in 0..1000, stem_text, student_answer, S12-healed correct_answer, verdict, error_category, curriculum domain/topic, and brief_feedback
And deterministic equivalence checking overrides both LLM false-negatives (e.g. "0.75米" vs "3/4米", "600厘米" vs "6米") and concrete math/unit false-positives (e.g. "6厘米" vs "6米")
And WRONG / BLANK items are pre-selected for batch import with client-side Canvas sub-box cropping into POST /api/mistakes (with checkedItem target context, grade, term, and detected_source)
```

## Data & API
- `POST /api/homework-check` (`?sample=1` or multipart `{ image, note?, grade?, term?, source? }`) → `HomeworkCheckResult`
- `POST /api/mistakes` (multipart `{ image, note?, grade?, term?, source?, checkedItem?, skipDedupe? }`) → `{ id, diagnosis | deduplicated }`
- `GET /api/mistakes` (`due`, `status`, `errorCategory`, `domain`, `category`, `tag`, `grade`, `term`, `source`, `q`, `facets=1`) → `{ items, facets? }`
- `PATCH /api/mistakes/:id` (`{ grade?, term?, source?, category?, errorCategory? }`) → updated `Mistake`

## Acceptance checks
- [x] Deterministic S12 expression auto-healing and bidirectional anti-false-grading invariants (`sanitizeHomeworkCheck`).
- [x] Normalized 4-domain curriculum taxonomy (`数与代数`, `图形与几何`, `统计与概率`, `综合与实践`) + multi-dimensional facets and filters.
- [x] Client-side `box_2d` crop with `checkedItem.index` SHA-256 dedupe isolation on fallback full-page blobs.
