# S06 — Whole-page capture with auto-segmentation

- Phase: P2 · Status: Proposed

## User story
As a parent, I want to photograph a whole test page and have each wrong problem detected and cropped automatically, so that a page with 5 mistakes costs one photo, not five.

## Behaviour
```
Given a full-page photo
When segmentation runs (Gemini 2.5 Flash, box_2d normalised 0-1000)
Then I see candidate crops, pre-selected where red marking is detected
And I can toggle/adjust crops before confirming
And each confirmed crop becomes a mistake via S02 with source = detected test title
```

## Data & API
- `POST /api/pages` → `{pageId, candidates:[{box, hasMarking, preview}]}`
- `POST /api/pages/:id/confirm {boxes[]}` → `{mistakeIds[]}`

## Acceptance checks
- [ ] ≥ 90 % of red-marked problems detected on a 10-page sample.
- [ ] Perspective correction applied client-side before crop.
