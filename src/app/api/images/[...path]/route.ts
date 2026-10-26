import { NextRequest, NextResponse } from "next/server";
import { getImage } from "@/lib/storage";
import { requirePasscode } from "@/lib/auth";

export const runtime = "nodejs";

/** Serves stored photos (local disk or GCS) through our own origin so they load from mainland China. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;
  const { path } = await ctx.params;
  const key = path.join("/");
  const bytes = await getImage(key);
  if (!bytes) return new NextResponse("not found", { status: 404 });
  const type = key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": type, "cache-control": "private, max-age=31536000, immutable" },
  });
}
