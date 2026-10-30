import { test } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTests } from "../src/lib/db";
import { detectImageMime, getImage } from "../src/lib/storage";
import { MATH_DOMAINS } from "../src/lib/taxonomy";
import {
  checkHomeworkPage,
  getSampleHomeworkCheck,
  sanitizeHomeworkCheck,
  type HomeworkCheckResult,
} from "../src/lib/homework-check";

type SanitizeInput = Parameters<typeof sanitizeHomeworkCheck>[0];

function asSanitizeInput(payload: Record<string, unknown>): SanitizeInput {
  return payload as unknown as SanitizeInput;
}

test("sanitizeHomeworkCheck: S12 correct_expr auto-heals wrong arithmetic, preserves unit, and strips $ LaTeX", () => {
  const raw = {
    grade: 3,
    term: "上册",
    detected_source: "三年级口算与应用题练习",
    encouragement: "认真审题，继续加油！",
    summary: {
      total: 99,
      correct: 99,
      wrong: 0,
      blank: 0,
      accuracy: 100,
      encouragement: "认真审题，继续加油！",
    },
    items: [
      {
        index: "1",
        box_2d: [80, 40, 240, 960],
        stem_text: "图书角买来 $24$ 本科普书，故事书是科普书的 $3$ 倍，故事书有多少本？",
        student_answer: "72本",
        // LLM hallucinated 70本 with $ LaTeX, while correct_expr evaluates to 72
        correct_answer: "$70$ 本",
        correct_expr: "24 * 3",
        verdict: "WRONG",
        error_category: "EXECUTION_ERROR",
        brief_feedback: "算错啦",
        category: "倍数应用题",
        knowledge_points: ["倍的认识"],
      },
      {
        index: "2",
        box_2d: [260, 40, 420, 960],
        stem_text: "把一根 $3$ 米长的彩带平均分成 $4$ 段，每段长多少米？",
        student_answer: "0.5米",
        correct_answer: "$3/4$ 米",
        verdict: "WRONG",
        error_category: "CONCEPT_CONFUSION",
        brief_feedback: "除法关系写反了",
        category: "分数与除法",
        knowledge_points: ["分数与除法"],
      },
    ],
  };

  const res: HomeworkCheckResult = sanitizeHomeworkCheck(asSanitizeInput(raw));

  assert.equal(res.grade, 3);
  assert.equal(res.term, "上学期");

  // Item 1: S12 healed "$70$ 本" -> "72本", stripped $, AND since student wrote "72本",
  // anti-false-grading flips verdict from WRONG -> CORRECT!
  const item1 = res.items[0];
  assert.ok(!item1.correct_answer.includes("$"), `expected $ stripped, got ${item1.correct_answer}`);
  assert.equal(item1.correct_answer, "72本");
  assert.equal(item1.verdict, "CORRECT", "healed 72本 matches student 72本 -> must be CORRECT");
  assert.equal(item1.error_category, undefined, "CORRECT item must not retain error_category");
  assert.ok(
    MATH_DOMAINS.some((d) => item1.category.startsWith(`${d}/`)),
    `category must be normalized with domain prefix, got ${item1.category}`,
  );

  // Item 2: $ stripped from fraction answer without correct_expr
  const item2 = res.items[1];
  assert.ok(!item2.correct_answer.includes("$"), `expected $ stripped, got ${item2.correct_answer}`);
  assert.ok(item2.correct_answer.includes("3/4") && item2.correct_answer.includes("米"));
  assert.equal(item2.verdict, "WRONG");
});

