"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type Paddock = { id: string; establishmentId: string; name: string };
type Herd = { paddockId: string; category: string; count: number };
type Consignor = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Slaughterhouse = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type Animal = { id: string; earTag: string; category: string | null; status: "ACTIVO" | "VENDIDO" | "MUERTO" };
type ShipmentEvent = {
  id: string;
  occurredAt: string;
  payload: {
    destination?: string;
    consignorId?: string | null;
    slaughterhouseId?: string | null;
    items?: Array<{ paddockId: string; category: string; qty: number }>;
    earTags?: string[];
  };
};

type DraftItem = { paddockId: string; category: string; qty: number };

export default function ShipmentsPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [herds, setHerds] = useState<Herd[]>([]);
  const [consignors, setConsignors] = useState<Consignor[]>([]);
  const [slaughterhouses, setSlaughterhouses] = useState<Slaughterhouse[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [shipments, setShipments] = useState<ShipmentEvent[]>([]);

  const [destination, setDestination] = useState("");
  const [consignorId, setConsignorId] = useState("");
  const [slaughterhouseId, setSlaughterhouseId] = useState("");
  const [selectedPaddockId, setSelectedPaddockId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedQty, setSelectedQty] = useState(1);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [selectedEarTags, setSelectedEarTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedEstablishmentId?: string) => {
    const estResp = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResp.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);

    const current = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!current) return;
    setEstablishmentId(current);

    const [
      paddocksResp,
      herdsResp,
      consignorsResp,
      slaughterhousesResp,
      animalsResp,
      shipmentResp,
    ] = await Promise.all([
      fetch(`${API_URL}/paddocks?establishmentId=${current}`, { cache: "no-store" }),
      fetch(`${API_URL}/herds?establishmentId=${current}`, { cache: "no-store" }),
      fetch(`${API_URL}/consignors?establishmentId=${current}`, { cache: "no-store" }),
      fetch(`${API_URL}/slaughterhouses?establishmentId=${current}`, { cache: "no-store" }),
      fetch(`${API_URL}/animals?establishmentId=${current}`, { cache: "no-store" }),
      fetch(`${API_URL}/operational-events?establishmentId=${current}&kind=SLAUGHTER_SHIPMENT`, { cache: "no-store" }),
    ]);

    const paddocksData = (await paddocksResp.json()) as { paddocks: Paddock[] };
    const herdsData = (await herdsResp.json()) as { herds: Herd[] };
    const consignorsData = (await consignorsResp.json()) as { consignors: Consignor[] };
    const slaughterhousesData = (await slaughterhousesResp.json()) as { slaughterhouses: Slaughterhouse[] };
    const animalsData = (await animalsResp.json()) as { animals: Animal[] };
    const shipmentsData = (await shipmentResp.json()) as { operationalEvents: ShipmentEvent[] };

    setPaddocks(paddocksData.paddocks);
    setHerds(herdsData.herds.filter((item) => item.count > 0));
    setConsignors(consignorsData.consignors.filter((item) => item.status === "ACTIVE"));
    setSlaughterhouses(slaughterhousesData.slaughterhouses.filter((item) => item.status === "ACTIVE"));
    setAnimals(animalsData.animals.filter((item) => item.status === "ACTIVO"));
    setShipments(shipmentsData.operationalEvents);

    const initialPaddockId = paddocksData.paddocks[0]?.id ?? "";
    setSelectedPaddockId((prev) => prev || initialPaddockId);
  };

  useEffect(() => {
    load().catch(() => setError("No se pudieron cargar los embarques."));
  }, []);

  const availableByPaddock = useMemo(() => {
    return herds.filter((item) => item.paddockId === selectedPaddockId && item.count > 0);
  }, [herds, selectedPaddockId]);

  useEffect(() => {
    if (!availableByPaddock.length) {
      setSelectedCategory("");
      return;
    }
    setSelectedCategory((prev) =>
      availableByPaddock.some((item) => item.category === prev) ? prev : availableByPaddock[0]?.category ?? "",
    );
  }, [availableByPaddock]);

  const selectedMaxQty = availableByPaddock.find((item) => item.category === selectedCategory)?.count ?? 0;

  const animalTagsForCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return animals
      .filter((animal) => animal.category === selectedCategory)
      .map((animal) => animal.earTag)
      .sort((a, b) => a.localeCompare(b));
  }, [animals, selectedCategory]);

  const addDraftItem = () => {
    setError(null);
    if (!selectedPaddockId || !selectedCategory) {
      setError("Seleccioná potrero y categoría.");
      return;
    }
    if (!selectedQty || selectedQty < 1) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    if (selectedMaxQty && selectedQty > selectedMaxQty) {
      setError(`No podés embarcar más de ${selectedMaxQty} para ${selectedCategory} en este potrero.`);
      return;
    }
    setItems((prev) => [...prev, { paddockId: selectedPaddockId, category: selectedCategory, qty: selectedQty }]);
    setSelectedQty(1);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const toggleEarTag = (earTag: string) => {
    setSelectedEarTags((prev) => (prev.includes(earTag) ? prev.filter((item) => item !== earTag) : [...prev, earTag]));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!destination.trim()) {
      setError("Ingresá el destino.");
      return;
    }
    if (items.length === 0) {
      setError("Agregá al menos un ítem de embarque.");
      return;
    }

    const response = await fetch(`${API_URL}/operational-events/slaughter-shipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        establishmentId,
        destination: destination.trim(),
        consignorId: consignorId || null,
        slaughterhouseId: slaughterhouseId || null,
        items,
        earTags: selectedEarTags,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data?.message ?? "No se pudo registrar el embarque.");
      return;
    }

    setItems([]);
    setSelectedEarTags([]);
    setDestination("");
    await load(establishmentId);
  };

  return (
    <main className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Embarques</h2>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => load(e.target.value)}>
          {establishments.map((establishment) => (
            <option key={establishment.id} value={establishment.id}>{establishment.name}</option>
          ))}
        </select>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Registrar embarque</h3>
        <form className="mt-3 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-4">
            <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Destino" value={destination} onChange={(e) => setDestination(e.target.value)} required />
            <select className="rounded bg-slate-800 p-2 text-sm" value={consignorId} onChange={(e) => setConsignorId(e.target.value)}>
              <option value="">Consignatario (opcional)</option>
              {consignors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select className="rounded bg-slate-800 p-2 text-sm" value={slaughterhouseId} onChange={(e) => setSlaughterhouseId(e.target.value)}>
              <option value="">Frigorífico (opcional)</option>
              {slaughterhouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div className="rounded border border-slate-800 p-3">
            <p className="text-sm font-semibold">Salida por potrero y categoría</p>
            <div className="mt-2 grid gap-2 md:grid-cols-5">
              <select className="rounded bg-slate-800 p-2 text-sm" value={selectedPaddockId} onChange={(e) => setSelectedPaddockId(e.target.value)}>
                {paddocks.map((paddock) => <option key={paddock.id} value={paddock.id}>{paddock.name}</option>)}
              </select>
              <select className="rounded bg-slate-800 p-2 text-sm" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                {availableByPaddock.map((item) => (
                  <option key={item.category} value={item.category}>{item.category} ({item.count})</option>
                ))}
              </select>
              <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={1} max={selectedMaxQty || undefined} value={selectedQty} onChange={(e) => setSelectedQty(Number(e.target.value))} />
              <button className="rounded border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-300" onClick={addDraftItem} type="button">Agregar ítem</button>
            </div>

            <div className="mt-3 grid gap-2">
              {items.map((item, index) => (
                <div key={`${item.paddockId}-${item.category}-${index}`} className="flex items-center justify-between rounded bg-slate-800/70 px-3 py-2 text-sm">
                  <p>
                    {paddocks.find((p) => p.id === item.paddockId)?.name ?? item.paddockId} · {item.category} · {item.qty}
                  </p>
                  <button className="text-rose-300" onClick={() => removeItem(index)} type="button">Quitar</button>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-slate-400">Sin ítems. Agregá categorías (pueden ser varias) para este embarque.</p>}
            </div>
          </div>

          <div className="rounded border border-slate-800 p-3">
            <p className="text-sm font-semibold">Listado de caravanas (a priori)</p>
            <p className="mt-1 text-xs text-slate-400">Mostrando caravanas activas de la categoría seleccionada.</p>
            <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {animalTagsForCategory.map((earTag) => {
                const selected = selectedEarTags.includes(earTag);
                return (
                  <button
                    key={earTag}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs ${selected ? "border-emerald-500 bg-emerald-900/40" : "border-slate-700"}`}
                    onClick={() => toggleEarTag(earTag)}
                  >
                    {earTag}
                  </button>
                );
              })}
              {animalTagsForCategory.length === 0 && <p className="text-sm text-slate-400">No hay caravanas activas para la categoría seleccionada.</p>}
            </div>
          </div>

          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Guardar embarque</button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Historial de embarques</h3>
        <div className="mt-3 grid gap-2">
          {shipments.map((shipment) => (
            <div key={shipment.id} className="rounded border border-slate-800 p-3 text-sm">
              <p className="font-semibold">{shipment.payload.destination ?? "Sin destino"}</p>
              <p className="text-xs text-slate-400">{new Date(shipment.occurredAt).toLocaleString()}</p>
              <p className="mt-1 text-slate-300">Ítems: {shipment.payload.items?.length ?? 0} · Caravanas: {shipment.payload.earTags?.length ?? 0}</p>
            </div>
          ))}
          {shipments.length === 0 && <p className="text-sm text-slate-400">No hay embarques registrados.</p>}
        </div>
      </section>
    </main>
  );
}
