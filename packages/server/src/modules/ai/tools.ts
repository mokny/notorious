import { z, type ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { listWorkspacesForUser } from "../workspaces/service.js";
import { listObjectTypes } from "../schema/service.js";
import { searchObjects } from "../search/service.js";
import * as objectService from "../objects/service.js";
import * as blockService from "../blocks/service.js";

export interface AiToolContext {
  userId: string;
}

export interface AiTool<Shape extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  shape: Shape;
  execute: (args: z.infer<z.ZodObject<Shape>>, ctx: AiToolContext) => Promise<unknown>;
}

async function requireEditor(userId: string, workspaceId: string): Promise<void> {
  await requireWorkspaceRole(workspaceId, userId, "editor");
}

async function requireEditorForObject(userId: string, objectId: string): Promise<string> {
  const workspaceId = await objectService.getObjectWorkspaceId(objectId);
  await requireEditor(userId, workspaceId);
  return workspaceId;
}

/**
 * The full set of actions an AI agent can take, shared verbatim by the
 * in-app chat (modules/ai/agent.ts) and the MCP server (modules/mcp/routes.ts)
 * - one registry, one place to add a new capability for both surfaces at
 * once. Every tool re-checks the acting user's workspace role itself (same
 * "editor" bar the equivalent HTTP route requires - see workspaces/access.ts)
 * rather than trusting the caller, since neither surface goes through the
 * usual Fastify request/route access-check pattern.
 */
export const AI_TOOLS: AiTool<ZodRawShape>[] = [
  {
    name: "list_workspaces",
    description: "List the workspaces the current user is a member of, with their ids - call this first if you don't already know which workspaceId to use.",
    shape: {},
    execute: async (_args, ctx) => {
      const workspaces = await listWorkspacesForUser(ctx.userId);
      return workspaces.map((w) => ({ id: w.id, name: w.name }));
    },
  },
  {
    name: "list_object_types",
    description: "List the object types (e.g. Task, Note, Project) defined in a workspace, with their id, key and name - call this before creating an object to find the right objectTypeId.",
    shape: { workspaceId: z.string().describe("The workspace to list object types in") },
    execute: async (args, ctx) => {
      await requireEditor(ctx.userId, args.workspaceId);
      const types = await listObjectTypes(args.workspaceId);
      return types.map((t) => ({ id: t.id, key: t.key, name: t.name }));
    },
  },
  {
    name: "search_objects",
    description: "Search for objects in a workspace by title/content, optionally filtered to one object type. Returns id, title and objectTypeId for each match.",
    shape: {
      workspaceId: z.string(),
      query: z.string().describe("Free-text search query - can be empty to just list objects of a type"),
      objectTypeId: z.string().optional().describe("Restrict results to this object type"),
    },
    execute: async (args, ctx) => {
      await requireEditor(ctx.userId, args.workspaceId);
      // `hasSudo: false` - the AI chat tool call has no interactive session of its own to
      // reverify with, so a `requiresReverify` ("vault") object is never searchable here,
      // same exclusion as API keys/MCP (see workspaces/access.ts's `assertReverifyAccess`).
      const results = await searchObjects(args.workspaceId, {
        q: args.query,
        objectTypeId: args.objectTypeId,
        fuzzy: true,
        limit: 20,
      }, false);
      return results.map((o) => ({ id: o.id, title: o.title, objectTypeId: o.objectTypeId }));
    },
  },
  {
    name: "get_object",
    description: "Get the full details of one object by id, including its property values.",
    shape: { objectId: z.string() },
    execute: async (args, ctx) => {
      await requireEditorForObject(ctx.userId, args.objectId);
      const object = await objectService.getObject(args.objectId);
      return { id: object.id, title: object.title, objectTypeId: object.objectTypeId, values: object.values, archivedAt: object.archivedAt };
    },
  },
  {
    name: "create_object",
    description: "Create a new object of a given type in a workspace, with a title and optionally property values keyed by property key.",
    shape: {
      workspaceId: z.string(),
      objectTypeId: z.string().describe("Get this from list_object_types first"),
      title: z.string(),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])).optional(),
    },
    execute: async (args, ctx) => {
      await requireEditor(ctx.userId, args.workspaceId);
      const object = await objectService.createObject(args.workspaceId, ctx.userId, {
        objectTypeId: args.objectTypeId,
        title: args.title,
        values: args.values ?? {},
      });
      return { id: object.id, title: object.title };
    },
  },
  {
    name: "update_object",
    description: "Update an existing object's title and/or property values.",
    shape: {
      objectId: z.string(),
      title: z.string().optional(),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])).optional(),
    },
    execute: async (args, ctx) => {
      await requireEditorForObject(ctx.userId, args.objectId);
      const object = await objectService.updateObject(args.objectId, { title: args.title, values: args.values });
      return { id: object.id, title: object.title };
    },
  },
  {
    name: "archive_object",
    description: "Archive an object (soft delete - it can be restored later).",
    shape: { objectId: z.string() },
    execute: async (args, ctx) => {
      await requireEditorForObject(ctx.userId, args.objectId);
      await objectService.archiveObject(args.objectId);
      return { ok: true };
    },
  },
  {
    name: "add_paragraph_block",
    description: "Append a paragraph of text to the end of an object's content.",
    shape: { objectId: z.string(), markdown: z.string().describe("The paragraph's text, as Markdown") },
    execute: async (args, ctx) => {
      await requireEditorForObject(ctx.userId, args.objectId);
      const block = await blockService.createBlock({
        objectId: args.objectId,
        parentBlockId: null,
        afterBlockId: null,
        type: "paragraph",
        content: { markdown: args.markdown },
      });
      return { id: block.id };
    },
  },
  {
    name: "add_checklist_block",
    description: "Append a checklist (to-do list) to the end of an object's content.",
    shape: {
      objectId: z.string(),
      items: z.array(z.string()).describe("The checklist item texts, unchecked"),
    },
    execute: async (args, ctx) => {
      await requireEditorForObject(ctx.userId, args.objectId);
      const block = await blockService.createBlock({
        objectId: args.objectId,
        parentBlockId: null,
        afterBlockId: null,
        type: "checklist",
        content: { items: args.items.map((markdown: string) => ({ markdown, checked: false })) },
      });
      return { id: block.id };
    },
  },
];

/** JSON Schema for a tool's parameters, in the shape OpenAI/Anthropic's function-calling APIs expect - derived from the same zod shape MCP validates against, so the two surfaces can never drift apart. */
export function toolParametersJsonSchema(tool: AiTool): Record<string, unknown> {
  const schema = zodToJsonSchema(z.object(tool.shape), { target: "openApi3" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export function findTool(name: string): AiTool | undefined {
  return AI_TOOLS.find((tool) => tool.name === name);
}
