import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi, twoFactorApi } from "../../lib/api/resources.js";
import { useAuth } from "../../context/AuthContext.js";
import { ApiError } from "../../lib/api/client.js";
import { Button } from "../ui/Button.js";
import { TextField } from "../ui/TextField.js";
import { Modal } from "../ui/Modal.js";
import { TwoFactorSetupFlow } from "../TwoFactorSetupFlow.js";

/** Lets the current user change their own password or enable/disable 2FA. */
export function SecuritySettings() {
  const { user, refetch } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);

  const passwordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError(null);
      setPasswordSuccess(true);
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
    mutationFn: () => twoFactorApi.disable({ currentPassword: disablePassword }),
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
        <div className="flex flex-wrap gap-2">
          <TextField
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="max-w-xs"
            required
          />
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
            Update password
          </Button>
        </div>
        {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
        {passwordSuccess && <p className="text-sm text-green-600">Password updated. Your other sessions have been signed out.</p>}
      </form>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Two-factor authentication</p>
        {user?.totpEnabled ? (
          <form onSubmit={handleDisableSubmit} className="space-y-2">
            <p className="text-sm text-ink-muted">Two-factor authentication is enabled on your account.</p>
            <div className="flex flex-wrap gap-2">
              <TextField
                type="password"
                placeholder="Current password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="max-w-xs"
                required
              />
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
    </div>
  );
}
