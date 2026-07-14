import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { reconcilePendingIntents } from "@/lib/services/checkout";
import { expireLapsedSubscriptions } from "@/lib/services/subscriptions";

/**
 * Vercel Cron target (daily): sweeps abandoned/timed-out charge attempts and
 * downgrades Pro subscriptions whose paid period has lapsed. Audited as system.
 * Authenticated by CRON_SECRET — Vercel sends it as a Bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const authorized =
    Boolean(secret) &&
    header.byteLength === expected.byteLength &&
    timingSafeEqual(header, expected);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { swept } = await reconcilePendingIntents(getDb(), now);
  const { downgraded } = await expireLapsedSubscriptions(getDb(), now);
  return NextResponse.json({ ok: true, swept, downgraded });
}
