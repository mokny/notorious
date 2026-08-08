import { useEffect, useRef, useState } from "react";
import type { AiContent } from "@notorious/shared";
import { blockApi } from "../../../lib/api/resources.js";
import { ApiError } from "../../../lib/api/client.js";
import { useBlockEditor } from "../BlockEditorContext.js";
import { TemplatableMarkdown } from "../TemplatableMarkdown.js";
import { Icon } from "../../ui/Icon.js";
import { useLocalStorageState } from "../../../hooks/useLocalStorageState.js";
import { useConfirm } from "../../../context/ConfirmContext.js";

const CONTEXT_WARNING_DISMISSED_KEY = "notorious:ai-context-warning-dismissed";

export function AiBlock({
  blockId,
  content: externalContent,
  onSave,
}: {
  blockId: string;
  content: AiContent;
  onSave: (c: AiContent) => Promise<void>;
}) {
  const { readOnly } = useBlockEditor();
  const confirm = useConfirm();
  const [contextWarningDismissed, setContextWarningDismissed] = useLocalStorageState(CONTEXT_WARNING_DISMISSED_KEY, false);
  // Mirrors `externalContent`, except while a generate request from this tab
  // is in flight - guards against the prop briefly reverting to the
  // pre-generate value before the realtime broadcast/refetch catches up.
  const [content, setContent] = useState(externalContent);
  const isGeneratingRef = useRef(false);
  useEffect(() => {
    if (!isGeneratingRef.current) setContent(externalContent);
  }, [externalContent]);

  // Composing a new prompt is local-only until "Send" - clicking "Edit"
  // never touches the server, so an abandoned edit leaves the previous
  // answer untouched (see the design discussion this block came out of).
  const [manualEditing, setManualEditing] = useState(false);
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  // Off by default even if a previous send had it on - re-including the page
  // context is a fresh, per-send decision, not a sticky block setting.
  const [includeContext, setIncludeContext] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const editing = manualEditing || content.answer === undefined;

  function startEditing() {
    setPrompt(content.prompt ?? "");
    setIncludeContext(false);
    setSendError(null);
    setManualEditing(true);
  }

  async function handleIncludeContextChange(checked: boolean) {
    if (!checked || contextWarningDismissed) {
      setIncludeContext(checked);
      return;
    }
    let dontShowAgain = false;
    const confirmed = await confirm({
      title: "Send page content to the AI?",
      description:
        "This page's title and full content will be sent to the AI provider configured in Settings, along with your prompt. Only enable this if you're comfortable sharing this page's content with that provider.",
      confirmLabel: "Include page content",
      children: (
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            className="accent-accent"
            onChange={(e) => {
              dontShowAgain = e.target.checked;
            }}
          />
          Don't show this again
        </label>
      ),
    });
    if (confirmed) {
      if (dontShowAgain) setContextWarningDismissed(true);
      setIncludeContext(true);
    }
  }

  async function handleSend() {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setSendError(null);
    try {
      const block = await blockApi.generateAi(blockId, { prompt: trimmed, includeContext });
      setContent(block.content as unknown as AiContent);
      setManualEditing(false);
    } catch (error) {
      setSendError(error instanceof ApiError ? error.message : "Request failed");
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Icon name="sparkles" className="h-3.5 w-3.5" />
        AI
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            readOnly={readOnly || isGenerating}
            placeholder="Ask the AI something…"
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-transparent p-2 text-sm outline-none focus:border-accent"
          />
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              className="accent-accent"
              checked={includeContext}
              disabled={isGenerating}
              onChange={(e) => void handleIncludeContextChange(e.target.checked)}
            />
            Include this page's content as context
          </label>
          {sendError && <p className="text-xs text-red-500">{sendError}</p>}
          <div className="flex justify-end" data-lock-hide>
            <button
              onClick={handleSend}
              disabled={!prompt.trim() || isGenerating}
              className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {isGenerating ? "Generating…" : "Send"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <TemplatableMarkdown
            blockId={blockId}
            field="answer"
            markdown={content.answer ?? ""}
            className={`tiptap prose-p:my-0 text-sm leading-relaxed ${content.isError ? "text-red-500" : ""}`}
            onSave={(markdown) => onSave({ ...content, answer: markdown })}
          />
          <div className="flex justify-end" data-lock-hide>
            <button onClick={startEditing} className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent">
              <Icon name="pencil" className="h-3 w-3" /> Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
