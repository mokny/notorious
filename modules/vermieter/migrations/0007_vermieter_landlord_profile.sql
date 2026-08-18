-- Vermieter module - one landlord address/contact profile per workspace,
-- used as the sender address on generated Nebenkostenabrechnung PDFs
-- (mirrors faktura_company_settings' singleton-per-workspace shape).
CREATE TABLE vermieter_landlord_profile (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
