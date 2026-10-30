import { NextRequest, NextResponse } from "next/server";
import { requirePasscode, sanitizeNextPath } from "@/lib/auth";

const PUBLIC_EXACT_PATHS = new Set([
  "/login",
  "/api/login",
  "/api/health",
  "/manifest.webmanifest",
  "/icon.svg",
  "/favicon.ico",
]);

/**
 * Family passcode gate for every page and API route when FAMILY_PASSCODE is set.
 * Session cookies are issued by /api/login; APIs additionally accept x-family-passcode.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_EXACT_PATHS.has(pathname) || pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  const denied = requirePasscode(req);
  if (!denied) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return denied;
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", sanitizeNextPath(`${pathname}${search}`));
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$).*)"],
};
