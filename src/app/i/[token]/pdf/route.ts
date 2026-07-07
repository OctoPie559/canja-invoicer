import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getInvoiceByPublicToken } from "@/lib/services/invoices";
import { renderInvoicePdf } from "@/lib/pdf/invoice";

/** Public PDF download — the unguessable token is the whole capability. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const data = await getInvoiceByPublicToken(getDb(), token);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const pdf = await renderInvoicePdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.snapshot.displayNumber}.pdf"`,
      // tokens are capabilities: keep them out of shared caches
      "Cache-Control": "private, no-store",
    },
  });
}
