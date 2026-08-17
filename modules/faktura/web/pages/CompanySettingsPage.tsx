import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fakturaApi, type UpdateCompanySettingsInput } from "../api.js";

const EMPTY_FORM: UpdateCompanySettingsInput = {
  legalName: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  taxNumber: "",
  vatId: "",
  isKleinunternehmer: false,
  bankName: "",
  iban: "",
  bic: "",
  defaultPaymentTermsDays: 14,
  quoteNumberPrefix: "AN",
  orderNumberPrefix: "AB",
  invoiceNumberPrefix: "RE",
  creditNoteNumberPrefix: "GS",
  dunningNumberPrefix: "MA",
  dunningLevel1Days: 7,
  dunningLevel2Days: 14,
  dunningLevel3Days: 28,
  dunningLevel1FeeCents: 0,
  dunningLevel2FeeCents: 500,
  dunningLevel3FeeCents: 1000,
  dunningInterestRatePercent: 9.89,
};

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

/** Firmenstammdaten des Faktura-Mandanten (= dieser Workspace): Adresse, Steuernummern, Kleinunternehmer-Flag, Bankdaten, Belegnummernkreis-Präfixe. Ein Formular pro Workspace (Singleton), gespeichert via PUT-Upsert. */
function CompanySettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["module-faktura-settings", workspaceId];
  const [form, setForm] = useState<UpdateCompanySettingsInput>(EMPTY_FORM);

  const { data } = useQuery({
    queryKey,
    queryFn: () => fakturaApi.settings.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    if (data) {
      setForm({
        legalName: data.legalName,
        street: data.street,
        postalCode: data.postalCode,
        city: data.city,
        country: data.country,
        taxNumber: data.taxNumber,
        vatId: data.vatId,
        isKleinunternehmer: data.isKleinunternehmer,
        bankName: data.bankName,
        iban: data.iban,
        bic: data.bic,
        defaultPaymentTermsDays: data.defaultPaymentTermsDays,
        quoteNumberPrefix: data.quoteNumberPrefix,
        orderNumberPrefix: data.orderNumberPrefix,
        invoiceNumberPrefix: data.invoiceNumberPrefix,
        creditNoteNumberPrefix: data.creditNoteNumberPrefix,
        dunningNumberPrefix: data.dunningNumberPrefix,
        dunningLevel1Days: data.dunningLevel1Days,
        dunningLevel2Days: data.dunningLevel2Days,
        dunningLevel3Days: data.dunningLevel3Days,
        dunningLevel1FeeCents: data.dunningLevel1FeeCents,
        dunningLevel2FeeCents: data.dunningLevel2FeeCents,
        dunningLevel3FeeCents: data.dunningLevel3FeeCents,
        dunningInterestRatePercent: data.dunningInterestRatePercent,
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => fakturaApi.settings.update(workspaceId!, form),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  function field<K extends keyof UpdateCompanySettingsInput>(key: K, value: UpdateCompanySettingsInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">Firmeneinstellungen</h1>
        <p className="text-sm text-ink-muted">Diese Angaben erscheinen auf jedem Angebot, Auftrag, jeder Rechnung und Gutschrift dieses Workspaces.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Firma</h2>
          <label className={labelClass}>
            <span className={labelTextClass}>Firmenname *</span>
            <input className={inputClass} value={form.legalName} onChange={(e) => field("legalName", e.target.value)} required />
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
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Ort</span>
              <input className={inputClass} value={form.city} onChange={(e) => field("city", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Land</span>
              <input className={inputClass} value={form.country} onChange={(e) => field("country", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Steuer</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Steuernummer</span>
              <input className={inputClass} value={form.taxNumber} onChange={(e) => field("taxNumber", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>USt-IdNr.</span>
              <input className={inputClass} value={form.vatId} onChange={(e) => field("vatId", e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isKleinunternehmer} onChange={(e) => field("isKleinunternehmer", e.target.checked)} />
            <span>Kleinunternehmer gem. §19 UStG (keine Umsatzsteuer wird ausgewiesen)</span>
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Bankverbindung</h2>
          <label className={labelClass}>
            <span className={labelTextClass}>Bank</span>
            <input className={inputClass} value={form.bankName} onChange={(e) => field("bankName", e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>IBAN</span>
              <input className={inputClass} value={form.iban} onChange={(e) => field("iban", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>BIC</span>
              <input className={inputClass} value={form.bic} onChange={(e) => field("bic", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Belegnummernkreise &amp; Zahlungsziel</h2>
          <div className="grid grid-cols-4 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Angebot-Präfix</span>
              <input className={inputClass} value={form.quoteNumberPrefix} onChange={(e) => field("quoteNumberPrefix", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Auftrag-Präfix</span>
              <input className={inputClass} value={form.orderNumberPrefix} onChange={(e) => field("orderNumberPrefix", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Rechnung-Präfix</span>
              <input className={inputClass} value={form.invoiceNumberPrefix} onChange={(e) => field("invoiceNumberPrefix", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Gutschrift-Präfix</span>
              <input
                className={inputClass}
                value={form.creditNoteNumberPrefix}
                onChange={(e) => field("creditNoteNumberPrefix", e.target.value)}
              />
            </label>
          </div>
          <label className={labelClass}>
            <span className={labelTextClass}>Standard-Zahlungsziel (Tage)</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.defaultPaymentTermsDays}
              onChange={(e) => field("defaultPaymentTermsDays", Number(e.target.value))}
            />
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Mahnwesen</h2>
          <div className="grid grid-cols-4 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Mahnung-Präfix</span>
              <input className={inputClass} value={form.dunningNumberPrefix} onChange={(e) => field("dunningNumberPrefix", e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Verzugszins (%)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                className={inputClass}
                value={form.dunningInterestRatePercent}
                onChange={(e) => field("dunningInterestRatePercent", Number(e.target.value))}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Stufe 1: Tage überfällig</span>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.dunningLevel1Days}
                onChange={(e) => field("dunningLevel1Days", Number(e.target.value))}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Stufe 2: Tage überfällig</span>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.dunningLevel2Days}
                onChange={(e) => field("dunningLevel2Days", Number(e.target.value))}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Stufe 3: Tage überfällig</span>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={form.dunningLevel3Days}
                onChange={(e) => field("dunningLevel3Days", Number(e.target.value))}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Gebühr Stufe 1 (€)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                className={inputClass}
                value={(form.dunningLevel1FeeCents / 100).toFixed(2)}
                onChange={(e) => field("dunningLevel1FeeCents", Math.round(Number(e.target.value) * 100))}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Gebühr Stufe 2 (€)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                className={inputClass}
                value={(form.dunningLevel2FeeCents / 100).toFixed(2)}
                onChange={(e) => field("dunningLevel2FeeCents", Math.round(Number(e.target.value) * 100))}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Gebühr Stufe 3 (€)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                className={inputClass}
                value={(form.dunningLevel3FeeCents / 100).toFixed(2)}
                onChange={(e) => field("dunningLevel3FeeCents", Math.round(Number(e.target.value) * 100))}
              />
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Speichern
          </button>
          {saveMutation.isSuccess && <span className="text-xs text-ink-muted">Gespeichert.</span>}
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>
    </div>
  );
}

export { CompanySettingsPage };
