import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type { CheckedProblemItem } from "./homework-check";
import { verifyDiagnosisMath } from "./math-answer";
import { normalizeCategory } from "./taxonomy";

/**
 * Gemini multimodal diagnosis with Structured Outputs, deterministic S12 math auto-heal,
 * allowlist SVG sanitization, per-call timeout, and injectable ModelCaller test seam.
 */

export type ErrorCategory =
  | "EXECUTION_ERROR"
  | "PERCEPTION_ERROR"
  | "CONCEPT_CONFUSION"
  | "MODELING_GAP";

export const VALID_ERROR_CATEGORIES: readonly ErrorCategory[] = [
  "EXECUTION_ERROR",
  "PERCEPTION_ERROR",
  "CONCEPT_CONFUSION",
  "MODELING_GAP",
];

export function isValidErrorCategory(val: unknown): val is ErrorCategory {
  return typeof val === "string" && (VALID_ERROR_CATEGORIES as readonly string[]).includes(val);
}

export interface DiagnosedVariant {
  level: "L1" | "L2" | "L3";
  stem: string;
  answer: string;
  answer_expr?: string;
  explanation: string;
}

export interface Diagnosis {
  stem_text: string;
  student_answer: string;
  correct_answer: string;
  correct_expr?: string;
  grade: number;
  category: string;
  error_category: ErrorCategory;
  root_cause: string;
  knowledge_points: string[];
  socratic_hints: string[];
  svg_diagram?: string;
  variants: DiagnosedVariant[];
}

export class IncompleteDiagnosisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteDiagnosisError";
  }
}

export type ModelCaller = (params: {
  model: string;
  image: Buffer;
  mimeType: string;
  userNote?: string;
  signal: AbortSignal;
}) => Promise<string>;

export interface DiagnoseOptions {
  caller?: ModelCaller;
  models?: string[];
  timeoutMs?: number;
  backoffMs?: number;
  checkedContext?: Partial<CheckedProblemItem>;
}

const DIAGNOSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    stem_text: {
      type: Type.STRING,
      description: "The clean problem statement in Simplified Chinese, Markdown with $...$ KaTeX for math.",
    },
    student_answer: {
      type: Type.STRING,
      description: "What the child actually wrote as the final answer (concise, no prose). Empty string if blank.",
    },
    correct_answer: {
      type: Type.STRING,
      description:
        "Machine-gradable canonical final answer ONLY (number + unit, e.g. '72本', '3/4米', '5盘……3个', '3:4'). NEVER include $...$ LaTeX or prose like '答：'/'可以装'.",
    },
    correct_expr: {
      type: Type.STRING,
      description:
        "Pure arithmetic expression using +, -, *, /, () that evaluates to the scalar numeric part of correct_answer (e.g. '36 * 3 - 36'). Empty string for remainder/ratio/non-scalar answers.",
    },
    grade: { type: Type.INTEGER, description: "Estimated Chinese primary-school grade 1-6 for this problem." },
    category: {
      type: Type.STRING,
      description:
        "Curriculum domain + topic path in '<领域>/<题型>' format where <领域> is one of 数与代数, 图形与几何, 统计与概率, 综合与实践 (e.g. 数与代数/倍数应用题 or 图形与几何/长方形周长).",
    },
    error_category: {
      type: Type.STRING,
      enum: ["EXECUTION_ERROR", "PERCEPTION_ERROR", "CONCEPT_CONFUSION", "MODELING_GAP"],
    },
    root_cause: {
      type: Type.STRING,
      description:
        "Concrete breakpoint in the child's work, written for a parent. Never just '粗心'. If the child's original answer was actually correct, warmly affirm it and focus on consolidating the method.",
    },
    knowledge_points: { type: Type.ARRAY, items: { type: Type.STRING } },
    socratic_hints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Exactly 3 progressively stronger hints addressed to the child; never reveal the final answer.",
    },
    svg_diagram: {
      type: Type.STRING,
      description:
        "Optional inline <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 160' width='400' height='160'> bar model / number line visualising known quantities and '?' for unknowns. NEVER write the final answer or solved equation in the SVG! Empty string if not helpful.",
    },
    variants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          level: { type: Type.STRING, enum: ["L1", "L2", "L3"] },
          stem: { type: Type.STRING, description: "Problem statement in Simplified Chinese with $...$ for math." },
          answer: {
            type: Type.STRING,
            description:
              "Machine-gradable canonical answer ONLY (e.g. '75本', '3/4米', '5盘……4个'). NO $...$ LaTeX, NO conversational prose.",
          },
          answer_expr: {
            type: Type.STRING,
            description:
              "Pure arithmetic expression (+, -, *, /, parentheses) evaluating to the scalar numeric answer (e.g. '25 * 4 - 25'). Empty string for remainder/ratio answers.",
          },
          explanation: { type: Type.STRING, description: "Step-by-step explanation in Simplified Chinese with $...$ math." },
        },
        required: ["level", "stem", "answer", "explanation"],
      },
    },
  },
  required: [
    "stem_text",
    "student_answer",
    "correct_answer",
    "grade",
    "category",
    "error_category",
    "root_cause",
    "knowledge_points",
    "socratic_hints",
    "variants",
  ],
};

