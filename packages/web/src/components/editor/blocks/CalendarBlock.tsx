import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { sortObjectTypesForDisplay } from "@notorious/shared";
import type { CalendarBlockContent, CalendarBlockObjectTypeConfig, ObjectType, Property } from "@notorious/shared";
import { schemaApi, objectApi, workspaceApi } from "../../../lib/api/resources.js";
import { Icon } from "../../ui/Icon.js";
import { Button } from "../../ui/Button.js";
import { useBlockEditor } from "../BlockEditorContext.js";

interface CalendarBlockProps {
  content: CalendarBlockContent;
  workspaceId: string;
  objectTypes: ObjectType[];
  onSave: (content: CalendarBlockContent) => Promise<void>;
}

type Granularity = NonNullable<CalendarBlockContent["granularity"]>;
type WeekStartsOn = "sunday" | "monday";

interface CalendarItem {
  objectId: string;
  title: string;
  start: Date;
  end: Date;
  isRange: boolean;
  objectTypeId: string;
}

const GRANULARITIES: Granularity[] = ["year", "month", "week", "day", "agenda"];

/** Deterministic, no schema-level color field on ObjectType - just needs to be stable per type, not unique or cryptographically anything. */
const PALETTE: { bg: string; text: string; dot: string }[] = [
  { bg: "bg-blue-500/10", text: "text-blue-600", dot: "bg-blue-500" },
  { bg: "bg-emerald-500/10", text: "text-emerald-600", dot: "bg-emerald-500" },
  { bg: "bg-amber-500/10", text: "text-amber-600", dot: "bg-amber-500" },
  { bg: "bg-purple-500/10", text: "text-purple-600", dot: "bg-purple-500" },
  { bg: "bg-pink-500/10", text: "text-pink-600", dot: "bg-pink-500" },
  { bg: "bg-cyan-500/10", text: "text-cyan-600", dot: "bg-cyan-500" },
  { bg: "bg-orange-500/10", text: "text-orange-600", dot: "bg-orange-500" },
  { bg: "bg-teal-500/10", text: "text-teal-600", dot: "bg-teal-500" },
];

