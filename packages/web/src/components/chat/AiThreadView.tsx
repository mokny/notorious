import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMatch } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiChatMessage } from "@notorious/shared";
import { aiApi } from "../../lib/api/resources.js";
import { dayKey, dayLabel } from "../../lib/chatDayLabels.js";
import { Icon } from "../ui/Icon.js";
import { useSpeechToText, speechToTextSupported } from "../../hooks/useSpeechToText.js";

/**
 * Same bubble shape as MessageBubble.tsx (max-w-xs, rounded-2xl) for layout parity with real DM
 * threads, but assistant replies use a distinct accent-tinted bubble (not the plain `bg-surface`
 * real received DMs use) plus a small bot-icon chip, so an AI reply can't be mistaken for a
 * message from a real workspace member at a glance.
 */
function AiMessageBubble({ message }: { message: AiChatMessage }) {
  if (message.role === "tool") return null; // raw tool results are implementation detail - the assistant's own reply summarizes what happened
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col gap-0.5 px-3 py-1 ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`flex max-w-xs items-start gap-1.5 rounded-2xl px-3 py-2 text-sm ${
          isUser ? "bg-accent text-white" : "border border-accent/25 bg-accent/10 text-ink"
        }`}
      >
        {!isUser && (
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <Icon name="bot" className="h-2.5 w-2.5" />
          </span>
        )}
        <div className="min-w-0">
          {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
          {message.toolCalls?.map((call) => (
            <p key={call.id} className={`mt-1 flex items-center gap-1 text-xs ${isUser ? "text-white/80" : "text-ink-muted"}`}>
              <Icon name="terminal" className="h-3 w-3" /> Called <code>{call.name}</code>
            </p>
          ))}
        </div>
      </div>
      <span className="px-1 text-[11px] text-ink-muted">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

/** The "Notorious AI" thread - visually a ThreadView (see aiConversation.ts for how ThreadView dispatches here), but backed entirely by the workspace-scoped ai_chat_messages API instead of the real conversations/messages tables, since it shares its tool set with the MCP server (modules/ai/tools.ts on the server). */
export function AiThreadView({ workspaceId, onBack }: { workspaceId: string; onBack?: () => void }) {
  const queryClient = useQueryClient();
  const queryKey = ["aiChat", workspaceId];
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const { isListening, toggleListening } = useSpeechToText(setInput);

  const { data: messages } = useQuery({ queryKey, queryFn: () => aiApi.listMessages(workspaceId) });

  // Whatever object detail page is open behind this chat overlay (see App.tsx - ChatSheet/ChatBubble
  // render on top of every route) - sent along so the user can say "update this" without naming it.
  const objectRouteMatch = useMatch("/w/:workspaceId/objects/:objectId");
  const activeObjectId = objectRouteMatch?.params.workspaceId === workspaceId ? (objectRouteMatch.params.objectId ?? null) : null;

  const sendMutation = useMutation({
    mutationFn: (message: string) => aiApi.sendMessage(workspaceId, message, activeObjectId),
    onSuccess: () => {
      setInput("");
      void queryClient.invalidateQueries({ queryKey });
      // The agent may have created/edited/archived objects - the rest of the app shouldn't keep showing stale data.
      void queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["viewResults"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => aiApi.clearMessages(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, sendMutation.isPending]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {onBack && (
          <button onClick={onBack} className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
        )}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <Icon name="bot" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">Notorious AI</span>
        {messages && messages.length > 0 && (
          <button onClick={() => clearMutation.mutate()} className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-red-500" title="Clear history">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {messages?.length === 0 && (
          <p className="px-4 py-2 text-sm text-ink-muted">
            Ask me to create objects, search for things, or update existing ones - e.g. "Create a task called Review PR".
          </p>
        )}
        {messages?.map((message, index) => {
          const previous = messages[index - 1];
          const showDaySeparator = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
          return (
            <div key={message.id}>
              {showDaySeparator && (
                <div className="my-2 flex items-center justify-center">
                  <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">{dayLabel(message.createdAt)}</span>
                </div>
              )}
              <AiMessageBubble message={message} />
            </div>
          );
        })}
        {sendMutation.isPending && <p className="px-4 py-1 text-xs italic text-ink-muted">Thinking…</p>}
        {/* Shows the server's actual error message (e.g. a budget-exceeded block, the AI provider's own error body, or a network/timeout failure - see agent.ts and the provider adapters) instead of a generic string. */}
        {sendMutation.isError && (
          <p className="px-4 py-1 text-xs text-red-500">{sendMutation.error instanceof Error ? sendMutation.error.message : "Something went wrong - try again."}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-1.5 border-t border-border p-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit(event);
            }
          }}
          rows={1}
          placeholder="Ask Notorious AI…"
          disabled={sendMutation.isPending}
          className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        {/* Same icon-swap rule as Composer.tsx: while listening, the pulsing
            stop control stays put even once dictated text starts filling the
            field, only falling back to the input-driven send/mic logic once
            recording ends. */}
        {isListening ? (
          <button
            type="button"
            onClick={toggleListening}
            className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-red-500 text-white"
            title="Stop dictation"
          >
            <Icon name="mic" className="h-4 w-4" />
          </button>
        ) : !input.trim() && speechToTextSupported ? (
          <button
            type="button"
            onClick={toggleListening}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
            title="Dictate"
          >
            <Icon name="mic" className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={sendMutation.isPending || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:opacity-90 disabled:opacity-40"
            title="Send"
          >
            <Icon name="send" className="h-4 w-4" />
          </button>
        )}
      </form>
    </div>
  );
}
