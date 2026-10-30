import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAnswerCorrect,
  evaluateArithmeticExpr,
  verifyDiagnosisMath,
} from "../src/lib/math-answer";

test("accepts bare numbers when expected answer carries discrete or metric Chinese units (live DB regressions)", () => {
  assert.equal(isAnswerCorrect("30", "30张"), true, "DB #1 L2: '30' for '30张'");
  assert.equal(isAnswerCorrect("8", "8页"), true, "DB #3 L2: '8' for '8页'");
  assert.equal(isAnswerCorrect("23", "23颗"), true);
  assert.equal(isAnswerCorrect("5", "5盘"), true);
  assert.equal(isAnswerCorrect("12", "12道"), true);
  assert.equal(isAnswerCorrect("75", "75(本)"), true);
  assert.equal(isAnswerCorrect("75", "75（本）"), true);
  assert.equal(isAnswerCorrect(" 12 个 ", "12"), true);
  assert.equal(isAnswerCorrect("24平方厘米", "24"), true);
});

test("strips accidental LaTeX $...$ and \\text{...} wrappers from Gemini expected answers", () => {
  assert.equal(isAnswerCorrect("23", "$23$ 颗"), true, "live upload f0f0bb00 L3");
  assert.equal(isAnswerCorrect("23颗", "$23$ 颗"), true, "live upload f0f0bb00 L3 with unit");
  assert.equal(isAnswerCorrect("3/4", "$\\frac{3}{4}$"), true);
  assert.equal(isAnswerCorrect("3", "$3$ \\text{米}"), true);
});

test("matches division-with-remainder notations and Gemini full-sentence prose", () => {
  const proseExpected = "可以装 $5$ 盘，还剩 $4$ 个";
  assert.equal(isAnswerCorrect("5盘余4个", proseExpected), true);
  assert.equal(isAnswerCorrect("5盘……4个", proseExpected), true);
  assert.equal(isAnswerCorrect("5...4", proseExpected), true);
  assert.equal(isAnswerCorrect("5余4", proseExpected), true);
  assert.equal(isAnswerCorrect("5(盘)……4(个)", proseExpected), true);
  assert.equal(isAnswerCorrect("可以装5盘，还剩4个", proseExpected), true);
  assert.equal(isAnswerCorrect("最多可以搭建5座，还剩1块", "最多可以搭建 $5$ 座小城堡，还剩 $1$ 块积木"), true);

  // Order matters: quotient and remainder must not be swappable
  assert.equal(isAnswerCorrect("4盘余5个", proseExpected), false);
  assert.equal(isAnswerCorrect("4盘……7个", "5盘……3个"), false);
  assert.equal(isAnswerCorrect("5……3", "5盘……3个"), true);
});

test("compares fractions, mixed numbers, decimals, percentages, and ratios with exact rational math", () => {
  assert.equal(isAnswerCorrect("3/4", "0.75"), true);
  assert.equal(isAnswerCorrect("50%", "0.5"), true);
  assert.equal(isAnswerCorrect("1又1/2", "1.5"), true);
  assert.equal(isAnswerCorrect("15/4", "3又3/4米"), true);
  assert.equal(isAnswerCorrect("15/4米", "3又3/4米"), true);
  assert.equal(isAnswerCorrect("3.75米", "3又3/4米"), true);
  assert.equal(isAnswerCorrect("3/4米", "0.75米"), true);
  assert.equal(isAnswerCorrect("12/3", "4米"), true);

  // Exact rational check: 1/3 !== 0.333333, 2/6 === 1/3
  assert.equal(isAnswerCorrect("2/6", "1/3"), true);
  assert.equal(isAnswerCorrect("0.33", "1/3"), false);

  // Ratios
  assert.equal(isAnswerCorrect("3:4", "3：4"), true);
  assert.equal(isAnswerCorrect("3比4", "3:4"), true);
  assert.equal(isAnswerCorrect("4:3", "3:4"), false);
});

test("rejects mismatched explicit units while accepting valid metric conversions (no 100x false positives)", () => {
  // Wrong explicit unit scale or dimension MUST be false
  assert.equal(isAnswerCorrect("6厘米", "6米"), false, "6cm !== 6m");
  assert.equal(isAnswerCorrect("3千米", "3米"), false, "3km !== 3m");
  assert.equal(isAnswerCorrect("3克", "3千克"), false, "3g !== 3kg");
  assert.equal(isAnswerCorrect("3秒", "3小时"), false, "3s !== 3h");
  assert.equal(isAnswerCorrect("24厘米", "24平方厘米"), false, "length !== area");

  // Equivalent explicit units & metric conversions MUST be true
  assert.equal(isAnswerCorrect("6m", "6米"), true);
  assert.equal(isAnswerCorrect("600厘米", "6米"), true);
  assert.equal(isAnswerCorrect("600cm", "6米"), true);
  assert.equal(isAnswerCorrect("3000克", "3千克"), true);
});

test("guards empty inputs and division by zero", () => {
  assert.equal(isAnswerCorrect("", "0"), false, "Number('') === 0 bug guard");
  assert.equal(isAnswerCorrect("   ", "0"), false);
  assert.equal(isAnswerCorrect("", ""), false);
  assert.equal(isAnswerCorrect("", "12"), false);
  assert.equal(isAnswerCorrect("3/0", "3/0"), false);
  assert.equal(isAnswerCorrect("1又2/0", "1"), false);
});

test("S12 verifier evaluates primary-school arithmetic and auto-heals scalar LLM slips", () => {
  const r1 = evaluateArithmeticExpr("(28 * 2 + 5) - 28");
  assert.ok(r1 !== null);
  const r2 = evaluateArithmeticExpr("3 / (1 - 1/4)");
  assert.ok(r2 !== null);

  const diag = {
    stem_text: "学校买来 36 本故事书，科技书是故事书的 3 倍，多几本？",
    student_answer: "144本",
    correct_answer: "72本",
    grade: 3,
    category: "数与代数/倍数应用题",
    error_category: "PERCEPTION_ERROR" as const,
    root_cause: "求差误算为求和",
    knowledge_points: ["倍数"],
    socratic_hints: ["h1", "h2", "h3"],
    variants: [
      {
        level: "L1" as const,
        stem: "有 28 本连环画，科技书比连环画的 2 倍多 5 本，科技书比连环画多几本？",
        answer: "31本", // LLM arithmetic slip: 56 + 5 - 28 = 33, not 31
        answer_expr: "28 * 2 + 5 - 28",
        explanation: "28*2+5-28",
      },
      {
        level: "L2" as const,
        stem: "29个苹果每5个装一盘，装几盘剩几个？",
        answer: "5盘……4个", // non-scalar remainder must be preserved
        explanation: "29/5=5...4",
      },
      {
        level: "L3" as const,
        stem: "绳子用去 1/4 后剩 3 米，原长几米？",
        answer: "4米",
        answer_expr: "3 / (1 - 1/4)",
        explanation: "3 / (3/4) = 4",
      },
    ],
  };

  const { diagnosis: verified } = verifyDiagnosisMath(diag);
  assert.equal(isAnswerCorrect("33", verified.variants[0].answer), true, "auto-healed 31本 -> 33本");
  assert.equal(isAnswerCorrect("5盘余4个", verified.variants[1].answer), true, "non-scalar remainder preserved");
  assert.equal(isAnswerCorrect("4米", verified.variants[2].answer), true);
});
