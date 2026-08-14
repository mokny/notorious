import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "@notorious/shared";
import { workspaceApi, fileApi } from "../../lib/api/resources.js";
import { Modal } from "../ui/Modal.js";
import { IconPicker } from "../IconPicker.js";

const DEFAULT_ICON = "sparkles";

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
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [iconConfirmed, setIconConfirmed] = useState(false);
  const [showIconRequiredError, setShowIconRequiredError] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Set once the workspace has been silently created in the background (see
  // handleUploadIcon) - from then on the dialog is in "update mode": name/icon
  // changes and the final submit patch this workspace instead of creating a
  // second one, and closing without submitting deletes it again.
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: CreateWorkspaceInput) => workspaceApi.create(input),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWorkspaceInput }) => workspaceApi.update(id, input),
  });

  function resetState() {
    setName("");
    setIcon(DEFAULT_ICON);
    setIconConfirmed(false);
    setShowIconRequiredError(false);
    setUploadError(null);
    setWorkspaceId(null);
  }

  async function ensureWorkspaceCreated(): Promise<string> {
    if (workspaceId) return workspaceId;
    const workspace = await createMutation.mutateAsync({ name: name.trim() || t("workspacePicker.untitledWorkspace"), icon });
    setWorkspaceId(workspace.id);
    return workspace.id;
  }

  async function handleUploadIcon(file: File): Promise<string> {
    setUploadError(null);
    try {
      const id = await ensureWorkspaceCreated();
      const asset = await fileApi.upload(id, file);
      return fileApi.downloadUrl(asset.id);
    } catch (error) {
      setUploadError(t("workspacePicker.iconUploadFailed"));
      throw error;
    }
  }

  async function handleChangeIcon(newIcon: string | null) {
    const value = newIcon ?? DEFAULT_ICON;
    setIcon(value);
    setIconConfirmed(true);
    setShowIconRequiredError(false);
    if (workspaceId) await updateMutation.mutateAsync({ id: workspaceId, input: { icon: value } });
  }

  async function handleSubmit() {
    if (!iconConfirmed) {
      setShowIconRequiredError(true);
      return;
    }
    const trimmedName = name.trim() || t("workspacePicker.untitledWorkspace");
    const id = workspaceId
      ? (await updateMutation.mutateAsync({ id: workspaceId, input: { name: trimmedName } })).id
      : (await createMutation.mutateAsync({ name: trimmedName, icon })).id;
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    resetState();
    onOpenChange(false);
    onCreated(id);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Undoes the silent background creation from an icon upload - the user
      // never confirmed they wanted this workspace.
      if (workspaceId) void workspaceApi.remove(workspaceId).catch(() => {});
      resetState();
    }
    onOpenChange(next);
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={t("workspacePicker.create")}
      footer={
        <button
          onClick={handleSubmit}
          disabled={isPending}
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
          if (event.key === "Enter" && !isPending) void handleSubmit();
        }}
        placeholder={t("workspacePicker.newWorkspaceNamePlaceholder")}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <div className="mt-4">
        <label className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
          {t("workspacePicker.iconLabel")}
          <span className="text-red-500">*</span>
        </label>
        <IconPicker icon={icon} fallbackIcon={DEFAULT_ICON} onChangeIcon={handleChangeIcon} onUploadIcon={handleUploadIcon} />
        {showIconRequiredError && <p className="mt-1 text-xs text-red-500">{t("workspacePicker.iconRequired")}</p>}
        {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
      </div>
    </Modal>
  );
}
