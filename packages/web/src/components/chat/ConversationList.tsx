import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConversationSummary } from "@notorious/shared";
import { chatApi } from "../../lib/api/resources.js";
import { useConfirm } from "../../context/ConfirmContext.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { Icon } from "../ui/Icon.js";

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
  const { data: conversations, isLoading } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations });
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
      title: isChannel ? `Leave #${conversation.name}?` : `Delete chat with ${conversation.name}?`,
      description: isChannel
        ? "You can rejoin from the channel list any time - the channel and its history stay for everyone else."
        : "This only removes it from your list - the other participant keeps their side of the conversation.",
      confirmLabel: isChannel ? "Leave" : "Delete",
      danger: true,
    });
    if (ok) leaveMutation.mutate(conversation.id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-ink">Chats</span>
        <div className="flex items-center gap-1">
          <button onClick={onNewChannel} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title="Channels">
            <Icon name="hash" className="h-4 w-4" />
          </button>
          <button onClick={onNewChat} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink" title="New chat">
            <Icon name="pencil" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-3 text-sm text-ink-muted">Loading…</p>}
        {!isLoading && (!conversations || conversations.length === 0) && <p className="p-3 text-sm text-ink-muted">No conversations yet.</p>}
        <ul>
          {conversations?.map((conversation) => {
            const avatar = conversationInitial(conversation);
            return (
              <li key={conversation.id} className="flex items-center">
                <button onClick={() => onSelect(conversation.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left hover:bg-surface">
                  <ChatAvatar name={avatar.name} avatarColor={avatar.color} avatarUrl={avatar.url} size={9} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {conversation.type === "workspace_channel" && "# "}
                        {conversation.name}
                      </span>
                      {conversation.lastMessageAt && (
                        <span className="shrink-0 text-[11px] text-ink-muted">{new Date(conversation.lastMessageAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-ink-muted">
                        {conversation.lastMessage
                          ? `${conversation.lastMessage.authorName}: ${conversation.lastMessage.body ?? "Message deleted"}`
                          : conversation.workspaceName
                            ? conversation.workspaceName
                            : "No messages yet"}
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
                  title={conversation.type === "workspace_channel" ? "Leave channel" : "Delete chat"}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
