import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { chatApi } from "../../lib/api/resources.js";
import { useChatOverlay } from "../../context/ChatOverlayContext.js";
import { ConversationList } from "./ConversationList.js";
import { ThreadView } from "./ThreadView.js";
import { NewChatDialog } from "./NewChatDialog.js";
import { NewChannelDialog } from "./NewChannelDialog.js";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog.js";

/**
 * The overlay's content - conversation list <-> thread, plus the two "start
 * something new" dialogs. Shared by ChatBubble.tsx's desktop floating panel
 * and ChatSheet.tsx's mobile slide-up sheet, which each supply their own
 * shell/chrome around these same pieces (the mobile sheet is dismissed by
 * swiping it down or tapping the backdrop, see ChatSheet.tsx - no in-panel
 * close button needed). Reads "which conversation" from ChatOverlayContext
 * rather than owning it locally, so a push-notification deep link
 * (ChatDeepLinkRoute.tsx) can jump straight to a thread regardless of which
 * shell is currently mounted.
 */
export function ChatPanel() {
  const { conversationId, selectConversation } = useChatOverlay();
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [browseChannelsOpen, setBrowseChannelsOpen] = useState(false);
  const [newChannelOpen, setNewChannelOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {conversationId ? (
        <ThreadView conversationId={conversationId} onBack={() => selectConversation(null)} />
      ) : (
        <ConversationList onSelect={selectConversation} onNewChat={() => setNewChatOpen(true)} onNewChannel={() => setBrowseChannelsOpen(true)} />
      )}

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onCreated={selectConversation} />
      <BrowseChannelsDialog
        open={browseChannelsOpen}
        onOpenChange={setBrowseChannelsOpen}
        onSelect={selectConversation}
        onCreateNew={() => {
          setBrowseChannelsOpen(false);
          setNewChannelOpen(true);
        }}
      />
      <NewChannelDialog open={newChannelOpen} onOpenChange={setNewChannelOpen} onCreated={selectConversation} />
    </div>
  );
}

/** Unread-conversation count for the bubble's badge - same visual convention as NotificationBell.tsx. */
export function useChatUnreadCount(): number {
  const { data: conversations } = useQuery({ queryKey: ["chatConversations"], queryFn: chatApi.listConversations });
  return conversations?.filter((c) => c.unreadCount > 0).length ?? 0;
}
