import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getCreditNotePdfData } from "@/lib/services/credit-notes";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { requireMembership } from "@/lib/transport/org";

/** Authenticated credit-note PDF; drafts have no document. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; creditNoteId: string }> },
) {
  const { orgId, creditNoteId } = await params;
  await requireMembership(orgId);
  const data = await getCreditNotePdfData(getDb(), orgId, creditNoteId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderInvoicePdf({
    snapshot: data.snapshot,
    status: data.status,
    watermark: data.watermark,
    logoUrl: data.logoUrl,
    template: data.template,
    docTitle: "CREDIT NOTE",
    reference: data.reference,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.displayNumber}.pdf"`,
    },
  });
}
