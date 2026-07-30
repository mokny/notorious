CREATE TABLE instance_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  registration_enabled INTEGER NOT NULL DEFAULT 0
);

-- Self-registration is disabled by default - see scripts/setRegistration.ts
-- to enable it, or docs/DEPLOYMENT.md#creating-user-accounts.
INSERT INTO instance_settings (id, registration_enabled) VALUES (1, 0);
