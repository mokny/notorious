import type { ReactNode } from "react";
import type {
  BlockType,
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

export interface BlockRendererProps {
  block: BlockNode;
  workspaceId: string;
  objectId: string;
  onSave: (content: Record<string, unknown>) => Promise<void>;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onSlashSelect: (type: BlockType) => void;
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
  onEnter,
  onBackspaceEmpty,
  onSlashSelect,
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
          content={content<ParagraphContent>()}
          onSave={save}
          onEnter={onEnter}
          onBackspaceEmpty={onBackspaceEmpty}
          onSlashSelect={onSlashSelect}
          autoFocus={autoFocus}
          onAutoFocused={onAutoFocused}
        />
      );
    case "heading":
      return <HeadingBlock content={content<HeadingContent>()} onSave={save} onEnter={onEnter} onBackspaceEmpty={onBackspaceEmpty} />;
    case "quote":
      return <QuoteBlock content={content<QuoteContent>()} onSave={save} onEnter={onEnter} />;
    case "callout":
      return <CalloutBlock content={content<CalloutContent>()} onSave={save} onEnter={onEnter} />;
    case "checklist":
      return <ChecklistBlock content={content<ChecklistContent>()} onSave={save} />;
    case "table":
      return <TableBlock content={content<TableContent>()} onSave={save} />;
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
        <ToggleBlock content={content<ToggleContent>()} onSave={save}>
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
      return <SubObjectBlock content={content<SubObjectContent>()} workspaceId={workspaceId} hostObjectId={objectId} onSave={save} />;
    default:
      return null;
  }
}
