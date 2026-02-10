"use client";

import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Establishment = { id: string; name: string };
type Paddock = { id: string; establishmentId: string; name: string };
type Movement = {
  id: string;
  establishmentId: string;
  fromPaddockId: string;
  toPaddockId: string;
  category: string;
  quantity: number;
  occurredAt: string;
};

export default function OperationsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [fromPaddockId, setFromPaddockId] = useState("");
  const [toPaddockId, setToPaddockId] = useState("");
  const [category, setCategory] = useState("TERNEROS");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (selectedEstablishmentId?: string) => {
    const estResp = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResp.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);
    const currentId = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!currentId) return;
    setEstablishmentId(currentId);

    const [paddocksResp, movementsResp] = await Promise.all([
      fetch(`${API_URL}/paddocks?establishmentId=${currentId}`, { cache: "no-store" }),
      fetch(`${API_URL}/movements?establishmentId=${currentId}`, { cache: "no-store" }),
    ]);
    const paddocksData = (await paddocksResp.json()) as { paddocks: Paddock[] };
    const movementsData = (await movementsResp.json()) as { movements: Movement[] };
    setPaddocks(paddocksData.paddocks);
    setMovements(movementsData.movements);
    if (paddocksData.paddocks.length) {
      setFromPaddockId((prev) => prev || paddocksData.paddocks[0]?.id || "");
      setToPaddockId((prev) => prev || paddocksData.paddocks[1]?.id || paddocksData.paddocks[0]?.id || "");
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
          <input className="rounded bg-slate-800 p-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value.toUpperCase())} />
          <input className="rounded bg-slate-800 p-2 text-sm" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} min={1} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Guardar</button>
        </form>
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
    </main>
  );
}
