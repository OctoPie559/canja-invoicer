import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getInvoicePdfData } from "@/lib/services/invoices";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { requireMembership } from "@/lib/transport/org";

/** Authenticated PDF download; drafts have no document to download. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; invoiceId: string }> },
) {
  const { orgId, invoiceId } = await params;
  await requireMembership(orgId);

  const data = await getInvoicePdfData(getDb(), orgId, invoiceId);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const pdf = await renderInvoicePdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.displayNumber}.pdf"`,
    },
  });
}
