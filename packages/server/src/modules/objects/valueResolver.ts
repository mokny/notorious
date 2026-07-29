import { and, eq, inArray } from "drizzle-orm";
import type { Property, PropertyValue } from "@notorious/shared";
import { db } from "../../db/client.js";
import { objectValues, relations } from "../../db/schema.js";
import { evaluateFormula } from "../schema/formula.js";

type ValueMap = Map<string, Record<string, PropertyValue>>;

function parseStoredValue(raw: string | null): PropertyValue {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as PropertyValue;
  } catch {
    return null;
  }
}

function toNumber(value: PropertyValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  return 0;
}

/**
 * Resolves the full `values` map (stored + relation + formula + rollup) for a
 * batch of objects that all share the same object type / property set. This
 * is the single place that turns the EAV storage model back into the flat
 * `Record<propertyKey, value>` shape the API and frontend consume.
 */
export async function resolveValuesForObjects(
  objectIds: string[],
  props: Property[],
): Promise<ValueMap> {
  const result: ValueMap = new Map(objectIds.map((id) => [id, {}]));
  if (objectIds.length === 0) return result;

  const storedProps = props.filter((p) => !["relation", "formula", "rollup"].includes(p.type));
  const relationProps = props.filter((p) => p.type === "relation");
  const formulaProps = props.filter((p) => p.type === "formula");
  const rollupProps = props.filter((p) => p.type === "rollup");

  if (storedProps.length > 0) {
    const rows = await db
      .select()
      .from(objectValues)
      .where(
        and(
          inArray(objectValues.objectId, objectIds),
          inArray(
            objectValues.propertyId,
            storedProps.map((p) => p.id),
          ),
        ),
      );
    const keyByPropertyId = new Map(storedProps.map((p) => [p.id, p.key]));
    for (const row of rows) {
      const key = keyByPropertyId.get(row.propertyId);
      if (!key) continue;
      result.get(row.objectId)![key] = parseStoredValue(row.value);
    }
  }

  const relationTargetsByObject = new Map<string, Map<string, string[]>>();
  if (relationProps.length > 0) {
    const rows = await db
      .select()
      .from(relations)
      .where(
        and(
          inArray(relations.sourceObjectId, objectIds),
          inArray(
            relations.propertyId,
            relationProps.map((p) => p.id),
          ),
        ),
      );
    for (const row of rows) {
      const byProperty = relationTargetsByObject.get(row.sourceObjectId) ?? new Map();
      const list = byProperty.get(row.propertyId) ?? [];
      list.push(row.targetObjectId);
      byProperty.set(row.propertyId, list);
      relationTargetsByObject.set(row.sourceObjectId, byProperty);
    }
    for (const prop of relationProps) {
      for (const objectId of objectIds) {
        result.get(objectId)![prop.key] = relationTargetsByObject.get(objectId)?.get(prop.id) ?? [];
      }
    }
  }

  for (const prop of formulaProps) {
    const expression = prop.config.type === "formula" ? prop.config.expression : "";
    for (const objectId of objectIds) {
      const values = result.get(objectId)!;
      result.get(objectId)![prop.key] = evaluateFormula(expression, (refKey) =>
        toNumber(values[refKey] ?? null),
      );
    }
  }

  if (rollupProps.length > 0) {
    await resolveRollups(objectIds, rollupProps, relationTargetsByObject, result);
  }

  return result;
}

async function resolveRollups(
  objectIds: string[],
  rollupProps: Property[],
  relationTargetsByObject: Map<string, Map<string, string[]>>,
  result: ValueMap,
): Promise<void> {
  for (const rollup of rollupProps) {
    if (rollup.config.type !== "rollup") continue;
    const { relationPropertyId, sourcePropertyId, function: fn } = rollup.config;

    const allTargetIds = new Set<string>();
    for (const objectId of objectIds) {
      const targets = relationTargetsByObject.get(objectId)?.get(relationPropertyId) ?? [];
      for (const t of targets) allTargetIds.add(t);
    }

    const targetValues = new Map<string, PropertyValue>();
    if (allTargetIds.size > 0) {
      const rows = await db
        .select()
        .from(objectValues)
        .where(
          and(
            inArray(objectValues.objectId, [...allTargetIds]),
            eq(objectValues.propertyId, sourcePropertyId),
          ),
        );
      for (const row of rows) targetValues.set(row.objectId, parseStoredValue(row.value));
    }

    for (const objectId of objectIds) {
      const targets = relationTargetsByObject.get(objectId)?.get(relationPropertyId) ?? [];
      const values = targets.map((t) => targetValues.get(t) ?? null);
      result.get(objectId)![rollup.key] = aggregate(fn, values);
    }
  }
}

function aggregate(fn: string, values: PropertyValue[]): PropertyValue {
  const numeric = values.map(toNumber);
  switch (fn) {
    case "count":
      return values.filter((v) => v !== null && v !== "").length;
    case "sum":
      return numeric.reduce((a, b) => a + b, 0);
    case "average":
      return numeric.length > 0 ? numeric.reduce((a, b) => a + b, 0) / numeric.length : 0;
    case "min":
      return numeric.length > 0 ? Math.min(...numeric) : 0;
    case "max":
      return numeric.length > 0 ? Math.max(...numeric) : 0;
    case "earliest": {
      const dates = values.filter((v): v is string => typeof v === "string").sort();
      return dates[0] ?? null;
    }
    case "latest": {
      const dates = values.filter((v): v is string => typeof v === "string").sort();
      return dates[dates.length - 1] ?? null;
    }
    default:
      return null;
  }
}
