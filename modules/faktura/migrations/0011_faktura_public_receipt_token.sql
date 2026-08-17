-- Faktura module - Phase 3 add-on: a per-document opaque token that lets a
-- POS customer download their own receipt PDF from their own phone (via a
-- QR code shown on the terminal) without any session/login - see
-- routes/documentPdf.ts's public route and services/documents.ts::ensurePublicShareToken.
ALTER TABLE faktura_documents ADD COLUMN public_share_token TEXT;

CREATE UNIQUE INDEX idx_faktura_documents_public_share_token ON faktura_documents(public_share_token) WHERE public_share_token IS NOT NULL;