const SYSTEM_PROMPT = `You are an expert Chinese primary-school (小学 1-6 年级) math teacher and learning diagnostician.
You receive a photo of ONE math problem (or a cropped section with a specified target problem), usually including the child's handwriting and teacher marks.

Tasks:
1. Transcribe the clean problem statement (ignore handwriting and marks; if a target problem context is provided in the note, focus EXCLUSIVELY on that problem). Use $...$ for math inside stem_text, root_cause, socratic_hints, and explanation.
2. Read the child's written work/answer and compare it step by step with the correct solution:
   - If the child got the problem WRONG, locate the exact reasoning or calculation breakpoint.
   - If the child left the problem BLANK, note warmly in root_cause that the problem was unanswered (MODELING_GAP) and pinpoint the first quantity relation needed to get started.
   - IMPORTANT: If the child's original written answer is actually CORRECT (mathematically equivalent to correct_answer), NEVER invent or fabricate a fake error! Warmly note in root_cause that the child's original attempt was correct, highlight the core method worth consolidating, and still generate Socratic review questions and L1-L3 transfer variants.
3. Classify error_category:
   - EXECUTION_ERROR: calculation/carry/borrow/copy mistakes, missing/wrong units.
   - PERCEPTION_ERROR: misread or skipped a condition, misunderstood a keyword, answered the wrong question.
   - CONCEPT_CONFUSION: mixed up concepts/formulas (perimeter vs area, remainder >= divisor, fraction ratio vs concrete quantity, unit conversion...).
   - MODELING_GAP: could not build the quantity relation; blank or irrelevant equations.
   "粗心" is never an acceptable explanation; name the specific slip.
4. Set category as "<领域>/<题型>" where <领域> is one of 数与代数, 图形与几何, 统计与概率, 综合与实践.
5. Write exactly 3 Socratic hints for the child (亲切、简短、一步一问), strongest hint last, NEVER stating the final numeric answer.
6. If helpful, draw a clean <svg viewBox="0 0 400 160" width="400" height="160"> bar model or number line. CRITICAL: Use "?" for unknown target quantities — NEVER write the final answer or solved equation in svg_diagram!
7. Generate exactly 3 variant problems (L1, L2, L3):
   - L1: same wording skeleton, only numbers changed.
   - L2: same quantity relation, new real-life context a child would enjoy.
   - L3: swap a known and the unknown or add one extra step, STRICTLY staying within the diagnosed grade's curriculum (e.g., NEVER introduce Grade 6 fraction division or algebraic equations in a Grade 1-4 problem).
   - Every answer MUST be realistic (whole numbers for discrete items — never 3.5 人).
   - Format correct_answer and variants[].answer as bare canonical value + unit ONLY (e.g. "72本", "3/4米", "5盘……3个", "3:4"): NEVER wrap answers in $...$ and NEVER write prose like "可以装5盘，还剩3个" or "答：".
   - Provide correct_expr and variants[].answer_expr (e.g. "25 * 4 - 25") for scalar answers so arithmetic can be verified.
All natural-language output must be Simplified Chinese.`;

/** Ordered fallback chain benchmarked on live API key; override via GEMINI_MODEL="a,b". */
export const DEFAULT_MODELS = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
];

const DEFAULT_TIMEOUT_MS = 22_000;
const DEFAULT_BACKOFF_MS = 1_200;

/** Formats a verified homework-check item into a structured target-problem note for single-problem diagnosis. */
export function buildCheckedContextNote(
  checked?: Partial<CheckedProblemItem>,
  userNote?: string,
): string | undefined {
  if (!checked) return userNote;
  const lines: string[] = [
    `[整页批改指定目标题 #${checked.index ?? "1"} — 即使图片边缘出现其他题，也请仅针对本道题生成诊断、启发提示、线段图与 L1-L3 变式]`,
  ];
  if (checked.stem_text) lines.push(`题干：${checked.stem_text}`);
  lines.push(`孩子作答：${checked.student_answer?.trim() ? checked.student_answer : "（未作答/空白）"}`);
  if (checked.correct_answer) lines.push(`已核验标准答案：${checked.correct_answer}`);
  if (checked.verdict) lines.push(`批改结论：${checked.verdict}`);
  if (checked.error_category) lines.push(`初步错因分类：${checked.error_category}`);
  if (checked.category) lines.push(`题型分类：${checked.category}`);
  if (checked.brief_feedback) lines.push(`批改简评：${checked.brief_feedback}`);
  if (userNote?.trim()) lines.push(`家长补充说明：${userNote.trim()}`);
  return lines.join("\n");
}

