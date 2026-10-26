# S07 — Clean stem & handwriting layer

- Phase: P2 · Status: Proposed

## User story
As a parent, I want a clean version of each problem (without pencil/red marks) for re-practice and printing, while keeping the original handwriting for diagnosis.

## Behaviour
- Store two renditions per mistake: `stem_clean` (rendered from stem_text + any original figure crop) and `student_trace` (original crop).
- Prefer re-rendering text from `stem_text` over pixel inpainting; fall back to Gemini image editing for figures.

## Acceptance checks
- [ ] Printable worksheet (S10) uses clean stems only.
