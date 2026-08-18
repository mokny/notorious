import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { vermieterApi, type CostCircuitDto, type PropertyInput, type UnitInput } from "../api.js";
import { UnitMetersPanel } from "../components/UnitMetersPanel.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

const EMPTY_UNIT: UnitInput = { propertyId: "", label: "", floor: "", sizeSqm: 0, rooms: null, heatingType: "", notes: "" };

/** Anlegen/Bearbeiten einer Immobilie inkl. ihrer Einheiten (Einheiten haben keinen eigenen Top-Level-Nav-Eintrag, sie werden hier verwaltet). `:id === "neu"` -> Anlage-Modus. */
function PropertyDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: property } = useQuery({
    queryKey: ["module-vermieter-property", workspaceId, id],
    queryFn: () => vermieterApi.properties.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: units } = useQuery({
    queryKey: ["module-vermieter-units", workspaceId, id],
    queryFn: () => vermieterApi.units.list(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: leases } = useQuery({
    queryKey: ["module-vermieter-leases", workspaceId],
    queryFn: () => vermieterApi.leases.list(workspaceId!),
    enabled: Boolean(workspaceId) && !isNew,
  });

  const [form, setForm] = useState({
    name: "",
    street: "",
    houseNumber: "",
    postalCode: "",
    city: "",
    country: "DE",
    purchaseDate: "",
    purchasePrice: "",
    buildingYear: "",
    landValue: "",
    notes: "",
  });

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name,
        street: property.street,
        houseNumber: property.houseNumber,
        postalCode: property.postalCode,
        city: property.city,
        country: property.country,
        purchaseDate: property.purchaseDate ?? "",
        purchasePrice: property.purchasePriceCents != null ? (property.purchasePriceCents / 100).toFixed(2).replace(".", ",") : "",
        buildingYear: property.buildingYear != null ? String(property.buildingYear) : "",
        landValue: property.landValueCents != null ? (property.landValueCents / 100).toFixed(2).replace(".", ",") : "",
        notes: property.notes,
      });
    }
  }, [property]);

  function field<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const input: PropertyInput = {
        name: form.name,
        street: form.street,
        houseNumber: form.houseNumber,
        postalCode: form.postalCode,
        city: form.city,
        country: form.country,
        purchaseDate: form.purchaseDate || null,
        purchasePriceCents: form.purchasePrice.trim() ? parseCentsInput(form.purchasePrice) : null,
        buildingYear: form.buildingYear.trim() ? Number(form.buildingYear) : null,
        landValueCents: form.landValue.trim() ? parseCentsInput(form.landValue) : null,
        notes: form.notes,
      };
      return isNew ? vermieterApi.properties.create(workspaceId!, input) : vermieterApi.properties.update(workspaceId!, id!, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-properties", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/immobilien/${saved.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim() && form.street.trim() && form.houseNumber.trim() && form.postalCode.trim() && form.city.trim()) saveMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <h1 className="text-xl font-semibold">{isNew ? "Neue Immobilie" : property?.name || "Immobilie bearbeiten"}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Name *</span>
            <input className={inputClass} value={form.name} onChange={(e) => field("name", e.target.value)} required />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Straße *</span>
              <input className={inputClass} value={form.street} onChange={(e) => field("street", e.target.value)} required />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Hausnummer *</span>
              <input className={inputClass} value={form.houseNumber} onChange={(e) => field("houseNumber", e.target.value)} required />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Land</span>
              <input className={inputClass} value={form.country} onChange={(e) => field("country", e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>PLZ *</span>
              <input className={inputClass} value={form.postalCode} onChange={(e) => field("postalCode", e.target.value)} required />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Ort *</span>
              <input className={inputClass} value={form.city} onChange={(e) => field("city", e.target.value)} required />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Anschaffung &amp; Steuerdaten</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Kaufdatum</span>
              <input type="date" className={inputClass} value={form.purchaseDate} onChange={(e) => field("purchaseDate", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Baujahr</span>
              <input type="number" className={inputClass} value={form.buildingYear} onChange={(e) => field("buildingYear", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Kaufpreis (€)</span>
              <input className={inputClass} value={form.purchasePrice} onChange={(e) => field("purchasePrice", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Bodenwert (€)</span>
              <input className={inputClass} value={form.landValue} onChange={(e) => field("landValue", e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-ink-muted">Kaufpreis und Bodenwert werden für die lineare AfA-Berechnung (§7 EStG) in der Steuerübersicht genutzt.</p>
        </section>

        <section className="space-y-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Notizen</span>
            <textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => field("notes", e.target.value)} />
          </label>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>

      {!isNew && workspaceId && id && (
        <UnitsSection workspaceId={workspaceId} propertyId={id} units={units ?? []} leases={leases ?? []} />
      )}

      {!isNew && workspaceId && id && (
        <CostCircuitsSection workspaceId={workspaceId} propertyId={id} units={units ?? []} />
      )}
    </div>
  );
}

function UnitsSection({
  workspaceId,
  propertyId,
  units,
  leases,
}: {
  workspaceId: string;
  propertyId: string;
  units: { id: string; label: string; floor: string; sizeSqm: number; rooms: number | null; heatingType: string; archivedAt: string | null }[];
  leases: { id: string; unitId: string; status: string; coldRentCents: number; nkPrepaymentCents: number }[];
}) {
  const queryClient = useQueryClient();
  const unitsKey = ["module-vermieter-units", workspaceId, propertyId];
  const [showForm, setShowForm] = useState(false);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<UnitInput>({ ...EMPTY_UNIT, propertyId });

  const createUnitMutation = useMutation({
    mutationFn: () => vermieterApi.units.create(workspaceId, { ...unitForm, propertyId }),
    onSuccess: () => {
      setUnitForm({ ...EMPTY_UNIT, propertyId });
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: unitsKey });
    },
  });

  const archiveUnitMutation = useMutation({
    mutationFn: (unitId: string) => vermieterApi.units.archive(workspaceId, unitId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: unitsKey }),
  });

  function activeLeaseFor(unitId: string) {
    return leases.find((lease) => lease.unitId === unitId && lease.status === "active");
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Einheiten</h2>
        <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Abbrechen" : "+ Einheit"}
        </button>
      </div>

      {showForm && (
        <form
          className="grid grid-cols-3 gap-3 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (unitForm.label.trim() && unitForm.sizeSqm > 0) createUnitMutation.mutate();
          }}
        >
          <label className={labelClass}>
            <span className={labelTextClass}>Bezeichnung *</span>
            <input className={inputClass} value={unitForm.label} onChange={(e) => setUnitForm((f) => ({ ...f, label: e.target.value }))} required />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Etage</span>
            <input className={inputClass} value={unitForm.floor} onChange={(e) => setUnitForm((f) => ({ ...f, floor: e.target.value }))} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Wohnfläche (m²) *</span>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={unitForm.sizeSqm || ""}
              onChange={(e) => setUnitForm((f) => ({ ...f, sizeSqm: Number(e.target.value) }))}
              required
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Zimmer</span>
            <input
              type="number"
              className={inputClass}
              value={unitForm.rooms ?? ""}
              onChange={(e) => setUnitForm((f) => ({ ...f, rooms: e.target.value ? Number(e.target.value) : null }))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Heizungsart</span>
            <input className={inputClass} value={unitForm.heatingType} onChange={(e) => setUnitForm((f) => ({ ...f, heatingType: e.target.value }))} />
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
              Anlegen
            </button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {units
          .filter((u) => !u.archivedAt)
          .map((unit) => {
            const activeLease = activeLeaseFor(unit.id);
            return (
              <li key={unit.id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button type="button" className="font-medium hover:underline" onClick={() => setExpandedUnitId((v) => (v === unit.id ? null : unit.id))}>
                    {unit.label}
                  </button>
                  <span className="flex items-center gap-3 text-xs text-ink-muted">
                    <span>{unit.sizeSqm} m²</span>
                    {activeLease ? (
                      <Link to={`/w/${workspaceId}/modules/vermieter/mietvertraege/${activeLease.id}`} className="text-accent hover:underline">
                        Vermietet ({formatCents(activeLease.coldRentCents + activeLease.nkPrepaymentCents)}/Monat)
                      </Link>
                    ) : (
                      <span>Leerstand</span>
                    )}
                    <button type="button" className="hover:text-red-500" onClick={() => archiveUnitMutation.mutate(unit.id)}>
                      Archivieren
                    </button>
                  </span>
                </div>
                {expandedUnitId === unit.id && <UnitMetersPanel workspaceId={workspaceId} unitId={unit.id} />}
              </li>
            );
          })}
        {units.filter((u) => !u.archivedAt).length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Einheiten angelegt.</li>}
      </ul>
    </section>
  );
}

function CostCircuitsSection({
  workspaceId,
  propertyId,
  units,
}: {
  workspaceId: string;
  propertyId: string;
  units: { id: string; label: string; archivedAt: string | null }[];
}) {
  const queryClient = useQueryClient();
  const circuitsKey = ["module-vermieter-cost-circuits", workspaceId, propertyId];
  const { data: circuits } = useQuery({
    queryKey: circuitsKey,
    queryFn: () => vermieterApi.costCircuits.list(workspaceId, propertyId),
  });

  const [showForm, setShowForm] = useState(false);
  const [newCircuitName, setNewCircuitName] = useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: circuitsKey });

  const createMutation = useMutation({
    mutationFn: () => vermieterApi.costCircuits.create(workspaceId, propertyId, newCircuitName),
    onSuccess: () => {
      setNewCircuitName("");
      setShowForm(false);
      invalidate();
    },
  });

  const activeUnits = units.filter((u) => !u.archivedAt);

  function unitLabel(unitId: string): string {
    return units.find((u) => u.id === unitId)?.label ?? unitId;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Abrechnungskreise</h2>
        <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Abbrechen" : "+ Kreis erstellen"}
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Ein Abrechnungskreis legt fest, welche Einheiten sich einen Kostentopf teilen. Nutze eigene Kreise für Kosten, die
        nicht alle Einheiten betreffen – z. B. wenn einzelne Wohnungen einen eigenen Durchlauferhitzer haben und daher
        nicht am Kreis „Zentralheizung/Warmwasser" beteiligt sind und dessen Kosten nicht mittragen.
      </p>

      {showForm && (
        <form
          className="flex items-end gap-2 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCircuitName.trim()) createMutation.mutate();
          }}
        >
          <label className={labelClass}>
            <span className={labelTextClass}>Name des Kreises *</span>
            <input
              className={inputClass}
              value={newCircuitName}
              onChange={(e) => setNewCircuitName(e.target.value)}
              placeholder="z. B. Zentralheizung/Warmwasser"
              required
            />
          </label>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
            Anlegen
          </button>
        </form>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {circuits?.map((circuit) => (
          <CostCircuitRow
            key={circuit.id}
            workspaceId={workspaceId}
            propertyId={propertyId}
            circuit={circuit}
            activeUnits={activeUnits}
            unitLabel={unitLabel}
            onChanged={invalidate}
          />
        ))}
        {circuits?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Abrechnungskreise angelegt.</li>}
      </ul>
    </section>
  );
}

function CostCircuitRow({
  workspaceId,
  propertyId,
  circuit,
  activeUnits,
  unitLabel,
  onChanged,
}: {
  workspaceId: string;
  propertyId: string;
  circuit: CostCircuitDto;
  activeUnits: { id: string; label: string }[];
  unitLabel: (unitId: string) => string;
  onChanged: () => void;
}) {
  const [editingUnits, setEditingUnits] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(circuit.name);
  const [unitDraft, setUnitDraft] = useState<string[]>(circuit.unitIds);

  const renameMutation = useMutation({
    mutationFn: () => vermieterApi.costCircuits.rename(workspaceId, propertyId, circuit.id, nameDraft),
    onSuccess: () => {
      setRenaming(false);
      onChanged();
    },
  });

  const updateUnitsMutation = useMutation({
    mutationFn: () => vermieterApi.costCircuits.updateUnits(workspaceId, propertyId, circuit.id, unitDraft),
    onSuccess: () => {
      setEditingUnits(false);
      onChanged();
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => vermieterApi.costCircuits.remove(workspaceId, propertyId, circuit.id),
    onSuccess: onChanged,
  });

  function handleDelete() {
    if (
      window.confirm(
        `Abrechnungskreis „${circuit.name}" wirklich löschen? Belege, die diesem Kreis zugeordnet sind, werden automatisch dem Standard-Kreis „Gesamtes Objekt" zugeordnet.`,
      )
    ) {
      removeMutation.mutate();
    }
  }

  function toggleUnit(unitId: string) {
    setUnitDraft((prev) => (prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]));
  }

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        {renaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (nameDraft.trim()) renameMutation.mutate();
            }}
          >
            <input className={inputClass} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
            <button type="submit" className="text-xs text-accent">
              Speichern
            </button>
            <button type="button" className="text-xs text-ink-muted" onClick={() => { setRenaming(false); setNameDraft(circuit.name); }}>
              Abbrechen
            </button>
          </form>
        ) : (
          <span className="flex items-center gap-2 font-medium">
            {circuit.name}
            {circuit.isDefault && (
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-normal text-ink-muted">Standard — alle Einheiten</span>
            )}
          </span>
        )}
        {!circuit.isDefault && !renaming && (
          <span className="flex items-center gap-3 text-xs text-ink-muted">
            <button type="button" className="hover:text-accent" onClick={() => setRenaming(true)}>
              Umbenennen
            </button>
            <button
              type="button"
              className="hover:text-accent"
              onClick={() => {
                setUnitDraft(circuit.unitIds);
                setEditingUnits((v) => !v);
              }}
            >
              {editingUnits ? "Abbrechen" : "Einheiten bearbeiten"}
            </button>
            <button type="button" className="hover:text-red-500" onClick={handleDelete}>
              Löschen
            </button>
          </span>
        )}
      </div>

      {circuit.isDefault ? (
        <p className="text-xs text-ink-muted">{activeUnits.map((u) => u.label).join(", ") || "Keine Einheiten"}</p>
      ) : editingUnits ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-surface p-2">
          <div className="flex flex-wrap gap-3">
            {activeUnits.map((unit) => (
              <label key={unit.id} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={unitDraft.includes(unit.id)} onChange={() => toggleUnit(unit.id)} />
                {unit.label}
              </label>
            ))}
            {activeUnits.length === 0 && <span className="text-xs text-ink-muted">Keine Einheiten vorhanden.</span>}
          </div>
          <button
            type="button"
            className="rounded-md bg-accent px-2 py-1 text-xs text-white"
            onClick={() => updateUnitsMutation.mutate()}
            disabled={updateUnitsMutation.isPending}
          >
            Mitgliedschaft speichern
          </button>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          {circuit.unitIds.length > 0 ? circuit.unitIds.map(unitLabel).join(", ") : "Keine Einheiten zugeordnet"}
        </p>
      )}
    </li>
  );
}

export { PropertyDetailPage };
