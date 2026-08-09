import { useNavigate, useParams } from "react-router-dom";
import { ThreadView } from "../components/chat/ThreadView.js";

/** Mobile full-screen thread - back navigates to the conversation list, iMessage-style. */
export function ChatThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();

  if (!conversationId) return null;

  return (
    <div className="flex flex-col" style={{ height: "var(--app-vh)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="min-h-0 flex-1">
        <ThreadView conversationId={conversationId} onBack={() => navigate("/messages")} />
      </div>
    </div>
  );
}
