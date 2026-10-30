import { NextRequest, NextResponse } from "next/server";
import { issueSessionCookie, verifyPasscode } from "@/lib/auth";

export const runtime = "nodejs";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 15;
const MAX_TRACKED_IPS = 1024;
const failedAttempts = new Map<string, number[]>();

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

/** POST /api/login { passcode } — verifies passcode with brute-force throttling and sets session cookie. */
export async function POST(req: NextRequest) {
  const now = Date.now();
  const key = clientKey(req);
  const recent = pruneFailures(key, now);
  if (recent.length >= MAX_FAILURES) {
    return NextResponse.json(
      { error: "尝试次数过多，请 5 分钟后再试" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: { passcode?: unknown };
  try {
    body = (await req.json()) as { passcode?: unknown };
  } catch {
    body = {};
  }

  const candidate = typeof body?.passcode === "string" ? body.passcode : "";
  const expected = process.env.FAMILY_PASSCODE;

  if (expected && !verifyPasscode(candidate, expected)) {
    if (failedAttempts.size >= MAX_TRACKED_IPS && !failedAttempts.has(key)) {
      const oldestKey = failedAttempts.keys().next().value;
      if (oldestKey) failedAttempts.delete(oldestKey);
    }
    failedAttempts.set(key, [...recent, now]);
    return NextResponse.json({ error: "口令不对" }, { status: 401 });
  }

  failedAttempts.delete(key);
  const res = NextResponse.json({ ok: true });
  issueSessionCookie(res, req, expected ?? candidate);
  return res;
}
