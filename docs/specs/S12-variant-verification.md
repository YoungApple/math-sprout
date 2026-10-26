# S12 — Deterministic variant verification

- Phase: P2 · Status: Proposed

## Problem
LLM-generated variants occasionally have inconsistent numbers (3.5 people) or wrong keys.

## Behaviour
- Ask the model to also emit a tiny expression/program per variant (`solution_expr`, e.g. `(36-12)/4`).
- Evaluate with math.js in a sandbox; reject and regenerate when `eval != answer`, non-integer where integers are expected, or negative quantities.
- Log rejection rate as a quality metric.

## Acceptance checks
- [ ] Rejection path covered by tests with canned model outputs.
