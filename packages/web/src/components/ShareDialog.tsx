import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateShareLinkInput } from "@notorious/shared";
import { shareLinkApi } from "../lib/api/resources.js";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { Button } from "./ui/Button.js";
import { Modal } from "./ui/Modal.js";
import { Icon } from "./ui/Icon.js";

type ShareRole = CreateShareLinkInput["role"];

const ROLES: ShareRole[] = ["viewer", "commenter", "editor"];

const EXPIRY_PRESETS: { label: string; ms: number | null }[] = [
  { label: "Never", ms: null },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

interface ShareDialogProps {
  workspaceId: string;
  /** null shares the whole workspace; an object id scopes the share to just that object. */
  objectId: string | null;
  label: string;
  /**
   * "menuItem" renders the trigger as a full-width iOS-context-menu-style row (icon right, ~44px tap target)
   * for embedding inside MobileTopBar.tsx's "…" menu (see IOSMenu.tsx). "controlled" renders no trigger of its
   * own at all - just the Modal, opened/closed via the `open`/`onOpenChange` props below - for a "Share..." row
   * in some other already-open menu (see the sidebar's ContextMenu) that needs to open this dialog itself
   * without also showing ShareDialog's own button. The popover/modal content itself is unchanged across variants.
   * Defaults to the compact toolbar-icon trigger used everywhere else.
   */
  variant?: "toolbar" | "menuItem" | "controlled";
  /** Only meaningful with variant="controlled" - otherwise this manages its own open state internally. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

/**
 * `navigator.clipboard` only exists in secure contexts (HTTPS, or localhost) -
 * on a bare-metal deployment reached over plain HTTP/a LAN IP it's simply
 * undefined, so calling it directly throws before anything is copied. Falls
 * back to the old `execCommand("copy")` trick (works anywhere, deprecated but
 * still supported everywhere) whenever the modern API isn't available.
 */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy fallback below
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }
  document.body.removeChild(textarea);
  return succeeded;
}

/** Popover for creating/listing/revoking public share links - reused for both whole-workspace shares (Settings) and single-object shares (ObjectDetailPage). */
export function ShareDialog({ workspaceId, objectId, label, variant = "toolbar", open: openProp, onOpenChange }: ShareDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [role, setRole] = useState<ShareRole>("viewer");
  const [expiryMs, setExpiryMs] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<{ linkId: string; ok: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  useClickOutside(containerRef, () => setOpen(false), open);

  const queryKey = ["shareLinks", workspaceId, objectId];
  const { data: links } = useQuery({
    queryKey,
    queryFn: () => shareLinkApi.list(workspaceId, objectId),
    enabled: open,
  });

  // Only meaningful for a single-object share - a whole-workspace share
  // already grants access to everything, so there's nothing extra to warn
  // about (see access.ts's requireAccess).
  const { data: linkedObjects } = useQuery({
    queryKey: ["shareLinkedPreview", workspaceId, objectId],
    queryFn: () => shareLinkApi.linkedPreview(workspaceId, objectId!),
    enabled: open && objectId !== null,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      shareLinkApi.create(workspaceId, {
        objectId,
        role,
        expiresAt: expiryMs ? new Date(Date.now() + expiryMs).toISOString() : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => shareLinkApi.revoke(workspaceId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  async function handleCopy(linkId: string, token: string) {
    const ok = await copyText(shareUrl(token));
    setCopyState({ linkId, ok });
    setTimeout(() => setCopyState((current) => (current?.linkId === linkId ? null : current)), 2000);
  }

  const body = (
    <>
      <p className="mb-3 text-xs text-ink-muted">
        Anyone with the link can access {objectId ? "this object" : "this workspace"} without an account, at the role you
        choose below.
      </p>

      {objectId && linkedObjects && linkedObjects.length > 0 && (
        <details className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          <summary className="cursor-pointer font-medium">
            This link also grants access to {linkedObjects.length} linked object{linkedObjects.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1.5 space-y-0.5 pl-0.5">
            {linkedObjects.map((linked) => (
              <li key={linked.id} className="truncate text-ink-muted">
                {linked.icon ? `${linked.icon} ` : ""}
                {linked.title}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="max-h-56 space-y-2 overflow-y-auto">
        {links?.map((link) => (
          <div key={link.id} className="rounded-md border border-border p-2">
            <div className="flex items-center justify-between gap-1">
              <code className="min-w-0 flex-1 truncate text-xs">{shareUrl(link.token)}</code>
              {copyState?.linkId === link.id ? (
                <span className={`shrink-0 px-1 text-[11px] ${copyState.ok ? "text-green-600" : "text-red-500"}`}>
                  {copyState.ok ? "Copied!" : "Copy failed"}
                </span>
              ) : (
                <button
                  onClick={() => void handleCopy(link.id, link.token)}
                  title="Copy link"
                  className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface hover:text-ink"
                >
                  <Icon name="copy" className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => revokeMutation.mutate(link.id)}
                title="Revoke this link"
                className="shrink-0 rounded p-1 text-ink-muted hover:bg-red-500/10 hover:text-red-500"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[11px] capitalize text-ink-muted">
              {link.role}
              {link.expiresAt ? ` · expires ${new Date(link.expiresAt).toLocaleString()}` : " · never expires"}
            </p>
          </div>
        ))}
        {links?.length === 0 && <p className="text-xs text-ink-muted">No active share links yet.</p>}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ShareRole)}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs capitalize"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={expiryMs ?? ""}
          onChange={(e) => setExpiryMs(e.target.value ? Number(e.target.value) : null)}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs"
        >
          {EXPIRY_PRESETS.map((preset) => (
            <option key={preset.label} value={preset.ms ?? ""}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        variant="primary"
        className="mt-2 w-full justify-center"
        disabled={createMutation.isPending}
        onClick={() => createMutation.mutate()}
      >
        <Icon name="plus" className="h-3.5 w-3.5" /> Create link
      </Button>
    </>
  );

  const title = objectId ? "Share this object" : "Share this workspace";

  // `variant="menuItem"`: this popover used to be a plain `absolute` div,
  // same as the toolbar variant below - fine on desktop/tablet, but nested
  // inside MobileTopBar.tsx's "…" menu (a small, `overflow-hidden` panel)
  // it got visually clipped/squeezed into that panel's own bounds instead
  // of floating freely. A portaled Modal sidesteps that entirely - it's not
  // a descendant of the menu in the rendered DOM at all.
  if (variant === "controlled") {
    return (
      <Modal open={open} onOpenChange={setOpen} title={title}>
        {body}
      </Modal>
    );
  }

  if (variant === "menuItem") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[15px] text-ink active:bg-surface"
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <Icon name="share" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
        </button>
        <Modal open={open} onOpenChange={setOpen} title={title}>
          {body}
        </Modal>
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={label}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink"
      >
        <Icon name="share" className="h-3.5 w-3.5" /> {label}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-lg border border-border bg-surface-raised p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</p>
          {body}
        </div>
      )}
    </div>
  );
}
