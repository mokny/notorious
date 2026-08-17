import type { ModuleSdk } from "../manifest.js";
import { getDocument } from "./documents.js";
import { getCustomer } from "./customers.js";
import { getCompanySettings } from "./companySettings.js";
import { documentTypeLabel } from "../pdf/text.de.js";

/** Sends an issued document's PDF by email to the given recipient (defaults to the customer's primary contact) via the SDK's SMTP capability - see routes/documents.ts's `send-email` route. Requires the caller to already have the rendered PDF buffer (see routes/documentPdf.ts::renderAndMaybeCachePdf), so this stays a thin composition, not a duplicate render path. */
export async function sendDocumentByEmail(
  sdk: ModuleSdk,
  workspaceId: string,
  documentId: string,
  pdfBuffer: Buffer,
  recipientOverride: string | undefined,
): Promise<{ sentTo: string }> {
  const document = getDocument(sdk, workspaceId, documentId);
  if (!document) throw new Error("Document not found");
  if (document.status !== "issued") throw new Error("Only issued documents can be emailed");

  const customer = getCustomer(sdk, workspaceId, document.customerId);
  if (!customer) throw new Error("Customer not found");

  const recipient = recipientOverride || customer.contacts.find((c) => c.isPrimary)?.email || customer.contacts[0]?.email;
  if (!recipient) throw new Error("No recipient email address available - add one to the customer's contacts or provide one explicitly");

  const company = getCompanySettings(sdk, workspaceId);
  const label = documentTypeLabel[document.type];
  const subject = `${label} ${document.number} von ${company.legalName}`;
  const text = `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie ${label.toLowerCase()} ${document.number} von ${company.legalName}.\n\nMit freundlichen Grüßen\n${company.legalName}`;

  await sdk.sendEmail({
    to: recipient,
    subject,
    text,
    attachments: [{ filename: `${document.number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });

  return { sentTo: recipient };
}
