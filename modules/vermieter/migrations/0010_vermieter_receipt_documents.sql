-- Vermieter module - multiple attached documents (photos and/or PDFs) per
-- receipt, replacing the old single storage_path/ocr_raw_text columns on
-- vermieter_receipts for anything written going forward. Those two columns
-- are left in place on vermieter_receipts (nullable, no longer written by
-- services/receipts.ts) rather than dropped - SQLite DROP COLUMN needs a
-- full table rebuild and there's no real benefit to it here, only risk;
-- see services/receipts.ts's updated doc comment for the exact cutover.
--
-- No FK constraints against vermieter_receipts - same module convention as
-- every other table here (see migrations/0001's doc comment).
CREATE TABLE vermieter_receipt_documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  ocr_status TEXT NOT NULL DEFAULT 'none' CHECK (ocr_status IN ('none', 'pending', 'done', 'failed')),
  ocr_raw_text TEXT,
  page_count INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_vermieter_receipt_documents_receipt_id ON vermieter_receipt_documents(receipt_id);
CREATE INDEX idx_vermieter_receipt_documents_workspace_id ON vermieter_receipt_documents(workspace_id);

-- Backfill: any existing receipt that already has a single storage_path
-- (from the old single-photo flow) gets exactly one row here so no data is
-- lost. mime_type is a best-effort guess since the old column never
-- recorded one - every pre-migration upload went through the image-only OCR
-- photo endpoint, so 'image/jpeg' is a reasonable default (harmless even if
-- occasionally wrong - it's only used to pick a Content-Type header and a
-- PDF-vs-image branch in the export PDF, and there's no real vermieter data
-- yet in the dev DB per this pass's brief).
INSERT INTO vermieter_receipt_documents (id, workspace_id, receipt_id, storage_path, mime_type, original_filename, ocr_status, ocr_raw_text, page_count, created_at)
SELECT
  lower(hex(randomblob(16))),
  workspace_id,
  id,
  storage_path,
  'image/jpeg',
  'beleg.jpg',
  CASE WHEN ocr_raw_text IS NOT NULL THEN 'done' ELSE 'none' END,
  ocr_raw_text,
  NULL,
  created_at
FROM vermieter_receipts
WHERE storage_path IS NOT NULL;
