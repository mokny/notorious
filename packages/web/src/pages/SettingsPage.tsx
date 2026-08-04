import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceApi, backupApi, systemApi, fileApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { useConfirm } from "../context/ConfirmContext.js";
import { useDebouncedSave } from "../hooks/useDebouncedSave.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";
import { IconPicker } from "../components/IconPicker.js";
import { ApiError } from "../lib/api/client.js";
import { NotificationSettings } from "../components/NotificationSettings.js";
import { ApiKeysSettings } from "../components/ApiKeysSettings.js";
import { BookmarkletSettings } from "../components/BookmarkletSettings.js";
import { IosShortcutSettings } from "../components/IosShortcutSettings.js";
import { AccountSettings } from "../components/AccountSettings.js";
import { ShareDialog } from "../components/ShareDialog.js";
import { ActiveShareLinksList } from "../components/ActiveShareLinksList.js";
import { WebhooksSettings } from "../components/WebhooksSettings.js";
import { AiSettings } from "../components/AiSettings.js";
import { BackupSettings } from "../components/BackupSettings.js";

const ROLES = ["viewer", "commenter", "editor"] as const;

export function SettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("editor");
  const [error, setError] = useState<string | null>(null);

  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });
  const { data: members } = useQuery({ queryKey: ["workspaceMembers", workspaceId], queryFn: () => workspaceApi.members(workspaceId!) });
  const { data: version } = useQuery({ queryKey: ["version"], queryFn: systemApi.version, staleTime: Infinity });

  const isOwner = workspace?.ownerId === user?.id;

  const inviteMutation = useMutation({
    mutationFn: () => workspaceApi.invite(workspaceId!, { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      setInviteEmail("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not invite this user"),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string }) => workspaceApi.updateMemberRole(workspaceId!, input.userId, input.role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => workspaceApi.removeMember(workspaceId!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] }),
  });

  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importKey, setImportKey] = useState("");
  const [importNeedsKey, setImportNeedsKey] = useState(false);

  const importMutation = useMutation({
    mutationFn: (input: { file: File; key?: string }) => backupApi.import(input.file, input.key),
    onSuccess: () => {
      setPendingImportFile(null);
      setImportKey("");
      setImportNeedsKey(false);
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (err, input) => {
      if (err instanceof ApiError && err.statusCode === 400 && /backup code is required/i.test(err.message)) {
        setPendingImportFile(input.file);
        setImportNeedsKey(true);
      }
    },
  });

  const setIconMutation = useMutation({
    mutationFn: (icon: string) => workspaceApi.update(workspaceId!, { icon }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => workspaceApi.update(workspaceId!, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
  const [name, setName] = useDebouncedSave(workspace?.name ?? "", (value) =>
    renameMutation.mutateAsync(value).then(() => undefined),
  );

  const deleteWorkspaceMutation = useMutation({
    mutationFn: () => workspaceApi.remove(workspaceId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      navigate("/", { replace: true });
    },
  });

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    inviteMutation.mutate();
  }

  async function handleDeleteWorkspace() {
    if (!workspace) return;
    const confirmed = await confirm({
      title: `Delete "${workspace.name}"?`,
      description:
        "This deletes the entire workspace for everyone: every object, block, file, view and member's access. This cannot be undone.",
      confirmLabel: "Delete workspace",
      danger: true,
    });
    if (confirmed) deleteWorkspaceMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-6 py-10">
      <section>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="mt-1 text-sm text-ink-muted">Update the email address or password for your own account.</p>
        <AccountSettings />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Workspace</h2>
        <p className="mt-1 text-sm text-ink-muted">Rename "{workspace?.name}", pick an icon, or upload your own image.</p>
        <div className="mt-4 space-y-4">
          {workspace && (
            <>
              <TextField value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" aria-label="Workspace name" />
              <IconPicker
                icon={workspace.icon}
                fallbackIcon={workspace.icon}
                onChangeIcon={(newIcon) => setIconMutation.mutateAsync(newIcon ?? "sparkles").then(() => undefined)}
                onUploadIcon={async (file) => {
                  const asset = await fileApi.upload(workspaceId!, file);
                  return fileApi.downloadUrl(asset.id);
                }}
              />
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-ink-muted">Get a push notification for task reminders, invitations and assignments.</p>
        <NotificationSettings />
      </section>

      <section>
        <h2 className="text-lg font-semibold">API keys</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Personal keys for scripts and other systems to call the API as you, across all of your
          workspaces. Send them as <code>Authorization: Bearer &lt;key&gt;</code>.
        </p>
        <ApiKeysSettings />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Share to Notorious</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Share images, videos, documents, and links into Notorious directly from your phone's share sheet
          (once installed as an app on Android) or from a desktop browser bookmarklet.
        </p>
        <BookmarkletSettings />
        <IosShortcutSettings />
      </section>

      <section>
        <h2 className="text-lg font-semibold">AI</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Configure your own API key for an AI provider to use the Agent Chat, which can create and edit objects for
          you from a prompt. Also used by external MCP clients (Claude Desktop, Claude Code, ...) - see the API
          docs for how to point one at this workspace with a personal API key.
        </p>
        <AiSettings />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="mt-1 text-sm text-ink-muted">Everyone below can access "{workspace?.name}".</p>

        <div className="mt-4 space-y-2">
          {members?.map((member) => (
            <div key={member.userId} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: member.user.avatarColor }}
                >
                  {member.user.name[0]}
                </span>
                <div>
                  <p className="text-sm font-medium">{member.user.name}</p>
                  <p className="text-xs text-ink-muted">{member.user.email}</p>
                </div>
              </div>
              {isOwner && member.role !== "owner" ? (
                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    onChange={(e) => roleMutation.mutate({ userId: member.userId, role: e.target.value })}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => removeMutation.mutate(member.userId)} className="text-xs text-red-500 hover:underline">
                    Remove
                  </button>
                </div>
              ) : (
                <span className="text-xs capitalize text-ink-muted">{member.role}</span>
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <form onSubmit={handleInvite} className="mt-4 flex gap-2">
            <TextField type="email" placeholder="Invite by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}
              className="rounded-lg border border-border bg-surface px-2 text-sm"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <Button type="submit" variant="primary">
              Invite
            </Button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </section>

      {isOwner && (
        <section>
          <h2 className="text-lg font-semibold">Public sharing</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Share the whole workspace via a link, without requiring an account. Set a role, and optionally an expiry -
            you can revoke it at any time below.
          </p>
          <div className="mt-4">
            <ShareDialog workspaceId={workspaceId!} objectId={null} label="Share workspace" />
          </div>

          <p className="mt-6 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Active share links (workspace and individual objects)
          </p>
          <ActiveShareLinksList workspaceId={workspaceId!} />
        </section>
      )}

      {isOwner && (
        <section>
          <h2 className="text-lg font-semibold">Webhooks</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Get an HTTP POST with the full object whenever something changes in this workspace - useful for syncing to
            another system or triggering your own automation.
          </p>
          <WebhooksSettings workspaceId={workspaceId!} />
        </section>
      )}

      {isOwner && (
        <section>
          <h2 className="text-lg font-semibold">Backup</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Every backup is encrypted with this workspace's code below. Download one manually, restore one as a
            brand-new workspace, or set up automatic scheduled backups to one or more destinations.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => window.open(backupApi.exportUrl(workspaceId!), "_blank")}>
              Download backup
            </Button>
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              Restore from ZIP
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importMutation.mutate({ file });
              }}
            />
          </div>
          {importNeedsKey && pendingImportFile && (
            <div className="mt-2 flex items-center gap-2">
              <TextField
                placeholder="Backup code"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                className="max-w-xs"
              />
              <Button
                variant="secondary"
                onClick={() => importMutation.mutate({ file: pendingImportFile, key: importKey })}
                disabled={!importKey || importMutation.isPending}
              >
                Restore
              </Button>
            </div>
          )}
          {importMutation.isError && !importNeedsKey && (
            <p className="mt-2 text-sm text-red-500">
              {importMutation.error instanceof ApiError ? importMutation.error.message : "Could not restore this backup"}
            </p>
          )}
          {importMutation.isSuccess && <p className="mt-2 text-sm text-green-600">Restored as a new workspace - check the workspace picker.</p>}

          <BackupSettings workspaceId={workspaceId!} />
        </section>
      )}

      {isOwner && (
        <section>
          <h2 className="text-lg font-semibold text-red-500">Danger zone</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Permanently deletes this workspace for everyone - every object, block, file, view and member's access. Not
            reversible; download a backup first if you might want any of this later.
          </p>
          <div className="mt-4">
            <Button variant="danger" onClick={handleDeleteWorkspace} disabled={deleteWorkspaceMutation.isPending}>
              Delete this workspace
            </Button>
          </div>
        </section>
      )}

      {version && <p className="text-center text-xs text-ink-muted">Notorious v{version.version}</p>}
    </div>
  );
}
