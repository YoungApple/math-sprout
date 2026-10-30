import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { InValue } from "@libsql/client";
import { all, batchWrite, one, run } from "./db";
import { isValidErrorCategory, sanitizeSvg, type Diagnosis, type ErrorCategory } from "./gemini";
import { isAnswerCorrect } from "./math-answer";
import {
  applyAttempt,
  deriveProgress,
  initialReviewState,
  type ReviewProgress,
  type ReviewState,
  type ReviewStatus,
  type VariantLevel,
} from "./review";
import { deleteImage, imageUrl, putImage } from "./storage";
import { extractDomain, normalizeCategory, normalizeTerm, type MathDomain, type Term } from "./taxonomy";

export class NotFoundError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

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
  round: number;
}

export interface Mistake {
  id: string;
  createdAt: string;
  grade: number | null;
  term: string | null;
  source: string | null;
  category: string;
  imageUrl: string;
  imageSha256: string | null;
  stemText: string;
  studentAnswer: string;
  correctAnswer: string;
  errorCategory: string;
  rootCause: string;
  knowledgePoints: string[];
  hints: string[];
  svgDiagram: string | null;
  review: ReviewState;
  progress: ReviewProgress;
  variants: Variant[];
  attempts: Attempt[];
}

export interface MistakeFilter {
  dueOnly?: boolean;
  status?: ReviewStatus;
  errorCategory?: ErrorCategory | string;
  domain?: MathDomain | string;
  category?: string;
  tag?: string;
  grade?: number;
  term?: Term | string;
  source?: string;
  q?: string;
  limit?: number;
}

export interface MistakeFacets {
  total: number;
  due: number;
  mastered: number;
  byStatus: Record<ReviewStatus, number>;
  byErrorCategory: Record<ErrorCategory, number>;
  byDomain: Record<MathDomain, number>;
  topCategories: { category: string; count: number }[];
  topTags: { tag: string; count: number }[];
  grades: { grade: number; count: number }[];
  sources: { source: string; count: number }[];
}

export interface MistakeMetaPatch {
  grade?: number | null;
  term?: string | null;
  source?: string | null;
  category?: string | null;
  errorCategory?: ErrorCategory;
}

type Row = Record<string, unknown>;

export async function findMistakeBySha256(sha256: string): Promise<string | null> {
  if (!sha256) return null;
  const row = await one<Row>(`SELECT id FROM mistakes WHERE image_sha256 = ? ORDER BY created_at DESC LIMIT 1`, [sha256]);
  return row ? String(row.id) : null;
}

function clampGrade(val: number): number {
  return Math.min(6, Math.max(1, Math.round(val)));
}

