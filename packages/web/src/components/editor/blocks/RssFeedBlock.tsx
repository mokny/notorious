import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import type { DiscoveredFeed, FeedBadgeColor, FeedIntervalMinutes, FeedSource, RssFeedContent, UpdateFeedSourceInput } from "@notorious/shared";
import { FEED_BADGE_COLORS } from "@notorious/shared";
import { feedApi } from "../../../lib/api/resources.js";
import { ApiError } from "../../../lib/api/client.js";
import { Icon } from "../../ui/Icon.js";
import { Button } from "../../ui/Button.js";

function intervalOptions(t: TFunction): { value: FeedIntervalMinutes; label: string }[] {
  return [
    { value: 5, label: t("editor.blocks.rssFeed.interval5") },
    { value: 15, label: t("editor.blocks.rssFeed.interval15") },
    { value: 30, label: t("editor.blocks.rssFeed.interval30") },
    { value: 60, label: t("editor.blocks.rssFeed.interval60") },
    { value: 360, label: t("editor.blocks.rssFeed.interval360") },
    { value: 720, label: t("editor.blocks.rssFeed.interval720") },
    { value: 1440, label: t("editor.blocks.rssFeed.interval1440") },
  ];
}

const MAX_ITEMS_OPTIONS: RssFeedContent["maxItemsShown"][] = [5, 10, 20, 50];

const REFRESH_COOLDOWN_MS = 30_000;

/** Same {bg, text} pill palette shape as CalendarBlock.tsx's `PALETTE`, keyed by FEED_BADGE_COLORS instead of hashed - a user's explicit choice picks a key directly; "auto" (no choice) still hashes to one of these same entries via `colorFor`. */
const BADGE_PALETTE: Record<FeedBadgeColor, { bg: string; text: string; dot: string }> = {
  blue: { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-600", dot: "bg-purple-500" },
  pink: { bg: "bg-pink-500/10", text: "text-pink-600", dot: "bg-pink-500" },
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-600", dot: "bg-cyan-500" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-600", dot: "bg-orange-500" },
  teal: { bg: "bg-teal-500/10", text: "text-teal-600", dot: "bg-teal-500" },
};

/** Deterministic per-feed fallback when no color was explicitly chosen ("auto") - looks random to the user, stable across renders, no server-side randomness/column needed. Same hash approach as CalendarBlock.tsx's `colorFor`. */
function colorFor(feedSourceId: string): FeedBadgeColor {
  let sum = 0;
  for (let i = 0; i < feedSourceId.length; i++) sum += feedSourceId.charCodeAt(i);
  return FEED_BADGE_COLORS[sum % FEED_BADGE_COLORS.length]!;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** "2 hours ago"-style relative time, same thresholds as SecuritySettings.tsx's `relativeTime` - items are pruned past 3 days (see modules/feeds/service.ts's MAX_ITEM_AGE_MS) so this never needs to fall back to an absolute date. The full date/time is still available via the caller's `title` tooltip. */
function relativeTime(iso: string, t: TFunction): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return t("editor.blocks.rssFeed.justNow");
  if (minutes < 60) return t("editor.blocks.rssFeed.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("editor.blocks.rssFeed.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return t("editor.blocks.rssFeed.daysAgo", { count: days });
}

