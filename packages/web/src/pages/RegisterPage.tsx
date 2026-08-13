import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { authApi, systemApi, webauthnApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";

export function RegisterPage() {
  const { t } = useTranslation();
  const { user, refetch } = useAuth();
  const navigate = useNavigate();
  const [method, setMethod] = useState<"password" | "passkey">("password");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  // Self-registration is disabled by default (see docs/DEPLOYMENT.md) - the
  // form below still works regardless of this, since a workspace owner can
  // invite a specific email even while it's off. This is just an upfront
  // heads-up for anyone who landed here without an invite.
  const { data: registrationStatus } = useQuery({
    queryKey: ["registrationStatus"],
    queryFn: systemApi.registrationStatus,
    staleTime: 60_000,
  });
  // Same gate as LoginPage.tsx's passkey button - hidden entirely until the server has
  // APP_ORIGIN configured (see env.ts's `passkeysEnabled`).
  const { data: passkeysStatus } = useQuery({
    queryKey: ["passkeysStatus"],
    queryFn: systemApi.passkeysStatus,
    staleTime: 60_000,
  });

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.register({ name, email, password });
      await refetch();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("register.registrationFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasskeySubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const optionsJSON = await webauthnApi.registerAccountOptions({ email, name });
      const response = await startRegistration({ optionsJSON });
      await webauthnApi.registerAccountVerify(response);
      await refetch();
      navigate("/");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setSubmitting(false);
        return;
      }
      setError(err instanceof ApiError ? err.message : t("register.passkeyRegistrationFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">{t("register.title")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("register.subtitle")}</p>
        </div>
        {registrationStatus?.enabled === false && (
          <p className="rounded-lg border border-border bg-surface-raised p-3 text-sm text-ink-muted">
            {t("register.registrationDisabled")}
          </p>
        )}
        <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-6">
          {passkeysStatus?.enabled && (
            <div className="flex rounded-lg border border-border p-1 text-sm">
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 ${method === "password" ? "bg-surface font-medium" : "text-ink-muted"}`}
                onClick={() => {
                  setMethod("password");
                  setError(null);
                }}
              >
                {t("register.password")}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 ${method === "passkey" ? "bg-surface font-medium" : "text-ink-muted"}`}
                onClick={() => {
                  setMethod("passkey");
                  setError(null);
                }}
              >
                {t("register.passkey")}
              </button>
            </div>
          )}

          {method === "password" ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <TextField placeholder={t("register.fullNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
              <TextField type="email" placeholder={t("login.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
              <TextField
                type="password"
                placeholder={t("register.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("register.creatingAccount") : t("register.createAccount")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handlePasskeySubmit} className="space-y-3">
              <TextField placeholder={t("register.fullNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
              <TextField type="email" placeholder={t("login.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
                <Fingerprint className="size-4" />
                {isSubmitting ? t("login.waitingForPasskey") : t("register.createAccountWithPasskey")}
              </Button>
            </form>
          )}
        </div>
        <p className="text-center text-sm text-ink-muted">
          {t("register.alreadyHaveAccount")}{" "}
          <Link to="/login" className="text-accent hover:underline">
            {t("login.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
