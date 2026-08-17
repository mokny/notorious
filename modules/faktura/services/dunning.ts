import type { ModuleSdk } from "../manifest.js";
import { roundToCents } from "@notorious/shared";
import type { FakturaDunningLetterRow, FakturaDocumentRow } from "../db/types.js";
import { requireDocument } from "./documents.js";
import { getInvoicePaymentSummary } from "./payments.js";
import { getDunningSettings } from "./companySettings.js";

export interface DunningLetterDto {
  id: string;
  invoiceId: string;
  level: 1 | 2 | 3;
  status: "draft" | "sent";
  number: string | null;
  openAmountCents: number;
  feeCents: number;
  interestCents: number;
  totalDueCents: number;
  daysOverdue: number;
  issueDate: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface OverdueInvoiceDto {
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string;
  dueDate: string;
  daysOverdue: number;
  openAmountCents: number;
  /** Highest dunning level already sent for this invoice, 0 if none. */
  lastSentLevel: 0 | 1 | 2 | 3;
  /** Next level the UI should offer to create, or null if level 3 was already sent (nothing further to suggest in Phase 2). */
  suggestedLevel: 1 | 2 | 3 | null;
}

function rowToDto(row: FakturaDunningLetterRow): DunningLetterDto {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    level: row.level,
    status: row.status,
    number: row.number,
    openAmountCents: row.open_amount_cents,
    feeCents: row.fee_cents,
    interestCents: row.interest_cents,
    totalDueCents: row.total_due_cents,
    daysOverdue: row.days_overdue,
    issueDate: row.issue_date,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10)).getTime();
  const to = new Date(toIso.slice(0, 10)).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function levelForDaysOverdue(daysOverdue: number, levelDays: [number, number, number]): 0 | 1 | 2 | 3 {
  if (daysOverdue >= levelDays[2]) return 3;
  if (daysOverdue >= levelDays[1]) return 2;
  if (daysOverdue >= levelDays[0]) return 1;
  return 0;
}

function lastSentLevel(sdk: ModuleSdk, workspaceId: string, invoiceId: string): 0 | 1 | 2 | 3 {
  const row = sdk.sqlite
    .prepare("SELECT MAX(level) as level FROM faktura_dunning_letters WHERE workspace_id = ? AND invoice_id = ? AND status = 'sent'")
    .get(workspaceId, invoiceId) as { level: number | null };
  return (row.level ?? 0) as 0 | 1 | 2 | 3;
}

/** All issued, overdue, not-fully-paid invoices with their suggested next dunning level - never suggests a level at or below one already sent (see the phase plan's tax/dunning modeling notes). */
export function listOverdueInvoices(sdk: ModuleSdk, workspaceId: string): OverdueInvoiceDto[] {
  const today = sdk.nowIso();
  const invoices = sdk.sqlite
    .prepare("SELECT * FROM faktura_documents WHERE workspace_id = ? AND type = 'invoice' AND status = 'issued' AND due_date IS NOT NULL AND due_date < ?")
    .all(workspaceId, today.slice(0, 10)) as FakturaDocumentRow[];

  const { levelDays } = getDunningSettings(sdk, workspaceId);
  const result: OverdueInvoiceDto[] = [];

  for (const invoice of invoices) {
    const { openAmountCents } = getInvoicePaymentSummary(sdk, workspaceId, invoice.id);
    if (openAmountCents <= 0) continue;

    const daysOverdue = daysBetween(invoice.due_date!, today);
    const sentLevel = lastSentLevel(sdk, workspaceId, invoice.id);
    const thresholdLevel = levelForDaysOverdue(daysOverdue, levelDays);
    const nextLevel = Math.min(3, Math.max(thresholdLevel, sentLevel + 1));

    result.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      customerId: invoice.customer_id,
      dueDate: invoice.due_date!,
      daysOverdue,
      openAmountCents,
      lastSentLevel: sentLevel,
      suggestedLevel: sentLevel >= 3 ? null : (nextLevel as 1 | 2 | 3),
    });
  }

  return result.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function listDunningLetters(sdk: ModuleSdk, workspaceId: string): DunningLetterDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_dunning_letters WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(workspaceId) as FakturaDunningLetterRow[];
  return rows.map(rowToDto);
}

export function listDunningLettersForInvoice(sdk: ModuleSdk, workspaceId: string, invoiceId: string): DunningLetterDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_dunning_letters WHERE workspace_id = ? AND invoice_id = ? ORDER BY created_at DESC")
    .all(workspaceId, invoiceId) as FakturaDunningLetterRow[];
  return rows.map(rowToDto);
}

export function getDunningLetter(sdk: ModuleSdk, workspaceId: string, id: string): DunningLetterDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM faktura_dunning_letters WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | FakturaDunningLetterRow
    | undefined;
  return row ? rowToDto(row) : null;
}

