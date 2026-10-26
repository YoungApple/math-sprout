# Specs

Spec-driven workflow for MathSprout:

1. Every roadmap item starts as a spec in this folder (`Sxx-slug.md`) using
   [TEMPLATE.md](./TEMPLATE.md). A spec states the user story, behaviour (Given/When/Then),
   data/API changes, and acceptance checks — not implementation detail.
2. A GitHub issue tracks each spec (label `spec`, milestone = phase). The issue links the spec;
   the spec links the issue. Discussion happens on the issue, decisions land in the spec.
3. Implementation PRs reference the issue (`Closes #N`) and must satisfy the acceptance checks.
4. Architecture decisions that outlive a single spec go to [`docs/adr/`](../adr/).

| ID | Spec | Phase | Status |
| --- | --- | --- | --- |
| S01 | [Single-problem capture](./S01-capture.md) | P1 | Implemented (MVP) |
| S02 | [Gemini diagnosis & structured output](./S02-diagnosis.md) | P1 | Implemented (MVP) |
| S03 | [Socratic hints & visual scaffolding](./S03-hints.md) | P1 | Implemented (MVP) |
| S04 | [L1–L3 variant quiz & grading](./S04-variant-quiz.md) | P1 | Implemented (MVP) |
| S05 | [Mastery state machine & review queue](./S05-review-queue.md) | P1 | Implemented (MVP) |
| S06 | [Whole-page capture with auto-segmentation](./S06-page-capture.md) | P2 | Proposed |
| S07 | [Clean stem & handwriting layer](./S07-clean-stem.md) | P2 | Proposed |
| S08 | [Daily 10-minute session & streaks](./S08-daily-session.md) | P2 | Proposed |
| S09 | [Parent dashboard & weekly report](./S09-parent-dashboard.md) | P3 | Proposed |
| S10 | [Printable worksheet export](./S10-worksheet-pdf.md) | P3 | Proposed |
| S11 | [Photo grading of handwritten quiz answers](./S11-photo-grading.md) | P3 | Proposed |
| S12 | [Deterministic variant verification](./S12-variant-verification.md) | P2 | Proposed |
| S13 | [Accounts & multi-child profiles](./S13-accounts.md) | P3 | Proposed |
