import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_PROVIDERS, AI_USAGE_RESET_INTERVALS, type AiProvider, type AiUsageResetInterval } from "@notorious/shared";
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

  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [maxTokenBudget, setMaxTokenBudget] = useState("");
  const [usageResetInterval, setUsageResetInterval] = useState<AiUsageResetInterval>("monthly");
  const [error, setError] = useState<string | null>(null);

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
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => setError("Could not save this AI configuration - check the values and try again."),
  });

  const removeMutation = useMutation({
    mutationFn: () => aiApi.removeConfig(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  const budgetPercent = config?.maxTokenBudget ? Math.min(100, Math.round((config.consumedTokens / config.maxTokenBudget) * 100)) : null;

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

      <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-dashed border-border p-3">
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
    </div>
  );
}
