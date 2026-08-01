import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_PROVIDERS, type AiProvider } from "@notorious/shared";
import { aiApi } from "../lib/api/resources.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google (Gemini)",
  "openai-compatible": "OpenAI-compatible (Ollama, local models, ...)",
};

/**
 * Suggestions only, not a fixed enum - `model` stays a free-text field (see
 * SaveAiConfigInput) since Google ships new Gemini models faster than this
 * list could be kept in sync. Shown via a `<datalist>` so picking one is a
 * click, but typing any other model id future releases add still works.
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

/** Lets the current user pick and configure one AI provider profile (own API key, encrypted at rest) - powers both the Agent Chat page and, indirectly, nothing else: the MCP server authenticates separately, with a personal API key, not this. */
export function AiSettings() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["aiConfig"], queryFn: aiApi.getConfig });

  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      aiApi.saveConfig({ provider, model, apiKey, baseUrl: provider === "openai-compatible" ? baseUrl || null : null }),
    onSuccess: () => {
      setApiKey("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["aiConfig"] });
    },
    onError: () => setError("Could not save this AI configuration - check the values and try again."),
  });

  const removeMutation = useMutation({
    mutationFn: () => aiApi.removeConfig(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aiConfig"] }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  return (
    <div className="mt-3 space-y-3">
      {config?.configured && (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
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
      )}

      <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs text-ink-muted">{config?.configured ? "Replace the current configuration:" : "Set up an AI provider to use the Agent Chat:"}</p>
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
        <TextField
          type="password"
          placeholder="API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" variant="primary" disabled={saveMutation.isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}