export async function createMistake(input: {
  rawImageKey: string;
  imageSha256?: string;
  diagnosis: Diagnosis;
  grade?: number;
  term?: string;
  source?: string;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  const review = initialReviewState(now);
  const d = input.diagnosis;
  const cleanSvg = sanitizeSvg(d.svg_diagram) || null;
  const resolvedGrade =
    input.grade != null && Number.isFinite(Number(input.grade))
      ? clampGrade(Number(input.grade))
      : clampGrade(Number(d.grade) || 3);
  const resolvedTerm = normalizeTerm(input.term);
  const resolvedSource = input.source?.trim() || null;
  const resolvedCategory = normalizeCategory(d.category).full;

  const stmts: { sql: string; args?: InValue[] }[] = [
    {
      sql: `INSERT INTO mistakes (
              id, created_at, grade, term, source, category, raw_image_key, image_sha256,
              stem_text, student_answer, correct_answer, error_category, root_cause,
              knowledge_points, hints, svg_diagram, review_status, review_stage, review_round, next_review_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id,
        now.toISOString(),
        resolvedGrade,
        resolvedTerm,
        resolvedSource,
        resolvedCategory,
        input.rawImageKey,
        input.imageSha256 ?? null,
        d.stem_text,
        d.student_answer,
        d.correct_answer,
        d.error_category,
        d.root_cause,
        JSON.stringify(d.knowledge_points ?? []),
        JSON.stringify(d.socratic_hints ?? []),
        cleanSvg,
        review.status,
        review.stage,
        review.round,
        review.nextReviewAt,
      ],
    },
  ];

  let sort = 0;
  for (const v of d.variants) {
    stmts.push({
      sql: `INSERT INTO variants (id, mistake_id, level, stem, answer, explanation, sort) VALUES (?,?,?,?,?,?,?)`,
      args: [randomUUID(), id, v.level, v.stem, v.answer, v.explanation, sort++],
    });
  }

  await batchWrite(stmts);
  return id;
}

const SAMPLE_IMAGE_KEY = "samples/grade3-difference-multiple.png";

const SAMPLE_DIAGNOSIS: Diagnosis = {
  stem_text: "学校图书角买来 $24$ 本科普书，童话书的本数是科普书的 $3$ 倍。童话书比科普书多多少本？",
  student_answer: "96本",
  correct_answer: "48本",
  correct_expr: "24 * 3 - 24",
  grade: 3,
  category: "数与代数/倍数应用题",
  error_category: "PERCEPTION_ERROR",
  root_cause:
    "孩子第一步正确算出了童话书有 $24 \\times 3 = 72$（本），但审题时忽略了最后问的是“童话书比科普书**多**多少本”（求差），误算成“两种书**一共**多少本”（求和），写成了 $72 + 24 = 96$（本）。",
  knowledge_points: ["倍的认识与计算", "求一个数比另一个数多多少（差倍关系）", "两步整数应用题审题"],
  socratic_hints: [
    "先看看你第一步算出的 $24 \\times 3 = 72$（本），它代表的是哪种书的数量呢？",
    "用手指着题目最后一句话读一读：问的是“童话书比科普书**多**多少本”，还是“两种书**一共**有多少本”？",
    "已知童话书有 $72$ 本、科普书有 $24$ 本，求“多出的那一部分”，应该用减法还是加法？",
  ],
  svg_diagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" width="400" height="160">
    <rect width="400" height="160" rx="12" fill="#f8fafc"/>
    <text x="18" y="46" font-size="14" fill="#334155">科普书：</text>
    <rect x="82" y="28" width="84" height="26" rx="5" fill="#38bdf8"/>
    <text x="124" y="46" font-size="13" fill="#ffffff" text-anchor="middle">24本</text>
    <text x="18" y="98" font-size="14" fill="#334155">童话书：</text>
    <rect x="82" y="80" width="84" height="26" rx="5" fill="#38bdf8"/>
    <rect x="170" y="80" width="84" height="26" rx="5" fill="#34d399"/>
    <rect x="258" y="80" width="84" height="26" rx="5" fill="#34d399"/>
    <text x="124" y="98" font-size="13" fill="#ffffff" text-anchor="middle">24本</text>
    <text x="212" y="98" font-size="13" fill="#065f46" text-anchor="middle">1倍</text>
    <text x="300" y="98" font-size="13" fill="#065f46" text-anchor="middle">1倍</text>
    <path d="M 170 114 L 170 124 L 342 124 L 342 114" fill="none" stroke="#e11d48" stroke-width="2"/>
    <text x="256" y="144" font-size="13" fill="#e11d48" text-anchor="middle">比科普书多多少本 = ?</text>
  </svg>`,
  variants: [
    {
      level: "L1",
      stem: "果园里种了 $18$ 棵桃树，苹果树的棵数是桃树的 $4$ 倍。苹果树比桃树多多少棵？",
      answer: "54棵",
      answer_expr: "18 * 4 - 18",
      explanation: "苹果树有 $18 \\times 4 = 72$（棵），苹果树比桃树多 $72 - 18 = 54$（棵）。",
    },
    {
      level: "L2",
      stem: "小宇折了 $15$ 只纸鹤，小美折的纸鹤数量是小宇的 $3$ 倍。小美比小宇多折了多少只纸鹤？",
      answer: "30只",
      answer_expr: "15 * 3 - 15",
      explanation: "小美折了 $15 \\times 3 = 45$（只），比小宇多折 $45 - 15 = 30$（只）。",
    },
    {
      level: "L3",
      stem: "手工课上，第一小组做了 $20$ 朵小红花，第二小组做的朵数比第一小组的 $2$ 倍还多 $6$ 朵。第二小组比第一小组多做了多少朵小红花？",
      answer: "26朵",
      answer_expr: "20 * 2 + 6 - 20",
      explanation: "第二小组做了 $20 \\times 2 + 6 = 46$（朵），比第一小组多做 $46 - 20 = 26$（朵）。",
    },
  ],
};

/** Zero-Gemini 1-click onboarding sample mistake: idempotently returns existing sample if un-deleted. */
export async function createSampleMistake(): Promise<string> {
  const png = buildSampleWorksheetPng();
  const sha = createHash("sha256").update(png).digest("hex");
  const existingId = await findMistakeBySha256(sha);
  if (existingId) return existingId;

  await putImage(SAMPLE_IMAGE_KEY, png, "image/png");
  return createMistake({
    rawImageKey: SAMPLE_IMAGE_KEY,
    imageSha256: sha,
    diagnosis: SAMPLE_DIAGNOSIS,
    grade: 3,
    term: "上学期",
    source: "示例错题 · 三年级易错审题",
  });
}

export async function listMistakes(opts: MistakeFilter = {}): Promise<Mistake[]> {
  const now = new Date();
  const clauses: string[] = [];
  const args: InValue[] = [];

  if (opts.dueOnly) {
    clauses.push(`next_review_at <= ?`);
    args.push(now.toISOString());
  }
  if (opts.status) {
    clauses.push(`review_status = ?`);
    args.push(opts.status);
  }
  if (opts.errorCategory?.trim()) {
    clauses.push(`error_category = ?`);
    args.push(opts.errorCategory.trim());
  }
  if (opts.grade != null && Number.isFinite(Number(opts.grade))) {
    clauses.push(`grade = ?`);
    args.push(Math.round(Number(opts.grade)));
  }
  if (opts.source?.trim()) {
    clauses.push(`source = ?`);
    args.push(opts.source.trim());
  }

  const domainFilter = opts.domain?.trim() || undefined;
  const categoryFilter = opts.category?.trim() || undefined;
  const tagFilter = opts.tag?.trim() || undefined;
  const termFilterRaw = opts.term?.trim() || undefined;
  const qFilter = opts.q?.trim().toLowerCase() || undefined;
  const limit = opts.limit ?? 50;

  const needsPostFilter = Boolean(domainFilter || categoryFilter || tagFilter || termFilterRaw || qFilter);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  let rows: Row[];
  if (!needsPostFilter) {
    rows = await all<Row>(
      `SELECT * FROM mistakes ${where} ORDER BY next_review_at ASC, created_at DESC LIMIT ?`,
      [...args, limit],
    );
  } else {
    const candidates = await all<Row>(
      `SELECT * FROM mistakes ${where} ORDER BY next_review_at ASC, created_at DESC`,
      args,
    );
    const normalizedCategoryFilter =
      categoryFilter && categoryFilter !== "未分类" ? normalizeCategory(categoryFilter).full : null;
    const normalizedTermFilter = termFilterRaw ? normalizeTerm(termFilterRaw) : null;
    const tagLower = tagFilter?.toLowerCase();

    rows = candidates
      .filter((r) => {
        const rawCat = (r.category as string | null) ?? null;
        const normCat = normalizeCategory(rawCat).full;

        if (domainFilter && extractDomain(rawCat) !== domainFilter) {
          return false;
        }
        if (categoryFilter) {
          if (categoryFilter === "未分类") {
            if (rawCat && rawCat.trim() !== "" && rawCat.trim() !== "未分类") return false;
          } else if (normCat !== normalizedCategoryFilter && (rawCat ?? "").trim() !== categoryFilter) {
            return false;
          }
        }
        if (termFilterRaw) {
          const rowTerm = normalizeTerm((r.term as string | null) ?? null);
          if (normalizedTermFilter) {
            if (rowTerm !== normalizedTermFilter) return false;
          } else if (((r.term as string | null) ?? "").trim() !== termFilterRaw) {
            return false;
          }
        }
        const tags = safeParseJsonArray(r.knowledge_points);
        if (tagLower && !tags.some((t) => t.trim().toLowerCase() === tagLower)) {
          return false;
        }
        if (qFilter) {
          // Literal substring check in JS — 100% immune to SQL LIKE % and _ wildcard injection
          const haystacks = [
            String(r.stem_text ?? ""),
            String(r.root_cause ?? ""),
            normCat,
            String(rawCat ?? ""),
            String(r.source ?? ""),
            ...tags,
          ];
          if (!haystacks.some((h) => h.toLowerCase().includes(qFilter))) {
            return false;
          }
        }
        return true;
      })
      .slice(0, limit);
  }

  return hydrateMany(rows, now);
}

export async function getMistakeFacets(): Promise<MistakeFacets> {
  const nowIso = new Date().toISOString();
  const rows = await all<Row>(
    `SELECT grade, term, source, category, error_category, knowledge_points, review_status, next_review_at
       FROM mistakes`,
  );

  const byStatus: Record<ReviewStatus, number> = {
    PENDING: 0,
    CONSOLIDATING: 0,
    MASTERED: 0,
    RELAPSED: 0,
  };
  const byErrorCategory: Record<ErrorCategory, number> = {
    EXECUTION_ERROR: 0,
    PERCEPTION_ERROR: 0,
    CONCEPT_CONFUSION: 0,
    MODELING_GAP: 0,
  };
  const byDomain: Record<MathDomain, number> = {
    数与代数: 0,
    图形与几何: 0,
    统计与概率: 0,
    综合与实践: 0,
  };

  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const gradeCounts = new Map<number, number>();
  const sourceCounts = new Map<string, number>();

  let due = 0;
  let mastered = 0;

  for (const r of rows) {
    const status = ((r.review_status as ReviewStatus) || "PENDING") as ReviewStatus;
    if (status in byStatus) {
      byStatus[status]++;
    } else {
      byStatus.PENDING++;
    }
    if (status === "MASTERED") {
      mastered++;
    }
    const nextReviewAt = String(r.next_review_at ?? "");
    if (!nextReviewAt || nextReviewAt <= nowIso) {
      due++;
    }

    const errCat = String(r.error_category ?? "");
    if (isValidErrorCategory(errCat)) {
      byErrorCategory[errCat]++;
    }

    const normCat = normalizeCategory((r.category as string | null) ?? null);
    byDomain[normCat.domain] = (byDomain[normCat.domain] ?? 0) + 1;
    categoryCounts.set(normCat.full, (categoryCounts.get(normCat.full) ?? 0) + 1);

    const seenTagsInRow = new Set<string>();
    for (const rawTag of safeParseJsonArray(r.knowledge_points)) {
      const t = rawTag.trim();
      if (t && !seenTagsInRow.has(t)) {
        seenTagsInRow.add(t);
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }

    if (r.grade != null && Number.isFinite(Number(r.grade))) {
      const g = Math.round(Number(r.grade));
      gradeCounts.set(g, (gradeCounts.get(g) ?? 0) + 1);
    }

    const src = String(r.source ?? "").trim();
    if (src) {
      sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    }
  }

  const topCategories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "zh-CN"))
    .slice(0, 20);

  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"))
    .slice(0, 24);

  const grades = [...gradeCounts.entries()]
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => a.grade - b.grade);

  const sources = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source, "zh-CN"))
    .slice(0, 20);

  return {
    total: rows.length,
    due,
    mastered,
    byStatus,
    byErrorCategory,
    byDomain,
    topCategories,
    topTags,
    grades,
    sources,
  };
}

