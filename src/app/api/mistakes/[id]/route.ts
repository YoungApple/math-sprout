import { NextRequest, NextResponse } from "next/server";
import { requirePasscode } from "@/lib/auth";
import { isValidErrorCategory } from "@/lib/gemini";
import {
  NotFoundError,
  deleteMistake,
  getMistake,
  updateMistakeMeta,
  type MistakeMetaPatch,
} from "@/lib/repo";
import { normalizeTerm } from "@/lib/taxonomy";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const m = await getMistake(id);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const { id } = await ctx.params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体需为有效 JSON" }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "请求参数格式无效" }, { status: 400 });
  }

  const body = rawBody as Record<string, unknown>;
  const patch: MistakeMetaPatch = {};

  if ("grade" in body && body.grade !== undefined) {
    if (body.grade === null || body.grade === "") {
      patch.grade = null;
    } else {
      const g = Number(body.grade);
      if (!Number.isInteger(g) || g < 1 || g > 6) {
        return NextResponse.json({ error: "年级必须为 1–6 的整数" }, { status: 400 });
      }
      patch.grade = g;
    }
  }

  if ("term" in body && body.term !== undefined) {
    if (body.term === null || body.term === "") {
      patch.term = null;
    } else if (typeof body.term === "string") {
      const norm = normalizeTerm(body.term);
      if (!norm) {
        return NextResponse.json({ error: "学期仅支持“上学期”或“下学期”" }, { status: 400 });
      }
      patch.term = norm;
    } else {
      return NextResponse.json({ error: "学期字段类型无效" }, { status: 400 });
    }
  }

  if ("source" in body && body.source !== undefined) {
    if (body.source === null) {
      patch.source = null;
    } else if (typeof body.source === "string") {
      patch.source = body.source.trim().slice(0, 120) || null;
    } else {
      return NextResponse.json({ error: "来源字段类型无效" }, { status: 400 });
    }
  }

  if ("category" in body && body.category !== undefined) {
    if (body.category === null) {
      patch.category = null;
    } else if (typeof body.category === "string") {
      patch.category = body.category.trim().slice(0, 120) || null;
    } else {
      return NextResponse.json({ error: "题型分类字段类型无效" }, { status: 400 });
    }
  }

  if ("errorCategory" in body && body.errorCategory !== undefined) {
    if (!isValidErrorCategory(body.errorCategory)) {
      return NextResponse.json({ error: "错因分类枚举值无效" }, { status: 400 });
    }
    patch.errorCategory = body.errorCategory;
  }

  try {
    const updated = await updateMistakeMeta(id, patch);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("updateMistakeMeta failed", err);
    return NextResponse.json({ error: "更新错题分类失败，请稍后重试" }, { status: 500 });
  }
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
