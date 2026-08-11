import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { startAuthentication, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { authApi, twoFactorApi, webauthnApi, systemApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";
import { setShareMode } from "../lib/api/shareMode.js";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";

export function LoginPage() {
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [passkeysEnabled, setPasskeysEnabled] = useState(false);
  const [isPasskeySubmitting, setPasskeySubmitting] = useState(false);

  const [pending2fa, setPending2fa] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");

  // Usernameless/conditional-UI passkey login (see modules/webauthn/service.ts's
  // `generateLoginOptions`) - the browser itself offers matching passkeys as an
  // autofill suggestion on the email field below (needs its `autoComplete="username
  // webauthn"`), with no separate button or prior email entry required. A no-op on a
  // browser/platform that doesn't support it (checked via `browserSupportsWebAuthnAutofill`);
  // the normal password form underneath still works either way. This effect's own
  // `startAuthentication` promise only resolves once the user actually picks a passkey (or
  // never, if they type a password instead) - nothing to cancel/cleanup on unmount here,
  // same as the rest of this page's fire-and-forget submit handlers.
  useEffect(() => {
    let cancelled = false;
    async function setupAutofill() {
      if (user) return;
      // Passkeys are off entirely until the server has APP_ORIGIN configured (see
      // env.ts's `passkeysEnabled`) - webauthnApi.loginOptions() would just 400 otherwise.
      const { enabled } = await systemApi.passkeysStatus();
      if (cancelled) return;
      setPasskeysEnabled(enabled);
      if (!enabled) return;
      if (!(await browserSupportsWebAuthnAutofill())) return;
      const optionsJSON = await webauthnApi.loginOptions();
      try {
        const response = await startAuthentication({ optionsJSON, useBrowserAutofill: true });
        if (cancelled) return;
        await webauthnApi.loginVerify(response);
        await completeLogin();
      } catch {
        // No passkey picked (cancelled, or the platform authenticator was dismissed) - the
        // user can still sign in with their password, nothing to surface as an error here.
      }
    }
    void setupAutofill();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user) return <Navigate to="/" replace />;

  async function completeLogin() {
    // A real login always supersedes a leftover anonymous share session in
    // this tab (see lib/api/shareMode.ts) - otherwise a stale share token
    // header would keep tagging along on this account's own requests.
    setShareMode(null);
    await refetch();
    navigate("/");
  }

  async function handlePasskeyLogin() {
    setError(null);
    setPasskeySubmitting(true);
    try {
      // Usernameless: no email filter, the browser prompts with every discoverable
      // passkey for this origin (see modules/webauthn/service.ts's `generateLoginOptions`).
      const optionsJSON = await webauthnApi.loginOptions();
      const response = await startAuthentication({ optionsJSON });
      await webauthnApi.loginVerify(response);
      await completeLogin();
    } catch (err) {
      // A user-dismissed/cancelled passkey prompt (NotAllowedError) isn't a real error -
      // they can still sign in with their password, nothing to surface here.
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setError(err instanceof ApiError ? err.message : "Passkey sign-in failed");
    } finally {
      setPasskeySubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.login({ email, password });
      if ("pending2fa" in result) {
        setPending2fa(true);
      } else {
        await completeLogin();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await twoFactorApi.verify(useBackupCode ? { backupCode: code } : { code });
      await completeLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  if (pending2fa) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Two-factor authentication</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {useBackupCode ? "Enter one of your backup codes" : "Enter the 6-digit code from your authenticator app"}
            </p>
          </div>
          <form onSubmit={handleVerify} className="space-y-3 rounded-xl border border-border bg-surface-raised p-6">
            <TextField
              placeholder={useBackupCode ? "Backup code" : "6-digit code"}
              value={code}
              onChange={(e) => setCode(useBackupCode ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode={useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              required
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Verifying…" : "Verify"}
            </Button>
          </form>
          <p className="text-center text-sm text-ink-muted">
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setCode("");
                setError(null);
              }}
            >
              {useBackupCode ? "Use authenticator code instead" : "Use a backup code instead"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Notorious</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in to your workspace</p>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-6">
          {passkeysEnabled && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isPasskeySubmitting}
                onClick={handlePasskeyLogin}
              >
                <Fingerprint className="size-4" />
                {isPasskeySubmitting ? "Waiting for passkey…" : "Sign in with a passkey"}
              </Button>
              <div className="flex items-center gap-3 text-xs text-ink-muted">
                <div className="h-px flex-1 bg-border" />
                or
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <TextField
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username webauthn"
              required
            />
            <TextField
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
        <p className="text-center text-sm text-ink-muted">
          No account?{" "}
          <Link to="/register" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
