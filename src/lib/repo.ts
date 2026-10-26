import { randomUUID } from "node:crypto";
import { all, one, run } from "./db";
import type { Diagnosis } from "./gemini";
import { initialReviewState, transition, isAnswerCorrect, type ReviewState, type VariantLevel } from "./review";
import { imageUrl } from "./storage";

export interface Variant {
  id: string;
  level: VariantLevel;
  stem: string;
  answer: string;
  explanation: string;
}

export interface Attempt {
  id: string;
  variantId: string;
  answeredAt: string;
  userAnswer: string;
  isCorrect: boolean;
}

export interface Mistake {
  id: string;
  createdAt: string;
  grade: number | null;
  term: string | null;
  source: string | null;
  category: string | null;
  imageUrl: string;
  stemText: string;
  studentAnswer: string;
  correctAnswer: string;
  errorCategory: string;
  rootCause: string;
  knowledgePoints: string[];
  hints: string[];
  svgDiagram: string | null;
  review: ReviewState;
  variants: Variant[];
  attempts: Attempt[];
}

type Row = Record<string, unknown>;

export async function createMistake(input: {
  rawImageKey: string;
  diagnosis: Diagnosis;
  term?: string;
  source?: string;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  const review = initialReviewState(now);
  const d = input.diagnosis;
  await run(
    `INSERT INTO mistakes (id, created_at, grade, term, source, category, raw_image_key, stem_text, student_answer,
       correct_answer, error_category, root_cause, knowledge_points, hints, svg_diagram, review_status, review_stage, next_review_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, now.toISOString(), d.grade, input.term ?? null, input.source ?? null, d.category, input.rawImageKey,
      d.stem_text, d.student_answer, d.correct_answer, d.error_category, d.root_cause,
      JSON.stringify(d.knowledge_points), JSON.stringify(d.socratic_hints), d.svg_diagram || null,
      review.status, review.stage, review.nextReviewAt,
    ],
  );
  let sort = 0;
  for (const v of d.variants) {
    await run(`INSERT INTO variants (id, mistake_id, level, stem, answer, explanation, sort) VALUES (?,?,?,?,?,?,?)`, [
      randomUUID(), id, v.level, v.stem, v.answer, v.explanation, sort++,
    ]);
  }
  return id;
}

export async function listMistakes(opts: { dueOnly?: boolean; limit?: number } = {}): Promise<Mistake[]> {
  const where = opts.dueOnly ? `WHERE next_review_at <= ?` : "";
  const nowIso = new Date().toISOString();
  const rows = await all<Row>(
    `SELECT * FROM mistakes ${where} ORDER BY next_review_at ASC, created_at DESC LIMIT ?`,
    opts.dueOnly ? [nowIso, opts.limit ?? 50] : [opts.limit ?? 50],
  );
  return Promise.all(rows.map((r) => hydrate(r, false)));
}

export async function getMistake(id: string): Promise<Mistake | null> {
  const row = await one<Row>(`SELECT * FROM mistakes WHERE id = ?`, [id]);
  return row ? hydrate(row, true) : null;
}

export async function recordAttempt(mistakeId: string, variantId: string, userAnswer: string) {
  const m = await getMistake(mistakeId);
  if (!m) throw new Error("mistake not found");
  const v = m.variants.find((x) => x.id === variantId);
  if (!v) throw new Error("variant not found");

  const isCorrect = isAnswerCorrect(userAnswer, v.answer);
  const now = new Date();
  await run(`INSERT INTO attempts (id, mistake_id, variant_id, answered_at, user_answer, is_correct) VALUES (?,?,?,?,?,?)`, [
    randomUUID(), mistakeId, variantId, now.toISOString(), userAnswer, isCorrect ? 1 : 0,
  ]);

  const solved = new Set(m.attempts.filter((a) => a.isCorrect).map((a) => m.variants.find((x) => x.id === a.variantId)?.level));
  if (isCorrect) solved.add(v.level);
  const allLevelsCorrect = (["L1", "L2", "L3"] as const).every((l) => solved.has(l));

  const next = transition(m.review, { level: v.level, isCorrect, allLevelsCorrect }, now);
  await run(`UPDATE mistakes SET review_status = ?, review_stage = ?, next_review_at = ? WHERE id = ?`, [
    next.status, next.stage, next.nextReviewAt, mistakeId,
  ]);
  return { isCorrect, expected: v.answer, explanation: v.explanation, review: next };
}

async function hydrate(r: Row, deep: boolean): Promise<Mistake> {
  const id = String(r.id);
  const [variants, attempts] = deep
    ? await Promise.all([
        all<Row>(`SELECT * FROM variants WHERE mistake_id = ? ORDER BY sort`, [id]),
        all<Row>(`SELECT * FROM attempts WHERE mistake_id = ? ORDER BY answered_at`, [id]),
      ])
    : [[], []];
  return {
    id,
    createdAt: String(r.created_at),
    grade: r.grade == null ? null : Number(r.grade),
    term: (r.term as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    imageUrl: imageUrl(String(r.raw_image_key)),
    stemText: String(r.stem_text ?? ""),
    studentAnswer: String(r.student_answer ?? ""),
    correctAnswer: String(r.correct_answer ?? ""),
    errorCategory: String(r.error_category ?? ""),
    rootCause: String(r.root_cause ?? ""),
    knowledgePoints: JSON.parse(String(r.knowledge_points ?? "[]")),
    hints: JSON.parse(String(r.hints ?? "[]")),
    svgDiagram: (r.svg_diagram as string | null) ?? null,
    review: { status: r.review_status as ReviewState["status"], stage: Number(r.review_stage), nextReviewAt: String(r.next_review_at) },
    variants: variants.map((v) => ({
      id: String(v.id), level: v.level as VariantLevel, stem: String(v.stem), answer: String(v.answer), explanation: String(v.explanation),
    })),
    attempts: attempts.map((a) => ({
      id: String(a.id), variantId: String(a.variant_id), answeredAt: String(a.answered_at), userAnswer: String(a.user_answer), isCorrect: Number(a.is_correct) === 1,
    })),
  };
}