/** Used by pdf/renderDunningLetter.ts and routes/dunning.ts's send route, which both need the raw row (invoice_id, etc.) rather than the DTO. */
export function requireDunningLetterRow(sdk: ModuleSdk, workspaceId: string, id: string): FakturaDunningLetterRow {
  const row = sdk.sqlite.prepare("SELECT * FROM faktura_dunning_letters WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | FakturaDunningLetterRow
    | undefined;
  if (!row) throw new Error("Dunning letter not found");
  return row;
}

/**
 * Creates a draft dunning letter for an overdue invoice at the given level,
 * with fee/interest computed from the current company settings and the
 * invoice's current open amount - a snapshot, so later payments or setting
 * changes don't retroactively change an already-created draft (same
 * reasoning as faktura_documents' issue-time snapshots). Interest uses the
 * same single-rounding-per-figure convention as tax computation
 * (`roundToCents`, see services/documents.ts's comment on why).
 */
export function createDunningDraft(sdk: ModuleSdk, workspaceId: string, actorId: string, invoiceId: string, level: 1 | 2 | 3): DunningLetterDto {
  const invoice = requireDocument(sdk, workspaceId, invoiceId);
  if (invoice.type !== "invoice" || invoice.status !== "issued") throw new Error("Dunning letters can only be created for issued invoices");
  if (!invoice.due_date) throw new Error("Invoice has no due date");

  const { openAmountCents } = getInvoicePaymentSummary(sdk, workspaceId, invoiceId);
  if (openAmountCents <= 0) throw new Error("Invoice is already fully paid");

  const today = sdk.nowIso();
  const daysOverdue = daysBetween(invoice.due_date, today);
  if (daysOverdue <= 0) throw new Error("Invoice is not overdue yet");

  const sentLevel = lastSentLevel(sdk, workspaceId, invoiceId);
  if (level <= sentLevel) throw new Error(`Level ${level} was already sent for this invoice - choose level ${sentLevel + 1} or higher`);

  const { levelFeeCents, interestRatePercent } = getDunningSettings(sdk, workspaceId);
  const [fee1, fee2, fee3] = levelFeeCents;
  const feeCents = level === 1 ? fee1 : level === 2 ? fee2 : fee3;
  const interestCents = roundToCents((openAmountCents * interestRatePercent * daysOverdue) / (100 * 365));
  const totalDueCents = openAmountCents + feeCents + interestCents;

  const id = sdk.newId();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_dunning_letters (id, workspace_id, invoice_id, level, status, open_amount_cents, fee_cents, interest_cents, total_due_cents, days_overdue, created_by, created_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, workspaceId, invoiceId, level, openAmountCents, feeCents, interestCents, totalDueCents, daysOverdue, actorId, today);
  return getDunningLetter(sdk, workspaceId, id)!;
}

export function deleteDunningDraft(sdk: ModuleSdk, workspaceId: string, id: string): boolean {
  const row = sdk.sqlite.prepare("SELECT status FROM faktura_dunning_letters WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
    | Pick<FakturaDunningLetterRow, "status">
    | undefined;
  if (!row) return false;
  if (row.status !== "draft") throw new Error("Only draft dunning letters can be deleted");
  sdk.sqlite.prepare("DELETE FROM faktura_dunning_letters WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  return true;
}

/** Allocates the gapless dunning number and flips a draft to `sent`, transactionally - same technique as services/numbering.ts::allocateNumber, reusing faktura_number_sequences with document_type='dunning'. Does not render the PDF or send the email itself (see routes/dunning.ts), mirroring how services/numbering.ts::issueDocument is a pure status transition too. */
export function markDunningLetterSent(sdk: ModuleSdk, workspaceId: string, id: string): DunningLetterDto {
  const tx = sdk.sqlite.transaction(() => {
    const row = sdk.sqlite.prepare("SELECT * FROM faktura_dunning_letters WHERE id = ? AND workspace_id = ?").get(id, workspaceId) as
      | FakturaDunningLetterRow
      | undefined;
    if (!row) throw new Error("Dunning letter not found");
    if (row.status !== "draft") throw new Error("Only draft dunning letters can be sent");

    const now = sdk.nowIso();
    const issueDate = now.slice(0, 10);
    const year = Number(issueDate.slice(0, 4));
    const { numberPrefix } = getDunningSettings(sdk, workspaceId);

    const seqRow = sdk.sqlite
      .prepare("SELECT next_number FROM faktura_number_sequences WHERE workspace_id = ? AND document_type = 'dunning' AND year = ?")
      .get(workspaceId, year) as { next_number: number } | undefined;
    const sequence = seqRow ? seqRow.next_number : 1;
    if (seqRow) {
      sdk.sqlite
        .prepare("UPDATE faktura_number_sequences SET next_number = ? WHERE workspace_id = ? AND document_type = 'dunning' AND year = ?")
        .run(sequence + 1, workspaceId, year);
    } else {
      sdk.sqlite
        .prepare("INSERT INTO faktura_number_sequences (workspace_id, document_type, year, next_number) VALUES (?, 'dunning', ?, ?)")
        .run(workspaceId, year, 2);
    }
    const number = `${numberPrefix}-${year}-${String(sequence).padStart(4, "0")}`;

    sdk.sqlite
      .prepare("UPDATE faktura_dunning_letters SET status = 'sent', number = ?, issue_date = ?, sent_at = ? WHERE id = ? AND workspace_id = ?")
      .run(number, issueDate, now, id, workspaceId);
  });
  tx();

  return getDunningLetter(sdk, workspaceId, id)!;
}
