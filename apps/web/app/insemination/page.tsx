"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();

type Establishment = { id: string; name: string };
type HerdCategory = { id: string; name: string };

type ReproductionEvent = {
  id: string;
  establishmentId: string;
  type: "ENTORE" | "PREGNANCY_CHECK";
  occurredAt: string;
  category: string;
  lot: string | null;
  servicedQty: number | null;
  bullsQty: number | null;
  strawsQty: number | null;
  protocol: string | null;
  diagnosedQty: number | null;
  pregnantQty: number | null;
  emptyQty: number | null;
  responsible: string | null;
  notes: string | null;
};

export default function InseminationPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [categories, setCategories] = useState<HerdCategory[]>([]);
  const [events, setEvents] = useState<ReproductionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [entoreCategory, setEntoreCategory] = useState("VACAS");
  const [entoreLot, setEntoreLot] = useState("");
  const [servicedQty, setServicedQty] = useState(1);
  const [bullsQty, setBullsQty] = useState(0);
  const [protocol, setProtocol] = useState("");
  const [responsible, setResponsible] = useState("");

  const [diagCategory, setDiagCategory] = useState("VACAS");
  const [diagLot, setDiagLot] = useState("");
  const [diagnosedQty, setDiagnosedQty] = useState(1);
  const [pregnantQty, setPregnantQty] = useState(0);

  const pregnancyRate = useMemo(() => {
    if (diagnosedQty <= 0) return 0;
    return Math.round((pregnantQty / diagnosedQty) * 100);
  }, [diagnosedQty, pregnantQty]);

  const loadData = async (selectedEstablishmentId?: string) => {
    const estResp = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    const estData = (await estResp.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);

    const currentId = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    if (!currentId) return;
    setEstablishmentId(currentId);

    const [catResp, eventsResp] = await Promise.all([
      fetch(`${API_URL}/herd-categories?establishmentId=${currentId}&status=ACTIVE`, { cache: "no-store" }),
      fetch(`${API_URL}/reproduction-events?establishmentId=${currentId}`, { cache: "no-store" }),
    ]);

    const catData = (await catResp.json()) as { categories: HerdCategory[] };
    const eventData = (await eventsResp.json()) as { reproductionEvents: ReproductionEvent[] };

    setCategories(catData.categories);
    setEvents(eventData.reproductionEvents);

    if (catData.categories.length) {
      setEntoreCategory((prev) => catData.categories.some((item) => item.name === prev) ? prev : catData.categories[0].name);
      setDiagCategory((prev) => catData.categories.some((item) => item.name === prev) ? prev : catData.categories[0].name);
    }
  };

  useEffect(() => {
    loadData().catch(() => setError("No se pudo cargar reproducción."));
  }, []);

  const handleEntore = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/reproduction-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          type: "ENTORE",
          category: entoreCategory,
          lot: entoreLot.trim() || null,
          servicedQty: Number(servicedQty),
          bullsQty: Number(bullsQty),
          protocol: protocol.trim() || null,
          responsible: responsible.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo registrar el entore.");
      }
      setMessage("Entore registrado correctamente.");
      setEntoreLot("");
      setServicedQty(1);
      setBullsQty(0);
      setProtocol("");
      await loadData(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  const handlePregnancy = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (pregnantQty > diagnosedQty) {
      setError("Preñadas no puede ser mayor que diagnosticadas.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/reproduction-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          type: "PREGNANCY_CHECK",
          category: diagCategory,
          lot: diagLot.trim() || null,
          diagnosedQty: Number(diagnosedQty),
          pregnantQty: Number(pregnantQty),
          responsible: responsible.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo registrar el diagnóstico de preñez.");
      }
      setMessage("Diagnóstico de preñez guardado.");
      setDiagLot("");
      setDiagnosedQty(1);
      setPregnantQty(0);
      await loadData(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Reproducción (Entore y Preñez)</h2>
          <p className="text-sm text-slate-300">Registrá servicio y diagnóstico por lote para medir eficiencia reproductiva.</p>
        </div>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(e) => loadData(e.target.value)}>
          {establishments.map((establishment) => (
            <option key={establishment.id} value={establishment.id}>{establishment.name}</option>
          ))}
        </select>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo entore</h3>
          <form className="mt-3 grid gap-2" onSubmit={handleEntore}>
            <select className="rounded bg-slate-800 p-2 text-sm" value={entoreCategory} onChange={(e) => setEntoreCategory(e.target.value)}>
              {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            <input className="rounded bg-slate-800 p-2 text-sm" value={entoreLot} onChange={(e) => setEntoreLot(e.target.value)} placeholder="Lote (opcional)" />
            <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={1} value={servicedQty} onChange={(e) => setServicedQty(Number(e.target.value))} placeholder="Hembras en servicio" />
            <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={0} value={bullsQty} onChange={(e) => setBullsQty(Number(e.target.value))} placeholder="Toros" />
            <input className="rounded bg-slate-800 p-2 text-sm" value={protocol} onChange={(e) => setProtocol(e.target.value)} placeholder="Protocolo" />
            <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Guardar entore</button>
          </form>
        </article>

        <article className="rounded-lg bg-slate-900 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Diagnóstico de preñez</h3>
          <form className="mt-3 grid gap-2" onSubmit={handlePregnancy}>
            <select className="rounded bg-slate-800 p-2 text-sm" value={diagCategory} onChange={(e) => setDiagCategory(e.target.value)}>
              {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            <input className="rounded bg-slate-800 p-2 text-sm" value={diagLot} onChange={(e) => setDiagLot(e.target.value)} placeholder="Lote (opcional)" />
            <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={1} value={diagnosedQty} onChange={(e) => setDiagnosedQty(Number(e.target.value))} placeholder="Diagnosticadas" />
            <input className="rounded bg-slate-800 p-2 text-sm" type="number" min={0} value={pregnantQty} onChange={(e) => setPregnantQty(Number(e.target.value))} placeholder="Preñadas" />
            <p className="text-xs text-slate-400">Tasa estimada: {pregnancyRate}%</p>
            <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950" type="submit">Guardar diagnóstico</button>
          </form>
        </article>
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Historial reproductivo</h3>
        <div className="mt-3 grid gap-2">
          {events.map((item) => (
            <div key={item.id} className="rounded bg-slate-800/60 p-3 text-sm">
              <p className="font-semibold">{item.type === "ENTORE" ? "Entore" : "Diagnóstico de preñez"} · {item.category}</p>
              <p className="text-xs text-slate-400">
                {new Date(item.occurredAt).toLocaleString()} · Lote: {item.lot || "-"} · {item.type === "ENTORE"
                  ? `Servicio: ${item.servicedQty ?? 0}`
                  : `Preñadas: ${item.pregnantQty ?? 0}/${item.diagnosedQty ?? 0}`}
              </p>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-slate-400">Sin eventos reproductivos.</p>}
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
      </section>
    </main>
  );
}
