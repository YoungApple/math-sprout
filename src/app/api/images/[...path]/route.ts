import { NextRequest, NextResponse } from "next/server";
import { detectImageMime, getImage } from "@/lib/storage";
import { requirePasscode } from "@/lib/auth";

export const runtime = "nodejs";

/** Serves stored photos (local disk, DB blobs, or GCS) through our own origin for mainland China reachability. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const denied = requirePasscode(req);
  if (denied) return denied;

  const { path } = await ctx.params;
  const key = path.join("/");
  const bytes = await getImage(key);
  if (!bytes) return new NextResponse("not found", { status: 404 });

  const detected = detectImageMime(bytes);
  const type =
    detected ??
    (key.endsWith(".svg")
      ? "image/svg+xml; charset=utf-8"
      : key.endsWith(".png")
        ? "image/png"
        : key.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg");

  const headers: Record<string, string> = {
    "content-type": type,
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  };
  if (type.startsWith("image/svg+xml")) {
    headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  return new NextResponse(new Uint8Array(bytes), { headers });
}
