import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { shareLinkApi } from "../lib/api/resources.js";
import { Icon } from "./ui/Icon.js";

function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

/**
 * Every active public share in the workspace at once - whole-workspace links
 * (created via ShareDialog.tsx below) and every individual object's own
 * share links (created from that object's own page, otherwise invisible from
 * here) - so an owner can audit and revoke *any* of them from one place
 * without having to open each object separately.
 */
export function ActiveShareLinksList({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["shareLinks", workspaceId, "all"];
  const { data: links } = useQuery({ queryKey, queryFn: () => shareLinkApi.listAll(workspaceId) });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => shareLinkApi.revoke(workspaceId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      // The per-object/per-workspace ShareDialog popovers cache their own
      // narrower list under a different key (see ShareDialog.tsx) - without
      // this they'd keep showing a link this list just revoked.
      void queryClient.invalidateQueries({ queryKey: ["shareLinks", workspaceId] });
    },
  });

  if (!links) return null;

  if (links.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">No active share links right now.</p>;
  }

  return (
    <div className="mt-4 space-y-2">
      {links.map((link) => (
        <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Icon name={link.objectId ? "file-text" : "layers"} className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              {link.objectId ? (
                <Link to={`/w/${workspaceId}/objects/${link.objectId}`} className="truncate hover:underline">
                  {link.objectTitle}
                </Link>
              ) : (
                <span className="truncate">Whole workspace</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              <code className="text-[11px]">{shareUrl(link.token)}</code>
            </p>
            <p className="mt-0.5 text-[11px] capitalize text-ink-muted">
              {link.role}
              {link.expiresAt ? ` · expires ${new Date(link.expiresAt).toLocaleString()}` : " · never expires"}
            </p>
          </div>
          <button
            onClick={() => revokeMutation.mutate(link.id)}
            disabled={revokeMutation.isPending}
            title="End this link's sharing"
            className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
