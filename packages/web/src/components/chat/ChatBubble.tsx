import { useState } from "react";
import { useAuth } from "../../context/AuthContext.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { ChatPanel, useChatUnreadCount } from "./ChatPanel.js";
import { Icon } from "../ui/Icon.js";

/**
 * Permanent, Intercom-style floating chat entry point - mounted once in
 * App.tsx above the route tree (see ChatRealtimeContext.tsx's doc comment),
 * so it's reachable from every page including WorkspacePickerPage. Phone
 * breakpoint gets its own full-screen entry instead (a bottom-bar icon, see
 * MobileBottomBar.tsx) - a floating bubble makes no sense at that width.
 */
export function ChatBubble() {
  const { user } = useAuth();
  const breakpoint = useBreakpoint();
  const [open, setOpen] = useState(false);
  const unreadCount = useChatUnreadCount();

  if (!user || isSharedSession() || breakpoint === "phone") return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-5 z-30 flex h-[32rem] w-96 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl">
          <ChatPanel onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:opacity-90"
        title="Chat"
      >
        <Icon name={open ? "close" : "comment"} className="h-5 w-5" />
        {!open && unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
