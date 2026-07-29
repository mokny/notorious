/** Workspace membership roles, ordered from least to most privileged. */
export const WORKSPACE_ROLES = ["viewer", "commenter", "editor", "owner"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  commenter: 1,
  editor: 2,
  owner: 3,
};

/** Returns true if `role` grants at least the privileges of `required`. */
export function roleAtLeast(role: WorkspaceRole, required: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
}
