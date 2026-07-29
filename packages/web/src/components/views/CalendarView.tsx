import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ObjectRecord, Property } from "@notorious/shared";
import { Icon } from "../ui/Icon.js";

interface CalendarViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  datePropertyId: string | null | undefined;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function CalendarView({ workspaceId, items, properties, datePropertyId }: CalendarViewProps) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const dateProperty = properties.find((p) => p.id === datePropertyId) ?? properties.find((p) => p.config.type === "date" || p.config.type === "datetime");

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ObjectRecord[]>();
    if (!dateProperty) return map;
    for (const item of items) {
      const value = item.values[dateProperty.key];
      if (typeof value !== "string") continue;
      const day = value.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return map;
  }, [items, dateProperty]);

  if (!dateProperty) {
    return <p className="p-6 text-sm text-ink-muted">This object type has no date property to plot on a calendar.</p>;
  }

  const firstDay = startOfMonth(cursor);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const cells = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-1 text-ink-muted hover:text-ink">
          <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
        </button>
        <h3 className="text-sm font-medium">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-1 text-ink-muted hover:text-ink">
          <Icon name="chevron-right" className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="p-1 text-center font-medium text-ink-muted">
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          const dayKey = day ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
          const dayItems = day ? (itemsByDay.get(dayKey) ?? []) : [];
          return (
            <div key={index} className="min-h-[80px] rounded-md border border-border p-1">
              {day && (
                <>
                  <p className="mb-0.5 text-right text-ink-muted">{day}</p>
                  {dayItems.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => navigate(`/w/${workspaceId}/objects/${item.id}`)}
                      className="mb-0.5 block w-full truncate rounded bg-accent/10 px-1 py-0.5 text-left text-accent"
                    >
                      {item.title}
                    </button>
                  ))}
                  {dayItems.length > 3 && <p className="text-ink-muted">+{dayItems.length - 3} more</p>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
