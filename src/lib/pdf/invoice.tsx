// explicit import: the email:check script's tsx transform compiles this file
// with the classic JSX runtime (tsconfig.email.json's react-jsx setting only
// covers emails/ and scripts/); Next's own build doesn't need it but it's
// harmless there
import * as React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { Money } from "@/lib/domain/money";
import { paymentTermsLabel } from "@/lib/domain/payment-terms";
import type {
  InvoiceSnapshot,
  SnapshotLine,
} from "@/lib/domain/invoice-snapshot";
import {
  DEFAULT_PDF_TEMPLATE,
  type PdfTemplateId,
} from "@/lib/domain/pdf-templates";

/**
 * Invoice PDF, rendered ONLY from the issue snapshot (brief §5.3): the
 * same input always produces the same document, no matter what changed
 * since issue. Free-plan documents carry the small "invoicer" footer
 * (watermark removal is a Pro entitlement — brief §4.4).
 */

const ACCENT_FALLBACK = "#103B05";

/** Per-template knobs; structure stays shared, density and header vary. */
const TEMPLATE_KNOBS: Record<
  PdfTemplateId,
  { base: number; pad: number; rowPad: number; title: number; bar: number }
> = {
  classic: { base: 9, pad: 48, rowPad: 5, title: 22, bar: 6 },
  compact: { base: 8, pad: 36, rowPad: 2.5, title: 16, bar: 3 },
  bold: { base: 9, pad: 48, rowPad: 5, title: 26, bar: 0 },
};

const makeStyles = (t: PdfTemplateId) => {
  const k = TEMPLATE_KNOBS[t];
  return StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: k.base,
    color: "#1a1a1a",
    paddingTop: t === "bold" ? 0 : 40,
    paddingBottom: 56,
    paddingHorizontal: 0,
  },
  body: { paddingHorizontal: k.pad, paddingTop: t === "bold" ? 24 : 0 },
  boldHeader: {
    paddingHorizontal: k.pad,
    paddingVertical: 28,
    marginBottom: 4,
  },
  boldHeaderText: { color: "#ffffff" },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: k.bar,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  orgName: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#666666" },
  docTitle: {
    fontSize: k.title,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  docNumber: { fontSize: 11, textAlign: "right", marginTop: 2 },
  metaBlock: { textAlign: "right", marginTop: 10 },
  metaLine: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  metaLabel: { color: "#666666", marginRight: 12 },
  billTo: { marginBottom: 24, maxWidth: 240 },
  sectionLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#666666",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  table: { marginBottom: 16 },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 4,
    marginBottom: 2,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dddddd",
    paddingVertical: k.rowPad,
  },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  colDesc: { flex: 5 },
  colQty: { flex: 1.2, textAlign: "right" },
  colPrice: { flex: 2, textAlign: "right" },
  colDisc: { flex: 1.2, textAlign: "right" },
  colTax: { flex: 1.2, textAlign: "right" },
  colAmount: { flex: 2.2, textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 220, marginTop: 6 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  grandTotal: {
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    marginTop: 3,
    paddingTop: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  notes: { marginTop: 24, maxWidth: 360 },
  notesText: { color: "#444444", lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: k.pad,
    right: k.pad,
    textAlign: "center",
    color: "#999999",
    fontSize: 7,
  },
  });
};

function fmt(minor: string, currency: string): string {
  return Money.fromMinor(BigInt(minor), currency).toString();
}

function pct(bps: number): string {
  return bps > 0 ? `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%` : "—";
}

function addressLines(a: {
  addressLine1: string | null;
  addressLine2?: string | null;
  city: string | null;
  country: string | null;
}): string[] {
  return [
    a.addressLine1,
    a.addressLine2 ?? null,
    [a.city, a.country].filter(Boolean).join(", ") || null,
  ].filter((l): l is string => Boolean(l));
}

