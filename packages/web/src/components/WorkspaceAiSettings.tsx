import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_PROVIDERS, AI_USAGE_RESET_INTERVALS, AI_CHAT_HISTORY_LIMIT_MAX, type AiProvider, type AiUsageResetInterval } from "@notorious/shared";
import { aiApi } from "../lib/api/resources.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google (Gemini)",
  "openai-compatible": "OpenAI-compatible (Ollama, local models, ...)",
};

const INTERVAL_LABELS: Record<AiUsageResetInterval, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/**
 * Suggestions only, not a fixed enum - `model` stays a free-text field (see
 * SaveWorkspaceAiConfigInput) since Google ships new Gemini models faster
 * than this list could be kept in sync. Shown via a `<datalist>` so picking
 * one is a click, but typing any other model id future releases add still
 * works.
 */
const GEMINI_MODEL_SUGGESTIONS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.5-pro",
  "gemini-3-flash",
  "gemini-3-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

/** Lets a workspace owner configure the single AI provider profile (API key, encrypted at rest) shared by every member of this workspace - powers the Agent Chat page and AI blocks for everyone, and caps total token usage on an owner-chosen reset interval. */
export function WorkspaceAiSettings({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["aiConfig", workspaceId];
  const { data: config } = useQuery({ queryKey, queryFn: () => aiApi.getConfig(workspaceId) });

  // "quick" (reset interval + token limit only, no API key needed) is the
  // common case once a config already exists - "replace" carries the full
  // form including the API key, for the rarer case of swapping provider/key.
  const [mode, setMode] = useState<"quick" | "replace">("quick");

  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [maxTokenBudget, setMaxTokenBudget] = useState("");
  const [usageResetInterval, setUsageResetInterval] = useState<AiUsageResetInterval>("monthly");
  const [error, setError] = useState<string | null>(null);

  const [quickMaxTokenBudget, setQuickMaxTokenBudget] = useState("");
  const [quickInterval, setQuickInterval] = useState<AiUsageResetInterval>("monthly");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickInitialized, setQuickInitialized] = useState(false);

  // Seeds the quick-edit fields from the loaded config exactly once - after
  // that, the fields are the user's to edit and shouldn't get clobbered by a
  // background refetch (e.g. after the mutation's own invalidate).
  useEffect(() => {
    if (config?.configured && !quickInitialized) {
      setQuickMaxTokenBudget(config.maxTokenBudget != null ? String(config.maxTokenBudget) : "");
      setQuickInterval(config.usageResetInterval ?? "monthly");
      setQuickInitialized(true);
    }
  }, [config, quickInitialized]);

  const [purposeInstructions, setPurposeInstructions] = useState("");
  const [chatHistoryLimit, setChatHistoryLimit] = useState(20);
  const [activityFeedEnabled, setActivityFeedEnabled] = useState(false);
  const [contextInitialized, setContextInitialized] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);

  useEffect(() => {
    if (config?.configured && !contextInitialized) {
      setPurposeInstructions(config.purposeInstructions ?? "");
      setChatHistoryLimit(config.chatHistoryLimit);
      setActivityFeedEnabled(config.activityFeedEnabled);
      setContextInitialized(true);
    }
  }, [config, contextInitialized]);

  const contextMutation = useMutation({
    mutationFn: () =>
      aiApi.updateContext(workspaceId, {
        purposeInstructions: purposeInstructions.trim() || null,
        chatHistoryLimit,
        activityFeedEnabled,
      }),
    onSuccess: () => {
      setContextSaved(true);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  function handleContextSubmit(event: FormEvent) {
    event.preventDefault();
    setContextSaved(false);
    contextMutation.mutate();
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      aiApi.saveConfig(workspaceId, {
        provider,
        model,
        apiKey,
        baseUrl: provider === "openai-compatible" ? baseUrl || null : null,
        maxTokenBudget: maxTokenBudget ? Number(maxTokenBudget) : null,
        usageResetInterval,
      }),
    onSuccess: () => {
      setApiKey("");
      setError(null);
      setMode("quick");
      setQuickInitialized(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => setError("Could not save this AI configuration - check the values and try again."),
  });

  const patchMutation = useMutation({
    mutationFn: () =>
      aiApi.patchConfig(workspaceId, {
        maxTokenBudget: quickMaxTokenBudget ? Number(quickMaxTokenBudget) : null,
        usageResetInterval: quickInterval,
      }),
    onSuccess: () => {
      setQuickError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => setQuickError("Could not save - check the values and try again."),
  });

  const removeMutation = useMutation({
    mutationFn: () => aiApi.removeConfig(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  function handleQuickSubmit(event: FormEvent) {
    event.preventDefault();
    patchMutation.mutate();
  }

  const budgetPercent = config?.maxTokenBudget ? Math.min(100, Math.round((config.consumedTokens / config.maxTokenBudget) * 100)) : null;

  const fullForm: ReactNode = (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs text-ink-muted">
        {config?.configured ? "Replace the current configuration:" : "Set up an AI provider to share with everyone in this workspace:"}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProvider)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
        <TextField
          placeholder={provider === "google" ? "Model (e.g. gemini-3.5-flash-lite)" : "Model (e.g. gpt-4o, claude-sonnet-5)"}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="max-w-xs"
          list={provider === "google" ? "gemini-model-suggestions" : undefined}
          required
        />
        {provider === "google" && (
          <datalist id="gemini-model-suggestions">
            {GEMINI_MODEL_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        )}
      </div>
      {provider === "openai-compatible" && (
        <TextField
          type="url"
          placeholder="Base URL (e.g. http://localhost:11434/v1)"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
        />
      )}
      <TextField type="password" placeholder="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />

      <div className="flex flex-wrap items-center gap-2">
        <TextField
          type="number"
          min={1}
          placeholder="Max tokens per period (blank = unlimited)"
          value={maxTokenBudget}
          onChange={(e) => setMaxTokenBudget(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={usageResetInterval}
          onChange={(e) => setUsageResetInterval(e.target.value as AiUsageResetInterval)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {AI_USAGE_RESET_INTERVALS.map((interval) => (
            <option key={interval} value={interval}>
              {INTERVAL_LABELS[interval]} reset
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" variant="primary" disabled={saveMutation.isPending}>
        Save
      </Button>
    </form>
  );

  return (
    <div className="mt-3 space-y-3">
      {config?.configured && (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{PROVIDER_LABELS[config.provider!]}</p>
              <p className="text-xs text-ink-muted">
                Model: {config.model}
                {config.baseUrl ? ` · ${config.baseUrl}` : ""}
              </p>
            </div>
            <button onClick={() => removeMutation.mutate()} className="text-xs text-red-500 hover:underline">
              Remove
            </button>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>Token usage this period</span>
              <span>
                {config.consumedTokens.toLocaleString()}
                {config.maxTokenBudget != null ? ` / ${config.maxTokenBudget.toLocaleString()}` : " (unlimited)"}
              </span>
            </div>
            {budgetPercent != null && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={`h-full rounded-full ${budgetPercent >= 100 ? "bg-red-500" : "bg-accent"}`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
            )}
            {config.usageResetAt && (
              <p className="mt-1 text-xs text-ink-muted">
                Resets {INTERVAL_LABELS[config.usageResetInterval!].toLowerCase()} - next reset {new Date(config.usageResetAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {config?.configured ? (
        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="mb-3 flex gap-1 rounded-lg bg-surface-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("quick")}
              className={`flex-1 rounded-md px-2 py-1 ${mode === "quick" ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-ink-muted"}`}
            >
              Quick edit
            </button>
            <button
              type="button"
              onClick={() => setMode("replace")}
              className={`flex-1 rounded-md px-2 py-1 ${mode === "replace" ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-ink-muted"}`}
            >
              Replace configuration
            </button>
          </div>

          {mode === "quick" ? (
            <form onSubmit={handleQuickSubmit} className="space-y-2">
              <p className="text-xs text-ink-muted">Adjust the token limit and reset cadence without touching the API key:</p>
              <div className="flex flex-wrap items-center gap-2">
                <TextField
                  type="number"
                  min={1}
                  placeholder="Max tokens per period (blank = unlimited)"
                  value={quickMaxTokenBudget}
                  onChange={(e) => setQuickMaxTokenBudget(e.target.value)}
                  className="max-w-xs"
                />
                <select
                  value={quickInterval}
                  onChange={(e) => setQuickInterval(e.target.value as AiUsageResetInterval)}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                >
                  {AI_USAGE_RESET_INTERVALS.map((interval) => (
                    <option key={interval} value={interval}>
                      {INTERVAL_LABELS[interval]} reset
                    </option>
                  ))}
                </select>
              </div>
              {quickError && <p className="text-sm text-red-500">{quickError}</p>}
              <Button type="submit" variant="primary" disabled={patchMutation.isPending}>
                Save
              </Button>
            </form>
          ) : (
            fullForm
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3">{fullForm}</div>
      )}

      {config?.configured && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-ink">Agent Chat context</p>
          <p className="mt-1 text-xs text-ink-muted">Controls what the Agent Chat knows about when answering - not the AI blocks used inline on pages.</p>

          <form onSubmit={handleContextSubmit} className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-muted">Workspace purpose &amp; behavior</label>
              <textarea
                value={purposeInstructions}
                onChange={(e) => setPurposeInstructions(e.target.value)}
                placeholder='e.g. "This workspace tracks our support tickets - be terse, and always ask before archiving anything."'
                rows={3}
                maxLength={4000}
                className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-ink-muted">Added to the agent's instructions for everyone in this workspace.</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
                <label htmlFor="chat-history-limit">Chat history sent to the agent</label>
                <span>{chatHistoryLimit === 0 ? "None" : `Last ${chatHistoryLimit} messages`}</span>
              </div>
              <input
                id="chat-history-limit"
                type="range"
                min={0}
                max={AI_CHAT_HISTORY_LIMIT_MAX}
                step={5}
                value={chatHistoryLimit}
                onChange={(e) => setChatHistoryLimit(Number(e.target.value))}
                className="mt-1.5 w-full max-w-xs accent-accent"
              />
              <p className="mt-1 text-xs text-ink-muted">How much of your own past conversation the agent sees on each new message.</p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={activityFeedEnabled}
                onChange={(e) => setActivityFeedEnabled(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium text-ink">Let the agent look up recent workspace activity</span>
                <span className="block text-xs text-ink-muted">
                  Lets it answer things like "what changed recently?" by reading the activity log (objects created/updated/archived by
                  anyone in this workspace). Off by default.
                </span>
              </span>
            </label>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" disabled={contextMutation.isPending}>
                Save
              </Button>
              {contextSaved && !contextMutation.isPending && <span className="text-xs text-ink-muted">Saved.</span>}
              {contextMutation.isError && <span className="text-xs text-red-500">Could not save - try again.</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
