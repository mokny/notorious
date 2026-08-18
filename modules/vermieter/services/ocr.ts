import { createWorker } from "tesseract.js";

export interface OcrGuess {
  rawText: string;
  guessedAmountCents: number | null;
  guessedDate: string | null;
  guessedVendor: string | null;
}

/**
 * Local OCR (German language pack) over an uploaded receipt-photo buffer,
 * plus a deliberately simple best-effort structured guess - this is a
 * "user reviews and corrects before saving" flow (see routes/receipts.ts's
 * `/receipts/ocr` endpoint), not a receipt-parsing product, so the
 * heuristics below stay simple rather than trying to handle every receipt
 * layout.
 */
export async function runReceiptOcr(imageBuffer: Buffer): Promise<OcrGuess> {
  const worker = await createWorker("deu");
  try {
    const { data } = await worker.recognize(imageBuffer);
    const rawText = data.text ?? "";
    return {
      rawText,
      guessedAmountCents: guessAmountCents(rawText),
      guessedDate: guessDate(rawText),
      guessedVendor: guessVendor(rawText),
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Looks for a Euro-amount pattern near "Gesamt"/"Summe"/"Betrag"/"Total" on
 * the same line, preferring that over just the largest number on the
 * receipt (which is often a wrong match, e.g. a phone number or item
 * count). Falls back to the largest plausible amount anywhere in the text.
 */
function guessAmountCents(text: string): number | null {
  const amountPattern = /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:€|EUR)?/g;
  const keywordLine = text
    .split(/\r?\n/)
    .find((line) => /gesamt|summe|betrag|total|zu\s*zahlen/i.test(line));

  const parseAmount = (raw: string): number | null => {
    // German amounts use "," as the decimal separator; "." (if present) is
    // a thousands separator.
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  };

  if (keywordLine) {
    const match = [...keywordLine.matchAll(amountPattern)].pop();
    if (match && match[1]) {
      const parsed = parseAmount(match[1]);
      if (parsed != null) return parsed;
    }
  }

  const allMatches = [...text.matchAll(amountPattern)]
    .map((m) => m[1])
    .filter((raw): raw is string => raw != null)
    .map((raw) => parseAmount(raw))
    .filter((v): v is number => v != null);
  if (allMatches.length === 0) return null;
  return Math.max(...allMatches);
}

/** DD.MM.YYYY-ish patterns (also accepts 2-digit years and "-"/"/" separators), returned as an ISO YYYY-MM-DD string. */
function guessDate(text: string): string | null {
  const match = text.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw] = match;
  let year = Number(yearRaw);
  if (year < 100) year += year < 50 ? 2000 : 1900;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** First non-empty line heuristic - receipts conventionally print the vendor/shop name at the very top. */
function guessVendor(text: string): string | null {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 1);
  return line ?? null;
}