export async function updateMistakeMeta(id: string, patch: MistakeMetaPatch): Promise<Mistake> {
  const existing = await one<Row>(`SELECT id FROM mistakes WHERE id = ?`, [id]);
  if (!existing) throw new NotFoundError("mistake not found");

  const sets: string[] = [];
  const args: InValue[] = [];

  if (patch.grade !== undefined) {
    if (patch.grade === null) {
      sets.push(`grade = NULL`);
    } else if (Number.isFinite(Number(patch.grade))) {
      sets.push(`grade = ?`);
      args.push(clampGrade(Number(patch.grade)));
    }
  }
  if (patch.term !== undefined) {
    const normTerm = normalizeTerm(patch.term);
    sets.push(`term = ?`);
    args.push(normTerm);
  }
  if (patch.source !== undefined) {
    const cleanSource = patch.source == null ? null : patch.source.trim() || null;
    sets.push(`source = ?`);
    args.push(cleanSource);
  }
  if (patch.category !== undefined) {
    const cleanCategory = normalizeCategory(patch.category).full;
    sets.push(`category = ?`);
    args.push(cleanCategory);
  }
  if (patch.errorCategory !== undefined && isValidErrorCategory(patch.errorCategory)) {
    sets.push(`error_category = ?`);
    args.push(patch.errorCategory);
  }

  if (sets.length > 0) {
    await run(`UPDATE mistakes SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
  }

  const updated = await getMistake(id);
  if (!updated) throw new NotFoundError("mistake not found");
  return updated;
}

export async function countMistakes(): Promise<{ total: number; due: number; mastered: number }> {
  const nowIso = new Date().toISOString();
  const row = await one<Row>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN next_review_at <= ? THEN 1 ELSE 0 END), 0) AS due,
       COALESCE(SUM(CASE WHEN review_status = 'MASTERED' THEN 1 ELSE 0 END), 0) AS mastered
     FROM mistakes`,
    [nowIso],
  );
  return {
    total: Number(row?.total ?? 0),
    due: Number(row?.due ?? 0),
    mastered: Number(row?.mastered ?? 0),
  };
}

export async function getMistake(id: string): Promise<Mistake | null> {
  const row = await one<Row>(`SELECT * FROM mistakes WHERE id = ?`, [id]);
  if (!row) return null;
  const [hydrated] = await hydrateMany([row], new Date());
  return hydrated ?? null;
}

export async function getNextDueMistakeId(excludeId?: string): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const row = excludeId
    ? await one<Row>(
        `SELECT id FROM mistakes WHERE next_review_at <= ? AND id != ? ORDER BY next_review_at ASC, created_at DESC LIMIT 1`,
        [nowIso, excludeId],
      )
    : await one<Row>(
        `SELECT id FROM mistakes WHERE next_review_at <= ? ORDER BY next_review_at ASC, created_at DESC LIMIT 1`,
        [nowIso],
      );
  return row ? String(row.id) : null;
}

