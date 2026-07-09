import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getEstimatePdfData } from "@/lib/services/estimates";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { requireMembership } from "@/lib/transport/org";

/** Authenticated estimate PDF; drafts have no document. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; estimateId: string }> },
) {
  const { orgId, estimateId } = await params;
  await requireMembership(orgId);
  const data = await getEstimatePdfData(getDb(), orgId, estimateId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await renderInvoicePdf({
    ...data,
    docTitle: "ESTIMATE",
    dueLabel: "Valid until",
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.displayNumber}.pdf"`,
    },
  });
}
