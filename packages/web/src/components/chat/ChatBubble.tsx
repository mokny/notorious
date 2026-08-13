import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext.js";
import { useChatOverlay } from "../../context/ChatOverlayContext.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { ChatPanel, useChatUnreadCount } from "./ChatPanel.js";
import { Icon } from "../ui/Icon.js";

/**
 * Permanent, Intercom-style floating chat entry point - mounted once in
 * App.tsx above the route tree (see ChatRealtimeContext.tsx's doc comment),
 * so it's reachable from every page including WorkspacePickerPage. Phone
 * breakpoint gets its own slide-up sheet instead (ChatSheet.tsx, opened from
 * MobileBottomBar's chat icon) - a floating bubble makes no sense at that
 * width. Both share the same ChatOverlayContext open/close/conversation
 * state, so a push-notification deep link works regardless of which shell
 * ends up rendering it.
 */
export function ChatBubble() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const breakpoint = useBreakpoint();
  const { isOpen, open, close } = useChatOverlay();
  const unreadCount = useChatUnreadCount();

  if (!user || isSharedSession() || breakpoint === "phone") return null;

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-20 right-5 z-30 flex h-[32rem] w-96 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl">
          <ChatPanel />
        </div>
      )}
      <button
        onClick={() => (isOpen ? close() : open())}
        className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:opacity-90"
        title={t("chat.bubble.title")}
      >
        <Icon name={isOpen ? "close" : "comment"} className="h-5 w-5" />
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
