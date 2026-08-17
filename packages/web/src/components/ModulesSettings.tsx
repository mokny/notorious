import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ModuleSummary } from "@notorious/shared";
import { moduleApi } from "../lib/api/resources.js";
import { Button } from "./ui/Button.js";
import { Icon } from "./ui/Icon.js";

/** Owner-only: enable/disable each module released for this workspace by a server admin, and manage per-member permissions for the ones that are on. */
export function ModulesSettings({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["modules", workspaceId];
  const { data: modules } = useQuery({ queryKey, queryFn: () => moduleApi.list(workspaceId) });
  const [permissionsFor, setPermissionsFor] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<ModuleSummary | null>(null);

  const enableMutation = useMutation({
    mutationFn: (moduleId: string) => moduleApi.enable(workspaceId, moduleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const disableMutation = useMutation({
    mutationFn: ({ moduleId, purge }: { moduleId: string; purge: boolean }) => moduleApi.disable(workspaceId, moduleId, { purge }),
    onSuccess: () => {
      setDisableTarget(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!modules) return null;
  if (modules.length === 0) return <p className="mt-3 text-sm text-ink-muted">{t("settings.workspace.modules.none")}</p>;

  return (
    <div className="mt-3 space-y-2">
      {modules.map((module) => (
        <div key={module.id} className="rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{module.name}</p>
              {module.description && <p className="mt-0.5 text-xs text-ink-muted">{module.description}</p>}
              {!module.enabled && !module.grantedForWorkspace && (
                <p className="mt-1 text-xs text-amber-500">{t("settings.workspace.modules.notReleased")}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {module.enabled ? (
                <>
                  <Button variant="secondary" onClick={() => setPermissionsFor(permissionsFor === module.id ? null : module.id)}>
                    {t("settings.workspace.modules.managePermissions")}
                  </Button>
                  <Button variant="danger" onClick={() => setDisableTarget(module)}>
                    {t("settings.workspace.modules.disable")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  disabled={!module.grantedForWorkspace || enableMutation.isPending}
                  onClick={() => enableMutation.mutate(module.id)}
                >
                  {t("settings.workspace.modules.enable")}
                </Button>
              )}
            </div>
          </div>

          {module.enabled && permissionsFor === module.id && <ModulePermissionsGridPanel workspaceId={workspaceId} moduleId={module.id} />}

          {disableTarget?.id === module.id && (
            <div className="mt-3 space-y-2 rounded-md border border-dashed border-red-500/40 bg-red-500/5 p-3">
              <p className="text-xs text-ink-muted">{t("settings.workspace.modules.disableConfirm")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={disableMutation.isPending}
                  onClick={() => disableMutation.mutate({ moduleId: module.id, purge: false })}
                >
                  {t("settings.workspace.modules.disableKeepData")}
                </Button>
                <Button
                  variant="danger"
                  disabled={disableMutation.isPending}
                  onClick={() => disableMutation.mutate({ moduleId: module.id, purge: true })}
                >
                  {t("settings.workspace.modules.disablePurgeData")}
                </Button>
                <Button variant="ghost" onClick={() => setDisableTarget(null)}>
                  {t("settings.workspace.modules.cancelDisable")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ModulePermissionsGridPanel({ workspaceId, moduleId }: { workspaceId: string; moduleId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["module-permissions", workspaceId, moduleId];
  const { data: grid } = useQuery({ queryKey, queryFn: () => moduleApi.permissions(workspaceId, moduleId) });

  const setMutation = useMutation({
    mutationFn: (vars: { userId: string; permission: string; granted: boolean }) => moduleApi.setPermission(workspaceId, moduleId, vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (!grid) return null;
  if (grid.members.length === 0) return <p className="mt-3 text-xs text-ink-muted">{t("settings.workspace.modules.noMembers")}</p>;

  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="p-2 font-medium">{t("settings.workspace.modules.member")}</th>
            {grid.module.permissions.map((permission) => (
              <th key={permission.key} className="p-2 font-medium">
                {permission.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.members.map((member) => (
            <tr key={member.userId} className="border-b border-border last:border-0">
              <td className="p-2">
                <p className="font-medium">{member.name}</p>
                <p className="text-ink-muted">{member.email}</p>
              </td>
              {grid.module.permissions.map((permission) => (
                <td key={permission.key} className="p-2">
                  <input
                    type="checkbox"
                    checked={member.permissions.includes(permission.key)}
                    disabled={setMutation.isPending}
                    onChange={(e) => setMutation.mutate({ userId: member.userId, permission: permission.key, granted: e.target.checked })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex items-center gap-1 p-2 text-[11px] text-ink-muted">
        <Icon name="shield" className="h-3 w-3" /> {t("settings.workspace.modules.ownerImplicit")}
      </p>
    </div>
  );
}
