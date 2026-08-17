-- Faktura module - "Testmodus": when on, every rendered PDF (documents,
-- dunning letters, POS receipts) gets a prominent "TESTMODUS - KEIN ECHTER
-- BELEG" banner, so users can try out the module without producing
-- documents that look like real, legally-issued paperwork. See
-- pdf/testBanner.ts.
ALTER TABLE faktura_company_settings ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 0;
