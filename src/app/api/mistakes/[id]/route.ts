import { NextRequest, NextResponse } from "next/server";
import { deleteMistake, getMistake } from "@/lib/repo";
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

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const deleted = await deleteMistake(id);
    if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("deleteMistake failed", err);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
}
