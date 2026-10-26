import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST /api/login { passcode } — sets the family cookie for one year. */
export async function POST(req: NextRequest) {
  const expected = process.env.FAMILY_PASSCODE;
  const body = (await req.json().catch(() => ({}))) as { passcode?: string };
  if (expected && body.passcode !== expected) {
    return NextResponse.json({ error: "口令不对" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("family_passcode", body.passcode ?? "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
