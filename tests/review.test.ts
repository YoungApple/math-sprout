import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EBBINGHAUS_DAYS,
  initialReviewState,
  deriveProgress,
  applyAttempt,
  formatDateZh,
  isAnswerCorrect,
  type ReviewState,
} from "../src/lib/review";

const VARIANTS = [
  { id: "v1", level: "L1" as const },
  { id: "v2", level: "L2" as const },
  { id: "v3", level: "L3" as const },
];

const d = (iso: string) => new Date(iso);

test("PENDING wrong answer and CONSOLIDATING partial progress stay due today (no +1d queue eviction)", () => {
  const t0 = d("2026-10-30T10:00:00.000Z");
  const s0 = initialReviewState(t0);
  assert.equal(s0.status, "PENDING");
  assert.equal(s0.stage, 0);
  assert.equal(deriveProgress(s0, VARIANTS, [], t0).isDue, true);

  // Wrong answer on L1 while PENDING: must NOT push nextReviewAt to tomorrow
  const attemptsAfterMiss = [
    { id: "a1", variantId: "v1", answeredAt: t0.toISOString(), userAnswer: "wrong", isCorrect: false, round: 0 },
  ];
  const sMiss = applyAttempt(s0, VARIANTS, [], { variantId: "v1", isCorrect: false }, t0);
  assert.equal(sMiss.status, "PENDING");
  assert.equal(deriveProgress(sMiss, VARIANTS, attemptsAfterMiss, d("2026-10-30T10:05:00.000Z")).isDue, true);

  // Correct L1 -> CONSOLIDATING, still due today so kid can finish L2 & L3
  const sCons = applyAttempt(sMiss, VARIANTS, attemptsAfterMiss, { variantId: "v1", isCorrect: true }, t0);
  const attemptsAfterL1 = [
    ...attemptsAfterMiss,
    { id: "a2", variantId: "v1", answeredAt: t0.toISOString(), userAnswer: "75", isCorrect: true, round: 0 },
  ];
  assert.equal(sCons.status, "CONSOLIDATING");
  const pCons = deriveProgress(sCons, VARIANTS, attemptsAfterL1, d("2026-10-30T10:10:00.000Z"));
  assert.equal(pCons.isDue, true);
  assert.equal(pCons.solvedVariantIds.includes("v1"), true);
  assert.equal(pCons.solvedVariantIds.includes("v2"), false);

  // Wrong L2 while CONSOLIDATING -> falls back to PENDING and remains due today
  const sBack = applyAttempt(sCons, VARIANTS, attemptsAfterL1, { variantId: "v2", isCorrect: false }, t0);
  assert.equal(sBack.status, "PENDING");
  assert.equal(deriveProgress(sBack, VARIANTS, attemptsAfterL1, d("2026-10-30T10:15:00.000Z")).isDue, true);
});

test("first mastery uses EBBINGHAUS_DAYS[0] = 1 day aligned to Asia/Shanghai 04:00 study day", () => {
  // Kid finishes quiz at 21:30 Beijing time (13:30Z on Oct 30)
  const monNight = d("2026-10-30T13:30:00.000Z");
  let state: ReviewState = initialReviewState(monNight);
  const attempts: { id: string; variantId: string; answeredAt: string; userAnswer: string; isCorrect: boolean; round: number }[] = [];

  for (const [idx, vid] of ["v1", "v2", "v3"].entries()) {
    state = applyAttempt(state, VARIANTS, attempts, { variantId: vid, isCorrect: true }, monNight);
    attempts.push({ id: `a${idx}`, variantId: vid, answeredAt: monNight.toISOString(), userAnswer: "ok", isCorrect: true, round: 0 });
  }

  assert.equal(state.status, "MASTERED");
  assert.equal(EBBINGHAUS_DAYS[0], 1);

  // Still same night (22:30 Beijing = 14:30Z Oct 30): NOT due yet
  assert.equal(deriveProgress(state, VARIANTS, attempts, d("2026-10-30T14:30:00.000Z")).isDue, false);

  // Next evening at 19:00 Beijing time (11:00Z Oct 31, < 24h wall clock but next study day!): MUST be due!
  const tueEvening = d("2026-10-31T11:00:00.000Z");
  assert.equal(deriveProgress(state, VARIANTS, attempts, tueEvening).isDue, true);
});

