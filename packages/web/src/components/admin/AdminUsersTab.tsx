import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { adminApi, type AdminUser } from "../../lib/api/resources.js";
import { ApiError } from "../../lib/api/client.js";
import { useAuth } from "../../context/AuthContext.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { Icon } from "../ui/Icon.js";

export function AdminUsersTab() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.listUsers });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  const promoteMutation = useMutation({ mutationFn: (id: string) => adminApi.promoteUser(id), onSuccess: invalidate });
  const demoteMutation = useMutation({
    mutationFn: (id: string) => adminApi.demoteUser(id),
    onSuccess: invalidate,
  });

  return (
    <div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" className="h-4 w-4" /> {t("admin.users.createButton")}
        </Button>
      </div>

      <div className="mt-3 divide-y divide-border rounded-lg border border-border">
        {users?.map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user.name} {user.id === me?.id && <span className="text-xs text-ink-muted">{t("admin.users.you")}</span>}
              </p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {user.isServerAdmin ? (
                <>
                  <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    <Icon name="shield" className="h-3 w-3" /> {t("admin.users.adminBadge")}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={demoteMutation.isPending}
                    onClick={() => demoteMutation.mutate(user.id)}
                    title={demoteMutation.isError ? (demoteMutation.error as Error).message : undefined}
                  >
                    {t("admin.users.demote")}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" disabled={promoteMutation.isPending} onClick={() => promoteMutation.mutate(user.id)}>
                  {t("admin.users.promote")}
                </Button>
              )}
              <Button variant="danger" onClick={() => setDeleteTarget(user)}>
                {t("admin.users.delete")}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {demoteMutation.isError && (
        <p className="mt-2 text-xs text-red-500">{(demoteMutation.error as Error).message}</p>
      )}

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={invalidate} />}
      {deleteTarget && <DeleteUserModal user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={invalidate} />}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => adminApi.createUser({ email, name }),
    onSuccess: (result) => {
      setCreated({ email: result.user.email, password: result.password });
      onCreated();
    },
  });

  if (created) {
    return (
      <Modal open onOpenChange={(open) => !open && onClose()} title={t("admin.users.createdTitle")}>
        <p className="text-sm text-ink-muted">{t("admin.users.createdHint", { email: created.email })}</p>
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm">
          <span className="flex-1 select-all">{created.password}</span>
          <button
            className="text-xs text-accent hover:underline"
            onClick={() => void navigator.clipboard.writeText(created.password)}
          >
            {t("admin.users.copyPassword")}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {t("admin.done")}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("admin.users.createTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("admin.cancel")}
          </Button>
          <Button variant="primary" disabled={!email || !name || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {t("admin.users.createButton")}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="block text-xs text-ink-muted">
          {t("admin.users.nameLabel")}
          <input className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-xs text-ink-muted">
          {t("admin.users.emailLabel")}
          <input
            type="email"
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <p className="text-xs text-ink-muted">{t("admin.users.createHint")}</p>
        {createMutation.isError && <p className="text-xs text-red-500">{(createMutation.error as Error).message}</p>}
      </div>
    </Modal>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const { data: preview } = useQuery({ queryKey: ["admin", "delete-preview", user.id], queryFn: () => adminApi.deletionPreview(user.id) });
  const [confirmText, setConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteUser(user.id),
    onSuccess: () => {
      onDeleted();
      onClose();
    },
  });

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("admin.users.deleteTitle", { email: user.email })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("admin.cancel")}
          </Button>
          <Button variant="danger" disabled={confirmText !== user.email || deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
            {t("admin.users.deleteButton")}
          </Button>
        </>
      }
    >
      {preview && (
        <div className="space-y-2 text-sm">
          {preview.ownedWorkspaces.length === 0 ? (
            <p className="text-ink-muted">{t("admin.users.ownsNoWorkspaces")}</p>
          ) : (
            <div>
              <p className="font-medium text-red-500">{t("admin.users.ownedWorkspacesWarning", { count: preview.ownedWorkspaces.length })}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">
                {preview.ownedWorkspaces.map((workspace) => (
                  <li key={workspace.id}>
                    {t("admin.users.workspaceSummary", { name: workspace.name, members: workspace.memberCount, objects: workspace.objectCount })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.reattributedItemCount > 0 && (
            <p className="text-xs text-ink-muted">{t("admin.users.reattributedHint", { count: preview.reattributedItemCount })}</p>
          )}
        </div>
      )}

      <label className="mt-4 block text-xs text-ink-muted">
        {t("admin.users.confirmTypeEmail", { email: user.email })}
        <input
          className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </label>
      {deleteMutation.isError && <p className="mt-2 text-xs text-red-500">{deleteMutation.error instanceof ApiError ? deleteMutation.error.message : String(deleteMutation.error)}</p>}
    </Modal>
  );
}
