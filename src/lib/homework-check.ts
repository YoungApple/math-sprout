import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { deflateSync } from "node:zlib";
import {
  DEFAULT_MODELS,
  IncompleteDiagnosisError,
  errorCode,
  isValidErrorCategory,
  type DiagnoseOptions,
  type ErrorCategory,
  type ModelCaller,
} from "./gemini";
import {
  evaluateArithmeticExpr,
  formatRational,
  isAnswerCorrect,
  parseMathAnswer,
  rationalEquals,
  verifyDiagnosisMath,
} from "./math-answer";
import { imageUrl, putImage } from "./storage";
import { normalizeCategory, normalizeTerm, type Term } from "./taxonomy";

/**
 * Whole-page primary-school math homework checker:
 * - Segments & grades every problem on a photographed worksheet/test page (`box_2d` in 0..1000).
 * - Enforces S12 arithmetic expression auto-healing + bidirectional anti-false-grading invariants.
 * - Includes a zero-Gemini 4-problem synthetic Grade 3 worksheet demo (`getSampleHomeworkCheck`).
 */

export type CheckVerdict = "CORRECT" | "WRONG" | "BLANK";

export interface CheckedProblemItem {
  index: string;
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] clamped to 0..1000
  stem_text: string;
  student_answer: string;
  correct_answer: string;
  correct_expr?: string;
  verdict: CheckVerdict;
  error_category?: ErrorCategory;
  brief_feedback: string;
  category: string;
  knowledge_points: string[];
}

export interface HomeworkCheckResult {
  grade: number;
  term: Term | null;
  detected_source: string;
  summary: {
    total: number;
    correct: number;
    wrong: number;
    blank: number;
    accuracy: number;
    encouragement: string;
  };
  items: CheckedProblemItem[];
  sampleImageUrl?: string;
}

export interface HomeworkCheckMeta {
  note?: string;
  grade?: number;
  term?: string;
  source?: string;
}

export interface RawCheckedProblemItem {
  index?: string | number | null;
  box_2d?: number[] | null;
  stem_text?: string | null;
  student_answer?: string | null;
  correct_answer?: string | null;
  correct_expr?: string | null;
  verdict?: string | null;
  error_category?: string | null;
  brief_feedback?: string | null;
  category?: string | null;
  knowledge_points?: string[] | null;
}

export interface RawHomeworkCheckInput {
  grade?: number | null;
  term?: string | null;
  detected_source?: string | null;
  encouragement?: string | null;
  summary?: Partial<HomeworkCheckResult["summary"]> | null;
  items?: RawCheckedProblemItem[] | null;
  sampleImageUrl?: string;
}

const HOMEWORK_CHECK_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    grade: {
      type: Type.INTEGER,
      description: "Estimated Chinese primary-school grade 1-6 for this worksheet.",
    },
    term: {
      type: Type.STRING,
      description: "Estimated school term: '上学期', '下学期', or '' if unclear.",
    },
    detected_source: {
      type: Type.STRING,
      description:
        "Detected worksheet/test header title in Simplified Chinese (e.g. '三年级上册第四单元随堂练'), or a concise topic summary if untitled.",
    },
    encouragement: {
      type: Type.STRING,
      description: "Warm 1-sentence encouragement in Simplified Chinese tailored to the child's performance.",
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: {
            type: Type.STRING,
            description: "Printed problem number/label, e.g. '1', '2', '3', '一(1)'.",
          },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description:
              "Bounding box [ymin, xmin, ymax, xmax] normalized to 0..1000 covering both the printed stem and the child's written answer for this problem.",
          },
          stem_text: {
            type: Type.STRING,
            description:
              "Clean printed problem statement ONLY (exclude child's handwritten answer) in Simplified Chinese, using $...$ KaTeX for math expressions.",
          },
          student_answer: {
            type: Type.STRING,
            description:
              "What the child actually wrote as the final answer (concise value + unit, e.g. '1000', '3袋……8个', '40米'). Empty string '' if left blank/unanswered.",
          },
          correct_answer: {
            type: Type.STRING,
            description:
              "Machine-gradable canonical correct answer ONLY (e.g. '1000', '4袋……2个', '40米', '3/4米'). NEVER wrap in $...$ and NEVER include prose like '答：'.",
          },
          correct_expr: {
            type: Type.STRING,
            description:
              "Pure arithmetic expression (+, -, *, /, parentheses) evaluating to the scalar numeric part of correct_answer (e.g. '125 * 8', '(12 + 8) * 2'). Empty string '' for quotient-remainder or ratio answers.",
          },
          verdict: {
            type: Type.STRING,
            enum: ["CORRECT", "WRONG", "BLANK"],
          },
          error_category: {
            type: Type.STRING,
            description:
              "For WRONG or BLANK items, one of EXECUTION_ERROR, PERCEPTION_ERROR, CONCEPT_CONFUSION, MODELING_GAP. Empty string '' for CORRECT.",
          },
          brief_feedback: {
            type: Type.STRING,
            description:
              "1-2 concise, warm sentences in Simplified Chinese: affirm if CORRECT, pinpoint exact slip (never '粗心') if WRONG, or give a gentle entry question if BLANK.",
          },
          category: {
            type: Type.STRING,
            description:
              "Curriculum domain + topic in '<领域>/<题型>' format where <领域> is one of 数与代数, 图形与几何, 统计与概率, 综合与实践.",
          },
          knowledge_points: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "1-3 concise knowledge point tags in Simplified Chinese.",
          },
        },
        required: [
          "index",
          "box_2d",
          "stem_text",
          "student_answer",
          "correct_answer",
          "verdict",
          "brief_feedback",
          "category",
          "knowledge_points",
        ],
      },
    },
  },
  required: ["grade", "term", "detected_source", "encouragement", "items"],
};

