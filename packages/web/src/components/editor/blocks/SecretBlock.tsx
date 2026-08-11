import { useRef, useState } from "react";
import type { SecretContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { useBlockEditor } from "../BlockEditorContext.js";
import { Icon } from "../../ui/Icon.js";

/** Fixed-length mask regardless of `text.length` - deliberately doesn't reveal the secret's actual length. */
const MASK = "••••••••";

/**
 * Same clipboard-with-fallback helper duplicated in ShareDialog.tsx,
 * WebhooksSettings.tsx, BackupSettings.tsx and BookmarkletSettings.tsx -
 * there's no shared clipboard util in this codebase, so this follows that
 * existing pattern rather than introducing a new one for a single caller.
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

export function SecretBlock({
  content: externalContent,
  onSave,
}: {
  content: SecretContent;
  onSave: (c: SecretContent) => Promise<void>;
}) {
  const { readOnly } = useBlockEditor();
  const [content, save, flushSave] = useDebouncedSave(externalContent, onSave);
  const [editing, setEditing] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy() {
    if (!content.text) return;
    const ok = await copyText(content.text);
    setCopyState(ok ? "copied" : "failed");
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyState(null), 2000);
  }

  return (
    <div className="group/block flex items-center gap-2 rounded-lg border border-border p-3">
      <Icon name="lock" className="h-4 w-4 shrink-0 text-ink-muted" />
      {editing ? (
        <input
          type="text"
          value={content.text}
          autoFocus
          onChange={(e) => save({ ...content, text: e.target.value })}
          onBlur={() => {
            flushSave();
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Secret text"
          autoComplete="off"
          className="flex-1 border-none bg-transparent text-sm outline-none"
        />
      ) : (
        <button
          type="button"
          // Copying doesn't mutate content, just reveals it via the clipboard -
          // stays reachable while the object is locked, same as the "view, not
          // edit" download button in MediaBlocks.tsx (see READ_ONLY_CONTENT_CLASS's
          // own doc comment).
          data-view-toggle
          onClick={() => void handleCopy()}
          disabled={!content.text}
          title={content.text ? "Click to copy" : "No text set yet"}
          className="flex-1 truncate text-left font-mono text-sm tracking-widest text-ink disabled:text-ink-muted"
        >
          {content.text ? MASK : "Click the pencil to set a secret"}
        </button>
      )}
      {copyState && (
        <span className={`shrink-0 text-xs ${copyState === "copied" ? "text-green-600" : "text-red-500"}`}>
          {copyState === "copied" ? "Copied!" : "Copy failed"}
        </span>
      )}
      {!readOnly && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit secret"
          className="shrink-0 rounded p-1 text-ink-muted opacity-0 hover:bg-surface hover:text-ink group-hover/block:opacity-100"
        >
          <Icon name="pencil" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