export async function diagnoseMistake(
  image: Buffer,
  mimeType: string,
  userNote?: string,
  opts: DiagnoseOptions = {},
): Promise<Diagnosis> {
  const caller = opts.caller ?? createDefaultCaller();
  const envModels = (process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = opts.models?.length ? opts.models : [...new Set([...envModels, ...DEFAULT_MODELS])];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const effectiveNote = buildCheckedContextNote(opts.checkedContext, userNote);

  let lastErr: unknown;
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const text = await caller({ model, image, mimeType, userNote: effectiveNote, signal });
        const parsed = JSON.parse(text) as Diagnosis;
        const sanitized = sanitizeDiagnosis(parsed);
        // When importing a verified item from homework-check, preserve its verified category/error_category if meaningful
        if (opts.checkedContext?.category) {
          sanitized.category = normalizeCategory(opts.checkedContext.category).full;
        }
        if (opts.checkedContext?.error_category && isValidErrorCategory(opts.checkedContext.error_category)) {
          sanitized.error_category = opts.checkedContext.error_category;
        }
        return sanitized;
      } catch (err) {
        lastErr = err;
        const code = errorCode(err);
        // Unauthenticated / invalid key -> fail fast instead of burning retries across all models
        if (code === 401 || code === 403) throw err;
        // Model retired or unavailable for this key -> advance immediately to next model
        if (code === 404) break;
        // Retryable: 429/500/502/503/504, per-call timeout/AbortError, truncated JSON SyntaxError, or <3 variants
        if (attempt === 0 && backoffMs > 0) {
          await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
        }
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI 诊断暂时繁忙，请稍后再试");
}

function createDefaultCaller(): ModelCaller {
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
            { text: userNote ? `Parent's note:\n${userNote}` : "Diagnose this math problem." },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: DIAGNOSIS_SCHEMA,
        temperature: 0.3,
        abortSignal: signal,
      },
    });
    const text = res.text;
    if (!text) throw new IncompleteDiagnosisError("Gemini returned an empty response");
    return text;
  };
}

export function errorCode(err: unknown): number | undefined {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/"code"\s*:\s*(\d{3})/) ?? msg.match(/\b(401|403|404|429|500|502|503|504)\b/);
  return m ? Number(m[1]) : undefined;
}

const ALLOWED_SVG_TAGS = new Set([
  "svg",
  "g",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "defs",
  "marker",
  "clippath",
  "lineargradient",
  "stop",
  "title",
  "desc",
]);

const FORBIDDEN_SUBTREE_TAGS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "style",
  "link",
  "meta",
  "use",
  "image",
  "a",
  "set",
  "animate",
  "animateTransform",
  "animateMotion",
];

/**
 * Allowlist SVG sanitizer + viewBox/width/height normalizer so SVGs are safe both in DOM
 * and inside a sandboxed <img src="data:image/svg+xml,..."> element.
 */
