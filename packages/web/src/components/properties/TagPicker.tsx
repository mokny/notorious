import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PropertyOption } from "@notorious/shared";

interface TagPickerProps {
  options: PropertyOption[];
  value: string[];
  multi: boolean;
  onChange: (value: string[]) => void;
}

/** Colored-pill picker shared by tag/multi_tag/status/select/multi_select properties. */
export function TagPicker({ options, value, multi, onChange }: TagPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function toggle(optionId: string) {
    if (multi) {
      onChange(value.includes(optionId) ? value.filter((id) => id !== optionId) : [...value, optionId]);
    } else {
      onChange([optionId]);
      setOpen(false);
    }
  }

  const selected = options.filter((option) => value.includes(option.id));

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[2rem] w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-left text-sm"
      >
        {selected.length === 0 && <span className="text-ink-muted">{t("properties.tagPicker.empty")}</span>}
        {selected.map((option) => (
          <Pill key={option.id} option={option} />
        ))}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface ${
                value.includes(option.id) ? "bg-surface" : ""
              }`}
            >
              <Pill option={option} />
              {value.includes(option.id) && <span className="text-accent">✓</span>}
            </button>
          ))}
          {options.length === 0 && <p className="px-2 py-1.5 text-sm text-ink-muted">{t("properties.tagPicker.noOptionsDefined")}</p>}
        </div>
      )}
    </div>
  );
}

function Pill({ option }: { option: PropertyOption }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${option.color}22`, color: option.color }}
    >
      {option.label}
    </span>
  );
}
