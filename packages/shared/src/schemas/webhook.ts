import { z } from "zod";

/** Object-change events a webhook can subscribe to - see modules/webhooks/service.ts's event mapping. Block-level changes (typing in a paragraph, checking off a to-do, ...) have no event of their own - they feed the same debounced "object.updated" delivery a direct title/property edit would (see realtime/activity.ts), rather than getting a distinct event type. */
export const WEBHOOK_EVENTS = ["object.created", "object.updated", "object.archived", "object.restored", "object.deleted"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const createWebhookSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.string().url().max(2000).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export interface Webhook {
  id: string;
  workspaceId: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  lastTriggeredAt: string | null;
  lastStatus: "success" | "failure" | null;
  lastError: string | null;
}

/** The plaintext signing secret is only ever included here, once, right after creation - see modules/webhooks/service.ts's `createWebhook`. */
export interface CreatedWebhook extends Webhook {
  secret: string;
}

/** The full, detailed notification body every webhook delivery POSTs - see modules/webhooks/service.ts's `buildPayload`. */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  workspace: { id: string; name: string };
  objectType: { id: string; key: string; name: string } | null;
  object: {
    id: string;
    title: string;
    icon: string | null;
    cover: string | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    lockedAt: string | null;
    values: Record<string, unknown>;
  } | null;
  actor: { id: string; name: string; email: string } | null;
}
