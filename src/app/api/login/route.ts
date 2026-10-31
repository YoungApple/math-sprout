import { NextRequest, NextResponse } from "next/server";
import { issueSessionCookie, sanitizeNextPath, verifyPasscode } from "@/lib/auth";

export const runtime = "nodejs";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 15;
const MAX_TRACKED_IPS = 1024;
const failedAttempts = new Map<string, number[]>();

function buildRedirectUrl(req: NextRequest, targetPath: string): URL {
  const origin = req.headers.get("origin")?.trim();
  if (origin && (origin.startsWith("http://") || origin.startsWith("https://"))) {
    return new URL(targetPath, origin);
  }
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  if (host) {
    return new URL(targetPath, `${proto}://${host}`);
  }
  return new URL(targetPath, req.url);
}
function clientKey(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || req.headers.get("x-real-ip")?.trim() || "local";
}

function pruneFailures(key: string, now: number): number[] {
  const recent = (failedAttempts.get(key) ?? []).filter((ts) => now - ts < WINDOW_MS);
  if (recent.length === 0) failedAttempts.delete(key);
  else failedAttempts.set(key, recent);
  return recent;
}

/**
 * POST /api/login — accepts JSON `{ passcode, next? }` OR HTML `<form>` POST,
 * verifies passcode (with NFKC/trim normalization & brute-force throttling), and sets session cookie.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  const isFormPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  const now = Date.now();
  const key = clientKey(req);
  const recent = pruneFailures(key, now);
  if (recent.length >= MAX_FAILURES) {
    if (isFormPost) {
      return NextResponse.redirect(buildRedirectUrl(req, "/login?error=rate_limit"), 303);
    }
    return NextResponse.json(
      { error: "尝试次数过多，请 5 分钟后再试" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let candidate = "";
  let nextPath = "/";
  if (isFormPost) {
    try {
      const form = await req.formData();
      const rawCode = form.get("passcode");
      const rawNext = form.get("next");
      candidate = typeof rawCode === "string" ? rawCode : "";
      nextPath = sanitizeNextPath(typeof rawNext === "string" ? rawNext : "/");
    } catch {
      candidate = "";
    }
  } else {
    try {
      const body = (await req.json()) as { passcode?: unknown; next?: unknown };
      candidate = typeof body?.passcode === "string" ? body.passcode : "";
      nextPath = sanitizeNextPath(typeof body?.next === "string" ? body.next : "/");
    } catch {
      candidate = "";
    }
  }

  const expected = process.env.FAMILY_PASSCODE?.trim();

  if (expected && !verifyPasscode(candidate, expected)) {
    if (failedAttempts.size >= MAX_TRACKED_IPS && !failedAttempts.has(key)) {
      const oldestKey = failedAttempts.keys().next().value;
      if (oldestKey) failedAttempts.delete(oldestKey);
    }
    failedAttempts.set(key, [...recent, now]);
    if (isFormPost) {
      const loginUrl = buildRedirectUrl(req, "/login");
      loginUrl.searchParams.set("next", nextPath);
      loginUrl.searchParams.set("error", "bad_code");
      return NextResponse.redirect(loginUrl, 303);
    }
    return NextResponse.json({ error: "口令不对，请确认当前环境配置的 FAMILY_PASSCODE" }, { status: 401 });
  }

  failedAttempts.delete(key);
  const res = isFormPost
    ? NextResponse.redirect(buildRedirectUrl(req, nextPath), 303)
    : NextResponse.json({ ok: true, redirectTo: nextPath });
  issueSessionCookie(res, req, expected ?? candidate);
  return res;
}
