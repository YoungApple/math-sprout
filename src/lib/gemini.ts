import { GoogleGenAI, Type, type Schema } from "@google/genai";

/**
 * Gemini multimodal diagnosis with Structured Outputs.
 * One call does: OCR of the stem, extraction of the child's answer/work,
 * root-cause classification, Socratic hints, and L1/L2/L3 variant questions.
 */

export type ErrorCategory = "EXECUTION_ERROR" | "PERCEPTION_ERROR" | "CONCEPT_CONFUSION" | "MODELING_GAP";

export interface Diagnosis {
  stem_text: string;
  student_answer: string;
  correct_answer: string;
  grade: number;
  category: string;
  error_category: ErrorCategory;
  root_cause: string;
  knowledge_points: string[];
  socratic_hints: string[];
  svg_diagram?: string;
  variants: { level: "L1" | "L2" | "L3"; stem: string; answer: string; explanation: string }[];
}

const DIAGNOSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    stem_text: { type: Type.STRING, description: "The clean problem statement in Simplified Chinese, Markdown with $...$ KaTeX for math." },
    student_answer: { type: Type.STRING, description: "What the child actually wrote as the final answer. Empty string if blank." },
    correct_answer: { type: Type.STRING, description: "The correct final answer, concise (number + unit)." },
    grade: { type: Type.INTEGER, description: "Estimated primary-school grade 1-6 for this problem." },
    category: { type: Type.STRING, description: "Topic path, e.g. 数与代数/分数应用题 or 图形与几何/长方形面积." },
    error_category: { type: Type.STRING, enum: ["EXECUTION_ERROR", "PERCEPTION_ERROR", "CONCEPT_CONFUSION", "MODELING_GAP"] },
    root_cause: { type: Type.STRING, description: "Concrete breakpoint in the child's work, written for a parent. Never just '粗心'." },
    knowledge_points: { type: Type.ARRAY, items: { type: Type.STRING } },
    socratic_hints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exactly 3 progressively stronger hints addressed to the child; never reveal the final answer." },
    svg_diagram: { type: Type.STRING, description: "Optional inline <svg> (viewBox 0 0 400 160) bar model / number line that visualises the quantity relation. Empty string if not helpful." },
    variants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          level: { type: Type.STRING, enum: ["L1", "L2", "L3"] },
          stem: { type: Type.STRING },
          answer: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ["level", "stem", "answer", "explanation"],
      },
    },
  },
  required: ["stem_text", "student_answer", "correct_answer", "grade", "category", "error_category", "root_cause", "knowledge_points", "socratic_hints", "variants"],
};

const SYSTEM_PROMPT = `You are an expert Chinese primary-school (小学 1-6 年级) math teacher and learning diagnostician.
You receive a photo of ONE problem the child got wrong, usually including the child's handwriting and red-pen marks.

Tasks:
1. Transcribe the clean problem statement (ignore handwriting and marks). Use $...$ for math.
2. Read the child's written work/answer. Compare it step by step with the correct solution and locate the exact breakpoint.
3. Classify the root cause:
   - EXECUTION_ERROR: calculation/carry/borrow/copy mistakes, missing units.
   - PERCEPTION_ERROR: misread or skipped a condition, misunderstood a keyword, answered the wrong question.
   - CONCEPT_CONFUSION: mixed up concepts/formulas (perimeter vs area, remainder rules, unit conversion...).
   - MODELING_GAP: could not build the quantity relation; no or irrelevant equations.
   "粗心" is never an acceptable explanation; name the specific slip.
4. Write exactly 3 Socratic hints for the child (亲切、简短、一步一问), strongest hint last, never stating the final answer.
5. Generate exactly 3 variant problems:
   - L1: same wording skeleton, only numbers changed.
   - L2: same quantity relation, new real-life context a child would enjoy.
   - L3: swap a known and the unknown (reverse reasoning) or add one extra step.
   All answers must be verifiable, within the child's grade, and must come out as whole numbers or simple fractions (never 3.5 人).
   Double-check every variant's arithmetic before answering.
All natural-language output must be Simplified Chinese.`;

/** Models tried in order; override with GEMINI_MODEL="a,b,c". Aliases track the newest stable release. */
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest"];

export async function diagnoseMistake(image: Buffer, mimeType: string, userNote?: string): Promise<Diagnosis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  const models = (process.env.GEMINI_MODEL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const chain = [...new Set([...models, ...DEFAULT_MODELS])];

  let lastErr: unknown;
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callModel(ai, model, image, mimeType, userNote);
        return sanitize(JSON.parse(text) as Diagnosis);
      } catch (err) {
        lastErr = err;
        const code = errorCode(err);
        // Model missing for this key -> try next model immediately; overload/rate-limit -> brief backoff, then retry once.
        if (code === 404) break;
        if (code === 429 || code === 503 || code === 500) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("diagnosis failed");
}

function errorCode(err: unknown): number | undefined {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/"code"\s*:\s*(\d{3})/) ?? msg.match(/\b(404|429|500|503)\b/);
  return m ? Number(m[1]) : undefined;
}

async function callModel(ai: GoogleGenAI, model: string, image: Buffer, mimeType: string, userNote?: string): Promise<string> {
  const res = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: image.toString("base64") } },
          { text: userNote ? `Parent's note: ${userNote}` : "Diagnose this wrong answer." },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: DIAGNOSIS_SCHEMA,
      temperature: 0.4,
    },
  });
  const text = res.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

/** Defensive cleanup: keep exactly one variant per level, in order; clamp grade. */
function sanitize(d: Diagnosis): Diagnosis {
  const byLevel = new Map<string, Diagnosis["variants"][number]>();
  for (const v of d.variants ?? []) if (!byLevel.has(v.level)) byLevel.set(v.level, v);
  d.variants = (["L1", "L2", "L3"] as const).map((l) => byLevel.get(l)).filter(Boolean) as Diagnosis["variants"];
  d.grade = Math.min(6, Math.max(1, Math.round(d.grade || 3)));
  d.socratic_hints = (d.socratic_hints ?? []).slice(0, 3);
  if (d.svg_diagram && !d.svg_diagram.trim().startsWith("<svg")) d.svg_diagram = "";
  return d;
}
