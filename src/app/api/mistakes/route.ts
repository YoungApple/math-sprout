import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { diagnoseMistake } from "@/lib/gemini";
import { createMistake, findMistakeBySha256, getMistake, listMistakes } from "@/lib/repo";
import type { ReviewStatus } from "@/lib/review";
import { deleteImage, detectImageMime, putImage } from "@/lib/storage";
import { requirePasscode } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

function isHeicBuffer(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  return HEIC_BRANDS.has(bytes.subarray(8, 12).toString("ascii").toLowerCase());
}

function friendlyDiagnosisError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (/GEMINI_API_KEY/i.test(raw)) {
    return "服务端尚未配置 AI 诊断密钥，请联系管理员";
  }
  if (/AbortError|TimeoutError|timed?\s*out|aborted/i.test(raw)) {
    return "AI 诊断响应超时，请确认网络畅通后重试";
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate/i.test(raw)) {
    return "AI 请求较频繁（已达速率上限），请稍等片刻再试";
  }
  if (/\b503\b|UNAVAILABLE|overloaded/i.test(raw)) {
    return "AI 模型当前较忙，请稍后点击重试";
  }
  return "AI 暂时无法识别这道题，请对准单道错题重拍一张清晰照片再试";
}

/** GET /api/mistakes?due=1&status=...&category=... — list mistakes. */
export async function GET(req: NextRequest) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  const due = req.nextUrl.searchParams.get("due") === "1";
  const category = req.nextUrl.searchParams.get("category") || undefined;
  const status = (req.nextUrl.searchParams.get("status") || undefined) as ReviewStatus | undefined;

  const items = await listMistakes({ dueOnly: due, category, status, limit: 100 });
  return NextResponse.json({ items });
}

/**
 * POST /api/mistakes — multipart/form-data { image: File, note?: string, term?: string, source?: string }
 * Validates magic bytes, deduplicates by SHA-256, runs Gemini diagnosis first, and persists atomically.
 */
export async function POST(req: NextRequest) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求表单格式无效" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择一张错题照片" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "图片不能超过 10MB，请重新选择" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (isHeicBuffer(bytes)) {
    return NextResponse.json(
      { error: "暂不支持直接上传 HEIC 原图，请使用相机直接拍照或先转为 JPG/PNG 格式" },
      { status: 400 },
    );
  }

  const mime = detectImageMime(bytes);
  if (!mime) {
    return NextResponse.json(
      { error: "不支持的图片格式，请上传 JPG、PNG 或 WebP 图片" },
      { status: 400 },
    );
  }

  const imageSha256 = createHash("sha256").update(bytes).digest("hex");
  const existingId = await findMistakeBySha256(imageSha256);
  if (existingId) {
    const existing = await getMistake(existingId);
    if (existing) {
      return NextResponse.json({ id: existingId, deduplicated: true });
    }
  }

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const note = ((form.get("note") as string | null) ?? "").trim() || undefined;
  const term = ((form.get("term") as string | null) ?? "").trim() || undefined;
  const source = ((form.get("source") as string | null) ?? "").trim() || undefined;

  let storedImage = false;
  try {
    // Run Gemini BEFORE writing storage so failed/timed-out calls leave zero orphan files.
    const diagnosis = await diagnoseMistake(bytes, mime, note);
    await putImage(key, bytes, mime);
    storedImage = true;

    const id = await createMistake({
      rawImageKey: key,
      imageSha256,
      diagnosis,
      term,
      source,
    });
    return NextResponse.json({ id, diagnosis });
  } catch (err) {
    if (storedImage) {
      await deleteImage(key).catch(() => {});
    }
    console.error("diagnosis failed", err);
    return NextResponse.json({ error: friendlyDiagnosisError(err) }, { status: 502 });
  }
}
