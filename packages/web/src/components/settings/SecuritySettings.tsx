import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import { authApi, twoFactorApi, webauthnApi, systemApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { ApiError } from "../../lib/api/client.js";
import { Button } from "../ui/Button.js";
import { TextField } from "../ui/TextField.js";
import { Modal } from "../ui/Modal.js";
import { Icon } from "../ui/Icon.js";
import { TwoFactorSetupFlow } from "../TwoFactorSetupFlow.js";

/** Very rough user-agent -> "Browser on OS" label - good enough for a device list, no need for a full UA-parsing dependency. */
function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /CriOS\//.test(userAgent)
          ? "Chrome"
          : /Firefox\//.test(userAgent)
            ? "Firefox"
            : /Safari\//.test(userAgent)
              ? "Safari"
              : "Unknown browser";
  return `${browser} on ${os}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** The device list backing "log out other devices" (see plugins/session.ts's `listSessions` server-side) - sessions now stay valid indefinitely for an actively-used device (rolling renewal), so this is the only way to end one deliberately short of a password change. */
function SessionsList() {
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
        <p className="text-xs font-medium text-ink-muted">Devices</p>
        {otherCount > 0 && (
          <Button variant="secondary" onClick={() => revokeOthersMutation.mutate()} disabled={revokeOthersMutation.isPending}>
            Log out all other devices
          </Button>
        )}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {sessions?.map((session) => (
          <div key={session.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate">
                {describeUserAgent(session.userAgent)}
                {session.isCurrent && <span className="ml-2 text-xs text-accent">This device</span>}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {session.ip ?? "Unknown IP"} · Active {relativeTime(session.lastSeenAt)}
              </p>
            </div>
            {!session.isCurrent && (
              <button
                onClick={() => revokeMutation.mutate(session.id)}
                disabled={revokeMutation.isPending}
                className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                title="Log out this device"
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
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not add passkey"),
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
        <p className="text-xs font-medium text-ink-muted">Passkeys</p>
        <Button variant="secondary" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
          Add a passkey
        </Button>
      </div>
      <p className="text-sm text-ink-muted">
        Sign in without a password using Face ID, Touch ID, a security key, or your device's screen lock.
      </p>
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
                    Save
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
                  <p className="truncate text-xs text-ink-muted">{cred.lastUsedAt ? `Last used ${relativeTime(cred.lastUsedAt)}` : "Never used"}</p>
                </div>
              )}
              <button
                onClick={() => removeMutation.mutate(cred.id)}
                disabled={removeMutation.isPending}
                className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                title="Remove passkey"
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
      setPasswordError(err instanceof ApiError ? err.message : "Could not update your password");
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
      setDisableError(err instanceof ApiError ? err.message : "Could not disable two-factor authentication");
    },
  });

  function handleDisableSubmit(event: FormEvent) {
    event.preventDefault();
    disableMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handlePasswordSubmit} className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Password</p>
        {!user?.hasPassword && (
          <p className="text-sm text-ink-muted">This account was created with a passkey and has no password yet - set one below as a backup sign-in option.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {user?.hasPassword && (
            <TextField
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="max-w-xs"
              required
            />
          )}
          <TextField
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="max-w-xs"
            minLength={8}
            required
          />
          <Button type="submit" variant="secondary" disabled={passwordMutation.isPending}>
            {user?.hasPassword ? "Update password" : "Set password"}
          </Button>
        </div>
        {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
        {passwordSuccess && (
          <p className="text-sm text-green-600">
            {user?.hasPassword ? "Password updated. Your other sessions have been signed out." : "Password set."}
          </p>
        )}
      </form>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Two-factor authentication</p>
        {user?.totpEnabled ? (
          <form onSubmit={handleDisableSubmit} className="space-y-2">
            <p className="text-sm text-ink-muted">Two-factor authentication is enabled on your account.</p>
            <div className="flex flex-wrap gap-2">
              {user?.hasPassword && (
                <TextField
                  type="password"
                  placeholder="Current password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="max-w-xs"
                  required
                />
              )}
              <Button type="submit" variant="danger" disabled={disableMutation.isPending}>
                Disable 2FA
              </Button>
            </div>
            {disableError && <p className="text-sm text-red-500">{disableError}</p>}
          </form>
        ) : (
          <div>
            <p className="text-sm text-ink-muted">Add an extra layer of security by requiring a code from an authenticator app when you sign in.</p>
            <Button variant="secondary" className="mt-2" onClick={() => setSetupOpen(true)}>
              Enable 2FA
            </Button>
          </div>
        )}
      </div>

      <Modal open={setupOpen} onOpenChange={setSetupOpen} title="Set up two-factor authentication">
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
