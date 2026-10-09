import { NextResponse } from "next/server";
import { authReady } from "@/features/account/server/auth";
import { database } from "@/features/account/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

// Public readiness only: never return account data, configuration, or provider errors.
export async function GET() {
  try {
    await authReady();
    database().prepare("SELECT 1").get();
    return NextResponse.json({ ok: true, revision: process.env.APP_REVISION || "development" }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
