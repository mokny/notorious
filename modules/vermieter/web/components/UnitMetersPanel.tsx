import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vermieterApi, type VermieterMeterType } from "../api.js";

const METER_TYPE_LABEL: Record<VermieterMeterType, string> = {
  heating: "Heizung",
  cold_water: "Kaltwasser",
  hot_water: "Warmwasser",
  electricity: "Strom",
  other: "Sonstiges",
};

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1 text-xs";

/** Zähler + Zählerstände einer Einheit - eingebettet in PropertyDetailPage's Einheiten-Liste (Einheiten haben keinen eigenen Top-Level-Nav-Eintrag). */
export function UnitMetersPanel({ workspaceId, unitId }: { workspaceId: string; unitId: string }) {
  const queryClient = useQueryClient();
  const metersKey = ["module-vermieter-meters", workspaceId, unitId];
  const { data: meters } = useQuery({ queryKey: metersKey, queryFn: () => vermieterApi.meters.list(workspaceId, unitId) });

  const [newMeterLabel, setNewMeterLabel] = useState("");
  const [newMeterType, setNewMeterType] = useState<VermieterMeterType>("heating");
  const [newMeterUnit, setNewMeterUnit] = useState("");

  const createMeterMutation = useMutation({
    mutationFn: () => vermieterApi.meters.create(workspaceId, { unitId, type: newMeterType, label: newMeterLabel, unitOfMeasure: newMeterUnit }),
    onSuccess: () => {
      setNewMeterLabel("");
      setNewMeterUnit("");
      void queryClient.invalidateQueries({ queryKey: metersKey });
    },
  });

  const removeMeterMutation = useMutation({
    mutationFn: (id: string) => vermieterApi.meters.remove(workspaceId, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: metersKey }),
  });

  function handleAddMeter(event: FormEvent) {
    event.preventDefault();
    if (newMeterLabel.trim() && newMeterUnit.trim()) createMeterMutation.mutate();
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-3">
      <h3 className="text-xs font-semibold text-ink-muted">Zähler</h3>
      <ul className="space-y-2">
        {meters?.map((meter) => (
          <MeterRow key={meter.id} workspaceId={workspaceId} meter={meter} onRemove={() => removeMeterMutation.mutate(meter.id)} />
        ))}
        {meters?.length === 0 && <li className="text-xs text-ink-muted">Keine Zähler erfasst.</li>}
      </ul>
      <form onSubmit={handleAddMeter} className="grid grid-cols-4 items-end gap-2">
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Bezeichnung</span>
          <input className={inputClass} value={newMeterLabel} onChange={(e) => setNewMeterLabel(e.target.value)} placeholder="z. B. Wohnzimmer" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Typ</span>
          <select className={inputClass} value={newMeterType} onChange={(e) => setNewMeterType(e.target.value as VermieterMeterType)}>
            {Object.entries(METER_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Einheit</span>
          <input className={inputClass} value={newMeterUnit} onChange={(e) => setNewMeterUnit(e.target.value)} placeholder="z. B. m³, kWh" />
        </label>
        <button type="submit" className="rounded-md bg-accent px-2 py-1 text-xs text-white">
          + Zähler
        </button>
      </form>
    </div>
  );
}

function MeterRow({ workspaceId, meter, onRemove }: { workspaceId: string; meter: { id: string; label: string; type: VermieterMeterType; unitOfMeasure: string }; onRemove: () => void }) {
  const queryClient = useQueryClient();
  const readingsKey = ["module-vermieter-meter-readings", workspaceId, meter.id];
  const [expanded, setExpanded] = useState(false);
  const { data: readings } = useQuery({ queryKey: readingsKey, queryFn: () => vermieterApi.meters.readings(workspaceId, meter.id), enabled: expanded });

  const [readingDate, setReadingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [readingValue, setReadingValue] = useState("");
  const addReadingMutation = useMutation({
    mutationFn: () => vermieterApi.meters.addReading(workspaceId, meter.id, { readingDate, value: Number(readingValue) }),
    onSuccess: () => {
      setReadingValue("");
      void queryClient.invalidateQueries({ queryKey: readingsKey });
    },
  });

  return (
    <li className="rounded-md border border-border/60 p-2 text-xs">
      <div className="flex items-center justify-between">
        <button type="button" className="font-medium hover:underline" onClick={() => setExpanded((v) => !v)}>
          {meter.label} ({METER_TYPE_LABEL[meter.type]}, {meter.unitOfMeasure})
        </button>
        <button type="button" className="text-ink-muted hover:text-red-500" onClick={onRemove}>
          Entfernen
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          <ul className="space-y-0.5">
            {readings?.map((reading) => (
              <li key={reading.id} className="flex justify-between text-ink-muted">
                <span>{reading.readingDate}</span>
                <span>
                  {reading.value} {meter.unitOfMeasure}
                </span>
              </li>
            ))}
            {readings?.length === 0 && <li className="text-ink-muted">Noch keine Zählerstände.</li>}
          </ul>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (readingValue.trim()) addReadingMutation.mutate();
            }}
          >
            <label className="space-y-1">
              <span className="text-ink-muted">Datum</span>
              <input type="date" className={inputClass} value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-ink-muted">Stand</span>
              <input className={inputClass} value={readingValue} onChange={(e) => setReadingValue(e.target.value)} />
            </label>
            <button type="submit" className="rounded-md border border-border px-2 py-1">
              + Stand
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
