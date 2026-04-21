"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type Consignor = {
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

export default function ConsignorsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [consignors, setConsignors] = useState<Consignor[]>([]);
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
    const response = await fetch(`${API_URL}/consignors?establishmentId=${current}`, { cache: "no-store" });
    const data = (await response.json()) as { consignors: Consignor[] };
    setConsignors(data.consignors);
  };

  useEffect(() => {
    load().catch(() => setError("No se pudieron cargar consignatarios."));
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const response = await fetch(`${API_URL}/consignors`, {
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
      setError("No se pudo crear consignatario.");
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

  const toggleStatus = async (consignor: Consignor) => {
    const response = await fetch(`${API_URL}/consignors/${consignor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: consignor.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    });
    if (response.ok) await load(establishmentId);
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Consignatarios</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => load(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>
      <section className="rounded-lg bg-slate-900 p-4">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Contacto" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Celular / Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm md:col-span-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm md:col-span-2" placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Crear</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>
      <section className="rounded-lg bg-slate-900 p-4 grid gap-2">
        {consignors.map((consignor) => (
          <div key={consignor.id} className="flex items-start justify-between border-b border-slate-800 pb-2">
            <div>
              <p className="font-semibold">{consignor.name}</p>
              <p className="text-xs text-slate-400">
                {consignor.address || "Sin dirección"} · {consignor.contactName || "Sin contacto"} · {consignor.phone || "Sin teléfono"}
              </p>
              {(consignor.email || consignor.notes) && (
                <p className="text-xs text-slate-500">{consignor.email || consignor.notes}</p>
              )}
            </div>
            <button className="rounded bg-slate-700 px-3 py-1 text-xs" onClick={() => toggleStatus(consignor)}>
              {consignor.status}
            </button>
          </div>
        ))}
        {consignors.length === 0 && <p className="text-sm text-slate-400">Sin consignatarios.</p>}
      </section>
    </main>
  );
}
