import type { ObjectRecord, PropertyOption, PropertyValue } from "@notorious/shared";
import { listProperties } from "../schema/service.js";
import { getObject, createObject, updateObject } from "./service.js";
import { badRequest } from "../../lib/httpError.js";

const FREQUENCY_DAYS: Record<string, number> = { daily: 1, weekly: 7 };

function addInterval(iso: string, frequencyLabel: string): string {
  const date = new Date(iso);
  const label = frequencyLabel.toLowerCase();

  if (label in FREQUENCY_DAYS) {
    date.setDate(date.getDate() + FREQUENCY_DAYS[label]!);
  } else if (label === "monthly") {
    date.setMonth(date.getMonth() + 1);
  } else if (label === "yearly") {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString();
}

function findOption(options: PropertyOption[], predicate: (label: string) => boolean): PropertyOption | undefined {
  return options.find((option) => predicate(option.label.toLowerCase()));
}

/**
 * Marks a recurring task as done and, if it has an active recurrence rule,
 * creates the next occurrence with its deadline/reminder shifted forward.
 * Exposed as an explicit endpoint (rather than an implicit side effect of a
 * generic PATCH) so the API stays predictable and documentable.
 */
export async function completeRecurringTask(objectId: string, userId: string): Promise<{
  completed: ObjectRecord;
  next: ObjectRecord | null;
}> {
  const object = await getObject(objectId);
  const props = await listProperties(object.objectTypeId);

  const statusProp = props.find((p) => p.key === "status" && p.type === "status");
  const recurrenceProp = props.find((p) => p.key === "recurrence");
  const deadlineProp = props.find((p) => p.key === "deadline");
  const reminderProp = props.find((p) => p.key === "reminder");

  if (!statusProp || statusProp.config.type !== "status") {
    throw badRequest("This object type has no status property");
  }

  const doneOption = findOption(statusProp.config.options, (label) => label === "done");
  const completed = await updateObject(objectId, {
    values: { status: doneOption?.id ?? object.values.status ?? null },
  });

  if (!recurrenceProp || recurrenceProp.config.type !== "select") {
    return { completed, next: null };
  }

  const recurrenceValue = object.values[recurrenceProp.key];
  const recurrenceOption = recurrenceProp.config.options.find((option) => option.id === recurrenceValue);
  if (!recurrenceOption || recurrenceOption.label.toLowerCase() === "none") {
    return { completed, next: null };
  }

  const todoOption = findOption(statusProp.config.options, (label) => label === "to do" || label === "todo");
  const nextValues: Record<string, PropertyValue> = {
    ...object.values,
    status: todoOption?.id ?? null,
  };
  if (deadlineProp && typeof object.values[deadlineProp.key] === "string") {
    nextValues[deadlineProp.key] = addInterval(object.values[deadlineProp.key] as string, recurrenceOption.label);
  }
  if (reminderProp && typeof object.values[reminderProp.key] === "string") {
    nextValues[reminderProp.key] = addInterval(object.values[reminderProp.key] as string, recurrenceOption.label);
  }

  const next = await createObject(object.workspaceId, userId, {
    objectTypeId: object.objectTypeId,
    title: object.title,
    icon: object.icon,
    cover: object.cover,
    values: nextValues,
  });

  return { completed, next };
}
