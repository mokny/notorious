import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { twoFactorApi } from "../lib/api/resources.js";
import { ApiError } from "../lib/api/client.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";

type Step = "start" | "confirm" | "backupCodes";

/**
 * QR-code setup -> 6-digit confirmation -> one-time backup codes display.
 * Shared between the opt-in flow in AccountSettings.tsx and the mandatory
 * flow in SetupTwoFactorPage.tsx - `onComplete` fires only after the user
 * has acknowledged they saved their backup codes, not right after `confirm`
 * succeeds, since those codes are never shown again.
 */
export function TwoFactorSetupFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("start");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const setupMutation = useMutation({
    mutationFn: () => twoFactorApi.setup(),
    onSuccess: (result) => {
      setQrCodeDataUrl(result.qrCodeDataUrl);
      setSecret(result.secret);
      setStep("confirm");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => twoFactorApi.confirm({ code }),
    onSuccess: (result) => {
      setConfirmError(null);
      setBackupCodes(result.backupCodes);
      setStep("backupCodes");
    },
    onError: (err) => {
      setConfirmError(err instanceof ApiError ? err.message : "Could not confirm the code");
    },
  });

  if (step === "start") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          You&apos;ll scan a QR code with an authenticator app of your choice (e.g. Google Authenticator, Authy, 1Password) and
          confirm it with a 6-digit code.
        </p>
        {setupMutation.isError && <p className="text-sm text-red-500">Could not start setup. Please try again.</p>}
        <Button variant="primary" onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
          {setupMutation.isPending ? "Starting…" : "Set up two-factor authentication"}
        </Button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          confirmMutation.mutate();
        }}
      >
        {qrCodeDataUrl && (
          <div className="flex justify-center rounded-lg border border-border bg-white p-3">
            <img src={qrCodeDataUrl} alt="Two-factor authentication QR code" className="h-40 w-40" />
          </div>
        )}
        {secret && (
          <p className="break-all rounded-lg border border-border bg-surface px-3 py-2 text-center font-mono text-xs text-ink-muted">
            Can&apos;t scan? Enter this key manually: {secret}
          </p>
        )}
        <TextField
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        {confirmError && <p className="text-sm text-red-500">{confirmError}</p>}
        <Button type="submit" variant="primary" disabled={confirmMutation.isPending || code.length !== 6} className="w-full">
          {confirmMutation.isPending ? "Confirming…" : "Confirm"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Save these backup codes somewhere safe. Each one can be used once to sign in if you lose access to your
        authenticator app - they won&apos;t be shown again.
      </p>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-surface p-3 font-mono text-sm">
        {backupCodes.map((backupCode) => (
          <span key={backupCode}>{backupCode}</span>
        ))}
      </div>
      <Button variant="primary" className="w-full" onClick={onComplete}>
        I&apos;ve saved these codes
      </Button>
    </div>
  );
}
