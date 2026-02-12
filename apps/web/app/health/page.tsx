"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type HerdCategory = { id: string; name: string };

type HealthEvent = {
  id: string;
  establishmentId: string;
  type: "VACCINATION" | "DEWORMING" | "TREATMENT";
  category: string;
  qty: number;
  product: string;
  dose: string | null;
  route: string | null;
  notes: string | null;
  responsible: string | null;
  occurredAt: string;
  nextDueAt: string | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED" | "OVERDUE";
  source: "MANUAL" | "COMMAND";
};

type Schedule = HealthEvent & { scheduleStatus: "UPCOMING" | "OVERDUE" };

const PRODUCT_OPTIONS: Record<HealthEvent["type"], string[]> = {
  VACCINATION: [
    "Clostridial 7 vías",
    "Aftosa",
    "Brucelosis",
    "Carbunclo bacteridiano",
    "IBR + BVD",
  ],
  DEWORMING: [
    "Ivermectina 1%",
    "Doramectina",
    "Levamisol",
    "Albendazol",
    "Moxidectina",
  ],
  TREATMENT: [
    "Garrapaticida pour-on",
    "Garrapaticida inyectable",
    "Curabicheras",
    "Antibiótico de amplio espectro",
    "Antiinflamatorio",
  ],
};

