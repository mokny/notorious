import type { BlockType } from "@notorious/shared";

export interface ScriptBlockSnapshot {
  id: string;
  type: string;
  content: Record<string, unknown>;
  position: string;
}

export interface ScriptRelatedObjectSnapshot {
  id: string;
  title: string;
  properties: Record<string, unknown>;
}

/** Everything a script can read, pre-fetched by service.ts and injected into the sandbox as one JSON blob before `evalCode` - see api.ts's module doc comment for why this can't be a live/lazy read. */
export interface ScriptObjectSnapshot {
  id: string;
  typeKey: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  properties: Record<string, unknown>;
  blocks: ScriptBlockSnapshot[];
  /** Keyed by relation property key - one level of resolved target objects, snapshotted at run start. */
  relatedObjects: Record<string, ScriptRelatedObjectSnapshot[]>;
}

/** Everything a script staged during its run, applied by service.ts only after the script finishes successfully. */
export interface StagedWrites {
  /** Values are validated against this shape by api.ts's `validatePropertyValue` before ever being staged. */
  properties: Record<string, string | number | boolean | string[] | null>;
  blockUpdates: Map<string, Record<string, unknown>>;
  appendedBlocks: Array<{ type: BlockType; content: Record<string, unknown> }>;
}

export function createEmptyStagedWrites(): StagedWrites {
  return { properties: {}, blockUpdates: new Map(), appendedBlocks: [] };
}