export async function deleteMistake(id: string): Promise<boolean> {
  const row = await one<Row>(`SELECT id, raw_image_key FROM mistakes WHERE id = ?`, [id]);
  if (!row) return false;
  const rawImageKey = String(row.raw_image_key);

  await batchWrite([
    { sql: `DELETE FROM attempts WHERE mistake_id = ?`, args: [id] },
    { sql: `DELETE FROM variants WHERE mistake_id = ?`, args: [id] },
    { sql: `DELETE FROM mistakes WHERE id = ?`, args: [id] },
  ]);

  const otherUsingSameImage = await one<Row>(`SELECT id FROM mistakes WHERE raw_image_key = ? LIMIT 1`, [rawImageKey]);
  if (!otherUsingSameImage) {
    await deleteImage(rawImageKey).catch(() => {});
  }
  return true;
}

export async function recordAttempt(
  mistakeId: string,
  variantId: string,
  userAnswer: string,
): Promise<{
  isCorrect: boolean;
  attemptCountOnVariant: number;
  expected: string;
  explanation: string;
  review: ReviewState;
  progress: ReviewProgress;
}> {
  const m = await getMistake(mistakeId);
  if (!m) throw new NotFoundError("mistake not found");
  const v = m.variants.find((x) => x.id === variantId);
  if (!v) throw new NotFoundError("variant not found");

  const now = new Date();
  const isCorrect = isAnswerCorrect(userAnswer, v.answer);
  const preProgress = deriveProgress(m.review, m.variants, m.attempts, now);
  const attemptRound = preProgress.activeRound;
  const attemptCountOnVariant = (preProgress.attemptCountsByVariant[v.id] ?? 0) + 1;

  const nextReview = applyAttempt(m.review, m.variants, m.attempts, { variantId: v.id, isCorrect }, now);
  const attemptId = randomUUID();

  await batchWrite([
    {
      sql: `INSERT INTO attempts (id, mistake_id, variant_id, answered_at, user_answer, is_correct, round)
            VALUES (?,?,?,?,?,?,?)`,
      args: [attemptId, mistakeId, variantId, now.toISOString(), userAnswer, isCorrect ? 1 : 0, attemptRound],
    },
    {
      sql: `UPDATE mistakes
               SET review_status = ?, review_stage = ?, review_round = ?, next_review_at = ?
             WHERE id = ?`,
      args: [nextReview.status, nextReview.stage, nextReview.round, nextReview.nextReviewAt, mistakeId],
    },
  ]);

  const updatedAttempts: Attempt[] = [
    ...m.attempts,
    {
      id: attemptId,
      variantId: v.id,
      answeredAt: now.toISOString(),
      userAnswer,
      isCorrect,
      round: attemptRound,
    },
  ];
  const progress = deriveProgress(nextReview, m.variants, updatedAttempts, now);

  return {
    isCorrect,
    attemptCountOnVariant,
    expected: v.answer,
    explanation: v.explanation,
    review: nextReview,
    progress,
  };
}