test("re-submitting while MASTERED and not yet due is idempotent (no stage inflation)", () => {
  const t0 = d("2026-10-30T08:00:00.000Z");
  let state = initialReviewState(t0);
  const attempts: { id: string; variantId: string; answeredAt: string; userAnswer: string; isCorrect: boolean; round: number }[] = [];

  for (const vid of ["v1", "v2", "v3"]) {
    state = applyAttempt(state, VARIANTS, attempts, { variantId: vid, isCorrect: true }, t0);
    attempts.push({ id: vid, variantId: vid, answeredAt: t0.toISOString(), userAnswer: "ok", isCorrect: true, round: 0 });
  }
  assert.equal(state.status, "MASTERED");
  const stageAfterMastery = state.stage;
  const dueAfterMastery = state.nextReviewAt;

  // Duplicate submit 10 seconds later while not due must NOT advance stage or nextReviewAt
  const tDup = d("2026-10-30T08:00:10.000Z");
  const stateDup = applyAttempt(state, VARIANTS, attempts, { variantId: "v3", isCorrect: true }, tDup);
  assert.equal(stateDup.status, "MASTERED");
  assert.equal(stateDup.stage, stageAfterMastery);
  assert.equal(stateDup.nextReviewAt, dueAfterMastery);
});

test("scheduled due MASTERED review unlocks fresh round inputs and requires all 3 levels in new round", () => {
  const day0 = d("2026-10-30T08:00:00.000Z");
  let state = initialReviewState(day0);
  const attempts: { id: string; variantId: string; answeredAt: string; userAnswer: string; isCorrect: boolean; round: number }[] = [];

  for (const vid of ["v1", "v2", "v3"]) {
    state = applyAttempt(state, VARIANTS, attempts, { variantId: vid, isCorrect: true }, day0);
    attempts.push({ id: `r0_${vid}`, variantId: vid, answeredAt: day0.toISOString(), userAnswer: "ok", isCorrect: true, round: 0 });
  }

  // Advance clock past nextReviewAt -> new active round opens with 0 solved variants!
  const dayDue = d("2026-11-02T10:00:00.000Z");
  const dueProgress = deriveProgress(state, VARIANTS, attempts, dayDue);
  assert.equal(dueProgress.isDue, true);
  assert.equal(dueProgress.activeRound, 1);
  assert.equal(dueProgress.solvedVariantIds.length, 0, "must unlock all 3 inputs on scheduled review");

  // Answering ONLY L1 in round 1 must NOT immediately re-master from round-0 history!
  const stateAfterR1L1 = applyAttempt(state, VARIANTS, attempts, { variantId: "v1", isCorrect: true }, dayDue);
  attempts.push({ id: "r1_v1", variantId: "v1", answeredAt: dayDue.toISOString(), userAnswer: "ok", isCorrect: true, round: 1 });
  assert.notEqual(stateAfterR1L1.status, "MASTERED", "1/3 in round 1 should consolidate, not finish review");
  assert.equal(deriveProgress(stateAfterR1L1, VARIANTS, attempts, dayDue).isDue, true);

  // Completing L2 and L3 in round 1 advances Ebbinghaus stage
  const sR1L2 = applyAttempt(stateAfterR1L1, VARIANTS, attempts, { variantId: "v2", isCorrect: true }, dayDue);
  attempts.push({ id: "r1_v2", variantId: "v2", answeredAt: dayDue.toISOString(), userAnswer: "ok", isCorrect: true, round: 1 });
  const sR1L3 = applyAttempt(sR1L2, VARIANTS, attempts, { variantId: "v3", isCorrect: true }, dayDue);
  attempts.push({ id: "r1_v3", variantId: "v3", answeredAt: dayDue.toISOString(), userAnswer: "ok", isCorrect: true, round: 1 });

  assert.equal(sR1L3.status, "MASTERED");
  assert.ok(sR1L3.stage > state.stage, "Ebbinghaus stage advances after completing scheduled review round");
  assert.equal(deriveProgress(sR1L3, VARIANTS, attempts, dayDue).isDue, false);

  // Later due review where child misses L2 -> RELAPSED, stage reset to 0, due immediately
  const dayLater = d("2026-11-10T10:00:00.000Z");
  const relapsed = applyAttempt(sR1L3, VARIANTS, attempts, { variantId: "v2", isCorrect: false }, dayLater);
  assert.equal(relapsed.status, "RELAPSED");
  assert.equal(relapsed.stage, 0);
  assert.equal(deriveProgress(relapsed, VARIANTS, attempts, dayLater).isDue, true);
});

test("formatDateZh formats deterministically in Asia/Shanghai regardless of server UTC timezone", () => {
  // 2026-10-31T17:17:47Z is 2026-11-01 01:17:47 in Asia/Shanghai!
  const formatted = formatDateZh("2026-10-31T17:17:47.670Z");
  assert.ok(formatted.includes("11") && formatted.includes("1"), `expected Nov 1 in Asia/Shanghai, got ${formatted}`);
  assert.equal(isAnswerCorrect("3/4", "0.75"), true);
});
