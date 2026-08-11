-- WebAuthn/passkey support (see modules/webauthn/) - one row per registered
-- authenticator. `public_key`/`counter` are exactly what
-- @simplewebauthn/server's verifyAuthenticationResponse needs.
CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

-- Short-lived WebAuthn ceremony challenges - see db/schema.ts's doc comment
-- on webauthnChallenges for why user_id is nullable and what `purpose` is for.
CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- "Sudo mode" - set by a successful POST /api/v1/auth/reverify, checked by
-- workspaces/access.ts's requireAccess for any requires_reverify object.
ALTER TABLE sessions ADD COLUMN sudo_verified_at TEXT;

-- Per-object "vault" protection toggle - see objects/service.ts's
-- setObjectRequiresReverify and workspaces/access.ts's requireAccess.
ALTER TABLE objects ADD COLUMN requires_reverify INTEGER NOT NULL DEFAULT 0;
