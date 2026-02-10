"use client";

import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Establishment = { id: string; name: string };
type Slaughterhouse = { id: string; establishmentId: string; name: string; status: "ACTIVE" | "INACTIVE" };

export default function SlaughterhousesPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [slaughterhouses, setSlaughterhouses] = useState<Slaughterhouse[]>([]);
  const [name, setName] = useState("");
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
    load().catch(() => setError("No se pudieron cargar frigoríficos."));
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const response = await fetch(`${API_URL}/slaughterhouses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ establishmentId, name: name.trim(), status: "ACTIVE" }),
    });
    if (!response.ok) {
      setError("No se pudo crear frigorífico.");
      return;
    }
    setName("");
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
        <h2 className="text-xl font-semibold">Frigoríficos</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => load(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>
      <section className="rounded-lg bg-slate-900 p-4">
        <form className="flex gap-3" onSubmit={handleCreate}>
          <input className="flex-1 rounded bg-slate-800 p-2 text-sm" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Crear</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>
      <section className="rounded-lg bg-slate-900 p-4 grid gap-2">
        {slaughterhouses.map((house) => (
          <div key={house.id} className="flex items-center justify-between border-b border-slate-800 pb-2">
            <p className="font-semibold">{house.name}</p>
            <button className="rounded bg-slate-700 px-3 py-1 text-xs" onClick={() => toggleStatus(house)}>
              {house.status}
            </button>
          </div>
        ))}
        {slaughterhouses.length === 0 && <p className="text-sm text-slate-400">Sin frigoríficos.</p>}
      </section>
    </main>
  );
}