test("sanitizeHomeworkCheck: anti-false-grading invariant (both directions + BLANK) & summary/box_2d clamping", () => {
  const raw = {
    grade: 4,
    term: "DOWN",
    detected_source: "四年级随堂练",
    encouragement: "订正错题就能更棒！",
    summary: {
      total: 1,
      correct: 1,
      wrong: 0,
      blank: 0,
      accuracy: 100,
      encouragement: "订正错题就能更棒！",
    },
    items: [
      // (a1) LLM wrongly marks equivalent decimal/fraction "0.75米" vs "3/4米" as WRONG -> override to CORRECT!
      {
        index: "1",
        box_2d: [50, 30, 180, 920],
        stem_text: "一根木条长 $\\frac{3}{4}$ 米，写成小数是多少米？",
        student_answer: "0.75米",
        correct_answer: "3/4米",
        verdict: "WRONG",
        error_category: "CONCEPT_CONFUSION",
        brief_feedback: "答案形式不对",
        category: "分数与小数互化",
        knowledge_points: ["小数与分数"],
      },
      // (a2) LLM wrongly marks unit-equivalent "600厘米" vs "6米" as WRONG -> override to CORRECT!
      {
        index: "2",
        box_2d: [-25, 10, 350, 1080], // out-of-range coordinates -> clamp to [0, 10, 350, 1000]
        stem_text: "教室黑板长 $6$ 米，合多少厘米？",
        student_answer: "600厘米",
        correct_answer: "6米",
        verdict: "WRONG",
        error_category: "CONCEPT_CONFUSION",
        brief_feedback: "单位不一致",
        category: "长度单位换算",
        knowledge_points: ["米与厘米换算"],
      },
      // (b1) LLM falsely praises unit mismatch "6厘米" vs "6米" as CORRECT -> override to WRONG!
      {
        index: "3",
        box_2d: [400, 200, 300, 800], // inverted ymin >= ymax -> must be omitted!
        stem_text: "大树高约 $6$（ ），连同数值写出长度。",
        student_answer: "6厘米",
        correct_answer: "6米",
        verdict: "CORRECT",
        brief_feedback: "回答正确！",
        category: "长度单位",
        knowledge_points: ["长度单位感"],
      },
      // (b2) LLM falsely marks wrong number "144本" vs "72本" as CORRECT -> override to WRONG!
      {
        index: "4",
        box_2d: [520, 800, 700, 800], // degenerate xmin === xmax -> must be omitted!
        stem_text: "每箱有 $24$ 本书，$3$ 箱共有多少本书？",
        student_answer: "144本",
        correct_answer: "72本",
        correct_expr: "24 * 3",
        verdict: "CORRECT",
        brief_feedback: "算对啦！",
        category: "两位数乘一位数",
        knowledge_points: ["整数乘法"],
      },
      // (c) Whitespace-only student_answer -> forced to BLANK with MODELING_GAP!
      {
        index: "5",
        box_2d: [720, 40, 940, 960],
        stem_text: "一个长方形花坛长 $12$ 米，宽 $8$ 米，周长是多少米？",
        student_answer: "   ",
        correct_answer: "40米",
        correct_expr: "(12 + 8) * 2",
        verdict: "WRONG",
        brief_feedback: "未作答",
        category: "长方形周长",
        knowledge_points: ["长方形周长"],
      },
    ],
  };

  const res = sanitizeHomeworkCheck(asSanitizeInput(raw));

  assert.equal(res.term, "下学期");
  assert.equal(res.items.length, 5);

  // (a1) & (a2) overridden to CORRECT
  assert.equal(res.items[0].verdict, "CORRECT", "0.75米 === 3/4米 must be overridden to CORRECT");
  assert.equal(res.items[0].error_category, undefined);
  assert.deepEqual(res.items[0].box_2d, [50, 30, 180, 920]);

  assert.equal(res.items[1].verdict, "CORRECT", "600厘米 === 6米 must be overridden to CORRECT");
  assert.equal(res.items[1].error_category, undefined);
  assert.deepEqual(res.items[1].box_2d, [0, 10, 350, 1000], "out-of-range box_2d clamped to 0..1000");

  // (b1) & (b2) overridden to WRONG
  assert.equal(res.items[2].verdict, "WRONG", "6厘米 vs 6米 unit mismatch must be overridden to WRONG");
  assert.ok(res.items[2].error_category, "WRONG override must populate error_category");
  assert.equal(res.items[2].box_2d, undefined, "inverted ymin >= ymax box_2d must be omitted");

  assert.equal(res.items[3].verdict, "WRONG", "144本 vs 72本 wrong number must be overridden to WRONG");
  assert.equal(res.items[3].error_category, "EXECUTION_ERROR");
  assert.equal(res.items[3].box_2d, undefined, "degenerate xmin === xmax box_2d must be omitted");

  // (c) Blank answer forced to BLANK +图形与几何 category
  assert.equal(res.items[4].verdict, "BLANK", "whitespace student_answer must be forced to BLANK");
  assert.equal(res.items[4].student_answer, "");
  assert.equal(res.items[4].error_category, "MODELING_GAP");
  assert.equal(res.items[4].category, "图形与几何/长方形周长");
  assert.deepEqual(res.items[4].box_2d, [720, 40, 940, 960]);

  // Summary deterministically recomputed: 2 CORRECT, 2 WRONG, 1 BLANK => total 5, accuracy 40%
  assert.equal(res.summary.total, 5);
  assert.equal(res.summary.correct, 2);
  assert.equal(res.summary.wrong, 2);
  assert.equal(res.summary.blank, 1);
  assert.equal(res.summary.accuracy, 40);
  assert.ok(res.summary.encouragement.length > 0);
});

