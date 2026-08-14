import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../../lib/api/resources.js";
import { Modal } from "../ui/Modal.js";

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (workspaceId: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const createWorkspace = useMutation({
    mutationFn: () => workspaceApi.create({ name: name.trim() || t("workspacePicker.untitledWorkspace"), icon: "sparkles" }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setName("");
      onOpenChange(false);
      onCreated(workspace.id);
    },
  });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) setName("");
        onOpenChange(next);
      }}
      title={t("workspacePicker.create")}
      footer={
        <button
          onClick={() => createWorkspace.mutate()}
          disabled={createWorkspace.isPending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {t("workspacePicker.create")}
        </button>
      }
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !createWorkspace.isPending) createWorkspace.mutate();
        }}
        placeholder={t("workspacePicker.newWorkspaceNamePlaceholder")}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </Modal>
  );
}
