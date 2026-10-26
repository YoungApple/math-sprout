import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal family passcode gate for the MVP. If FAMILY_PASSCODE is set, every API
 * request must carry it in the `x-family-passcode` header (the client stores it in localStorage).
 * Replace with real auth (NextAuth magic link) once there is more than one family.
 */
export function requirePasscode(req: NextRequest): NextResponse | null {
  const expected = process.env.FAMILY_PASSCODE;
  if (!expected) return null;
  const got = req.headers.get("x-family-passcode") ?? req.cookies.get("family_passcode")?.value;
  if (got === expected) return null;
  return NextResponse.json({ error: "passcode required" }, { status: 401 });
}
