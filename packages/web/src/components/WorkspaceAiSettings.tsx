import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AI_PROVIDERS, AI_USAGE_RESET_INTERVALS, AI_CHAT_HISTORY_LIMIT_MAX, type AiProvider, type AiUsageResetInterval } from "@notorious/shared";
import { aiApi } from "../lib/api/resources.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";

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
  const { t } = useTranslation();
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
    onError: () => setError(t("settings.workspace.ai.saveConfigError")),
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
    onError: () => setQuickError(t("settings.workspace.ai.quickSaveError")),
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
        {config?.configured ? t("settings.workspace.ai.replaceCurrentConfig") : t("settings.workspace.ai.setupProvider")}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProvider)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {t(`settings.workspace.ai.provider.${p}`)}
            </option>
          ))}
        </select>
        <TextField
          placeholder={provider === "google" ? t("settings.workspace.ai.modelPlaceholderGoogle") : t("settings.workspace.ai.modelPlaceholderDefault")}
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
          placeholder={t("settings.workspace.ai.baseUrlPlaceholder")}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
        />
      )}
      <TextField
        type="password"
        placeholder={t("settings.workspace.ai.apiKeyPlaceholder")}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        required
      />

      <div className="flex flex-wrap items-center gap-2">
        <TextField
          type="number"
          min={1}
          placeholder={t("settings.workspace.ai.maxTokensPlaceholder")}
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
              {t("settings.workspace.ai.resetOption", { interval: t(`settings.workspace.ai.interval.${interval}`) })}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" variant="primary" disabled={saveMutation.isPending}>
        {t("settings.workspace.ai.save")}
      </Button>
    </form>
  );

  return (
    <div className="mt-3 space-y-3">
      {config?.configured && (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t(`settings.workspace.ai.provider.${config.provider!}`)}</p>
              <p className="text-xs text-ink-muted">
                {t("settings.workspace.ai.modelLabel", { model: config.model })}
                {config.baseUrl ? ` · ${config.baseUrl}` : ""}
              </p>
            </div>
            <button onClick={() => removeMutation.mutate()} className="text-xs text-red-500 hover:underline">
              {t("settings.workspace.ai.remove")}
            </button>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>{t("settings.workspace.ai.tokenUsagePeriod")}</span>
              <span>
                {config.consumedTokens.toLocaleString()}
                {config.maxTokenBudget != null ? ` / ${config.maxTokenBudget.toLocaleString()}` : ` ${t("settings.workspace.ai.unlimited")}`}
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
                {t("settings.workspace.ai.resetsAt", {
                  interval: t(`settings.workspace.ai.interval.${config.usageResetInterval!}`).toLowerCase(),
                  date: new Date(config.usageResetAt).toLocaleString(),
                })}
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
              {t("settings.workspace.ai.quickEdit")}
            </button>
            <button
              type="button"
              onClick={() => setMode("replace")}
              className={`flex-1 rounded-md px-2 py-1 ${mode === "replace" ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-ink-muted"}`}
            >
              {t("settings.workspace.ai.replaceConfig")}
            </button>
          </div>

          {mode === "quick" ? (
            <form onSubmit={handleQuickSubmit} className="space-y-2">
              <p className="text-xs text-ink-muted">{t("settings.workspace.ai.adjustTokenLimit")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <TextField
                  type="number"
                  min={1}
                  placeholder={t("settings.workspace.ai.maxTokensPlaceholder")}
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
                      {t("settings.workspace.ai.resetOption", { interval: t(`settings.workspace.ai.interval.${interval}`) })}
                    </option>
                  ))}
                </select>
              </div>
              {quickError && <p className="text-sm text-red-500">{quickError}</p>}
              <Button type="submit" variant="primary" disabled={patchMutation.isPending}>
                {t("settings.workspace.ai.save")}
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
          <p className="text-sm font-medium text-ink">{t("settings.workspace.ai.agentChatContext")}</p>
          <p className="mt-1 text-xs text-ink-muted">{t("settings.workspace.ai.agentChatContextDescription")}</p>

          <form onSubmit={handleContextSubmit} className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-muted">{t("settings.workspace.ai.purposeLabel")}</label>
              <textarea
                value={purposeInstructions}
                onChange={(e) => setPurposeInstructions(e.target.value)}
                placeholder={t("settings.workspace.ai.purposePlaceholder")}
                rows={3}
                maxLength={4000}
                className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-ink-muted">{t("settings.workspace.ai.purposeHelp")}</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
                <label htmlFor="chat-history-limit">{t("settings.workspace.ai.chatHistoryLabel")}</label>
                <span>
                  {chatHistoryLimit === 0
                    ? t("settings.workspace.ai.chatHistoryNone")
                    : t("settings.workspace.ai.chatHistoryLast", { count: chatHistoryLimit })}
                </span>
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
              <p className="mt-1 text-xs text-ink-muted">{t("settings.workspace.ai.chatHistoryHelp")}</p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={activityFeedEnabled}
                onChange={(e) => setActivityFeedEnabled(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium text-ink">{t("settings.workspace.ai.activityFeedLabel")}</span>
                <span className="block text-xs text-ink-muted">{t("settings.workspace.ai.activityFeedDescription")}</span>
              </span>
            </label>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" disabled={contextMutation.isPending}>
                {t("settings.workspace.ai.save")}
              </Button>
              {contextSaved && !contextMutation.isPending && <span className="text-xs text-ink-muted">{t("settings.workspace.ai.saved")}</span>}
              {contextMutation.isError && (
                <span className="text-xs text-red-500">{t("settings.workspace.ai.contextSaveError")}</span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
