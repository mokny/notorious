import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fakturaApi, type CustomerInput, type AddressKind } from "../api.js";
import { AttachmentsPanel } from "../components/AttachmentsPanel.js";

interface ContactForm {
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
}

interface AddressForm {
  kind: AddressKind;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  isDefault: boolean;
}

const EMPTY_CONTACT: ContactForm = { name: "", email: "", phone: "", role: "", isPrimary: false };
const EMPTY_ADDRESS = (kind: AddressKind): AddressForm => ({ kind, street: "", postalCode: "", city: "", country: "DE", isDefault: true });

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

/** Anlegen/Bearbeiten eines Kunden inkl. mehrerer Kontakte und Rechnungs-/Lieferadresse. `:id === "neu"` -> Anlage-Modus, sonst Bearbeitung. */
function CustomerDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer } = useQuery({
    queryKey: ["module-faktura-customer", workspaceId, id],
    queryFn: () => fakturaApi.customers.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });

  const [kind, setKind] = useState<"company" | "person">("company");
  const [displayName, setDisplayName] = useState("");
  const [taxTreatment, setTaxTreatment] = useState<"standard" | "reverse_charge">("standard");
  const [vatId, setVatId] = useState("");
  const [country, setCountry] = useState("DE");
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState<ContactForm[]>([{ ...EMPTY_CONTACT, isPrimary: true }]);
  const [addresses, setAddresses] = useState<AddressForm[]>([EMPTY_ADDRESS("billing")]);

  useEffect(() => {
    if (customer) {
      setKind(customer.kind);
      setDisplayName(customer.displayName);
      setTaxTreatment(customer.taxTreatment);
      setVatId(customer.vatId);
      setCountry(customer.country);
      setNotes(customer.notes);
      if (customer.contacts.length) setContacts(customer.contacts.map((c) => ({ ...c })));
      if (customer.addresses.length) setAddresses(customer.addresses.map((a) => ({ ...a })));
    }
  }, [customer]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const input: CustomerInput = {
        kind,
        displayName,
        taxTreatment,
        vatId,
        country,
        notes,
        contacts: contacts.filter((c) => c.name.trim()),
        addresses,
      };
      return isNew ? fakturaApi.customers.create(workspaceId!, input) : fakturaApi.customers.update(workspaceId!, id!, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-customers", workspaceId] });
      navigate(`/w/${workspaceId}/modules/faktura/kunden/${saved.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (displayName.trim()) saveMutation.mutate();
  }

  function updateContact(index: number, patch: Partial<ContactForm>) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function updateAddress(index: number, patch: Partial<AddressForm>) {
    setAddresses((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">{isNew ? "Neuer Kunde" : displayName || "Kunde bearbeiten"}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Typ</span>
              <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "company" | "person")}>
                <option value="company">Firma</option>
                <option value="person">Privatperson</option>
              </select>
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Name *</span>
              <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Steuerbehandlung</span>
              <select className={inputClass} value={taxTreatment} onChange={(e) => setTaxTreatment(e.target.value as "standard" | "reverse_charge")}>
                <option value="standard">Standard</option>
                <option value="reverse_charge">Reverse-Charge (§13b UStG)</option>
              </select>
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>USt-IdNr.</span>
              <input className={inputClass} value={vatId} onChange={(e) => setVatId(e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Land</span>
              <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} />
            </label>
          </div>
          <label className={labelClass}>
            <span className={labelTextClass}>Notizen</span>
            <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Kontakte</h2>
            <button type="button" className="text-xs text-accent" onClick={() => setContacts((prev) => [...prev, { ...EMPTY_CONTACT }])}>
              + Kontakt
            </button>
          </div>
          {contacts.map((contact, index) => (
            <div key={index} className="grid grid-cols-5 items-end gap-2 rounded-md border border-border p-2">
              <label className={labelClass}>
                <span className={labelTextClass}>Name</span>
                <input className={inputClass} value={contact.name} onChange={(e) => updateContact(index, { name: e.target.value })} />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>E-Mail</span>
                <input className={inputClass} value={contact.email} onChange={(e) => updateContact(index, { email: e.target.value })} />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Telefon</span>
                <input className={inputClass} value={contact.phone} onChange={(e) => updateContact(index, { phone: e.target.value })} />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Rolle</span>
                <input className={inputClass} value={contact.role} onChange={(e) => updateContact(index, { role: e.target.value })} />
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={contact.isPrimary} onChange={(e) => updateContact(index, { isPrimary: e.target.checked })} />
                Primär
              </label>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Adressen</h2>
            <button
              type="button"
              className="text-xs text-accent"
              onClick={() => setAddresses((prev) => [...prev, EMPTY_ADDRESS(prev.some((a) => a.kind === "billing") ? "shipping" : "billing")])}
            >
              + Adresse
            </button>
          </div>
          {addresses.map((address, index) => (
            <div key={index} className="space-y-2 rounded-md border border-border p-2">
              <label className={labelClass}>
                <span className={labelTextClass}>Art</span>
                <select className={inputClass} value={address.kind} onChange={(e) => updateAddress(index, { kind: e.target.value as AddressKind })}>
                  <option value="billing">Rechnungsadresse</option>
                  <option value="shipping">Lieferadresse</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>
                  <span className={labelTextClass}>Straße</span>
                  <input className={inputClass} value={address.street} onChange={(e) => updateAddress(index, { street: e.target.value })} />
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>PLZ</span>
                  <input className={inputClass} value={address.postalCode} onChange={(e) => updateAddress(index, { postalCode: e.target.value })} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>
                  <span className={labelTextClass}>Ort</span>
                  <input className={inputClass} value={address.city} onChange={(e) => updateAddress(index, { city: e.target.value })} />
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>Land</span>
                  <input className={inputClass} value={address.country} onChange={(e) => updateAddress(index, { country: e.target.value })} />
                </label>
              </div>
            </div>
          ))}
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>

      {!isNew && <AttachmentsPanel workspaceId={workspaceId!} entityType="customer" entityId={id!} />}
    </div>
  );
}

export { CustomerDetailPage };
