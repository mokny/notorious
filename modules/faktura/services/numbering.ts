import type { ModuleSdk } from "../manifest.js";
import type { FakturaDocumentRow, FakturaDocumentType } from "../db/types.js";
import { getNumberPrefixes, getCompanySettings } from "./companySettings.js";
import { getDocument, resolveDisclaimerText, type DocumentDto } from "./documents.js";
import { getCompanyTaxFlags } from "./companySettings.js";

const PREFIX_KEY: Record<FakturaDocumentType, "quote" | "order" | "invoice" | "credit_note"> = {
  quote: "quote",
  order: "order",
  invoice: "invoice",
  credit_note: "credit_note",
};

/**
 * Allocates the next gapless number for (workspace, documentType, year),
 * incrementing the counter in the same DB transaction the caller wraps this
 * in - `sqlite.transaction()` in better-sqlite3 is synchronous, so no other
 * write can interleave between the SELECT and the UPDATE here, guaranteeing
 * no two documents ever get the same number even under concurrent issue
 * requests.
 */
function allocateNumber(sdk: ModuleSdk, workspaceId: string, documentType: FakturaDocumentType, year: number): number {
  const row = sdk.sqlite
    .prepare("SELECT next_number FROM faktura_number_sequences WHERE workspace_id = ? AND document_type = ? AND year = ?")
    .get(workspaceId, documentType, year) as { next_number: number } | undefined;

  const next = row ? row.next_number : 1;
  if (row) {
    sdk.sqlite
      .prepare("UPDATE faktura_number_sequences SET next_number = ? WHERE workspace_id = ? AND document_type = ? AND year = ?")
      .run(next + 1, workspaceId, documentType, year);
  } else {
    sdk.sqlite
      .prepare("INSERT INTO faktura_number_sequences (workspace_id, document_type, year, next_number) VALUES (?, ?, ?, ?)")
      .run(workspaceId, documentType, year, 2);
  }
  return next;
}

function formatNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Transitions a draft document to `issued`: allocates its gapless number,
 * stamps `issue_date`/`issued_at`, and re-freezes the legal-disclaimer text
 * (in case the company's Kleinunternehmer flag or the customer's tax
 * treatment changed since the draft was last saved). From this point the
 * document is immutable - `updateDraftDocument`/`deleteDraftDocument`
 * refuse anything not in `draft` status (see services/documents.ts).
 */
export function issueDocument(sdk: ModuleSdk, workspaceId: string, documentId: string): DocumentDto {
  const tx = sdk.sqlite.transaction(() => {
    const row = sdk.sqlite
      .prepare("SELECT * FROM faktura_documents WHERE id = ? AND workspace_id = ?")
      .get(documentId, workspaceId) as FakturaDocumentRow | undefined;
    if (!row) throw new Error("Document not found");
    if (row.status !== "draft") throw new Error("Only draft documents can be issued");

    const lineCount = (
      sdk.sqlite.prepare("SELECT COUNT(*) as count FROM faktura_document_lines WHERE document_id = ?").get(documentId) as { count: number }
    ).count;
    if (lineCount === 0) throw new Error("Cannot issue a document with no lines");

    const now = sdk.nowIso();
    const issueDate = now.slice(0, 10);
    const year = Number(issueDate.slice(0, 4));
    const prefixes = getNumberPrefixes(sdk, workspaceId);
    const sequence = allocateNumber(sdk, workspaceId, row.type, year);
    const number = formatNumber(prefixes[PREFIX_KEY[row.type]], year, sequence);

    const { isKleinunternehmer } = getCompanyTaxFlags(sdk, workspaceId);
    const disclaimerText = resolveDisclaimerText(isKleinunternehmer, row.tax_treatment);

    let dueDate = row.due_date;
    if (!dueDate && row.type === "invoice") {
      const settings = getCompanySettings(sdk, workspaceId);
      const due = new Date(issueDate);
      due.setDate(due.getDate() + settings.defaultPaymentTermsDays);
      dueDate = due.toISOString().slice(0, 10);
    }

    sdk.sqlite
      .prepare(
        `UPDATE faktura_documents SET status = 'issued', number = ?, issue_date = ?, due_date = ?, legal_disclaimer_text = ?, issued_at = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      )
      .run(number, issueDate, dueDate, disclaimerText, now, now, documentId, workspaceId);
  });
  tx();

  return getDocument(sdk, workspaceId, documentId)!;
}

/** Voids an issued document without deleting it (GoBD: issued documents are never removed). Drafts should be deleted instead, not cancelled. */
export function cancelDocument(sdk: ModuleSdk, workspaceId: string, documentId: string): DocumentDto {
  const row = sdk.sqlite
    .prepare("SELECT status FROM faktura_documents WHERE id = ? AND workspace_id = ?")
    .get(documentId, workspaceId) as Pick<FakturaDocumentRow, "status"> | undefined;
  if (!row) throw new Error("Document not found");
  if (row.status !== "issued") throw new Error("Only issued documents can be cancelled");

  sdk.sqlite
    .prepare("UPDATE faktura_documents SET status = 'cancelled', updated_at = ? WHERE id = ? AND workspace_id = ?")
    .run(sdk.nowIso(), documentId, workspaceId);
  return getDocument(sdk, workspaceId, documentId)!;
}
