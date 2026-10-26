import { test } from "node:test";
import assert from "node:assert/strict";
import { transition, initialReviewState, isAnswerCorrect, EBBINGHAUS_DAYS } from "../src/lib/review";

const d = (s: string) => new Date(s);

test("PENDING -> CONSOLIDATING after first correct L1", () => {
  const s = transition(initialReviewState(d("2026-01-01")), { level: "L1", isCorrect: true, allLevelsCorrect: false }, d("2026-01-01"));
  assert.equal(s.status, "CONSOLIDATING");
});

test("all levels correct -> MASTERED with Ebbinghaus interval", () => {
  let s = initialReviewState(d("2026-01-01"));
  s = transition(s, { level: "L1", isCorrect: true, allLevelsCorrect: false }, d("2026-01-01"));
  s = transition(s, { level: "L3", isCorrect: true, allLevelsCorrect: true }, d("2026-01-01"));
  assert.equal(s.status, "MASTERED");
  assert.equal(s.stage, 1);
  assert.ok(s.nextReviewAt.startsWith("2026-01-0" + (1 + EBBINGHAUS_DAYS[1])));
});

test("wrong answer while MASTERED -> RELAPSED, stage reset", () => {
  const s = transition({ status: "MASTERED", stage: 3, nextReviewAt: "" }, { level: "L2", isCorrect: false, allLevelsCorrect: false }, d("2026-02-01"));
  assert.equal(s.status, "RELAPSED");
  assert.equal(s.stage, 0);
});

test("wrong answer while CONSOLIDATING -> PENDING", () => {
  const s = transition({ status: "CONSOLIDATING", stage: 0, nextReviewAt: "" }, { level: "L2", isCorrect: false, allLevelsCorrect: false });
  assert.equal(s.status, "PENDING");
});

test("lenient answer matching", () => {
  assert.ok(isAnswerCorrect(" 12 个", "12"));
  assert.ok(isAnswerCorrect("3/4", "0.75"));
  assert.ok(isAnswerCorrect("50%", "0.5"));
  assert.ok(isAnswerCorrect("1又1/2", "1.5"));
  assert.ok(isAnswerCorrect("24平方厘米", "24"));
  assert.ok(!isAnswerCorrect("13", "12"));
  assert.ok(!isAnswerCorrect("", "12"));
});