export function sanitizeSvg(raw?: string | null): string {
  if (!raw) return "";
  const match = raw.trim().match(/<svg\b[\s\S]*<\/svg>/i);
  if (!match) return "";
  let svg = match[0];

  // 1. Remove dangerous container subtrees and standalone tags completely
  for (const tag of FORBIDDEN_SUBTREE_TAGS) {
    const pairRe = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    const singleRe = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    svg = svg.replace(pairRe, "").replace(singleRe, "");
  }
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Strip any non-allowlisted tag and scrub dangerous attributes on kept tags
  svg = svg.replace(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g, (full, rawTag: string, rawAttrs: string) => {
    const lower = rawTag.toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(lower)) return "";
    if (full.startsWith("</")) return `</${rawTag}>`;

    const selfClosing = /\/\s*>$/.test(full);
    let attrs = selfClosing ? rawAttrs.replace(/\/\s*$/, "") : rawAttrs;

    // Strip event handlers (onload, onclick, onbegin, ...), href/xlink:href, and dangerous URI schemes
    attrs = attrs
      .replace(/\s+on[a-zA-Z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(
        /\s+[a-zA-Z0-9_:-]+\s*=\s*(?:"[^"]*(?:javascript:|data:text\/html|vbscript:)[^"]*"|'[^']*(?:javascript:|data:text\/html|vbscript:)[^']*')/gi,
        "",
      );

    // Strip url(...) or expression(...) inside inline style attributes
    attrs = attrs.replace(/\s+style\s*=\s*"([^"]*)"/gi, (_m, css: string) => {
      if (/url\s*\(|expression\s*\(|javascript:/i.test(css)) return "";
      return ` style="${css}"`;
    });
    attrs = attrs.replace(/\s+style\s*=\s*'([^']*)'/gi, (_m, css: string) => {
      if (/url\s*\(|expression\s*\(|javascript:/i.test(css)) return "";
      return ` style="${css}"`;
    });

    return `<${rawTag}${attrs}${selfClosing ? " />" : ">"}`;
  });

  // 3. Ensure root <svg> carries xmlns, viewBox, and explicit width/height (required for <img> intrinsic ratio)
  svg = svg.replace(/^<svg\b([^>]*)>/i, (_full, rawAttrs: string) => {
    let attrs = rawAttrs;
    if (!/\bxmlns\s*=/i.test(attrs)) {
      attrs += ` xmlns="http://www.w3.org/2000/svg"`;
    }
    let vbW = "400";
    let vbH = "160";
    const vbMatch = attrs.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    if (vbMatch) {
      vbW = vbMatch[1];
      vbH = vbMatch[2];
    } else {
      attrs += ` viewBox="0 0 400 160"`;
    }
    if (!/\bwidth\s*=/i.test(attrs)) {
      attrs += ` width="${vbW}"`;
    }
    if (!/\bheight\s*=/i.test(attrs)) {
      attrs += ` height="${vbH}"`;
    }
    return `<svg${attrs}>`;
  });

  return svg.trim();
}

/**
 * Enforces structural & mathematical invariants on Gemini's Diagnosis output:
 * - Exactly 3 ordered variants (L1, L2, L3) with non-empty stems & answers.
 * - Canonicalized answers + zero-latency S12 expression auto-heal.
 * - Normalized curriculum domain category (`<领域>/<题型>`).
 * - Allowlist-sanitized SVG diagram and clamped grade 1..6.
 */
export function sanitizeDiagnosis(raw: Diagnosis): Diagnosis {
  const stemText = String(raw.stem_text ?? "").trim();
  if (!stemText) {
    throw new IncompleteDiagnosisError("Diagnosis missing stem_text");
  }

  const byLevel = new Map<string, DiagnosedVariant>();
  for (const v of raw.variants ?? []) {
    if (
      (v.level === "L1" || v.level === "L2" || v.level === "L3") &&
      !byLevel.has(v.level) &&
      String(v.stem ?? "").trim() &&
      String(v.answer ?? "").trim()
    ) {
      byLevel.set(v.level, {
        level: v.level,
        stem: String(v.stem).trim(),
        answer: String(v.answer).trim(),
        answer_expr: v.answer_expr ? String(v.answer_expr).trim() : undefined,
        explanation: String(v.explanation ?? "").trim(),
      });
    }
  }
  const orderedVariants = (["L1", "L2", "L3"] as const)
    .map((l) => byLevel.get(l))
    .filter((v): v is DiagnosedVariant => Boolean(v));
  if (orderedVariants.length < 3) {
    throw new IncompleteDiagnosisError(`Expected 3 variant levels (L1, L2, L3), got ${orderedVariants.length}`);
  }

  const errorCategory: ErrorCategory = isValidErrorCategory(raw.error_category)
    ? raw.error_category
    : "CONCEPT_CONFUSION";

  const hints = (raw.socratic_hints ?? [])
    .map((h) => String(h ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);

  const normalized: Diagnosis = {
    stem_text: stemText,
    student_answer: String(raw.student_answer ?? "").trim(),
    correct_answer: String(raw.correct_answer ?? "").trim(),
    correct_expr: raw.correct_expr ? String(raw.correct_expr).trim() : undefined,
    grade: Math.min(6, Math.max(1, Math.round(Number(raw.grade) || 3))),
    category: normalizeCategory(raw.category).full,
    error_category: errorCategory,
    root_cause: String(raw.root_cause ?? "").trim() || "在数量关系转换步骤出现偏差。",
    knowledge_points: (raw.knowledge_points ?? []).map((k) => String(k).trim()).filter(Boolean),
    socratic_hints: hints.length > 0 ? hints : ["先圈出题目里的已知数量和问题单位，再想一想它们之间是什么关系？"],
    svg_diagram: sanitizeSvg(raw.svg_diagram),
    variants: orderedVariants,
  };

  const { diagnosis, warnings } = verifyDiagnosisMath(normalized);
  if (warnings.length > 0) {
    console.warn("[math-sprout] S12 math verifier warnings:", warnings);
  }
  return diagnosis;
}

export { sanitizeDiagnosis as sanitize };
