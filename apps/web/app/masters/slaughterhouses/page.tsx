"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";
import { useI18n } from "../../lib/i18n";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type Slaughterhouse = {
  id: string;
  establishmentId: string;
  name: string;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export default function SlaughterhousesPage() {
  const { t } = useI18n();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [slaughterhouses, setSlaughterhouses] = useState<Slaughterhouse[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedEstablishmentId?: string) => {
    const estResp = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResp.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);
    const current = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!current) return;
    setEstablishmentId(current);
    const response = await fetch(`${API_URL}/slaughterhouses?establishmentId=${current}`, { cache: "no-store" });
    const data = (await response.json()) as { slaughterhouses: Slaughterhouse[] };
    setSlaughterhouses(data.slaughterhouses);
  };

  useEffect(() => {
    load().catch(() => setError(t("masters.loadError")));
  }, [t]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const response = await fetch(`${API_URL}/slaughterhouses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        name: name.trim(),
        address: address.trim() || null,
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        status: "ACTIVE",
      }),
    });
    if (!response.ok) {
      setError(t("masters.saveError"));
      return;
    }
    setName("");
    setAddress("");
    setContactName("");
    setPhone("");
    setEmail("");
    setNotes("");
    await load(establishmentId);
  };

  const toggleStatus = async (house: Slaughterhouse) => {
    const response = await fetch(`${API_URL}/slaughterhouses/${house.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: house.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    });
    if (response.ok) await load(establishmentId);
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("masters.slaughterhouses.title")}</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => load(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>
      <section className="rounded-lg bg-slate-900 p-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder={t("masters.form.name")} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder={t("masters.form.address")} value={address} onChange={(e) => setAddress(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder={t("masters.form.contact")} value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder={t("masters.form.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm md:col-span-2" placeholder={t("masters.form.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm md:col-span-2" placeholder={t("masters.form.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">{t("masters.create")}</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>
      <section className="rounded-lg bg-slate-900 p-4 grid gap-2">
        {slaughterhouses.map((house) => (
          <div key={house.id} className="flex items-start justify-between border-b border-slate-800 pb-2">
            <div>
              <p className="font-semibold">{house.name}</p>
              <p className="text-xs text-slate-400">
                {house.address || t("masters.consignors.emptyAddress")} · {house.contactName || t("masters.consignors.emptyContact")} · {house.phone || t("masters.consignors.emptyPhone")}
              </p>
              {(house.email || house.notes) && (
                <p className="text-xs text-slate-500">{house.email || house.notes}</p>
              )}
            </div>
            <button className="rounded bg-slate-700 px-3 py-1 text-xs" onClick={() => toggleStatus(house)}>
              {house.status === "ACTIVE" ? t("masters.status.active") : t("masters.status.inactive")}
            </button>
          </div>
        ))}
        {slaughterhouses.length === 0 && <p className="text-sm text-slate-400">{t("masters.slaughterhouses.emptyList")}</p>}
      </section>
    </main>
  );
}
