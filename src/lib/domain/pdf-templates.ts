/**
 * Built-in PDF template catalog. "classic" is the free default; any other
 * choice is a Pro capability (customTemplates, brief §4.4) enforced
 * server-side at selection time. The chosen template is frozen into the
 * issue snapshot, so switching later never re-skins issued documents.
 */

export const PDF_TEMPLATES = [
  {
    id: "classic",
    name: "Classic",
    description: "Accent bar, roomy layout — the invoicer default.",
    pro: false,
  },
  {
    id: "compact",
    name: "Compact",
    description: "Dense rows and tight margins for long, itemized invoices.",
    pro: true,
  },
  {
    id: "bold",
    name: "Bold",
    description: "Full-width accent header with a logo-forward identity.",
    pro: true,
  },
] as const;

export type PdfTemplateId = (typeof PDF_TEMPLATES)[number]["id"];

export const DEFAULT_PDF_TEMPLATE: PdfTemplateId = "classic";

export function isPdfTemplateId(value: string): value is PdfTemplateId {
  return PDF_TEMPLATES.some((t) => t.id === value);
}

export function isProTemplate(id: PdfTemplateId): boolean {
  return PDF_TEMPLATES.find((t) => t.id === id)?.pro ?? false;
}
