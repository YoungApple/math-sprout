import { NextRequest, NextResponse } from "next/server";
import { NotFoundError, recordAttempt } from "@/lib/repo";
import { requirePasscode } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/mistakes/:id/attempt { variantId, answer } — grades a variant answer and advances the review state. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  let body: { variantId?: unknown; answer?: unknown } | null = null;
  try {
    body = (await req.json()) as { variantId?: unknown; answer?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (
    !body ||
    typeof body.variantId !== "string" ||
    body.variantId.trim().length === 0 ||
    typeof body.answer !== "string"
  ) {
    return NextResponse.json({ error: "variantId and answer are required" }, { status: 400 });
  }

  try {
    const result = await recordAttempt(id, body.variantId, body.answer);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotFoundError || (err instanceof Error && err.name === "NotFoundError")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("recordAttempt failed", err);
    return NextResponse.json({ error: "提交答案失败，请稍后重试" }, { status: 500 });
  }
}
