"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type SupplyType = "MEDICINE" | "VACCINE" | "DEWORMER" | "FEED" | "OTHER";
type Supply = { id: string; establishmentId: string; type: SupplyType; name: string; activeIngredient: string | null; unit: string; defaultDose: string | null; status: "ACTIVE" | "INACTIVE" };
type SupplyBatch = { id: string; supplyId: string; supplyName?: string; batchNumber: string; quantityInitial: number; quantityAvailable: number; unit: string; expirationDate: string; supplier: string | null; location: string | null; status: string };
type Notification = { id: string; severity: "INFO" | "WARNING" | "CRITICAL" | string; title: string; message: string; dueDate: string; sourceId: string };

const typeLabels: Record<SupplyType, string> = {
  MEDICINE: "Medicamento",
  VACCINE: "Vacuna",
  DEWORMER: "Antiparasitario",
  FEED: "Alimento",
  OTHER: "Otro",
};

const severityClass = (severity: string) => {
  if (severity === "CRITICAL") return "border-rose-700 bg-rose-950/40 text-rose-100";
  if (severity === "WARNING") return "border-amber-700 bg-amber-950/40 text-amber-100";
  return "border-sky-700 bg-sky-950/40 text-sky-100";
};

export default function InsumosPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [batches, setBatches] = useState<SupplyBatch[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [supplyName, setSupplyName] = useState("");
  const [supplyType, setSupplyType] = useState<SupplyType>("MEDICINE");
  const [unit, setUnit] = useState("dosis");
  const [activeIngredient, setActiveIngredient] = useState("");
  const [selectedSupplyId, setSelectedSupplyId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [expirationDate, setExpirationDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [location, setLocation] = useState("Depósito principal");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedSupply = useMemo(() => supplies.find((supply) => supply.id === selectedSupplyId), [selectedSupplyId, supplies]);

  const loadData = async (targetEstablishmentId = establishmentId) => {
    if (!targetEstablishmentId) return;
    setError(null);
    const query = `establishmentId=${encodeURIComponent(targetEstablishmentId)}`;
    const [suppliesRes, batchesRes, expirationsRes] = await Promise.all([
      fetch(`${API_URL}/supplies?${query}`, { cache: "no-store" }),
      fetch(`${API_URL}/supply-batches?${query}`, { cache: "no-store" }),
      fetch(`${API_URL}/supplies/expirations?${query}&days=30`, { cache: "no-store" }),
    ]);
    if (!suppliesRes.ok || !batchesRes.ok || !expirationsRes.ok) throw new Error("No se pudieron cargar insumos.");
    const suppliesData = (await suppliesRes.json()) as { supplies: Supply[] };
    const batchesData = (await batchesRes.json()) as { batches: SupplyBatch[] };
    const expirationsData = (await expirationsRes.json()) as { notifications: Notification[] };
    setSupplies(suppliesData.supplies ?? []);
    setBatches(batchesData.batches ?? []);
    setNotifications(expirationsData.notifications ?? []);
    if (!selectedSupplyId && suppliesData.supplies?.[0]) setSelectedSupplyId(suppliesData.supplies[0].id);
  };

  useEffect(() => {
    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { establishments?: Establishment[] }) => {
        const list = data.establishments ?? [];
        setEstablishments(list);
        if (list[0]) {
          setEstablishmentId(list[0].id);
          return loadData(list[0].id);
        }
        return undefined;
      })
      .catch(() => setError("No se pudieron cargar establecimientos."));
  }, []);

  const createSupply = async (event: FormEvent) => {
    event.preventDefault();
    if (!establishmentId || !supplyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/supplies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId, name: supplyName.trim(), type: supplyType, unit, activeIngredient: activeIngredient.trim() || null }),
      });
      if (!response.ok) throw new Error("No se pudo crear el insumo.");
      setSupplyName("");
      setActiveIngredient("");
      await loadData(establishmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const createBatch = async (event: FormEvent) => {
    event.preventDefault();
    if (!establishmentId || !selectedSupplyId || !batchNumber.trim() || !expirationDate) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/supply-batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          supplyId: selectedSupplyId,
          batchNumber: batchNumber.trim(),
          quantityInitial: Number(quantity),
          unit: selectedSupply?.unit,
          expirationDate: new Date(`${expirationDate}T12:00:00`).toISOString(),
          supplier: supplier.trim() || null,
          location: location.trim() || null,
        }),
      });
      if (!response.ok) throw new Error("No se pudo crear el lote.");
      setBatchNumber("");
      setQuantity("0");
      setExpirationDate("");
      setSupplier("");
      await loadData(establishmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  };

  const createTaskFromBatch = async (batchId: string) => {
    const response = await fetch(`${API_URL}/tasks/from-supply-expiration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ establishmentId, batchId, assignedRole: "OPERATOR" }),
    });
    if (!response.ok) {
      setError("No se pudo crear la tarea desde el vencimiento.");
      return;
    }
    setError(null);
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-widest text-emerald-400">Insumos</p>
          <h2 className="text-2xl font-semibold">Stock, lotes y vencimientos</h2>
          <p className="mt-1 text-sm text-slate-400">Registrá medicamentos, vacunas e insumos con lote, cantidad y fecha de vencimiento para planificar su uso.</p>
        </div>
        <select className="rounded bg-slate-900 px-3 py-2 text-sm" value={establishmentId} onChange={(event) => { setEstablishmentId(event.target.value); loadData(event.target.value).catch(() => setError("No se pudieron cargar insumos.")); }}>
          {establishments.map((establishment) => <option key={establishment.id} value={establishment.id}>{establishment.name}</option>)}
        </select>
      </header>

      {error ? <p className="rounded border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-2">
        <form className="grid gap-3 rounded-lg bg-slate-900 p-4" onSubmit={createSupply}>
          <h3 className="font-semibold text-emerald-300">Nuevo insumo</h3>
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Nombre: Vacuna aftosa" value={supplyName} onChange={(event) => setSupplyName(event.target.value)} required />
          <select className="rounded bg-slate-800 p-2 text-sm" value={supplyType} onChange={(event) => setSupplyType(event.target.value as SupplyType)}>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Principio activo" value={activeIngredient} onChange={(event) => setActiveIngredient(event.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Unidad: dosis, ml, kg" value={unit} onChange={(event) => setUnit(event.target.value)} required />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" disabled={saving}>Crear insumo</button>
        </form>

        <form className="grid gap-3 rounded-lg bg-slate-900 p-4" onSubmit={createBatch}>
          <h3 className="font-semibold text-emerald-300">Nuevo lote con vencimiento</h3>
          <select className="rounded bg-slate-800 p-2 text-sm" value={selectedSupplyId} onChange={(event) => setSelectedSupplyId(event.target.value)} required>
            <option value="">Seleccionar insumo</option>
            {supplies.map((supply) => <option key={supply.id} value={supply.id}>{supply.name} ({supply.unit})</option>)}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Lote" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} required />
          <input className="rounded bg-slate-800 p-2 text-sm" type="number" min="0" step="0.01" placeholder="Cantidad" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          <input className="rounded bg-slate-800 p-2 text-sm" type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} required />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Proveedor" value={supplier} onChange={(event) => setSupplier(event.target.value)} />
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Ubicación" value={location} onChange={(event) => setLocation(event.target.value)} />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" disabled={saving}>Crear lote</button>
        </form>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="font-semibold text-emerald-300">Alertas y próximos vencimientos</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {notifications.length === 0 ? <p className="text-sm text-slate-400">Sin vencimientos críticos próximos.</p> : null}
          {notifications.map((notification) => (
            <article key={notification.id} className={`rounded border p-3 text-sm ${severityClass(notification.severity)}`}>
              <p className="font-semibold">{notification.title}</p>
              <p className="mt-1">{notification.message}</p>
              <button className="mt-2 rounded bg-slate-900/70 px-3 py-1 text-xs font-semibold" onClick={() => createTaskFromBatch(notification.sourceId)}>Crear tarea</button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="font-semibold text-emerald-300">Lotes registrados</h3>
        <div className="mt-3 grid gap-2">
          {batches.map((batch) => (
            <article key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 p-3 text-sm">
              <div>
                <p className="font-semibold">{batch.supplyName} · lote {batch.batchNumber}</p>
                <p className="text-slate-400">Disponible: {batch.quantityAvailable}/{batch.quantityInitial} {batch.unit} · Vence: {new Date(batch.expirationDate).toLocaleDateString("es-UY")} · Estado: {batch.status}</p>
                <p className="text-xs text-slate-500">{batch.location ?? "Sin ubicación"}{batch.supplier ? ` · ${batch.supplier}` : ""}</p>
              </div>
              <button className="rounded border border-slate-700 px-3 py-1 text-xs" onClick={() => createTaskFromBatch(batch.id)}>Planificar uso</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