async function hydrateMany(rows: Row[], now: Date): Promise<Mistake[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => String(r.id));
  const placeholders = ids.map(() => "?").join(",");

  const [variantRows, attemptRows] = await Promise.all([
    all<Row>(`SELECT * FROM variants WHERE mistake_id IN (${placeholders}) ORDER BY sort ASC`, ids),
    all<Row>(`SELECT * FROM attempts WHERE mistake_id IN (${placeholders}) ORDER BY answered_at ASC`, ids),
  ]);

  const variantsByMistake = new Map<string, Variant[]>();
  for (const v of variantRows) {
    const mid = String(v.mistake_id);
    const list = variantsByMistake.get(mid) ?? [];
    list.push({
      id: String(v.id),
      level: v.level as VariantLevel,
      stem: String(v.stem),
      answer: String(v.answer),
      explanation: String(v.explanation),
    });
    variantsByMistake.set(mid, list);
  }

  const attemptsByMistake = new Map<string, Attempt[]>();
  for (const a of attemptRows) {
    const mid = String(a.mistake_id);
    const list = attemptsByMistake.get(mid) ?? [];
    list.push({
      id: String(a.id),
      variantId: String(a.variant_id),
      answeredAt: String(a.answered_at),
      userAnswer: String(a.user_answer),
      isCorrect: Number(a.is_correct) === 1,
      round: Number(a.round ?? 0),
    });
    attemptsByMistake.set(mid, list);
  }

  return rows.map((r) => {
    const id = String(r.id);
    const variants = variantsByMistake.get(id) ?? [];
    const attempts = attemptsByMistake.get(id) ?? [];
    const review: ReviewState = {
      status: (r.review_status as ReviewStatus) || "PENDING",
      stage: Number(r.review_stage ?? 0),
      round: Number(r.review_round ?? 0),
      nextReviewAt: String(r.next_review_at),
    };
    const progress = deriveProgress(review, variants, attempts, now);
    const rawSvg = (r.svg_diagram as string | null) ?? null;
    const rawTerm = (r.term as string | null) ?? null;

    return {
      id,
      createdAt: String(r.created_at),
      grade: r.grade == null ? null : Number(r.grade),
      term: normalizeTerm(rawTerm) ?? (rawTerm?.trim() || null),
      source: (r.source as string | null) ?? null,
      category: normalizeCategory((r.category as string | null) ?? null).full,
      imageUrl: imageUrl(String(r.raw_image_key)),
      imageSha256: (r.image_sha256 as string | null) ?? null,
      stemText: String(r.stem_text ?? ""),
      studentAnswer: String(r.student_answer ?? ""),
      correctAnswer: String(r.correct_answer ?? ""),
      errorCategory: String(r.error_category ?? ""),
      rootCause: String(r.root_cause ?? ""),
      knowledgePoints: safeParseJsonArray(r.knowledge_points),
      hints: safeParseJsonArray(r.hints),
      svgDiagram: rawSvg ? sanitizeSvg(rawSvg) || null : null,
      review,
      progress,
      variants,
      attempts,
    };
  });
}

