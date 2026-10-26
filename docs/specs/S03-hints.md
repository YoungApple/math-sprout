# S03 — Socratic hints & visual scaffolding

- Phase: P1 · Status: Implemented (MVP)

## User story
As a child, I want hints that help me find the answer myself, so that I feel capable rather than told.

## Behaviour
```
Given the detail page
When I tap "我需要提示"
Then hints appear one at a time (max 3), strongest last
And the answer is only revealed after all hints, behind an explicit tap

Given the diagnosis includes an svg_diagram
Then it renders above the hints (bar model / number line / area grid)
```

## Acceptance checks
- [x] Hints never contain the final numeric answer (prompt constraint).
- [ ] SVG is sanitized (allowlist of tags) before `dangerouslySetInnerHTML`. (follow-up)