const HOMEWORK_CHECK_PROMPT = `You are an expert, caring Chinese primary-school (小学 1-6 年级) math teacher checking a photographed homework or test page.

Tasks:
1. Detect EVERY math problem on the page in reading order (top-to-bottom, left-to-right).
2. For each problem, return:
   - index: printed problem label (e.g. "1", "2", "3").
   - box_2d: [ymin, xmin, ymax, xmax] integers in 0..1000 tightly enclosing BOTH the printed problem stem and the child's answer space.
   - stem_text: ONLY the printed problem statement (NEVER copy the child's handwritten answer into stem_text). Use $...$ KaTeX for math expressions/numbers.
   - student_answer: ONLY the child's final written answer (e.g. "1000", "3袋……8个", "0.75米"). If the child wrote an equation like "26 ÷ 6 = 3（袋）……8（个）", extract the final result "3袋……8个". If the answer region is empty/blank, student_answer MUST be "" (empty string) — never copy printed stem numbers as student_answer!
   - correct_answer: bare canonical answer + unit ONLY without $...$ or prose (e.g. "1000", "4袋……2个", "40米", "3/4米"). In division with remainder, verify 0 <= remainder < divisor and dividend = divisor * quotient + remainder!
   - correct_expr: pure arithmetic expression (+, -, *, /, parentheses) for scalar answers (e.g. "125 * 8", "(12 + 8) * 2"); "" for remainder/ratio answers.
   - verdict: "CORRECT" (equivalent value & compatible unit), "WRONG" (calculation error, remainder >= divisor, wrong unit, wrong step), or "BLANK" (unanswered).
   - error_category: for WRONG/BLANK, choose EXECUTION_ERROR, PERCEPTION_ERROR, CONCEPT_CONFUSION, or MODELING_GAP; "" for CORRECT.
   - brief_feedback: warm, concrete Simplified Chinese feedback (never vague "粗心").
   - category: "<领域>/<题型>" where <领域> is 数与代数, 图形与几何, 统计与概率, or 综合与实践.
   - knowledge_points: 1-3 specific Simplified Chinese tags.
All natural-language fields must be Simplified Chinese.`;

const DEFAULT_HOMEWORK_TIMEOUT_MS = 28_000;
const DEFAULT_HOMEWORK_BACKOFF_MS = 1_200;

function sanitizeBox2d(raw?: number[] | null): [number, number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const nums = raw.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return undefined;
  const clamp = (n: number) => Math.min(1000, Math.max(0, Math.round(n)));
  const [ymin, xmin, ymax, xmax] = nums.map(clamp);
  if (ymin < ymax && xmin < xmax) {
    return [ymin, xmin, ymax, xmax];
  }
  return undefined;
}