export function InvoicePdf({
  snapshot,
  status,
  watermark,
  logoUrl,
  template = DEFAULT_PDF_TEMPLATE,
  docTitle = "INVOICE",
  dueLabel = "Due date",
  reference = null,
}: {
  snapshot: InvoiceSnapshot;
  /** printed on annulled documents so a voided PDF can't pass as live */
  status: string;
  watermark: boolean;
  /** resolved from the snapshot's logoKey at render time (R2 public URL) */
  logoUrl?: string | null;
  /** frozen into the snapshot at issue; defaults to classic for old docs */
  template?: PdfTemplateId;
  /** "INVOICE" (default) / "ESTIMATE" / "CREDIT NOTE" */
  docTitle?: string;
  /** "Due date" (default) / "Valid until" */
  dueLabel?: string;
  /** extra reference line, e.g. "Credits invoice INV-000123" */
  reference?: string | null;
}) {
  const styles = makeStyles(template);
  const accent = snapshot.branding?.accentColor ?? ACCENT_FALLBACK;
  const currency = snapshot.currency;
  const discounted = BigInt(snapshot.totals.discountTotalMinor ?? "0") > 0n;
  const bold = template === "bold";

  return (
    <Document
      title={`Invoice ${snapshot.displayNumber}`}
      author={snapshot.branding?.legalName ?? "invoicer"}
      creator="invoicer"
      producer="invoicer"
    >
      <Page size="A4" style={styles.page}>
        {!bold && (
          <View style={[styles.accentBar, { backgroundColor: accent }]} fixed />
        )}
        {bold && (
          <View style={[styles.boldHeader, { backgroundColor: accent }]}>
            <View style={styles.headerRow}>
              <View style={{ maxWidth: 260 }}>
                {logoUrl && (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
                  <Image
                    src={logoUrl}
                    style={{ maxHeight: 48, maxWidth: 180, marginBottom: 8, objectFit: "contain" }}
                  />
                )}
                <Text style={[styles.orgName, styles.boldHeaderText, { fontSize: 16 }]}>
                  {snapshot.branding?.legalName ?? "Your organization"}
                </Text>
              </View>
              <View>
                <Text style={[styles.docTitle, styles.boldHeaderText]}>
                  {status === "void" ? `${docTitle} (VOID)` : docTitle}
                </Text>
                <Text style={[styles.docNumber, styles.boldHeaderText]}>
                  {snapshot.displayNumber}
                </Text>
              </View>
            </View>
          </View>
        )}
        <View style={styles.body}>

        <View style={styles.headerRow}>
          <View style={{ maxWidth: 240 }}>
            {!bold && logoUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
              <Image src={logoUrl} style={{ maxHeight: 42, maxWidth: 160, marginBottom: 8, objectFit: "contain" }} />
            )}
            {!bold && (
              <Text style={styles.orgName}>
                {snapshot.branding?.legalName ?? "Your organization"}
              </Text>
            )}
            {snapshot.branding &&
              addressLines(snapshot.branding).map((line) => (
                <Text key={line} style={styles.muted}>
                  {line}
                </Text>
              ))}
            {snapshot.branding?.kraPin && (
              <Text style={styles.muted}>PIN: {snapshot.branding.kraPin}</Text>
            )}
            {snapshot.branding?.contactEmail && (
              <Text style={styles.muted}>{snapshot.branding.contactEmail}</Text>
            )}
          </View>
          <View>
            {!bold && (
              <>
                <Text style={styles.docTitle}>
                  {status === "void" ? `${docTitle} (VOID)` : docTitle}
                </Text>
                <Text style={styles.docNumber}>{snapshot.displayNumber}</Text>
              </>
            )}
            <View style={styles.metaBlock}>
              <View style={styles.metaLine}>
                <Text style={styles.metaLabel}>Issue date</Text>
                <Text>{snapshot.issueDate}</Text>
              </View>
              {snapshot.dueDate && (
                <View style={styles.metaLine}>
                  <Text style={styles.metaLabel}>{dueLabel}</Text>
                  <Text>{snapshot.dueDate}</Text>
                </View>
              )}
              {reference && (
                <View style={styles.metaLine}>
                  <Text style={styles.metaLabel}>Ref</Text>
                  <Text>{reference}</Text>
                </View>
              )}
              {snapshot.paymentTermsDays != null && (
                <View style={styles.metaLine}>
                  <Text style={styles.metaLabel}>Terms</Text>
                  <Text>{paymentTermsLabel(snapshot.paymentTermsDays)}</Text>
                </View>
              )}
              {snapshot.fxRateToBase && (
                <View style={styles.metaLine}>
                  <Text style={styles.metaLabel}>
                    Rate to {snapshot.baseCurrency}
                  </Text>
                  <Text>{snapshot.fxRateToBase}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.billTo}>
          <Text style={styles.sectionLabel}>Bill to</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>
            {snapshot.customer.name}
          </Text>
          {addressLines(snapshot.customer).map((line) => (
            <Text key={line} style={styles.muted}>
              {line}
            </Text>
          ))}
          {snapshot.customer.primaryContact?.email && (
            <Text style={styles.muted}>
              {snapshot.customer.primaryContact.email}
            </Text>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={[styles.colDesc, styles.thText]}>Description</Text>
            <Text style={[styles.colQty, styles.thText]}>Qty</Text>
            <Text style={[styles.colPrice, styles.thText]}>Unit price</Text>
            <Text style={[styles.colDisc, styles.thText]}>Disc</Text>
            <Text style={[styles.colTax, styles.thText]}>Tax</Text>
            <Text style={[styles.colAmount, styles.thText]}>Amount</Text>
          </View>
          {snapshot.lines.map((line: SnapshotLine) => (
            <View key={line.position} style={styles.tr} wrap={false}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>
                {fmt(line.unitPriceMinor, currency)}
              </Text>
              <Text style={styles.colDisc}>{pct(line.discountBps ?? 0)}</Text>
              <Text style={styles.colTax}>{pct(line.taxRateBps)}</Text>
              <Text style={styles.colAmount}>
                {fmt(line.lineTotalMinor, currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Subtotal</Text>
            <Text>{fmt(snapshot.totals.subtotalMinor, currency)}</Text>
          </View>
          {discounted && (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>Discount</Text>
              <Text>-{fmt(snapshot.totals.discountTotalMinor ?? "0", currency)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Tax</Text>
            <Text>{fmt(snapshot.totals.taxTotalMinor, currency)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text>Total</Text>
            <Text>{fmt(snapshot.totals.totalMinor, currency)}</Text>
          </View>
        </View>

        {(snapshot.notes || snapshot.terms) && (
          <View style={styles.notes}>
            {snapshot.notes && (
              <>
                <Text style={styles.sectionLabel}>Notes</Text>
                <Text style={[styles.notesText, { marginBottom: 10 }]}>
                  {snapshot.notes}
                </Text>
              </>
            )}
            {snapshot.terms && (
              <>
                <Text style={styles.sectionLabel}>Terms</Text>
                <Text style={styles.notesText}>{snapshot.terms}</Text>
              </>
            )}
          </View>
        )}

        </View>

        {watermark && (
          <Text style={styles.footer} fixed>
            Created with invoicer — professional invoicing for Kenyan
            freelancers and teams
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(params: {
  snapshot: InvoiceSnapshot;
  status: string;
  watermark: boolean;
  logoUrl?: string | null;
  template?: PdfTemplateId;
  docTitle?: string;
  dueLabel?: string;
  reference?: string | null;
}): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf {...params} />);
}
