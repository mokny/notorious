import { useQuery } from "@tanstack/react-query";
import type { Block, BlockType } from "@notorious/shared";
import { blockApi } from "../lib/api/resources.js";
import { SLASH_COMMAND_ITEMS } from "./editor/SlashCommand.js";
import { CollapsibleSection } from "./ui/CollapsibleSection.js";

function truncate(text: string, max = 40): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** A short, human-readable snippet of a block's own text, if it has one worth showing (raw Markdown, not rendered - good enough to tell blocks apart, not meant to be pretty). */
function previewTextFor(block: Block): string {
  const content = block.content as Record<string, unknown>;
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "callout":
      return truncate(String(content.markdown ?? ""));
    case "toggle":
      return truncate(String(content.summaryMarkdown ?? ""));
    case "checklist": {
      const items = (content.items as { markdown: string }[] | undefined) ?? [];
      return truncate(items.map((item) => item.markdown).filter(Boolean).join(", "));
    }
    case "code":
      return truncate(String(content.code ?? ""));
    case "math":
      return truncate(String(content.latex ?? ""));
    case "mermaid":
      return truncate(String(content.code ?? ""));
    case "image":
    case "video":
      return truncate(String(content.caption ?? ""));
    case "embed":
      return truncate(String(content.url ?? ""));
    case "bookmark":
      return truncate(String(content.title ?? content.url ?? ""));
    default:
      return "";
  }
}

/** "Checklist", "Text", "Heading" etc - reuses the slash-menu's own type labels (SlashCommand.tsx) so this doesn't drift into a second, slightly different naming for the same block types. */
function typeLabelFor(type: BlockType): string {
  return SLASH_COMMAND_ITEMS.find((item) => item.type === type)?.label ?? type;
}

/** e.g. "Checklist — Buy milk, Buy eggs" or just "Divider" when there's no text to preview. */
function describeBlock(block: Block | undefined): string {
  if (!block) return "this block";
  const label = typeLabelFor(block.type);
  const preview = previewTextFor(block);
  return preview ? `${label} — "${preview}"` : label;
}

/**
 * Shown below Properties for whichever block was last clicked (see
 * ObjectDetailPage.tsx/BlockItem.tsx) - the last up-to-10 edits to that one
 * block, newest first. Selecting a block no longer highlights it in the
 * editor itself, so the description line here is what tells you which block
 * these entries actually belong to.
 */
export function BlockHistoryPanel({ objectId, blockId }: { objectId: string; blockId: string }) {
  // Same query key BlockEditor.tsx's own block list uses - this reads from
  // that already-fetched cache rather than triggering a second network call.
  const { data: blocks } = useQuery({ queryKey: ["blocks", objectId], queryFn: () => blockApi.list(objectId) });
  const block = blocks?.find((b) => b.id === blockId);

  const { data: entries } = useQuery({
    queryKey: ["blockHistory", blockId],
    queryFn: () => blockApi.history(blockId),
  });

  return (
    <CollapsibleSection title="History">
      <p className="mb-2 truncate text-xs text-ink-muted" title={describeBlock(block)}>
        {describeBlock(block)}
      </p>
      {!entries || entries.length === 0 ? (
        <p className="text-xs text-ink-muted">No edits recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="text-xs">
              <p className="text-ink">{entry.summary}</p>
              <p className="text-ink-muted">
                {entry.actorName} · {new Date(entry.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}
