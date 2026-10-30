# MathSprout (题芽)

AI-guided primary-school math mistake notebook that checks whole homework pages, diagnoses reasoning breakpoints, scaffolds discovery with Socratic hints, and proves durable mastery through variant challenges and spaced review.

## Homework Check & Taxonomy

**Homework Check**:
A whole-page multimodal scan of a photographed worksheet or test that segments each problem (`box_2d` normalized `0..1000`), extracts the child's written answer, verifies the canonical answer and verdict deterministically, and allows selective batch import into the mistake notebook.
_Avoid_: Raw OCR dump, unverified grading

**Check Verdict**:
The per-problem outcome on a checked homework page: `CORRECT` (equivalent mathematical value and compatible unit), `WRONG` (calculation, concept, unit, or perception slip), or `BLANK` (left unanswered).
_Avoid_: Binary pass/fail

**Curriculum Domain**:
One of the four top-level primary-school mathematics domains from the Chinese National Curriculum Standards (`数与代数`, `图形与几何`, `统计与概率`, `综合与实践`), automatically prefixed onto every mistake's `<领域>/<题型>` category.
_Avoid_: Arbitrary folder, unnormalized free-text tag

## Diagnosis & Scaffolding

**Mistake**:
A captured primary-school math problem queued for guided mastery, paired with its worksheet crop/photo, diagnosis, hints, variants, curriculum metadata (`grade`, `term`, `source`, `category`), and spaced-review state.
_Avoid_: Question, item, post, ticket

**Breakpoint**:
The specific step in the child's reasoning or calculation where their solution diverged from a valid approach; never a vague label like carelessness ("粗心").
_Avoid_: Carelessness, generic error

**Socratic Hint**:
One of three progressively stronger guiding questions addressed to the child that nudges them toward the breakpoint without revealing the final answer.
_Avoid_: Solution step, answer walkthrough

**Visual Scaffold**:
A diagram (such as a bar model or number line) that represents known quantities and marks unknown targets with `?` without exposing computed results.
_Avoid_: Answer diagram, solved chart

## Practice & Grading

**Variant**:
A generated follow-up problem targeting the same underlying concept at one of three transfer levels: `L1` (numbers changed), `L2` (new real-world story), or `L3` (reverse reasoning or extra step within the same grade).
_Avoid_: Clone, duplicate question

**Canonical Answer**:
A concise machine-gradable value (with optional unit, ratio, or quotient-remainder notation) stripped of prose and formatting markup.
_Avoid_: Full-sentence answer, solution prose

**Attempt**:
A single answer submission by the child on one variant within a specific review round.
_Avoid_: Guess, submission log

## Spaced Mastery

**Review Round**:
One complete pass requiring the child to solve all three variant levels (`L1`, `L2`, and `L3`); a new round opens whenever a mastered mistake reaches its scheduled review date or relapses.
_Avoid_: Session, lifetime history

**Study Day**:
A local family calendar day in `Asia/Shanghai` rolling over at `04:00`, used to schedule spaced reviews so evening study time never drifts later each night.
_Avoid_: Rolling 24-hour window, UTC day

**Mastery Status**:
The lifecycle state of a mistake across spaced repetition: `PENDING` (unconquered), `CONSOLIDATING` (some variants solved in the active round), `MASTERED` (all variants solved in the active round, awaiting next scheduled review), or `RELAPSED` (missed a variant during a scheduled review).
_Avoid_: Score, completion flag
