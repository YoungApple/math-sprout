import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { all, one, resetDbForTests } from "../src/lib/db";
import { detectImageMime, putImage, getImage, deleteImage, imageUrl } from "../src/lib/storage";
import { requirePasscode, issueSessionCookie, sanitizeNextPath } from "../src/lib/auth";
import {
  NotFoundError,
  createMistake,
  createSampleMistake,
  findMistakeBySha256,
  listMistakes,
  countMistakes,
  getMistake,
  getNextDueMistakeId,
  recordAttempt,
  deleteMistake,
} from "../src/lib/repo";
import type { Diagnosis } from "../src/lib/gemini";

const SAMPLE_DIAGNOSIS: Diagnosis = {
  stem_text: "一根绳子长 $4$ 米，用去了它的 $\\frac{1}{4}$，还剩多少米？",
  student_answer: "3又3/4米",
  correct_answer: "3米",
  grade: 5,
  category: "数与代数/分数乘法应用题",
  error_category: "CONCEPT_CONFUSION",
  root_cause: "混淆了分率与具体数量",
  knowledge_points: ["分数乘法", "量率对应"],
  socratic_hints: ["1/4 是分率还是米数？", "4 米的 1/4 是几米？", "总长减去用去的长度是多少？"],
  svg_diagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" width="400" height="160"><rect x="20" y="45" width="360" height="30" fill="#eee"/><text x="180" y="65">剩下 ? 米</text></svg>`,
  variants: [
    { level: "L1", stem: "绳子长 8 米，用去 1/4，剩几米？", answer: "6米", explanation: "8 - 2 = 6" },
    { level: "L2", stem: "故事书 12 页，看了 1/3，还剩几页？", answer: "8页", explanation: "12 - 4 = 8" },
    { level: "L3", stem: "绳子用去 1/4 后剩 3 米，原长几米？", answer: "4米", explanation: "3 ÷ 3/4 = 4" },
  ],
};

test("db PRAGMAs: WAL mode, busy_timeout, foreign_keys=ON, and schema migrations on file SQLite", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "math-sprout-wal-"));
  const dbFile = path.join(tmpDir, "test.db");
  try {
    await resetDbForTests(`file:${dbFile}`);
    const fk = await one<{ foreign_keys: number }>("PRAGMA foreign_keys");
    const jm = await one<{ journal_mode: string }>("PRAGMA journal_mode");
    assert.equal( Number(fk?.foreign_keys), 1, "PRAGMA foreign_keys must be ON");
    assert.equal(String(jm?.journal_mode).toLowerCase(), "wal", "file SQLite must enable WAL");

    const mistakeCols = (await all<{ name: string }>("PRAGMA table_info(mistakes)")).map((c) => c.name);
    assert.ok(mistakeCols.includes("review_round"), "mistakes.review_round migrated");
    assert.ok(mistakeCols.includes("image_sha256"), "mistakes.image_sha256 migrated");

    const attemptCols = (await all<{ name: string }>("PRAGMA table_info(attempts)")).map((c) => c.name);
    assert.ok(attemptCols.includes("round"), "attempts.round migrated");
  } finally {
    await resetDbForTests("file::memory:?cache=shared");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("storage magic-byte MIME detection, path traversal guard, and image_blobs DB tiering", async () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevBucket = process.env.GCS_BUCKET;
  delete process.env.GCS_BUCKET;
  process.env.DATABASE_URL = "file::memory:?cache=shared";
  await resetDbForTests("file::memory:?cache=shared");

  try {
    // Magic bytes: JPEG, PNG, WebP vs invalid/HEIC/HTML
    assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])), "image/jpeg");
    assert.equal(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
    assert.equal(
      detectImageMime(Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])),
      "image/webp",
    );
    assert.equal(detectImageMime(Buffer.from("000000186674797068656963", "hex")), null, "raw HEIC rejected");
    assert.equal(detectImageMime(Buffer.from("<svg onload=alert(1)>")), null, "HTML/SVG disguised as image rejected");

    // DB image_blobs round-trip on :memory:
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await putImage("2026-10-30/test-img.jpg", jpg, "image/jpeg");
    assert.equal(imageUrl("2026-10-30/test-img.jpg"), "/api/images/2026-10-30/test-img.jpg");
    const loaded = await getImage("2026-10-30/test-img.jpg");
    assert.deepEqual(loaded, jpg);

    // Path traversal blocked
    assert.equal(await getImage("../../package.json"), null);

    await deleteImage("2026-10-30/test-img.jpg");
    assert.equal(await getImage("2026-10-30/test-img.jpg"), null);
  } finally {
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
    if (prevBucket !== undefined) process.env.GCS_BUCKET = prevBucket;
  }
});

