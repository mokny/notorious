import type { ModuleSdk } from "../manifest.js";
import { getDocument } from "./documents.js";
import { getCustomer } from "./customers.js";
import { getCompanySettings } from "./companySettings.js";
import { getDunningLetter } from "./dunning.js";
import { documentTypeLabel, dunningLevelTitle } from "../pdf/text.de.js";
import type { CustomerDto } from "./customers.js";

function resolveRecipient(customer: CustomerDto, recipientOverride: string | undefined): string {
  const recipient = recipientOverride || customer.contacts.find((c) => c.isPrimary)?.email || customer.contacts[0]?.email;
  if (!recipient) throw new Error("No recipient email address available - add one to the customer's contacts or provide one explicitly");
  return recipient;
}

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

  const recipient = resolveRecipient(customer, recipientOverride);

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

/** Sends a dunning letter's PDF by email - same recipient-resolution and thin-composition rules as `sendDocumentByEmail` (caller already has the rendered PDF, see routes/dunningPdf.ts::renderAndMaybeCacheDunningPdf). */
export async function sendDunningLetterByEmail(
  sdk: ModuleSdk,
  workspaceId: string,
  dunningLetterId: string,
  pdfBuffer: Buffer,
  recipientOverride: string | undefined,
): Promise<{ sentTo: string }> {
  const letter = getDunningLetter(sdk, workspaceId, dunningLetterId);
  if (!letter) throw new Error("Dunning letter not found");
  if (letter.status !== "sent") throw new Error("Dunning letter must be marked as sent before emailing (see markDunningLetterSent)");

  const invoice = getDocument(sdk, workspaceId, letter.invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  const customer = getCustomer(sdk, workspaceId, invoice.customerId);
  if (!customer) throw new Error("Customer not found");

  const recipient = resolveRecipient(customer, recipientOverride);
  const company = getCompanySettings(sdk, workspaceId);
  const title = dunningLevelTitle[letter.level];
  const subject = `${title} ${letter.number} von ${company.legalName}`;
  const text = `Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie unsere ${title.toLowerCase()} ${letter.number} zur Rechnung ${invoice.number}.\n\nMit freundlichen Grüßen\n${company.legalName}`;

  await sdk.sendEmail({
    to: recipient,
    subject,
    text,
    attachments: [{ filename: `${letter.number}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });

  return { sentTo: recipient };
}
