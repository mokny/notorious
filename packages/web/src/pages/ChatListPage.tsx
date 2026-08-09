import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConversationList } from "../components/chat/ConversationList.js";
import { NewChatDialog } from "../components/chat/NewChatDialog.js";
import { NewChannelDialog } from "../components/chat/NewChannelDialog.js";

/**
 * Mobile full-screen conversation list - the iMessage-style entry point
 * reached from the MobileBottomBar chat icon. Top-level route (not nested
 * under WorkspaceLayout), since it merges channels across every workspace
 * plus DMs into one list, same source as the desktop ChatPanel.tsx.
 */
export function ChatListPage() {
  const navigate = useNavigate();
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChannelOpen, setNewChannelOpen] = useState(false);

  return (
    <div className="flex flex-col" style={{ height: "var(--app-vh)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="min-h-0 flex-1">
        <ConversationList
          onSelect={(id) => navigate(`/messages/${id}`)}
          onNewChat={() => setNewChatOpen(true)}
          onNewChannel={() => setNewChannelOpen(true)}
        />
      </div>
      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onCreated={(id) => navigate(`/messages/${id}`)} />
      <NewChannelDialog open={newChannelOpen} onOpenChange={setNewChannelOpen} onCreated={(id) => navigate(`/messages/${id}`)} />
    </div>
  );
}
