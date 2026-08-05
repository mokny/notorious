import { useState } from "react";
import { usePresence } from "../hooks/usePresence.js";

/**
 * Who's currently viewing this object - see hooks/usePresence.ts for the
 * heartbeat/live-update mechanics. Real members reuse the exact avatar
 * style already established elsewhere (WorkspaceLayout.tsx's own sidebar
 * avatar: solid `avatarColor` circle + initial) - anonymous visitors get a
 * deliberately different, dashed/muted circle instead, so their identity
 * stays visually distinguishable from a real account even if they've
 * renamed themselves to something that could otherwise read as one (the
 * "Anonymous " text prefix alone isn't a strong enough guarantee of that on
 * its own - see the rename handling below, which only ever lets a viewer
 * edit the word *after* that prefix, never remove it).
 */
export function PresencePanel({ objectId }: { objectId: string }) {
  const { viewers, self, rename, currentWord } = usePresence(objectId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentWord);

  if (viewers.length === 0) return null;

  function submitRename() {
    setEditing(false);
    if (draft.trim()) rename(draft);
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Viewing now</h3>
      <div className="flex flex-wrap items-center gap-2">
        {viewers.map((viewer) => {
          const isSelf = self?.viewerId === viewer.viewerId;
          if (isSelf && viewer.isAnonymous && editing) {
            return (
              <input
                key={viewer.viewerId}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={submitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitRename();
                  else if (event.key === "Escape") setEditing(false);
                }}
                placeholder="Your name"
                maxLength={30}
                className="h-7 w-28 rounded-full border-2 border-dashed border-accent bg-surface px-2 text-xs outline-none"
              />
            );
          }

          const clickToRename = isSelf && viewer.isAnonymous;
          const hasAvatarImage = !viewer.isAnonymous && !!viewer.avatarUrl;
          return (
            <button
              key={viewer.viewerId}
              type="button"
              title={clickToRename ? `${viewer.displayName} (click to rename)` : viewer.displayName}
              disabled={!clickToRename}
              onClick={() => {
                setDraft(currentWord);
                setEditing(true);
              }}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                hasAvatarImage ? "overflow-hidden" : viewer.isAnonymous ? "border-2 border-dashed border-border bg-surface-raised text-ink-muted" : "text-white"
              } ${clickToRename ? "cursor-pointer hover:ring-2 hover:ring-accent/40" : "cursor-default"}`}
              style={hasAvatarImage || viewer.isAnonymous ? undefined : { backgroundColor: viewer.avatarColor }}
            >
              {hasAvatarImage ? <img src={viewer.avatarUrl!} alt="" className="h-full w-full object-cover" /> : viewer.avatarLetter}
            </button>
          );
        })}
      </div>
    </div>
  );
}
