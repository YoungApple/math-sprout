import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const runtime = "nodejs";

/** Unauthenticated liveness/readiness probe verifying DB connectivity. */
export async function GET() {
  try {
    await one("SELECT 1 AS ok");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("healthcheck failed", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