test("checkHomeworkPage: injectable ModelCaller fallback across 404/truncated JSON + metadata overrides", async () => {
  const seenModels: string[] = [];
  let attempt = 0;

  const fakeCaller = async ({ model, userNote }: { model: string; userNote?: string }) => {
    seenModels.push(model);
    attempt++;
    if (attempt === 1) {
      throw new Error('{"error":{"code":404,"message":"model retired"}}');
    }
    if (attempt === 2) {
      return '{"grade":3,"items":[{"index":"1"'; // truncated JSON -> SyntaxError retry
    }
    assert.ok(userNote === undefined || userNote.includes("随堂小测") || userNote.includes("注意余数"));
    return JSON.stringify({
      grade: 2,
      term: "上",
      detected_source: "二年级口算卡",
      encouragement: "今天做得很棒！",
      summary: { total: 2, correct: 1, wrong: 1, blank: 0, accuracy: 50, encouragement: "今天做得很棒！" },
      items: [
        {
          index: "1",
          box_2d: [100, 60, 320, 940],
          stem_text: "$125 \\times 8 = ?$",
          student_answer: "1000",
          correct_answer: "1000",
          correct_expr: "125 * 8",
          verdict: "CORRECT",
          brief_feedback: "口算准确！",
          category: "三位数乘一位数",
          knowledge_points: ["整数乘法"],
        },
        {
          index: "2",
          box_2d: [360, 60, 680, 940],
          stem_text: "有 $23$ 个苹果，每 $4$ 个装一盘，可以装几盘，还剩几个？",
          student_answer: "4盘……7个",
          correct_answer: "5盘……3个",
          verdict: "WRONG",
          error_category: "CONCEPT_CONFUSION",
          brief_feedback: "余数 7 比除数 4 大，还能再装 1 盘哦。",
          category: "有余数的除法",
          knowledge_points: ["余数小于除数"],
        },
      ],
    });
  };

  const res = await checkHomeworkPage(
    Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    "image/jpeg",
    { note: "注意余数", grade: 3, term: "下册", source: "三下随堂小测" },
    { caller: fakeCaller, models: ["m-retired-404", "m-live"], backoffMs: 0 },
  );

  assert.ok(seenModels.length >= 3, `expected fallback from 404 + SyntaxError retry, got ${seenModels.join(",")}`);
  assert.equal(res.items.length, 2);
  assert.equal(res.summary.total, 2);
  assert.equal(res.summary.correct, 1);
  assert.equal(res.summary.wrong, 1);
  assert.equal(res.summary.blank, 0);
  assert.equal(res.summary.accuracy, 50);
  assert.equal(res.items[0].verdict, "CORRECT");
  assert.equal(res.items[1].verdict, "WRONG");
  assert.equal(res.items[1].category, "数与代数/有余数的除法");
});

test("getSampleHomeworkCheck: generates valid PNG in storage & 4 graded items with 0 Gemini calls", async () => {
  const prevDb = process.env.DATABASE_URL;
  const prevBucket = process.env.GCS_BUCKET;
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.DATABASE_URL = "file::memory:?cache=shared";
  delete process.env.GCS_BUCKET;
  delete process.env.GEMINI_API_KEY; // Proves zero Gemini API key/network dependency!
  await resetDbForTests("file::memory:?cache=shared");

  try {
    const sample = await getSampleHomeworkCheck();
    assert.equal(sample.sampleImageUrl, "/api/images/samples/homework-check-demo.png");
    assert.equal(sample.items.length, 4);
    assert.equal(sample.summary.total, 4);
    assert.equal(sample.summary.correct, 2);
    assert.equal(sample.summary.wrong, 1);
    assert.equal(sample.summary.blank, 1);
    assert.equal(sample.summary.accuracy, 50);

    for (const item of sample.items) {
      assert.ok(item.box_2d, `sample item #${item.index} must include box_2d`);
      const [ymin, xmin, ymax, xmax] = item.box_2d;
      assert.ok(ymin >= 0 && ymin < ymax && ymax <= 1000, `valid vertical box_2d for #${item.index}`);
      assert.ok(xmin >= 0 && xmin < xmax && xmax <= 1000, `valid horizontal box_2d for #${item.index}`);
      assert.ok(!item.correct_answer.includes("$"), "sample correct_answer must be bare canonical text");
    }

    const storedPng = await getImage("samples/homework-check-demo.png");
    assert.ok(storedPng && storedPng.length > 100, "sample PNG stored in image_blobs");
    assert.equal(detectImageMime(storedPng), "image/png", "sample worksheet passes PNG magic-byte check");
  } finally {
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
    if (prevBucket !== undefined) process.env.GCS_BUCKET = prevBucket;
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});
