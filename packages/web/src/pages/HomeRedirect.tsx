import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { workspaceApi } from "../lib/api/resources.js";

/**
 * Sits at "/" - lands the user on the dashboard of whatever workspace they were
 * active in last, or /workspaces if that workspace has no dashboard (or there's no
 * last-active workspace at all, e.g. a new user). Push notification taps never go
 * through here: push-sw.ts deep-links straight to a concrete URL. /workspaces is
 * the explicit "show me the picker" route (see the "Switch workspace" menu items).
 */
export function HomeRedirect() {
  const { data, isLoading } = useQuery({
    queryKey: ["lastVisited"],
    queryFn: workspaceApi.lastVisited,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }
  if (data) return <Navigate to={`/w/${data.workspaceId}/objects/${data.objectId}`} replace />;
  return <Navigate to="/workspaces" replace />;
}
