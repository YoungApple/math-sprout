# MathSprout (题芽) — Product Requirements Document

Status: Living document · Owner: @YoungApple · Last updated: 2026-10-26

## 1. Problem

Primary-school parents in China collect wrong answers (错题) by cutting, pasting or
printing them. The notebooks are expensive to maintain and rarely revisited; answer-search
apps hand over solutions without telling the child *why* they went wrong; "I understood the
answer" is mistaken for mastery, and the same error type recurs on the next test.

## 2. Vision

> Photograph a wrong answer in 10 seconds; get a diagnosis, not a solution; prove mastery on
> three fresh variants; let a review schedule—not the parent—decide what to practise tonight.

## 3. Users

| Persona | Goals | Constraints |
| --- | --- | --- |
| Parent (primary operator) | Capture quickly after homework; understand the child's real weakness; keep the evening short | Phone camera; limited patience; mainland-China network; privacy of child's work |
| Child, grade 1–6 | Feel guided rather than judged; short wins | Small reading stamina; concrete > abstract; needs big UI, few words |

## 4. Non-goals (MVP)

- Multi-tenant SaaS, payments, school/teacher dashboards.
- Subjects other than math; grades above 6.
- Native apps. The product is a responsive PWA.

## 5. Product principles

1. **Diagnose, don't solve.** Hints before answers; "粗心" is never an accepted root cause.
2. **Mastery is proven on variants**, never on the original problem.
3. **Zero-friction capture** beats rich capture. One photo, no forms.
4. **Routine over cramming.** The home screen is today's 3 due items; nothing else competes.
5. **Private by default.** Family passcode; no third-party analytics; photos never leave our origin.

## 6. Scope by phase

| Phase | Outcome | Specs |
| --- | --- | --- |
| P1 — Core loop | Photo → diagnosis → hints → L1–L3 quiz → due queue | S01, S02, S03, S04, S05 |
| P2 — Routine | Multi-problem page capture, clean stem, dedupe, daily 10-min session, streaks | S06, S07, S08 |
| P3 — Insight | Parent dashboard, weekly report, printable worksheet PDF, photo grading of quiz answers | S09, S10, S11 |

## 7. Success metrics (family-scale)

- Median capture-to-diagnosis time < 20 s.
- ≥ 70 % of items reach MASTERED within 15 days of capture.
- Relapse rate (MASTERED → RELAPSED) < 20 %.
- Daily review session completed ≥ 4 days/week.

## 8. Constraints

- Backend must reach the Gemini API; users must reach the app from mainland China without a VPN.
- Target cost ≈ \$0/month beyond Gemini usage.
- Single-family data volume: ~10 items/day, ~300 KB/photo.
