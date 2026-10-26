# S04 — L1–L3 variant quiz & grading

- Phase: P1 · Status: Implemented (MVP)

## User story
As a parent, I want my child to solve three fresh variants of the mistake, so that mastery is proven rather than assumed.

## Behaviour
```
L1 numeric: same wording skeleton, numbers changed
L2 context: same quantity relation, new real-life story
L3 reverse: known/unknown swapped or one extra step

Given a variant
When the child submits an answer
Then it is graded leniently (whitespace, units, 3/4 = 0.75, 50% = 0.5)
And the explanation is shown regardless of correctness
And the attempt is persisted and the state machine (S05) advances
```

## Acceptance checks
- [x] Unit tests for grading normalisation.
- [ ] Variant answers re-verified deterministically before save (see S12).
