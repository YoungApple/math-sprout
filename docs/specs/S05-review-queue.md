# S05 — Mastery state machine & review queue

- Phase: P1 · Status: Implemented (MVP)

## State machine
```
PENDING ──L1 correct──▶ CONSOLIDATING ──L2 & L3 correct──▶ MASTERED
   ▲                        │ any wrong                        │ wrong on scheduled review
   └────────────────────────┘                                  ▼
   ◀─────────────────────────────────────────────────────── RELAPSED
```
Intervals after each fully-correct round: 1, 2, 4, 7, 15, 30 days.

## Behaviour
```
Given the home page
Then it shows at most 3 items whose next_review_at <= now, oldest first
And a "start" CTA opens the first one
```

## Acceptance checks
- [x] Unit tests cover every transition.
- [ ] Items never disappear from the queue silently (RELAPSED comes back the next day).
