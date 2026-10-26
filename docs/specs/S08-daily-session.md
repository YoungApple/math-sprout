# S08 — Daily 10-minute session & streaks

- Phase: P2 · Status: Proposed

## User story
As a child, I want a short guided session that ends with a visible win, so that reviewing feels like a game rather than homework.

## Behaviour
```
Given due items exist
When I tap "开始挑战"
Then a session of ≤3 items runs full-screen, one variant at a time, with progress dots
And finishing waters the sprout (streak counter, calendar heatmap)
And a day with zero due items still offers one L2 from a MASTERED item (light touch)
```

## Acceptance checks
- [ ] Session completes in < 10 min for 3 items (measured).
- [ ] Streak logic has unit tests (timezone Asia/Shanghai).
