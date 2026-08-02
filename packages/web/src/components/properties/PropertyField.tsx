import type { Property, PropertyValue } from "@notorious/shared";
import { TagPicker } from "./TagPicker.js";
import { RelationPicker } from "./RelationPicker.js";
import { RatingInput } from "./RatingInput.js";
import { FilePropertyField } from "./FilePropertyField.js";
import { DebouncedTextInput } from "./DebouncedTextInput.js";

interface PropertyFieldProps {
  property: Property;
  value: PropertyValue;
  workspaceId: string;
  objectId: string | null;
  onChange: (value: PropertyValue) => Promise<void>;
  /** Relation values are backed by dedicated create/delete-relation endpoints, not a value PATCH. */
  onRelationAdd?: (targetObjectId: string) => void;
  onRelationRemove?: (targetObjectId: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/** Renders the correct editor for one of the 16+ supported property types. */
export function PropertyField({
  property,
  value,
  workspaceId,
  objectId,
  onChange,
  onRelationAdd,
  onRelationRemove,
}: PropertyFieldProps) {
  const config = property.config;

  switch (config.type) {
    case "text":
      return <DebouncedTextInput className={inputClass} value={(value as string) ?? ""} onSave={onChange} />;

    case "url":
      return value ? (
        <a href={value as string} target="_blank" rel="noreferrer" className="truncate text-sm text-accent hover:underline">
          {value as string}
        </a>
      ) : (
        <DebouncedTextInput className={inputClass} type="url" placeholder="https://…" value={(value as string) ?? ""} onSave={onChange} />
      );

    case "email":
      return <DebouncedTextInput className={inputClass} type="email" value={(value as string) ?? ""} onSave={onChange} />;

    case "phone":
      return <DebouncedTextInput className={inputClass} type="tel" value={(value as string) ?? ""} onSave={onChange} />;

    case "number":
      return (
        <DebouncedTextInput
          className={inputClass}
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onSave={(v) => onChange(v === "" ? null : Number(v))}
        />
      );

    case "boolean":
    case "checkbox":
      return (
        <input
          type="checkbox"
          className="accent-accent"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );

    case "date":
      return (
        <input
          className={inputClass}
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      );

    case "datetime":
      return (
        <input
          className={inputClass}
          type="datetime-local"
          value={value ? toLocalInputValue(String(value)) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      );

    case "tag":
    case "status":
    case "select":
      return (
        <TagPicker
          options={config.options}
          value={value ? [String(value)] : []}
          multi={false}
          onChange={(ids) => onChange(ids[0] ?? null)}
        />
      );

    case "multi_tag":
    case "multi_select":
      return (
        <TagPicker
          options={config.options}
          value={Array.isArray(value) ? value : []}
          multi
          onChange={(ids) => onChange(ids)}
        />
      );

    case "rating":
      return <RatingInput max={config.max} value={Number(value) || 0} onChange={onChange} />;

    case "file":
    case "image":
      return (
        <FilePropertyField
          workspaceId={workspaceId}
          objectId={objectId}
          value={(value as string) ?? null}
          isImage={config.type === "image"}
          onChange={onChange}
        />
      );

    case "relation":
      return (
        <RelationPicker
          workspaceId={workspaceId}
          targetObjectTypeId={config.targetObjectTypeId}
          value={Array.isArray(value) ? value : []}
          onAdd={(id) => onRelationAdd?.(id)}
          onRemove={(id) => onRelationRemove?.(id)}
        />
      );

    case "formula":
      return <span className="text-sm text-ink-muted">{formatComputed(value)} (formula)</span>;

    case "rollup":
      return <span className="text-sm text-ink-muted">{formatComputed(value)} (rollup)</span>;

    default:
      return null;
  }
}

function formatComputed(value: PropertyValue): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}
