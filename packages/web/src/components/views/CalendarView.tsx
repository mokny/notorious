import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ObjectRecord, Property } from "@notorious/shared";
import { Icon } from "../ui/Icon.js";
import { useRowContextMenu } from "../../hooks/useRowContextMenu.js";
import { useTwoFingerTap } from "../../hooks/useTwoFingerTap.js";
import { ContextMenu } from "../ui/ContextMenu.js";
import { buildObjectContextMenuItems } from "../../lib/objectContextMenu.js";

interface CalendarViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  datePropertyId: string | null | undefined;
  onOpenObject?: (objectId: string) => void;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function CalendarView({ workspaceId, items, properties, datePropertyId, onOpenObject }: CalendarViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const rowContextMenu = useRowContextMenu();
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
    return <p className="p-6 text-sm text-ink-muted">{t("views.calendar.noDateProperty")}</p>;
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
        {(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map((day) => (
          <div key={day} className="p-1 text-center font-medium text-ink-muted">
            {t(`views.calendar.day.${day}`)}
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
                    <CalendarViewDayItem
                      key={item.id}
                      item={item}
                      onOpen={() => openObject(item.id)}
                      onContextMenu={(event) => rowContextMenu.openFromMouseEvent(item.id, event)}
                      onTwoFingerTap={(x, y) => rowContextMenu.openAt(item.id, x, y)}
                    />
                  ))}
                  {dayItems.length > 3 && (
                    <p className="text-ink-muted">{t("views.calendar.moreCount", { count: dayItems.length - 3 })}</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {rowContextMenu.menu && (
        <ContextMenu
          x={rowContextMenu.menu.x}
          y={rowContextMenu.menu.y}
          items={buildObjectContextMenuItems(t, workspaceId, rowContextMenu.menu.objectId)}
          onClose={rowContextMenu.close}
        />
      )}
    </div>
  );
}

function CalendarViewDayItem({
  item,
  onOpen,
  onContextMenu,
  onTwoFingerTap,
}: {
  item: ObjectRecord;
  onOpen: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onTwoFingerTap: (x: number, y: number) => void;
}) {
  const twoFingerTap = useTwoFingerTap(onTwoFingerTap);

  return (
    <button
      onClick={onOpen}
      onContextMenu={onContextMenu}
      {...twoFingerTap}
      className="mb-0.5 block w-full truncate rounded bg-accent/10 px-1 py-0.5 text-left text-accent"
    >
      {item.title}
    </button>
  );
}