/** One row in the config dialog's feed list - rename, interval, error indicator, remove. */
function FeedSourceRow({ source, blockId }: { source: FeedSource; blockId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(source.displayName ?? source.resolvedTitle ?? "");

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["feedSources", blockId] });
    void queryClient.invalidateQueries({ queryKey: ["feedItems", blockId] });
  }

  const updateMutation = useMutation({
    mutationFn: (input: UpdateFeedSourceInput) => feedApi.updateSource(source.id, input),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: () => feedApi.removeSource(source.id),
    onSuccess: invalidate,
  });

  const label = source.displayName || source.resolvedTitle || source.url;

  function commitRename(): void {
    setRenaming(false);
    const trimmed = renameValue.trim();
    updateMutation.mutate({ displayName: trimmed || null });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          title={t("editor.blocks.rssFeed.autoColor")}
          onClick={() => updateMutation.mutate({ badgeColor: null })}
          className={`h-3 w-3 shrink-0 rounded-full border border-dashed ${source.badgeColor ? "border-ink-muted" : "border-accent"}`}
        />
        {FEED_BADGE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() => updateMutation.mutate({ badgeColor: color })}
            className={`h-3 w-3 shrink-0 rounded-full ${BADGE_PALETTE[color].dot} ${source.badgeColor === color ? "ring-2 ring-offset-1 ring-ink-muted" : ""}`}
          />
        ))}
      </div>
      {source.lastError && (
        <span className="shrink-0 text-amber-500" title={source.lastError}>
          <Icon name="alert-triangle" className="h-3.5 w-3.5" />
        </span>
      )}
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-0.5 text-sm outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm" title={source.url}>
          {label}
        </span>
      )}
      {!renaming && (
        <button
          type="button"
          title={t("editor.blocks.rssFeed.rename")}
          onClick={() => {
            setRenameValue(source.displayName ?? source.resolvedTitle ?? "");
            setRenaming(true);
          }}
          className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <Icon name="pencil" className="h-3.5 w-3.5" />
        </button>
      )}
      <select
        value={source.intervalMinutes}
        onChange={(e) => updateMutation.mutate({ intervalMinutes: Number(e.target.value) as FeedIntervalMinutes })}
        className="shrink-0 rounded border border-border bg-surface px-1.5 py-1 text-xs"
      >
        {intervalOptions(t).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        title={t("editor.blocks.rssFeed.removeFeed")}
        onClick={() => removeMutation.mutate()}
        className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface-raised hover:text-red-500"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** "+ Add feed" row - discovers candidate feeds at the entered URL, auto-picking the only result or presenting a list to choose from. */
function AddFeedRow({ blockId }: { blockId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [interval, setInterval] = useState<FeedIntervalMinutes>(60);
  const [candidates, setCandidates] = useState<DiscoveredFeed[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["feedSources", blockId] });
    void queryClient.invalidateQueries({ queryKey: ["feedItems", blockId] });
  }

  const addMutation = useMutation({
    mutationFn: (feedUrl: string) => feedApi.createSource(blockId, { url: feedUrl, intervalMinutes: interval }),
    onSuccess: () => {
      setUrl("");
      setCandidates(null);
      setError(null);
      invalidate();
    },
    onError: (err: unknown) => setError(errorMessage(err, t("editor.blocks.rssFeed.addFailed"))),
  });

  const discoverMutation = useMutation({
    mutationFn: () => feedApi.discover(blockId, url.trim()),
    onSuccess: (result) => {
      setError(null);
      if (result.discovered.length === 0) {
        setError(t("editor.blocks.rssFeed.noFeedFound"));
      } else if (result.discovered.length === 1) {
        void addMutation.mutate(result.discovered[0]!.url);
      } else {
        setCandidates(result.discovered);
      }
    },
    onError: (err: unknown) => setError(errorMessage(err, t("editor.blocks.rssFeed.discoverFailed"))),
  });

  const isBusy = discoverMutation.isPending || addMutation.isPending;

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-2">
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("editor.blocks.rssFeed.feedUrlPlaceholder")}
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() && !isBusy) discoverMutation.mutate();
          }}
        />
        <select
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value) as FeedIntervalMinutes)}
          className="shrink-0 rounded border border-border bg-surface px-1.5 py-1 text-xs"
        >
          {intervalOptions(t).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" disabled={!url.trim() || isBusy} onClick={() => discoverMutation.mutate()}>
          {t("editor.blocks.rssFeed.addFeed")}
        </Button>
      </div>
      {candidates && candidates.length > 1 && (
        <div className="space-y-1 rounded border border-border bg-surface p-2">
          <p className="text-xs text-ink-muted">{t("editor.blocks.rssFeed.multipleFeedsFound")}</p>
          {candidates.map((c) => (
            <label key={c.url} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="feed-candidate" onChange={() => addMutation.mutate(c.url)} disabled={isBusy} />
              <span className="truncate">{c.title || c.url}</span>
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function RssFeedConfigDialog({
  blockId,
  content,
  onSave,
  sources,
  open,
  onOpenChange,
}: {
  blockId: string;
  content: RssFeedContent;
  onSave: (content: RssFeedContent) => Promise<void>;
  sources: FeedSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-raised p-5 shadow-lg outline-none">
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title className="text-base font-semibold">{t("editor.blocks.rssFeed.title")}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
              <Icon name="close" className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            {t("editor.blocks.rssFeed.subscribeDescription")}
          </Dialog.Description>

          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {sources.length === 0 && <p className="text-sm text-ink-muted">{t("editor.blocks.rssFeed.noFeedsYet")}</p>}
            {sources.map((source) => (
              <FeedSourceRow key={source.id} source={source} blockId={blockId} />
            ))}
          </div>

          {sources.length < 10 && (
            <div className="mt-3">
              <AddFeedRow blockId={blockId} />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">{t("editor.blocks.rssFeed.show")}</span>
              <select
                value={content.maxItemsShown}
                onChange={(e) => void onSave({ ...content, maxItemsShown: Number(e.target.value) as RssFeedContent["maxItemsShown"] })}
                className="rounded border border-border bg-surface px-1.5 py-1 text-sm"
              >
                {MAX_ITEMS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {t("editor.blocks.rssFeed.itemsCount", { count: n })}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>
              {t("editor.blocks.rssFeed.done")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RssFeedBlock({
  blockId,
  content,
  onSave,
}: {
  blockId: string;
  content: RssFeedContent;
  onSave: (content: RssFeedContent) => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const hasAutoOpenedRef = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  const maxItemsShown = content.maxItemsShown ?? 10;

  const sourcesQuery = useQuery({ queryKey: ["feedSources", blockId], queryFn: () => feedApi.listSources(blockId) });
  const sources = sourcesQuery.data ?? [];

  const itemsQuery = useQuery({
    queryKey: ["feedItems", blockId, maxItemsShown],
    queryFn: () => feedApi.items(blockId, maxItemsShown),
    enabled: sources.length > 0,
  });
  const items = itemsQuery.data ?? [];

  // On insert - before any feeds exist for this block - the config dialog
  // opens immediately, same "gated first-run" idea as CalendarBlock.tsx's
  // own unconfigured state, just via a modal since a feed list (unlike a
  // calendar's object-type config) needs form inputs to add the first one.
  useEffect(() => {
    if (!sourcesQuery.isSuccess || hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;
    if (sources.length === 0) setDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesQuery.isSuccess]);

  useEffect(() => {
    if (!cooldownUntil) return;
    const timeout = setTimeout(() => forceTick((n) => n + 1), Math.max(0, cooldownUntil - Date.now()) + 50);
    return () => clearTimeout(timeout);
  }, [cooldownUntil]);

  const cooldownActive = cooldownUntil !== null && Date.now() < cooldownUntil;

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(sources.map((s) => feedApi.refreshSource(s.id).catch(() => null)));
    },
    onSuccess: () => {
      setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
      void queryClient.invalidateQueries({ queryKey: ["feedSources", blockId] });
      void queryClient.invalidateQueries({ queryKey: ["feedItems", blockId] });
    },
  });

  return (
    <div className="group/rss rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Icon name="rss" className="h-3.5 w-3.5 text-accent" />
        <span className="text-xs font-medium text-ink-muted">{t("editor.blocks.rssFeed.headerLabel")}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title={t("editor.blocks.rssFeed.refresh")}
            data-lock-exempt
            disabled={refreshMutation.isPending || cooldownActive || sources.length === 0}
            onClick={() => refreshMutation.mutate()}
            className="rounded p-1 text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40"
          >
            <Icon name="refresh" className={`h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            title={t("editor.blocks.rssFeed.manageFeeds")}
            onClick={() => setDialogOpen(true)}
            className="rounded p-1 text-ink-muted opacity-0 hover:bg-surface-raised hover:text-ink group-hover/rss:opacity-100"
          >
            <Icon name="settings" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="p-3 text-sm text-ink-muted">
          {t("editor.blocks.rssFeed.noFeedsConfigured")}{" "}
          <button type="button" className="text-accent hover:underline" onClick={() => setDialogOpen(true)}>
            {t("editor.blocks.rssFeed.addAFeed")}
          </button>
          .
        </div>
      ) : items.length === 0 ? (
        <div className="p-3 text-sm text-ink-muted">{t("editor.blocks.rssFeed.noItemsYet")}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 p-3">
              {item.imageUrl ? (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <img src={item.imageUrl} alt="" className="h-14 w-14 rounded object-cover" />
                </a>
              ) : (
                item.sourceFaviconUrl && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-gray-700"
                  >
                    <img src={item.sourceFaviconUrl} alt="" className="h-6 w-6" />
                  </a>
                )
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  {(() => {
                    const palette = BADGE_PALETTE[item.sourceBadgeColor ?? colorFor(item.feedSourceId)];
                    return <span className={`truncate rounded-full px-1.5 py-0.5 ${palette.bg} ${palette.text}`}>{item.sourceLabel}</span>;
                  })()}
                  {item.publishedAt && (
                    <span className="shrink-0" title={new Date(item.publishedAt).toLocaleString()}>
                      {relativeTime(item.publishedAt, t)}
                    </span>
                  )}
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-ink hover:text-accent hover:underline"
                >
                  {item.title}
                </a>
                {item.descriptionText && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{item.descriptionText}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <RssFeedConfigDialog blockId={blockId} content={content} onSave={onSave} sources={sources} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
