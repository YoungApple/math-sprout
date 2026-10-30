import { NextRequest, NextResponse } from "next/server";
import { requirePasscode } from "@/lib/auth";
import { createSampleMistake } from "@/lib/repo";

export const runtime = "nodejs";

/** POST /api/mistakes/sample — seeds a curated Grade-3 sample mistake instantly without calling Gemini. */
export async function POST(req: NextRequest) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  try {
    const id = await createSampleMistake();
    return NextResponse.json({ id });
  } catch (err) {
    console.error("failed to create sample mistake", err);
    return NextResponse.json({ error: "无法创建示例错题，请稍后重试" }, { status: 500 });
  }
}
