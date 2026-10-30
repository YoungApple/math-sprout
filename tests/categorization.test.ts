import { test } from "node:test";
import assert from "node:assert/strict";
import { batchWrite, resetDbForTests } from "../src/lib/db";
import type { Diagnosis } from "../src/lib/gemini";
import {
  GRADES,
  MATH_DOMAINS,
  TERMS,
  extractDomain,
  normalizeCategory,
  normalizeTerm,
} from "../src/lib/taxonomy";
import {
  NotFoundError,
  createMistake,
  getMistake,
  getMistakeFacets,
  listMistakes,
  recordAttempt,
  updateMistakeMeta,
} from "../src/lib/repo";

function makeDiagnosis(overrides: Partial<Diagnosis>): Diagnosis {
  return {
    stem_text: "默认题干：$24 \\times 3 = ?$",
    student_answer: "62",
    correct_answer: "72",
    correct_expr: "24 * 3",
    grade: 3,
    category: "数与代数/两位数乘一位数",
    error_category: "EXECUTION_ERROR",
    root_cause: "进位乘法忘加进位 1",
    knowledge_points: ["两位数乘一位数", "进位乘法"],
    socratic_hints: ["提示1", "提示2", "提示3"],
    variants: [
      { level: "L1", stem: "变式1", answer: "10", explanation: "解析1" },
      { level: "L2", stem: "变式2", answer: "20", explanation: "解析2" },
      { level: "L3", stem: "变式3", answer: "30", explanation: "解析3" },
    ],
    ...overrides,
  };
}

test("taxonomy: normalizeCategory maps raw topics into 4 curriculum domains without double-prefixing & normalizeTerm", () => {
  assert.deepEqual([...MATH_DOMAINS], ["数与代数", "图形与几何", "统计与概率", "综合与实践"]);
  assert.deepEqual([...TERMS], ["上学期", "下学期"]);
  assert.deepEqual([...GRADES], [1, 2, 3, 4, 5, 6]);

  // 1. 图形与几何
  const geoRaw = normalizeCategory("长方形周长与面积");
  assert.equal(geoRaw.domain, "图形与几何");
  assert.equal(geoRaw.topic, "长方形周长与面积");
  assert.equal(geoRaw.full, "图形与几何/长方形周长与面积");

  const geoPrefixed = normalizeCategory("图形与几何/角的度量");
  assert.equal(geoPrefixed.domain, "图形与几何");
  assert.equal(geoPrefixed.topic, "角的度量");
  assert.equal(geoPrefixed.full, "图形与几何/角的度量");

  // 2. 统计与概率
  const stats = normalizeCategory("条形统计图与平均数");
  assert.equal(stats.domain, "统计与概率");
  assert.equal(stats.full, "统计与概率/条形统计图与平均数");

  // 3. 综合与实践
  const practice = normalizeCategory("鸡兔同笼与植树问题");
  assert.equal(practice.domain, "综合与实践");
  assert.equal(practice.full, "综合与实践/鸡兔同笼与植树问题");

  // 4. 数与代数 (default + empty fallback)
  const alg = normalizeCategory("有余数的除法");
  assert.equal(alg.domain, "数与代数");
  assert.equal(alg.full, "数与代数/有余数的除法");

  const empty = normalizeCategory("");
  assert.equal(empty.domain, "数与代数");
  assert.ok(empty.topic.length > 0);
  assert.equal(empty.full, `数与代数/${empty.topic}`);

  // extractDomain works on both prefixed and legacy un-prefixed strings
  assert.equal(extractDomain("图形与几何/圆的面积"), "图形与几何");
  assert.equal(extractDomain("长方体表面积"), "图形与几何");
  assert.equal(extractDomain("折线统计图"), "统计与概率");
  assert.equal(extractDomain("烙饼优化问题"), "综合与实践");
  assert.equal(extractDomain("异分母分数加减法"), "数与代数");
  assert.equal(extractDomain(null), "数与代数");

  // normalizeTerm
  for (const up of ["UP", "up", "上", "上册", "上学期", " 上册 "]) {
    assert.equal(normalizeTerm(up), "上学期", `expected 上学期 for "${up}"`);
  }
  for (const down of ["DOWN", "down", "下", "下册", "下学期", " 下学期 "]) {
    assert.equal(normalizeTerm(down), "下学期", `expected 下学期 for "${down}"`);
  }
  assert.equal(normalizeTerm(""), null);
  assert.equal(normalizeTerm(null), null);
  assert.equal(normalizeTerm(undefined), null);
  assert.equal(normalizeTerm("暑假集训"), null);
});

