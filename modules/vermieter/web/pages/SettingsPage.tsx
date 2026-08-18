import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vermieterApi, type LandlordProfileInput } from "../api.js";
import { Modal } from "../../../../packages/web/src/components/ui/Modal.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const RESET_CONFIRMATION_PHRASE = "ZURÜCKSETZEN";

/** Vermieter-Stammdaten (Name/Adresse/Kontakt/IBAN) - erscheinen als Briefkopf auf jedem generierten PDF. Singleton pro Workspace, gespeichert via PUT-Upsert. Mirror von modules/faktura/web/pages/CompanySettingsPage.tsx. */
function SettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["module-vermieter-landlord-profile", workspaceId];

  const { data } = useQuery({
    queryKey,
    queryFn: () => vermieterApi.landlordProfile.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [form, setForm] = useState<LandlordProfileInput>({ name: "", street: "", postalCode: "", city: "", phone: "", email: "", iban: "" });

  useEffect(() => {
    if (data) setForm({ name: data.name, street: data.street, postalCode: data.postalCode, city: data.city, phone: data.phone, email: data.email, iban: data.iban });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => vermieterApi.landlordProfile.update(workspaceId!, form),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState("");
  const resetMutation = useMutation({
    mutationFn: () => vermieterApi.reset(workspaceId!, resetConfirmationText),
    onSuccess: () => {
      setResetModalOpen(false);
      setResetConfirmationText("");
      void queryClient.invalidateQueries();
    },
  });

  function field<K extends keyof LandlordProfileInput>(key: K, value: LandlordProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">Vermieter-Stammdaten</h1>
        <p className="text-sm text-ink-muted">Diese Angaben erscheinen als Briefkopf auf jeder generierten Nebenkostenabrechnung und Steuerübersicht.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={labelClass}>
          <span className={labelTextClass}>Name</span>
          <input className={inputClass} value={form.name} onChange={(e) => field("name", e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Straße, Hausnummer</span>
            <input className={inputClass} value={form.street} onChange={(e) => field("street", e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>PLZ</span>
            <input className={inputClass} value={form.postalCode} onChange={(e) => field("postalCode", e.target.value)} />
          </label>
        </div>
        <label className={labelClass}>
          <span className={labelTextClass}>Ort</span>
          <input className={inputClass} value={form.city} onChange={(e) => field("city", e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Telefon</span>
            <input className={inputClass} value={form.phone} onChange={(e) => field("phone", e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>E-Mail</span>
            <input className={inputClass} value={form.email} onChange={(e) => field("email", e.target.value)} />
          </label>
        </div>
        <label className={labelClass}>
          <span className={labelTextClass}>IBAN</span>
          <input className={inputClass} value={form.iban} onChange={(e) => field("iban", e.target.value)} />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {saveMutation.isSuccess && <span className="text-xs text-ink-muted">Gespeichert.</span>}
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>

      <section className="space-y-3 rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Gefahrenzone</h2>
        <p className="text-xs text-ink-muted">
          Löscht unwiderruflich alle Immobilien, Einheiten, Zähler, Mieter, Mietverträge, Zahlungen, Belege, Abrechnungen und
          Rücklagenbuchungen dieses Workspaces. Die Vermieter-Stammdaten bleiben erhalten.
        </p>
        <button
          type="button"
          onClick={() => setResetModalOpen(true)}
          className="rounded-md border border-red-400 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900"
        >
          Vermieter-Daten zurücksetzen…
        </button>
      </section>

      <Modal
        open={resetModalOpen}
        onOpenChange={(open) => {
          setResetModalOpen(open);
          if (!open) setResetConfirmationText("");
        }}
        title="Vermieter-Daten wirklich zurücksetzen?"
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Diese Aktion kann <strong>nicht rückgängig gemacht werden</strong>.
          </p>
          <label className={labelClass}>
            <span className={labelTextClass}>
              Zum Bestätigen bitte <code>{RESET_CONFIRMATION_PHRASE}</code> eingeben
            </span>
            <input className={inputClass} value={resetConfirmationText} onChange={(e) => setResetConfirmationText(e.target.value)} autoFocus />
          </label>
          {resetMutation.isError && <p className="text-xs text-red-500">Fehler beim Zurücksetzen.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setResetModalOpen(false);
                setResetConfirmationText("");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={resetConfirmationText !== RESET_CONFIRMATION_PHRASE || resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Endgültig zurücksetzen
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export { SettingsPage };
