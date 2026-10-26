import { NextRequest, NextResponse } from "next/server";
import { getMistake } from "@/lib/repo";
import { requirePasscode } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const m = await getMistake(id);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m);
}
