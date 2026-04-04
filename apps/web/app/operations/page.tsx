"use client";

import { FormEvent, useEffect, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type Paddock = { id: string; establishmentId: string; name: string };
type HerdCategory = { id: string; establishmentId: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Movement = {
  id: string;
  establishmentId: string;
  fromPaddockId: string;
  toPaddockId: string;
  category: string;
  quantity: number;
  occurredAt: string;
};
type OperationalEvent = {
  id: string;
  kind: "WEANING";
  occurredAt: string;
  payload: {
    category?: string;
    toCategory?: string;
    qty?: number;
  };
};

export default function OperationsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [categories, setCategories] = useState<HerdCategory[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [fromPaddockId, setFromPaddockId] = useState("");
  const [toPaddockId, setToPaddockId] = useState("");
  const [category, setCategory] = useState("TERNEROS");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [weanings, setWeanings] = useState<OperationalEvent[]>([]);
  const [fromCategory, setFromCategory] = useState("TERNEROS");
  const [toCategory, setToCategory] = useState("TERNEROS_DESTETADOS");
  const [weaningQty, setWeaningQty] = useState(1);

  const loadData = async (selectedEstablishmentId?: string) => {
    const estResp = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResp.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);
    const currentId = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!currentId) return;
    setEstablishmentId(currentId);

    const [paddocksResp, movementsResp, categoriesResp, weaningsResp] = await Promise.all([
      fetch(`${API_URL}/paddocks?establishmentId=${currentId}`, { cache: "no-store" }),
      fetch(`${API_URL}/movements?establishmentId=${currentId}`, { cache: "no-store" }),
      fetch(`${API_URL}/herd-categories?establishmentId=${currentId}&status=ACTIVE`, { cache: "no-store" }),
      fetch(`${API_URL}/operational-events?establishmentId=${currentId}&kind=WEANING`, { cache: "no-store" }),
    ]);
    const paddocksData = (await paddocksResp.json()) as { paddocks: Paddock[] };
    const movementsData = (await movementsResp.json()) as { movements: Movement[] };
    const categoriesData = (await categoriesResp.json()) as { categories: HerdCategory[] };
    const weaningsData = (await weaningsResp.json()) as { operationalEvents: OperationalEvent[] };
    setPaddocks(paddocksData.paddocks);
    setMovements(movementsData.movements);
    setCategories(categoriesData.categories);
    setWeanings(weaningsData.operationalEvents);
    if (paddocksData.paddocks.length) {
      setFromPaddockId((prev) => prev || paddocksData.paddocks[0]?.id || "");
      setToPaddockId((prev) => prev || paddocksData.paddocks[1]?.id || paddocksData.paddocks[0]?.id || "");
    }
    if (categoriesData.categories.length) {
      setCategory((prev) => categoriesData.categories.some((item) => item.name === prev) ? prev : categoriesData.categories[0]?.name || "");
    }
  };

  useEffect(() => {
    loadData().catch(() => setError("No se pudieron cargar las operaciones."));
  }, []);

  const handleCreateMovement = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(`${API_URL}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId, fromPaddockId, toPaddockId, category, quantity: Number(quantity) }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo crear el movimiento.");
      }
      await loadData(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  const handleWeaning = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(`${API_URL}/operational-events/weaning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          fromCategory,
          toCategory,
          qty: Number(weaningQty),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo registrar el destete.");
      }
      await loadData(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Operaciones (Movimientos)</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => loadData(e.target.value)}>
          {establishments.map((est) => <option key={est.id} value={est.id}>{est.name}</option>)}
        </select>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo movimiento</h3>
        <form className="mt-3 grid gap-3 md:grid-cols-5" onSubmit={handleCreateMovement}>
          <select className="rounded bg-slate-800 p-2 text-sm" value={fromPaddockId} onChange={(e) => setFromPaddockId(e.target.value)}>
            {paddocks.map((p) => <option key={p.id} value={p.id}>Desde: {p.name}</option>)}
          </select>
          <select className="rounded bg-slate-800 p-2 text-sm" value={toPaddockId} onChange={(e) => setToPaddockId(e.target.value)}>
            {paddocks.map((p) => <option key={p.id} value={p.id}>Hacia: {p.name}</option>)}
          </select>
          <select className="rounded bg-slate-800 p-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} min={1} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Guardar</button>
        </form>
        {categories.length === 0 && <p className="mt-2 text-sm text-amber-300">No hay categorías activas para operar.</p>}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Historial</h3>
        <div className="mt-3 grid gap-2">
          {movements.map((movement) => (
            <div key={movement.id} className="flex items-center justify-between border-b border-slate-800 pb-2">
              <p>{paddocks.find((p) => p.id === movement.fromPaddockId)?.name ?? movement.fromPaddockId} → {paddocks.find((p) => p.id === movement.toPaddockId)?.name ?? movement.toPaddockId}</p>
              <span className="text-sm">{movement.quantity} {movement.category}</span>
            </div>
          ))}
          {movements.length === 0 && <p className="text-sm text-slate-400">Sin movimientos.</p>}
        </div>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Registrar destete</h3>
        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleWeaning}>
          <select className="rounded bg-slate-800 p-2 text-sm" value={fromCategory} onChange={(e) => setFromCategory(e.target.value)}>
            {categories.map((item) => <option key={`from-${item.id}`} value={item.name}>{item.name}</option>)}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm" value={toCategory} onChange={(e) => setToCategory(e.target.value)} placeholder="Categoría destino" />
          <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={1} value={weaningQty} onChange={(e) => setWeaningQty(Number(e.target.value))} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Guardar destete</button>
        </form>
        <div className="mt-3 grid gap-2">
          {weanings.map((event) => (
            <div key={event.id} className="rounded bg-slate-800/60 p-3 text-sm">
              <p className="font-semibold">Destete · {event.payload.qty ?? 0} cabezas</p>
              <p className="text-xs text-slate-400">
                {new Date(event.occurredAt).toLocaleString()} · {event.payload.category ?? "-"} → {event.payload.toCategory ?? "-"}
              </p>
            </div>
          ))}
          {weanings.length === 0 && <p className="text-sm text-slate-400">Sin destetes registrados.</p>}
        </div>
      </section>
    </main>
  );
}