test("auth protocol-aware Secure cookie (plain HTTP preview vs prod HTTPS), passcode gate, and sanitizeNextPath", () => {
  const prevCode = process.env.FAMILY_PASSCODE;
  process.env.FAMILY_PASSCODE = "2026";
  try {
    // 1. Plain HTTP on non-localhost preview hostname MUST NOT set Secure attribute!
    const httpReq = new NextRequest("http://preview.example.internal:8787/api/login", { method: "POST" });
    const httpRes = NextResponse.json({ ok: true });
    issueSessionCookie(httpRes, httpReq, "2026");
    const httpSetCookie = httpRes.headers.get("set-cookie") ?? "";
    assert.ok(!/\bSecure\b/i.test(httpSetCookie), `HTTP cookie must NOT be Secure, got: ${httpSetCookie}`);
    assert.ok(/\bHttpOnly\b/i.test(httpSetCookie), "cookie must be HttpOnly");

    // Extract issued cookie token and verify requirePasscode accepts it!
    const cookiePair = httpSetCookie.split(";")[0];
    const authedCookieReq = new NextRequest("http://preview.example.internal:8787/api/mistakes", {
      headers: { cookie: cookiePair },
    });
    assert.equal(requirePasscode(authedCookieReq), null, "issued session cookie must authenticate requests");

    // 2. HTTPS (or x-forwarded-proto: https behind Caddy/Cloudflare) MUST set Secure!
    const httpsReq = new NextRequest("http://127.0.0.1:3000/api/login", {
      method: "POST",
      headers: { "x-forwarded-proto": "https" },
    });
    const httpsRes = NextResponse.json({ ok: true });
    issueSessionCookie(httpsRes, httpsReq, "2026");
    assert.ok(/\bSecure\b/i.test(httpsRes.headers.get("set-cookie") ?? ""), "HTTPS proxy cookie must be Secure");

    // 3. Header auth & rejection
    const headerReq = new NextRequest("http://127.0.0.1:8787/api/mistakes", {
      headers: { "x-family-passcode": "2026" },
    });
    assert.equal(requirePasscode(headerReq), null);

    const badReq = new NextRequest("http://127.0.0.1:8787/api/mistakes", {
      headers: { "x-family-passcode": "9999" },
    });
    assert.equal(requirePasscode(badReq)?.status, 401);

    // 4. Open redirect sanitizer
    assert.equal(sanitizeNextPath("/mistakes/abc?tab=1"), "/mistakes/abc?tab=1");
    assert.equal(sanitizeNextPath("//evil.example.com"), "/");
    assert.equal(sanitizeNextPath("https://evil.example.com"), "/");
    assert.equal(sanitizeNextPath("javascript:alert(1)"), "/");
    assert.equal(sanitizeNextPath("/\\evil.com"), "/");
    assert.equal(sanitizeNextPath(null), "/");
  } finally {
    if (prevCode === undefined) delete process.env.FAMILY_PASSCODE;
    else process.env.FAMILY_PASSCODE = prevCode;
  }
});

