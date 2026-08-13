import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@notorious/shared";
import { webhookApi } from "../lib/api/resources.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/TextField.js";
import { Icon } from "./ui/Icon.js";

const EVENT_LABEL_KEYS: Record<WebhookEvent, string> = {
  "object.created": "created",
  "object.updated": "updated",
  "object.archived": "archived",
  "object.restored": "restored",
  "object.deleted": "deleted",
};

/** Lets a workspace owner manage outbound HTTP notifications for object changes - see docs/API.md for the payload shape and signature header. */
export function WebhooksSettings({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);

  const queryKey = ["webhooks", workspaceId];
  const { data: hooks } = useQuery({ queryKey, queryFn: () => webhookApi.list(workspaceId) });

  const createMutation = useMutation({
    mutationFn: () => webhookApi.create(workspaceId, { url, events }),
    onSuccess: (created) => {
      setFreshSecret(created.secret);
      setUrl("");
      setEvents([...WEBHOOK_EVENTS]);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => webhookApi.update(workspaceId, id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => webhookApi.remove(workspaceId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhookApi.test(workspaceId, id),
    onSuccess: (_data, id) => {
      setTestResult({ id, ok: true });
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (_err, id) => setTestResult({ id, ok: false }),
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (events.length === 0) return;
    createMutation.mutate();
  }

  function toggleEvent(value: WebhookEvent) {
    setEvents((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));
  }

  return (
    <div className="mt-3 space-y-3">
      {freshSecret && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-3">
          <p className="text-xs font-medium text-accent">
            {t("settings.workspace.webhooks.secretWarningPrefix")}
            <code className="mx-1 rounded bg-surface px-1 py-0.5">X-Notorious-Signature</code>
            {t("settings.workspace.webhooks.secretWarningSuffix")}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-surface px-2 py-1 text-xs">{freshSecret}</code>
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(freshSecret)}>
              {t("settings.workspace.webhooks.copy")}
            </Button>
            <Button variant="ghost" onClick={() => setFreshSecret(null)}>
              {t("settings.workspace.webhooks.dismiss")}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {hooks?.map((hook) => (
          <div key={hook.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <code className="block truncate text-sm">{hook.url}</code>
                <p className="mt-1 text-xs capitalize text-ink-muted">
                  {hook.events.map((e) => t(`settings.workspace.webhooks.event.${EVENT_LABEL_KEYS[e]}`)).join(", ")}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {hook.lastTriggeredAt ? (
                    <span className={hook.lastStatus === "failure" ? "text-red-500" : "text-emerald-500"}>
                      {t("settings.workspace.webhooks.lastDelivery", {
                        time: new Date(hook.lastTriggeredAt).toLocaleString(),
                        status: hook.lastStatus,
                      })}
                      {hook.lastError ? ` (${hook.lastError})` : ""}
                    </span>
                  ) : (
                    t("settings.workspace.webhooks.neverTriggered")
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => testMutation.mutate(hook.id)}
                  disabled={testMutation.isPending}
                  title={t("settings.workspace.webhooks.sendTestDelivery")}
                  className="rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-50"
                >
                  <Icon name="play" className="h-3.5 w-3.5" />
                </button>
                <label className="flex items-center gap-1 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={hook.enabled}
                    onChange={(e) => toggleEnabledMutation.mutate({ id: hook.id, enabled: e.target.checked })}
                  />
                  {t("settings.workspace.webhooks.enabled")}
                </label>
                <button
                  onClick={() => removeMutation.mutate(hook.id)}
                  title={t("settings.workspace.webhooks.deleteWebhook")}
                  className="rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {testResult?.id === hook.id && (
              <p className={`mt-1 text-xs ${testResult.ok ? "text-emerald-500" : "text-red-500"}`}>
                {testResult.ok ? t("settings.workspace.webhooks.testSent") : t("settings.workspace.webhooks.testFailed")}
              </p>
            )}
          </div>
        ))}
        {hooks?.length === 0 && <p className="text-sm text-ink-muted">{t("settings.workspace.webhooks.noWebhooks")}</p>}
      </div>

      <form onSubmit={handleCreate} className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <TextField
          type="url"
          placeholder="https://example.com/webhooks/notorious"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <div className="flex flex-wrap gap-3">
          {WEBHOOK_EVENTS.map((value) => (
            <label key={value} className="flex items-center gap-1.5 text-xs text-ink-muted">
              <input type="checkbox" checked={events.includes(value)} onChange={() => toggleEvent(value)} />
              {t(`settings.workspace.webhooks.event.${EVENT_LABEL_KEYS[value]}`)}
            </label>
          ))}
        </div>
        <Button type="submit" variant="primary" disabled={createMutation.isPending || events.length === 0}>
          <Icon name="plus" className="h-3.5 w-3.5" /> {t("settings.workspace.webhooks.addWebhook")}
        </Button>
      </form>
    </div>
  );
}
