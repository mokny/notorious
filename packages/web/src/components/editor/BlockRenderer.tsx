import type { ReactNode } from "react";
import type {
  BlockType,
  ObjectType,
  ParagraphContent,
  HeadingContent,
  QuoteContent,
  CalloutContent,
  ChecklistContent,
  TableContent,
  CodeContent,
  ImageContent,
  VideoContent,
  EmbedContent,
  MathContent,
  MermaidContent,
  ToggleContent,
  ColumnsContent,
  DatabaseViewContent,
  SubObjectContent,
  BookmarkContent,
  WhiteboardContent,
} from "@notorious/shared";
import type { BlockNode } from "./blockTree.js";
import { ParagraphBlock } from "./blocks/ParagraphBlock.js";
import { HeadingBlock } from "./blocks/HeadingBlock.js";
import { QuoteBlock } from "./blocks/QuoteBlock.js";
import { CalloutBlock } from "./blocks/CalloutBlock.js";
import { ChecklistBlock } from "./blocks/ChecklistBlock.js";
import { TableBlock } from "./blocks/TableBlock.js";
import { CodeBlock } from "./blocks/CodeBlock.js";
import { ImageBlock, VideoBlock, EmbedBlock } from "./blocks/MediaBlocks.js";
import { MathBlock } from "./blocks/MathBlock.js";
import { MermaidBlock } from "./blocks/MermaidBlock.js";
import { ToggleBlock } from "./blocks/ToggleBlock.js";
import { DividerBlock } from "./blocks/DividerBlock.js";
import { ColumnsBlock } from "./blocks/ColumnsBlock.js";
import { DatabaseViewBlock } from "./blocks/DatabaseViewBlock.js";
import { SubObjectBlock } from "./blocks/SubObjectBlock.js";
import { BookmarkBlock } from "./blocks/BookmarkBlock.js";
import { WhiteboardBlock } from "./blocks/WhiteboardBlock.js";

export interface BlockRendererProps {
  block: BlockNode;
  workspaceId: string;
  objectId: string;
  onSave: (content: Record<string, unknown>) => Promise<void>;
  /** Exempt from the object lock - see ChecklistBlock.tsx and toggleChecklistItemSchema. Only relevant for `checklist` blocks. */
  onToggleChecklistItem: (itemId: string, checked: boolean) => Promise<void>;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onSlashSelect: (type: BlockType, extraContent?: Record<string, unknown>) => void;
  /** For the slash menu's per-object-type "create a new X" entries - only relevant for `paragraph` blocks (the only ones with a slash menu). */
  objectTypes: ObjectType[];
  /** For a `sub_object` block's "embed" display mode - see BlockEditorContext.tsx and SubObjectBlock.tsx. Only relevant for `sub_object` blocks. */
  embedAncestorIds: string[];
  renderColumn?: (columnIndex: number) => ReactNode;
  toggleChildren?: ReactNode;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

export function BlockRenderer({
  block,
  workspaceId,
  objectId,
  onSave,
  onToggleChecklistItem,
  onSlashSelect,
  objectTypes,
  embedAncestorIds,
  onEnter,
  onBackspaceEmpty,
  renderColumn,
  toggleChildren,
  autoFocus,
  onAutoFocused,
}: BlockRendererProps) {
  /**
   * `block.content` is untyped JSON on the wire (it varies per block type),
   * so every concrete block component needs a cast at this single dispatch
   * point. `save` re-wraps each component's typed `onSave` back into the
   * generic `Record<string, unknown>` the block-persistence layer expects.
   */
  function content<T>(): T {
    return block.content as unknown as T;
  }
  function save(value: unknown): Promise<void> {
    return onSave(value as Record<string, unknown>);
  }

  switch (block.type) {
    case "paragraph":
      return (
        <ParagraphBlock
          blockId={block.id}
          content={content<ParagraphContent>()}
          onSave={save}
          onEnter={onEnter}
          onBackspaceEmpty={onBackspaceEmpty}
          onSlashSelect={onSlashSelect}
          objectTypes={objectTypes}
          autoFocus={autoFocus}
          onAutoFocused={onAutoFocused}
        />
      );
    case "heading":
      return <HeadingBlock blockId={block.id} content={content<HeadingContent>()} onSave={save} onEnter={onEnter} onBackspaceEmpty={onBackspaceEmpty} />;
    case "quote":
      return <QuoteBlock blockId={block.id} content={content<QuoteContent>()} onSave={save} onEnter={onEnter} />;
    case "callout":
      return <CalloutBlock blockId={block.id} content={content<CalloutContent>()} onSave={save} onEnter={onEnter} />;
    case "checklist":
      return <ChecklistBlock blockId={block.id} content={content<ChecklistContent>()} onSave={save} onToggleItem={onToggleChecklistItem} />;
    case "table":
      return <TableBlock blockId={block.id} content={content<TableContent>()} onSave={save} />;
    case "code":
      return <CodeBlock content={content<CodeContent>()} onSave={save} />;
    case "image":
      return <ImageBlock content={content<ImageContent>()} workspaceId={workspaceId} objectId={objectId} onSave={save} />;
    case "video":
      return <VideoBlock content={content<VideoContent>()} workspaceId={workspaceId} objectId={objectId} onSave={save} />;
    case "embed":
      return <EmbedBlock content={content<EmbedContent>()} onSave={save} />;
    case "math":
      return <MathBlock content={content<MathContent>()} onSave={save} />;
    case "mermaid":
      return <MermaidBlock content={content<MermaidContent>()} onSave={save} />;
    case "toggle":
      return (
        <ToggleBlock blockId={block.id} content={content<ToggleContent>()} onSave={save}>
          {toggleChildren}
        </ToggleBlock>
      );
    case "divider":
      return <DividerBlock />;
    case "columns":
      return <ColumnsBlock content={content<ColumnsContent>()} onSave={save} renderColumn={renderColumn ?? (() => null)} />;
    case "database_view":
      return <DatabaseViewBlock content={content<DatabaseViewContent>()} workspaceId={workspaceId} onSave={save} />;
    case "sub_object":
      return (
        <SubObjectBlock content={content<SubObjectContent>()} workspaceId={workspaceId} onSave={save} embedAncestorIds={embedAncestorIds} />
      );
    case "bookmark":
      return <BookmarkBlock content={content<BookmarkContent>()} workspaceId={workspaceId} objectId={objectId} onSave={save} />;
    case "whiteboard":
      return <WhiteboardBlock content={content<WhiteboardContent>()} workspaceId={workspaceId} onSave={save} />;
    default:
      return null;
  }
}
