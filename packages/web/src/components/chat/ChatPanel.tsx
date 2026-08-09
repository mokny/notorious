import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatApi } from "../../lib/api/resources.js";
import { ConversationList } from "./ConversationList.js";
import { ThreadView } from "./ThreadView.js";
import { NewChatDialog } from "./NewChatDialog.js";
import { NewChannelDialog } from "./NewChannelDialog.js";
import { Icon } from "../ui/Icon.js";

/** The floating window's content - conversation list <-> thread, plus the two "start something new" dialogs. Shared by ChatBubble.tsx's desktop popover and the mobile full-screen pages (ChatListPage/ChatThreadPage), which each supply their own shell/chrome around these same pieces. */
export function ChatPanel({ onClose }: { onClose?: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChannelOpen, setNewChannelOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {onClose && (
        <div className="flex justify-end border-b border-border p-1 sm:hidden">
          <button onClick={onClose} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}

      {selectedId ? (
        <ThreadView conversationId={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        <ConversationList onSelect={setSelectedId} onNewChat={() => setNewChatOpen(true)} onNewChannel={() => setNewChannelOpen(true)} />
      )}

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onCreated={setSelectedId} />
      <NewChannelDialog open={newChannelOpen} onOpenChange={setNewChannelOpen} onCreated={setSelectedId} />
    </div>
  );
}

/** Unread-conversation count for the bubble's badge - same visual convention as NotificationBell.tsx. */
export function useChatUnreadCount(): number {
  const { data: conversations } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations });
  return conversations?.filter((c) => c.unreadCount > 0).length ?? 0;
}
