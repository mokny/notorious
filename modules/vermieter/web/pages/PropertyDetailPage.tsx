import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import {
  vermieterApi,
  type CircuitCategorySettingDto,
  type CostCircuitDto,
  type ExternalCostAllocationDto,
  type PropertyInput,
  type UnitInput,
  type VermieterBillingMode,
} from "../api.js";
import { UnitMetersPanel } from "../components/UnitMetersPanel.js";
import { VERMIETER_COST_CATEGORIES } from "../../db/costCategories.js";

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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
        {!renaming && (
          <span className="flex items-center gap-3 text-xs text-ink-muted">
            {!circuit.isDefault && (
              <>
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
              </>
            )}
            <button type="button" className="hover:text-accent" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Erweitert ausblenden" : "Erweitert"}
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

      {showAdvanced && (
        <CircuitAdvancedPanel
          workspaceId={workspaceId}
          circuit={circuit}
          memberUnits={circuit.isDefault ? activeUnits : activeUnits.filter((u) => circuit.unitIds.includes(u.id))}
        />
      )}
    </li>
  );
}

/**
 * "Erweitert"-Bereich eines Abrechnungskreises: pro Kostenkategorie umschaltbar
 * zwischen "Selbst berechnet" (Standard, unser eigener Umlageschlüssel-Algorithmus)
 * und "Extern abgerechnet" (Techem/ista/Minol o.ä. hat bereits fertige Beträge pro
 * Einheit geliefert) - siehe modules/vermieter/services/externalBilling.ts. Bewusst
 * eingeklappt/sekundär, weil die meisten Vermieter das nie anfassen müssen.
 */
function CircuitAdvancedPanel({
  workspaceId,
  circuit,
  memberUnits,
}: {
  workspaceId: string;
  circuit: CostCircuitDto;
  memberUnits: { id: string; label: string }[];
}) {
  const queryClient = useQueryClient();
  const settingsKey = ["module-vermieter-circuit-category-settings", workspaceId, circuit.id];
  const { data: settings } = useQuery({
    queryKey: settingsKey,
    queryFn: () => vermieterApi.costCircuits.categorySettings.list(workspaceId, circuit.id),
  });

  function settingFor(categoryKey: string): CircuitCategorySettingDto | undefined {
    return settings?.find((s) => s.costCategoryKey === categoryKey);
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-surface p-3">
      <div className="space-y-1">
        <h3 className="text-xs font-semibold text-ink">Abrechnungsart je Kostenkategorie</h3>
        <p className="text-xs text-ink-muted">
          Standardmäßig berechnet Notorious die Kostenanteile jeder Einheit selbst (nach Fläche, Verbrauch, Personenzahl o. ä.).
          Wenn stattdessen ein externer Dienstleister wie Techem oder ista die Heizkosten abliest und dir eine fertige Abrechnung
          mit den Kosten pro Wohnung schickt, kannst du das hier pro Kategorie umstellen und die Beträge aus dieser Abrechnung
          direkt eintragen, statt eigene Zählerstände zu erfassen. Betrifft meist nur Heizung und Warmwasser – für alle anderen
          Kategorien bei „Selbst berechnet" bleiben ist der Normalfall.
        </p>
      </div>
      <ul className="divide-y divide-border/60">
        {VERMIETER_COST_CATEGORIES.map((category) => (
          <CategorySettingRow
            key={category.key}
            workspaceId={workspaceId}
            circuit={circuit}
            categoryKey={category.key}
            categoryLabel={category.label}
            setting={settingFor(category.key)}
            memberUnits={memberUnits}
            onSettingChanged={() => void queryClient.invalidateQueries({ queryKey: settingsKey })}
          />
        ))}
      </ul>
    </div>
  );
}

function CategorySettingRow({
  workspaceId,
  circuit,
  categoryKey,
  categoryLabel,
  setting,
  memberUnits,
  onSettingChanged,
}: {
  workspaceId: string;
  circuit: CostCircuitDto;
  categoryKey: string;
  categoryLabel: string;
  setting: CircuitCategorySettingDto | undefined;
  memberUnits: { id: string; label: string }[];
  onSettingChanged: () => void;
}) {
  const isExternal = setting?.billingMode === "external_provider";
  const [providerDraft, setProviderDraft] = useState(setting?.providerName ?? "");
  const [expanded, setExpanded] = useState(false);

  const setModeMutation = useMutation({
    mutationFn: (input: { billingMode: VermieterBillingMode; providerName?: string | null }) =>
      vermieterApi.costCircuits.categorySettings.set(workspaceId, circuit.id, categoryKey, input),
    onSuccess: onSettingChanged,
  });

  function toggleMode(next: VermieterBillingMode) {
    if (next === "calculated") {
      setModeMutation.mutate({ billingMode: "calculated" });
      setExpanded(false);
    } else {
      setModeMutation.mutate({ billingMode: "external_provider", providerName: providerDraft || null });
      setExpanded(true);
    }
  }

  return (
    <li className="space-y-2 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{categoryLabel}</span>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            value={isExternal ? "external_provider" : "calculated"}
            onChange={(e) => toggleMode(e.target.value as VermieterBillingMode)}
          >
            <option value="calculated">Selbst berechnet</option>
            <option value="external_provider">Extern abgerechnet (Techem/ista o. ä.)</option>
          </select>
          {isExternal && (
            <button type="button" className="text-accent hover:underline" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Einträge ausblenden" : "Beträge verwalten"}
            </button>
          )}
        </div>
      </div>

      {isExternal && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setModeMutation.mutate({ billingMode: "external_provider", providerName: providerDraft || null });
          }}
        >
          <label className="space-y-1">
            <span className="text-ink-muted">Dienstleister</span>
            <input
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              value={providerDraft}
              onChange={(e) => setProviderDraft(e.target.value)}
              placeholder="z. B. Techem, ista"
            />
          </label>
          <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs" disabled={setModeMutation.isPending}>
            Speichern
          </button>
        </form>
      )}

      {isExternal && expanded && (
        <ExternalAllocationsTable workspaceId={workspaceId} circuit={circuit} categoryKey={categoryKey} memberUnits={memberUnits} />
      )}
    </li>
  );
}