function safeParseJsonArray(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/**
 * Generates a valid, self-contained 320x160 RGB PNG worksheet illustration using only node:zlib
 * (passes magic-byte detectImageMime === "image/png" with zero external image libraries).
 */
function buildSampleWorksheetPng(): Buffer {
  const width = 320;
  const height = 160;
  const rowStride = 1 + width * 3;
  const raw = Buffer.alloc(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    raw[rowOffset] = 0; // PNG filter type 0 (None)
    for (let x = 0; x < width; x++) {
      let r = 253,
        g = 251,
        b = 245; // warm notebook cream
      // Horizontal notebook lines + left margin line
      if (y % 28 === 27) {
        r = 219;
        g = 234;
        b = 254;
      }
      if (x === 32) {
        r = 252;
        g = 165;
        b = 165;
      }
      // Simulated printed problem bars
      if ((y >= 34 && y <= 40 && x >= 48 && x <= 284) || (y >= 62 && y <= 68 && x >= 48 && x <= 220)) {
        r = 71;
        g = 85;
        b = 105;
      }
      // Simulated child's handwritten equation bar
      if (y >= 98 && y <= 104 && x >= 56 && x <= 196) {
        r = 37;
        g = 99;
        b = 235;
      }
      // Red teacher cross mark "X"
      const dx1 = Math.abs(x - 245 - (y - 102));
      const dx2 = Math.abs(x - 245 + (y - 102));
      if (x >= 229 && x <= 261 && y >= 86 && y <= 118 && (dx1 <= 2 || dx2 <= 2)) {
        r = 225;
        g = 29;
        b = 72;
      }
      const px = rowOffset + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

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
