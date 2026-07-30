import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../lib/api/client.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";

/** Lets the current user change their own email address or password - both require re-entering the current password (see auth/service.ts). */
export function AccountSettings() {
  const { user, refetch } = useAuth();
  const [newEmail, setNewEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const emailMutation = useMutation({
    mutationFn: () => authApi.changeEmail({ newEmail, currentPassword: emailPassword }),
    onSuccess: async () => {
      setEmailPassword("");
      setEmailError(null);
      setEmailSuccess(true);
      await refetch();
    },
    onError: (err) => {
      setEmailSuccess(false);
      setEmailError(err instanceof ApiError ? err.message : "Could not update your email address");
    },
  });

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

  function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailSuccess(false);
    emailMutation.mutate();
  }

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordSuccess(false);
    passwordMutation.mutate();
  }

  return (
    <div className="mt-4 space-y-6">
      <form onSubmit={handleEmailSubmit} className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">Email address</p>
        <div className="flex flex-wrap gap-2">
          <TextField type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="max-w-xs" required />
          <TextField
            type="password"
            placeholder="Current password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            className="max-w-xs"
            required
          />
          <Button type="submit" variant="secondary" disabled={emailMutation.isPending}>
            Update email
          </Button>
        </div>
        {emailError && <p className="text-sm text-red-500">{emailError}</p>}
        {emailSuccess && <p className="text-sm text-green-600">Email address updated.</p>}
      </form>

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
    </div>
  );
}
