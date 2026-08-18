import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { vermieterApi, type LeaseInput, type LeaseUpdateInput, type VermieterLeaseStatus } from "../api.js";
import { Modal } from "../../../../packages/web/src/components/ui/Modal.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const today = () => new Date().toISOString().slice(0, 10);

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Anlegen/Bearbeiten eines Mietvertrags inkl. Mieterhöhungs-Historie und Zahlungs-Sub-Tabelle. `:id === "neu"` -> Anlage-Modus. */
function LeaseDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: lease } = useQuery({
    queryKey: ["module-vermieter-lease", workspaceId, id],
    queryFn: () => vermieterApi.leases.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: units } = useQuery({
    queryKey: ["module-vermieter-units-all", workspaceId],
    queryFn: () => vermieterApi.units.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: tenants } = useQuery({
    queryKey: ["module-vermieter-tenants", workspaceId],
    queryFn: () => vermieterApi.tenants.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: rentChanges } = useQuery({
    queryKey: ["module-vermieter-rent-changes", workspaceId, id],
    queryFn: () => vermieterApi.leases.rentChanges(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: payments } = useQuery({
    queryKey: ["module-vermieter-rent-payments", workspaceId, id],
    queryFn: () => vermieterApi.rentPayments.list(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });

  const [unitId, setUnitId] = useState("");
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [coldRent, setColdRent] = useState("0,00");
  const [nkPrepayment, setNkPrepayment] = useState("0,00");
  const [deposit, setDeposit] = useState("");
  const [depositPaidDate, setDepositPaidDate] = useState("");
  const [depositReturnedDate, setDepositReturnedDate] = useState("");
  const [status, setStatus] = useState<VermieterLeaseStatus>("active");
  const [notes, setNotes] = useState("");
  const [personCount, setPersonCount] = useState<number | "">("");
  const [personCountTouched, setPersonCountTouched] = useState(false);

  useEffect(() => {
    if (lease) {
      setUnitId(lease.unitId);
      setTenantIds(lease.tenantIds);
      setStartDate(lease.startDate);
      setEndDate(lease.endDate ?? "");
      setColdRent((lease.coldRentCents / 100).toFixed(2).replace(".", ","));
      setNkPrepayment((lease.nkPrepaymentCents / 100).toFixed(2).replace(".", ","));
      setDeposit(lease.depositCents != null ? (lease.depositCents / 100).toFixed(2).replace(".", ",") : "");
      setDepositPaidDate(lease.depositPaidDate ?? "");
      setDepositReturnedDate(lease.depositReturnedDate ?? "");
      setStatus(lease.status);
      setNotes(lease.notes);
      setPersonCount(lease.personCount);
      setPersonCountTouched(true);
    }
  }, [lease]);

  // Neuanlage: solange der Nutzer die Personenzahl nicht selbst angefasst hat,
  // folgt sie automatisch der Anzahl ausgewählter Mieter (matcht den
  // Server-Default beim Anlegen), bleibt aber jederzeit direkt überschreibbar.
  useEffect(() => {
    if (isNew && !personCountTouched) setPersonCount(tenantIds.length);
  }, [isNew, personCountTouched, tenantIds.length]);

  const createMutation = useMutation({
    mutationFn: () => {
      const input: LeaseInput = {
        unitId,
        startDate,
        endDate: endDate || null,
        coldRentCents: parseCentsInput(coldRent) ?? 0,
        nkPrepaymentCents: parseCentsInput(nkPrepayment) ?? 0,
        depositCents: deposit.trim() ? parseCentsInput(deposit) : null,
        depositPaidDate: depositPaidDate || null,
        depositReturnedDate: depositReturnedDate || null,
        status,
        notes,
        tenantIds,
        personCount: personCount === "" ? null : personCount,
      };
      return vermieterApi.leases.create(workspaceId!, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-leases", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/mietvertraege/${saved.id}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const input: LeaseUpdateInput = {
        unitId,
        startDate,
        endDate: endDate || null,
        depositCents: deposit.trim() ? parseCentsInput(deposit) : null,
        depositPaidDate: depositPaidDate || null,
        depositReturnedDate: depositReturnedDate || null,
        status,
        notes,
        tenantIds,
        personCount: personCount === "" ? undefined : personCount,
      };
      return vermieterApi.leases.update(workspaceId!, id!, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-lease", workspaceId, id] });
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-leases", workspaceId] });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!unitId || tenantIds.length === 0 || !startDate) return;
    if (isNew) createMutation.mutate();
    else updateMutation.mutate();
  }

  function toggleTenant(tenantId: string) {
    setTenantIds((prev) => (prev.includes(tenantId) ? prev.filter((t) => t !== tenantId) : [...prev, tenantId]));
  }

  const saveMutation = isNew ? createMutation : updateMutation;
  const unit = units?.find((u) => u.id === unitId);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">{isNew ? "Neuer Mietvertrag" : `Mietvertrag ${unit?.label ?? ""}`}</h1>
        {!isNew && lease && (
          <p className="text-sm text-ink-muted">
            Aktuell {formatCents(lease.coldRentCents)} Kaltmiete + {formatCents(lease.nkPrepaymentCents)} NK-Vorauszahlung ={" "}
            {formatCents(lease.coldRentCents + lease.nkPrepaymentCents)}/Monat
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Einheit *</span>
            <select className={inputClass} value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
              <option value="">–</option>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Status</span>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as VermieterLeaseStatus)}>
              <option value="active">Aktiv</option>
              <option value="ended">Beendet</option>
            </select>
          </label>
        </div>

        <label className={labelClass}>
          <span className={labelTextClass}>Mieter *</span>
          <div className="flex flex-wrap gap-2 rounded-md border border-border p-2">
            {tenants?.map((tenant) => (
              <label key={tenant.id} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={tenantIds.includes(tenant.id)} onChange={() => toggleTenant(tenant.id)} />
                <span>{tenant.name}</span>
              </label>
            ))}
            {tenants?.length === 0 && <span className="text-xs text-ink-muted">Keine Mieter angelegt.</span>}
          </div>
        </label>

        <label className={labelClass}>
          <span className={labelTextClass}>Anzahl Personen</span>
          <input
            type="number"
            min={0}
            className={`${inputClass} max-w-[8rem]`}
            value={personCount}
            onChange={(e) => {
              setPersonCountTouched(true);
              setPersonCount(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)));
            }}
          />
          <span className="block text-xs text-ink-muted">
            Kann von der Anzahl der oben ausgewählten Mieter abweichen, z. B. wenn auch Kinder in der Wohnung leben, die nicht
            als eigener Mietvertragspartner geführt werden. Diese Zahl wird nur gebraucht, wenn eine Kostenkategorie „nach
            Personenzahl" abgerechnet wird (z. B. oft die Müllabfuhr).
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Mietbeginn *</span>
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Mietende</span>
            <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        {isNew && (
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Kaltmiete (€) *</span>
              <input className={inputClass} value={coldRent} onChange={(e) => setColdRent(e.target.value)} required />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>NK-Vorauszahlung (€) *</span>
              <input className={inputClass} value={nkPrepayment} onChange={(e) => setNkPrepayment(e.target.value)} required />
            </label>
          </div>
        )}
        {!isNew && (
          <p className="text-xs text-ink-muted">
            Kaltmiete und NK-Vorauszahlung können hier nicht direkt geändert werden – nutze „Miete anpassen" weiter unten, um eine
            Mieterhöhung mit Wirkungsdatum zu erfassen.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Kaution (€)</span>
            <input className={inputClass} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Kaution gezahlt am</span>
            <input type="date" className={inputClass} value={depositPaidDate} onChange={(e) => setDepositPaidDate(e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Kaution zurückgezahlt am</span>
            <input type="date" className={inputClass} value={depositReturnedDate} onChange={(e) => setDepositReturnedDate(e.target.value)} />
          </label>
        </div>

        <label className={labelClass}>
          <span className={labelTextClass}>Notizen</span>
          <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>

      {!isNew && workspaceId && id && (
        <>
          <RentChangeHistory workspaceId={workspaceId} leaseId={id} rentChanges={rentChanges ?? []} />
          <RentPaymentsTable
            workspaceId={workspaceId}
            leaseId={id}
            payments={payments ?? []}
            currentColdRentCents={lease?.coldRentCents ?? 0}
            currentNkPrepaymentCents={lease?.nkPrepaymentCents ?? 0}
          />
        </>
      )}
    </div>
  );
}

function RentChangeHistory({ workspaceId, leaseId, rentChanges }: { workspaceId: string; leaseId: string; rentChanges: { id: string; effectiveDate: string; coldRentCents: number; nkPrepaymentCents: number; note: string }[] }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [coldRent, setColdRent] = useState("0,00");
  const [nkPrepayment, setNkPrepayment] = useState("0,00");
  const [note, setNote] = useState("");

  const changeMutation = useMutation({
    mutationFn: () =>
      vermieterApi.leases.changeRent(workspaceId, leaseId, {
        effectiveDate,
        coldRentCents: parseCentsInput(coldRent) ?? 0,
        nkPrepaymentCents: parseCentsInput(nkPrepayment) ?? 0,
        note,
      }),
    onSuccess: () => {
      setModalOpen(false);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-rent-changes", workspaceId, leaseId] });
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-lease", workspaceId, leaseId] });
    },
  });

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Mieterhöhungs-Historie</h2>
        <button type="button" className="rounded-md border border-border px-3 py-1.5 text-xs" onClick={() => setModalOpen(true)}>
          Miete anpassen
        </button>
      </div>
      <ul className="space-y-1.5">
        {rentChanges.map((change) => (
          <li key={change.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5 text-xs">
            <span>{change.effectiveDate}</span>
            <span>
              {formatCents(change.coldRentCents)} + {formatCents(change.nkPrepaymentCents)} NK ={" "}
              {formatCents(change.coldRentCents + change.nkPrepaymentCents)}
            </span>
            {change.note && <span className="text-ink-muted">{change.note}</span>}
          </li>
        ))}
        {rentChanges.length === 0 && <li className="text-xs text-ink-muted">Noch keine Mieterhöhungen erfasst.</li>}
      </ul>

      <Modal open={modalOpen} onOpenChange={setModalOpen} title="Miete anpassen">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            changeMutation.mutate();
          }}
        >
          <label className={labelClass}>
            <span className={labelTextClass}>Wirkungsdatum *</span>
            <input type="date" className={inputClass} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Neue Kaltmiete (€) *</span>
              <input className={inputClass} value={coldRent} onChange={(e) => setColdRent(e.target.value)} required />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Neue NK-Vorauszahlung (€) *</span>
              <input className={inputClass} value={nkPrepayment} onChange={(e) => setNkPrepayment(e.target.value)} required />
            </label>
          </div>
          <label className={labelClass}>
            <span className={labelTextClass}>Begründung / Notiz</span>
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Mietspiegel-Anpassung" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => setModalOpen(false)}>
              Abbrechen
            </button>
            <button type="submit" disabled={changeMutation.isPending} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Übernehmen
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function RentPaymentsTable({
  workspaceId,
  leaseId,
  payments,
  currentColdRentCents,
  currentNkPrepaymentCents,
}: {
  workspaceId: string;
  leaseId: string;
  payments: { id: string; periodYear: number; periodMonth: number; coldRentDueCents: number; nkPrepaymentDueCents: number; paidAmountCents: number | null; paidDate: string | null; status: string }[];
  currentColdRentCents: number;
  currentNkPrepaymentCents: number;
}) {
  const queryClient = useQueryClient();
  const paymentsKey = ["module-vermieter-rent-payments", workspaceId, leaseId];
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const createMutation = useMutation({
    mutationFn: () =>
      vermieterApi.rentPayments.create(workspaceId, {
        leaseId,
        periodYear: year,
        periodMonth: month,
        coldRentDueCents: currentColdRentCents,
        nkPrepaymentDueCents: currentNkPrepaymentCents,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: paymentsKey }),
  });

  const markPaidMutation = useMutation({
    mutationFn: (payment: { id: string; coldRentDueCents: number; nkPrepaymentDueCents: number }) =>
      vermieterApi.rentPayments.record(workspaceId, payment.id, payment.coldRentDueCents + payment.nkPrepaymentDueCents, today()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: paymentsKey }),
  });

  const statusLabel: Record<string, string> = { open: "Offen", partial: "Teilweise", paid: "Bezahlt" };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Zahlungen</h2>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <select className="rounded-md border border-border bg-surface px-2 py-1 text-xs" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-xs"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs">
            + Zahlungsperiode
          </button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-hover text-ink-muted">
            <tr>
              <th className="px-3 py-2 text-left">Zeitraum</th>
              <th className="px-3 py-2 text-right">Soll</th>
              <th className="px-3 py-2 text-right">Bezahlt</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((payment) => {
              const due = payment.coldRentDueCents + payment.nkPrepaymentDueCents;
              return (
                <tr key={payment.id}>
                  <td className="px-3 py-2">
                    {MONTH_NAMES[payment.periodMonth - 1]} {payment.periodYear}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCents(due)}</td>
                  <td className="px-3 py-2 text-right">{payment.paidAmountCents != null ? formatCents(payment.paidAmountCents) : "–"}</td>
                  <td className="px-3 py-2">{statusLabel[payment.status] ?? payment.status}</td>
                  <td className="px-3 py-2 text-right">
                    {payment.status !== "paid" && (
                      <button type="button" className="text-accent hover:underline" onClick={() => markPaidMutation.mutate(payment)}>
                        Als bezahlt markieren
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-2 text-ink-muted">
                  Noch keine Zahlungsperioden erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export { LeaseDetailPage };
