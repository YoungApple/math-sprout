import { NextRequest, NextResponse } from "next/server";
import { requirePasscode } from "@/lib/auth";
import { checkHomeworkPage, getSampleHomeworkCheck } from "@/lib/homework-check";
import { detectImageMime } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

function isHeicBuffer(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  return HEIC_BRANDS.has(bytes.subarray(8, 12).toString("ascii").toLowerCase());
}

function friendlyHomeworkCheckError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (/GEMINI_API_KEY/i.test(raw)) {
    return "服务端尚未配置 AI 批改密钥，请联系管理员";
  }
  if (/AbortError|TimeoutError|timed?\s*out|aborted/i.test(raw)) {
    return "整页作业批改响应超时，请确认光线清晰、网络畅通后重试";
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate/i.test(raw)) {
    return "AI 请求较频繁（已达速率上限），请稍等片刻再试";
  }
  if (/\b503\b|UNAVAILABLE|overloaded/i.test(raw)) {
    return "AI 模型当前较忙，请稍后点击重试";
  }
  return "AI 暂时无法清晰识别整页作业，请平铺作业本、对齐光线后重拍再试";
}

/**
 * POST /api/homework-check
 * - `?sample=1`: returns zero-Gemini 4-problem demo worksheet & check result immediately.
 * - multipart/form-data `{ image: File, note?: string, grade?: string, term?: string, source?: string }`:
 *   checks every problem on the page and returns `HomeworkCheckResult`.
 */
export async function POST(req: NextRequest) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  if (req.nextUrl.searchParams.get("sample") === "1") {
    try {
      const sample = await getSampleHomeworkCheck();
      return NextResponse.json(sample);
    } catch (err) {
      console.error("sample homework check failed", err);
      return NextResponse.json({ error: "加载示例作业失败，请稍后重试" }, { status: 500 });
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求表单格式无效" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择一张整页作业或试卷照片" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "图片不能超过 12MB，请重新选择" }, { status: 413 });
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

  const note = ((form.get("note") as string | null) ?? "").trim() || undefined;
  const term = ((form.get("term") as string | null) ?? "").trim() || undefined;
  const source = ((form.get("source") as string | null) ?? "").trim() || undefined;
  const gradeStr = ((form.get("grade") as string | null) ?? "").trim();
  const parsedGrade = gradeStr && /^[1-6]$/.test(gradeStr) ? Number(gradeStr) : undefined;

  try {
    const result = await checkHomeworkPage(bytes, mime, {
      note,
      grade: parsedGrade,
      term,
      source,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("homework check failed", err);
    return NextResponse.json({ error: friendlyHomeworkCheckError(err) }, { status: 502 });
  }
}