const EMPTY_ALLOCATION_FORM = { unitId: "", periodStart: "", periodEnd: "", amount: "0,00", providerReference: "" };

function ExternalAllocationsTable({
  workspaceId,
  circuit,
  categoryKey,
  memberUnits,
}: {
  workspaceId: string;
  circuit: CostCircuitDto;
  categoryKey: string;
  memberUnits: { id: string; label: string }[];
}) {
  const queryClient = useQueryClient();
  const allocationsKey = ["module-vermieter-external-allocations", workspaceId, circuit.id, categoryKey];
  const { data: allocations } = useQuery({
    queryKey: allocationsKey,
    queryFn: () => vermieterApi.costCircuits.externalAllocations.list(workspaceId, circuit.id, { categoryKey }),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_ALLOCATION_FORM, unitId: memberUnits[0]?.id ?? "" });
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: allocationsKey });

  const createMutation = useMutation({
    mutationFn: () =>
      vermieterApi.costCircuits.externalAllocations.create(workspaceId, circuit.id, {
        costCategoryKey: categoryKey,
        unitId: form.unitId,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        amountCents: parseCentsInput(form.amount) ?? 0,
        providerReference: form.providerReference || null,
      }),
    onSuccess: () => {
      setForm({ ...EMPTY_ALLOCATION_FORM, unitId: memberUnits[0]?.id ?? "" });
      setShowForm(false);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (allocationId: string) =>
      vermieterApi.costCircuits.externalAllocations.update(workspaceId, circuit.id, allocationId, {
        unitId: form.unitId,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        amountCents: parseCentsInput(form.amount) ?? 0,
        providerReference: form.providerReference || null,
      }),
    onSuccess: () => {
      setEditingId(null);
      setForm({ ...EMPTY_ALLOCATION_FORM, unitId: memberUnits[0]?.id ?? "" });
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (allocationId: string) => vermieterApi.costCircuits.externalAllocations.remove(workspaceId, circuit.id, allocationId),
    onSuccess: invalidate,
  });

  function unitLabel(unitId: string): string {
    return memberUnits.find((u) => u.id === unitId)?.label ?? unitId;
  }

  function startEdit(allocation: ExternalCostAllocationDto) {
    setEditingId(allocation.id);
    setForm({
      unitId: allocation.unitId,
      periodStart: allocation.periodStart,
      periodEnd: allocation.periodEnd,
      amount: (allocation.amountCents / 100).toFixed(2).replace(".", ","),
      providerReference: allocation.providerReference ?? "",
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_ALLOCATION_FORM, unitId: memberUnits[0]?.id ?? "" });
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-surface-hover p-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="px-2 py-1 text-left">Einheit</th>
              <th className="px-2 py-1 text-left">Zeitraum</th>
              <th className="px-2 py-1 text-right">Betrag</th>
              <th className="px-2 py-1 text-left">Referenz</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {allocations?.map((allocation) => (
              <tr key={allocation.id}>
                <td className="px-2 py-1">{unitLabel(allocation.unitId)}</td>
                <td className="px-2 py-1">
                  {allocation.periodStart} – {allocation.periodEnd}
                </td>
                <td className="px-2 py-1 text-right">{formatCents(allocation.amountCents)}</td>
                <td className="px-2 py-1">{allocation.providerReference || "–"}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <button type="button" className="text-accent hover:underline" onClick={() => startEdit(allocation)}>
                    Bearbeiten
                  </button>{" "}
                  <button type="button" className="text-ink-muted hover:text-red-500" onClick={() => removeMutation.mutate(allocation.id)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {allocations?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-1 text-ink-muted">
                  Noch keine Beträge erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!showForm ? (
        <button type="button" className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => setShowForm(true)}>
          + Eintrag hinzufügen
        </button>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.unitId || !form.periodStart || !form.periodEnd) return;
            if (editingId) updateMutation.mutate(editingId);
            else createMutation.mutate();
          }}
        >
          <label className="space-y-1">
            <span className="text-ink-muted">Einheit</span>
            <select
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              value={form.unitId}
              onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
              required
            >
              <option value="">–</option>
              {memberUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-ink-muted">Von</span>
            <input
              type="date"
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              value={form.periodStart}
              onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-ink-muted">Bis</span>
            <input
              type="date"
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              value={form.periodEnd}
              onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-ink-muted">Betrag (€)</span>
            <input
              className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-xs"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-ink-muted">Referenz</span>
            <input
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              value={form.providerReference}
              onChange={(e) => setForm((f) => ({ ...f, providerReference: e.target.value }))}
              placeholder="z. B. Belegnummer"
            />
          </label>
          <button type="submit" className="rounded-md bg-accent px-2 py-1 text-xs text-white">
            {editingId ? "Speichern" : "Hinzufügen"}
          </button>
          <button type="button" className="text-xs text-ink-muted" onClick={cancelForm}>
            Abbrechen
          </button>
        </form>
      )}
    </div>
  );
}

export { PropertyDetailPage };
