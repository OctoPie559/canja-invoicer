import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getEstimateByPublicToken } from "@/lib/services/estimates";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { parseInvoiceSnapshot } from "@/lib/domain/invoice-snapshot";
import {
  DEFAULT_PDF_TEMPLATE,
  isPdfTemplateId,
} from "@/lib/domain/pdf-templates";
import { getFileStorage } from "@/lib/storage/r2";

/** Public estimate PDF — the unguessable token is the whole capability. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const data = await getEstimateByPublicToken(getDb(), token);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = data.snapshot as Record<string, unknown> & {
    expiryDate?: string;
    displayNumber?: string;
    pdfTemplate?: string;
    branding?: { logoKey?: string | null };
  };
  const snapshot = parseInvoiceSnapshot({ ...raw, dueDate: raw.expiryDate });
  let logoUrl: string | null = null;
  if (raw.branding?.logoKey) {
    try {
      logoUrl = getFileStorage().publicUrl(raw.branding.logoKey);
    } catch {
      logoUrl = null;
    }
  }
  const pdf = await renderInvoicePdf({
    snapshot,
    status: data.status,
    watermark: data.watermark,
    logoUrl,
    template:
      raw.pdfTemplate && isPdfTemplateId(raw.pdfTemplate)
        ? raw.pdfTemplate
        : DEFAULT_PDF_TEMPLATE,
    docTitle: "ESTIMATE",
    dueLabel: "Valid until",
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${raw.displayNumber ?? "quote"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
