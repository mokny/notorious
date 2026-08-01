import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_PROVIDERS, type AiProvider } from "@notorious/shared";
import { aiApi } from "../lib/api/resources.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI-compatible (Ollama, local models, ...)",
};

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
            placeholder="Model (e.g. gpt-4o, claude-sonnet-5)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-xs"
            required
          />
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
