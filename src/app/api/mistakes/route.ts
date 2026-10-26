import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { diagnoseMistake } from "@/lib/gemini";
import { createMistake, listMistakes } from "@/lib/repo";
import { putImage } from "@/lib/storage";
import { requirePasscode } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET /api/mistakes?due=1 — list mistakes (optionally only the ones due for review). */
export async function GET(req: NextRequest) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const due = req.nextUrl.searchParams.get("due") === "1";
  const items = await listMistakes({ dueOnly: due, limit: 100 });
  return NextResponse.json({ items });
}

/**
 * POST /api/mistakes — multipart/form-data { image: File, note?: string, term?: string, source?: string }
 * Stores the photo, runs the Gemini diagnosis and persists the result.
 */
export async function POST(req: NextRequest) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "image is required" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "image too large" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

  try {
    const [diagnosis] = await Promise.all([
      diagnoseMistake(bytes, mime, (form.get("note") as string) || undefined),
      putImage(key, bytes, mime),
    ]);
    const id = await createMistake({
      rawImageKey: key,
      diagnosis,
      term: (form.get("term") as string) || undefined,
      source: (form.get("source") as string) || undefined,
    });
    return NextResponse.json({ id, diagnosis });
  } catch (err) {
    console.error("diagnosis failed", err);
    const message = err instanceof Error ? err.message : "diagnosis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
