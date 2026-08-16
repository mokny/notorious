import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { startRegistration } from "@simplewebauthn/browser";
import { authApi, twoFactorApi, webauthnApi, systemApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { ApiError } from "../../lib/api/client.js";
import { Button } from "../ui/Button.js";
import { TextField } from "../ui/TextField.js";
import { Modal } from "../ui/Modal.js";
import { Icon } from "../ui/Icon.js";
import { TwoFactorSetupFlow } from "../TwoFactorSetupFlow.js";
import { describeUserAgent, relativeTime } from "../../lib/deviceLabel.js";

/** The device list backing "log out other devices" (see plugins/session.ts's `listSessions` server-side) - sessions now stay valid indefinitely for an actively-used device (rolling renewal), so this is the only way to end one deliberately short of a password change. */
function SessionsList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: sessions } = useQuery({ queryKey: ["sessions"], queryFn: authApi.sessions });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
  const revokeOthersMutation = useMutation({
    mutationFn: () => authApi.revokeOtherSessions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const otherCount = sessions?.filter((s) => !s.isCurrent).length ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">{t("settings.security.devices")}</p>
        {otherCount > 0 && (
          <Button variant="secondary" onClick={() => revokeOthersMutation.mutate()} disabled={revokeOthersMutation.isPending}>
            {t("settings.security.logOutOtherDevices")}
          </Button>
        )}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {sessions?.map((session) => (
          <div key={session.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate">
                {describeUserAgent(session.userAgent, t)}
                {session.isCurrent && <span className="ml-2 text-xs text-accent">{t("settings.security.thisDevice")}</span>}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {session.ip ?? t("settings.security.unknownIp")} · {t("settings.security.active", { time: relativeTime(session.lastSeenAt, t) })}
              </p>
            </div>
            {!session.isCurrent && (
              <button
                onClick={() => revokeMutation.mutate(session.id)}
                disabled={revokeMutation.isPending}
                className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                title={t("settings.security.logOutThisDevice")}
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Passkey management (add/rename/remove) - see modules/webauthn/. Signing in with one of these skips the password + TOTP steps entirely (see LoginPage.tsx's conditional-UI autofill), and any registered passkey can also satisfy a "vault" object's reverify prompt (see ReverifyGate.tsx). */
function PasskeysList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: credentials } = useQuery({ queryKey: ["webauthnCredentials"], queryFn: webauthnApi.credentials });
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const optionsJSON = await webauthnApi.registerOptions();
      const response = await startRegistration({ optionsJSON });
      await webauthnApi.registerVerify(response);
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["webauthnCredentials"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : t("settings.security.addPasskeyFailed")),
  });

  const renameMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) => webauthnApi.rename(input.id, { name: input.name }),
    onSuccess: () => {
      setRenamingId(null);
      void queryClient.invalidateQueries({ queryKey: ["webauthnCredentials"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => webauthnApi.remove(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["webauthnCredentials"] }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">{t("settings.security.passkeys")}</p>
        <Button variant="secondary" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
          {t("settings.security.addPasskey")}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">{t("settings.security.passkeysDescription")}</p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {credentials && credentials.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {credentials.map((cred) => (
            <div key={cred.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              {renamingId === cred.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    renameMutation.mutate({ id: cred.id, name: renameValue });
                  }}
                >
                  <TextField value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus className="max-w-xs" />
                  <Button type="submit" variant="secondary" disabled={renameMutation.isPending}>
                    {t("settings.security.save")}
                  </Button>
                </form>
              ) : (
                <div className="min-w-0">
                  <button
                    className="truncate text-left hover:underline"
                    onClick={() => {
                      setRenamingId(cred.id);
                      setRenameValue(cred.name);
                    }}
                  >
                    {cred.name}
                  </button>
                  <p className="truncate text-xs text-ink-muted">
                    {cred.lastUsedAt ? t("settings.security.lastUsed", { time: relativeTime(cred.lastUsedAt, t) }) : t("settings.security.neverUsed")}
                  </p>
                </div>
              )}
              <button
                onClick={() => removeMutation.mutate(cred.id)}
                disabled={removeMutation.isPending}
                className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                title={t("settings.security.removePasskey")}
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lets the current user change their own password or enable/disable 2FA. */
export function SecuritySettings() {
  const { t } = useTranslation();
  const { user, refetch } = useAuth();
  const { data: passkeysStatus } = useQuery({ queryKey: ["passkeysStatus"], queryFn: systemApi.passkeysStatus });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);

  const passwordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword: user?.hasPassword ? currentPassword : undefined, newPassword }),
    onSuccess: async () => {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError(null);
      setPasswordSuccess(true);
      await refetch();
    },
    onError: (err) => {
      setPasswordSuccess(false);
      setPasswordError(err instanceof ApiError ? err.message : t("settings.security.passwordUpdateFailed"));
    },
  });

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordSuccess(false);
    passwordMutation.mutate();
  }

  const disableMutation = useMutation({
    mutationFn: () => twoFactorApi.disable({ currentPassword: user?.hasPassword ? disablePassword : undefined }),
    onSuccess: async () => {
      setDisablePassword("");
      setDisableError(null);
      await refetch();
    },
    onError: (err) => {
      setDisableError(err instanceof ApiError ? err.message : t("settings.security.disable2faFailed"));
    },
  });

  function handleDisableSubmit(event: FormEvent) {
    event.preventDefault();
    disableMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handlePasswordSubmit} className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">{t("settings.security.password")}</p>
        {!user?.hasPassword && <p className="text-sm text-ink-muted">{t("settings.security.passkeyOnlyNotice")}</p>}
        <div className="flex flex-wrap gap-2">
          {user?.hasPassword && (
            <TextField
              type="password"
              placeholder={t("settings.security.currentPassword")}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="max-w-xs"
              required
            />
          )}
          <TextField
            type="password"
            placeholder={t("settings.security.newPassword")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="max-w-xs"
            minLength={8}
            required
          />
          <Button type="submit" variant="secondary" disabled={passwordMutation.isPending}>
            {user?.hasPassword ? t("settings.security.updatePassword") : t("settings.security.setPassword")}
          </Button>
        </div>
        {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
        {passwordSuccess && (
          <p className="text-sm text-green-600">
            {user?.hasPassword ? t("settings.security.passwordUpdated") : t("settings.security.passwordSet")}
          </p>
        )}
      </form>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">{t("settings.security.twoFactor")}</p>
        {user?.totpEnabled ? (
          <form onSubmit={handleDisableSubmit} className="space-y-2">
            <p className="text-sm text-ink-muted">{t("settings.security.twoFactorEnabled")}</p>
            <div className="flex flex-wrap gap-2">
              {user?.hasPassword && (
                <TextField
                  type="password"
                  placeholder={t("settings.security.currentPassword")}
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="max-w-xs"
                  required
                />
              )}
              <Button type="submit" variant="danger" disabled={disableMutation.isPending}>
                {t("settings.security.disable2fa")}
              </Button>
            </div>
            {disableError && <p className="text-sm text-red-500">{disableError}</p>}
          </form>
        ) : (
          <div>
            <p className="text-sm text-ink-muted">{t("settings.security.twoFactorDescription")}</p>
            <Button variant="secondary" className="mt-2" onClick={() => setSetupOpen(true)}>
              {t("settings.security.enable2fa")}
            </Button>
          </div>
        )}
      </div>

      <Modal open={setupOpen} onOpenChange={setSetupOpen} title={t("settings.security.setup2faTitle")}>
        <TwoFactorSetupFlow
          onComplete={async () => {
            setSetupOpen(false);
            await refetch();
          }}
        />
      </Modal>

      {passkeysStatus?.enabled && <PasskeysList />}
      <SessionsList />
    </div>
  );
}
