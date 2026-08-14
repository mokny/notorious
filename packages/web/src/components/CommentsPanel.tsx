import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import { commentApi, workspaceApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { useConfirm } from "../context/ConfirmContext.js";
import { CollapsibleSection } from "./ui/CollapsibleSection.js";
import { Button } from "./ui/Button.js";
import { Icon } from "./ui/Icon.js";
import { MentionText } from "./editor/MentionText.js";
import { MentionableEditor } from "./editor/MentionableEditor.js";
import type { SharedObjectContext } from "../pages/ObjectDetailPage.js";

const MAX_LENGTH = 4000;

interface CommentsPanelProps {
  objectId: string;
  workspaceId: string;
  share?: SharedObjectContext;
  /** Set from `?comment=` (see ObjectDetailPage.tsx) - scrolls the matching comment into view and briefly highlights it once the comment list has loaded. `undefined`/not found: no-op, no error shown (broken-link deep-link is a silent no-op by design). */
  targetCommentId?: string | null;
}

/**
 * Comments are deliberately independent of the object lock (see
 * `createCommentSchema`/`workspaces/access.ts`'s `allowWhenLocked`) - only
 * `commentsDisabled` (the owner's own kill-switch, toggled next to the lock
 * button in ObjectDetailPage.tsx) turns this off, which ObjectDetailPage.tsx
 * enforces by not rendering this component at all rather than passing the
 * flag down - a disabled object shows no comments section whatsoever, not
 * even its already-posted comments.
 * Plain text only: MentionableEditor below (a minimal TipTap instance, see
 * its own doc comment) is the entire authoring surface, no formatting
 * toolbar beyond the @mention pill it renders live - `body` is saved/
 * rendered as plain text (`white-space: pre-wrap`, via MentionText.tsx),
 * line breaks are the only other structure a comment can carry.
 */
export function CommentsPanel({ objectId, workspaceId, share, targetCommentId }: CommentsPanelProps) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: comments } = useQuery({
    queryKey: ["comments", objectId],
    queryFn: () => commentApi.list(objectId),
  });

  // Deep-link scroll-to-comment (see `targetCommentId` above) - same
  // "briefly flash, then remove" one-shot approach as BlockEditor.tsx's
  // `?block=` handling, reusing the same `.block-mention-flash` keyframe
  // (globals.css) since visually it's the same affordance on a different
  // element. Guarded on the target actually existing in the DOM, so a
  // deleted/no-longer-visible comment just silently does nothing.
  useEffect(() => {
    if (!targetCommentId || !comments) return;
    const el = document.getElementById(`comment-${targetCommentId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("block-mention-flash");
    const timer = setTimeout(() => el.classList.remove("block-mention-flash"), 2000);
    return () => clearTimeout(timer);
  }, [targetCommentId, comments]);

  // A share link's role is already known from its own token; a real member's
  // isn't carried anywhere else on this page, so it's looked up here - same
  // "each panel fetches what it needs" approach as BacklinksPanel/
  // SubObjectsPanel. Only fetched for a logged-in member (never for a share
  // visitor, who can't list workspace members anyway).
  const { data: members } = useQuery({
    queryKey: ["workspaceMembers", workspaceId],
    queryFn: () => workspaceApi.members(workspaceId),
    enabled: Boolean(workspaceId) && !share,
  });

  const myRole: WorkspaceRole | undefined = share ? share.role : members?.find((m) => m.userId === user?.id)?.role;
  const canComment = Boolean(myRole && roleAtLeast(myRole, "commenter"));
  const isModerator = Boolean(myRole && roleAtLeast(myRole, "editor"));

  const createMutation = useMutation({
    mutationFn: () => commentApi.create(objectId, { body: draft }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["comments", objectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => commentApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments", objectId] }),
  });

  async function handleDelete(id: string, isOwnComment: boolean) {
    const confirmed = await confirm({
      title: "Delete this comment?",
      description: isOwnComment
        ? "This can't be undone."
        : "This will be recorded as a moderator removal, visible to everyone who can see this thread.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (confirmed) deleteMutation.mutate(id);
  }

  const trimmed = draft.trim();
  const visible = comments ?? [];

  return (
    <CollapsibleSection title={`Comments${visible.length > 0 ? ` (${visible.length})` : ""}`} defaultExpanded>
      <div className="space-y-4">
        {visible.length === 0 && <p className="text-sm text-ink-muted">No comments yet.</p>}

        <ul className="space-y-3">
          {visible.map((comment) => {
            const isOwnComment = Boolean(user && comment.authorId === user.id);
            const canDelete = !comment.deletedAt && (isModerator || isOwnComment);
            return (
              <li id={`comment-${comment.id}`} key={comment.id} className="group rounded-md border border-border px-3 py-2">
                {comment.deletedAt ? (
                  <p className="text-xs italic text-ink-muted">
                    {comment.authorName}'s comment was deleted by {comment.deletedByName}.
                  </p>
                ) : (
                  <>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink">{comment.authorName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-ink-muted">{new Date(comment.createdAt).toLocaleString()}</span>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(comment.id, isOwnComment)}
                            title="Delete comment"
                            className="rounded p-0.5 text-ink-muted opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">
                      <MentionText text={comment.body} />
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {canComment ? (
          <div className="space-y-2">
            <MentionableEditor
              value={draft}
              onChange={setDraft}
              workspaceId={workspaceId}
              placeholder="Write a comment…"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus-within:border-accent"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">{draft.length}/{MAX_LENGTH}</span>
              <Button
                variant="primary"
                onClick={() => createMutation.mutate()}
                disabled={!trimmed || draft.length > MAX_LENGTH || createMutation.isPending}
              >
                Post
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}
