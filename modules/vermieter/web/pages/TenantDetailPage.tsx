import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vermieterApi, type TenantInput } from "../api.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

/** Anlegen/Bearbeiten eines Mieters inkl. Übersicht der verknüpften Mietverträge. `:id === "neu"` -> Anlage-Modus. */
function TenantDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: tenant } = useQuery({
    queryKey: ["module-vermieter-tenant", workspaceId, id],
    queryFn: () => vermieterApi.tenants.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: leases } = useQuery({
    queryKey: ["module-vermieter-leases", workspaceId],
    queryFn: () => vermieterApi.leases.list(workspaceId!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: units } = useQuery({
    queryKey: ["module-vermieter-units-all", workspaceId],
    queryFn: () => vermieterApi.units.list(workspaceId!),
    enabled: Boolean(workspaceId) && !isNew,
  });

  const [form, setForm] = useState<TenantInput>({ name: "", email: "", phone: "", notes: "" });

  useEffect(() => {
    if (tenant) setForm({ name: tenant.name, email: tenant.email, phone: tenant.phone, notes: tenant.notes });
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: () => (isNew ? vermieterApi.tenants.create(workspaceId!, form) : vermieterApi.tenants.update(workspaceId!, id!, form)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-tenants", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/mieter/${saved.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim()) saveMutation.mutate();
  }

  const linkedLeases = leases?.filter((lease) => lease.tenantIds.includes(id ?? "")) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <h1 className="text-xl font-semibold">{isNew ? "Neuer Mieter" : tenant?.name || "Mieter bearbeiten"}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={labelClass}>
          <span className={labelTextClass}>Name *</span>
          <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>E-Mail</span>
            <input className={inputClass} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Telefon</span>
            <input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
        </div>
        <label className={labelClass}>
          <span className={labelTextClass}>Notizen</span>
          <textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>

      {!isNew && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Mietverträge</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {linkedLeases.map((lease) => {
              const unit = units?.find((u) => u.id === lease.unitId);
              return (
                <li key={lease.id}>
                  <Link
                    to={`/w/${workspaceId}/modules/vermieter/mietvertraege/${lease.id}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface-hover"
                  >
                    <span>{unit?.label ?? lease.unitId}</span>
                    <span className="text-xs text-ink-muted">{lease.status === "active" ? "Aktiv" : "Beendet"}</span>
                  </Link>
                </li>
              );
            })}
            {linkedLeases.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Keine Mietverträge verknüpft.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}

export { TenantDetailPage };