test("repo categorization vertical slice: facets, multi-dimensional filters, SQL wildcard safety, and updateMistakeMeta", async () => {
  const prevDb = process.env.DATABASE_URL;
  const prevBucket = process.env.GCS_BUCKET;
  process.env.DATABASE_URL = "file::memory:?cache=shared";
  delete process.env.GCS_BUCKET;
  await resetDbForTests("file::memory:?cache=shared");

  try {
    // Mistake 1: Grade 3 (overriding diagnosis.grade=2), 上学期, 数与代数, CONCEPT_CONFUSION
    const idAlg = await createMistake({
      rawImageKey: "2026-10-30/m1.jpg",
      grade: 3,
      term: "上册",
      source: "三上随堂测",
      diagnosis: makeDiagnosis({
        grade: 2,
        stem_text: "有 $26$ 个橘子，每 $6$ 个装一袋，可以装几袋，还剩几个？",
        student_answer: "3袋……8个",
        correct_answer: "4袋……2个",
        correct_expr: undefined,
        category: "有余数的除法",
        error_category: "CONCEPT_CONFUSION",
        root_cause: "余数 8 大于除数 6，没有继续分完",
        knowledge_points: ["有余数的除法", "余数小于除数"],
      }),
    });

    // Mistake 2: Grade 3, 上学期, 图形与几何, PERCEPTION_ERROR
    const idGeo = await createMistake({
      rawImageKey: "2026-10-30/m2.jpg",
      grade: 3,
      term: "上学期",
      source: "三上期中卷",
      diagnosis: makeDiagnosis({
        grade: 3,
        stem_text: "长方形菜地长 $12$ 米，宽 $8$ 米，一面靠墙围篱笆至少需要多少米？",
        student_answer: "40米",
        correct_answer: "28米",
        correct_expr: "12 + 8 * 2",
        category: "长方形周长",
        error_category: "PERCEPTION_ERROR",
        root_cause: "漏看了“一面靠墙”与“至少”两个关键条件",
        knowledge_points: ["长方形周长", "篱笆问题"],
      }),
    });

    // Mistake 3: Grade 4, 下学期, 统计与概率, EXECUTION_ERROR (and solve all 3 variants -> MASTERED!)
    const idStats = await createMistake({
      rawImageKey: "2026-10-30/m3.jpg",
      grade: 4,
      term: "下册",
      source: "四下单元测",
      diagnosis: makeDiagnosis({
        grade: 4,
        stem_text: "四（1）班第一组 $4$ 名同学身高总和是 $560$ 厘米，平均身高是多少厘米？",
        student_answer: "130厘米",
        correct_answer: "140厘米",
        correct_expr: "560 / 4",
        category: "平均数与条形统计图",
        error_category: "EXECUTION_ERROR",
        root_cause: "除法十位商 4 写成了 3",
        knowledge_points: ["平均数", "移多补少"],
      }),
    });
    const mStatsLoaded = await getMistake(idStats);
    assert.ok(mStatsLoaded);
    for (const v of mStatsLoaded.variants) {
      await recordAttempt(idStats, v.id, v.answer);
    }

    // Mistake 4: Grade 5, 上学期, 综合与实践, MODELING_GAP, with literal '%' and '_' for SQL LIKE safety!
    const idPrac = await createMistake({
      rawImageKey: "2026-10-30/m4.jpg",
      grade: 5,
      term: "UP",
      source: "100%冲刺_五上卷",
      diagnosis: makeDiagnosis({
        grade: 5,
        stem_text: "在长 $100$ 米的小路一侧植树，每隔 $5$ 米栽一棵（两端都栽），一共要栽多少棵？",
        student_answer: "20棵",
        correct_answer: "21棵",
        correct_expr: "100 / 5 + 1",
        category: "植树问题",
        error_category: "MODELING_GAP",
        root_cause: "把间隔数直接当成了棵数，忘记两端都栽要加 1",
        knowledge_points: ["植树问题", "间隔数_两端都栽"],
      }),
    });

    // Simulate a legacy pre-taxonomy un-prefixed category stored directly in SQLite on idGeo
    await batchWrite([{ sql: `UPDATE mistakes SET category = ? WHERE id = ?`, args: ["长方形周长", idGeo] }]);

    // Verify grade override & term/category normalization on hydrate
    const mAlg = await getMistake(idAlg);
    assert.ok(mAlg);
    assert.equal(mAlg.grade, 3, "explicit input.grade overrides diagnosis.grade");
    assert.equal(mAlg.term, "上学期", "term normalized to 上学期");
    assert.equal(mAlg.category, "数与代数/有余数的除法");

    const mGeoHydrated = await getMistake(idGeo);
    assert.ok(mGeoHydrated);
    assert.equal(mGeoHydrated.category, "图形与几何/长方形周长", "legacy un-prefixed category normalized on hydrate");

    // 1. Verify getMistakeFacets() across all 4 mistakes
    const facets = await getMistakeFacets();
    assert.equal(facets.total, 4);
    assert.equal(facets.mastered, 1);
    assert.equal(facets.due, 3);
    assert.equal(facets.byStatus.PENDING, 3);
    assert.equal(facets.byStatus.MASTERED, 1);
    assert.equal(facets.byErrorCategory.CONCEPT_CONFUSION, 1);
    assert.equal(facets.byErrorCategory.PERCEPTION_ERROR, 1);
    assert.equal(facets.byErrorCategory.EXECUTION_ERROR, 1);
    assert.equal(facets.byErrorCategory.MODELING_GAP, 1);
    assert.equal(facets.byDomain["数与代数"], 1);
    assert.equal(facets.byDomain["图形与几何"], 1);
    assert.equal(facets.byDomain["统计与概率"], 1);
    assert.equal(facets.byDomain["综合与实践"], 1);
    assert.ok(facets.topCategories.some((c) => c.category === "图形与几何/长方形周长" && c.count === 1));
    assert.ok(facets.topTags.some((t) => t.tag === "篱笆问题" && t.count === 1));
    assert.ok(facets.grades.some((g) => g.grade === 3 && g.count === 2));
    assert.ok(facets.sources.some((s) => s.source === "三上随堂测" && s.count === 1));

    // 2. Individual & combined filters in listMistakes()
    assert.deepEqual(
      (await listMistakes({ errorCategory: "CONCEPT_CONFUSION" })).map((m) => m.id),
      [idAlg],
    );
    assert.deepEqual(
      (await listMistakes({ domain: "图形与几何" })).map((m) => m.id),
      [idGeo],
      "domain filter must match legacy un-prefixed '长方形周长' row too",
    );
    assert.deepEqual(
      (await listMistakes({ category: "图形与几何/长方形周长" })).map((m) => m.id),
      [idGeo],
    );
    assert.deepEqual(
      (await listMistakes({ tag: "篱笆问题" })).map((m) => m.id),
      [idGeo],
    );
    assert.equal((await listMistakes({ tag: "篱笆" })).length, 0, "tag filter must match exact tag element, not substring");
    assert.equal((await listMistakes({ grade: 3 })).length, 2);
    assert.equal((await listMistakes({ term: "上册" })).length, 3, "term filter normalizes 上册 -> 上学期");
    assert.deepEqual(
      (await listMistakes({ term: "下学期" })).map((m) => m.id),
      [idStats],
    );
    assert.deepEqual(
      (await listMistakes({ source: "三上随堂测" })).map((m) => m.id),
      [idAlg],
    );

    // 3. Search `q` across stem, rootCause, category, source, knowledgePoints + SQL `%`/`_` wildcard safety!
    assert.deepEqual(
      (await listMistakes({ q: "橘子" })).map((m) => m.id),
      [idAlg],
    );
    assert.deepEqual(
      (await listMistakes({ q: "一面靠墙" })).map((m) => m.id),
      [idGeo],
    );
    assert.deepEqual(
      (await listMistakes({ q: "移多补少" })).map((m) => m.id),
      [idStats],
    );
    // Wildcard safety: "100%" must ONLY match idPrac (source "100%冲刺_五上卷"), NOT idAlg/idGeo/idStats;
    // and "___" (3 literal underscores) must match 0 rows (unescaped LIKE '%___%' would match EVERY row!).
    assert.deepEqual(
      (await listMistakes({ q: "100%" })).map((m) => m.id),
      [idPrac],
      "SQL '%' wildcard must be escaped in q search",
    );
    assert.deepEqual(
      (await listMistakes({ q: "间隔数_两端" })).map((m) => m.id),
      [idPrac],
    );
    assert.equal(
      (await listMistakes({ q: "___" })).length,
      0,
      "SQL '_' wildcard must be escaped so '___' does not match arbitrary 3-char strings",
    );

    // Combined intersection filter
    const combo = await listMistakes({
      grade: 3,
      term: "上学期",
      domain: "图形与几何",
      errorCategory: "PERCEPTION_ERROR",
      q: "篱笆",
    });
    assert.deepEqual(combo.map((m) => m.id), [idGeo]);
    assert.equal(
      (await listMistakes({ grade: 3, domain: "统计与概率" })).length,
      0,
    );

    // 4. updateMistakeMeta updates metadata, normalizes term & category, and throws NotFoundError on missing id
    const updated = await updateMistakeMeta(idAlg, {
      grade: 4,
      term: "下册",
      source: "四下期末复习卷",
      category: "折线统计图",
      errorCategory: "PERCEPTION_ERROR",
    });
    assert.equal(updated.grade, 4);
    assert.equal(updated.term, "下学期");
    assert.equal(updated.source, "四下期末复习卷");
    assert.equal(updated.category, "统计与概率/折线统计图");
    assert.equal(updated.errorCategory, "PERCEPTION_ERROR");

    const cleared = await updateMistakeMeta(idAlg, {
      term: null,
      source: null,
    });
    assert.equal(cleared.term, null);
    assert.equal(cleared.source, null);

    await assert.rejects(
      () => updateMistakeMeta("non-existent-mistake-id", { grade: 5 }),
      NotFoundError,
    );
  } finally {
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
    if (prevBucket !== undefined) process.env.GCS_BUCKET = prevBucket;
  }
});
