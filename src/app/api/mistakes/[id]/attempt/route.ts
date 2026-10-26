import { NextRequest, NextResponse } from "next/server";
import { recordAttempt } from "@/lib/repo";
import { requirePasscode } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/mistakes/:id/attempt { variantId, answer } — grades a variant answer and advances the review state. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { variantId?: string; answer?: string } | null;
  if (!body?.variantId || typeof body.answer !== "string") {
    return NextResponse.json({ error: "variantId and answer are required" }, { status: 400 });
  }
  try {
    const result = await recordAttempt(id, body.variantId, body.answer);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 404 });
  }
}