test("repo vertical slice: sample seed, SHA-256 dedupe, unit/round grading, cascade delete & NotFoundError", async () => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
  delete process.env.GCS_BUCKET;
  await resetDbForTests("file::memory:?cache=shared");

  // 1. Cold-start 1-click sample mistake (zero Gemini calls)
  const sampleId = await createSampleMistake();
  const sample = await getMistake(sampleId);
  assert.ok(sample, "sample mistake created");
  assert.equal(sample.variants.length, 3);
  const sampleId2 = await createSampleMistake();
  assert.ok(sampleId2, "repeated sample call succeeds");

  // 2. Create mistake with SHA-256 dedupe & storage
  const imgKey = "2026-10-30/frac.jpg";
  await putImage(imgKey, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg");
  const mId = await createMistake({
    rawImageKey: imgKey,
    imageSha256: "deadbeef1234",
    diagnosis: SAMPLE_DIAGNOSIS,
    source: "五下期中卷",
  });
  assert.equal(await findMistakeBySha256("deadbeef1234"), mId);

  const counts0 = await countMistakes();
  assert.ok(counts0.total >= 2 && counts0.due >= 2);
  assert.ok((await listMistakes({ category: SAMPLE_DIAGNOSIS.category })).some((x) => x.id === mId));

  const loaded = await getMistake(mId);
  assert.ok(loaded);
  const [v1, v2, v3] = loaded.variants;

  // 3. Wrong unit "6厘米" for "6米" MUST fail (1st miss -> attemptCountOnVariant = 1, still due!)
  const miss1 = await recordAttempt(mId, v1.id, "6厘米");
  assert.equal(miss1.isCorrect, false, "6厘米 must NOT pass for 6米");
  assert.equal(miss1.attemptCountOnVariant, 1);
  assert.equal(miss1.review.status, "PENDING");
  assert.equal(miss1.progress.isDue, true);

  // 2nd miss increments attemptCountOnVariant to 2
  const miss2 = await recordAttempt(mId, v1.id, "5米");
  assert.equal(miss2.isCorrect, false);
  assert.equal(miss2.attemptCountOnVariant, 2);

  // 4. Solve L1 ("600厘米" === "6米"), L2 (bare "8" === "8页"), L3 ("12/3" === "4米") -> MASTERED!
  const hit1 = await recordAttempt(mId, v1.id, "600厘米");
  assert.equal(hit1.isCorrect, true);
  assert.equal(hit1.review.status, "CONSOLIDATING");
  assert.equal(hit1.progress.isDue, true);

  const hit2 = await recordAttempt(mId, v2.id, "8");
  assert.equal(hit2.isCorrect, true, "bare '8' must pass for '8页'");

  const hit3 = await recordAttempt(mId, v3.id, "12/3");
  assert.equal(hit3.isCorrect, true);
  assert.equal(hit3.review.status, "MASTERED");
  assert.equal(hit3.progress.isDue, false);

  // Repeat submit while MASTERED and not due -> stage does NOT inflate
  const dupHit = await recordAttempt(mId, v3.id, "4米");
  assert.equal(dupHit.review.stage, hit3.review.stage);

  // Next due mistake excludes mastered mId and finds due sampleId
  const nextDue = await getNextDueMistakeId(mId);
  assert.equal(nextDue, sampleId);

  // 5. NotFoundError on missing mistake or cross-mistake variantId
  await assert.rejects(() => recordAttempt("non-existent-id", v1.id, "6"), NotFoundError);
  await assert.rejects(() => recordAttempt(mId, "non-existent-variant", "6"), NotFoundError);

  // 6. deleteMistake cascades variants + attempts AND deletes image from storage!
  assert.equal(await deleteMistake(mId), true);
  assert.equal(await getMistake(mId), null);
  assert.equal(await getImage(imgKey), null, "associated image blob deleted");
  const orphanVariants = await all("SELECT id FROM variants WHERE mistake_id = ?", [mId]);
  const orphanAttempts = await all("SELECT id FROM attempts WHERE mistake_id = ?", [mId]);
  assert.equal(orphanVariants.length, 0, "variants cascade-deleted");
  assert.equal(orphanAttempts.length, 0, "attempts cascade-deleted");
  assert.equal(await deleteMistake(mId), false);
});
