import { NextRequest, NextResponse } from "next/server";

/**
 * Family passcode gate for every page and API route when FAMILY_PASSCODE is set.
 * The cookie is issued by /api/login; APIs additionally accept the x-family-passcode header.
 */
export function middleware(req: NextRequest) {
  const expected = process.env.FAMILY_PASSCODE;
  if (!expected) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const cookie = req.cookies.get("family_passcode")?.value;
  const header = req.headers.get("x-family-passcode");
  if (cookie === expected || header === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "passcode required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/|manifest.webmanifest|icon.svg|favicon.ico).*)"],
};