function colorFor(objectTypeId: string): { bg: string; text: string; dot: string } {
  let sum = 0;
  for (let i = 0; i < objectTypeId.length; i++) sum += objectTypeId.charCodeAt(i);
  return PALETTE[sum % PALETTE.length]!;
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function itemCoversDay(item: CalendarItem, day: Date): boolean {
  const d = dateOnly(day).getTime();
  return dateOnly(item.start).getTime() <= d && d <= dateOnly(item.end).getTime();
}

function startOfWeek(date: Date, weekStartsOn: WeekStartsOn): Date {
  const d = dateOnly(date);
  const weekday = d.getDay();
  const offset = weekStartsOn === "monday" ? (weekday === 0 ? 6 : weekday - 1) : weekday;
  d.setDate(d.getDate() - offset);
  return d;
}

function weekdayLabels(weekStartsOn: WeekStartsOn, t: (key: string) => string): string[] {
  const base = [
    t("editor.blocks.calendar.days.sun"),
    t("editor.blocks.calendar.days.mon"),
    t("editor.blocks.calendar.days.tue"),
    t("editor.blocks.calendar.days.wed"),
    t("editor.blocks.calendar.days.thu"),
    t("editor.blocks.calendar.days.fri"),
    t("editor.blocks.calendar.days.sat"),
  ];
  return weekStartsOn === "monday" ? [...base.slice(1), base[0]!] : base;
}

function weekDays(cursor: Date, weekStartsOn: WeekStartsOn): Date[] {
  const start = startOfWeek(cursor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function monthCells(cursor: Date, weekStartsOn: WeekStartsOn): (Date | null)[] {
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const firstWeekday = firstDay.getDay();
  const leading = weekStartsOn === "monday" ? (firstWeekday === 0 ? 6 : firstWeekday - 1) : firstWeekday;
  const cells: (Date | null)[] = [...Array(leading).fill(null)];
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
  return cells;
}

function hourAt(day: Date, hour: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
}

/** Empty/unconfigured state: pick which object types feed this calendar and which date property to plot each on - mirrors DatabaseViewBlock.tsx's "choose a view" card. */
function CalendarConfigEditor({
  objectTypes,
  onSave,
}: {
  objectTypes: ObjectType[];
  onSave: (content: CalendarBlockContent) => Promise<void>;
}) {
  const { t } = useTranslation();
  const sortedTypes = useMemo(() => sortObjectTypesForDisplay(objectTypes), [objectTypes]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [datePropertyByType, setDatePropertyByType] = useState<Record<string, string>>({});

  const propertyQueries = useQueries({
    queries: sortedTypes.map((type) => ({
      queryKey: ["properties", type.id],
      queryFn: () => schemaApi.properties(type.id),
      enabled: selected.has(type.id),
    })),
  });

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave(): void {
    const objectTypeConfigs: CalendarBlockObjectTypeConfig[] = [];
    for (const type of sortedTypes) {
      if (!selected.has(type.id)) continue;
      const datePropertyId = datePropertyByType[type.id];
      if (!datePropertyId) continue;
      objectTypeConfigs.push({ objectTypeId: type.id, datePropertyId, filters: [], sorts: [] });
    }
    if (objectTypeConfigs.length === 0) return;
    void onSave({ objectTypeConfigs, granularity: "month" });
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <p className="mb-2 text-sm text-ink-muted">{t("editor.blocks.calendar.chooseTypesPrompt")}</p>
      <div className="space-y-2">
        {sortedTypes.map((type, index) => {
          const properties = propertyQueries[index]?.data ?? [];
          const dateProperties = properties.filter(
            (p) => p.config.type === "date" || p.config.type === "datetime" || p.config.type === "daterange",
          );
          return (
            <div key={type.id} className="flex items-center gap-2">
              <input type="checkbox" className="accent-accent" checked={selected.has(type.id)} onChange={() => toggle(type.id)} />
              <span className="w-32 shrink-0 truncate text-sm">{type.name}</span>
              {selected.has(type.id) && (
                <select
                  value={datePropertyByType[type.id] ?? ""}
                  onChange={(e) => setDatePropertyByType((prev) => ({ ...prev, [type.id]: e.target.value }))}
                  className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
                >
                  <option value="" disabled>
                    {t("editor.blocks.calendar.selectDateProperty")}
                  </option>
                  {dateProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
        {sortedTypes.length === 0 && <p className="text-sm text-ink-muted">{t("editor.blocks.calendar.noObjectTypes")}</p>}
      </div>
      <Button type="button" variant="primary" onClick={handleSave} className="mt-3">
        {t("editor.blocks.calendar.save")}
      </Button>
    </div>
  );
}

function MonthGrid({
  cursor,
  weekStartsOn,
  items,
  readOnly,
  onDayClick,
  onItemClick,
}: {
  cursor: Date;
  weekStartsOn: WeekStartsOn;
  items: CalendarItem[];
  readOnly: boolean;
  onDayClick: (date: Date) => void;
  onItemClick: (objectId: string) => void;
}) {
  const { t } = useTranslation();
  const cells = useMemo(() => monthCells(cursor, weekStartsOn), [cursor, weekStartsOn]);
  const labels = weekdayLabels(weekStartsOn, t);

  return (
    <div className="p-3">
      <div className="grid grid-cols-7 gap-1 text-xs">
        {labels.map((label) => (
          <div key={label} className="p-1 text-center font-medium text-ink-muted">
            {label}
          </div>
        ))}
        {cells.map((day, index) => {
          const dayItems = day ? items.filter((it) => itemCoversDay(it, day)) : [];
          return (
            <div
              key={index}
              onClick={() => day && !readOnly && onDayClick(day)}
              className={`min-h-[80px] rounded-md border border-border p-1 ${day && !readOnly ? "cursor-pointer hover:bg-surface-raised" : ""}`}
            >
              {day && (
                <>
                  <p className="mb-0.5 text-right text-ink-muted">{day.getDate()}</p>
                  {dayItems.slice(0, 3).map((it) => {
                    const color = colorFor(it.objectTypeId);
                    return (
                      <button
                        key={it.objectId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onItemClick(it.objectId);
                        }}
                        className={`mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left ${color.bg} ${color.text}`}
                      >
                        {it.title}
                      </button>
                    );
                  })}
                  {dayItems.length > 3 && (
                    <p className="text-ink-muted">{t("editor.blocks.calendar.moreCount", { count: dayItems.length - 3 })}</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearGrid({
  year,
  weekStartsOn,
  items,
  onDayClick,
}: {
  year: number;
  weekStartsOn: WeekStartsOn;
  items: CalendarItem[];
  onDayClick: (date: Date) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 p-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }, (_, month) => {
        const cursor = new Date(year, month, 1);
        const cells = monthCells(cursor, weekStartsOn);
        return (
          <div key={month} className="rounded-md border border-border p-2">
            <p className="mb-1 text-center text-xs font-medium">{cursor.toLocaleDateString(undefined, { month: "long" })}</p>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, index) => {
                const hasItems = day ? items.some((it) => itemCoversDay(it, day)) : false;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!day}
                    onClick={() => day && onDayClick(day)}
                    className={`flex h-4 w-4 items-center justify-center rounded text-[9px] ${
                      day ? "hover:bg-surface-raised" : ""
                    } ${hasItems ? "bg-accent/10 font-semibold text-accent" : "text-ink-muted"}`}
                  >
                    {day ? day.getDate() : ""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Backs both Week (7 days) and Day (1 day) views - hourly rows plus a slim all-day strip for daterange items, Google/Outlook-style. */
function HourGrid({
  days,
  items,
  readOnly,
  onSlotClick,
  onItemClick,
}: {
  days: Date[];
  items: CalendarItem[];
  readOnly: boolean;
  onSlotClick: (date: Date) => void;
  onItemClick: (objectId: string) => void;
}) {
  const { t } = useTranslation();
  const allDayItems = items.filter((it) => it.isRange);
  const timedItems = items.filter((it) => !it.isRange);
  const gridColumns = `56px repeat(${days.length}, 1fr)`;

  return (
    <div className="flex h-full flex-col">
      <div className="grid border-b border-border text-xs" style={{ gridTemplateColumns: gridColumns }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="p-1 text-center font-medium text-ink-muted">
            {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </div>
        ))}
      </div>
      <div className="grid border-b border-border text-xs" style={{ gridTemplateColumns: gridColumns }}>
        <div className="p-1 text-right text-ink-muted">{t("editor.blocks.calendar.allDay")}</div>
        {days.map((d) => {
          const dayAllDay = allDayItems.filter((it) => itemCoversDay(it, d));
          return (
            <div key={d.toISOString()} className="min-h-[26px] space-y-0.5 border-l border-border p-0.5">
              {dayAllDay.map((it) => {
                const color = colorFor(it.objectTypeId);
                return (
                  <button
                    key={it.objectId}
                    onClick={() => onItemClick(it.objectId)}
                    className={`block w-full truncate rounded px-1 text-left text-[11px] ${color.bg} ${color.text}`}
                  >
                    {it.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: gridColumns }}>
          <div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex h-11 items-start justify-end border-b border-border pr-1 pt-0.5 text-[10px] text-ink-muted">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.toISOString()} className="border-l border-border">
              {Array.from({ length: 24 }, (_, h) => {
                const hourItems = timedItems.filter((it) => itemCoversDay(it, d) && it.start.getHours() === h);
                return (
                  <div
                    key={h}
                    onClick={() => !readOnly && onSlotClick(hourAt(d, h))}
                    className={`h-11 border-b border-border p-0.5 ${!readOnly ? "cursor-pointer hover:bg-surface-raised" : ""}`}
                  >
                    {hourItems.map((it) => {
                      const color = colorFor(it.objectTypeId);
                      return (
                        <button
                          key={it.objectId}
                          onClick={(e) => {
                            e.stopPropagation();
                            onItemClick(it.objectId);
                          }}
                          className={`mb-0.5 block w-full truncate rounded px-1 text-left text-[10px] ${color.bg} ${color.text}`}
                        >
                          {it.title}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaList({ start, items, onItemClick }: { start: Date; items: CalendarItem[]; onItemClick: (objectId: string) => void }) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
    return days
      .map((date) => ({ date, dayItems: items.filter((it) => itemCoversDay(it, date)) }))
      .filter((g) => g.dayItems.length > 0);
  }, [start, items]);

  if (groups.length === 0) {
    return <p className="p-6 text-sm text-ink-muted">{t("editor.blocks.calendar.noUpcomingItems")}</p>;
  }

  return (
    <div className="divide-y divide-border">
      {groups.map((group) => (
        <div key={group.date.toISOString()} className="p-3">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">
            {group.date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
          </p>
          <div className="space-y-1">
            {group.dayItems.map((it) => {
              const color = colorFor(it.objectTypeId);
              return (
                <button
                  key={it.objectId}
                  onClick={() => onItemClick(it.objectId)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-raised"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                  <span className="truncate">{it.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Own minimal Radix dialog rather than the shared `Modal` component: Modal
 * bakes in z-40/z-50 with no way to override, which would render behind this
 * block's own z-[60] fullscreen mode - both the overlay and content need
 * z-[70] to out-rank it.
 */
function CreateItemDialog({
  open,
  onOpenChange,
  date,
  configs,
  objectTypes,
  propertyByType,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  configs: CalendarBlockObjectTypeConfig[];
  objectTypes: ObjectType[];
  propertyByType: Map<string, Property>;
  workspaceId: string;
  onCreated: (objectId: string, objectTypeId: string) => void;
}) {
  const { t } = useTranslation();
  const [objectTypeId, setObjectTypeId] = useState(configs[0]?.objectTypeId ?? "");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (open) {
      setObjectTypeId(configs[0]?.objectTypeId ?? "");
      setTitle("");
    }
  }, [open, configs]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!date || !objectTypeId) return null;
      const property = propertyByType.get(objectTypeId);
      if (!property) return null;
      const dateStr = date.toISOString().slice(0, 10);
      const value = property.config.type === "daterange" ? { start: dateStr, end: dateStr } : date.toISOString();
      const created = await objectApi.create(workspaceId, { objectTypeId, title, values: { [property.key]: value } });
      return created;
    },
    onSuccess: (created) => {
      if (created) onCreated(created.id, objectTypeId);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-raised p-5 shadow-lg outline-none">
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title className="text-base font-semibold">{t("editor.blocks.calendar.newItem")}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
              <Icon name="close" className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {date && (
            <Dialog.Description className="mt-1.5 text-sm text-ink-muted">
              {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </Dialog.Description>
          )}
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <select
              value={objectTypeId}
              onChange={(e) => setObjectTypeId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            >
              {configs.map((cfg) => (
                <option key={cfg.objectTypeId} value={cfg.objectTypeId}>
                  {objectTypes.find((t) => t.id === cfg.objectTypeId)?.name ?? cfg.objectTypeId}
                </option>
              ))}
            </select>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("editor.blocks.calendar.titlePlaceholder")}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex justify-end gap-2">
              <Button type="submit" variant="primary" disabled={!title.trim() || createMutation.isPending}>
                {t("editor.blocks.calendar.create")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CalendarBlock({ content, workspaceId, objectTypes, onSave }: CalendarBlockProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { readOnly } = useBlockEditor();
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId) });
  const weekStartsOn: WeekStartsOn = workspace?.weekStartsOn ?? "monday";

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [createDialogDate, setCreateDialogDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!isFullscreen) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const objectsQueries = useQueries({
    queries: content.objectTypeConfigs.map((cfg) => ({
      queryKey: ["objects", workspaceId, cfg.objectTypeId],
      // 200 is listObjectsQuerySchema's hard max - a higher value 400s.
      queryFn: () => objectApi.list(workspaceId, { objectTypeId: cfg.objectTypeId, limit: 200 }),
    })),
  });
  const propertiesQueries = useQueries({
    queries: content.objectTypeConfigs.map((cfg) => ({
      queryKey: ["properties", cfg.objectTypeId],
      queryFn: () => schemaApi.properties(cfg.objectTypeId),
    })),
  });

  const propertyByType = useMemo(() => {
    const map = new Map<string, Property>();
    content.objectTypeConfigs.forEach((cfg, index) => {
      const property = propertiesQueries[index]?.data?.find((p) => p.id === cfg.datePropertyId);
      if (property) map.set(cfg.objectTypeId, property);
    });
    return map;
  }, [content.objectTypeConfigs, propertiesQueries]);

  const items = useMemo<CalendarItem[]>(() => {
    const result: CalendarItem[] = [];
    content.objectTypeConfigs.forEach((cfg, index) => {
      const property = propertyByType.get(cfg.objectTypeId);
      if (!property) return;
      const objects = objectsQueries[index]?.data?.items ?? [];
      for (const obj of objects) {
        const raw = obj.values[property.key];
        if (raw === null || raw === undefined) continue;
        if (property.config.type === "daterange") {
          const range = raw as { start: string; end: string };
          if (!range.start) continue;
          result.push({
            objectId: obj.id,
            title: obj.title,
            start: new Date(range.start),
            end: new Date(range.end || range.start),
            isRange: true,
            objectTypeId: cfg.objectTypeId,
          });
        } else if (typeof raw === "string") {
          const date = new Date(raw);
          if (Number.isNaN(date.getTime())) continue;
          result.push({ objectId: obj.id, title: obj.title, start: date, end: date, isRange: false, objectTypeId: cfg.objectTypeId });
        }
      }
    });
    return result;
  }, [content.objectTypeConfigs, propertyByType, objectsQueries]);

  if (content.objectTypeConfigs.length === 0) {
    return <CalendarConfigEditor objectTypes={objectTypes} onSave={onSave} />;
  }

  const granularity: Granularity = content.granularity ?? "month";

  function setGranularity(g: Granularity): void {
    void onSave({ ...content, granularity: g });
  }

  function openObject(objectId: string): void {
    navigate(`/w/${workspaceId}/objects/${objectId}`);
  }

  function shiftDate(dir: number): void {
    setCurrentDate((d) => {
      const next = new Date(d);
      switch (granularity) {
        case "year":
          next.setFullYear(next.getFullYear() + dir);
          break;
        case "month":
          next.setMonth(next.getMonth() + dir);
          break;
        case "week":
          next.setDate(next.getDate() + dir * 7);
          break;
        case "day":
          next.setDate(next.getDate() + dir);
          break;
        case "agenda":
          next.setDate(next.getDate() + dir * 30);
          break;
      }
      return next;
    });
  }

  function handleYearDayClick(date: Date): void {
    setCurrentDate(date);
    setGranularity("day");
  }

  const headerLabel = (() => {
    switch (granularity) {
      case "year":
        return String(currentDate.getFullYear());
      case "month":
        return currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      case "week": {
        const s = startOfWeek(currentDate, weekStartsOn);
        const e = new Date(s);
        e.setDate(e.getDate() + 6);
        return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`;
      }
      case "day":
        return currentDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      case "agenda":
        return t("editor.blocks.calendar.upcoming");
    }
  })();

  return (
    <div
      className={`flex flex-col overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-[60] bg-surface" : "h-[600px] w-full rounded-lg border border-border"
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-surface-raised px-2 py-1">
        {GRANULARITIES.map((g) => (
          <button
            key={g}
            type="button"
            data-view-toggle
            onClick={() => setGranularity(g)}
            className={`rounded px-2 py-1 text-xs capitalize ${
              granularity === g ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {g}
          </button>
        ))}
        <div className="ml-2 flex items-center gap-0.5">
          <button type="button" data-view-toggle onClick={() => shiftDate(-1)} className="rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink">
            <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" />
          </button>
          <button
            type="button"
            data-view-toggle
            onClick={() => setCurrentDate(new Date())}
            className="rounded px-2 py-1 text-xs text-ink-muted hover:bg-surface hover:text-ink"
          >
            {t("editor.blocks.calendar.today")}
          </button>
          <button type="button" data-view-toggle onClick={() => shiftDate(1)} className="rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink">
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="ml-2 truncate text-sm font-medium">{headerLabel}</span>
        <button
          type="button"
          data-view-toggle
          onClick={() => setIsFullscreen((v) => !v)}
          title={isFullscreen ? t("editor.blocks.calendar.exitFullscreen") : t("editor.blocks.calendar.fillWindow")}
          className="ml-auto rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
        >
          <Icon name={isFullscreen ? "minimize" : "maximize"} className="h-3.5 w-3.5" />
        </button>
      </div>
      {content.objectTypeConfigs.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-3 border-b border-border px-3 py-1.5 text-xs">
          {content.objectTypeConfigs.map((cfg) => {
            const type = objectTypes.find((t) => t.id === cfg.objectTypeId);
            const color = colorFor(cfg.objectTypeId);
            return (
              <span key={cfg.objectTypeId} className="flex items-center gap-1.5 text-ink-muted">
                <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                {type?.name ?? t("editor.blocks.calendar.unknownType")}
              </span>
            );
          })}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {granularity === "month" && (
          <MonthGrid
            cursor={currentDate}
            weekStartsOn={weekStartsOn}
            items={items}
            readOnly={readOnly}
            onDayClick={setCreateDialogDate}
            onItemClick={openObject}
          />
        )}
        {granularity === "year" && (
          <YearGrid year={currentDate.getFullYear()} weekStartsOn={weekStartsOn} items={items} onDayClick={handleYearDayClick} />
        )}
        {granularity === "week" && (
          <HourGrid
            days={weekDays(currentDate, weekStartsOn)}
            items={items}
            readOnly={readOnly}
            onSlotClick={setCreateDialogDate}
            onItemClick={openObject}
          />
        )}
        {granularity === "day" && (
          <HourGrid days={[currentDate]} items={items} readOnly={readOnly} onSlotClick={setCreateDialogDate} onItemClick={openObject} />
        )}
        {granularity === "agenda" && <AgendaList start={currentDate} items={items} onItemClick={openObject} />}
      </div>
      <CreateItemDialog
        open={createDialogDate !== null}
        onOpenChange={(open) => {
          if (!open) setCreateDialogDate(null);
        }}
        date={createDialogDate}
        configs={content.objectTypeConfigs}
        objectTypes={objectTypes}
        propertyByType={propertyByType}
        workspaceId={workspaceId}
        onCreated={(objectId, objectTypeId) => {
          setCreateDialogDate(null);
          void queryClient.invalidateQueries({ queryKey: ["objects", workspaceId, objectTypeId] });
          openObject(objectId);
        }}
      />
    </div>
  );
}
