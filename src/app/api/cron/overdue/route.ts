import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { markOverdueInvoices } from "@/lib/services/payments";

/**
 * Vercel Cron target (daily): flips past-due sent/partial invoices to
 * overdue, audited as system. Authenticated by CRON_SECRET — Vercel sends
 * it as a Bearer token on scheduled invocations.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // compare BYTE lengths — a multibyte header of equal string length would
  // otherwise make timingSafeEqual throw (500 instead of 401)
  const authorized =
    Boolean(secret) &&
    header.byteLength === expected.byteLength &&
    timingSafeEqual(header, expected);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const { marked } = await markOverdueInvoices(getDb(), today);
  return NextResponse.json({ ok: true, marked, today });
}
