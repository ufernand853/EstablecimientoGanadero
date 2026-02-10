"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type Paddock = { id: string; establishmentId: string; name: string };
type Herd = { paddockId: string; category: string; count: number; updatedAt: string };

export default function HerdsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [herds, setHerds] = useState<Herd[]>([]);
  const [paddockId, setPaddockId] = useState("");
  const [category, setCategory] = useState("TERNEROS");
  const [delta, setDelta] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadEstablishments = async () => {
    const response = await fetch(`${API_URL}/establishments`);
    const data = (await response.json()) as { establishments: Establishment[] };
    setEstablishments(data.establishments);
    if (!establishmentId && data.establishments.length) {
      setEstablishmentId(data.establishments[0]?.id ?? "");
    }
  };

  const loadPaddocks = async (selectedEstablishmentId: string) => {
    if (!selectedEstablishmentId) return;
    const response = await fetch(`${API_URL}/paddocks?establishmentId=${selectedEstablishmentId}`);
    const data = (await response.json()) as { paddocks: Paddock[] };
    setPaddocks(data.paddocks);
    if (!paddockId && data.paddocks.length) {
      setPaddockId(data.paddocks[0]?.id ?? "");
    }
  };

  const loadStock = async (selectedEstablishmentId: string) => {
    if (!selectedEstablishmentId) return;
    const response = await fetch(`${API_URL}/stock?establishmentId=${selectedEstablishmentId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar el stock.");
    const data = (await response.json()) as { herds: Herd[] };
    setHerds(data.herds);
  };

  useEffect(() => {
    loadEstablishments().catch(() => setError("No se pudieron cargar establecimientos."));
  }, []);

  useEffect(() => {
    if (!establishmentId) return;
    Promise.all([loadPaddocks(establishmentId), loadStock(establishmentId)]).catch(() => setError("No se pudo cargar stock."));
  }, [establishmentId]);

  const handleAdjust = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(`${API_URL}/stock/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paddockId, category, delta: Number(delta) }),
      });
      if (!response.ok) throw new Error("No se pudo ajustar el stock.");
      await loadStock(establishmentId);
      setDelta(0);
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "Error inesperado.");
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Stock</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => setEstablishmentId(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>
      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Ajustar stock</h3>
        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleAdjust}>
          <select className="rounded bg-slate-800 p-2 text-sm" value={paddockId} onChange={(e) => setPaddockId(e.target.value)}>
            {paddocks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value.toUpperCase())} placeholder="Categoría" />
          <input className="rounded bg-slate-800 p-2 text-sm" type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} placeholder="Delta" />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Aplicar</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>
      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Listado de stock</h3>
        <div className="mt-3 grid gap-2">
          {herds.map((herd) => (
            <div key={`${herd.paddockId}-${herd.category}`} className="flex items-center justify-between border-b border-slate-800 pb-2">
              <p>{paddocks.find((p) => p.id === herd.paddockId)?.name ?? herd.paddockId} · {herd.category}</p>
              <span className="font-semibold">{herd.count} cabezas</span>
            </div>
          ))}
          {herds.length === 0 && <p className="text-sm text-slate-400">No hay stock para el establecimiento.</p>}
        </div>
      </section>
    </main>
  );
}
