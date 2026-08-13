import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ConversationSummary } from "@notorious/shared";
import { chatApi, aiApi } from "../../lib/api/resources.js";
import { useConfirm } from "../../context/ConfirmContext.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { toAiConversationId } from "./aiConversation.js";
import { Icon } from "../ui/Icon.js";

/**
 * ConversationList is mounted once in App.tsx above the route tree (see
 * ChatBubble.tsx's doc comment), so it has no route param to read the active
 * workspace from - pulled out of the URL instead. `null` outside any
 * workspace (e.g. WorkspacePickerPage), which correctly hides the pinned AI
 * row there - there's no "current workspace" to scope it to.
 */
function useCurrentWorkspaceId(): string | null {
  const location = useLocation();
  return location.pathname.match(/^\/w\/([^/]+)/)?.[1] ?? null;
}

function conversationInitial(conversation: ConversationSummary): { name: string; color: string; url: string | null } {
  if (conversation.type === "workspace_channel") return { name: conversation.name, color: "#6366f1", url: null };
  const first = conversation.otherParticipants[0];
  return { name: conversation.name, color: first?.avatarColor ?? "#6366f1", url: first?.avatarUrl ?? null };
}

/**
 * The unified list - workspace channels (across every workspace the user
 * belongs to) and DMs merged, sorted by activity. Backs both the desktop
 * floating panel and the mobile full-screen list (see ChatPanel.tsx /
 * ChatListPage.tsx), so it takes no layout opinion beyond "a list of rows".
 */
export function ConversationList({ onSelect, onNewChat, onNewChannel }: { onSelect: (id: string) => void; onNewChat: () => void; onNewChannel: () => void }) {
  const { t } = useTranslation();
  const { data: conversations, isLoading } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations });
  const currentWorkspaceId = useCurrentWorkspaceId();
  // Pinned "Notorious AI" row for the active workspace, if it has AI
  // configured - see modules/ai/service.ts's listAiConfiguredWorkspacesForUser.
  // Not part of the real conversations list above (different backend
  // entirely, see aiConversation.ts), so it's rendered separately and always
  // first. Scoped to `currentWorkspaceId` so switching workspaces doesn't
  // keep showing every other workspace's AI agent too.
  const { data: aiWorkspaces } = useQuery({
    queryKey: ["aiConfiguredWorkspaces", currentWorkspaceId],
    queryFn: () => aiApi.listConfiguredWorkspaces(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  // Only ever removes *this* participant's row (see
  // chat/service.ts::leaveConversation) - the conversation and everyone
  // else's history are untouched, same as leaving any group chat elsewhere.
  const leaveMutation = useMutation({
    mutationFn: (conversationId: string) => chatApi.leave(conversationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chatConversations"] }),
  });

  async function handleDelete(event: React.MouseEvent, conversation: ConversationSummary) {
    event.stopPropagation();
    const isChannel = conversation.type === "workspace_channel";
    const ok = await confirm({
      title: isChannel
        ? t("chat.conversationList.leaveConfirmTitle", { name: conversation.name })
        : t("chat.conversationList.deleteConfirmTitle", { name: conversation.name }),
      description: isChannel
        ? t("chat.conversationList.leaveConfirmDescription")
        : t("chat.conversationList.deleteConfirmDescription"),
      confirmLabel: isChannel ? t("chat.conversationList.leave") : t("chat.conversationList.delete"),
      danger: true,
    });
    if (ok) leaveMutation.mutate(conversation.id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-ink">{t("chat.conversationList.title")}</span>
        <div className="flex items-center gap-1">
          <button onClick={onNewChannel} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title={t("chat.conversationList.channels")}>
            <Icon name="hash" className="h-4 w-4" />
          </button>
          <button onClick={onNewChat} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title={t("chat.conversationList.newChat")}>
            <Icon name="pencil" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-3 text-sm text-ink-muted">{t("chat.conversationList.loading")}</p>}
        {!isLoading && (!conversations || conversations.length === 0) && (!aiWorkspaces || aiWorkspaces.length === 0) && (
          <p className="p-3 text-sm text-ink-muted">{t("chat.conversationList.empty")}</p>
        )}
        <ul>
          {aiWorkspaces?.map((workspace) => (
            // The inset border-b (starting after the avatar, not the row's own left edge) is the
            // iMessage list-divider look - a plain `border-b` on the `<li>` would run full-width instead.
            <li key={workspace.workspaceId} className="relative flex items-center bg-accent/[0.06]">
              <button
                onClick={() => onSelect(toAiConversationId(workspace.workspaceId))}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left hover:bg-accent/10"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Icon name="bot" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-base font-medium text-ink">{t("chat.aiThread.name")}</span>
                  <div className="truncate text-sm text-ink-muted">{workspace.workspaceName}</div>
                </div>
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 left-[66px] border-b border-border" />
            </li>
          ))}
          {conversations?.map((conversation) => {
            const avatar = conversationInitial(conversation);
            return (
              <li key={conversation.id} className="relative flex items-center">
                <button onClick={() => onSelect(conversation.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left hover:bg-surface">
                  <ChatAvatar name={avatar.name} avatarColor={avatar.color} avatarUrl={avatar.url} size={11} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-base font-medium text-ink">
                        {conversation.type === "workspace_channel" && "# "}
                        {conversation.name}
                      </span>
                      {conversation.lastMessageAt && (
                        <span className="shrink-0 text-xs text-ink-muted">{new Date(conversation.lastMessageAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-ink-muted">
                        {conversation.lastMessage
                          ? `${conversation.lastMessage.authorName}: ${conversation.lastMessage.body ?? t("chat.conversationList.messageDeleted")}`
                          : conversation.workspaceName
                            ? conversation.workspaceName
                            : t("chat.conversationList.noMessagesYet")}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                          {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(event) => handleDelete(event, conversation)}
                  className="mr-2 shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-red-500"
                  title={conversation.type === "workspace_channel" ? t("chat.conversationList.leaveChannel") : t("chat.conversationList.deleteChat")}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 left-[66px] border-b border-border" />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
