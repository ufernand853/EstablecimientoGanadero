"use client";

import { useEffect, useState } from "react";
import { getApiUrl } from "../../lib/api-url";
import { withBasePath } from "../../lib/base-path";

const API_URL = getApiUrl();

// ─── Types ────────────────────────────────────────────────────────────────────

type Establishment = { id: string; name: string };

type TraceabilityEventType =
  | "ASIGNACION_POTRERO"
  | "INSEMINACION"
  | "PREÑEZ_CONFIRMADA"
  | "VACUNACION_PENDIENTE"
  | "VACUNACION_REALIZADA"
  | "DESPARASITACION"
  | "TRATAMIENTO"
  | "TRASLADO"
  | "MUERTE"
  | "ENVIO_FRIGORIFICO"
  | "OBSERVACION";

type DashboardData = {
  totalActiveAnimals: number;
  totalTrackedAnimals: number;
  pendingVaccinations: number;
  recentEvents: RecentEvent[];
  eventsByType: { type: string; count: number }[];
};

type RecentEvent = {
  id: string;
  earTag: string;
  type: TraceabilityEventType;
  occurredAt: string;
  paddockName: string | null;
  notes: string | null;
};

type AnimalProfile = {
  animal: {
    earTag: string;
    name: string;
    sex: string;
    breed: string | null;
    birthDate: string | null;
    category: string | null;
    status: string;
    notes: string | null;
  } | null;
  events: RecentEvent[];
  summary: string;
  earTag: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<TraceabilityEventType, { label: string; color: string }> = {
  ASIGNACION_POTRERO:  { label: "Asig. potrero",      color: "bg-sky-500" },
  INSEMINACION:        { label: "Inseminación",        color: "bg-purple-500" },
  "PREÑEZ_CONFIRMADA": { label: "Preñez confirmada",   color: "bg-pink-500" },
  VACUNACION_PENDIENTE:{ label: "Vacuna pendiente",    color: "bg-amber-500" },
  VACUNACION_REALIZADA:{ label: "Vacunación",          color: "bg-emerald-500" },
  DESPARASITACION:     { label: "Desparasitación",     color: "bg-teal-500" },
  TRATAMIENTO:         { label: "Tratamiento",         color: "bg-orange-500" },
  TRASLADO:            { label: "Traslado",            color: "bg-blue-500" },
  MUERTE:              { label: "Muerte",              color: "bg-red-600" },
  ENVIO_FRIGORIFICO:   { label: "Envío frigorífico",   color: "bg-slate-400" },
  OBSERVACION:         { label: "Observación",         color: "bg-slate-500" },
};

const SEX_LABELS: Record<string, string> = {
  MACHO: "Macho",
  HEMBRA: "Hembra",
  OTRO: "Otro",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Component ────────────────────────────────────────────────────────────────

export default function TraceabilityDashboardPage() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState<string>("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAnimal, setSelectedAnimal] = useState<AnimalProfile | null>(null);
  const [loadingAnimal, setLoadingAnimal] = useState(false);

  // Load establishments
  useEffect(() => {
    fetch(`${API_URL}/establishments`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.establishments) && data.establishments.length > 0) {
          setEstablishments(data.establishments);
          setEstablishmentId(data.establishments[0].id);
        }
      })
      .catch(() => setError("No se pudieron cargar los establecimientos."));
  }, []);

  // Load dashboard data when establishment changes
  useEffect(() => {
    if (!establishmentId) return;
    setLoading(true);
    setError(null);
    setSelectedAnimal(null);
    fetch(`${API_URL}/traceability/dashboard?establishmentId=${establishmentId}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar el panel.");
        return r.json() as Promise<DashboardData>;
      })
      .then(setDashboard)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Error inesperado."))
      .finally(() => setLoading(false));
  }, [establishmentId]);

  const loadAnimalProfile = async (earTag: string) => {
    if (!establishmentId) return;
    setLoadingAnimal(true);
    setSelectedAnimal(null);
    try {
      const res = await fetch(
        `${API_URL}/traceability/animals/${encodeURIComponent(earTag)}?establishmentId=${establishmentId}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as AnimalProfile;
      setSelectedAnimal(data);
    } catch {
      // silently fail — earTag still visible in list
    } finally {
      setLoadingAnimal(false);
    }
  };

  const totalEvents = dashboard?.eventsByType.reduce((acc, row) => acc + row.count, 0) ?? 0;
  const maxCount = Math.max(...(dashboard?.eventsByType.map((r) => r.count) ?? [1]), 1);

  // ─── KPI cards ──────────────────────────────────────────────────────────────

  const kpiCards = dashboard
    ? [
        {
          label: "Animales activos",
          value: dashboard.totalActiveAnimals.toLocaleString("es-AR"),
          sub: "registrados en el establecimiento",
          accent: "text-white",
        },
        {
          label: "Trazados",
          value: dashboard.totalTrackedAnimals.toLocaleString("es-AR"),
          sub: "con al menos un evento",
          accent: "text-emerald-400",
        },
        {
          label: "Vacunas pendientes",
          value: dashboard.pendingVaccinations.toLocaleString("es-AR"),
          sub: "últimos 30 días",
          accent: dashboard.pendingVaccinations > 0 ? "text-amber-400" : "text-slate-400",
        },
        {
          label: "Eventos (30 días)",
          value: totalEvents.toLocaleString("es-AR"),
          sub: "todas las categorías",
          accent: "text-sky-400",
        },
      ]
    : [];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="space-y-6">

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-900 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Trazabilidad</p>
          <h2 className="mt-1 text-xl font-semibold">Panel gerencial</h2>
          <p className="mt-1 text-sm text-slate-400">Actividad de los últimos 30 días por animal individual.</p>
        </div>
        <div className="flex items-center gap-3">
          {establishments.length > 0 ? (
            <select
              className="rounded bg-slate-800 px-3 py-2 text-sm text-slate-200"
              value={establishmentId}
              onChange={(e) => setEstablishmentId(e.target.value)}
            >
              {establishments.map((est) => (
                <option key={est.id} value={est.id}>{est.name}</option>
              ))}
            </select>
          ) : null}
          <a
            href={withBasePath("/traceability")}
            className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-emerald-500"
          >
            Registrar eventos
          </a>
        </div>
      </header>

      {/* Error */}
      {error ? (
        <p className="rounded-lg bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</p>
      ) : null}

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-lg bg-slate-800" />
          ))}
        </div>
      ) : null}

      {/* KPI cards */}
      {!loading && dashboard ? (
        <section className="grid gap-4 md:grid-cols-4">
          {kpiCards.map((card) => (
            <div key={card.label} className="rounded-lg bg-slate-900 p-4">
              <p className="text-xs text-slate-400">{card.label}</p>
              <p className={`mt-1 text-3xl font-bold ${card.accent}`}>{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.sub}</p>
            </div>
          ))}
        </section>
      ) : null}

      {/* Main content: chart + animal panel */}
      {!loading && dashboard ? (
        <div className="grid gap-6 xl:grid-cols-2">

          {/* Events by type */}
          <section className="rounded-lg bg-slate-900 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Actividad por tipo — últimos 30 días
            </h3>
            {dashboard.eventsByType.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Sin actividad registrada en el período.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {dashboard.eventsByType.map((row) => {
                  const cfg = EVENT_TYPE_CONFIG[row.type as TraceabilityEventType];
                  const pct = Math.round((row.count / maxCount) * 100);
                  return (
                    <li key={row.type} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-slate-200">{cfg?.label ?? row.type}</span>
                        <span className="font-semibold text-slate-100">{row.count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-2 rounded-full transition-all ${cfg?.color ?? "bg-slate-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Animal detail panel */}
          <section className="rounded-lg bg-slate-900 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Perfil de animal
            </h3>
            {loadingAnimal ? (
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-8 animate-pulse rounded bg-slate-800" />
                ))}
              </div>
            ) : selectedAnimal ? (
              <div className="mt-4 space-y-4">
                {/* Animal header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-bold text-emerald-300">{selectedAnimal.earTag}</p>
                    {selectedAnimal.animal ? (
                      <p className="mt-1 text-sm text-slate-300">
                        {selectedAnimal.animal.name !== selectedAnimal.earTag ? `${selectedAnimal.animal.name} · ` : ""}
                        {SEX_LABELS[selectedAnimal.animal.sex] ?? selectedAnimal.animal.sex}
                        {selectedAnimal.animal.breed ? ` · ${selectedAnimal.animal.breed}` : ""}
                        {selectedAnimal.animal.category ? ` · ${selectedAnimal.animal.category}` : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">Sin ficha registrada en el sistema.</p>
                    )}
                    {selectedAnimal.animal?.birthDate ? (
                      <p className="mt-1 text-xs text-slate-400">Nacido: {formatDate(selectedAnimal.animal.birthDate)}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAnimal(null)}
                    className="text-slate-500 hover:text-slate-300"
                    title="Cerrar"
                  >
                    ✕
                  </button>
                </div>

                {/* AI summary */}
                <div className="rounded border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-200">
                  {selectedAnimal.summary}
                </div>

                {/* Event timeline */}
                {selectedAnimal.events.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Historial</p>
                    <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
                      {selectedAnimal.events.map((ev) => {
                        const cfg = EVENT_TYPE_CONFIG[ev.type];
                        return (
                          <li key={ev.id} className="flex items-start gap-3">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cfg?.color ?? "bg-slate-500"}`} />
                            <div>
                              <p className="text-sm text-slate-200">{cfg?.label ?? ev.type}</p>
                              <p className="text-xs text-slate-400">
                                {formatDate(ev.occurredAt)}
                                {ev.paddockName ? ` · ${ev.paddockName}` : ""}
                                {ev.notes ? ` · ${ev.notes}` : ""}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Sin eventos en el historial.</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Hacé clic en una caravana de la lista para ver su perfil completo.
              </p>
            )}
          </section>
        </div>
      ) : null}

      {/* Recent events table */}
      {!loading && dashboard && dashboard.recentEvents.length > 0 ? (
        <section className="rounded-lg bg-slate-900 p-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
            Eventos recientes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-3 pr-4 font-medium">Caravana</th>
                  <th className="pb-3 pr-4 font-medium">Evento</th>
                  <th className="pb-3 pr-4 font-medium">Potrero / Nota</th>
                  <th className="pb-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {dashboard.recentEvents.map((ev) => {
                  const cfg = EVENT_TYPE_CONFIG[ev.type];
                  const isSelected = selectedAnimal?.earTag === ev.earTag;
                  return (
                    <tr
                      key={ev.id}
                      className={`cursor-pointer transition hover:bg-slate-800/50 ${isSelected ? "bg-slate-800/40" : ""}`}
                      onClick={() => loadAnimalProfile(ev.earTag)}
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-semibold text-emerald-300 underline-offset-2 hover:underline">
                          {ev.earTag}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${cfg?.color ?? "bg-slate-500"}`} />
                          {cfg?.label ?? ev.type}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-400">
                        {ev.paddockName ?? ev.notes ?? "—"}
                      </td>
                      <td className="py-2.5 text-slate-400">
                        {formatDateTime(ev.occurredAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Empty state */}
      {!loading && dashboard && dashboard.recentEvents.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-400">Sin eventos registrados en los últimos 30 días.</p>
          <a
            href={withBasePath("/traceability")}
            className="mt-4 inline-block rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Registrar primer evento
          </a>
        </section>
      ) : null}

    </main>
  );
}