function healCorrectAnswer(rawAnswer: string, rawExpr?: string): string {
  const expr = rawExpr?.trim() || undefined;
  const strippedRaw = String(rawAnswer ?? "").replace(/\$/g, "").trim();
  const { diagnosis } = verifyDiagnosisMath({
    correct_answer: strippedRaw,
    correct_expr: expr,
    variants: [],
  });
  let healed = diagnosis.correct_answer.replace(/\$/g, "").trim();

  // If correct_answer was completely missing/unparseable but correct_expr evaluates cleanly, recover scalar value
  if (!healed && expr) {
    const evaluated = evaluateArithmeticExpr(expr);
    if (evaluated && evaluated.num >= 0n) {
      healed = formatRational(evaluated, true);
    }
  }
  return healed;
}

/**
 * Deterministic Double-Guard on LLM homework check output:
 * (a) Strips `$` from `correct_answer`, auto-heals scalar arithmetic via `evaluateArithmeticExpr(correct_expr)`,
 *     normalizes `category` into the 4 curriculum domains, and clamps/validates `box_2d` in `0..1000`.
 * (b) Enforces bidirectional Anti-False-Grading Invariants via `isAnswerCorrect` / `parseMathAnswer`.
 * (c) Recomputes `summary` (`total`, `correct`, `wrong`, `blank`, `accuracy`) deterministically from `items`.
 */
export function sanitizeHomeworkCheck(
  raw: RawHomeworkCheckInput,
  meta?: HomeworkCheckMeta,
): HomeworkCheckResult {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items: CheckedProblemItem[] = [];

  for (let idx = 0; idx < rawItems.length; idx++) {
    const item = rawItems[idx];
    if (!item) continue;

    const stemText = String(item.stem_text ?? "").trim();
    const correctExpr = item.correct_expr ? String(item.correct_expr).trim() || undefined : undefined;
    const correctAnswer = healCorrectAnswer(String(item.correct_answer ?? ""), correctExpr);
    if (!stemText && !correctAnswer) continue;

    const studentAnswer = String(item.student_answer ?? "").trim();
    const box2d = sanitizeBox2d(item.box_2d);
    const category = normalizeCategory(item.category).full;
    const knowledgePoints = Array.isArray(item.knowledge_points)
      ? item.knowledge_points.map((k) => String(k ?? "").trim()).filter(Boolean)
      : [];
    const rawFeedback = String(item.brief_feedback ?? "").trim();
    const validErrCat = isValidErrorCategory(item.error_category) ? item.error_category : undefined;
    const rawVerdict = String(item.verdict ?? "").toUpperCase();

    let verdict: CheckVerdict;
    let errorCategory: ErrorCategory | undefined;
    let briefFeedback: string;

    if (!studentAnswer) {
      // (b.1) Empty/whitespace student answer -> BLANK + MODELING_GAP default
      verdict = "BLANK";
      errorCategory = validErrCat ?? "MODELING_GAP";
      briefFeedback = rawFeedback || "这道题还没有动笔作答，可以先圈出题目中的已知条件试试看。";
    } else {
      const rhsCandidate = studentAnswer.includes("=") ? studentAnswer.split("=").pop()!.trim() : "";
      const equivalent =
        Boolean(correctAnswer) &&
        (isAnswerCorrect(studentAnswer, correctAnswer) ||
          (Boolean(rhsCandidate) && isAnswerCorrect(rhsCandidate, correctAnswer)));

      if (equivalent) {
        // (b.2) Never falsely mark a mathematically equivalent / unit-converted right answer as WRONG!
        verdict = "CORRECT";
        errorCategory = undefined;
        briefFeedback =
          rawVerdict === "CORRECT" && rawFeedback
            ? rawFeedback
            : "作答正确！数值与单位完全准确，思路非常清晰！";
      } else {
        const uParsed = parseMathAnswer(rhsCandidate || studentAnswer) ?? parseMathAnswer(studentAnswer);
        const eParsed = parseMathAnswer(correctAnswer);
        const bothConcreteMath =
          uParsed !== null && uParsed.kind !== "text" && eParsed !== null && eParsed.kind !== "text";

        if (rawVerdict === "CORRECT" && bothConcreteMath) {
          // (b.3) Never let an answer/unit mismatch slip through as CORRECT when both parse as concrete math values!
          verdict = "WRONG";
          errorCategory = validErrCat ?? "EXECUTION_ERROR";
          const sameNumberWrongUnit =
            uParsed.kind === "rational" &&
            eParsed.kind === "rational" &&
            rationalEquals(uParsed.value, eParsed.value);
          briefFeedback = sameNumberWrongUnit
            ? `数值计算正确，但单位不一致（写了「${studentAnswer}」，应为「${correctAnswer}」），记得核对题目要求的单位哦。`
            : `作答结果与标准答案不一致（写了「${studentAnswer}」，正确结果为「${correctAnswer}」），请复查列式与计算过程。`;
        } else if (rawVerdict === "CORRECT") {
          verdict = "CORRECT";
          errorCategory = undefined;
          briefFeedback = rawFeedback || "作答正确，继续保持！";
        } else {
          verdict = "WRONG";
          errorCategory = validErrCat ?? "EXECUTION_ERROR";
          briefFeedback =
            rawFeedback || `当前作答为「${studentAnswer}」，标准答案为「${correctAnswer}」，建议复查关键步骤。`;
        }
      }
    }

    const sanitizedItem: CheckedProblemItem = {
      index: String(item.index ?? idx + 1).trim() || String(idx + 1),
      ...(box2d ? { box_2d: box2d } : {}),
      stem_text: stemText || `第 ${idx + 1} 题`,
      student_answer: studentAnswer,
      correct_answer: correctAnswer,
      ...(correctExpr ? { correct_expr: correctExpr } : {}),
      verdict,
      ...(errorCategory ? { error_category: errorCategory } : {}),
      brief_feedback: briefFeedback,
      category,
      knowledge_points: knowledgePoints,
    };
    items.push(sanitizedItem);
  }

  const total = items.length;
  const correct = items.filter((i) => i.verdict === "CORRECT").length;
  const wrong = items.filter((i) => i.verdict === "WRONG").length;
  const blank = items.filter((i) => i.verdict === "BLANK").length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const rawGrade = meta?.grade ?? raw?.grade;
  const grade = Math.min(6, Math.max(1, Math.round(Number(rawGrade) || 3)));
  const term = normalizeTerm(meta?.term) ?? normalizeTerm(raw?.term);
  const detectedSource =
    (meta?.source ?? "").trim() || String(raw?.detected_source ?? "").trim() || `${grade}年级数学作业练习`;

  const rawEncouragement = String(raw?.encouragement ?? raw?.summary?.encouragement ?? "").trim();
  let encouragement = rawEncouragement;
  if (total === 0) {
    encouragement = rawEncouragement || "暂未识别到题目，请对准整页作业重新拍摄清晰照片。";
  } else if (wrong === 0 && blank === 0) {
    if (!encouragement || /错|未答|空白/.test(encouragement)) {
      encouragement = `太棒啦！整页 ${total} 道题全部答对，计算扎实、审题细致，为你点赞！`;
    }
  } else if (!encouragement || /全部答对|全对|满分/.test(encouragement)) {
    encouragement =
      correct > 0
        ? `已经稳稳拿下了 ${correct} 道题！把剩下的 ${wrong + blank} 道待攻克题目收进错题本，一步步搞懂它吧！`
        : `别灰心，发现卡点正是进步的起点！勾选下面需要巩固的 ${wrong + blank} 道题收进错题本，我们一起攻克！`;
  }

  return {
    grade,
    term,
    detected_source: detectedSource,
    summary: {
      total,
      correct,
      wrong,
      blank,
      accuracy,
      encouragement,
    },
    items,
    ...(raw?.sampleImageUrl ? { sampleImageUrl: raw.sampleImageUrl } : {}),
  };
}

