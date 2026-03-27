"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { getApiUrl } from "../lib/api-url";

const API_URL = getApiUrl();
const DEFAULT_FIELD_MAP_SRC = "/default-field-map.svg";

type Establishment = { id: string; name: string; mapImageUrl: string | null };
type Paddock = { id: string; name: string; establishmentId: string };

type Incident = {
  id: string;
  establishmentId: string;
  paddockId: string | null;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  observedAt: string;
  resolvedAt: string | null;
  mapX: number | null;
  mapY: number | null;
  source: "MANUAL" | "INSPECTION";
};

const severityLabel: Record<Incident["severity"], string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

const statusLabel: Record<Incident["status"], string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En seguimiento",
  RESOLVED: "Resuelto",
  CANCELLED: "Cancelado",
};

export default function IncidentsPage() {
  const mapRef = useRef<HTMLDivElement | null>(null);

  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentId, setEstablishmentId] = useState("");
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Incident["severity"]>("MEDIUM");
  const [paddockId, setPaddockId] = useState("");
  const [mapPoint, setMapPoint] = useState<{ x: number; y: number } | null>(null);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0],
    [incidents, selectedIncidentId],
  );
  const pendingIncidents = useMemo(
    () => incidents.filter((incident) => incident.status === "OPEN" || incident.status === "IN_PROGRESS"),
    [incidents],
  );
  const completedIncidents = useMemo(
    () => incidents.filter((incident) => incident.status === "RESOLVED" || incident.status === "CANCELLED"),
    [incidents],
  );
  const selectedEstablishment = useMemo(
    () => establishments.find((establishment) => establishment.id === establishmentId) ?? null,
    [establishments, establishmentId],
  );

  const loadData = async (selectedEstablishmentId?: string) => {
    setError(null);
    const estResponse = await fetch(`${API_URL}/establishments`, { cache: "no-store" });
    if (!estResponse.ok) throw new Error("No se pudieron cargar establecimientos.");

    const estData = (await estResponse.json()) as { establishments: Establishment[] };
    setEstablishments(estData.establishments);

    const currentEstablishmentId = selectedEstablishmentId || establishmentId || estData.establishments[0]?.id || "";
    setEstablishmentId(currentEstablishmentId);
    if (!currentEstablishmentId) {
      setPaddocks([]);
      setIncidents([]);
      return;
    }

    const [paddocksResponse, incidentsResponse] = await Promise.all([
      fetch(`${API_URL}/paddocks?establishmentId=${encodeURIComponent(currentEstablishmentId)}`, { cache: "no-store" }),
      fetch(`${API_URL}/incidents?establishmentId=${encodeURIComponent(currentEstablishmentId)}`, { cache: "no-store" }),
    ]);

    if (!paddocksResponse.ok || !incidentsResponse.ok) {
      throw new Error("No se pudieron cargar los incidentes.");
    }

    const paddockData = (await paddocksResponse.json()) as { paddocks: Paddock[] };
    const incidentData = (await incidentsResponse.json()) as { incidents: Incident[] };

    setPaddocks(paddockData.paddocks);
    setIncidents(incidentData.incidents);
    const firstPendingIncidentId = incidentData.incidents.find((incident) => incident.status === "OPEN" || incident.status === "IN_PROGRESS")?.id;
    setSelectedIncidentId((prev) => prev || firstPendingIncidentId || incidentData.incidents[0]?.id || "");
  };

  useEffect(() => {
    loadData().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Error inesperado al cargar incidentes.");
    });
  }, []);

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
    const x = Math.max(0, Math.min(100, rawX));
    const y = Math.max(0, Math.min(100, rawY));
    setMapPoint({ x, y });
  };

  const handleCreateIncident = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setError(null);
    setMessage(null);

    if (!establishmentId) {
      setError("Seleccioná un establecimiento.");
      return;
    }

    if (!title.trim() || !description.trim()) {
      setError("Completá título y descripción del incidente.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          paddockId: paddockId || null,
          title: title.trim(),
          description: description.trim(),
          severity,
          mapX: mapPoint?.x ?? null,
          mapY: mapPoint?.y ?? null,
          source: "INSPECTION",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo registrar el incidente.");
      }

      setTitle("");
      setDescription("");
      setSeverity("MEDIUM");
      setMapPoint(null);
      setMessage("Incidente registrado correctamente.");
      await loadData(establishmentId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado.");
    }
  };

  const handleResolveIncident = async () => {
    if (!selectedIncident || (selectedIncident.status !== "OPEN" && selectedIncident.status !== "IN_PROGRESS")) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/incidents/${selectedIncident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "RESOLVED",
          resolvedAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.message ?? "No se pudo cumplir el incidente.");
      }
      setMessage("Incidente cumplido y removido de pendientes.");
      await loadData(establishmentId);
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Error inesperado.");
    }
  };

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Incidentes de inspección</h2>
          <p className="text-sm text-slate-300">Registrá situaciones detectadas en recorridas de potreros y marcá su ubicación en el mapa del campo.</p>
        </div>
        <select className="rounded bg-slate-800 p-2 text-sm" value={establishmentId} onChange={(event) => loadData(event.target.value)}>
          {establishments.map((establishment) => (
            <option key={establishment.id} value={establishment.id}>{establishment.name}</option>
          ))}
        </select>
      </header>

      <section className="rounded-lg bg-slate-900 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Nuevo incidente</h3>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={handleCreateIncident}>
          <input className="rounded bg-slate-800 p-2 text-sm" placeholder="Título (ej: Ternero abichado)" value={title} onChange={(event) => setTitle(event.target.value)} />
          <select className="rounded bg-slate-800 p-2 text-sm" value={paddockId} onChange={(event) => setPaddockId(event.target.value)}>
            <option value="">Sin potrero asociado</option>
            {paddocks.map((paddock) => (
              <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
            ))}
          </select>
          <textarea
            className="min-h-24 rounded bg-slate-800 p-2 text-sm md:col-span-2"
            placeholder="Descripción del evento observado"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <select className="rounded bg-slate-800 p-2 text-sm" value={severity} onChange={(event) => setSeverity(event.target.value as Incident["severity"])}>
            <option value="LOW">Baja</option>
            <option value="MEDIUM">Media</option>
            <option value="HIGH">Alta</option>
            <option value="CRITICAL">Crítica</option>
          </select>
          <div className="rounded border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
            Hacé click en el mapa para ubicar el incidente. Punto actual: {mapPoint ? `${mapPoint.x.toFixed(1)}%, ${mapPoint.y.toFixed(1)}%` : "sin ubicación"}
          </div>
          <div className="md:col-span-2">
            <div
              ref={mapRef}
              className="relative w-full overflow-hidden rounded border border-slate-700"
              onClick={handleMapClick}
            >
              <img src={selectedEstablishment?.mapImageUrl || DEFAULT_FIELD_MAP_SRC} alt="Mapa de campo" className="h-auto w-full" />
              {pendingIncidents.map((incident) => (
                incident.mapX !== null && incident.mapY !== null ? (
                  <div
                    key={incident.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${incident.mapX}%`, top: `${incident.mapY}%` }}
                    title={incident.title}
                  >
                    <span
                      className={`block size-3 rounded-full border-2 ${selectedIncident?.id === incident.id ? "border-white bg-red-500" : "border-red-200 bg-red-600"}`}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">
                      {incident.title}
                    </span>
                  </div>
                ) : null
              ))}
              {mapPoint ? (
                <span
                  className="absolute block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500"
                  style={{ left: `${mapPoint.x}%`, top: `${mapPoint.y}%` }}
                  title="Ubicación del nuevo incidente"
                />
              ) : null}
            </div>
          </div>
          <button className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 md:col-span-2" type="submit">Registrar incidente</button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
      </section>

      <section className="rounded-lg bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Incidentes pendientes</h3>
          <button
            className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            type="button"
            onClick={handleResolveIncident}
            disabled={!selectedIncident || (selectedIncident.status !== "OPEN" && selectedIncident.status !== "IN_PROGRESS")}
          >
            Cumplir incidente seleccionado
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {pendingIncidents.map((incident) => {
            const paddockName = paddocks.find((item) => item.id === incident.paddockId)?.name;
            return (
              <button
                key={incident.id}
                type="button"
                className={`rounded border p-3 text-left text-sm transition ${selectedIncident?.id === incident.id ? "border-emerald-500 bg-slate-800" : "border-slate-800 bg-slate-800/60"}`}
                onClick={() => setSelectedIncidentId(incident.id)}
              >
                <p className="font-semibold">{incident.title}</p>
                <p className="text-xs text-slate-400">{statusLabel[incident.status]} · Severidad {severityLabel[incident.severity]} · {new Date(incident.observedAt).toLocaleString()}</p>
                <p className="mt-1 text-xs text-slate-300">{paddockName ? `Potrero: ${paddockName}` : "Sin potrero asignado"}</p>
              </button>
            );
          })}
          {pendingIncidents.length === 0 && <p className="text-sm text-slate-400">No hay incidentes pendientes para este establecimiento.</p>}
        </div>
        {completedIncidents.length > 0 && (
          <div className="mt-4 border-t border-slate-800 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cumplidos / cerrados</h4>
            <div className="mt-2 grid gap-2">
              {completedIncidents.map((incident) => (
                <div key={incident.id} className="rounded border border-slate-800 bg-slate-800/40 p-3 text-left text-sm">
                  <p className="font-semibold">{incident.title}</p>
                  <p className="text-xs text-slate-400">{statusLabel[incident.status]} · Severidad {severityLabel[incident.severity]}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