export default function HealthPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [categories, setCategories] = useState<HerdCategory[]>([]);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [type, setType] = useState<HealthEvent["type"]>("VACCINATION");
  const [category, setCategory] = useState("TERNEROS");
  const [qty, setQty] = useState(1);
  const [product, setProduct] = useState(PRODUCT_OPTIONS.VACCINATION[0]);
  const [dose, setDose] = useState("");
  const [responsible, setResponsible] = useState("");
  const [protocolDays, setProtocolDays] = useState(0);

  const overdueCount = useMemo(
    () => schedules.filter((event) => event.scheduleStatus === "OVERDUE").length,
    [schedules],
  );

  useEffect(() => {
    const defaultProduct = PRODUCT_OPTIONS[type][0] ?? "";
    setProduct((prev) => (prev.trim() ? prev : defaultProduct));
  }, [type]);

  const loadData = async (selectedEstablishmentId?: string) => {
    const estResponse = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResponse.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);

    const currentEstablishmentId = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!currentEstablishmentId) return;
    setEstablishmentId(currentEstablishmentId);

    const [categoryResponse, eventResponse, scheduleResponse] = await Promise.all([
      fetch(`${API_URL}/herd-categories?establishmentId=${currentEstablishmentId}&status=ACTIVE`, { cache: "no-store" }),
      fetch(`${API_URL}/health-events?establishmentId=${currentEstablishmentId}`, { cache: "no-store" }),
      fetch(`${API_URL}/health-schedules?establishmentId=${currentEstablishmentId}`, { cache: "no-store" }),
    ]);

    const categoryData = (await categoryResponse.json()) as { categories: HerdCategory[] };
    const eventData = (await eventResponse.json()) as { healthEvents: HealthEvent[] };
    const scheduleData = (await scheduleResponse.json()) as { schedules: Schedule[] };

    setCategories(categoryData.categories);
    setEvents(eventData.healthEvents);
    setSchedules(scheduleData.schedules);

    if (categoryData.categories.length) {
      setCategory((prev) => (
        categoryData.categories.some((item) => item.name === prev)
          ? prev
          : categoryData.categories[0]?.name || ""
      ));
    }
  };

  useEffect(() => {
    loadData().catch(() => setError("No se pudieron cargar los datos sanitarios."));
  }, []);

  const handleCreateEvent = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setError(null);
    setMessage(null);

    if (!establishmentId) {
      setError("Seleccioná un establecimiento.");
      return;
    }

    if (!product.trim()) {
      setError("Ingresá el producto aplicado.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/health-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          type,
          category,
          qty: Number(qty),
          product: product.trim(),
          dose: dose.trim() ? dose.trim() : null,
          responsible: responsible.trim() ? responsible.trim() : null,
          protocolDays: protocolDays > 0 ? Number(protocolDays) : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo registrar el evento sanitario.");
      }

      setMessage("Evento sanitario guardado correctamente.");
      setProduct(PRODUCT_OPTIONS[type][0] ?? "");
      setDose("");
      setProtocolDays(0);
      await loadData(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Gestión sanitaria</h2>
          <p className="text-sm text-slate-300">Vacunación, desparasitación, tratamientos y próximos vencimientos.</p>
        </div>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(event) => loadData(event.target.value)}>
          {establishments.map((establishment) => (
            <option key={establishment.id} value={establishment.id}>{establishment.name}</option>
          ))}
        </select>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-lg bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Eventos registrados</p>
          <p className="mt-2 text-2xl font-semibold">{events.length}</p>
        </article>
        <article className="rounded-lg bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Pendientes y próximos</p>
          <p className="mt-2 text-2xl font-semibold">{schedules.length}</p>
        </article>
        <article className="rounded-lg bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Vencidos</p>
          <p className="mt-2 text-2xl font-semibold text-amber-300">{overdueCount}</p>
        </article>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo evento sanitario</h3>
        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={handleCreateEvent}>
          <select className="rounded bg-slate-800 p-2 text-sm" value={type} onChange={(event) => setType(event.target.value as HealthEvent["type"])}>
            <option value="VACCINATION">Vacunación</option>
            <option value="DEWORMING">Desparasitación</option>
            <option value="TREATMENT">Tratamiento</option>
          </select>
          <select className="rounded bg-slate-800 p-2 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </select>
          <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={1} value={qty} onChange={(event) => setQty(Number(event.target.value))} placeholder="Cantidad" />
          <div className="md:col-span-2 grid gap-2 md:grid-cols-2">
            <select
              className="rounded bg-slate-800 p-2 text-sm"
              value={product}
              onChange={(event) => setProduct(event.target.value)}
            >
              {PRODUCT_OPTIONS[type].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <input
              className="rounded bg-slate-800 p-2 text-sm"
              value={product}
              onChange={(event) => setProduct(event.target.value)}
              placeholder="Producto aplicado"
            />
          </div>
          <input className="rounded bg-slate-800 p-2 text-sm" value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Dosis (ej: 2 ml)" />
          <input className="rounded bg-slate-800 p-2 text-sm" value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Responsable" />
          <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={0} value={protocolDays} onChange={(event) => setProtocolDays(Number(event.target.value))} placeholder="Próxima dosis en días" />
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Guardar</button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Próximos vencimientos</h3>
        <div className="mt-3 grid gap-2">
          {schedules.map((event) => (
            <div key={event.id} className="rounded bg-slate-800/60 p-3 text-sm">
              <p className="font-semibold">{event.type} · {event.category} · {event.product}</p>
              <p className="text-xs text-slate-400">
                Próximo: {event.nextDueAt ? new Date(event.nextDueAt).toLocaleDateString() : "Sin fecha"} · Estado: {event.scheduleStatus}
              </p>
            </div>
          ))}
          {schedules.length === 0 && <p className="text-sm text-slate-400">Sin vencimientos programados.</p>}
        </div>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Historial sanitario</h3>
        <div className="mt-3 grid gap-2">
          {events.map((event) => (
            <div key={event.id} className="rounded bg-slate-800/60 p-3 text-sm">
              <p className="font-semibold">{event.type} · {event.category} · {event.product}</p>
              <p className="text-xs text-slate-400">
                {new Date(event.occurredAt).toLocaleString()} · Cantidad: {event.qty} · Fuente: {event.source}
              </p>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-slate-400">Sin eventos sanitarios registrados.</p>}
        </div>
      </section>
    </main>
  );
}
