-- TOTP-based two-factor authentication (see modules/twoFactor/) - `totp_secret`
-- is AES-256-GCM encrypted at rest (see lib/crypto.ts), never stored in
-- plaintext. `totp_enabled` only flips to true once the user has confirmed
-- setup with a real code from their authenticator app - a freshly generated,
-- unconfirmed secret sitting in this column doesn't grant anything.
-- `totp_backup_codes` is a JSON array of Argon2 hashes (one-time use - the
-- matching entry is removed the moment a code is redeemed).
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_backup_codes TEXT;

-- "Password already verified, TOTP code still outstanding" - deliberately
-- its own table, not a `sessions` row, so it's structurally invisible to
-- plugins/session.ts's normal session lookup (see modules/twoFactor/service.ts).
-- Short-lived (a few minutes) and single-use, checked only by
-- POST /api/v1/auth/2fa/verify.
CREATE TABLE pending_totp_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Instance-wide 2FA mandate (see scripts/setRequire2fa.ts) - off by default,
-- same convention as registration_enabled on this same table.
ALTER TABLE instance_settings ADD COLUMN require_2fa_enabled INTEGER NOT NULL DEFAULT 0;
