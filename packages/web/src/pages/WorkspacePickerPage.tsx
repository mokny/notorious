import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";
import { Icon } from "../components/ui/Icon.js";

export function WorkspacePickerPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list });

  const createWorkspace = useMutation({
    mutationFn: () => workspaceApi.create({ name: name || t("workspacePicker.untitledWorkspace"), icon: "sparkles" }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      openWorkspace(workspace.id);
    },
  });

  // WorkspaceHome (the index route for "/w/:id") decides where that actually
  // lands - the workspace's dashboard object if one is set, otherwise the
  // same "first object type" fallback this used to compute here directly.
  function openWorkspace(workspaceId: string) {
    navigate(`/w/${workspaceId}`);
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createWorkspace.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <img src="/logo.png" alt="" className="mb-6 h-16 w-16 rounded-2xl" />
      <h1 className="text-2xl font-semibold">{t("workspacePicker.greeting", { name: user?.name?.split(" ")[0] })}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t("workspacePicker.subtitle")}</p>

      <div className="mt-8 space-y-2">
        {workspaces?.map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => openWorkspace(workspace.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-raised p-4 text-left transition hover:ring-2 hover:ring-accent/30"
          >
            <Icon name={workspace.icon} className="h-5 w-5 text-accent" />
            <span className="font-medium">{workspace.name}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleCreate} className="mt-8 flex gap-2">
        <TextField placeholder={t("workspacePicker.newWorkspaceNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary" disabled={createWorkspace.isPending}>
          <Icon name="plus" /> {t("workspacePicker.create")}
        </Button>
      </form>
    </div>
  );
}
