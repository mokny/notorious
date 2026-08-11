import { useState, type FormEvent } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { authApi, webauthnApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";
import { Icon } from "./ui/Icon.js";

/**
 * Blocks a `requiresReverify` ("vault") object's content behind a password/
 * passkey re-authentication prompt - rendered by ObjectDetailPage.tsx in
 * place of the object entirely when its `GET /api/v1/objects/:id` comes back
 * 428 (see workspaces/access.ts's `assertReverifyAccess`). Deliberately shows
 * no object detail (title, icon, ...) of its own - the 428 response carries
 * none, by design (see `redactForReverify`'s doc comment for the listing/
 * search equivalent of the same "title only" rule; the direct object page
 * withholds even that).
 */
export function ReverifyGate({ onVerified }: { onVerified: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.reverify({ password });
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasskey() {
    setError(null);
    setSubmitting(true);
    try {
      const optionsJSON = await webauthnApi.reverifyOptions();
      const response = await startAuthentication({ optionsJSON });
      await webauthnApi.reverifyVerify(response);
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Passkey verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface-raised p-6 text-center">
        <Icon name="lock" className="mx-auto h-8 w-8 text-ink-muted" />
        <div>
          <h2 className="text-lg font-semibold">This object is protected</h2>
          <p className="mt-1 text-sm text-ink-muted">Re-authenticate to view or edit its contents.</p>
        </div>
        <form onSubmit={handlePasswordSubmit} className="space-y-2 text-left">
          <TextField
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Verifying…" : "Unlock"}
          </Button>
        </form>
        <Button variant="secondary" className="w-full" onClick={handlePasskey} disabled={isSubmitting}>
          Use a passkey instead
        </Button>
      </div>
    </div>
  );
}