function buildMetaPrompt(meta?: HomeworkCheckMeta): string {
  const parts: string[] = ["Check every math problem on this homework/test page."];
  if (meta?.grade && Number.isFinite(meta.grade)) parts.push(`Grade hint: 小学${meta.grade}年级`);
  const normTerm = normalizeTerm(meta?.term);
  if (normTerm) parts.push(`Term hint: ${normTerm}`);
  if (meta?.source?.trim()) parts.push(`Worksheet source: ${meta.source.trim()}`);
  if (meta?.note?.trim()) parts.push(`Parent's note: ${meta.note.trim()}`);
  return parts.join("\n");
}

function createDefaultHomeworkCaller(): ModelCaller {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, image, mimeType, userNote, signal }) => {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: image.toString("base64") } },
            { text: userNote || "Check every math problem on this homework/test page." },
          ],
        },
      ],
      config: {
        systemInstruction: HOMEWORK_CHECK_PROMPT,
        responseMimeType: "application/json",
        responseSchema: HOMEWORK_CHECK_SCHEMA,
        temperature: 0.2,
        abortSignal: signal,
      },
    });
    const text = res.text;
    if (!text) throw new IncompleteDiagnosisError("Gemini returned an empty homework check response");
    return text;
  };
}

export async function checkHomeworkPage(
  image: Buffer,
  mimeType: string,
  meta?: HomeworkCheckMeta,
  opts: DiagnoseOptions = {},
): Promise<HomeworkCheckResult> {
  const caller = opts.caller ?? createDefaultHomeworkCaller();
  const envModels = (process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = opts.models?.length ? opts.models : [...new Set([...envModels, ...DEFAULT_MODELS])];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HOMEWORK_TIMEOUT_MS;
  const backoffMs = opts.backoffMs ?? DEFAULT_HOMEWORK_BACKOFF_MS;
  const promptNote = buildMetaPrompt(meta);

  let lastErr: unknown;
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const text = await caller({ model, image, mimeType, userNote: promptNote, signal });
        const parsed = JSON.parse(text) as RawHomeworkCheckInput;
        const sanitized = sanitizeHomeworkCheck(parsed, meta);
        if (sanitized.items.length === 0) {
          throw new IncompleteDiagnosisError("Homework check returned 0 items");
        }
        return sanitized;
      } catch (err) {
        lastErr = err;
        const code = errorCode(err);
        if (code === 401 || code === 403) throw err;
        if (code === 404) break;
        if (attempt === 0 && backoffMs > 0) {
          await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
        }
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI 批改暂时繁忙，请稍后再试");
}

const SAMPLE_HOMEWORK_IMAGE_KEY = "samples/homework-check-demo.png";

/**
 * Zero-Gemini 1-click demo for whole-page homework check:
 * writes a crisp 4-band Grade 3 worksheet PNG via node:zlib and returns 2 CORRECT + 1 WRONG + 1 BLANK items.
 */
export async function getSampleHomeworkCheck(): Promise<HomeworkCheckResult> {
  const png = buildSampleHomeworkPng();
  await putImage(SAMPLE_HOMEWORK_IMAGE_KEY, png, "image/png");

  return sanitizeHomeworkCheck({
    grade: 3,
    term: "上学期",
    detected_source: "示例作业 · 三年级数学随堂综合练",
    encouragement: "前两道计算题全对，基础很扎实！第 3 题注意“余数必须比除数小”，第 4 题一起画个长方形试试看吧！",
    sampleImageUrl: imageUrl(SAMPLE_HOMEWORK_IMAGE_KEY),
    items: [
      {
        index: "1",
        box_2d: [115, 45, 290, 955],
        stem_text: "口算：$125 \\times 8 = ?$",
        student_answer: "1000",
        correct_answer: "1000",
        correct_expr: "125 * 8",
        verdict: "CORRECT",
        brief_feedback: "凑整乘法掌握得很熟练，$125 \\times 8 = 1000$ 一步到位！",
        category: "数与代数/多位数乘一位数",
        knowledge_points: ["多位数乘一位数", "125×8特殊凑整"],
      },
      {
        index: "2",
        box_2d: [315, 45, 495, 955],
        stem_text: "三年级 $4$ 个班一共捐书 $240$ 本，平均每个班捐书多少本？",
        student_answer: "60本",
        correct_answer: "60本",
        correct_expr: "240 / 4",
        verdict: "CORRECT",
        brief_feedback: "平均分数量关系列式准确，商末尾的 $0$ 和单位“本”都没有漏掉！",
        category: "数与代数/除数是一位数的除法",
        knowledge_points: ["整百整十数除以一位数", "平均分应用题"],
      },
      {
        index: "3",
        box_2d: [520, 45, 735, 955],
        stem_text: "有 $23$ 个苹果，每 $4$ 个装一盘，可以装几盘，还剩几个？",
        student_answer: "4盘……7个",
        correct_answer: "5盘……3个",
        verdict: "WRONG",
        error_category: "CONCEPT_CONFUSION",
        brief_feedback:
          "孩子列出了 $23 \\div 4 = 4(\\text{盘})\\cdots\\cdots 7(\\text{个})$，余数 $7$ 比除数 $4$ 还大，说明剩下的 $7$ 个苹果还能再装满 $1$ 盘哦。",
        category: "数与代数/有余数的除法",
        knowledge_points: ["有余数的除法", "余数小于除数"],
      },
      {
        index: "4",
        box_2d: [760, 45, 965, 955],
        stem_text: "一块长方形菜地长 $12$ 米，宽 $8$ 米。如果在菜地四周围上一圈篱笆，篱笆一共长多少米？",
        student_answer: "",
        correct_answer: "40米",
        correct_expr: "(12 + 8) * 2",
        verdict: "BLANK",
        error_category: "MODELING_GAP",
        brief_feedback:
          "这道题空着没动笔。“在四周围上一圈篱笆”求的是长方形的周长还是面积呢？先标出两条长和两条宽试试看！",
        category: "图形与几何/长方形与正方形周长",
        knowledge_points: ["长方形的周长", "周长实际应用"],
      },
    ],
  });
}

function buildSampleHomeworkPng(): Buffer {
  const width = 400;
  const height = 520;
  const rowStride = 1 + width * 3;
  const raw = Buffer.alloc(rowStride * height);

  const bands = [
    { y0: 60, y1: 150, kind: "correct" as const },
    { y0: 164, y1: 257, kind: "correct" as const },
    { y0: 270, y1: 382, kind: "wrong" as const },
    { y0: 395, y1: 502, kind: "blank" as const },
  ];

  // Fill background + paper grid
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      let r = 253,
        g = 251,
        b = 246;
      // Top worksheet title banner
      if (y >= 14 && y <= 44 && x >= 18 && x <= width - 18) {
        r = 241;
        g = 245;
        b = 249;
      }
      if (y >= 25 && y <= 33 && x >= 110 && x <= 290) {
        r = 51;
        g = 65;
        b = 85;
      }
      // Left margin line
      if (x === 28) {
        r = 252;
        g = 165;
        b = 165;
      }
      // Subtle horizontal rules between problem bands
      if (y === 157 || y === 263 || y === 388) {
        r = 226;
        g = 232;
        b = 240;
      }
      const px = rowOffset + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const px = y * rowStride + 1 + x * 3;
    raw[px] = r;
    raw[px + 1] = g;
    raw[px + 2] = b;
  };

  const fillRect = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        setPixel(x, y, r, g, b);
      }
    }
  };

  const drawThickLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    r: number,
    g: number,
    b: number,
  ) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(x0 + ((x1 - x0) * i) / steps);
      const cy = Math.round(y0 + ((y1 - y0) * i) / steps);
      for (let dy = -thickness; dy <= thickness; dy++) {
        for (let dx = -thickness; dx <= thickness; dx++) {
          setPixel(cx + dx, cy + dy, r, g, b);
        }
      }
    }
  };

  for (let idx = 0; idx < bands.length; idx++) {
    const band = bands[idx];
    // Number badge square
    fillRect(40, band.y0 + 10, 56, band.y0 + 26, 203, 213, 225);
    // Simulated printed stem lines
    fillRect(66, band.y0 + 12, 330, band.y0 + 18, 71, 85, 105);
    if (idx >= 1) {
      fillRect(66, band.y0 + 30, idx === 3 ? 345 : 275, band.y0 + 36, 100, 116, 139);
    }

    const ansY = band.y0 + (idx === 0 ? 46 : 62);
    if (band.kind === "correct") {
      // Blue handwritten equation bar + emerald checkmark
      fillRect(72, ansY, idx === 0 ? 180 : 215, ansY + 7, 37, 99, 235);
      drawThickLine(334, ansY + 4, 344, ansY + 14, 2, 16, 185, 129);
      drawThickLine(344, ansY + 14, 364, ansY - 6, 2, 16, 185, 129);
    } else if (band.kind === "wrong") {
      // Blue handwritten division with remainder + rose red X mark
      fillRect(72, ansY, 248, ansY + 7, 37, 99, 235);
      drawThickLine(334, ansY - 8, 360, ansY + 18, 2, 225, 29, 72);
      drawThickLine(360, ansY - 8, 334, ansY + 18, 2, 225, 29, 72);
    } else {
      // Dashed empty answer underline for BLANK problem
      for (let x = 72; x <= 260; x += 14) {
        fillRect(x, ansY + 12, x + 8, ansY + 14, 148, 163, 184);
      }
      // Amber circle outline indicator
      for (let deg = 0; deg < 360; deg += 4) {
        const rad = (deg * Math.PI) / 180;
        const cx = Math.round(347 + 13 * Math.cos(rad));
        const cy = Math.round(ansY + 5 + 13 * Math.sin(rad));
        fillRect(cx - 1, cy - 1, cx + 1, cy + 1, 217, 119, 6);
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const idatData = deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idatData),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
