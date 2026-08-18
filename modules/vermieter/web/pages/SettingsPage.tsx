import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vermieterApi, type LandlordProfileInput } from "../api.js";
import { Modal } from "../../../../packages/web/src/components/ui/Modal.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const RESET_CONFIRMATION_PHRASE = "ZURÜCKSETZEN";

type ResetActionKey = "receipts" | "statements" | "leases" | "properties" | "full";

/**
 * The five "Gefahrenbereich" reset actions (item 7): four scoped resets plus
 * the original whole-module reset, kept as the broadest/last option. Each
 * has its own confirmation phrase (matches modules/vermieter/routes/reset.ts's
 * exported constants exactly) and its own `vermieterApi.reset` method, driven
 * from one config array instead of five near-duplicate button/modal blocks.
 */
const RESET_ACTIONS: {
  key: ResetActionKey;
  label: string;
  phrase: string;
  description: string;
  run: (workspaceId: string, confirmationText: string) => Promise<{ ok: true }>;
}[] = [
  {
    key: "receipts",
    label: "Belege zurücksetzen",
    phrase: "BELEGE LÖSCHEN",
    description: "Löscht alle Belege inkl. angehängter Dokumente/Scans.",
    run: vermieterApi.reset.receipts,
  },
  {
    key: "statements",
    label: "Abrechnungen zurücksetzen",
    phrase: "ABRECHNUNGEN LÖSCHEN",
    description: "Löscht alle Nebenkostenabrechnungen inkl. Kostenzeilen und Mieter-Salden.",
    run: vermieterApi.reset.statements,
  },
  {
    key: "leases",
    label: "Mietverträge, Mieter & Zahlungen zurücksetzen",
    phrase: "MIETVERTRÄGE LÖSCHEN",
    description: "Löscht Mietverträge, Mieterhöhungs-Historie, Mietzahlungen und Mieter.",
    run: vermieterApi.reset.leases,
  },
  {
    key: "properties",
    label: "Immobilien & Einheiten zurücksetzen",
    phrase: "IMMOBILIEN LÖSCHEN",
    description:
      "Löscht Immobilien, Einheiten, Zähler, Abrechnungskreise und die Rücklage – und damit transitiv auch Belege, Abrechnungen und Mietverträge dieser Immobilien.",
    run: vermieterApi.reset.properties,
  },
  {
    key: "full",
    label: "Gesamtes Modul zurücksetzen",
    phrase: RESET_CONFIRMATION_PHRASE,
    description:
      "Löscht unwiderruflich alle Immobilien, Einheiten, Zähler, Mieter, Mietverträge, Zahlungen, Belege, Abrechnungen und Rücklagenbuchungen dieses Workspaces. Die Vermieter-Stammdaten bleiben erhalten.",
    run: vermieterApi.reset.full,
  },
];

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

  const [activeReset, setActiveReset] = useState<ResetActionKey | null>(null);
  const [resetConfirmationText, setResetConfirmationText] = useState("");
  const activeResetAction = RESET_ACTIONS.find((a) => a.key === activeReset) ?? null;
  const resetMutation = useMutation({
    mutationFn: () => {
      if (!activeResetAction) throw new Error("No reset action selected");
      return activeResetAction.run(workspaceId!, resetConfirmationText);
    },
    onSuccess: () => {
      setActiveReset(null);
      setResetConfirmationText("");
      void queryClient.invalidateQueries();
    },
  });

  function closeResetModal() {
    setActiveReset(null);
    setResetConfirmationText("");
  }

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
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Gefahrenbereich</h2>
        <p className="text-xs text-ink-muted">
          Diese Aktionen löschen Daten unwiderruflich. Jede Aktion verlangt eine eigene, exakte Bestätigungsphrase, damit nichts aus
          Versehen zurückgesetzt wird.
        </p>
        <ul className="divide-y divide-red-200 dark:divide-red-900">
          {RESET_ACTIONS.map((action) => (
            <li key={action.key} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-ink">{action.label}</p>
                <p className="text-xs text-ink-muted">{action.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveReset(action.key)}
                className="shrink-0 rounded-md border border-red-400 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900"
              >
                {action.label}…
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Modal
        open={activeResetAction != null}
        onOpenChange={(open) => {
          if (!open) closeResetModal();
        }}
        title={activeResetAction ? `${activeResetAction.label} – wirklich zurücksetzen?` : ""}
      >
        {activeResetAction && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Diese Aktion kann <strong>nicht rückgängig gemacht werden</strong>.
            </p>
            <p className="text-sm text-ink-muted">{activeResetAction.description}</p>
            <label className={labelClass}>
              <span className={labelTextClass}>
                Zum Bestätigen bitte <code>{activeResetAction.phrase}</code> eingeben
              </span>
              <input className={inputClass} value={resetConfirmationText} onChange={(e) => setResetConfirmationText(e.target.value)} autoFocus />
            </label>
            {resetMutation.isError && <p className="text-xs text-red-500">Fehler beim Zurücksetzen.</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closeResetModal} className="rounded-md border border-border px-3 py-1.5 text-sm">
                Abbrechen
              </button>
              <button
                type="button"
                disabled={resetConfirmationText !== activeResetAction.phrase || resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Endgültig zurücksetzen
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export { SettingsPage };
