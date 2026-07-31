import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.js";
import { systemApi } from "../lib/api/resources.js";
import { TwoFactorSetupFlow } from "../components/TwoFactorSetupFlow.js";

/**
 * Mandatory setup, reached via App.tsx's `RequireAuth` redirect when the
 * instance-wide 2FA requirement is on and this user hasn't set it up yet
 * (see `npm run enable-2fa-requirement`). Deliberately not wrapped in
 * `RequireAuth` itself - it does its own narrower checks below - since
 * `RequireAuth` would just redirect right back here, looping forever.
 */
export function SetupTwoFactorPage() {
  const { user, isLoading, refetch } = useAuth();
  const navigate = useNavigate();
  const { data: twoFactor, isLoading: twoFactorLoading } = useQuery({
    queryKey: ["twoFactorRequired"],
    queryFn: systemApi.twoFactorRequired,
    staleTime: 60_000,
  });

  if (isLoading || twoFactorLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.totpEnabled || !twoFactor?.required) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Set up two-factor authentication</h1>
          <p className="mt-1 text-sm text-ink-muted">This instance requires 2FA before you can continue.</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-6">
          <TwoFactorSetupFlow
            onComplete={async () => {
              await refetch();
              navigate("/");
            }}
          />
        </div>
      </div>
    </div>
  );
}
