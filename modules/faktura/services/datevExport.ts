import type { ModuleSdk } from "../manifest.js";
import type { FakturaAccountRow, FakturaBookingRow } from "../db/types.js";

function csvField(value: string | number): string {
  if (typeof value === "number") return String(value);
  return `"${value.replace(/"/g, '""')}"`;
}

function formatAmountDatev(cents: number): string {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${euros},${rest}`;
}

function formatDateDatev(iso: string): string {
  // DATEV "Belegdatum" in the classic Buchungsstapel format is day+month
  // (TTMM) - the fiscal year comes from the header row's Wirtschaftsjahr.
  const [, month, day] = iso.slice(0, 10).split("-");
  return `${day}${month}`;
}

/**
 * Builds a DATEV EXTF "Buchungsstapel" CSV for all confirmed/reversed
 * bookings in [from, to]. **Caveat** (see the phase plan): built from
 * best-known documentation of the DATEV EXTF format without live access to
 * the current official spec - the metadata header's column count/order is
 * believed correct for format version 510/"Buchungsstapel" 7, and the data
 * rows use a reduced, widely-accepted column subset (many small accounting
 * tools export exactly this subset rather than the full ~125-column modern
 * spec). **A real test import with the Steuerberater/a DATEV installation
 * must happen before production use.**
 */
export function exportBuchungsstapel(sdk: ModuleSdk, workspaceId: string, from: string, to: string): string {
  const bookings = sdk.sqlite
    .prepare(
      "SELECT * FROM faktura_bookings WHERE workspace_id = ? AND status IN ('confirmed', 'reversed') AND booking_date >= ? AND booking_date <= ? ORDER BY booking_date ASC, created_at ASC",
    )
    .all(workspaceId, from, to) as FakturaBookingRow[];

  const accountRows = sdk.sqlite.prepare("SELECT * FROM faktura_accounts WHERE workspace_id = ?").all(workspaceId) as FakturaAccountRow[];
  const accountCodeById = new Map(accountRows.map((a) => [a.id, a.code]));

  const now = sdk.nowIso();
  const createdTimestamp = now.replace(/[-:T]/g, "").slice(0, 14) + "000";
  const fiscalYearStart = `${from.slice(0, 4)}0101`;
  const fromDatev = from.replace(/-/g, "");
  const toDatev = to.replace(/-/g, "");

  const metadataHeader = [
    csvField("EXTF"),
    510,
    21,
    csvField("Buchungsstapel"),
    7,
    createdTimestamp,
    "",
    csvField(""),
    csvField(""),
    // Berater-/Mandantennummer: placeholder zeros - no such concept exists
    // in this app yet, must be filled in with the real DATEV-Berater-/
    // Mandantennummer before a production import.
    1,
    1,
    fiscalYearStart,
    4,
    fromDatev,
    toDatev,
    csvField(""),
    csvField(""),
    1,
    0,
    0,
    csvField("EUR"),
  ].join(";");

  const columnHeader = [
    "Umsatz (ohne Soll/Haben-Kz)",
    "Soll/Haben-Kennzeichen",
    "WKZ Umsatz",
    "Konto",
    "Gegenkonto (ohne BU-Schlüssel)",
    "BU-Schlüssel",
    "Belegdatum",
    "Belegfeld 1",
    "Buchungstext",
  ]
    .map(csvField)
    .join(";");

  const dataRows = bookings.map((booking) => {
    const debitCode = accountCodeById.get(booking.debit_account_id) ?? booking.debit_account_id;
    const creditCode = accountCodeById.get(booking.credit_account_id) ?? booking.credit_account_id;
    return [
      formatAmountDatev(booking.amount_cents),
      csvField("S"),
      csvField("EUR"),
      debitCode,
      creditCode,
      "",
      formatDateDatev(booking.booking_date),
      csvField(booking.source_entity_id.slice(0, 36)),
      csvField(booking.description.slice(0, 60)),
    ].join(";");
  });

  return [metadataHeader, columnHeader, ...dataRows].join("\r\n");
}
