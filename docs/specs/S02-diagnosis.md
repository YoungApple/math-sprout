# S02 — Gemini diagnosis & structured output

- Phase: P1 · Status: Implemented (MVP)

## User story
As a parent, I want the AI to tell me *where* my child's reasoning broke, classified into a small taxonomy, so that I can address the cause instead of the symptom.

## Behaviour
```
Given a photo containing the problem, the child's handwriting and marking
When diagnosis runs
Then one structured JSON result is produced containing:
  stem_text (KaTeX Markdown), student_answer, correct_answer, grade (1-6), category,
  error_category ∈ {EXECUTION_ERROR, PERCEPTION_ERROR, CONCEPT_CONFUSION, MODELING_GAP},
  root_cause (specific, never "粗心"), knowledge_points[], socratic_hints[3],
  svg_diagram?, variants[L1,L2,L3]
And the call uses responseSchema so the output is always parseable
```

## Taxonomy
| Code | Meaning | Examples |
| --- | --- | --- |
| EXECUTION_ERROR | right plan, wrong execution | carry/borrow, copy error, missing unit |
| PERCEPTION_ERROR | misread the task | skipped condition, wrong question answered |
| CONCEPT_CONFUSION | wrong rule | perimeter vs area, remainder rules |
| MODELING_GAP | no quantity relation built | blank or unrelated equations |

## Acceptance checks
- [x] Output validated against schema; a sanitizer keeps exactly one variant per level.
- [ ] Golden set of 20 photos reviewed by a human; ≥ 80 % agree with error_category. (tracked in S02 issue)

## Open questions
- Flash vs Pro: route to Pro only for MODELING_GAP / grades 5–6?
