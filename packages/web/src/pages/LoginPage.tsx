import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, twoFactorApi } from "../lib/api/resources.js";
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

  const [pending2fa, setPending2fa] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState("");

  if (user) return <Navigate to="/" replace />;

  async function completeLogin() {
    // A real login always supersedes a leftover anonymous share session in
    // this tab (see lib/api/shareMode.ts) - otherwise a stale share token
    // header would keep tagging along on this account's own requests.
    setShareMode(null);
    await refetch();
    navigate("/");
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
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-surface-raised p-6">
          <TextField type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
