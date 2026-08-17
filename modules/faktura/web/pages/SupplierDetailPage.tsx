import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fakturaApi, type SupplierInput } from "../api.js";

const EMPTY: SupplierInput = {
  name: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  vatId: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  notes: "",
};

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

/** Anlegen/Bearbeiten eines Lieferanten - reine Stammdaten. `:id === "neu"` -> Anlage-Modus. */
function SupplierDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SupplierInput>(EMPTY);

  const { data: supplier } = useQuery({
    queryKey: ["module-faktura-supplier", workspaceId, id],
    queryFn: () => fakturaApi.suppliers.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name,
        street: supplier.street,
        postalCode: supplier.postalCode,
        city: supplier.city,
        country: supplier.country,
        vatId: supplier.vatId,
        contactName: supplier.contactName,
        contactEmail: supplier.contactEmail,
        contactPhone: supplier.contactPhone,
        notes: supplier.notes,
      });
    }
  }, [supplier]);

  const saveMutation = useMutation({
    mutationFn: () => (isNew ? fakturaApi.suppliers.create(workspaceId!, form) : fakturaApi.suppliers.update(workspaceId!, id!, form)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-suppliers", workspaceId] });
      navigate(`/w/${workspaceId}/modules/faktura/lieferanten/${saved.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim()) saveMutation.mutate();
  }

  function field<K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">{isNew ? "Neuer Lieferant" : form.name || "Lieferant bearbeiten"}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={labelClass}>
          <span className={labelTextClass}>Name *</span>
          <input className={inputClass} value={form.name} onChange={(e) => field("name", e.target.value)} required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Straße</span>
            <input className={inputClass} value={form.street} onChange={(e) => field("street", e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>PLZ</span>
            <input className={inputClass} value={form.postalCode} onChange={(e) => field("postalCode", e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Ort</span>
            <input className={inputClass} value={form.city} onChange={(e) => field("city", e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Land</span>
            <input className={inputClass} value={form.country} onChange={(e) => field("country", e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>USt-IdNr.</span>
            <input className={inputClass} value={form.vatId} onChange={(e) => field("vatId", e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Kontaktperson</span>
            <input className={inputClass} value={form.contactName} onChange={(e) => field("contactName", e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>E-Mail</span>
            <input className={inputClass} value={form.contactEmail} onChange={(e) => field("contactEmail", e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Telefon</span>
            <input className={inputClass} value={form.contactPhone} onChange={(e) => field("contactPhone", e.target.value)} />
          </label>
        </div>
        <label className={labelClass}>
          <span className={labelTextClass}>Notizen</span>
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => field("notes", e.target.value)} />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>
    </div>
  );
}

export { SupplierDetailPage };
