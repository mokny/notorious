import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiChatMessage } from "@notorious/shared";
import { aiApi, workspaceApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";
import { Icon } from "../components/ui/Icon.js";

function MessageBubble({ message }: { message: AiChatMessage }) {
  if (message.role === "tool") return null; // raw tool results are implementation detail - the assistant's own reply summarizes what happened

  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${isUser ? "bg-accent text-white" : "bg-surface-raised"}`}>
        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        {message.toolCalls?.map((call) => (
          <p key={call.id} className={`mt-1 flex items-center gap-1 text-xs ${isUser ? "text-white/80" : "text-ink-muted"}`}>
            <Icon name="terminal" className="h-3 w-3" /> Called <code>{call.name}</code>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Chat UI for the in-app AI agent - only usable once a workspace owner has configured a shared provider in Settings (see WorkspaceAiSettings.tsx). Shares its tool set with the MCP server (modules/ai/tools.ts on the server), so anything it can do here, an external MCP client can do too. */
export function AgentChatPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });
  const isOwner = workspace?.ownerId === user?.id;
  const { data: config } = useQuery({ queryKey: ["aiConfig", workspaceId], queryFn: () => aiApi.getConfig(workspaceId!), enabled: Boolean(workspaceId) });
  const { data: messages } = useQuery({
    queryKey: ["aiChat", workspaceId],
    queryFn: () => aiApi.listMessages(workspaceId!),
    enabled: Boolean(workspaceId) && config?.configured,
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => aiApi.sendMessage(workspaceId!, message),
    onSuccess: () => {
      setInput("");
      void queryClient.invalidateQueries({ queryKey: ["aiChat", workspaceId] });
      // The agent may have created/edited/archived objects - the rest of the app shouldn't keep showing stale data.
      void queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["viewResults"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => aiApi.clearMessages(workspaceId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aiChat", workspaceId] }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sendMutation.isPending]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
  }

  if (config && !config.configured) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <Icon name="terminal" className="mx-auto h-8 w-8 text-ink-muted" />
        <h1 className="mt-3 text-lg font-semibold">No AI provider configured</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isOwner
            ? "Set up an API key for an AI provider to chat with an agent that can create and edit objects for you."
            : "Ask a workspace owner to configure an AI provider in Settings - it's shared by everyone in this workspace."}
        </p>
        {isOwner && (
          <Link to={`/w/${workspaceId}/settings`}>
            <Button variant="primary" className="mt-4">
              Go to Settings
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col px-4 py-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Agent Chat</h1>
        {messages && messages.length > 0 && (
          <button onClick={() => clearMutation.mutate()} className="text-xs text-ink-muted hover:text-red-500">
            Clear history
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto">
        {messages?.length === 0 && (
          <p className="text-sm text-ink-muted">
            Ask me to create objects, search for things, or update existing ones - e.g. "Create a task called Review PR".
          </p>
        )}
        {messages?.map((message) => <MessageBubble key={message.id} message={message} />)}
        {sendMutation.isPending && <p className="text-xs text-ink-muted">Thinking…</p>}
        {/* Shows the server's actual error message (e.g. the AI provider's
            own error body, or a network/timeout failure - see agent.ts and
            the provider adapters) instead of a generic string, so a bad API
            key/rate limit/timeout is distinguishable at a glance. */}
        {sendMutation.isError && (
          <p className="text-xs text-red-500">{sendMutation.error instanceof Error ? sendMutation.error.message : "Something went wrong - try again."}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type an instruction…"
          disabled={sendMutation.isPending}
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={sendMutation.isPending || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
