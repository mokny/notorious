import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
import { workspaceApi, schemaApi } from "../lib/api/resources.js";

/**
 * What you land on when opening a workspace: its dashboard object if one has
 * been set (see the "Set as dashboard" toggle on ObjectDetailPage), otherwise
 * the same "first object type" fallback the workspace picker used before
 * dashboards existed.
 */
export function WorkspaceHome() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId!),
    enabled: Boolean(workspaceId) && workspace !== undefined && !workspace?.dashboardObjectId,
  });

  if (!workspace) return null;

  if (workspace.dashboardObjectId) {
    return <Navigate to={`/w/${workspaceId}/objects/${workspace.dashboardObjectId}`} replace />;
  }

  if (!objectTypes) return null;

  const defaultType = objectTypes.find((t) => t.key === "task") ?? objectTypes[0];
  return <Navigate to={defaultType ? `/w/${workspaceId}/types/${defaultType.key}` : `/w/${workspaceId}/search`} replace />;
}
